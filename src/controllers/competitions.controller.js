import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAudit } from "../utils/audit.js";
import { getAwardTypeForRank, getCompetitionLeaderboard } from "../services/competition-leaderboard.service.js";
import { buildCertificateBrandingSnapshotForStudent } from "../services/branding.service.js";
import {
  notifyCenterRequestedCompetitionUnlock,
  notifyCompetitionCreated,
  notifyCompetitionForwarded,
  notifyCompetitionRejected,
  notifyCenterSubmittedCompetitionRegistration
} from "../services/competition-notification.service.js";
import { assertCanModifyOperational } from "../services/ownership-guard.service.js";
import {
  transitionForward,
  transitionReject
} from "../services/competition-workflow.service.js";
import { parsePagination } from "../utils/pagination.js";
import { recordCompetitionTransaction } from "../services/financial-ledger.service.js";
import { toCsv } from "../utils/csv.js";
import { resolveBusinessPartnerForUser } from "../services/bp-scope.service.js";
import { hashPassword } from "../utils/password.js";
import { generateUsername } from "../utils/username-generator.js";

const COMPETITION_TEMP_STUDENT_IDEMPOTENCY_ACTION = "competition-temporary-student-create";

function stableJsonStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(",")}}`;
}

function hashIdempotencyPayload(payload) {
  return crypto.createHash("sha256").update(stableJsonStringify(payload)).digest("hex");
}

function makeCompetitionTemporaryStudentIdempotencyScope({ competitionId, centerUserId }) {
  return `/competitions/${competitionId}/temporary-students/${centerUserId}`;
}

function buildIdempotencySuccessBody(message, data) {
  return {
    success: true,
    message,
    data,
    error_code: null
  };
}

function buildIdempotencyError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function isCompetitionResultStatusSchemaMissing(error) {
  const msg = String(error?.message || "").toLowerCase();
  return error?.code === "P2022" || msg.includes("resultstatus") || msg.includes("resultpublishedat");
}

function buildCompetitionSelect({ includeResultMeta = true, includeStageTransitions = false } = {}) {
  const select = {
    id: true,
    tenantId: true,
    title: true,
    description: true,
    code: true,
    status: true,
    workflowStage: true,
    rejectedAt: true,
    rejectedByUserId: true,
    registrationStartsAt: true,
    registrationEndsAt: true,
    startsAt: true,
    endsAt: true,
    hierarchyNodeId: true,
    levelId: true,
    competitionCourseId: true,
    createdByUserId: true,
    createdAt: true,
    updatedAt: true,
    hierarchyNode: { select: { id: true, name: true, type: true, code: true } },
    level: { select: { id: true, name: true, rank: true } },
    template: { select: { id: true, name: true, slug: true } },
    competitionCourse: {
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        levels: {
          orderBy: [{ sortOrder: "asc" }, { levelNumber: "asc" }],
          select: {
            id: true,
            levelNumber: true,
            title: true,
            description: true,
            sortOrder: true,
            isActive: true
          }
        }
      }
    },
    createdBy: { select: { id: true, email: true, role: true } },
    enrollments: { select: { studentId: true, rank: true, totalScore: true, enrolledAt: true } },
    worksheets: { select: { worksheetId: true, assignedAt: true } },
    businessPartnerMappings: {
      select: {
        businessPartnerId: true,
        status: true,
        businessPartner: { select: { id: true, name: true, code: true } }
      }
    }
  };

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

function normalizeIdList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function generateCertificateNumber() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CERT-${day}-${rand}`;
}

function buildCompetitionCertificateMetadata({
  competition,
  competitionCourseLevel,
  leaderboardRow,
  brandingSnapshot,
  generatedAt,
  publishedAt = null,
  publishedByUserId = null
}) {
  return {
    certificateKind: "COMPETITION_AWARD",
    competition: {
      id: competition.id,
      title: competition.title,
      code: competition.code,
      courseId: competition.competitionCourseId || null,
      courseCode: competition.competitionCourse?.code || null,
      courseName: competition.competitionCourse?.name || null,
      level: competitionCourseLevel
        ? {
            id: competitionCourseLevel.id,
            levelNumber: competitionCourseLevel.levelNumber,
            title: competitionCourseLevel.title
          }
        : null,
      rank: leaderboardRow.rank,
      awardType: leaderboardRow.awardType || getAwardTypeForRank(leaderboardRow.rank),
      score: leaderboardRow.earnedMarks ?? null,
      percentage: leaderboardRow.percentage ?? null,
      completionDate: leaderboardRow.submittedAt || null,
      finalizedAt: leaderboardRow.awardFinalizedAt || null
    },
    brandingSnapshot: brandingSnapshot || null,
    publication: {
      generatedAt: generatedAt ? new Date(generatedAt).toISOString() : null,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
      publishedByUserId: publishedByUserId || null
    }
  };
}

async function findCompetitionsWithResultFallback({ where, orderBy, skip, take }) {
  try {
    return {
      items: await prisma.competition.findMany({
        where,
        orderBy,
        skip,
        take,
        select: buildCompetitionSelect({ includeResultMeta: true })
      }),
      legacyResultStatus: false
    };
  } catch (error) {
    if (!isCompetitionResultStatusSchemaMissing(error)) {
      throw error;
    }

    const items = await prisma.competition.findMany({
      where,
      orderBy,
      skip,
      take,
      select: buildCompetitionSelect({ includeResultMeta: false })
    });

    return {
      items: items.map(applyLegacyCompetitionResultMeta),
      legacyResultStatus: true
    };
  }
}

async function findCompetitionDetailWithResultFallback(where) {
  try {
    return await prisma.competition.findFirst({
      where,
      select: buildCompetitionSelect({ includeResultMeta: true, includeStageTransitions: true })
    });
  } catch (error) {
    if (!isCompetitionResultStatusSchemaMissing(error)) {
      throw error;
    }

    const item = await prisma.competition.findFirst({
      where,
      select: buildCompetitionSelect({ includeResultMeta: false, includeStageTransitions: true })
    });

    return applyLegacyCompetitionResultMeta(item);
  }
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
      where: { tenantId: auth.tenantId, authUserId: auth.userId },
      select: { businessPartnerId: true }
    });
    return profile?.businessPartnerId || null;
  }

  if (auth.role === "CENTER") {
    const profile = await tx.centerProfile.findFirst({
      where: { tenantId: auth.tenantId, authUserId: auth.userId },
      select: { franchiseProfile: { select: { businessPartnerId: true } } }
    });
    return profile?.franchiseProfile?.businessPartnerId || null;
  }

  return null;
}

async function resolveCenterCompetitionScope({ auth, tx = prisma } = {}) {
  if (!auth?.tenantId || !auth?.userId || auth.role !== "CENTER") {
    return { centerHierarchyNodeId: null, franchiseHierarchyNodeId: null, businessPartnerId: null };
  }

  const centerProfile = await tx.centerProfile.findFirst({
    where: {
      tenantId: auth.tenantId,
      authUserId: auth.userId,
      isActive: true
    },
    select: {
      authUser: { select: { hierarchyNodeId: true } },
      franchiseProfile: {
        select: {
          businessPartnerId: true,
          authUser: { select: { hierarchyNodeId: true } }
        }
      }
    }
  });

  return {
    centerHierarchyNodeId: auth.hierarchyNodeId || centerProfile?.authUser?.hierarchyNodeId || null,
    franchiseHierarchyNodeId: centerProfile?.franchiseProfile?.authUser?.hierarchyNodeId || null,
    businessPartnerId: centerProfile?.franchiseProfile?.businessPartnerId || null
  };
}

function resolveCompetitionRegistrationStudentId({ registrationId }) {
  if (!registrationId) {
    return null;
  }

  if (typeof registrationId === "string" && registrationId.includes(":")) {
    const [, studentId] = registrationId.split(":", 2);
    return studentId || null;
  }

  return String(registrationId);
}

async function buildCompetitionVisibilityWhere({ auth, extraWhere = {} } = {}) {
  const tenantWhere = { tenantId: auth.tenantId, ...extraWhere };

  if (!auth || auth.role === "SUPERADMIN") {
    return tenantWhere;
  }

  if (auth.role === "BP") {
    const businessPartnerId = await resolveActorBusinessPartnerId({ auth });
    if (!businessPartnerId) {
      return { ...tenantWhere, id: { in: [] } };
    }

    return {
      ...tenantWhere,
      businessPartnerMappings: {
        some: {
          businessPartnerId,
          status: "APPROVED"
        }
      }
    };
  }

  if (auth.role === "FRANCHISE" || auth.role === "CENTER") {
    const businessPartnerId = await resolveActorBusinessPartnerId({ auth });

    if (auth.role === "CENTER") {
      const centerScope = await resolveCenterCompetitionScope({ auth });
      const centerHierarchyNodeIds = [
        centerScope.centerHierarchyNodeId,
        centerScope.franchiseHierarchyNodeId
      ].filter(Boolean);

      const centerVisibility = {
        ...tenantWhere,
        OR: []
      };

      if (centerHierarchyNodeIds.length) {
        centerVisibility.OR.push({
          hierarchyNodeId: { in: [...new Set(centerHierarchyNodeIds)] }
        });
      }

      if (centerScope.businessPartnerId) {
        centerVisibility.OR.push({
          businessPartnerMappings: {
            some: {
              businessPartnerId: centerScope.businessPartnerId
            }
          }
        });
      }

      if (centerVisibility.OR.length) {
        return centerVisibility;
      }
    }

    if (businessPartnerId && auth.hierarchyNodeId) {
      return {
        ...tenantWhere,
        OR: [
          { hierarchyNodeId: auth.hierarchyNodeId },
          {
            businessPartnerMappings: {
              some: {
                businessPartnerId,
                status: "APPROVED"
              }
            }
          }
        ]
      };
    }
  }

  if (auth.hierarchyNodeId) {
    return { ...tenantWhere, hierarchyNodeId: auth.hierarchyNodeId };
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

async function validateCompetitionRegistrationAccess({ tx, competitionId, tenantId, actorAuth, studentId, selectedLevelId }) {
  const competition = await tx.competition.findFirst({
    where: { id: competitionId, tenantId },
    select: {
      id: true,
      title: true,
      status: true,
      workflowStage: true,
      hierarchyNodeId: true,
      registrationStartsAt: true,
      registrationEndsAt: true,
      businessPartnerMappings: {
        where: { status: "APPROVED" },
        select: { businessPartnerId: true }
      }
    }
  });

  if (!competition) {
    const error = new Error("Competition not found");
    error.statusCode = 404;
    error.errorCode = "COMPETITION_NOT_FOUND";
    throw error;
  }

  if (actorAuth.role === "BP") {
    const businessPartnerId = await resolveActorBusinessPartnerId({ auth: actorAuth, tx });
    const isMapped = businessPartnerId
      ? competition.businessPartnerMappings.some((mapping) => mapping.businessPartnerId === businessPartnerId)
      : false;

    if (!isMapped) {
      const error = new Error("Business partner is not authorized for this competition");
      error.statusCode = 403;
      error.errorCode = "BP_COMPETITION_ACCESS_DENIED";
      throw error;
    }
  }

  if (competition.workflowStage !== "APPROVED") {
    const error = new Error("Competition is not approved for registration");
    error.statusCode = 400;
    error.errorCode = "COMPETITION_NOT_APPROVED";
    throw error;
  }

  if (!(["SCHEDULED", "ACTIVE"].includes(competition.status))) {
    const error = new Error("Competition is not open for registration");
    error.statusCode = 400;
    error.errorCode = "REGISTRATION_NOT_OPEN";
    throw error;
  }

  const now = new Date();
  if (competition.registrationStartsAt && now < competition.registrationStartsAt) {
    const error = new Error("Competition registration has not started yet");
    error.statusCode = 400;
    error.errorCode = "REGISTRATION_NOT_OPEN";
    throw error;
  }

  if (competition.registrationEndsAt && now > competition.registrationEndsAt) {
    const error = new Error("Competition registration period has ended");
    error.statusCode = 400;
    error.errorCode = "REGISTRATION_CLOSED";
    throw error;
  }

  const student = await tx.student.findFirst({
    where: {
      id: studentId,
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      levelId: true,
      hierarchyNodeId: true
    }
  });

  if (!student) {
    const error = new Error("Student not found");
    error.statusCode = 404;
    error.errorCode = "STUDENT_NOT_FOUND";
    throw error;
  }

  if (!selectedLevelId || !String(selectedLevelId).trim()) {
    const error = new Error("levelId is required");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  const normalizedLevelId = String(selectedLevelId).trim();
  const levelExists = await tx.level.findUnique({
    where: { id: normalizedLevelId },
    select: { id: true }
  });

  if (!levelExists) {
    const error = new Error("Level not found");
    error.statusCode = 400;
    error.errorCode = "LEVEL_NOT_FOUND";
    throw error;
  }

  return { competition, student, levelId: normalizedLevelId };
}

const listCompetitions = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);
  const q = typeof req.query?.q === "string" ? req.query.q.trim() : "";
  const status = typeof req.query?.status === "string" ? req.query.status.trim().toUpperCase() : "";

  let where = await buildCompetitionVisibilityWhere({ auth: req.auth });

  if (req.auth?.role === "CENTER") {
    where = {
      AND: [
        where,
        {
          status: { in: ["SCHEDULED", "ACTIVE"] }
        }
      ]
    };
  }

  if (q) {
    where = {
      AND: [
        where,
        {
          OR: [
            { title: { contains: q } },
            { code: { contains: q } },
            { competitionCourse: { is: { name: { contains: q } } } }
          ]
        }
      ]
    };
  }

  if (status && status !== "ALL") {
    where = {
      AND: [
        where,
        {
          status
        }
      ]
    };
  }

  const [{ items, legacyResultStatus }, total] = await Promise.all([
    findCompetitionsWithResultFallback({ where, orderBy, skip, take }),
    prisma.competition.count({ where })
  ]);

  let centerSubmissionByCompetitionId = new Map();
  let centerEnrollmentByCompetitionId = new Map();

  if (req.auth?.role === "CENTER" && req.auth?.hierarchyNodeId && items.length) {
    const competitionIds = items.map((item) => item.id);
    const [submissions, enrollments] = await Promise.all([
      prisma.competitionCenterSubmission.findMany({
        where: {
          tenantId: req.auth.tenantId,
          competitionId: { in: competitionIds },
          centerId: req.auth.hierarchyNodeId
        },
        orderBy: [{ submittedAt: "desc" }],
        select: {
          competitionId: true,
          status: true,
          remark: true,
          submittedAt: true
        }
      }),
      prisma.competitionEnrollment.findMany({
        where: {
          tenantId: req.auth.tenantId,
          competitionId: { in: competitionIds },
          isActive: true,
          student: {
            hierarchyNodeId: req.auth.hierarchyNodeId
          }
        },
        select: {
          competitionId: true,
          student: {
            select: {
              isTemporaryExam: true
            }
          }
        }
      })
    ]);

    centerSubmissionByCompetitionId = new Map();
    for (const row of submissions) {
      const list = centerSubmissionByCompetitionId.get(row.competitionId) || [];
      list.push(row);
      centerSubmissionByCompetitionId.set(row.competitionId, list);
    }

    centerEnrollmentByCompetitionId = new Map();
    for (const row of enrollments) {
      const list = centerEnrollmentByCompetitionId.get(row.competitionId) || [];
      list.push(row);
      centerEnrollmentByCompetitionId.set(row.competitionId, list);
    }
  }

  const centerWorkflowState = (submissions) => {
    const latest = submissions?.[0] || null;
    if (!latest) return "CENTER_REVIEW";
    const latestStatus = String(latest.status || "").toUpperCase();
    if (latestStatus === "REOPENED" || latestStatus === "RETURNED") return "RETURNED";
    if (latestStatus === "APPROVED") return "APPROVED";
    if (latestStatus === "SUBMITTED") return "CENTER_SUBMITTED";
    return "CENTER_REVIEW";
  };

  const competitionItems = req.auth?.role === "CENTER"
    ? items.map((item) => {
        const submissions = centerSubmissionByCompetitionId.get(item.id) || [];
        const enrollments = centerEnrollmentByCompetitionId.get(item.id) || [];
        const latest = submissions[0] || null;
        const latestRemark = latest?.remark || null;
        const counts = submissions.reduce(
          (acc, row) => {
            const key = String(row.status || "").toUpperCase();
            if (key === "APPROVED") acc.approved += 1;
            if (key === "REOPENED") acc.reopened += 1;
            if (key === "RETURNED") acc.returned += 1;
            if (key === "SUBMITTED") acc.submitted += 1;
            return acc;
          },
          { approved: 0, reopened: 0, returned: 0, submitted: 0 }
        );

        return {
          ...item,
          centerWorkflowState: centerWorkflowState(submissions),
          centerSubmissionStatus: latest?.status || null,
          centerSubmissionRemark: latestRemark,
          centerSubmittedAt: latest?.submittedAt || null,
          registeredStudentsCount: enrollments.length,
          temporaryStudentCount: enrollments.filter((row) => row.student?.isTemporaryExam).length,
          approvedSubmissionCount: counts.approved,
          rejectedSubmissionCount: counts.reopened,
          returnedSubmissionCount: counts.returned,
          submittedSubmissionCount: counts.submitted
        };
      })
    : items;

  res.setHeader("X-Pagination-Limit", String(limit));
  res.setHeader("X-Pagination-Offset", String(offset));
  res.setHeader("X-Pagination-Total", String(total));
  res.setHeader("X-Legacy-Result-Status", legacyResultStatus ? "true" : "false");

  return res.apiSuccess("Competitions fetched", {
    items: competitionItems,
    total,
    limit,
    offset
  });
});

const getCompetitionDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const where = await buildCompetitionVisibilityWhere({ auth: req.auth, extraWhere: { id } });

  const item = await findCompetitionDetailWithResultFallback(where);

  if (!item) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (req.auth?.role === "SUPERADMIN") {
    const [competitionEnrollmentsDetailed, competitionWorksheetsDetailed, competitionWorksheetAssignments] = await Promise.all([
      prisma.competitionEnrollment.findMany({
        where: { competitionId: id, tenantId: req.auth.tenantId, isActive: true },
        orderBy: [{ enrolledAt: "asc" }],
        select: {
          competitionId: true,
          studentId: true,
          levelId: true,
          isActive: true,
          enrolledAt: true,
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              email: true,
              hierarchyNodeId: true,
              levelId: true,
              level: { select: { id: true, name: true, rank: true } }
            }
          },
          level: { select: { id: true, name: true, rank: true } }
        }
      }),
      prisma.competitionWorksheet.findMany({
        where: { competitionId: id, tenantId: req.auth.tenantId },
        orderBy: [{ assignedAt: "desc" }],
        select: {
          competitionId: true,
          worksheetId: true,
          tenantId: true,
          competitionPaperId: true,
          competitionPaperBlueprintId: true,
          assignedAt: true,
          levelId: true,
          version: true,
          title: true,
          status: true,
          generationMode: true,
          generationSeed: true,
          sourceType: true,
          isActive: true,
          worksheet: {
            select: {
              id: true,
              title: true,
              description: true,
              levelId: true,
              competitionCourseLevelId: true,
              competitionCoursePaperId: true,
              competitionCoursePaperBlueprintId: true,
              isPublished: true,
              generatedAt: true,
              createdAt: true,
              updatedAt: true,
              timeLimitSeconds: true
            }
          },
          competitionPaper: { select: { id: true, title: true, code: true, status: true } },
          competitionPaperBlueprint: { select: { id: true, title: true, version: true, status: true } }
        }
      }),
      prisma.competitionWorksheetAssignment.findMany({
        where: { competitionId: id, tenantId: req.auth.tenantId },
        orderBy: [{ assignedAt: "desc" }],
        select: {
          id: true,
          tenantId: true,
          competitionId: true,
          worksheetId: true,
          studentId: true,
          dueAt: true,
          status: true,
          assignedAt: true,
          startedAt: true,
          submittedAt: true,
          createdAt: true,
          updatedAt: true,
          worksheet: {
            select: {
              id: true,
              title: true,
              description: true,
              levelId: true,
              competitionCourseLevelId: true,
              isPublished: true,
              generatedAt: true
            }
          },
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              levelId: true,
              hierarchyNodeId: true,
              level: { select: { id: true, name: true, rank: true } }
            }
          }
        }
      })
    ]);

    const worksheetIds = [...new Set(competitionWorksheetAssignments.map((row) => row.worksheetId).filter(Boolean))];
    const studentIds = [...new Set(competitionWorksheetAssignments.map((row) => row.studentId).filter(Boolean))];
    const competitionWorksheetSubmissions = worksheetIds.length && studentIds.length
      ? await prisma.worksheetSubmission.findMany({
          where: {
            tenantId: req.auth.tenantId,
            worksheetId: { in: worksheetIds },
            studentId: { in: studentIds },
            finalSubmittedAt: { not: null }
          },
          select: {
            id: true,
            worksheetId: true,
            studentId: true,
            score: true,
            totalMarks: true,
            earnedMarks: true,
            percentage: true,
            correctCount: true,
            wrongCount: true,
            unansweredCount: true,
            totalQuestions: true,
            completionTimeSeconds: true,
            submittedAt: true,
            finalSubmittedAt: true,
            evaluatedAt: true,
            publishedAt: true,
            publishedByUserId: true,
            publishedBy: { select: { id: true, email: true, role: true } },
            evaluatorType: true,
            evaluationSnapshot: true,
            status: true,
            remarks: true
          }
        })
      : [];

    const submissionByKey = new Map(
      competitionWorksheetSubmissions.map((submission) => [`${submission.worksheetId}:${submission.studentId}`, submission])
    );

    return res.apiSuccess("Competition fetched", {
      ...item,
      competitionEnrollmentsDetailed,
      competitionWorksheetsDetailed,
      competitionWorksheetAssignments: competitionWorksheetAssignments.map((assignment) => {
        const submission = submissionByKey.get(`${assignment.worksheetId}:${assignment.studentId}`) || null;
        return {
          ...assignment,
          submission: submission
            ? {
                id: submission.id,
                status: submission.status,
                score: submission.score === null || submission.score === undefined ? null : Number(submission.score),
                totalMarks: submission.totalMarks === null || submission.totalMarks === undefined ? null : Number(submission.totalMarks),
                earnedMarks: submission.earnedMarks === null || submission.earnedMarks === undefined ? null : Number(submission.earnedMarks),
                percentage: submission.percentage === null || submission.percentage === undefined ? null : Number(submission.percentage),
                correctCount: submission.correctCount ?? null,
                wrongCount: submission.wrongCount ?? null,
                unansweredCount: submission.unansweredCount ?? null,
                totalQuestions: submission.totalQuestions ?? null,
                completionTimeSeconds: submission.completionTimeSeconds ?? null,
                submittedAt: submission.finalSubmittedAt || submission.submittedAt || null,
                evaluatedAt: submission.evaluatedAt || null,
                publishedAt: submission.publishedAt || null,
                publishedByUserId: submission.publishedByUserId || null,
                publishedBy: submission.publishedBy || null,
                evaluatorType: submission.evaluatorType || null,
                evaluationSnapshot: submission.evaluationSnapshot || null,
                remarks: submission.remarks || null
              }
            : null
        };
      })
    });
  }

  return res.apiSuccess("Competition fetched", item);
});

const createCompetitionWorksheetAssignments = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;
  const { worksheetId, studentId, studentIds, assignAllEligible, dueAt } = req.body || {};

  const normalizedWorksheetId = String(worksheetId || "").trim();
  if (!normalizedWorksheetId) {
    return res.apiError(400, "worksheetId is required", "WORKSHEET_ID_REQUIRED");
  }

  const dueAtValue = dueAt ? new Date(dueAt) : null;
  if (dueAt && Number.isNaN(dueAtValue.getTime())) {
    return res.apiError(400, "dueAt is invalid", "VALIDATION_ERROR");
  }

  const requestedStudentIds = assignAllEligible
    ? []
    : [
        ...(studentId ? [String(studentId).trim()] : []),
        ...(Array.isArray(studentIds) ? studentIds.map((id) => String(id).trim()).filter(Boolean) : [])
      ];

  const created = await prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findFirst({
      where: { id: competitionId, tenantId: req.auth.tenantId },
      select: { id: true, title: true }
    });

    if (!competition) {
      const error = new Error("Competition not found");
      error.statusCode = 404;
      error.errorCode = "COMPETITION_NOT_FOUND";
      throw error;
    }

    const competitionWorksheet = await tx.competitionWorksheet.findFirst({
      where: { competitionId, tenantId: req.auth.tenantId, worksheetId: normalizedWorksheetId },
      select: {
        competitionId: true,
        worksheetId: true,
        levelId: true,
        status: true,
        isActive: true,
        worksheet: {
          select: {
            id: true,
            title: true,
            isPublished: true,
            levelId: true,
            competitionCourseLevelId: true
          }
        }
      }
    });

    if (!competitionWorksheet) {
      const error = new Error("Published competition worksheet not found");
      error.statusCode = 404;
      error.errorCode = "WORKSHEET_NOT_FOUND";
      throw error;
    }

    const worksheetStatus = String(competitionWorksheet.status || "").toUpperCase();
    if (worksheetStatus !== "PUBLISHED" || competitionWorksheet.isActive === false || competitionWorksheet.worksheet?.isPublished === false) {
      const error = new Error("Only published competition worksheets can be assigned");
      error.statusCode = 409;
      error.errorCode = "WORKSHEET_NOT_PUBLISHED";
      throw error;
    }

    const worksheetLevelId = competitionWorksheet.levelId || competitionWorksheet.worksheet?.levelId || null;
    if (!worksheetLevelId) {
      const error = new Error("Worksheet level is missing");
      error.statusCode = 400;
      error.errorCode = "WORKSHEET_LEVEL_MISSING";
      throw error;
    }

    const eligibleEnrollments = await tx.competitionEnrollment.findMany({
      where: {
        competitionId,
        tenantId: req.auth.tenantId,
        isActive: true,
        levelId: worksheetLevelId
      },
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            levelId: true,
            hierarchyNodeId: true,
            level: { select: { id: true, name: true, rank: true } }
          }
        }
      }
    });

    const eligibleStudentIdSet = new Set(eligibleEnrollments.map((row) => row.studentId));
    const eligibleStudentIds = [...eligibleStudentIdSet];

    let targetStudentIds = requestedStudentIds;
    if (assignAllEligible) {
      targetStudentIds = eligibleStudentIds;
    }

    targetStudentIds = [...new Set(targetStudentIds)];

    if (!targetStudentIds.length) {
      const error = new Error(assignAllEligible ? "No eligible students found" : "studentId or studentIds is required");
      error.statusCode = 400;
      error.errorCode = assignAllEligible ? "NO_ELIGIBLE_STUDENTS" : "STUDENT_ID_REQUIRED";
      throw error;
    }

    const invalidStudentIds = targetStudentIds.filter((id) => !eligibleStudentIdSet.has(id));
    if (invalidStudentIds.length) {
      const error = new Error("Selected student(s) are not eligible for this worksheet level");
      error.statusCode = 400;
      error.errorCode = "STUDENT_LEVEL_MISMATCH";
      error.details = { invalidStudentIds };
      throw error;
    }

    const duplicateBlockingStatuses = ["ASSIGNED", "STARTED", "SUBMITTED"];
    const existingActiveAssignments = await tx.competitionWorksheetAssignment.findMany({
      where: {
        competitionId,
        tenantId: req.auth.tenantId,
        worksheetId: normalizedWorksheetId,
        studentId: { in: targetStudentIds },
        status: { in: duplicateBlockingStatuses }
      },
      select: { studentId: true, status: true }
    });

    if (existingActiveAssignments.length && !assignAllEligible) {
      const error = new Error("Worksheet assignment already exists for selected student(s)");
      error.statusCode = 409;
      error.errorCode = "ASSIGNMENT_ALREADY_EXISTS";
      error.details = { duplicateStudentIds: existingActiveAssignments.map((row) => row.studentId) };
      throw error;
    }

    const duplicateStudentIdSet = new Set(existingActiveAssignments.map((row) => row.studentId));
    const creatableStudentIds = assignAllEligible
      ? targetStudentIds.filter((id) => !duplicateStudentIdSet.has(id))
      : targetStudentIds;

    const createdRows = [];
    for (const currentStudentId of creatableStudentIds) {
      const assignment = await tx.competitionWorksheetAssignment.create({
        data: {
          tenantId: req.auth.tenantId,
          competitionId,
          worksheetId: normalizedWorksheetId,
          studentId: currentStudentId,
          dueAt: dueAtValue,
          status: "ASSIGNED"
        },
        select: {
          id: true,
          tenantId: true,
          competitionId: true,
          worksheetId: true,
          studentId: true,
          dueAt: true,
          status: true,
          assignedAt: true,
          startedAt: true,
          submittedAt: true,
          createdAt: true,
          updatedAt: true
        }
      });
      createdRows.push(assignment);
    }

    const createdIds = createdRows.map((row) => row.id);
    const enrichedAssignments = createdIds.length
      ? await tx.competitionWorksheetAssignment.findMany({
          where: { id: { in: createdIds }, tenantId: req.auth.tenantId },
          orderBy: [{ assignedAt: "desc" }],
          select: {
            id: true,
            tenantId: true,
            competitionId: true,
            worksheetId: true,
            studentId: true,
            dueAt: true,
            status: true,
            assignedAt: true,
            startedAt: true,
            submittedAt: true,
            createdAt: true,
            updatedAt: true,
            worksheet: {
              select: {
                id: true,
                title: true,
                description: true,
                levelId: true,
                competitionCourseLevelId: true,
                isPublished: true,
                generatedAt: true
              }
            },
            student: {
              select: {
                id: true,
                admissionNo: true,
                firstName: true,
                lastName: true,
                levelId: true,
                hierarchyNodeId: true,
                level: { select: { id: true, name: true, rank: true } }
              }
            }
          }
        })
      : [];

    return {
      created: enrichedAssignments,
      skippedDuplicateCount: assignAllEligible ? existingActiveAssignments.length : 0,
      eligibleCount: eligibleStudentIds.length
    };
  });

  return res.apiSuccess("Worksheet assignments created", created, 201);
});

const cancelCompetitionWorksheetAssignment = asyncHandler(async (req, res) => {
  const { id: competitionId, assignmentId } = req.params;

  const updated = await prisma.$transaction(async (tx) => {
    const assignment = await tx.competitionWorksheetAssignment.findFirst({
      where: { id: assignmentId, competitionId, tenantId: req.auth.tenantId },
      select: { id: true, status: true, assignedAt: true, startedAt: true, submittedAt: true }
    });

    if (!assignment) {
      const error = new Error("Worksheet assignment not found");
      error.statusCode = 404;
      error.errorCode = "WORKSHEET_ASSIGNMENT_NOT_FOUND";
      throw error;
    }

    if (String(assignment.status || "").toUpperCase() === "SUBMITTED") {
      const error = new Error("Submitted assignments cannot be cancelled");
      error.statusCode = 409;
      error.errorCode = "ASSIGNMENT_SUBMITTED";
      throw error;
    }

    if (String(assignment.status || "").toUpperCase() === "CANCELLED") {
      return assignment;
    }

    return tx.competitionWorksheetAssignment.update({
      where: { id: assignmentId },
      data: { status: "CANCELLED" },
      select: {
        id: true,
        tenantId: true,
        competitionId: true,
        worksheetId: true,
        studentId: true,
        dueAt: true,
        status: true,
        assignedAt: true,
        startedAt: true,
        submittedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
  });

  return res.apiSuccess("Worksheet assignment cancelled", updated);
});

const listCompetitionBusinessPartners = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const competition = await prisma.competition.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: {
      id: true,
      businessPartnerMappings: {
        orderBy: { createdAt: "asc" },
        select: {
          businessPartnerId: true,
          status: true,
          createdAt: true,
          businessPartner: {
            select: {
              id: true,
              name: true,
              code: true,
              status: true
            }
          }
        }
      }
    }
  });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  return res.apiSuccess("Competition business partners fetched", competition.businessPartnerMappings);
});

const assignCompetitionBusinessPartners = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { businessPartnerIds } = req.body;

  const normalizedPartnerIds = Array.isArray(businessPartnerIds)
    ? businessPartnerIds.map((value) => String(value).trim()).filter(Boolean)
    : [];

  if (!normalizedPartnerIds.length) {
    return res.apiError(400, "businessPartnerIds is required", "VALIDATION_ERROR");
  }

  const competition = await prisma.competition.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  const existingPartners = await prisma.businessPartner.findMany({
    where: {
      tenantId: req.auth.tenantId,
      id: { in: normalizedPartnerIds }
    },
    select: { id: true }
  });

  const existingPartnerIds = new Set(existingPartners.map((item) => item.id));
  const missingIds = normalizedPartnerIds.filter((partnerId) => !existingPartnerIds.has(partnerId));

  if (missingIds.length) {
    return res.apiError(400, "One or more business partners were not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  await prisma.$transaction(async (tx) => {
    for (const businessPartnerId of normalizedPartnerIds) {
      await tx.competitionBusinessPartner.upsert({
        where: {
          competitionId_businessPartnerId: {
            competitionId: id,
            businessPartnerId
          }
        },
        update: {
          status: "APPROVED"
        },
        create: {
          competitionId: id,
          businessPartnerId,
          tenantId: req.auth.tenantId,
          status: "APPROVED"
        }
      });
    }
  });

  return res.apiSuccess("Competition business partners assigned", { assigned: normalizedPartnerIds });
});

const removeCompetitionBusinessPartner = asyncHandler(async (req, res) => {
  const { id, businessPartnerId } = req.params;

  const competition = await prisma.competition.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  await prisma.competitionBusinessPartner.deleteMany({
    where: {
      competitionId: id,
      businessPartnerId,
      tenantId: req.auth.tenantId
    }
  });

  return res.apiSuccess("Competition business partner removed", { removed: businessPartnerId });
});

const createCompetition = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const {
    title,
    description,
    startsAt,
    endsAt,
    registrationStartsAt,
    registrationEndsAt,
    hierarchyNodeId,
    levelId,
    templateId,
    businessPartnerIds,
    code,
    publish = false
  } = req.body;

  const trimmedTitle = String(title || "").trim();
  if (!trimmedTitle || trimmedTitle.length > 200) {
    return res.apiError(400, "title is required (max 200 chars)", "VALIDATION_ERROR");
  }
  if (description && String(description).length > 2000) {
    return res.apiError(400, "description must be at most 2000 chars", "VALIDATION_ERROR");
  }

  const parsedStart = new Date(startsAt);
  const parsedEnd = new Date(endsAt);
  if (!startsAt || !endsAt || isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    return res.apiError(400, "startsAt and endsAt must be valid dates", "VALIDATION_ERROR");
  }
  if (parsedEnd <= parsedStart) {
    return res.apiError(400, "endsAt must be after startsAt", "VALIDATION_ERROR");
  }

  const parsedRegistrationStart = registrationStartsAt ? new Date(registrationStartsAt) : parsedStart;
  const parsedRegistrationEnd = registrationEndsAt ? new Date(registrationEndsAt) : parsedEnd;
  if (registrationStartsAt && isNaN(parsedRegistrationStart.getTime())) {
    return res.apiError(400, "registrationStartsAt must be a valid date", "VALIDATION_ERROR");
  }
  if (registrationEndsAt && isNaN(parsedRegistrationEnd.getTime())) {
    return res.apiError(400, "registrationEndsAt must be a valid date", "VALIDATION_ERROR");
  }
  if (registrationStartsAt && registrationEndsAt && parsedRegistrationEnd <= parsedRegistrationStart) {
    return res.apiError(400, "registrationEndsAt must be after registrationStartsAt", "VALIDATION_ERROR");
  }

  const normalizedLevelId = levelId ? String(levelId).trim() : null;

  if (levelId && !normalizedLevelId) {
    return res.apiError(400, "levelId must be empty or a valid level id", "VALIDATION_ERROR");
  }

  if (normalizedLevelId) {
    const levelExists = await prisma.level.findUnique({ where: { id: normalizedLevelId }, select: { id: true } });
    if (!levelExists) {
      return res.apiError(400, "Level not found", "LEVEL_NOT_FOUND");
    }
  }

  const initialStageByRole = {
    CENTER: "CENTER_REVIEW",
    FRANCHISE: "FRANCHISE_REVIEW",
    BP: "BP_REVIEW",
    SUPERADMIN: "SUPERADMIN_APPROVAL"
  };

  const workflowStage = initialStageByRole[req.auth.role] || "CENTER_REVIEW";
  const resolvedHierarchyNodeId = hierarchyNodeId || req.auth.hierarchyNodeId;
  const normalizedTemplateId = templateId ? String(templateId).trim() : null;
  const normalizedCode = String(code || "").trim() || `CMP-${Date.now().toString(36).toUpperCase()}`;
  const normalizedBusinessPartnerIds = Array.isArray(businessPartnerIds)
    ? [...new Set(businessPartnerIds.map((value) => String(value).trim()).filter(Boolean))]
    : [];

  if (normalizedTemplateId) {
    const templateExists = await prisma.competitionTemplate.findUnique({ where: { id: normalizedTemplateId }, select: { id: true } });
    if (!templateExists) {
      return res.apiError(400, "Template not found", "TEMPLATE_NOT_FOUND");
    }
  }

  if (normalizedBusinessPartnerIds.length) {
    const existingPartners = await prisma.businessPartner.findMany({
      where: {
        tenantId: req.auth.tenantId,
        id: { in: normalizedBusinessPartnerIds }
      },
      select: { id: true }
    });
    const existingPartnerIds = new Set(existingPartners.map((item) => item.id));
    const missingIds = normalizedBusinessPartnerIds.filter((id) => !existingPartnerIds.has(id));
    if (missingIds.length) {
      return res.apiError(400, `Invalid business partner IDs: ${missingIds.join(", ")}`, "BUSINESS_PARTNER_NOT_FOUND");
    }
  }

  if (!resolvedHierarchyNodeId) {
    return res.apiError(400, "hierarchyNodeId is required", "HIERARCHY_NODE_REQUIRED");
  }

  const fallbackLevel = await prisma.level.findFirst({
    where: { tenantId: req.auth.tenantId },
    orderBy: { rank: "asc" },
    select: { id: true }
  });

  const resolvedLevelId = normalizedLevelId || fallbackLevel?.id || null;

  const created = await prisma.$transaction(async (tx) => {
    const competition = await tx.competition.create({
      data: {
        tenantId: req.auth.tenantId,
        title: trimmedTitle,
        description: description ? String(description).trim() : null,
        code: normalizedCode,
        status: publish ? "SCHEDULED" : "DRAFT",
        workflowStage: publish ? "APPROVED" : workflowStage,
        startsAt: parsedStart,
        endsAt: parsedEnd,
        registrationStartsAt: parsedRegistrationStart,
        registrationEndsAt: parsedRegistrationEnd,
        hierarchyNodeId: resolvedHierarchyNodeId,
        levelId: resolvedLevelId,
        templateId: normalizedTemplateId,
        createdByUserId: req.auth.userId
      }
    });

    const actorBusinessPartnerId = await resolveActorBusinessPartnerId({ auth: req.auth, tx });
    const selectedBusinessPartnerIds = new Set(normalizedBusinessPartnerIds);
    if (actorBusinessPartnerId) {
      selectedBusinessPartnerIds.add(actorBusinessPartnerId);
    }

    for (const partnerId of selectedBusinessPartnerIds) {
      await tx.competitionBusinessPartner.upsert({
        where: {
          competitionId_businessPartnerId: {
            competitionId: competition.id,
            businessPartnerId: partnerId
          }
        },
        update: {
          status: "APPROVED"
        },
        create: {
          competitionId: competition.id,
          businessPartnerId: partnerId,
          tenantId: req.auth.tenantId,
          status: "APPROVED"
        }
      });
    }

    return competition;
  });

  res.locals.entityId = created.id;
  try {
    await notifyCompetitionCreated({
      tenantId: req.auth.tenantId,
      competitionId: created.id,
      actorRole: req.auth.role
    });
  } catch {
    // Notification failures must not block competition creation.
  }

  return res.apiSuccess("Competition created", created, 201);
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

  try {
    await notifyCompetitionForwarded({
      tenantId: req.auth.tenantId,
      competitionId: updated.id,
      actorUserId: req.auth.userId,
      actorRole: req.auth.role,
      toStage: result.toStage
    });
  } catch {
    // Notification failures must not block workflow transitions.
  }

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

  try {
    await notifyCompetitionRejected({
      tenantId: req.auth.tenantId,
      competitionId: updated.id,
      reason
    });
  } catch {
    // Notification failures must not block workflow rejection.
  }

  return res.apiSuccess("Competition request rejected", updated);
});

const getLeaderboard = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit } = req.query;

  const competition = await getCompetitionResultMeta({ competitionId: id, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!competition.legacyResultStatus && req.auth.role !== "SUPERADMIN" && competition.resultStatus !== "PUBLISHED") {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const leaderboard = await getCompetitionLeaderboard({
    competitionId: id,
    tenantId: req.auth.tenantId,
    limit,
    skipApprovalCheck: req.auth.role === "SUPERADMIN"
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

  if (!competition.legacyResultStatus && req.auth.role !== "SUPERADMIN" && competition.resultStatus !== "PUBLISHED") {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const leaderboard = await getCompetitionLeaderboard({
    competitionId: id,
    tenantId: req.auth.tenantId,
    limit,
    skipApprovalCheck: req.auth.role === "SUPERADMIN"
  });

  return res.apiSuccess("Competition results", {
    competitionId: competition.id,
    competitionTitle: competition.title,
    status: competition.resultStatus,
    resultPublishedAt: competition.resultPublishedAt,
    legacyResultStatus: competition.legacyResultStatus,
    totalParticipants: leaderboard.totalParticipants,
    leaderboard: leaderboard.leaderboard
  });
});

const publishCompetitionWorksheetResults = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);
  const assignmentIds = normalizeIdList([
    req.body?.assignmentId,
    ...(Array.isArray(req.body?.assignmentIds) ? req.body.assignmentIds : [])
  ]);

  if (!assignmentIds.length) {
    return res.apiError(400, "assignmentId or assignmentIds is required", "VALIDATION_ERROR");
  }

  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId: req.auth.tenantId },
    select: { id: true, title: true }
  });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  const assignments = await prisma.competitionWorksheetAssignment.findMany({
    where: {
      id: { in: assignmentIds },
      competitionId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      worksheetId: true,
      studentId: true,
      status: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          levelId: true,
          level: { select: { id: true, name: true, rank: true } }
        }
      },
      worksheet: {
        select: {
          id: true,
          title: true,
          competitionCourseLevelId: true,
          competitionCoursePaperId: true,
          competitionCoursePaperBlueprintId: true
        }
      }
    }
  });

  const foundAssignmentIds = new Set(assignments.map((row) => row.id));
  const missingAssignmentIds = assignmentIds.filter((assignmentId) => !foundAssignmentIds.has(assignmentId));
  if (missingAssignmentIds.length) {
    return res.apiError(400, `Invalid assignment IDs: ${missingAssignmentIds.join(", ")}`, "ASSIGNMENT_NOT_FOUND");
  }

  const submissionWhere = assignments.flatMap((assignment) => [
    {
      worksheetId: assignment.worksheetId,
      studentId: assignment.studentId
    }
  ]);

  const submissions = submissionWhere.length
    ? await prisma.worksheetSubmission.findMany({
        where: {
          tenantId: req.auth.tenantId,
          OR: submissionWhere,
          finalSubmittedAt: { not: null }
        },
        select: {
          id: true,
          worksheetId: true,
          studentId: true,
          status: true,
          publishedAt: true,
          publishedByUserId: true,
          evaluatedAt: true,
          score: true,
          totalMarks: true,
          earnedMarks: true,
          percentage: true,
          correctCount: true,
          wrongCount: true,
          unansweredCount: true,
          totalQuestions: true,
          completionTimeSeconds: true,
          evaluationSnapshot: true
        }
      })
    : [];

  const submissionByKey = new Map(submissions.map((row) => [`${row.worksheetId}:${row.studentId}`, row]));
  const now = new Date();
  const publishableSubmissionIds = [];
  const alreadyPublished = [];
  const notReviewed = [];
  const missingSubmissions = [];

  for (const assignment of assignments) {
    const submission = submissionByKey.get(`${assignment.worksheetId}:${assignment.studentId}`) || null;
    if (!submission) {
      missingSubmissions.push(assignment.id);
      continue;
    }

    const status = String(submission.status || "").trim().toUpperCase();
    if (status === "PUBLISHED" || submission.publishedAt) {
      alreadyPublished.push(assignment.id);
      continue;
    }

    if (status !== "REVIEWED") {
      notReviewed.push(assignment.id);
      continue;
    }

    publishableSubmissionIds.push(submission.id);
  }

  if (missingSubmissions.length) {
    return res.apiError(409, `Missing competition submissions for assignment IDs: ${missingSubmissions.join(", ")}`, "COMPETITION_SUBMISSION_NOT_FOUND");
  }

  if (notReviewed.length) {
    return res.apiError(409, `Only reviewed results can be published. Not ready assignment IDs: ${notReviewed.join(", ")}`, "COMPETITION_RESULTS_NOT_REVIEWED");
  }

  if (publishableSubmissionIds.length) {
    await prisma.worksheetSubmission.updateMany({
      where: {
        id: { in: publishableSubmissionIds },
        tenantId: req.auth.tenantId
      },
      data: {
        status: "PUBLISHED",
        publishedAt: now,
        publishedByUserId: req.auth.userId
      }
    });
  }

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_RESULT_PUBLISH",
    entityType: "COMPETITION",
    entityId: competitionId,
    metadata: {
      assignmentIds,
      publishedCount: publishableSubmissionIds.length,
      alreadyPublishedCount: alreadyPublished.length
    }
  });

  return res.apiSuccess("Competition worksheet results published", {
    competitionId: competition.id,
    publishedCount: publishableSubmissionIds.length,
    alreadyPublishedCount: alreadyPublished.length,
    assignmentIds
  });
});

const publishCompetitionResults = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (competition.legacyResultStatus) {
    return res.apiError(409, "Apply competition result status migration first", "COMPETITION_RESULT_STATUS_MIGRATION_REQUIRED");
  }

  const updated = await prisma.competition.update({
    where: { id: competition.id },
    data: {
      resultStatus: "PUBLISHED",
      resultPublishedAt: new Date()
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_RESULTS_PUBLISH",
    entityType: "COMPETITION",
    entityId: competitionId
  });

  return res.apiSuccess("Competition results published", updated);
});

const finalizeCompetitionAwards = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!competition.legacyResultStatus && competition.resultStatus !== "PUBLISHED") {
    return res.apiError(409, "Competition results must be published before awards can be finalized", "COMPETITION_RESULTS_NOT_PUBLISHED");
  }

  const leaderboard = await getCompetitionLeaderboard({
    competitionId,
    tenantId: req.auth.tenantId,
    skipApprovalCheck: true,
    includeAll: true
  });

  const rankedRows = leaderboard.levelLeaderboards.flatMap((levelBoard) => levelBoard.leaderboard || []);
  if (!rankedRows.length) {
    return res.apiError(400, "No published results available for award finalization", "COMPETITION_AWARDS_NOT_AVAILABLE");
  }

  const finalizedAt = new Date();
  const updateResults = await prisma.$transaction(
    rankedRows.map((row) => prisma.competitionEnrollment.updateMany({
      where: {
        tenantId: req.auth.tenantId,
        competitionId,
        studentId: row.studentId,
        levelId: row.levelId,
        awardFinalizedAt: null
      },
      data: {
        awardType: row.awardType || row.previewAwardType || getAwardTypeForRank(row.rank),
        awardFinalizedAt: finalizedAt,
        awardFinalizedByUserId: req.auth.userId
      }
    }))
  );

  const finalizedCount = updateResults.reduce((total, result) => total + (result?.count || 0), 0);

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_AWARDS_FINALIZE",
    entityType: "COMPETITION",
    entityId: competitionId,
    metadata: {
      finalizedCount,
      totalCandidates: rankedRows.length
    }
  });

  return res.apiSuccess("Competition awards finalized", {
    competitionId: competition.id,
    finalizedCount,
    alreadyFinalizedCount: Math.max(0, rankedRows.length - finalizedCount),
    finalizedAt
  });
});

function getCompetitionCourseLevelForLeaderboardRow(competition, row) {
  const rankNumber = Number(row?.level?.rank ?? row?.levelRank ?? row?.levelNumber ?? NaN);
  if (!competition?.competitionCourse?.levels?.length || !Number.isFinite(rankNumber)) {
    return null;
  }
  return competition.competitionCourse.levels.find((level) => Number(level.levelNumber) === rankNumber) || null;
}

async function buildCompetitionCertificateRows({ competitionId, tenantId }) {
  const competition = await getCompetitionResultMeta({ competitionId, tenantId, auth: { tenantId, role: "SUPERADMIN" } });
  if (!competition) {
    return { competition: null, rows: [] };
  }

  if (!competition.legacyResultStatus && competition.resultStatus !== "PUBLISHED") {
    const error = new Error("Competition results must be published before certificates can be managed");
    error.statusCode = 409;
    error.errorCode = "COMPETITION_RESULTS_NOT_PUBLISHED";
    throw error;
  }

  const competitionDetail = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId },
    select: {
      id: true,
      title: true,
      code: true,
      competitionCourseId: true,
      competitionCourse: {
        select: {
          id: true,
          code: true,
          name: true,
          levels: {
            orderBy: [{ sortOrder: "asc" }, { levelNumber: "asc" }],
            select: {
              id: true,
              levelNumber: true,
              title: true,
              description: true,
              sortOrder: true,
              isActive: true
            }
          }
        }
      }
    }
  });

  if (!competitionDetail) {
    return { competition: null, rows: [] };
  }

  const leaderboard = await getCompetitionLeaderboard({
    competitionId,
    tenantId,
    skipApprovalCheck: true,
    includeAll: true
  });

  const rows = leaderboard.leaderboard
    .filter((row) => row?.awardFinalizedAt)
    .map((row) => ({
      leaderboardRow: row,
      competitionCourseLevel: getCompetitionCourseLevelForLeaderboardRow(competitionDetail, row)
    }))
    .filter((row) => Boolean(row.competitionCourseLevel));

  return { competition: competitionDetail, rows };
}

async function createOrRefreshCompetitionCertificate({ competition, row, tenantId, userId }) {
  const brandingSnapshot = await buildCertificateBrandingSnapshotForStudent(row.leaderboardRow.studentId, tenantId);
  const now = new Date();
  const courseSnapshot = {
    id: competition.competitionCourse?.id || null,
    code: competition.competitionCourse?.code || null,
    name: competition.competitionCourse?.name || null
  };
  const levelSnapshot = {
    id: row.competitionCourseLevel.id,
    levelNumber: row.competitionCourseLevel.levelNumber,
    title: row.competitionCourseLevel.title
  };
  const metadata = buildCompetitionCertificateMetadata({
    competition,
    competitionCourseLevel: row.competitionCourseLevel,
    leaderboardRow: row.leaderboardRow,
    brandingSnapshot,
    generatedAt: now
  });

  const existing = await prisma.certificate.findFirst({
    where: {
      tenantId,
      competitionId: competition.id,
      studentId: row.leaderboardRow.studentId,
      competitionCourseLevelId: row.competitionCourseLevel.id
    },
    select: {
      id: true
    }
  });

  const data = {
    tenantId,
    certificateNumber: existing ? undefined : generateCertificateNumber(),
    status: "ISSUED",
    studentId: row.leaderboardRow.studentId,
    levelId: row.leaderboardRow.levelId,
    courseId: null,
    competitionId: competition.id,
    competitionCourseLevelId: row.competitionCourseLevel.id,
    issuedByUserId: userId,
    issuedAt: existing ? undefined : now,
    publishedAt: null,
    publishedByUserId: null,
    reason: null,
    awardType: row.leaderboardRow.awardType || getAwardTypeForRank(row.leaderboardRow.rank),
    courseSnapshot,
    levelSnapshot,
    brandingSnapshot,
    metadata
  };

  if (existing) {
    return prisma.certificate.update({
      where: { id: existing.id },
      data: {
        courseSnapshot,
        levelSnapshot,
        brandingSnapshot,
        awardType: row.leaderboardRow.awardType || getAwardTypeForRank(row.leaderboardRow.rank),
        metadata
      },
      select: {
        id: true,
        tenantId: true,
        certificateNumber: true,
        status: true,
        studentId: true,
        levelId: true,
        courseId: true,
        competitionId: true,
        competitionCourseLevelId: true,
        issuedByUserId: true,
        issuedAt: true,
        publishedAt: true,
        publishedByUserId: true,
        revokedAt: true,
        revokedByUserId: true,
        reason: true,
        awardType: true,
        courseSnapshot: true,
        levelSnapshot: true,
        brandingSnapshot: true,
        metadata: true,
        verificationToken: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            hierarchyNodeId: true,
            levelId: true,
            hierarchyNode: { select: { id: true, name: true, code: true } },
            level: { select: { id: true, name: true, rank: true } }
          }
        },
        competition: { select: { id: true, title: true, code: true, competitionCourseId: true } },
        competitionCourseLevel: { select: { id: true, levelNumber: true, title: true } },
        publishedBy: { select: { id: true, username: true, email: true, role: true } },
        issuedBy: { select: { id: true, username: true, email: true, role: true } }
      }
    });
  }

  return prisma.certificate.create({
    data,
    select: {
      id: true,
      tenantId: true,
      certificateNumber: true,
      status: true,
      studentId: true,
      levelId: true,
      courseId: true,
      competitionId: true,
      competitionCourseLevelId: true,
      issuedByUserId: true,
      issuedAt: true,
      publishedAt: true,
      publishedByUserId: true,
      revokedAt: true,
      revokedByUserId: true,
      reason: true,
      awardType: true,
      courseSnapshot: true,
      levelSnapshot: true,
      brandingSnapshot: true,
      metadata: true,
      verificationToken: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          hierarchyNodeId: true,
          levelId: true,
          hierarchyNode: { select: { id: true, name: true, code: true } },
          level: { select: { id: true, name: true, rank: true } }
        }
      },
      competition: { select: { id: true, title: true, code: true, competitionCourseId: true } },
      competitionCourseLevel: { select: { id: true, levelNumber: true, title: true } },
      publishedBy: { select: { id: true, username: true, email: true, role: true } },
      issuedBy: { select: { id: true, username: true, email: true, role: true } }
    }
  });
}

const listCompetitionCertificates = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;
  const { competition } = await buildCompetitionCertificateRows({ competitionId, tenantId: req.auth.tenantId });
  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  const items = await prisma.certificate.findMany({
    where: {
      tenantId: req.auth.tenantId,
      competitionId
    },
    orderBy: [{ issuedAt: "asc" }],
    select: {
      id: true,
      tenantId: true,
      certificateNumber: true,
      status: true,
      studentId: true,
      levelId: true,
      courseId: true,
      competitionId: true,
      competitionCourseLevelId: true,
      issuedByUserId: true,
      issuedAt: true,
      publishedAt: true,
      publishedByUserId: true,
      revokedAt: true,
      revokedByUserId: true,
      reason: true,
      awardType: true,
      courseSnapshot: true,
      levelSnapshot: true,
      brandingSnapshot: true,
      metadata: true,
      verificationToken: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          hierarchyNodeId: true,
          levelId: true,
          hierarchyNode: { select: { id: true, name: true, code: true } },
          level: { select: { id: true, name: true, rank: true } }
        }
      },
      competition: { select: { id: true, title: true, code: true, competitionCourseId: true } },
      competitionCourseLevel: { select: { id: true, levelNumber: true, title: true } },
      publishedBy: { select: { id: true, username: true, email: true, role: true } },
      issuedBy: { select: { id: true, username: true, email: true, role: true } }
    }
  });

  return res.apiSuccess("Competition certificates fetched", {
    items,
    total: items.length
  });
});

const generateCompetitionCertificates = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);
  const certificateIds = normalizeIdList([req.body?.certificateId, ...(Array.isArray(req.body?.certificateIds) ? req.body.certificateIds : [])]);
  const studentIds = normalizeIdList([req.body?.studentId, ...(Array.isArray(req.body?.studentIds) ? req.body.studentIds : [])]);

  const { competition, rows } = await buildCompetitionCertificateRows({ competitionId, tenantId: req.auth.tenantId });
  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!rows.length) {
    return res.apiError(400, "No finalized awards available for certificate generation", "COMPETITION_AWARDS_NOT_AVAILABLE");
  }

  const selectedRows = rows.filter((row) => {
    if (certificateIds.length) {
      return certificateIds.includes(`${row.leaderboardRow.studentId}:${row.competitionCourseLevel.id}`);
    }
    if (studentIds.length) {
      return studentIds.includes(row.leaderboardRow.studentId);
    }
    return true;
  });

  if (!selectedRows.length) {
    return res.apiError(400, "No matching finalized awards were selected", "COMPETITION_AWARDS_NOT_AVAILABLE");
  }

  const certificates = [];
  for (const row of selectedRows) {
    const cert = await createOrRefreshCompetitionCertificate({
      competition,
      row,
      tenantId: req.auth.tenantId,
      userId: req.auth.userId
    });
    certificates.push(cert);
  }

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_CERTIFICATES_GENERATE",
    entityType: "COMPETITION",
    entityId: competitionId,
    metadata: {
      generatedCount: certificates.length
    }
  });

  return res.apiSuccess("Competition certificates generated", {
    generatedCount: certificates.length,
    certificates
  }, 201);
});

const publishCompetitionCertificates = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);
  const certificateIds = normalizeIdList([req.body?.certificateId, ...(Array.isArray(req.body?.certificateIds) ? req.body.certificateIds : [])]);
  const studentIds = normalizeIdList([req.body?.studentId, ...(Array.isArray(req.body?.studentIds) ? req.body.studentIds : [])]);

  const { competition, rows } = await buildCompetitionCertificateRows({ competitionId, tenantId: req.auth.tenantId });
  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!rows.length) {
    return res.apiError(400, "No finalized awards available for certificate publication", "COMPETITION_AWARDS_NOT_AVAILABLE");
  }

  const selectedRows = rows.filter((row) => {
    if (certificateIds.length) {
      return certificateIds.includes(`${row.leaderboardRow.studentId}:${row.competitionCourseLevel.id}`);
    }
    if (studentIds.length) {
      return studentIds.includes(row.leaderboardRow.studentId);
    }
    return true;
  });

  if (!selectedRows.length) {
    return res.apiError(400, "No matching finalized awards were selected", "COMPETITION_AWARDS_NOT_AVAILABLE");
  }

  const now = new Date();
  const certificates = [];
  for (const row of selectedRows) {
    const cert = await createOrRefreshCompetitionCertificate({
      competition,
      row,
      tenantId: req.auth.tenantId,
      userId: req.auth.userId
    });

    if (!cert.publishedAt) {
      const updated = await prisma.certificate.update({
        where: { id: cert.id },
        data: {
          publishedAt: now,
          publishedByUserId: req.auth.userId,
          verificationToken: cert.verificationToken || crypto.randomUUID()
        },
        select: {
          id: true,
          certificateNumber: true,
          publishedAt: true,
          publishedByUserId: true
        }
      });
      certificates.push(updated);
    } else {
      certificates.push({
        id: cert.id,
        certificateNumber: cert.certificateNumber,
        publishedAt: cert.publishedAt,
        publishedByUserId: cert.publishedByUserId
      });
    }
  }

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_CERTIFICATES_PUBLISH",
    entityType: "COMPETITION",
    entityId: competitionId,
    metadata: {
      publishedCount: certificates.filter((row) => row.publishedAt).length
    }
  });

  return res.apiSuccess("Competition certificates published", {
    publishedCount: certificates.filter((row) => row.publishedAt).length,
    certificates
  });
});

const unpublishCompetitionResults = asyncHandler(async (req, res) => {
  const competitionId = String(req.params.id);

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (competition.legacyResultStatus) {
    return res.apiError(409, "Apply competition result status migration first", "COMPETITION_RESULT_STATUS_MIGRATION_REQUIRED");
  }

  const updated = await prisma.competition.update({
    where: { id: competition.id },
    data: {
      resultStatus: "LOCKED",
      resultPublishedAt: null
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COMPETITION_RESULTS_UNPUBLISH",
    entityType: "COMPETITION",
    entityId: competitionId
  });

  return res.apiSuccess("Competition results unpublished", updated);
});

const exportCompetitionResultsCsv = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;

  const competition = await getCompetitionResultMeta({ competitionId, tenantId: req.auth.tenantId, auth: req.auth });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (!competition.legacyResultStatus && req.auth.role !== "SUPERADMIN" && competition.resultStatus !== "PUBLISHED") {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const enrollments = await prisma.competitionEnrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      competitionId
    },
    orderBy: [{ rank: "asc" }, { enrolledAt: "asc" }],
    select: {
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

  const csv = toCsv({
    headers: [
      "competitionId",
      "competitionTitle",
      "resultStatus",
      "studentId",
      "admissionNo",
      "studentName",
      "rank",
      "totalScore",
      "enrolledAt"
    ],
    rows: enrollments.map((e) => [
      competition.id,
      competition.title,
      competition.resultStatus,
      e.student.id,
      e.student.admissionNo,
      `${e.student.firstName} ${e.student.lastName}`,
      e.rank ?? "",
      e.totalScore !== null && e.totalScore !== undefined ? String(e.totalScore) : "",
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

const listCompetitionRegistrations = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;

  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId: req.auth.tenantId },
    select: { id: true, title: true, registrationStartsAt: true, registrationEndsAt: true, startsAt: true, endsAt: true, code: true }
  });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  const [registrations, levelSummary] = await Promise.all([
    prisma.competitionEnrollment.findMany({
      where: { competitionId, tenantId: req.auth.tenantId, isActive: true },
      orderBy: [{ enrolledAt: "asc" }],
      select: {
        competitionId: true,
        studentId: true,
        levelId: true,
        isActive: true,
        enrolledAt: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            currentTeacher: {
              select: {
                id: true,
                username: true,
                teacherProfile: { select: { fullName: true } }
              }
            },
            level: { select: { id: true, name: true, rank: true } }
          }
        },
        level: { select: { id: true, name: true, rank: true } }
      }
    }),
    prisma.competitionEnrollment.groupBy({
      by: ["levelId"],
      where: { competitionId, tenantId: req.auth.tenantId, isActive: true },
      _count: { studentId: true }
    })
  ]);

  const normalizedRegistrations = registrations.map((row) => ({
    id: `${row.competitionId}:${row.studentId}`,
    studentId: row.studentId,
    competitionLevel: row.level ? { id: row.level.id, name: row.level.name, rank: row.level.rank } : null,
    academicLevel: row.student.level ? { id: row.student.level.id, name: row.student.level.name, rank: row.student.level.rank } : null,
    registrationStatus: row.isActive ? "ACTIVE" : "REMOVED",
    student: {
      id: row.student.id,
      admissionNo: row.student.admissionNo,
      firstName: row.student.firstName,
      lastName: row.student.lastName,
      currentTeacher: row.student.currentTeacher
    },
    level: row.level,
    enrolledAt: row.enrolledAt
  }));

  const levelIds = [...new Set(levelSummary.map((item) => item.levelId).filter(Boolean))];
  const levels = levelIds.length
    ? await prisma.level.findMany({ where: { tenantId: req.auth.tenantId, id: { in: levelIds } }, select: { id: true, name: true, rank: true } })
    : [];
  const levelMap = new Map(levels.map((level) => [level.id, level]));
  const formattedLevelSummary = levelSummary.map((item) => ({
    levelId: item.levelId,
    levelName: item.levelId ? levelMap.get(item.levelId)?.name || item.levelId : "Unassigned",
    studentCount: item._count?.studentId ?? 0
  }));

  return res.apiSuccess("Competition registrations fetched", {
    competition,
    registrations: normalizedRegistrations,
    summary: {
      totalTeachers: new Set(normalizedRegistrations.map((row) => row.student?.currentTeacher?.id).filter(Boolean)).size,
      totalStudents: normalizedRegistrations.length,
      levelSummary: formattedLevelSummary
    }
  });
});

const updateCompetitionRegistrationLevel = asyncHandler(async (req, res) => {
  const { id: competitionId, registrationId } = req.params;
  const { levelId } = req.body;

  if (!levelId) {
    return res.apiError(400, "levelId is required", "VALIDATION_ERROR");
  }

  const normalizedLevelId = String(levelId).trim();
  const levelExists = await prisma.level.findUnique({ where: { id: normalizedLevelId }, select: { id: true } });
  if (!levelExists) {
    return res.apiError(400, "Level not found", "LEVEL_NOT_FOUND");
  }

  const targetStudentId = resolveCompetitionRegistrationStudentId({ registrationId });

  const [competition, enrollment] = await Promise.all([
    prisma.competition.findFirst({ where: { id: competitionId, tenantId: req.auth.tenantId }, select: { id: true, registrationEndsAt: true, workflowStage: true } }),
    targetStudentId
      ? prisma.competitionEnrollment.findFirst({
          where: { competitionId, tenantId: req.auth.tenantId, studentId: targetStudentId, isActive: true },
          select: { competitionId: true, studentId: true }
        })
      : null
  ]);

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (competition.registrationEndsAt && new Date() > new Date(competition.registrationEndsAt)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  if (competition.workflowStage === "APPROVED") {
    return res.apiError(409, "Competition is approved and locked", "COMPETITION_LOCKED");
  }

  // Prevent update if center-level submission exists (locked)
  const centerId = req.auth.hierarchyNodeId;
  if (centerId) {
    const locked = await prisma.competitionCenterSubmission.findFirst({ where: { competitionId, tenantId: req.auth.tenantId, centerId, status: { in: ["SUBMITTED", "APPROVED"] } } });
    if (locked) {
      return res.apiError(409, "Registrations for this center are locked", "CENTER_LOCKED");
    }
  }

  if (!enrollment) {
    return res.apiError(404, "Registration not found", "REGISTRATION_NOT_FOUND");
  }

  const actualRegistration = await prisma.competitionEnrollment.findFirst({
    where: { competitionId, tenantId: req.auth.tenantId, studentId: enrollment.studentId, isActive: true },
    select: { competitionId: true, studentId: true }
  });

  if (!actualRegistration) {
    return res.apiError(404, "Registration not found", "REGISTRATION_NOT_FOUND");
  }

  const updated = await prisma.competitionEnrollment.update({
    where: { competitionId_studentId: { competitionId, studentId: enrollment.studentId } },
    data: { levelId: normalizedLevelId }
  });

  return res.apiSuccess("Competition registration level updated", updated);
});

const removeCompetitionRegistration = asyncHandler(async (req, res) => {
  const { id: competitionId, registrationId } = req.params;

  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId: req.auth.tenantId },
    select: { id: true, registrationEndsAt: true, workflowStage: true }
  });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  if (competition.registrationEndsAt && new Date() > new Date(competition.registrationEndsAt)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  if (competition.workflowStage === "APPROVED") {
    return res.apiError(409, "Competition is approved and locked", "COMPETITION_LOCKED");
  }

  // Prevent removal if center-level submission exists (locked)
  const centerId = req.auth.hierarchyNodeId;
  if (centerId) {
    const locked = await prisma.competitionCenterSubmission.findFirst({ where: { competitionId, tenantId: req.auth.tenantId, centerId, status: { in: ["SUBMITTED", "APPROVED"] } } });
    if (locked) {
      return res.apiError(409, "Registrations for this center are locked", "CENTER_LOCKED");
    }
  }

  const targetStudentId = resolveCompetitionRegistrationStudentId({ registrationId });

  const enrollment = await prisma.competitionEnrollment.findFirst({
    where: { competitionId, tenantId: req.auth.tenantId, isActive: true, studentId: targetStudentId },
    select: { competitionId: true, studentId: true }
  });

  if (!enrollment) {
    return res.apiError(404, "Registration not found", "REGISTRATION_NOT_FOUND");
  }

  const updated = await prisma.competitionEnrollment.update({
    where: { competitionId_studentId: { competitionId, studentId: enrollment.studentId } },
    data: { isActive: false }
  });

  return res.apiSuccess("Competition registration removed", updated);
});

const createCompetitionTemporaryStudent = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;
  const { firstName, lastName, levelId, password } = req.body;
  const idempotencyKeyHeader = req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || req.body?.idempotencyKey || "";
  const idemKey = String(idempotencyKeyHeader || "").trim();
  const idempotencyPath = makeCompetitionTemporaryStudentIdempotencyScope({
    competitionId,
    centerUserId: req.auth.userId
  });
  const requestHash = hashIdempotencyPayload({
    action: COMPETITION_TEMP_STUDENT_IDEMPOTENCY_ACTION,
    tenantId: req.auth.tenantId,
    centerUserId: req.auth.userId,
    competitionId,
    payload: {
      firstName,
      lastName,
      levelId,
      password
    }
  });

  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId: req.auth.tenantId },
    select: { id: true, registrationEndsAt: true, hierarchyNodeId: true, workflowStage: true }
  });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  const createTemporaryStudent = async () => {
    if (competition.registrationEndsAt && new Date() > new Date(competition.registrationEndsAt)) {
      throw buildIdempotencyError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
    }

    if (competition.workflowStage === "APPROVED") {
      throw buildIdempotencyError(409, "Competition is approved and locked", "COMPETITION_LOCKED");
    }

    // Prevent creation if center-level submission exists (locked)
    const centerId = req.auth.hierarchyNodeId;
    if (centerId) {
      const locked = await prisma.competitionCenterSubmission.findFirst({ where: { competitionId, tenantId: req.auth.tenantId, centerId, status: { in: ["SUBMITTED", "APPROVED"] } } });
      if (locked) {
        throw buildIdempotencyError(409, "Registrations for this center are locked", "CENTER_LOCKED");
      }
    }

    if (!levelId) {
      throw buildIdempotencyError(400, "levelId is required", "VALIDATION_ERROR");
    }

    const normalizedLevelId = String(levelId).trim();
    const levelExists = await prisma.level.findUnique({ where: { id: normalizedLevelId }, select: { id: true } });
    if (!levelExists) {
      throw buildIdempotencyError(400, "Level not found", "LEVEL_NOT_FOUND");
    }

    return prisma.$transaction(async (tx) => {
      const username = await generateUsername({ tx, tenantId: req.auth.tenantId, role: "STUDENT" });
      const passwordHash = await hashPassword(String(password || "Pass@123"));

      const student = await tx.student.create({
        data: {
          tenantId: req.auth.tenantId,
          admissionNo: username,
          firstName: String(firstName || "Temp").trim() || "Temp",
          lastName: String(lastName || "Student").trim() || "Student",
          hierarchyNodeId: competition.hierarchyNodeId,
          levelId: normalizedLevelId,
          currentTeacherUserId: null,
          isActive: true,
          isTemporaryExam: true,
          temporaryExpiresAt: null,
          temporaryExamCycleId: null
        },
        select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true }
      });

      await tx.authUser.create({
        data: {
          tenantId: req.auth.tenantId,
          username,
          email: `${username.toLowerCase()}@temp.local`,
          passwordHash,
          role: "STUDENT",
          isActive: true,
          hierarchyNodeId: competition.hierarchyNodeId,
          parentUserId: req.auth.userId,
          studentId: student.id,
          mustChangePassword: true
        },
        select: { id: true, username: true }
      });

      const enrollment = await tx.competitionEnrollment.create({
        data: {
          competitionId,
          studentId: student.id,
          tenantId: req.auth.tenantId,
          levelId: normalizedLevelId,
          isActive: true
        },
        select: { competitionId: true, studentId: true }
      });

      return {
        student,
        enrollment,
        user: { username },
        password: String(password || "Pass@123")
      };
    });
  };

  if (!idemKey) {
    try {
      const created = await createTemporaryStudent();
      return res.apiSuccess("Temporary student created", created, 201);
    } catch (error) {
      if (error?.statusCode && error?.errorCode) {
        return res.apiError(error.statusCode, error.message, error.errorCode);
      }
      throw error;
    }
  }

  let marker = null;
  try {
    marker = await prisma.idempotencyKey.create({
      data: {
        tenantId: req.auth.tenantId,
        key: idemKey,
        method: "POST",
        path: idempotencyPath,
        requestHash
      }
    });
  } catch (error) {
    if (error.code !== "P2002") {
      throw error;
    }

    const existingMarker = await prisma.idempotencyKey.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        key: idemKey,
        method: "POST",
        path: idempotencyPath
      }
    });

    if (existingMarker?.requestHash && existingMarker.requestHash !== requestHash) {
      return res.apiError(409, "Idempotency key was already used with a different payload", "IDEMPOTENCY_CONFLICT");
    }

    if (existingMarker?.responseBody && existingMarker.responseStatus) {
      return res.status(existingMarker.responseStatus).json(existingMarker.responseBody);
    }

    const maxWait = 1000;
    let waited = 0;
    while (waited < maxWait) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 100));
      waited += 100;
      // eslint-disable-next-line no-await-in-loop
      const polled = await prisma.idempotencyKey.findFirst({
        where: {
          tenantId: req.auth.tenantId,
          key: idemKey,
          method: "POST",
          path: idempotencyPath
        }
      });

      if (polled?.requestHash && polled.requestHash !== requestHash) {
        return res.apiError(409, "Idempotency key was already used with a different payload", "IDEMPOTENCY_CONFLICT");
      }

      if (polled?.responseBody && polled.responseStatus) {
        return res.status(polled.responseStatus).json(polled.responseBody);
      }
    }

    return res.apiError(409, "Idempotency request is still in progress", "IDEMPOTENCY_IN_PROGRESS");
  }

  try {
    const created = await createTemporaryStudent();
    const responseBody = buildIdempotencySuccessBody("Temporary student created", created);
    await prisma.idempotencyKey.update({
      where: { id: marker.id },
      data: {
        responseEntityId: created.student.id,
        responseStatus: 201,
        responseBody
      }
    });

    return res.status(201).json(responseBody);
  } catch (error) {
    try {
      await prisma.idempotencyKey.update({
        where: { id: marker.id },
        data: {
          responseStatus: error?.statusCode || 500,
          responseBody: {
            success: false,
            message: error?.message || "Internal server error",
            data: null,
            error_code: error?.errorCode || "INTERNAL_ERROR"
          }
        }
      });
    } catch (_updateError) {
      // Preserve the original failure response if recording the marker fails.
    }
    if (error?.statusCode && error?.errorCode) {
      return res.apiError(error.statusCode, error.message, error.errorCode);
    }
    throw error;
  }
});

const lockCompetitionCenterRegistration = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;

  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId: req.auth.tenantId },
    select: { id: true, registrationStartsAt: true, registrationEndsAt: true, workflowStage: true }
  });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  // Validation: enrollment window open
  const now = new Date();
  if (competition.registrationStartsAt && now < new Date(competition.registrationStartsAt)) {
    return res.apiError(409, "Enrollment window is not open", "ENROLLMENT_WINDOW_NOT_OPEN");
  }
  if (competition.registrationEndsAt && now > new Date(competition.registrationEndsAt)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  const centerId = req.auth.hierarchyNodeId;
  if (!centerId) {
    return res.apiError(403, "Center context required", "HIERARCHY_CONTEXT_REQUIRED");
  }

  // At least one student registered for this center
  const centerRegistrations = await prisma.competitionEnrollment.findMany({
    where: { competitionId, tenantId: req.auth.tenantId, isActive: true },
    select: { studentId: true, levelId: true, student: { select: { hierarchyNodeId: true } } }
  });

  const centerRegs = centerRegistrations.filter((r) => String(r.student.hierarchyNodeId) === String(centerId));
  if (!centerRegs.length) {
    return res.apiError(400, "At least one student must be registered before submission", "NO_STUDENTS_REGISTERED");
  }

  // Every registration has a competition level
  const missingLevel = centerRegs.find((r) => !r.levelId);
  if (missingLevel) {
    return res.apiError(400, "Every registration must have a competition level", "LEVEL_MISSING");
  }

  // No duplicate active registrations for same student
  const dupCounts = await prisma.competitionEnrollment.groupBy({
    by: ["studentId"],
    where: { competitionId, tenantId: req.auth.tenantId, isActive: true },
    _count: { studentId: true }
  });
  const dup = dupCounts.find((g) => (g._count?.studentId || 0) > 1);
  if (dup) {
    return res.apiError(409, "Duplicate student registrations detected", "DUPLICATE_REGISTRATIONS");
  }

  // No pending validation errors - for now use basic checks above

  const submission = await prisma.competitionCenterSubmission.create({
    data: {
      tenantId: req.auth.tenantId,
      competitionId,
      centerId,
      status: "SUBMITTED",
      submittedByUserId: req.auth.userId
    }
  });

  // Record stage transition and set competition workflow stage to CENTER_SUBMITTED
  await prisma.competitionStageTransition.create({
    data: {
      tenantId: req.auth.tenantId,
      competitionId,
      fromStage: competition.workflowStage || "CENTER_REVIEW",
      toStage: "CENTER_SUBMITTED",
      action: "FORWARD",
      reason: null,
      actedByUserId: req.auth.userId
    }
  });

  const updated = await prisma.competition.update({ where: { id: competitionId }, data: { workflowStage: "CENTER_SUBMITTED" } });

  try {
    // notify franchise about submission
    await notifyCenterSubmittedCompetitionRegistration({ tenantId: req.auth.tenantId, competitionId, actorUserId: req.auth.userId });
  } catch {
    // don't block on notification
  }

  return res.apiSuccess("Competition center registration submitted", { submission, competition: updated });
});

const requestCompetitionCenterUnlock = asyncHandler(async (req, res) => {
  const { id: competitionId } = req.params;
  const reason = String(req.body?.reason || "Requesting center unlock").trim() || "Requesting center unlock";

  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId: req.auth.tenantId },
    select: { id: true, title: true }
  });

  if (!competition) {
    return res.apiError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  try {
    await notifyCenterRequestedCompetitionUnlock({
      tenantId: req.auth.tenantId,
      competitionId,
      actorUserId: req.auth.userId
    });
  } catch {
    // Notification failures must not block recording the request response.
  }

  const request = {
    competitionId,
    competitionName: competition.title,
    reason,
    createdAt: new Date().toISOString(),
    createdBy: req.auth.userId
  };

  return res.apiSuccess("Competition unlock request submitted", request, 201);
});

const enrollStudent = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id: competitionId } = req.params;
  const { studentId, competitionFeeAmount, levelId: selectedLevelId } = req.body;

  if (!studentId) {
    return res.apiError(400, "studentId is required", "STUDENT_ID_REQUIRED");
  }

  const created = await prisma.$transaction(async (tx) => {
    const { competition, student, levelId } = await validateCompetitionRegistrationAccess({
      tx,
      competitionId,
      tenantId: req.auth.tenantId,
      actorAuth: req.auth,
      studentId,
      selectedLevelId
    });

      // Prevent enrollment if center-level submission exists (locked)
      const centerId = req.auth.hierarchyNodeId;
      if (centerId) {
        const locked = await tx.competitionCenterSubmission.findFirst({ where: { competitionId, tenantId: req.auth.tenantId, centerId, status: { in: ["SUBMITTED", "APPROVED"] } } });
        if (locked) {
          const error = new Error("Registrations for this center are locked");
          error.statusCode = 409;
          error.errorCode = "CENTER_LOCKED";
          throw error;
        }
      }

    const existing = await tx.competitionEnrollment.findFirst({
      where: {
        competitionId: competition.id,
        studentId: student.id,
        tenantId: req.auth.tenantId,
        isActive: true
      },
      select: {
        competitionId: true
      }
    });

    if (existing) {
      const error = new Error("Duplicate active enrollment is not allowed");
      error.statusCode = 409;
      error.errorCode = "DUPLICATE_ACTIVE_ENROLLMENT";
      throw error;
    }

    const enrollment = await tx.competitionEnrollment.create({
      data: {
        competitionId: competition.id,
        studentId: student.id,
        tenantId: req.auth.tenantId,
        levelId: levelId,
        isActive: true
      }
    });

    await recordCompetitionTransaction({
      tx,
      tenantId: req.auth.tenantId,
      competitionId: competition.id,
      studentId: student.id,
      actorUserId: req.auth.userId,
      grossAmount: competitionFeeAmount ?? 0
    });

    return enrollment;
  });

  return res.apiSuccess("Student enrolled", created, 201);
});

export {
  listCompetitions,
  getCompetitionDetail,
  createCompetition,
  forwardCompetitionRequest,
  rejectCompetitionRequest,
  getLeaderboard,
  getCompetitionResults,
  publishCompetitionWorksheetResults,
  publishCompetitionResults,
  finalizeCompetitionAwards,
  listCompetitionCertificates,
  generateCompetitionCertificates,
  publishCompetitionCertificates,
  unpublishCompetitionResults,
  exportCompetitionResultsCsv,
  enrollStudent,
  listCompetitionBusinessPartners,
  assignCompetitionBusinessPartners,
  removeCompetitionBusinessPartner,
  listCompetitionRegistrations,
  updateCompetitionRegistrationLevel,
  removeCompetitionRegistration,
  createCompetitionTemporaryStudent,
  lockCompetitionCenterRegistration,
  requestCompetitionCenterUnlock,
  createCompetitionWorksheetAssignments,
  cancelCompetitionWorksheetAssignment
};
