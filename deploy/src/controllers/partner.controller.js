import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { toCsv } from "../utils/csv.js";
import crypto from "crypto";
import { transitionForward } from "../services/competition-workflow.service.js";
import { buildHierarchyDashboardSummary } from "../services/hierarchy-dashboard.service.js";
import { logger } from "../lib/logger.js";

function parseStatus(status) {
  if (!status) {
    return null;
  }
  const s = String(status).trim().toUpperCase();
  if (s === "ACTIVE") {
    return true;
  }
  if (s === "INACTIVE") {
    return false;
  }
  return null;
}

function parseCertificateStatus(status) {
  if (!status) {
    return null;
  }
  const s = String(status).trim().toUpperCase();
  if (s === "ISSUED" || s === "REVOKED") {
    return s;
  }
  return null;
}

function generateCertificateNumber() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CERT-${day}-${rand}`;
}

async function safeCertificateCount(args) {
  try {
    return await prisma.certificate.count(args);
  } catch (error) {
    // Local/dev DBs can be partially migrated; avoid dashboard 500 when certificate schema is absent.
    if (error?.code === "P2021" || error?.code === "P2022") {
      logger.warn("certificate_schema_missing", { code: error.code });
      return 0;
    }
    throw error;
  }
}

const getPartnerDashboard = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const businessPartnerId = req.bpScope.businessPartner.id;
  const nodeIds = req.bpScope.hierarchyNodeIds;

  const [franchiseProfiles, centerProfiles] = await Promise.all([
    prisma.franchiseProfile.findMany({
      where: {
        tenantId,
        businessPartnerId,
        status: { not: "ARCHIVED" }
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true
      }
    }),
    prisma.centerProfile.findMany({
      where: {
        tenantId,
        franchiseProfile: {
          is: {
            businessPartnerId
          }
        },
        status: { not: "ARCHIVED" }
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        franchiseProfileId: true,
        franchiseProfile: {
          select: {
            code: true,
            name: true
          }
        },
        authUser: {
          select: {
            hierarchyNodeId: true
          }
        }
      }
    })
  ]);

  const [franchises, centers, studentsActive, studentsTotal] = await Promise.all([
    prisma.authUser.count({
      where: {
        tenantId,
        role: "FRANCHISE",
        isActive: true,
        parentUserId: req.auth.userId
      }
    }),
    prisma.authUser.count({
      where: {
        tenantId,
        role: "CENTER",
        isActive: true,
        hierarchyNodeId: nodeIds.length ? { in: nodeIds } : undefined
      }
    }),
    prisma.student.count({
      where: {
        tenantId,
        isActive: true,
        hierarchyNodeId: nodeIds.length ? { in: nodeIds } : undefined
      }
    }),
    prisma.student.count({
      where: {
        tenantId,
        hierarchyNodeId: nodeIds.length ? { in: nodeIds } : undefined
      }
    })
  ]);

  const dashboard = await buildHierarchyDashboardSummary({
    tenantId,
    centerProfiles: centerProfiles.map((center) => ({
      centerProfileId: center.id,
      code: center.code,
      name: center.name,
      status: center.status,
      hierarchyNodeId: center.authUser?.hierarchyNodeId || null,
      franchiseProfileId: center.franchiseProfileId,
      franchiseCode: center.franchiseProfile?.code || null,
      franchiseName: center.franchiseProfile?.name || null
    })),
    settlementsWhere: {
      tenantId,
      businessPartnerId
    },
    pendingCompetitionWhere: {
      tenantId,
      workflowStage: { in: ["BP_REVIEW", "SUPERADMIN_APPROVAL"] },
      ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
    },
    franchisesCount: franchiseProfiles.filter((franchise) => franchise.status === "ACTIVE").length
  });

  const now = new Date();
  const competitionWhere = {
    tenantId,
    ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
  };

  const [
    competitionsTotal,
    activeCompetitions,
    upcomingCompetitions,
    pendingRequests,
    certificatesIssued,
    certificatesRevoked,
    competitionNotificationsUnread
  ] = await Promise.all([
    prisma.competition.count({ where: competitionWhere }),
    prisma.competition.count({ where: { ...competitionWhere, status: "ACTIVE" } }),
    prisma.competition.count({
      where: {
        ...competitionWhere,
        status: "SCHEDULED",
        startsAt: { gt: now }
      }
    }),
    prisma.competition.count({
      where: {
        ...competitionWhere,
        workflowStage: { in: ["BP_REVIEW", "SUPERADMIN_APPROVAL"] }
      }
    }),
    safeCertificateCount({
      where: {
        tenantId,
        status: "ISSUED",
        ...(nodeIds.length
          ? {
              student: {
                is: { hierarchyNodeId: { in: nodeIds } }
              }
            }
          : {})
      }
    }),
    safeCertificateCount({
      where: {
        tenantId,
        status: "REVOKED",
        ...(nodeIds.length
          ? {
              student: {
                is: { hierarchyNodeId: { in: nodeIds } }
              }
            }
          : {})
      }
    }),
    prisma.notification.count({
      where: {
        tenantId,
        recipientUserId: req.auth.userId,
        type: "COMPETITION_STAGE_UPDATE",
        isRead: false
      }
    })
  ]);

  void businessPartnerId;

  return res.apiSuccess("Partner dashboard fetched", {
    kpis: {
      competitionsTotal,
      pendingRequests,
      activeCompetitions,
      upcomingCompetitions,
      competitionNotificationsUnread,
      franchises,
      centers,
      students: studentsActive,
      certificatesIssued,
      certificatesRevoked,
      studentsTotal,
      teachersCount: dashboard.overview.teachersCount,
      attendanceRate30d: dashboard.operations.attendanceRate30d,
      collections30d: dashboard.finance.collections30d
    }
    ,
    dashboard
  });
});

const listPartnerStudents = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const q = req.query.q ? String(req.query.q).trim() : null;
  const isActive = parseStatus(req.query.status);

  const nodeIds = req.bpScope.hierarchyNodeIds;
  const where = {
    tenantId: req.auth.tenantId,
    ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {}),
    ...(typeof isActive === "boolean" ? { isActive } : {})
  };

  if (q) {
    where.OR = [
      { admissionNo: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } },
      {
        hierarchyNode: {
          is: {
            name: { contains: q }
          }
        }
      }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        createdAt: true,
        hierarchyNode: {
          select: { id: true, name: true, code: true, type: true }
        }
      }
    }),
    prisma.student.count({ where })
  ]);

  return res.apiSuccess("Partner students fetched", {
    items,
    limit,
    offset,
    total
  });
});

const exportPartnerStudentsCsv = asyncHandler(async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : null;
  const isActive = parseStatus(req.query.status);
  const nodeIds = req.bpScope.hierarchyNodeIds;

  const where = {
    tenantId: req.auth.tenantId,
    ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {}),
    ...(typeof isActive === "boolean" ? { isActive } : {})
  };

  if (q) {
    where.OR = [
      { admissionNo: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } }
    ];
  }

  const rows = await prisma.student.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 50000,
    select: {
      admissionNo: true,
      firstName: true,
      lastName: true,
      email: true,
      isActive: true,
      createdAt: true,
      hierarchyNode: {
        select: { code: true, name: true, type: true }
      }
    }
  });

  const csv = toCsv(
    [
      ["admissionNo", "firstName", "lastName", "email", "status", "centerCode", "centerName", "centerType", "createdAt"],
      ...rows.map((r) => [
        r.admissionNo,
        r.firstName,
        r.lastName,
        r.email || "",
        r.isActive ? "ACTIVE" : "INACTIVE",
        r.hierarchyNode?.code || "",
        r.hierarchyNode?.name || "",
        r.hierarchyNode?.type || "",
        r.createdAt.toISOString()
      ])
    ]
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=partner_students_${Date.now()}.csv`);
  return res.status(200).send(csv);
});

const listPartnerCertificates = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = parseCertificateStatus(req.query.status);
  const levelId = req.query.levelId || null;
  const centerId = req.query.centerId || null;
  const issuedFrom = req.query.issuedFrom || null;
  const issuedTo = req.query.issuedTo || null;
  const nodeIds = req.bpScope.hierarchyNodeIds;

  const studentFilter = {};
  if (nodeIds.length) {
    studentFilter.hierarchyNodeId = centerId ? centerId : { in: nodeIds };
  } else if (centerId) {
    studentFilter.hierarchyNodeId = centerId;
  }

  const where = {
    tenantId: req.auth.tenantId,
    ...(status ? { status } : {}),
    ...(levelId ? { levelId } : {}),
    ...(Object.keys(studentFilter).length
      ? { student: { is: studentFilter } }
      : {})
  };

  if (issuedFrom || issuedTo) {
    where.issuedAt = {};
    if (issuedFrom) where.issuedAt.gte = new Date(issuedFrom);
    if (issuedTo) {
      const to = new Date(issuedTo);
      to.setHours(23, 59, 59, 999);
      where.issuedAt.lte = to;
    }
  }

  if (q) {
    where.OR = [
      { certificateNumber: { contains: q } },
      { student: { is: { admissionNo: { contains: q } } } },
      { student: { is: { firstName: { contains: q } } } },
      { student: { is: { lastName: { contains: q } } } }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.certificate.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        certificateNumber: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        reason: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            hierarchyNode: { select: { id: true, name: true, code: true, type: true } }
          }
        },
        level: {
          select: { id: true, name: true, rank: true }
        },
        issuedBy: {
          select: { id: true, username: true, email: true, role: true }
        },
        revokedBy: {
          select: { id: true, username: true, email: true, role: true }
        }
      }
    }),
    prisma.certificate.count({ where })
  ]);

  return res.apiSuccess("Partner certificates fetched", {
    items,
    limit,
    offset,
    total
  });
});

const issuePartnerCertificate = asyncHandler(async (req, res) => {
  const { studentId, levelId, certificateNumber, reason, metadata } = req.body;
  if (!studentId || !levelId) {
    return res.apiError(400, "studentId and levelId are required", "VALIDATION_ERROR");
  }

  const nodeIds = req.bpScope.hierarchyNodeIds;
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId: req.auth.tenantId,
      ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
    },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!student) {
    return res.apiError(404, "Student not found in partner scope", "STUDENT_NOT_FOUND");
  }

  const level = await prisma.level.findFirst({
    where: { id: levelId, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!level) {
    return res.apiError(404, "Level not found", "LEVEL_NOT_FOUND");
  }

  const created = await prisma.certificate.create({
    data: {
      tenantId: req.auth.tenantId,
      certificateNumber: certificateNumber ? String(certificateNumber).trim() : generateCertificateNumber(),
      status: "ISSUED",
      studentId: student.id,
      levelId: level.id,
      issuedByUserId: req.auth.userId,
      reason: reason ? String(reason).trim() : null,
      metadata: metadata || null,
      verificationToken: crypto.randomUUID()
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Certificate issued", created, 201);
});

const bulkIssuePartnerCertificates = asyncHandler(async (req, res) => {
  const { studentIds, levelId, reason } = req.body;
  if (!Array.isArray(studentIds) || !studentIds.length || !levelId) {
    return res.apiError(400, "studentIds (array) and levelId are required", "VALIDATION_ERROR");
  }
  if (studentIds.length > 200) {
    return res.apiError(400, "Maximum 200 students per bulk operation", "VALIDATION_ERROR");
  }

  const nodeIds = req.bpScope.hierarchyNodeIds;
  const tenantId = req.auth.tenantId;

  const level = await prisma.level.findFirst({
    where: { id: levelId, tenantId },
    select: { id: true }
  });
  if (!level) {
    return res.apiError(404, "Level not found", "LEVEL_NOT_FOUND");
  }

  // Validate all students are in BP scope
  const validStudents = await prisma.student.findMany({
    where: {
      id: { in: studentIds },
      tenantId,
      ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
    },
    select: { id: true }
  });
  const validStudentIds = new Set(validStudents.map((s) => s.id));

  // Find existing certificates for these students + level (skip duplicates)
  const existing = await prisma.certificate.findMany({
    where: {
      tenantId,
      levelId,
      studentId: { in: [...validStudentIds] },
      status: "ISSUED"
    },
    select: { studentId: true }
  });
  const alreadyIssuedIds = new Set(existing.map((c) => c.studentId));

  const toIssue = [...validStudentIds].filter((id) => !alreadyIssuedIds.has(id));

  const created = await prisma.$transaction(
    toIssue.map((studentId) =>
      prisma.certificate.create({
        data: {
          tenantId,
          certificateNumber: generateCertificateNumber(),
          status: "ISSUED",
          studentId,
          levelId: level.id,
          issuedByUserId: req.auth.userId,
          reason: reason ? String(reason).trim() : null,
          verificationToken: crypto.randomUUID()
        }
      })
    )
  );

  return res.apiSuccess("Bulk certificates issued", {
    issued: created.length,
    skipped: alreadyIssuedIds.size,
    invalidStudents: studentIds.length - validStudentIds.size,
    certificates: created
  }, 201);
});

const listEligibleStudentsForCertificate = asyncHandler(async (req, res) => {
  const { levelId } = req.query;
  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const nodeIds = req.bpScope.hierarchyNodeIds;
  const tenantId = req.auth.tenantId;

  // Students who completed this level
  const completions = await prisma.studentLevelCompletion.findMany({
    where: {
      tenantId,
      levelId,
      student: {
        ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
      }
    },
    select: {
      studentId: true,
      completedAt: true,
      student: {
        select: { id: true, fullName: true, admissionNo: true }
      }
    }
  });

  // Students who already have a certificate for this level
  const existingCerts = await prisma.certificate.findMany({
    where: {
      tenantId,
      levelId,
      studentId: { in: completions.map((c) => c.studentId) },
      status: "ISSUED"
    },
    select: { studentId: true }
  });
  const alreadyCertified = new Set(existingCerts.map((c) => c.studentId));

  const eligible = completions
    .filter((c) => !alreadyCertified.has(c.studentId))
    .map((c) => ({
      id: c.student.id,
      fullName: c.student.fullName,
      admissionNo: c.student.admissionNo,
      completedAt: c.completedAt
    }));

  return res.apiSuccess("Eligible students fetched", eligible);
});

const revokePartnerCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const nodeIds = req.bpScope.hierarchyNodeIds;

  const existing = await prisma.certificate.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId,
      ...(nodeIds.length
        ? {
            student: {
              is: { hierarchyNodeId: { in: nodeIds } }
            }
          }
        : {})
    },
    select: {
      id: true,
      status: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Certificate not found", "CERTIFICATE_NOT_FOUND");
  }

  if (existing.status === "REVOKED") {
    return res.apiError(409, "Certificate already revoked", "CERTIFICATE_ALREADY_REVOKED");
  }

  const now = new Date();
  const updated = await prisma.certificate.update({
    where: { id },
    data: {
      status: "REVOKED",
      revokedAt: now,
      revokedByUserId: req.auth.userId,
      reason: reason ? String(reason).trim() : "Revoked"
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Certificate revoked", updated);
});

const exportPartnerCertificatesCsv = asyncHandler(async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = parseCertificateStatus(req.query.status);
  const levelId = req.query.levelId || null;
  const centerId = req.query.centerId || null;
  const issuedFrom = req.query.issuedFrom || null;
  const issuedTo = req.query.issuedTo || null;
  const nodeIds = req.bpScope.hierarchyNodeIds;

  const studentFilter = {};
  if (nodeIds.length) {
    studentFilter.hierarchyNodeId = centerId ? centerId : { in: nodeIds };
  } else if (centerId) {
    studentFilter.hierarchyNodeId = centerId;
  }

  const where = {
    tenantId: req.auth.tenantId,
    ...(status ? { status } : {}),
    ...(levelId ? { levelId } : {}),
    ...(Object.keys(studentFilter).length
      ? { student: { is: studentFilter } }
      : {})
  };

  if (issuedFrom || issuedTo) {
    where.issuedAt = {};
    if (issuedFrom) where.issuedAt.gte = new Date(issuedFrom);
    if (issuedTo) {
      const to = new Date(issuedTo);
      to.setHours(23, 59, 59, 999);
      where.issuedAt.lte = to;
    }
  }

  if (q) {
    where.OR = [
      { certificateNumber: { contains: q } },
      { student: { is: { admissionNo: { contains: q } } } }
    ];
  }

  const rows = await prisma.certificate.findMany({
    where,
    orderBy: [{ issuedAt: "desc" }],
    select: {
      certificateNumber: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      reason: true,
      student: {
        select: {
          admissionNo: true,
          firstName: true,
          lastName: true
        }
      },
      level: {
        select: { name: true, rank: true }
      }
    }
  });

  const csv = toCsv(
    [
      [
        "certificateNumber",
        "status",
        "issuedAt",
        "revokedAt",
        "reason",
        "admissionNo",
        "firstName",
        "lastName",
        "levelRank",
        "levelName"
      ],
      ...rows.map((r) => [
        r.certificateNumber,
        r.status,
        r.issuedAt.toISOString(),
        r.revokedAt ? r.revokedAt.toISOString() : "",
        r.reason || "",
        r.student?.admissionNo || "",
        r.student?.firstName || "",
        r.student?.lastName || "",
        String(r.level?.rank ?? ""),
        r.level?.name || ""
      ])
    ]
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=partner_certificates_${Date.now()}.csv`);
  return res.status(200).send(csv);
});

const getPartnerProfile = asyncHandler(async (req, res) => {
  const partner = await prisma.businessPartner.findFirst({
    where: {
      id: req.bpScope.businessPartner.id,
      tenantId: req.auth.tenantId
    },
    include: {
      address: true,
      operationalStates: true,
      operationalDistricts: true,
      operationalCities: true
    }
  });

  if (!partner) {
    return res.apiError(404, "Business partner not found", "BP_NOT_FOUND");
  }

  return res.apiSuccess("Partner profile fetched", partner);
});

const updatePartnerProfile = asyncHandler(async (req, res) => {
  const allowed = [
    "displayName",
    "primaryPhone",
    "alternatePhone",
    "supportEmail",
    "whatsappEnabled",
    "logoUrl",
    "websiteUrl",
    "facebookUrl",
    "instagramUrl",
    "youtubeUrl"
  ];

  const data = {};
  for (const key of allowed) {
    if (key in req.body) {
      const value = req.body[key];
      if (typeof value === "boolean") {
        data[key] = value;
      } else if (value === null) {
        data[key] = null;
      } else if (value !== undefined) {
        data[key] = String(value).trim();
      }
    }
  }

  if (!Object.keys(data).length) {
    return res.apiError(400, "No updatable fields provided", "VALIDATION_ERROR");
  }

  const updated = await prisma.businessPartner.update({
    where: { id: req.bpScope.businessPartner.id },
    data
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Partner profile updated", updated);
});

const listPartnerCourses = asyncHandler(async (req, res) => {
  const items = await prisma.partnerCourseAccess.findMany({
    where: {
      businessPartnerId: req.bpScope.businessPartner.id
    },
    include: {
      course: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          isActive: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 500
  });

  return res.apiSuccess("Partner courses fetched", items.map((r) => r.course));
});

const listPartnerHierarchy = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === "1" || req.query.includeInactive === "true";
  const nodeIds = req.bpScope.hierarchyNodeIds;
  const where = {
    tenantId: req.auth.tenantId,
    ...(nodeIds.length ? { id: { in: nodeIds } } : {}),
    ...(includeInactive ? {} : { isActive: true })
  };

  const data = await prisma.hierarchyNode.findMany({
    where,
    orderBy: [{ createdAt: "asc" }],
    take: 1000,
    include: {
      parent: { select: { id: true, name: true, code: true, type: true } }
    }
  });

  return res.apiSuccess("Partner hierarchy fetched", data);
});

const listPartnerCompetitionRequests = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const nodeIds = req.bpScope.hierarchyNodeIds;

  const where = {
    tenantId: req.auth.tenantId,
    ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {}),
    createdByUserId: req.auth.userId
  };

  const data = await prisma.competition.findMany({
    where,
    orderBy,
    skip,
    take,
    select: {
      id: true,
      title: true,
      status: true,
      workflowStage: true,
      hierarchyNode: { select: { id: true, name: true, type: true } },
      level: { select: { id: true, name: true, rank: true } }
    }
  });

  return res.apiSuccess("Partner competition requests fetched", data);
});

const submitPartnerCompetitionRequest = asyncHandler(async (req, res) => {
  const { title, description, startsAt, endsAt, hierarchyNodeId, levelId } = req.body;
  if (!title || !startsAt || !endsAt || !levelId) {
    return res.apiError(400, "title, startsAt, endsAt, levelId are required", "VALIDATION_ERROR");
  }

  const nodeIds = req.bpScope.hierarchyNodeIds;
  const resolvedHierarchyNodeId = hierarchyNodeId || req.auth.hierarchyNodeId;
  if (!resolvedHierarchyNodeId) {
    return res.apiError(400, "hierarchyNodeId is required", "HIERARCHY_NODE_REQUIRED");
  }
  if (nodeIds.length && !nodeIds.includes(resolvedHierarchyNodeId)) {
    return res.apiError(403, "hierarchyNodeId outside partner scope", "BP_SCOPE_DENIED");
  }

  const created = await prisma.competition.create({
    data: {
      tenantId: req.auth.tenantId,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      status: "DRAFT",
      workflowStage: "BP_REVIEW",
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      hierarchyNodeId: resolvedHierarchyNodeId,
      levelId,
      createdByUserId: req.auth.userId
    }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Competition request submitted", created, 201);
});

const forwardPartnerCompetitionRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const nodeIds = req.bpScope.hierarchyNodeIds;

  const competition = await prisma.competition.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId,
      createdByUserId: req.auth.userId,
      ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
    },
    select: { id: true }
  });

  if (!competition) {
    return res.apiError(404, "Competition request not found", "COMPETITION_NOT_FOUND");
  }

  const result = await transitionForward({
    tenantId: req.auth.tenantId,
    competitionId: id,
    actorUserId: req.auth.userId,
    actorRole: "BP"
  });

  res.locals.entityId = id;
  return res.apiSuccess("Competition request forwarded", result.competition);
});

export {
  getPartnerDashboard,
  listPartnerStudents,
  exportPartnerStudentsCsv,
  listPartnerCertificates,
  issuePartnerCertificate,
  bulkIssuePartnerCertificates,
  listEligibleStudentsForCertificate,
  revokePartnerCertificate,
  exportPartnerCertificatesCsv,
  getPartnerProfile,
  updatePartnerProfile,
  listPartnerCourses,
  listPartnerHierarchy,
  listPartnerCompetitionRequests,
  submitPartnerCompetitionRequest,
  forwardPartnerCompetitionRequest
};
