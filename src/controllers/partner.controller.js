import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { toCsv } from "../utils/csv.js";
import crypto from "crypto";
import { transitionForward } from "../services/competition-workflow.service.js";
import { buildHierarchyDashboardSummary } from "../services/hierarchy-dashboard.service.js";
import { logger } from "../lib/logger.js";
import { buildCertificateBrandingSnapshotForStudent } from "../services/branding.service.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";
import { BP_SCOPE_IMPOSSIBLE_TOKEN } from "../utils/bp-scope-filters.js";

const CERTIFICATE_DEFAULT_PAGE_SIZE = 20;
const CERTIFICATE_MAX_PAGE_SIZE = 500;

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

function toPositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parsePageRequest(query = {}, {
  defaultPageSize = CERTIFICATE_DEFAULT_PAGE_SIZE,
  maxPageSize = CERTIFICATE_MAX_PAGE_SIZE
} = {}) {
  const requestedPageSize = toPositiveInteger(query.pageSize || query.limit) || defaultPageSize;
  const pageSize = Math.min(maxPageSize, Math.max(1, requestedPageSize));

  const rawPage = toPositiveInteger(query.page);
  const rawOffset = toPositiveInteger(query.offset);

  const offset = rawOffset !== null ? Math.max(0, rawOffset) : Math.max(0, ((rawPage || 1) - 1) * pageSize);
  const page = rawPage || Math.floor(offset / pageSize) + 1;

  return {
    page,
    pageSize,
    limit: pageSize,
    offset,
    skip: offset,
    take: pageSize
  };
}

function buildPagedResponse({ items, total, page, pageSize, limit, offset }) {
  const safeTotal = Number(total || 0);
  const totalPages = Math.max(1, Math.ceil(safeTotal / pageSize));

  return {
    items,
    total: safeTotal,
    page,
    pageSize,
    totalPages,
    limit,
    offset
  };
}

function normalizeScopeNodeIds(nodeIds) {
  return (Array.isArray(nodeIds) ? nodeIds : [])
    .filter((id) => typeof id === "string" && id.length && id !== BP_SCOPE_IMPOSSIBLE_TOKEN);
}

async function logBpCertificateScopeDiagnostics(req, endpoint) {
  const scopedNodeIds = normalizeScopeNodeIds(req.bpScope?.hierarchyNodeIds);
  const studentCount = await prisma.student.count({
    where: {
      tenantId: req.auth.tenantId,
      ...(scopedNodeIds.length ? { hierarchyNodeId: { in: scopedNodeIds } } : { id: { in: ["__NO_SCOPE__"] } })
    }
  });

  logger.info("bp_certificate_scope_diagnostics", {
    endpoint,
    tenantId: req.auth.tenantId,
    bpId: req.bpScope?.businessPartner?.id || null,
    bpRoot: req.bpScope?.businessPartner?.hierarchyNodeId || null,
    franchiseCount: normalizeScopeNodeIds(req.bpScope?.franchiseIds).length,
    centerCount: normalizeScopeNodeIds(req.bpScope?.centerIds).length,
    nodeCount: scopedNodeIds.length,
    studentCount
  });

  return { scopedNodeIds, studentCount };
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

function mergeCertificateMetadata(metadata, brandingSnapshot, academicSnapshot) {
  if (!brandingSnapshot) {
    if (!academicSnapshot) {
      return metadata || null;
    }
    return {
      ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {}),
      academicSnapshot
    };
  }

  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return {
      ...metadata,
      brandingSnapshot,
      ...(academicSnapshot ? { academicSnapshot } : {})
    };
  }

  return {
    brandingSnapshot,
    ...(academicSnapshot ? { academicSnapshot } : {}),
    ...(metadata === undefined || metadata === null ? {} : { legacyMetadata: metadata })
  };
}

function resolveCertificateAcademicSnapshot(certificate) {
  const metadataSnapshot = certificate?.metadata?.academicSnapshot || null;

  const levelSnapshot = certificate?.levelSnapshot || metadataSnapshot?.level || null;
  const courseSnapshot = certificate?.courseSnapshot || metadataSnapshot?.course || null;

  const level = {
    id: levelSnapshot?.id || certificate?.level?.id || null,
    name: levelSnapshot?.name || certificate?.level?.name || null,
    rank: levelSnapshot?.rank ?? certificate?.level?.rank ?? null
  };

  const course = {
    id: courseSnapshot?.id || certificate?.courseId || certificate?.student?.course?.id || null,
    name: courseSnapshot?.name || certificate?.student?.course?.name || null,
    code: courseSnapshot?.code || certificate?.student?.course?.code || null
  };

  return { level, course };
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
  const { take, skip, page, pageSize, limit, offset } = parsePageRequest(req.query, {
    defaultPageSize: 25,
    maxPageSize: 200
  });
  const q = req.query.q ? String(req.query.q).trim() : null;
  const isActive = parseStatus(req.query.status);

  const nodeIds = normalizeScopeNodeIds(req.bpScope.hierarchyNodeIds);
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        email: true,
        courseId: true,
        levelId: true,
        isActive: true,
        createdAt: true,
        course: {
          select: {
            id: true,
            name: true
          }
        },
        level: {
          select: {
            id: true,
            name: true,
            rank: true
          }
        },
        batchEnrollments: {
          where: {
            tenantId: req.auth.tenantId,
            status: "ACTIVE"
          },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            level: {
              select: {
                id: true,
                name: true,
                rank: true
              }
            }
          }
        },
        hierarchyNode: {
          select: { id: true, name: true, code: true, type: true }
        }
      }
    }),
    prisma.student.count({ where })
  ]);

  const mappedItems = items.map((student) => {
    const currentEnrollmentLevel = student.batchEnrollments?.[0]?.level || null;
    const effectiveLevel = currentEnrollmentLevel || student.level || null;

    return {
      id: student.id,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      isActive: student.isActive,
      createdAt: student.createdAt,
      hierarchyNode: student.hierarchyNode,
      courseId: student.course?.id || student.courseId || null,
      courseName: student.course?.name || null,
      levelId: effectiveLevel?.id || null,
      levelName: effectiveLevel?.name || null,
      levelRank: effectiveLevel?.rank ?? null
    };
  });

  return res.apiSuccess("Partner students fetched", buildPagedResponse({
    items: mappedItems,
    total,
    page,
    pageSize,
    limit,
    offset
  }));
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
  const { take, skip, page, pageSize, limit, offset } = parsePageRequest(req.query);
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = parseCertificateStatus(req.query.status);
  const levelId = req.query.levelId || null;
  const centerId = req.query.centerId || null;
  const issuedFrom = req.query.issuedFrom || null;
  const issuedTo = req.query.issuedTo || null;
  const includeSummary = String(req.query.includeSummary || "1") !== "0";
  const { scopedNodeIds } = await logBpCertificateScopeDiagnostics(req, "listPartnerCertificates");

  const studentFilter = {};
  if (scopedNodeIds.length) {
    studentFilter.hierarchyNodeId = centerId ? centerId : { in: scopedNodeIds };
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
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true,
        certificateNumber: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        reason: true,
        courseId: true,
        courseSnapshot: true,
        levelSnapshot: true,
        metadata: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true
              }
            },
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

  const mappedItems = items.map((item) => {
    const snapshot = resolveCertificateAcademicSnapshot(item);
    return {
      ...item,
      level: snapshot.level,
      course: snapshot.course
    };
  });

  let summary = null;
  if (includeSummary) {
    const studentWhere = {
      tenantId: req.auth.tenantId,
      ...(scopedNodeIds.length ? { hierarchyNodeId: { in: scopedNodeIds } } : { id: { in: ["__NO_SCOPE__"] } })
    };

    const [
      totalStudents,
      levelDistribution,
      courseDistribution,
      completionPairs,
      issuedPairs,
      certifiedDistinct
    ] = await Promise.all([
      prisma.student.count({ where: studentWhere }),
      prisma.student.groupBy({
        by: ["levelId"],
        where: studentWhere,
        _count: { _all: true }
      }),
      prisma.student.groupBy({
        by: ["courseId"],
        where: studentWhere,
        _count: { _all: true }
      }),
      prisma.studentLevelCompletion.findMany({
        where: {
          tenantId: req.auth.tenantId,
          student: {
            ...(scopedNodeIds.length ? { hierarchyNodeId: { in: scopedNodeIds } } : { id: { in: ["__NO_SCOPE__"] } })
          }
        },
        select: {
          studentId: true,
          levelId: true
        }
      }),
      prisma.certificate.findMany({
        where: {
          tenantId: req.auth.tenantId,
          status: "ISSUED",
          ...(scopedNodeIds.length
            ? {
                student: {
                  is: {
                    hierarchyNodeId: { in: scopedNodeIds }
                  }
                }
              }
            : {
                studentId: { in: ["__NO_SCOPE__"] }
              })
        },
        select: {
          studentId: true,
          levelId: true
        }
      }),
      prisma.certificate.findMany({
        where: {
          tenantId: req.auth.tenantId,
          status: "ISSUED",
          ...(scopedNodeIds.length
            ? {
                student: {
                  is: {
                    hierarchyNodeId: { in: scopedNodeIds }
                  }
                }
              }
            : {
                studentId: { in: ["__NO_SCOPE__"] }
              })
        },
        distinct: ["studentId"],
        select: { studentId: true }
      })
    ]);

    const [levelRows, courseRows] = await Promise.all([
      prisma.level.findMany({
        where: {
          tenantId: req.auth.tenantId,
          id: { in: levelDistribution.map((row) => row.levelId) }
        },
        select: {
          id: true,
          rank: true,
          name: true
        }
      }),
      prisma.course.findMany({
        where: {
          tenantId: req.auth.tenantId,
          id: { in: courseDistribution.map((row) => row.courseId).filter(Boolean) }
        },
        select: {
          id: true,
          code: true,
          name: true
        }
      })
    ]);

    const levelMap = new Map(levelRows.map((row) => [row.id, row]));
    const courseMap = new Map(courseRows.map((row) => [row.id, row]));
    const issuedKeySet = new Set(issuedPairs.map((row) => `${row.studentId}:${row.levelId}`));
    const eligibleStudentsSet = new Set(
      completionPairs
        .filter((row) => !issuedKeySet.has(`${row.studentId}:${row.levelId}`))
        .map((row) => row.studentId)
    );

    summary = {
      totals: {
        totalStudents,
        eligibleStudents: eligibleStudentsSet.size,
        certifiedStudents: certifiedDistinct.length
      },
      levelWise: levelDistribution
        .map((row) => ({
          levelId: row.levelId,
          count: row._count._all,
          level: levelMap.get(row.levelId) || null
        }))
        .sort((a, b) => b.count - a.count),
      courseWise: courseDistribution
        .map((row) => ({
          courseId: row.courseId,
          count: row._count._all,
          course: row.courseId ? (courseMap.get(row.courseId) || null) : null
        }))
        .sort((a, b) => b.count - a.count)
    };
  }

  return res.apiSuccess("Partner certificates fetched", {
    ...buildPagedResponse({
      items: mappedItems,
      total,
      page,
      pageSize,
      limit,
      offset
    }),
    ...(summary ? { summary } : {})
  });
});

const issuePartnerCertificate = asyncHandler(async (req, res) => {
  const { studentId, levelId, certificateNumber, reason, metadata } = req.body;
  if (!studentId || !levelId) {
    return res.apiError(400, "studentId and levelId are required", "VALIDATION_ERROR");
  }

  await logBpCertificateScopeDiagnostics(req, "issuePartnerCertificate");

  const nodeIds = normalizeScopeNodeIds(req.bpScope.hierarchyNodeIds);
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId: req.auth.tenantId,
      ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
    },
    select: {
      id: true,
      hierarchyNodeId: true,
      levelId: true,
      courseId: true,
      course: {
        select: {
          id: true,
          code: true,
          name: true
        }
      },
      batchEnrollments: {
        where: {
          tenantId: req.auth.tenantId,
          status: "ACTIVE"
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          levelId: true
        }
      }
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found in partner scope", "STUDENT_NOT_FOUND");
  }

  const level = await prisma.level.findFirst({
    where: { id: levelId, tenantId: req.auth.tenantId },
    select: { id: true, name: true, rank: true }
  });

  if (!level) {
    return res.apiError(404, "Level not found", "LEVEL_NOT_FOUND");
  }

  const effectiveLevelId = student.batchEnrollments?.[0]?.levelId || student.levelId;
  if (effectiveLevelId !== level.id) {
    return res.apiError(
      409,
      "Requested level does not match student enrollment level",
      "CERTIFICATE_LEVEL_MISMATCH"
    );
  }

  const courseSnapshot = {
    id: student.courseId || null,
    code: student.course?.code || null,
    name: student.course?.name || null
  };
  const levelSnapshot = {
    id: level.id,
    name: level.name,
    rank: level.rank
  };
  const academicSnapshot = {
    capturedAt: new Date().toISOString(),
    course: courseSnapshot,
    level: levelSnapshot
  };

  const brandingSnapshot = await buildCertificateBrandingSnapshotForStudent(
    student.id,
    req.auth.tenantId
  );

  const created = await prisma.certificate.create({
    data: {
      tenantId: req.auth.tenantId,
      certificateNumber: certificateNumber ? String(certificateNumber).trim() : generateCertificateNumber(),
      status: "ISSUED",
      studentId: student.id,
      levelId: level.id,
      courseId: student.courseId || null,
      issuedByUserId: req.auth.userId,
      reason: reason ? String(reason).trim() : null,
      courseSnapshot,
      levelSnapshot,
      brandingSnapshot,
      metadata: mergeCertificateMetadata(metadata, brandingSnapshot, academicSnapshot),
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

  await logBpCertificateScopeDiagnostics(req, "bulkIssuePartnerCertificates");

  const nodeIds = normalizeScopeNodeIds(req.bpScope.hierarchyNodeIds);
  const tenantId = req.auth.tenantId;

  const level = await prisma.level.findFirst({
    where: { id: levelId, tenantId },
    select: { id: true, name: true, rank: true }
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
    select: {
      id: true,
      levelId: true,
      courseId: true,
      course: {
        select: {
          id: true,
          code: true,
          name: true
        }
      },
      batchEnrollments: {
        where: {
          tenantId,
          status: "ACTIVE"
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: {
          levelId: true
        }
      }
    }
  });
  const validStudentIds = new Set(validStudents.map((s) => s.id));

  const levelMatchedStudents = validStudents.filter((student) => {
    const effectiveLevelId = student.batchEnrollments?.[0]?.levelId || student.levelId;
    return effectiveLevelId === level.id;
  });
  const levelMatchedStudentIds = new Set(levelMatchedStudents.map((student) => student.id));

  // Find existing certificates for these students + level (skip duplicates)
  const existing = await prisma.certificate.findMany({
    where: {
      tenantId,
      levelId,
      studentId: { in: [...levelMatchedStudentIds] },
      status: "ISSUED"
    },
    select: { studentId: true }
  });
  const alreadyIssuedIds = new Set(existing.map((c) => c.studentId));

  const toIssue = [...levelMatchedStudentIds].filter((id) => !alreadyIssuedIds.has(id));

  const brandingSnapshots = new Map();
  const academicSnapshots = new Map();
  await Promise.all(
    toIssue.map(async (studentId) => {
      const snapshot = await buildCertificateBrandingSnapshotForStudent(studentId, tenantId);
      const student = levelMatchedStudents.find((row) => row.id === studentId);

      const courseSnapshot = {
        id: student?.courseId || null,
        code: student?.course?.code || null,
        name: student?.course?.name || null
      };
      const levelSnapshot = {
        id: level.id,
        name: level.name,
        rank: level.rank
      };

      brandingSnapshots.set(studentId, snapshot);
      academicSnapshots.set(studentId, {
        courseSnapshot,
        levelSnapshot,
        academicSnapshot: {
          capturedAt: new Date().toISOString(),
          course: courseSnapshot,
          level: levelSnapshot
        }
      });
    })
  );

  const created = await prisma.$transaction(
    toIssue.map((studentId) =>
      prisma.certificate.create({
        data: {
          tenantId,
          certificateNumber: generateCertificateNumber(),
          status: "ISSUED",
          studentId,
          levelId: level.id,
          courseId: academicSnapshots.get(studentId)?.courseSnapshot?.id || null,
          issuedByUserId: req.auth.userId,
          reason: reason ? String(reason).trim() : null,
          courseSnapshot: academicSnapshots.get(studentId)?.courseSnapshot || null,
          levelSnapshot: academicSnapshots.get(studentId)?.levelSnapshot || null,
          brandingSnapshot: brandingSnapshots.get(studentId) || null,
          metadata: mergeCertificateMetadata(
            null,
            brandingSnapshots.get(studentId) || null,
            academicSnapshots.get(studentId)?.academicSnapshot || null
          ),
          verificationToken: crypto.randomUUID()
        }
      })
    )
  );

  return res.apiSuccess("Bulk certificates issued", {
    issued: created.length,
    skipped: alreadyIssuedIds.size,
    invalidStudents: studentIds.length - validStudentIds.size,
    levelMismatchStudents: validStudents.length - levelMatchedStudents.length,
    certificates: created
  }, 201);
});

const listEligibleStudentsForCertificate = asyncHandler(async (req, res) => {
  const { levelId } = req.query;
  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const { take, skip, page, pageSize, limit, offset } = parsePageRequest(req.query, {
    defaultPageSize: 50,
    maxPageSize: 200
  });

  const { scopedNodeIds } = await logBpCertificateScopeDiagnostics(req, "listEligibleStudentsForCertificate");

  const tenantId = req.auth.tenantId;

  const eligibleWhere = {
    tenantId,
    levelId,
    student: {
      is: {
        ...(scopedNodeIds.length ? { hierarchyNodeId: { in: scopedNodeIds } } : { id: { in: ["__NO_SCOPE__"] } }),
        certificates: {
          none: {
            tenantId,
            levelId,
            status: "ISSUED"
          }
        }
      }
    }
  };

  const [completions, total] = await Promise.all([
    prisma.studentLevelCompletion.findMany({
      where: eligibleWhere,
      skip,
      take,
      orderBy: [{ completedAt: "desc" }, { studentId: "asc" }],
      select: {
        studentId: true,
        completedAt: true,
        student: {
          select: { id: true, firstName: true, lastName: true, admissionNo: true }
        }
      }
    }),
    prisma.studentLevelCompletion.count({
      where: eligibleWhere
    })
  ]);

  const items = completions.map((c) => ({
      id: c.student.id,
      fullName: [c.student.firstName, c.student.lastName].filter(Boolean).join(" ").trim() || "-",
      admissionNo: c.student.admissionNo,
      completedAt: c.completedAt
    }));

  return res.apiSuccess("Eligible students fetched", buildPagedResponse({
    items,
    total,
    page,
    pageSize,
    limit,
    offset
  }));
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
  const nodeIds = normalizeScopeNodeIds(req.bpScope.hierarchyNodeIds);

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
      courseSnapshot: true,
      levelSnapshot: true,
      metadata: true,
      student: {
        select: {
          admissionNo: true,
          firstName: true,
          lastName: true,
          course: {
            select: {
              code: true,
              name: true
            }
          }
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
        "courseCode",
        "courseName",
        "levelRank",
        "levelName"
      ],
      ...rows.map((r) => {
        const snapshot = resolveCertificateAcademicSnapshot(r);
        return [
          r.certificateNumber,
          r.status,
          r.issuedAt.toISOString(),
          r.revokedAt ? r.revokedAt.toISOString() : "",
          r.reason || "",
          r.student?.admissionNo || "",
          r.student?.firstName || "",
          r.student?.lastName || "",
          snapshot.course.code || "",
          snapshot.course.name || "",
          String(snapshot.level.rank ?? ""),
          snapshot.level.name || ""
        ];
      })
    ]
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=partner_certificates_${Date.now()}.csv`);
  return res.status(200).send(csv);
});

const getPartnerProfile = asyncHandler(async (req, res) => {
  const where = {
    id: req.bpScope.businessPartner.id,
    tenantId: req.auth.tenantId
  };

  let partner;
  try {
    partner = await prisma.businessPartner.findFirst({
      where,
      include: {
        address: true,
        operationalStates: true,
        operationalDistricts: true,
        operationalCities: true
      }
    });
  } catch (error) {
    if (!isSchemaMismatchError(error, [
      "businesspartneraddress",
      "partneroperationalstate",
      "partneroperationaldistrict",
      "partneroperationalcity",
      "operationalstates",
      "operationaldistricts",
      "operationalcities",
      "address"
    ])) {
      throw error;
    }

    partner = await prisma.businessPartner.findFirst({ where });
  }

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
