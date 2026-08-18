import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAudit } from "../utils/audit.js";
import {
  calculateAndPersistCompetitionResults,
  getCompetitionLeaderboard
} from "../services/competition-leaderboard.service.js";
import { createBulkNotification } from "../services/notification.service.js";
import {
  getNextRoleByWorkflowStage,
  transitionForward,
  transitionReject
} from "../services/competition-workflow.service.js";
import {
  approveCompetitionEnrollmentList,
  forwardCompetitionEnrollmentList,
  reprocessCompetitionQuotaRequests,
  returnCompetitionEnrollmentList,
  setCompetitionEnrollmentInclusion
} from "../services/competition-enrollment-workflow.service.js";
import { parsePagination } from "../utils/pagination.js";
import { toCsv } from "../utils/csv.js";
import {
  resolveBusinessPartnerForUser,
  resolveBusinessPartnerScope
} from "../services/bp-scope.service.js";
import {
  listCompetitionBusinessPartnerQuotas,
  setCompetitionBusinessPartnerQuota
} from "../services/competition-quota.service.js";
import {
  generateCompetitionCertificates,
  revokeCompetitionCertificates
} from "../services/competition-certificate.service.js";
import {
  canReadCompetitionResults,
  resolveCompetitionResultEnrollmentWhere
} from "../services/competition-result-scope.service.js";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function normalizeId(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeId).filter(Boolean))];
}

function buildCompetitionCode(id) {
  const suffix = String(id || "").slice(-6).toUpperCase() || "NEW";
  return `COMP-${suffix}`;
}

function withStageOneCompetitionFields(item) {
  if (!item) return item;

  const enrollments = Array.isArray(item.enrollments) ? item.enrollments : [];
  const worksheets = Array.isArray(item.worksheets) ? item.worksheets : [];
  const businessPartnerCount = Number.isFinite(Number(item.businessPartnerCount))
    ? Number(item.businessPartnerCount)
    : 0;
  const courseMappings = Array.isArray(item.courseMappings) ? item.courseMappings : [];
  const worksheetAllocations = Array.isArray(item.worksheetAllocations)
    ? item.worksheetAllocations
    : [];

  return {
    ...item,
    code: item.code || buildCompetitionCode(item.id),
    businessPartnerCount,
    courseCount: courseMappings.length,
    worksheetMappingCount: worksheetAllocations.length || worksheets.length,
    approvedStudentCount: enrollments.filter((entry) => entry?.isActive !== false).length
  };
}

function assertEnrollmentWindowOpen(competition) {
  const now = new Date();

  if (!["DRAFT", "SCHEDULED", "ACTIVE"].includes(competition.status)) {
    throw createHttpError(409, "Competition is not accepting enrollments", "COMPETITION_ENROLLMENT_CLOSED");
  }
  if (competition.enrollmentStartAt && now < competition.enrollmentStartAt) {
    throw createHttpError(409, "Competition enrollment has not opened", "COMPETITION_ENROLLMENT_NOT_OPEN");
  }
  if (competition.enrollmentEndAt && now > competition.enrollmentEndAt) {
    throw createHttpError(409, "Competition enrollment has closed", "COMPETITION_ENROLLMENT_CLOSED");
  }
}

function isCompetitionResultStatusSchemaMissing(error) {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "P2022" || msg.includes("resultstatus") || msg.includes("resultpublishedat");
}

function isCompetitionCreateContractSchemaMissing(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    error?.code === "P2022" ||
    msg.includes("seasonid") ||
    msg.includes("competitionseason") ||
    msg.includes("enrollmentstartat") ||
    msg.includes("enrollmentendat") ||
    msg.includes("`code`")
  );
}

function buildCompetitionSelect({ includeResultMeta = true, includeStageTransitions = false, includeCreateContractFields = true } = {}) {
  const select = {
    id: true,
    tenantId: true,
    title: true,
    description: true,
    status: true,
    workflowStage: true,
    rejectedAt: true,
    rejectedByUserId: true,
    startsAt: true,
    endsAt: true,
    hierarchyNodeId: true,
    levelId: true,
    createdByUserId: true,
    createdAt: true,
    updatedAt: true,
    hierarchyNode: { select: { id: true, name: true, type: true, code: true } },
    level: { select: { id: true, name: true, rank: true } },
    createdBy: { select: { id: true, email: true, role: true } },
    competitionCourses: {
      where: { isActive: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        levels: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { levelNumber: "asc" }, { id: "asc" }],
          select: {
            id: true,
            levelId: true,
            levelNumber: true,
            sortOrder: true,
            isActive: true,
            level: { select: { id: true, name: true, rank: true } }
          }
        }
      }
    },
    enrollments: {
      where: { isActive: true },
      select: {
        studentId: true,
        isActive: true,
        rank: true,
        totalScore: true,
        enrolledAt: true
      }
    },
    worksheets: { select: { worksheetId: true, assignedAt: true } }
  };

  if (includeCreateContractFields) {
    select.seasonId = true;
    select.code = true;
    select.enrollmentStartAt = true;
    select.enrollmentEndAt = true;
    select.season = {
      select: {
        id: true,
        name: true,
        code: true,
        startDate: true,
        endDate: true,
        isActive: true
      }
    };
  }

  if (includeResultMeta) {
    select.resultStatus = true;
    select.resultPublishedAt = true;
  }

  if (includeStageTransitions) {
    select.stageTransitions = {
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        fromStage: true,
        toStage: true,
        action: true,
        reason: true,
        createdAt: true,
        actedByUser: { select: { id: true, email: true, role: true } }
      }
    };
  }

  return select;
}

function applyLegacyCompetitionResultMeta(item) {
  if (!item) return item;
  return {
    ...item,
    resultStatus: item.resultStatus || "DRAFT",
    resultPublishedAt: item.resultPublishedAt || null,
    legacyResultStatus: true
  };
}

function applyLegacyCompetitionCreateContractFields(item) {
  if (!item) return item;
  return {
    ...item,
    seasonId: item.seasonId || null,
    code: item.code || null,
    enrollmentStartAt: item.enrollmentStartAt || null,
    enrollmentEndAt: item.enrollmentEndAt || null,
    season: item.season || null,
    legacyCreateContract: true
  };
}

async function findCompetitionsWithResultFallback({ where, orderBy, skip, take }) {
  let includeResultMeta = true;
  let includeCreateContractFields = true;
  let legacyResultStatus = false;
  let legacyCreateContract = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const items = await prisma.competition.findMany({
        where,
        orderBy,
        skip,
        take,
        select: buildCompetitionSelect({ includeResultMeta, includeCreateContractFields })
      });

      let output = items;
      if (legacyResultStatus) {
        output = output.map(applyLegacyCompetitionResultMeta);
      }
      if (legacyCreateContract) {
        output = output.map(applyLegacyCompetitionCreateContractFields);
      }

      return {
        items: output,
        legacyResultStatus
      };
    } catch (error) {
      if (includeResultMeta && isCompetitionResultStatusSchemaMissing(error)) {
        includeResultMeta = false;
        legacyResultStatus = true;
        continue;
      }
      if (includeCreateContractFields && isCompetitionCreateContractSchemaMissing(error)) {
        includeCreateContractFields = false;
        legacyCreateContract = true;
        continue;
      }
      throw error;
    }
  }

  throw createHttpError(500, "Unable to fetch competitions", "COMPETITION_QUERY_FAILED");
}

async function findCompetitionDetailWithResultFallback(where) {
  let includeResultMeta = true;
  let includeCreateContractFields = true;
  let legacyResultStatus = false;
  let legacyCreateContract = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const item = await prisma.competition.findFirst({
        where,
        select: buildCompetitionSelect({
          includeResultMeta,
          includeStageTransitions: true,
          includeCreateContractFields
        })
      });

      let output = item;
      if (legacyResultStatus) {
        output = applyLegacyCompetitionResultMeta(output);
      }
      if (legacyCreateContract) {
        output = applyLegacyCompetitionCreateContractFields(output);
      }
      return output;
    } catch (error) {
      if (includeResultMeta && isCompetitionResultStatusSchemaMissing(error)) {
        includeResultMeta = false;
        legacyResultStatus = true;
        continue;
      }
      if (includeCreateContractFields && isCompetitionCreateContractSchemaMissing(error)) {
        includeCreateContractFields = false;
        legacyCreateContract = true;
        continue;
      }
      throw error;
    }
  }

  throw createHttpError(500, "Unable to fetch competition", "COMPETITION_QUERY_FAILED");
}

async function resolveActorBusinessPartnerId({ auth, tx = prisma } = {}) {
  if (!auth?.tenantId || !auth?.userId) {
    return null;
  }

  if (auth.role === "BP") {
    const partner = await resolveBusinessPartnerForUser({ tenantId: auth.tenantId, userId: auth.userId, tx });
    return partner?.id || null;
  }

  if (auth.role === "FRANCHISE") {
    const profile = await tx.franchiseProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: { businessPartnerId: true }
    });
    return profile?.businessPartnerId || null;
  }

  if (auth.role === "CENTER") {
    const profile = await tx.centerProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: {
        franchiseProfile: {
          select: {
            businessPartnerId: true,
            isActive: true,
            status: true
          }
        }
      }
    });
    if (
      !profile?.franchiseProfile?.isActive ||
      profile.franchiseProfile.status !== "ACTIVE"
    ) return null;
    return profile.franchiseProfile.businessPartnerId || null;
  }

  if (auth.role === "TEACHER") {
    const teacher = await tx.teacherProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: { hierarchyNodeId: true }
    });

    if (!teacher?.hierarchyNodeId) return null;

    const center = await tx.centerProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        isActive: true,
        status: "ACTIVE",
        authUser: { hierarchyNodeId: teacher.hierarchyNodeId }
      },
      select: {
        franchiseProfile: {
          select: { businessPartnerId: true, isActive: true, status: true }
        }
      }
    });

    if (
      !center?.franchiseProfile?.isActive ||
      center.franchiseProfile.status !== "ACTIVE"
    ) return null;
    return center.franchiseProfile.businessPartnerId || null;
  }

  return null;
}

async function buildCompetitionVisibilityWhere({ auth, extraWhere = {} } = {}) {
  const tenantWhere = { tenantId: auth.tenantId, ...extraWhere };

  if (!auth || auth.role === "SUPERADMIN") {
    return tenantWhere;
  }

  if (
    auth.role === "BP" ||
    auth.role === "FRANCHISE" ||
    auth.role === "CENTER" ||
    auth.role === "TEACHER"
  ) {
    const businessPartnerId = await resolveActorBusinessPartnerId({
      auth,
      tx: prisma
    });

    if (!businessPartnerId) {
      return {
        ...tenantWhere,
        id: { in: ["__NO_COMPETITION__"] }
      };
    }

    const assignments = await prisma.competitionWorksheetAssignment.findMany({
      where: {
        tenantId: auth.tenantId,
        businessPartnerId,
        isActive: true,
        competitionWorksheet: {
          is: {
            tenantId: auth.tenantId,
            isActive: true,
            competitionQuestionBank: {
              is: {
                tenantId: auth.tenantId,
                isActive: true,
                competitionCourseLevel: {
                  is: {
                    tenantId: auth.tenantId,
                    isActive: true,
                    competitionCourse: {
                      is: {
                        tenantId: auth.tenantId,
                        isActive: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      select: {
        competitionWorksheet: {
          select: {
            competitionQuestionBank: {
              select: {
                competitionCourseLevel: {
                  select: {
                    competitionCourse: {
                      select: {
                        competitionId: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const competitionIds = [
      ...new Set(
        assignments
          .map(
            (assignment) =>
              assignment.competitionWorksheet?.competitionQuestionBank
                ?.competitionCourseLevel?.competitionCourse?.competitionId
          )
          .filter(Boolean)
      )
    ];

    const requestedCompetitionId = normalizeId(extraWhere.id);
    if (requestedCompetitionId) {
      return {
        ...tenantWhere,
        id: competitionIds.includes(requestedCompetitionId)
          ? requestedCompetitionId
          : { in: ["__NO_COMPETITION__"] }
      };
    }

    return {
      ...tenantWhere,
      id: {
        in: competitionIds.length
          ? competitionIds
          : ["__NO_COMPETITION__"]
      }
    };
  }

  if (auth.hierarchyNodeId) {
    return {
      ...tenantWhere,
      hierarchyNodeId: auth.hierarchyNodeId
    };
  }

  return tenantWhere;
}

async function getCompetitionResultMeta({ competitionId, tenantId, auth = null }) {
  try {
    const row = await prisma.competition.findFirst({
      where: auth ? await buildCompetitionVisibilityWhere({ auth, extraWhere: { id: competitionId, tenantId } }) : { id: competitionId, tenantId },
      select: { id: true, title: true, resultStatus: true, resultPublishedAt: true }
    });
    if (!row) return null;
    return { ...row, legacyResultStatus: false };
  } catch (error) {
    if (!isCompetitionResultStatusSchemaMissing(error)) {
      throw error;
    }

    const legacy = await prisma.competition.findFirst({
      where: auth ? await buildCompetitionVisibilityWhere({ auth, extraWhere: { id: competitionId, tenantId } }) : { id: competitionId, tenantId },
      select: { id: true, title: true }
    });
    if (!legacy) return null;

    return {
      ...legacy,
      resultStatus: "DRAFT",
      resultPublishedAt: null,
      legacyResultStatus: true
    };
  }
}

const listCompetitions = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const where = await buildCompetitionVisibilityWhere({ auth: req.auth });

  const [{ items, legacyResultStatus }, total] = await Promise.all([
    findCompetitionsWithResultFallback({ where, orderBy, skip, take }),
    prisma.competition.count({ where })
  ]);

  let stageOneItems = items.map(withStageOneCompetitionFields);

  if (["CENTER", "TEACHER"].includes(req.auth.role) && stageOneItems.length) {
    const businessPartnerId = await resolveActorBusinessPartnerId({
      auth: req.auth,
      tx: prisma
    });
    const competitionIds = stageOneItems.map((item) => item.id);
    const eligibleLevelIdsByCompetitionId = new Map();
    const countsByCompetitionAndLevel = new Map();

    if (businessPartnerId) {
      const assignments = await prisma.competitionWorksheetAssignment.findMany({
        where: {
          tenantId: req.auth.tenantId,
          businessPartnerId,
          isActive: true,
          competitionWorksheet: {
            is: {
              tenantId: req.auth.tenantId,
              isActive: true,
              worksheetId: { not: null },
              competitionQuestionBank: {
                is: {
                  tenantId: req.auth.tenantId,
                  isActive: true,
                  competitionCourseLevel: {
                    is: {
                      tenantId: req.auth.tenantId,
                      isActive: true,
                      competitionCourse: {
                        is: {
                          tenantId: req.auth.tenantId,
                          competitionId: { in: competitionIds },
                          isActive: true
                        }
                      }
                    }
                  }
                }
              },
              worksheet: {
                is: {
                  tenantId: req.auth.tenantId,
                  isPublished: true
                }
              }
            }
          }
        },
        select: {
          competitionWorksheet: {
            select: {
              competitionQuestionBank: {
                select: {
                  competitionCourseLevel: {
                    select: {
                      id: true,
                      competitionCourse: { select: { competitionId: true } }
                    }
                  }
                }
              }
            }
          }
        }
      });

      for (const assignment of assignments) {
        const level =
          assignment.competitionWorksheet?.competitionQuestionBank
            ?.competitionCourseLevel;
        const competitionId = level?.competitionCourse?.competitionId;
        if (!competitionId || !level?.id) continue;
        const key = `${competitionId}:${level.id}`;
        countsByCompetitionAndLevel.set(
          key,
          (countsByCompetitionAndLevel.get(key) || 0) + 1
        );
      }

      for (const [key, count] of countsByCompetitionAndLevel) {
        if (count !== 1) continue;
        const separatorIndex = key.indexOf(":");
        const competitionId = key.slice(0, separatorIndex);
        const levelId = key.slice(separatorIndex + 1);
        const levelIds = eligibleLevelIdsByCompetitionId.get(competitionId) || [];
        levelIds.push(levelId);
        eligibleLevelIdsByCompetitionId.set(competitionId, levelIds);
      }
    }

    stageOneItems = stageOneItems.map((item) => {
      const eligibleLevelIds = eligibleLevelIdsByCompetitionId.get(item.id) || [];
      const levelAvailability = (item.competitionCourses || []).flatMap((course) =>
        (course.levels || []).map((courseLevel) => {
          const assignmentCount = countsByCompetitionAndLevel.get(
            `${item.id}:${courseLevel.id}`
          ) || 0;
          return {
            competitionCourseLevelId: courseLevel.id,
            competitionCourseId: course.id,
            courseName: course.name,
            courseCode: course.code,
            levelId: courseLevel.levelId,
            levelNumber: courseLevel.levelNumber,
            levelName: courseLevel.level?.name || null,
            executableAssignmentCount: assignmentCount,
            eligible: assignmentCount === 1,
            reason:
              assignmentCount === 0
                ? "NO_EXECUTABLE_WORKSHEET_ASSIGNED"
                : assignmentCount > 1
                  ? "MULTIPLE_EXECUTABLE_WORKSHEETS_ASSIGNED"
                  : null
          };
        })
      );

      return {
        ...item,
        eligibleLevelIds,
        levelAvailability
      };
    });
  }

  res.setHeader("X-Pagination-Limit", String(limit));
  res.setHeader("X-Pagination-Offset", String(offset));
  res.setHeader("X-Pagination-Total", String(total));
  res.setHeader("X-Legacy-Result-Status", legacyResultStatus ? "true" : "false");

  return res.apiSuccess("Competitions fetched", stageOneItems);
});

const getCompetitionDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const where = await buildCompetitionVisibilityWhere({ auth: req.auth, extraWhere: { id } });

  const item = await findCompetitionDetailWithResultFallback(where);

  if (!item) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  return res.apiSuccess("Competition fetched", withStageOneCompetitionFields(item));
});

const createCompetition = asyncHandler(async (req, res) => {
  if (req.auth.role !== "SUPERADMIN") {
    return res.apiError(403, "Only Superadmin can create competitions", "COMPETITION_CREATE_FORBIDDEN");
  }

  const {
    seasonId: rawSeasonId,
    code,
    title,
    description,
    enrollmentStartAt,
    enrollmentEndAt,
    startsAt,
    endsAt,
    status
  } = req.body;

  const seasonId = normalizeId(rawSeasonId);
  if (!seasonId) {
    return res.apiError(400, "seasonId is required", "COMPETITION_SEASON_REQUIRED");
  }

  const trimmedCode = String(code || "").trim();
  if (!trimmedCode || trimmedCode.length > 100) {
    return res.apiError(400, "code is required (max 100 chars)", "VALIDATION_ERROR");
  }

  const trimmedTitle = String(title || "").trim();
  if (!trimmedTitle || trimmedTitle.length > 200) {
    return res.apiError(400, "title is required (max 200 chars)", "VALIDATION_ERROR");
  }
  if (description && String(description).length > 2000) {
    return res.apiError(400, "description must be at most 2000 chars", "VALIDATION_ERROR");
  }

  const allowedStatuses = new Set(["DRAFT", "SCHEDULED", "ACTIVE", "COMPLETED", "ARCHIVED"]);
  const normalizedStatus = String(status || "DRAFT").trim().toUpperCase();
  if (!allowedStatuses.has(normalizedStatus)) {
    return res.apiError(400, "status must be a valid Competition status", "VALIDATION_ERROR");
  }

  const parsedEnrollmentStart = new Date(enrollmentStartAt);
  const parsedEnrollmentEnd = new Date(enrollmentEndAt);
  const parsedStart = new Date(startsAt);
  const parsedEnd = new Date(endsAt);
  if (
    !enrollmentStartAt ||
    !enrollmentEndAt ||
    !startsAt ||
    !endsAt ||
    Number.isNaN(parsedEnrollmentStart.getTime()) ||
    Number.isNaN(parsedEnrollmentEnd.getTime()) ||
    Number.isNaN(parsedStart.getTime()) ||
    Number.isNaN(parsedEnd.getTime())
  ) {
    return res.apiError(400, "Enrollment and competition dates must be valid", "VALIDATION_ERROR");
  }
  if (parsedEnrollmentEnd <= parsedEnrollmentStart) {
    return res.apiError(400, "enrollmentEndAt must be after enrollmentStartAt", "VALIDATION_ERROR");
  }
  if (parsedEnrollmentEnd > parsedEnd) {
    return res.apiError(400, "enrollmentEndAt must be on or before endsAt", "VALIDATION_ERROR");
  }
  if (parsedEnd <= parsedStart) {
    return res.apiError(400, "endsAt must be after startsAt", "VALIDATION_ERROR");
  }

  const created = await prisma.$transaction(async (tx) => {
    // hierarchyNodeId and levelId remain non-null legacy columns. Resolve them
    // from tenant configuration until a future schema phase can remove them.
    const [season, defaultLevel, authenticatedNode, duplicateTitle, duplicateCode] = await Promise.all([
      tx.competitionSeason.findFirst({
        where: {
          id: seasonId,
          tenantId: req.auth.tenantId
        },
        select: { id: true }
      }),
      tx.level.findFirst({
        where: {
          tenantId: req.auth.tenantId,
          rank: 1
        },
        select: { id: true }
      }),
      req.auth.hierarchyNodeId
        ? tx.hierarchyNode.findFirst({
            where: {
              id: req.auth.hierarchyNodeId,
              tenantId: req.auth.tenantId,
              isActive: true
            },
            select: { id: true }
          })
        : Promise.resolve(null),
      tx.competition.findFirst({
        where: {
          tenantId: req.auth.tenantId,
          seasonId,
          title: trimmedTitle
        },
        select: { id: true }
      }),
      tx.competition.findFirst({
        where: {
          tenantId: req.auth.tenantId,
          seasonId,
          code: trimmedCode
        },
        select: { id: true }
      })
    ]);

    if (!season) {
      throw createHttpError(
        400,
        "Competition Season not found for tenant",
        "COMPETITION_SEASON_INVALID"
      );
    }

    if (!defaultLevel) {
      throw createHttpError(
        409,
        "Tenant Level rank 1 is required for legacy Competition compatibility",
        "COMPETITION_COMPATIBILITY_LEVEL_MISSING"
      );
    }

    if (duplicateTitle) {
      throw createHttpError(
        409,
        "Competition name must be unique within Season",
        "COMPETITION_NAME_EXISTS_IN_SEASON"
      );
    }

    if (duplicateCode) {
      throw createHttpError(
        409,
        "Competition code must be unique within Season",
        "COMPETITION_CODE_EXISTS_IN_SEASON"
      );
    }

    const fallbackNode = authenticatedNode
      ? null
      : await tx.hierarchyNode.findFirst({
          where: {
            tenantId: req.auth.tenantId,
            isActive: true,
            parentId: null
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true }
        });
    const defaultHierarchyNodeId = authenticatedNode?.id || fallbackNode?.id || null;

    if (!defaultHierarchyNodeId) {
      throw createHttpError(
        409,
        "An active tenant hierarchy root is required for legacy Competition compatibility",
        "COMPETITION_COMPATIBILITY_HIERARCHY_MISSING"
      );
    }

    const competition = await tx.competition.create({
      data: {
        tenantId: req.auth.tenantId,
        seasonId: season.id,
        code: trimmedCode,
        title: trimmedTitle,
        description: description ? String(description).trim() : null,
        status: normalizedStatus,
        workflowStage: "SUPERADMIN_APPROVAL",
        enrollmentStartAt: parsedEnrollmentStart,
        enrollmentEndAt: parsedEnrollmentEnd,
        startsAt: parsedStart,
        endsAt: parsedEnd,
        hierarchyNodeId: defaultHierarchyNodeId,
        levelId: defaultLevel.id,
        createdByUserId: req.auth.userId
      }
    });

    return tx.competition.findUnique({
      where: { id: competition.id },
      select: buildCompetitionSelect({ includeResultMeta: false })
    });
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Competition created", withStageOneCompetitionFields(created), 201);
});

const updateCompetitionSchedule = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id || "").trim();
  const reason = String(req.body?.reason || "").trim();
  const expectedUpdatedAt = new Date(req.body?.expectedUpdatedAt);
  const parsedEnrollmentStart = new Date(req.body?.enrollmentStartAt);
  const parsedEnrollmentEnd = new Date(req.body?.enrollmentEndAt);
  const parsedStart = new Date(req.body?.startsAt);
  const parsedEnd = new Date(req.body?.endsAt);

  if (reason.length < 5 || reason.length > 500) {
    return res.apiError(
      400,
      "Correction reason must be between 5 and 500 characters",
      "COMPETITION_SCHEDULE_REASON_INVALID"
    );
  }
  if (
    Number.isNaN(expectedUpdatedAt.getTime()) ||
    Number.isNaN(parsedEnrollmentStart.getTime()) ||
    Number.isNaN(parsedEnrollmentEnd.getTime()) ||
    Number.isNaN(parsedStart.getTime()) ||
    Number.isNaN(parsedEnd.getTime())
  ) {
    return res.apiError(
      400,
      "Enrollment and Competition dates must be valid",
      "COMPETITION_SCHEDULE_DATES_INVALID"
    );
  }
  if (parsedEnrollmentEnd <= parsedEnrollmentStart) {
    return res.apiError(
      400,
      "Enrollment end must be after Enrollment start",
      "COMPETITION_ENROLLMENT_RANGE_INVALID"
    );
  }
  if (parsedEnd <= parsedStart) {
    return res.apiError(
      400,
      "Competition end must be after Competition start",
      "COMPETITION_DATE_RANGE_INVALID"
    );
  }
  if (parsedEnrollmentEnd > parsedEnd) {
    return res.apiError(
      400,
      "Enrollment end must be on or before Competition end",
      "COMPETITION_ENROLLMENT_END_INVALID"
    );
  }

  const current = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      status: true,
      resultStatus: true,
      enrollmentStartAt: true,
      enrollmentEndAt: true,
      startsAt: true,
      endsAt: true,
      updatedAt: true
    }
  });

  if (!current) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }
  if (current.status === "ARCHIVED") {
    return res.apiError(
      409,
      "Archived Competition schedule cannot be changed",
      "COMPETITION_SCHEDULE_ARCHIVED"
    );
  }
  if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    return res.apiError(
      409,
      "Competition was updated by another request. Refresh and review the latest schedule.",
      "COMPETITION_SCHEDULE_STALE"
    );
  }

  const oldSchedule = {
    enrollmentStartAt: current.enrollmentStartAt?.toISOString() || null,
    enrollmentEndAt: current.enrollmentEndAt?.toISOString() || null,
    startsAt: current.startsAt.toISOString(),
    endsAt: current.endsAt.toISOString()
  };
  const newSchedule = {
    enrollmentStartAt: parsedEnrollmentStart.toISOString(),
    enrollmentEndAt: parsedEnrollmentEnd.toISOString(),
    startsAt: parsedStart.toISOString(),
    endsAt: parsedEnd.toISOString()
  };
  const changed = Object.keys(newSchedule).some(
    (key) => oldSchedule[key] !== newSchedule[key]
  );
  if (!changed) {
    return res.apiError(
      400,
      "Change at least one schedule field before saving",
      "COMPETITION_SCHEDULE_UNCHANGED"
    );
  }

  let nextStatus = current.status;
  if (current.status === "COMPLETED") {
    const nonEndDateChanged =
      oldSchedule.enrollmentStartAt !== newSchedule.enrollmentStartAt ||
      oldSchedule.enrollmentEndAt !== newSchedule.enrollmentEndAt ||
      oldSchedule.startsAt !== newSchedule.startsAt;
    if (nonEndDateChanged) {
      return res.apiError(
        409,
        "For a completed Competition, only Competition End can be extended",
        "COMPLETED_COMPETITION_ONLY_END_EXTENDABLE"
      );
    }
    if (parsedEnd <= current.endsAt || parsedEnd <= new Date()) {
      return res.apiError(
        409,
        "Completed Competition End must be extended to a future date and time",
        "COMPLETED_COMPETITION_EXTENSION_INVALID"
      );
    }
    if (current.resultStatus === "PUBLISHED") {
      return res.apiError(
        409,
        "Unpublish Competition results before extending and reopening it",
        "COMPETITION_RESULTS_MUST_BE_UNPUBLISHED"
      );
    }
    nextStatus = "ACTIVE";
  }

  const updateResult = await prisma.competition.updateMany({
    where: {
      id: current.id,
      tenantId: req.auth.tenantId,
      updatedAt: expectedUpdatedAt
    },
    data: {
      enrollmentStartAt: parsedEnrollmentStart,
      enrollmentEndAt: parsedEnrollmentEnd,
      startsAt: parsedStart,
      endsAt: parsedEnd,
      status: nextStatus
    }
  });
  if (updateResult.count !== 1) {
    return res.apiError(
      409,
      "Competition was updated by another request. Refresh and try again.",
      "COMPETITION_SCHEDULE_STALE"
    );
  }

  const updated = await findCompetitionDetailWithResultFallback({
    id: current.id,
    tenantId: req.auth.tenantId
  });

  res.locals.entityId = current.id;
  res.locals.auditMetadata = {
    reason,
    oldSchedule,
    newSchedule,
    oldStatus: current.status,
    newStatus: nextStatus,
    reopenedCompletedCompetition: current.status === "COMPLETED" && nextStatus === "ACTIVE"
  };

  return res.apiSuccess(
    current.status === "COMPLETED"
      ? "Competition End extended and Competition reopened"
      : "Competition schedule updated",
    withStageOneCompetitionFields(updated)
  );
});

const forwardCompetitionRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await transitionForward({
    tenantId: req.auth.tenantId,
    competitionId: id,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role
  });

  const updated = result.competition;

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_WORKFLOW_TRANSITION",
    entityType: "COMPETITION",
    entityId: id,
    metadata: {
      from: result.fromStage,
      to: result.toStage,
      action: result.action
    }
  });

  void (async () => {
    try {
      const nextRole = getNextRoleByWorkflowStage(updated.workflowStage);

      if (!nextRole) {
        return;
      }

      const recipients = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: nextRole,
          ...(nextRole === "SUPERADMIN" ? {} : { hierarchyNodeId: updated.hierarchyNodeId })
        },
        select: {
          id: true
        },
        take: 500
      });

      await createBulkNotification(
        recipients.map((recipient) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: recipient.id,
          type: "COMPETITION_STAGE_UPDATE",
          title: "Competition Stage Updated",
          message: `Competition ${updated.title} moved to ${result.toStage}`,
          entityType: "COMPETITION",
          entityId: updated.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Competition request forwarded", updated);
});

const rejectCompetitionRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const result = await transitionReject({
    tenantId: req.auth.tenantId,
    competitionId: id,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role,
    reason
  });

  const updated = result.competition;

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_WORKFLOW_REJECT",
    entityType: "COMPETITION",
    entityId: id,
    metadata: {
      from: result.fromStage,
      to: result.toStage,
      action: result.action
    }
  });

  return res.apiSuccess("Competition request rejected", updated);
});

const getLeaderboard = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit } = req.query;

  const competition = await getCompetitionResultMeta({ competitionId: id, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!canReadCompetitionResults({
    auth: req.auth,
    resultStatus: competition.resultStatus,
    legacyResultStatus: competition.legacyResultStatus
  })) {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const enrollmentWhere = await resolveCompetitionResultEnrollmentWhere({
    auth: req.auth
  });

  const leaderboard = await getCompetitionLeaderboard({
    competitionId: id,
    tenantId: req.auth.tenantId,
    limit,
    skipApprovalCheck: req.auth.role === "SUPERADMIN",
    enrollmentWhere
  });

  return res.apiSuccess("Competition leaderboard fetched", {
    ...leaderboard,
    status: competition.resultStatus,
    resultPublishedAt: competition.resultPublishedAt,
    legacyResultStatus: competition.legacyResultStatus
  });
});

const getCompetitionResults = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit } = req.query;

  const competition = await getCompetitionResultMeta({ competitionId: id, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!canReadCompetitionResults({
    auth: req.auth,
    resultStatus: competition.resultStatus,
    legacyResultStatus: competition.legacyResultStatus
  })) {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const enrollmentWhere = await resolveCompetitionResultEnrollmentWhere({
    auth: req.auth
  });

  const leaderboard = await getCompetitionLeaderboard({
    competitionId: id,
    tenantId: req.auth.tenantId,
    limit,
    skipApprovalCheck: req.auth.role === "SUPERADMIN",
    enrollmentWhere
  });

  return res.apiSuccess("Competition results", {
    competitionId: competition.id,
    competitionTitle: competition.title,
    status: competition.resultStatus,
    resultPublishedAt: competition.resultPublishedAt,
    legacyResultStatus: competition.legacyResultStatus,
    totalParticipants: leaderboard.totalParticipants,
    completedParticipants: leaderboard.completedParticipants,
    levels: leaderboard.levels,
    leaderboard: leaderboard.leaderboard
  });
});

const publishCompetitionResults = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (competition.legacyResultStatus) {
    await recordAudit({
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      role: req.auth.role,
      action: "COMPETITION_RESULTS_PUBLISH_LEGACY",
      entityType: "COMPETITION",
      entityId: competitionId,
      metadata: { legacyResultStatus: true }
    });

    return res.apiSuccess("Competition results publish accepted (legacy mode)", {
      ...competition,
      resultStatus: "PUBLISHED",
      resultPublishedAt: new Date().toISOString(),
      legacyResultStatus: true,
      legacyNoop: true
    });
  }

  const schedule = await prisma.competition.findFirst({
    where: { id: competition.id, tenantId: req.auth.tenantId },
    select: { endsAt: true, resultStatus: true }
  });
  if (schedule?.resultStatus === "PUBLISHED") {
    const certificateSummary = await generateCompetitionCertificates({
      competitionId,
      tenantId: req.auth.tenantId,
      issuedByUserId: req.auth.userId
    });
    return res.apiSuccess("Competition results are already published", {
      ...competition,
      certificateSummary
    });
  }
  if (!schedule?.endsAt || new Date() < new Date(schedule.endsAt)) {
    return res.apiError(
      409,
      "Competition results can be published only after Competition End",
      "COMPETITION_NOT_ENDED"
    );
  }

  const publishedAt = new Date();
  const publication = await prisma.$transaction(async (tx) => {
    const calculated = await calculateAndPersistCompetitionResults({
      competitionId,
      tenantId: req.auth.tenantId,
      tx
    });
    if (!calculated.completedParticipants) {
      throw createHttpError(
        409,
        "No completed Competition attempts are available to publish",
        "COMPETITION_RESULTS_EMPTY"
      );
    }

    const updated = await tx.competition.update({
      where: { id: competition.id },
      data: { resultStatus: "PUBLISHED", resultPublishedAt: publishedAt }
    });

    if (tx.assessmentVersion) {
      await tx.assessmentVersion.updateMany({
        where: {
          tenantId: req.auth.tenantId,
          assessment: { is: { sourceSystem: "COMPETITION", sourceEntityId: competitionId } },
          versionStatus: "CURRENT"
        },
        data: {
          resultStatusMirror: "PUBLISHED",
          resultPublishedAtMirror: publishedAt
        }
      });
    }

    return { updated, calculated };
  });

  const certificateSummary = await generateCompetitionCertificates({
    competitionId,
    tenantId: req.auth.tenantId,
    issuedByUserId: req.auth.userId
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_RESULTS_PUBLISH",
    entityType: "COMPETITION",
    entityId: competitionId,
    metadata: {
      totalParticipants: publication.calculated.totalParticipants,
      completedParticipants: publication.calculated.completedParticipants,
      levelCount: publication.calculated.levels.length,
      calculatedAt: publication.calculated.calculatedAt,
      certificateSummary
    }
  });

  return res.apiSuccess("Competition results calculated and published", {
    ...publication.updated,
    resultSummary: {
      totalParticipants: publication.calculated.totalParticipants,
      completedParticipants: publication.calculated.completedParticipants,
      levelCount: publication.calculated.levels.length
    },
    certificateSummary
  });
});

const unpublishCompetitionResults = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (competition.legacyResultStatus) {
    await recordAudit({
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      role: req.auth.role,
      action: "COMPETITION_RESULTS_UNPUBLISH_LEGACY",
      entityType: "COMPETITION",
      entityId: competitionId,
      metadata: { legacyResultStatus: true }
    });

    return res.apiSuccess("Competition results unpublish accepted (legacy mode)", {
      ...competition,
      resultStatus: "LOCKED",
      resultPublishedAt: null,
      legacyResultStatus: true,
      legacyNoop: true
    });
  }

  const unpublished = await prisma.$transaction(async (tx) => {
    const updated = await tx.competition.update({
      where: { id: competition.id },
      data: {
        resultStatus: "LOCKED",
        resultPublishedAt: null
      }
    });

    if (tx.assessmentVersion) {
      await tx.assessmentVersion.updateMany({
        where: {
          tenantId: req.auth.tenantId,
          assessment: { is: { sourceSystem: "COMPETITION", sourceEntityId: competitionId } },
          versionStatus: "CURRENT"
        },
        data: { resultStatusMirror: "LOCKED", resultPublishedAtMirror: null }
      });
    }

    const certificateSummary = await revokeCompetitionCertificates({
      competitionId,
      tenantId: req.auth.tenantId,
      revokedByUserId: req.auth.userId,
      db: tx
    });

    return { updated, certificateSummary };
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_RESULTS_UNPUBLISH",
    entityType: "COMPETITION",
    entityId: competitionId,
    metadata: { certificateSummary: unpublished.certificateSummary }
  });

  return res.apiSuccess("Competition results unpublished", {
    ...unpublished.updated,
    certificateSummary: unpublished.certificateSummary
  });
});

const exportCompetitionResultsCsv = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!canReadCompetitionResults({
    auth: req.auth,
    resultStatus: competition.resultStatus,
    legacyResultStatus: competition.legacyResultStatus
  })) {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const enrollmentWhere = await resolveCompetitionResultEnrollmentWhere({
    auth: req.auth
  });

  const baseSelect = {
    id: true,
    enrolledAt: true,
    enrolledLevel: { select: { id: true, name: true, rank: true } },
    competitionCourseLevel: {
      select: {
        levelNumber: true,
        competitionCourse: { select: { code: true, name: true } }
      }
    },
    isTemporary: true,
    rank: true,
    totalScore: true,
    resultCompletionTimeSeconds: true,
    hierarchyNode: { select: { code: true, name: true } },
    sourceTeacherUser: {
      select: {
        username: true,
        teacherProfile: { select: { fullName: true } }
      }
    },
    student: {
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true
      }
    }
  };

  const baseOrderBy = [
    { enrolledLevel: { rank: "asc" } },
    { rank: "asc" },
    { enrolledAt: "asc" }
  ];

  let enrollments;
  try {
    enrollments = await prisma.competitionEnrollment.findMany({
      where: {
        tenantId: req.auth.tenantId,
        competitionId,
        isActive: true,
        approvedAt: { not: null },
        ...enrollmentWhere
      },
      orderBy: baseOrderBy,
      select: baseSelect,
      take: 10000
    });
  } catch (error) {
    const msg = String(error?.message || "").toLowerCase();
    const approvedAtMissing = msg.includes("unknown argument `approvedat`") || msg.includes("unknown field `approvedat`");
    if (!approvedAtMissing) {
      throw error;
    }
    try {
      enrollments = await prisma.competitionEnrollment.findMany({
        where: {
          tenantId: req.auth.tenantId,
          competitionId,
          isActive: true,
          ...enrollmentWhere
        },
        orderBy: baseOrderBy,
        select: baseSelect,
        take: 10000
      });
    } catch (legacyError) {
      const legacyMsg = String(legacyError?.message || "").toLowerCase();
      const enrolledLevelMissing = legacyMsg.includes("unknown argument `enrolledlevel`") || legacyMsg.includes("unknown field `enrolledlevel`");
      if (!enrolledLevelMissing) {
        throw legacyError;
      }

      enrollments = await prisma.competitionEnrollment.findMany({
        where: {
          tenantId: req.auth.tenantId,
          competitionId,
          isActive: true,
          ...enrollmentWhere
        },
        orderBy: [
          { rank: "asc" },
          { enrolledAt: "asc" }
        ],
        select: {
          competitionId: true,
          studentId: true,
          enrolledAt: true,
          rank: true,
          totalScore: true,
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true
            }
          }
        },
        take: 10000
      });
    }
  }

  enrollments.sort((left, right) => {
    const leftLevel = Number(left.enrolledLevel?.rank ?? left.competitionCourseLevel?.levelNumber ?? 0);
    const rightLevel = Number(right.enrolledLevel?.rank ?? right.competitionCourseLevel?.levelNumber ?? 0);
    if (leftLevel !== rightLevel) return leftLevel - rightLevel;
    const leftRank = left.rank === null || left.rank === undefined ? Number.MAX_SAFE_INTEGER : Number(left.rank);
    const rightRank = right.rank === null || right.rank === undefined ? Number.MAX_SAFE_INTEGER : Number(right.rank);
    return leftRank - rightRank;
  });

  const csv = toCsv({
    headers: [
      "competitionId",
      "competitionTitle",
      "resultStatus",
      "participationId",
      "studentId",
      "admissionNo",
      "studentName",
      "studentType",
      "centerCode",
      "centerName",
      "teacherName",
      "course",
      "level",
      "rank",
      "totalScore",
      "completionTimeSeconds",
      "enrolledAt"
    ],
    rows: enrollments.map((e) => [
      competition.id,
      competition.title,
      competition.resultStatus,
      e.id || `${e.competitionId || competition.id}:${e.studentId || e.student?.id || "unknown"}`,
      e.student?.id || e.studentId || "",
      e.student?.admissionNo || "",
      `${e.student?.firstName || ""} ${e.student?.lastName || ""}`.trim(),
      e.isTemporary ? "Temporary" : "Regular",
      e.hierarchyNode?.code || "",
      e.hierarchyNode?.name || "",
      e.sourceTeacherUser?.teacherProfile?.fullName ||
        e.sourceTeacherUser?.username ||
        "",
      e.competitionCourseLevel?.competitionCourse?.name || e.competitionCourseLevel?.competitionCourse?.code || "",
      e.enrolledLevel?.name || "",
      e.rank ?? "",
      e.totalScore !== null && e.totalScore !== undefined ? String(e.totalScore) : "",
      e.resultCompletionTimeSeconds ?? "",
      e.enrolledAt?.toISOString?.() || String(e.enrolledAt)
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=competition_${competition.id}_results.csv`
  );
  return res.status(200).send(csv);
});

async function resolveEnrollmentActorScope({ tx, auth }) {
  if (!["TEACHER", "CENTER"].includes(auth.role)) {
    throw createHttpError(
      403,
      "Only Teacher or Center can add competition enrollments",
      "COMPETITION_ENROLLMENT_ROLE_FORBIDDEN"
    );
  }

  if (auth.role === "TEACHER") {
    const teacher = await tx.teacherProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true,
        status: "ACTIVE"
      },
      select: { hierarchyNodeId: true }
    });
    if (!teacher) {
      throw createHttpError(403, "Active Teacher profile not found", "TEACHER_PROFILE_NOT_FOUND");
    }

    const center = await tx.centerProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        isActive: true,
        authUser: { hierarchyNodeId: teacher.hierarchyNodeId }
      },
      select: {
        id: true,
        franchiseProfileId: true,
        franchiseProfile: {
          select: { businessPartnerId: true, isActive: true }
        }
      }
    });
    if (!center?.franchiseProfile?.isActive) {
      throw createHttpError(409, "Teacher center hierarchy is invalid", "CENTER_SCOPE_INVALID");
    }

    return {
      hierarchyNodeId: teacher.hierarchyNodeId,
      centerProfileId: center.id,
      franchiseProfileId: center.franchiseProfileId,
      businessPartnerId: center.franchiseProfile.businessPartnerId,
      teacherUserId: auth.userId
    };
  }

  const center = await tx.centerProfile.findFirst({
    where: {
      tenantId: auth.tenantId,
      authUserId: auth.userId,
      isActive: true,
      status: "ACTIVE"
    },
    select: {
      id: true,
      franchiseProfileId: true,
      authUser: { select: { hierarchyNodeId: true } },
      franchiseProfile: {
        select: { businessPartnerId: true, isActive: true }
      }
    }
  });
  if (!center?.authUser?.hierarchyNodeId || !center.franchiseProfile?.isActive) {
    throw createHttpError(403, "Active Center profile not found", "CENTER_PROFILE_NOT_FOUND");
  }

  return {
    hierarchyNodeId: center.authUser.hierarchyNodeId,
    centerProfileId: center.id,
    franchiseProfileId: center.franchiseProfileId,
    businessPartnerId: center.franchiseProfile.businessPartnerId,
    teacherUserId: null
  };
}

async function getOrCreateEnrollmentList({
  tx,
  tenantId,
  competitionId,
  hierarchyNodeId,
  actorUserId,
  actorRole
}) {
  const type = actorRole === "TEACHER" ? "TEACHER" : "CENTER_COMBINED";
  const baseScopeKey =
    type === "TEACHER"
      ? `TEACHER:${actorUserId}`
      : `CENTER_COMBINED:${hierarchyNodeId}`;

  const lists = await tx.competitionEnrollmentList.findMany({
    where: {
      tenantId,
      competitionId,
      type,
      hierarchyNodeId,
      ...(type === "TEACHER" ? { teacherUserId: actorUserId } : {}),
      OR: [
        { scopeKey: baseScopeKey },
        { scopeKey: { startsWith: `${baseScopeKey}:REQ:` } }
      ]
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      scopeKey: true,
      type: true,
      status: true,
      locked: true,
      rejectedBy: { select: { role: true } }
    }
  });

  const editableList = lists.find((entry) =>
    !entry.locked &&
    (entry.status === "DRAFT" ||
      (entry.status === "REJECTED" &&
        ((actorRole === "TEACHER" && entry.rejectedBy?.role === "CENTER") ||
          actorRole === "CENTER")))
  );

  if (editableList) return editableList;

  const nextSequence = lists.reduce((highest, entry) => {
    const match = entry.scopeKey.match(/:REQ:(\d+)$/);
    return Math.max(highest, match ? Number(match[1]) : 1);
  }, 0) + 1;
  const scopeKey = `${baseScopeKey}:REQ:${String(nextSequence).padStart(4, "0")}`;

  const list = await tx.competitionEnrollmentList.create({
    data: {
      tenantId,
      competitionId,
      type,
      scopeKey,
      hierarchyNodeId,
      teacherUserId: type === "TEACHER" ? actorUserId : null,
      createdByUserId: actorUserId
    },
    select: {
      id: true,
      scopeKey: true,
      type: true,
      status: true,
      locked: true,
      rejectedBy: { select: { role: true } }
    }
  });

  const editable =
    list.status === "DRAFT" ||
    (list.status === "REJECTED" &&
      ((actorRole === "TEACHER" && list.rejectedBy?.role === "CENTER") ||
        (actorRole === "CENTER" && list.rejectedBy?.role === "FRANCHISE")));

  if (list.locked || !editable) {
    throw createHttpError(
      409,
      "Enrollment list is read-only at its current stage",
      "COMPETITION_LIST_LOCKED"
    );
  }

  return list;
}

async function syncCenterCombinedList({
  tx,
  tenantId,
  competitionId,
  hierarchyNodeId,
  actorUserId
}) {
  const combined = await getOrCreateEnrollmentList({
    tx,
    tenantId,
    competitionId,
    hierarchyNodeId,
    actorUserId,
    actorRole: "CENTER"
  });

  if (combined.locked || !["DRAFT", "REJECTED"].includes(combined.status)) {
    return combined;
  }

  const submittedTeacherItems = await tx.competitionEnrollmentListItem.findMany({
    where: {
      tenantId,
      included: true,
      list: {
        tenantId,
        competitionId,
        hierarchyNodeId,
        type: "TEACHER",
        status: "SUBMITTED_TO_CENTER"
      },
      enrollment: {
        tenantId,
        competitionId,
        hierarchyNodeId,
        isActive: true
      }
    },
    select: { enrollmentId: true }
  });

  const submittedTeacherEnrollmentIds = [
    ...new Set(submittedTeacherItems.map(({ enrollmentId }) => enrollmentId))
  ];

  const alreadyClaimedItems = submittedTeacherEnrollmentIds.length
    ? await tx.competitionEnrollmentListItem.findMany({
        where: {
          tenantId,
          enrollmentId: { in: submittedTeacherEnrollmentIds },
          listId: { not: combined.id },
          list: {
            tenantId,
            competitionId,
            hierarchyNodeId,
            type: "CENTER_COMBINED",
            status: { not: "REJECTED" }
          }
        },
        select: { enrollmentId: true }
      })
    : [];
  const claimedIds = new Set(alreadyClaimedItems.map(({ enrollmentId }) => enrollmentId));
  const eligibleTeacherEnrollmentIds = submittedTeacherEnrollmentIds.filter(
    (enrollmentId) => !claimedIds.has(enrollmentId)
  );

  await tx.competitionEnrollmentListItem.deleteMany({
    where: {
      tenantId,
      listId: combined.id,
      enrollment: {
        sourceTeacherUserId: { not: null },
        ...(eligibleTeacherEnrollmentIds.length > 0
          ? { id: { notIn: eligibleTeacherEnrollmentIds } }
          : {})
      }
    }
  });

  if (eligibleTeacherEnrollmentIds.length > 0) {
    await tx.competitionEnrollmentListItem.createMany({
      data: eligibleTeacherEnrollmentIds.map((enrollmentId) => ({
        tenantId,
        listId: combined.id,
        enrollmentId,
        included: true
      })),
      skipDuplicates: true
    });
  }

  return combined;
}

const enrollStudent = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;
  const studentId = normalizeId(req.body?.studentId);
  const competitionCourseLevelIds = normalizeIdArray(
    req.body?.competitionCourseLevelIds ||
      (req.body?.competitionCourseLevelId
        ? [req.body.competitionCourseLevelId]
        : [])
  );

  if (!studentId) {
    return res.apiError(400, "studentId is required", "STUDENT_ID_REQUIRED");
  }
  if (competitionCourseLevelIds.length < 1) {
    return res.apiError(
      400,
      "At least one competitionCourseLevelId is required",
      "COMPETITION_COURSE_LEVEL_REQUIRED"
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const scope = await resolveEnrollmentActorScope({ tx, auth: req.auth });

    const competition = await tx.competition.findFirst({
      where: {
        id: competitionId,
        tenantId: req.auth.tenantId
      },
      select: {
        id: true,
        status: true,
        enrollmentStartAt: true,
        enrollmentEndAt: true
      }
    });
    if (!competition) {
      throw createHttpError(404, "Competition not found", "COMPETITION_NOT_FOUND");
    }
    assertEnrollmentWindowOpen(competition);

    const student = await tx.student.findFirst({
      where: {
        id: studentId,
        tenantId: req.auth.tenantId,
        hierarchyNodeId: scope.hierarchyNodeId,
        isActive: true,
        ...(req.auth.role === "TEACHER"
          ? { currentTeacherUserId: req.auth.userId }
          : {})
      },
      select: {
        id: true,
        isTemporaryCompetition: true,
        currentTeacherUserId: true
      }
    });
    if (!student) {
      throw createHttpError(
        404,
        "Active student not found in the actor's center/teacher scope",
        "STUDENT_NOT_FOUND"
      );
    }

    const selectedLevels = await tx.competitionCourseLevel.findMany({
      where: {
        tenantId: req.auth.tenantId,
        id: { in: competitionCourseLevelIds },
        isActive: true,
        competitionCourse: {
          is: {
            tenantId: req.auth.tenantId,
            competitionId,
            isActive: true
          }
        }
      },
      select: { id: true, levelId: true }
    });
    if (selectedLevels.length !== competitionCourseLevelIds.length) {
      throw createHttpError(
        400,
        "One or more selected competition levels are invalid",
        "COMPETITION_COURSE_LEVEL_INVALID"
      );
    }

    /* Worksheet mapping is intentionally deferred. A Teacher or Center may
       enroll a student in a Competition level before Superadmin attaches the
       executable worksheet for that level. */
    const worksheetMappings = [];
    /* await tx.competitionWorksheetAssignment.findMany({
      where: {
        tenantId: req.auth.tenantId,
        businessPartnerId: scope.businessPartnerId,
        isActive: true,
        competitionWorksheet: {
          is: {
            tenantId: req.auth.tenantId,
            isActive: true,
            worksheetId: { not: null },
            competitionQuestionBank: {
              is: {
                tenantId: req.auth.tenantId,
                isActive: true,
                competitionCourseLevel: {
                  is: {
                    tenantId: req.auth.tenantId,
                    id: { in: competitionCourseLevelIds },
                    isActive: true,
                    competitionCourse: {
                      is: {
                        tenantId: req.auth.tenantId,
                        competitionId,
                        isActive: true
                      }
                    }
                  }
                }
              }
            },
            worksheet: {
              is: {
                tenantId: req.auth.tenantId,
                isPublished: true
              }
            }
          }
        }
      },
      select: {
        competitionWorksheet: {
          select: {
            worksheetId: true,
            competitionQuestionBank: {
              select: {
                competitionCourseLevelId: true
              }
            }
          }
        }
      }
    }); */

    const mappingCountByLevelId = new Map();
    for (const mapping of worksheetMappings) {
      const levelId =
        mapping.competitionWorksheet?.competitionQuestionBank
          ?.competitionCourseLevelId;
      if (!levelId) continue;
      mappingCountByLevelId.set(
        levelId,
        (mappingCountByLevelId.get(levelId) || 0) + 1
      );
    }

    /* const missingLevelIds = competitionCourseLevelIds.filter(
      (levelId) => !mappingCountByLevelId.has(levelId)
    );
    if (missingLevelIds.length > 0) {
      throw createHttpError(
        409,
        `Executable Competition Worksheet mapping is missing for ${missingLevelIds.length} selected level(s)`,
        "COMPETITION_WORKSHEET_MAPPING_MISSING"
      );
    } */

    /* const ambiguousLevelIds = competitionCourseLevelIds.filter(
      (levelId) => (mappingCountByLevelId.get(levelId) || 0) > 1
    );
    if (ambiguousLevelIds.length > 0) {
      throw createHttpError(
        409,
        `Multiple active Competition Worksheets are mapped to this Business Partner for ${ambiguousLevelIds.length} selected level(s)`,
        "COMPETITION_WORKSHEET_MAPPING_AMBIGUOUS"
      );
    } */

    const alreadySubmitted = await tx.competitionEnrollment.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        competitionId,
        studentId,
        competitionCourseLevelId: { in: selectedLevels.map((level) => level.id) },
        OR: [
          { approvedAt: { not: null } },
          {
            listItems: {
              some: {
                list: {
                  tenantId: req.auth.tenantId,
                  competitionId,
                  status: { not: "REJECTED" }
                }
              }
            }
          }
        ]
      },
      select: { id: true }
    });
    if (alreadySubmitted) {
      throw createHttpError(
        409,
        "One or more selected Student + Competition Level IDs are already submitted",
        "COMPETITION_PARTICIPATION_ALREADY_SUBMITTED"
      );
    }

    const list = await getOrCreateEnrollmentList({
      tx,
      tenantId: req.auth.tenantId,
      competitionId,
      hierarchyNodeId: scope.hierarchyNodeId,
      actorUserId: req.auth.userId,
      actorRole: req.auth.role
    });

    const enrollments = [];
    for (const selectedLevel of selectedLevels) {
      const enrollmentKey = {
        tenantId: req.auth.tenantId,
        competitionId,
        studentId,
        competitionCourseLevelId: selectedLevel.id
      };

      const existingEnrollment = await tx.competitionEnrollment.findUnique({
        where: {
          tenantId_competitionId_studentId_competitionCourseLevelId:
            enrollmentKey
        },
        select: {
          sourceTeacherUserId: true,
          approvedAt: true,
          listItems: {
            where: {
              list: {
                tenantId: req.auth.tenantId,
                competitionId,
                status: { not: "REJECTED" }
              }
            },
            select: { listId: true },
            take: 1
          }
        }
      });

      if (existingEnrollment?.approvedAt || existingEnrollment?.listItems?.length) {
        throw createHttpError(
          409,
          "This student and Competition Level is already present in an earlier request",
          "COMPETITION_PARTICIPATION_ALREADY_SUBMITTED"
        );
      }

      const sourceTeacherUserId =
        req.auth.role === "CENTER"
          ? null
          : existingEnrollment
            ? existingEnrollment.sourceTeacherUserId
            : req.auth.userId;

      const enrollmentData = {
        enrolledLevelId: selectedLevel.levelId,
        hierarchyNodeId: scope.hierarchyNodeId,
        sourceTeacherUserId,
        isTemporary: student.isTemporaryCompetition,
        isActive: true
      };

      const enrollment = await tx.competitionEnrollment.upsert({
        where: {
          tenantId_competitionId_studentId_competitionCourseLevelId:
            enrollmentKey
        },
        update: enrollmentData,
        create: {
          ...enrollmentKey,
          createdByUserId: req.auth.userId,
          ...enrollmentData
        }
      });

      await tx.competitionEnrollmentListItem.upsert({
        where: {
          listId_enrollmentId: {
            listId: list.id,
            enrollmentId: enrollment.id
          }
        },
        update: { included: true, exclusionReason: null },
        create: {
          tenantId: req.auth.tenantId,
          listId: list.id,
          enrollmentId: enrollment.id,
          included: true
        }
      });

      enrollments.push(enrollment);
    }

    return {
      listId: list.id,
      studentId,
      participationCount: enrollments.length,
      enrollments
    };
  });

  return res.apiSuccess("Student competition levels enrolled", result, 201);
});

async function resolveListScopeWhere({ tx, auth, competitionId }) {
  if (auth.role === "SUPERADMIN") {
    return { tenantId: auth.tenantId, competitionId };
  }

  if (auth.role === "TEACHER") {
    return {
      tenantId: auth.tenantId,
      competitionId,
      type: "TEACHER",
      teacherUserId: auth.userId
    };
  }

  if (auth.role === "CENTER") {
    const center = await tx.centerProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true
      },
      select: { authUser: { select: { hierarchyNodeId: true } } }
    });
    if (!center?.authUser?.hierarchyNodeId) {
      throw createHttpError(403, "Center profile not found", "CENTER_PROFILE_NOT_FOUND");
    }
    return {
      tenantId: auth.tenantId,
      competitionId,
      hierarchyNodeId: center.authUser.hierarchyNodeId
    };
  }

  let centerWhere;
  if (auth.role === "FRANCHISE") {
    const franchise = await tx.franchiseProfile.findFirst({
      where: {
        tenantId: auth.tenantId,
        authUserId: auth.userId,
        isActive: true
      },
      select: { id: true }
    });
    if (!franchise) {
      throw createHttpError(403, "Franchise profile not found", "FRANCHISE_PROFILE_NOT_FOUND");
    }
    centerWhere = { franchiseProfileId: franchise.id };
  } else if (auth.role === "BP") {
    const partner = await resolveBusinessPartnerForUser({
      tenantId: auth.tenantId,
      userId: auth.userId,
      tx
    });
    if (!partner) {
      throw createHttpError(403, "Business Partner profile not found", "BP_PROFILE_NOT_FOUND");
    }

    const partnerScope = await resolveBusinessPartnerScope({
      tenantId: auth.tenantId,
      userId: auth.userId,
      tx
    });
    const scopedCenterIds = Array.isArray(partnerScope?.centerIds)
      ? partnerScope.centerIds.filter(Boolean)
      : [];

    centerWhere = {
      id: {
        in: scopedCenterIds.length ? scopedCenterIds : ["__NO_CENTER__"]
      }
    };
  } else {
    throw createHttpError(
      403,
      "Role cannot view competition enrollment lists",
      "COMPETITION_LIST_FORBIDDEN"
    );
  }

  const centers = await tx.centerProfile.findMany({
    where: {
      tenantId: auth.tenantId,
      isActive: true,
      ...centerWhere
    },
    select: { authUser: { select: { hierarchyNodeId: true } } }
  });

  return {
    tenantId: auth.tenantId,
    competitionId,
    hierarchyNodeId: {
      in: centers
        .map((center) => center.authUser?.hierarchyNodeId)
        .filter(Boolean)
    }
  };
}

async function assertCompetitionVisible({ auth, competitionId }) {
  const visibilityWhere = await buildCompetitionVisibilityWhere({
    auth,
    extraWhere: { id: competitionId }
  });
  const competition = await prisma.competition.findFirst({
    where: visibilityWhere,
    select: { id: true }
  });
  if (!competition) {
    throw createHttpError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }
}

async function assertListBelongsCompetition({ tenantId, competitionId, listId }) {
  const list = await prisma.competitionEnrollmentList.findFirst({
    where: { id: listId, tenantId, competitionId },
    select: { id: true }
  });
  if (!list) {
    throw createHttpError(
      404,
      "Competition enrollment list not found",
      "COMPETITION_LIST_NOT_FOUND"
    );
  }
}

const listCompetitionEnrollmentLists = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;
  await assertCompetitionVisible({ auth: req.auth, competitionId });

  if (!prisma.competitionEnrollmentList) {
    return res.apiSuccess("Competition enrollment lists fetched", []);
  }

  const where = await resolveListScopeWhere({
    tx: prisma,
    auth: req.auth,
    competitionId
  });

  if (req.auth.role === "CENTER") {
    await syncCenterCombinedList({
      tx: prisma,
      tenantId: req.auth.tenantId,
      competitionId,
      hierarchyNodeId: where.hierarchyNodeId,
      actorUserId: req.auth.userId
    });
  }

  const lists = await prisma.competitionEnrollmentList.findMany({
    where,
    orderBy: [{ hierarchyNodeId: "asc" }, { type: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      scopeKey: true,
      hierarchyNodeId: true,
      teacherUserId: true,
      status: true,
      locked: true,
      submittedAt: true,
      forwardedAt: true,
      approvedAt: true,
      approvalMode: true,
      quotaEvaluatedAt: true,
      waitingReason: true,
      rejectedAt: true,
      rejectedRemark: true,
      rejectedBy: { select: { role: true } },
      centerNode: { select: { id: true, code: true, name: true } },
      teacherUser: {
        select: {
          id: true,
          email: true,
          teacherProfile: { select: { fullName: true } }
        }
      },
      _count: {
        select: { items: true }
      },
      items: {
        select: {
          included: true,
          enrollment: {
            select: {
              studentId: true,
              competitionCourseLevelId: true
            }
          }
        }
      }
    }
  });

  const summarizedLists = lists.map(({ items, ...list }) => ({
    ...list,
    participantStudentIds: [
      ...new Set(
        items
          .map((item) => item?.enrollment?.studentId)
          .filter(Boolean)
      )
    ],
    participantStudentLevelKeys: [
      ...new Set(
        items
          .map((item) => {
            const studentId = item?.enrollment?.studentId;
            const levelId = item?.enrollment?.competitionCourseLevelId;
            return studentId && levelId ? `${studentId}:${levelId}` : null;
          })
          .filter(Boolean)
      )
    ],
    itemCounts: {
      total: items.length,
      included: items.filter((item) => item.included).length,
      excluded: items.filter((item) => !item.included).length
    }
  }));

  return res.apiSuccess("Competition enrollment lists fetched", summarizedLists);
});

const getCompetitionEnrollmentList = asyncHandler(async (req, res) => {
  const { id: competitionId, listId } = req.params;
  await assertCompetitionVisible({ auth: req.auth, competitionId });
  const scopeWhere = await resolveListScopeWhere({
    tx: prisma,
    auth: req.auth,
    competitionId
  });

  const list = await prisma.competitionEnrollmentList.findFirst({
    where: { ...scopeWhere, id: listId },
    select: {
      id: true,
      type: true,
      scopeKey: true,
      hierarchyNodeId: true,
      teacherUserId: true,
      status: true,
      locked: true,
      submittedAt: true,
      forwardedAt: true,
      approvedAt: true,
      approvalMode: true,
      quotaEvaluatedAt: true,
      waitingReason: true,
      rejectedAt: true,
      rejectedRemark: true,
      rejectedBy: { select: { role: true } },
      centerNode: { select: { id: true, code: true, name: true } },
      teacherUser: {
        select: {
          id: true,
          email: true,
          teacherProfile: { select: { fullName: true } }
        }
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          included: true,
          exclusionReason: true,
          enrollment: {
            select: {
              id: true,
              studentId: true,
              isTemporary: true,
              isActive: true,
              approvedAt: true,
              attemptLimitOverride: true,
              extraAttemptGrantedAt: true,
              extraAttemptReason: true,
              rank: true,
              totalScore: true,
              enrolledAt: true,
              sourceTeacherUserId: true,
              student: {
                select: {
                  id: true,
                  admissionNo: true,
                  firstName: true,
                  lastName: true
                }
              },
              competitionCourseLevel: {
                select: {
                  id: true,
                  levelId: true,
                  levelNumber: true,
                  level: { select: { id: true, name: true, rank: true } },
                  competitionCourse: {
                    select: { id: true, code: true, name: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  if (!list) {
    return res.apiError(
      404,
      "Competition enrollment list not found",
      "COMPETITION_LIST_NOT_FOUND"
    );
  }

  const normalizedItems = list.items.map((item) => {
    const mapping = item.enrollment?.competitionCourseLevel;
    if (!mapping) return item;

    return {
      ...item,
      enrollment: {
        ...item.enrollment,
        competitionCourseLevel: {
          ...mapping,
          // Preserve the response shape already consumed by the existing
          // BP/Franchise/Center/Teacher Competition pages without querying
          // the removed generic CourseLevel relation.
          courseLevel: {
            id: mapping.id,
            levelNumber: mapping.levelNumber,
            title: mapping.level?.name || null,
            course: mapping.competitionCourse
          }
        }
      }
    };
  });

  const includedCount = normalizedItems.filter((item) => item.included).length;
  return res.apiSuccess("Competition enrollment list fetched", {
    ...list,
    items: normalizedItems,
    includedCount,
    excludedCount: normalizedItems.length - includedCount
  });
});

const forwardEnrollmentList = asyncHandler(async (req, res) => {
  const { id: competitionId, listId } = req.params;
  await assertListBelongsCompetition({
    tenantId: req.auth.tenantId,
    competitionId,
    listId
  });

  if (req.auth.role === "CENTER") {
    const scope = await resolveEnrollmentActorScope({ tx: prisma, auth: req.auth });
    await syncCenterCombinedList({
      tx: prisma,
      tenantId: req.auth.tenantId,
      competitionId,
      hierarchyNodeId: scope.hierarchyNodeId,
      actorUserId: req.auth.userId
    });
  }

  const result = await forwardCompetitionEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_ENROLLMENT_LIST_FORWARD",
    entityType: "COMPETITION_ENROLLMENT_LIST",
    entityId: listId,
    metadata: {
      competitionId,
      from: result.fromStatus,
      to: result.toStatus,
      includedCount: result.includedCount
    }
  });

  return res.apiSuccess("Competition enrollment list forwarded", result);
});

const returnEnrollmentList = asyncHandler(async (req, res) => {
  const { id: competitionId, listId } = req.params;
  await assertListBelongsCompetition({
    tenantId: req.auth.tenantId,
    competitionId,
    listId
  });
  const result = await returnCompetitionEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role,
    remark: req.body?.reason ?? req.body?.remark
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_ENROLLMENT_LIST_RETURN",
    entityType: "COMPETITION_ENROLLMENT_LIST",
    entityId: listId,
    metadata: {
      competitionId,
      from: result.fromStatus,
      to: result.toStatus
    }
  });

  return res.apiSuccess("Competition enrollment list returned", result);
});

const updateEnrollmentInclusion = asyncHandler(async (req, res) => {
  const { id: competitionId, listId, enrollmentId } = req.params;
  await assertListBelongsCompetition({
    tenantId: req.auth.tenantId,
    competitionId,
    listId
  });
  const result = await setCompetitionEnrollmentInclusion({
    tenantId: req.auth.tenantId,
    listId,
    enrollmentId,
    included: req.body?.included,
    reason: req.body?.reason,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: req.body?.included
      ? "COMPETITION_ENROLLMENT_INCLUDE"
      : "COMPETITION_ENROLLMENT_EXCLUDE",
    entityType: "COMPETITION_ENROLLMENT",
    entityId: enrollmentId,
    metadata: { competitionId, listId, reason: req.body?.reason || null }
  });

  return res.apiSuccess("Competition participation selection updated", result);
});

const approveEnrollmentList = asyncHandler(async (req, res) => {
  const { id: competitionId, listId } = req.params;
  await assertListBelongsCompetition({
    tenantId: req.auth.tenantId,
    competitionId,
    listId
  });
  const result = await approveCompetitionEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_ENROLLMENT_LIST_APPROVE",
    entityType: "COMPETITION_ENROLLMENT_LIST",
    entityId: listId,
    metadata: {
      competitionId,
      approvedParticipationCount: result.approvedParticipationCount
    }
  });

  return res.apiSuccess("Competition enrollment list approved", result);
});

const listCompetitionQuotas = asyncHandler(async (req, res) => {
  const quotas = await listCompetitionBusinessPartnerQuotas({
    tenantId: req.auth.tenantId,
    competitionId: req.params.id
  });
  return res.apiSuccess("Competition Business Partner quotas fetched", quotas);
});

const updateCompetitionQuota = asyncHandler(async (req, res) => {
  const quota = await setCompetitionBusinessPartnerQuota({
    tenantId: req.auth.tenantId,
    competitionId: req.params.id,
    businessPartnerId: req.params.businessPartnerId,
    quotaLimit: req.body?.quotaLimit,
    reason: req.body?.reason,
    actorUserId: req.auth.userId
  });
  const reprocessed = await reprocessCompetitionQuotaRequests({
    tenantId: req.auth.tenantId,
    competitionId: req.params.id,
    businessPartnerId: req.params.businessPartnerId,
    actorUserId: req.auth.userId
  });
  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_BP_QUOTA_UPDATE",
    entityType: "COMPETITION_BP_QUOTA",
    entityId: quota.id,
    metadata: {
      competitionId: req.params.id,
      businessPartnerId: req.params.businessPartnerId,
      quotaLimit: quota.quotaLimit,
      reason: quota.lastChangeReason
    }
  });
  return res.apiSuccess("Competition Business Partner quota saved", { ...quota, reprocessed });
});

const reprocessCompetitionQuota = asyncHandler(async (req, res) => {
  const { id: competitionId, businessPartnerId } = req.params;
  const quota = await prisma.competitionBusinessPartnerQuota.findUnique({
    where: {
      tenantId_competitionId_businessPartnerId: {
        tenantId: req.auth.tenantId,
        competitionId,
        businessPartnerId
      }
    },
    select: { id: true }
  });
  if (!quota) {
    throw createHttpError(404, "Competition quota is not configured for this Business Partner", "COMPETITION_QUOTA_NOT_FOUND");
  }
  const results = await reprocessCompetitionQuotaRequests({
    tenantId: req.auth.tenantId,
    competitionId,
    businessPartnerId,
    actorUserId: req.auth.userId
  });
  const summary = results.reduce((value, item) => {
    if (item.outcome === "APPROVED") value.approved += 1;
    else if (item.outcome === "WAITING_FOR_QUOTA") value.waiting += 1;
    else value.failed += 1;
    return value;
  }, { processed: results.length, approved: 0, waiting: 0, failed: 0 });
  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_BP_QUOTA_REPROCESS",
    entityType: "COMPETITION_BP_QUOTA",
    entityId: quota.id,
    metadata: { competitionId, businessPartnerId, ...summary }
  });
  return res.apiSuccess("Waiting enrollment lists reprocessed", { ...summary, results });
});

const grantCompetitionExtraAttempt = asyncHandler(async (req, res) => {
  const competitionId = normalizeId(req.params.id);
  const enrollmentId = normalizeId(req.params.enrollmentId);
  const reason = String(req.body?.reason || "").trim();

  if (!competitionId || !enrollmentId) {
    throw createHttpError(400, "Competition and participation IDs are required", "VALIDATION_ERROR");
  }
  if (reason.length < 3) {
    throw createHttpError(400, "Reason is required to grant an extra attempt", "EXTRA_ATTEMPT_REASON_REQUIRED");
  }

  const result = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.competitionEnrollment.findFirst({
      where: {
        id: enrollmentId,
        tenantId: req.auth.tenantId,
        competitionId,
        isActive: true,
        approvedAt: { not: null }
      },
      select: {
        id: true,
        studentId: true,
        competitionCourseLevelId: true,
        attemptLimitOverride: true,
        competition: { select: { attemptLimit: true, resultStatus: true } }
      }
    });

    if (!enrollment) {
      throw createHttpError(404, "Approved Competition participation not found", "COMPETITION_PARTICIPATION_NOT_FOUND");
    }
    if (enrollment.competition?.resultStatus === "PUBLISHED") {
      throw createHttpError(
        409,
        "Extra attempts cannot be granted after results are published",
        "COMPETITION_RESULTS_ALREADY_PUBLISHED"
      );
    }

    const baseLimit = Math.max(1, Number(enrollment.competition?.attemptLimit || 1));
    const currentLimit = Math.max(baseLimit, Number(enrollment.attemptLimitOverride || baseLimit));
    const nextLimit = currentLimit + 1;

    const updated = await tx.competitionEnrollment.update({
      where: { id: enrollment.id },
      data: {
        attemptLimitOverride: nextLimit,
        extraAttemptGrantedAt: new Date(),
        extraAttemptGrantedByUserId: req.auth.userId,
        extraAttemptReason: reason
      },
      select: {
        id: true,
        studentId: true,
        competitionCourseLevelId: true,
        attemptLimitOverride: true,
        extraAttemptGrantedAt: true,
        extraAttemptReason: true
      }
    });

    return { ...updated, previousAttemptLimit: currentLimit };
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_EXTRA_ATTEMPT_GRANT",
    entityType: "COMPETITION_ENROLLMENT",
    entityId: enrollmentId,
    metadata: {
      competitionId,
      studentId: result.studentId,
      competitionCourseLevelId: result.competitionCourseLevelId,
      previousAttemptLimit: result.previousAttemptLimit,
      newAttemptLimit: result.attemptLimitOverride,
      reason
    }
  });

  return res.apiSuccess("Extra Competition attempt granted", result);
});

export {
  listCompetitions,
  getCompetitionDetail,
  createCompetition,
  updateCompetitionSchedule,
  forwardCompetitionRequest,
  rejectCompetitionRequest,
  getLeaderboard,
  getCompetitionResults,
  publishCompetitionResults,
  unpublishCompetitionResults,
  exportCompetitionResultsCsv,
  enrollStudent,
  listCompetitionEnrollmentLists,
  getCompetitionEnrollmentList,
  forwardEnrollmentList,
  returnEnrollmentList,
  updateEnrollmentInclusion,
  approveEnrollmentList
  ,listCompetitionQuotas
  ,updateCompetitionQuota
  ,reprocessCompetitionQuota
  ,grantCompetitionExtraAttempt
};
