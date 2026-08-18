import { prisma } from "../lib/prisma.js";
import { resolveBusinessPartnerForUser } from "./bp-scope.service.js";
import { buildAssessmentSourceRevisionHash } from "./assessment-mappers/assessment-hash.service.js";
import {
  evaluateEnrollmentListQuota,
  markQuotaValidationFailed
} from "./competition-quota.service.js";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function normalizeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

async function resolveActor({ tx, tenantId, actorUserId, actorRole }) {
  const actor = await tx.authUser.findFirst({
    where: {
      id: actorUserId,
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      role: true,
      hierarchyNodeId: true,
      teacherProfile: {
        select: {
          hierarchyNodeId: true,
          isActive: true
        }
      },
      centerProfile: {
        select: {
          id: true,
          isActive: true,
          franchiseProfileId: true,
          authUser: {
            select: {
              hierarchyNodeId: true
            }
          },
          franchiseProfile: {
            select: {
              businessPartnerId: true
            }
          }
        }
      },
      franchiseProfile: {
        select: {
          id: true,
          isActive: true,
          businessPartnerId: true
        }
      }
    }
  });

  if (!actor) {
    throw createHttpError(403, "Active competition actor not found", "COMPETITION_ACTOR_FORBIDDEN");
  }

  if (actorRole && actor.role !== actorRole) {
    throw createHttpError(403, "Authenticated role does not match workflow role", "COMPETITION_ROLE_MISMATCH");
  }

  let businessPartnerId = null;
  if (actor.role === "BP") {
    const partner = await resolveBusinessPartnerForUser({
      tenantId,
      userId: actor.id,
      tx
    });
    businessPartnerId = partner?.id || null;
  } else if (actor.role === "FRANCHISE") {
    businessPartnerId = actor.franchiseProfile?.businessPartnerId || null;
  } else if (actor.role === "CENTER") {
    businessPartnerId = actor.centerProfile?.franchiseProfile?.businessPartnerId || null;
  }

  return {
    ...actor,
    businessPartnerId
  };
}

async function resolveCenterScope({ tx, tenantId, hierarchyNodeId }) {
  const center = await tx.centerProfile.findFirst({
    where: {
      tenantId,
      isActive: true,
      authUser: {
        hierarchyNodeId
      }
    },
    select: {
      id: true,
      franchiseProfileId: true,
      franchiseProfile: {
        select: {
          businessPartnerId: true,
          isActive: true
        }
      }
    }
  });

  if (!center || !center.franchiseProfile?.isActive) {
    throw createHttpError(409, "Enrollment list center hierarchy is inactive or invalid", "COMPETITION_CENTER_SCOPE_INVALID");
  }

  return {
    centerProfileId: center.id,
    franchiseProfileId: center.franchiseProfileId,
    businessPartnerId: center.franchiseProfile.businessPartnerId
  };
}

async function getEnrollmentList({ tx, tenantId, listId }) {
  const list = await tx.competitionEnrollmentList.findFirst({
    where: {
      id: listId,
      tenantId
    },
    select: {
      id: true,
      tenantId: true,
      competitionId: true,
      type: true,
      hierarchyNodeId: true,
      teacherUserId: true,
      status: true,
      locked: true,
      rejectedByUserId: true,
      rejectedBy: {
        select: {
          role: true
        }
      },
      competition: {
        select: {
          id: true,
          status: true,
          enrollmentStartAt: true,
          enrollmentEndAt: true
        }
      }
    }
  });

  if (!list) {
    throw createHttpError(404, "Competition enrollment list not found", "COMPETITION_LIST_NOT_FOUND");
  }

  return list;
}

async function assertSelectedBusinessPartner({ tx, tenantId, competitionId, businessPartnerId }) {
  const mapping = await tx.competitionWorksheetAssignment.findFirst({
    where: {
      tenantId,
      businessPartnerId,
      isActive: true,
      competitionWorksheet: {
        is: {
          tenantId,
          isActive: true,
          competitionQuestionBank: {
            is: {
              tenantId,
              isActive: true,
              competitionCourseLevel: {
                is: {
                  tenantId,
                  isActive: true,
                  competitionCourse: {
                    is: { tenantId, competitionId, isActive: true }
                  }
                }
              }
            }
          }
        }
      }
    },
    select: { id: true }
  });

  if (!mapping) {
    throw createHttpError(
      403,
      "The center's Business Partner is not selected for this competition",
      "COMPETITION_PARTNER_NOT_SELECTED"
    );
  }
}

function assertEnrollmentWindowOpen(competition) {
  const now = new Date();

  if (!["DRAFT", "SCHEDULED", "ACTIVE"].includes(competition.status)) {
    throw createHttpError(409, "Competition is not accepting enrollment lists", "COMPETITION_ENROLLMENT_CLOSED");
  }

  if (competition.enrollmentStartAt && now < competition.enrollmentStartAt) {
    throw createHttpError(409, "Competition enrollment has not opened", "COMPETITION_ENROLLMENT_NOT_OPEN");
  }

  if (competition.enrollmentEndAt && now > competition.enrollmentEndAt) {
    throw createHttpError(409, "Competition enrollment has closed", "COMPETITION_ENROLLMENT_CLOSED");
  }
}

function assertActorOwnsList({ actor, list, centerScope }) {
  if (actor.role === "SUPERADMIN") return;

  if (actor.role === "TEACHER") {
    const ownsTeacherList =
      list.type === "TEACHER" &&
      list.teacherUserId === actor.id &&
      actor.teacherProfile?.isActive &&
      actor.teacherProfile.hierarchyNodeId === list.hierarchyNodeId;

    if (!ownsTeacherList) {
      throw createHttpError(403, "Teacher does not own this enrollment list", "COMPETITION_LIST_FORBIDDEN");
    }
    return;
  }

  if (actor.role === "CENTER") {
    const actorCenterNodeId =
      actor.centerProfile?.authUser?.hierarchyNodeId || actor.hierarchyNodeId;

    if (!actor.centerProfile?.isActive || actorCenterNodeId !== list.hierarchyNodeId) {
      throw createHttpError(403, "Center does not own this enrollment list", "COMPETITION_LIST_FORBIDDEN");
    }
    return;
  }

  if (actor.role === "FRANCHISE") {
    if (
      !actor.franchiseProfile?.isActive ||
      actor.franchiseProfile.id !== centerScope.franchiseProfileId
    ) {
      throw createHttpError(403, "Franchise does not own this center list", "COMPETITION_LIST_FORBIDDEN");
    }
    return;
  }

  if (actor.role === "BP") {
    if (!actor.businessPartnerId || actor.businessPartnerId !== centerScope.businessPartnerId) {
      throw createHttpError(403, "Business Partner does not own this center list", "COMPETITION_LIST_FORBIDDEN");
    }
    return;
  }

  throw createHttpError(403, "Role cannot access competition enrollment workflow", "COMPETITION_ROLE_FORBIDDEN");
}

async function loadWorkflowContext({
  tx,
  tenantId,
  listId,
  actorUserId,
  actorRole,
  requireOpenEnrollment = false
}) {
  const [actor, list] = await Promise.all([
    resolveActor({ tx, tenantId, actorUserId, actorRole }),
    getEnrollmentList({ tx, tenantId, listId })
  ]);

  const centerScope = await resolveCenterScope({
    tx,
    tenantId,
    hierarchyNodeId: list.hierarchyNodeId
  });

  assertActorOwnsList({ actor, list, centerScope });

  await assertSelectedBusinessPartner({
    tx,
    tenantId,
    competitionId: list.competitionId,
    businessPartnerId: centerScope.businessPartnerId
  });

  if (requireOpenEnrollment) {
    assertEnrollmentWindowOpen(list.competition);
  }

  return { actor, list, centerScope };
}

function getForwardTransition({ actorRole, list }) {
  if (actorRole === "TEACHER") {
    if (list.type !== "TEACHER") return null;
    if (list.status === "DRAFT") {
      return { toStatus: "SUBMITTED_TO_CENTER", resubmission: false };
    }
    if (list.status === "REJECTED" && list.rejectedBy?.role === "CENTER") {
      return { toStatus: "SUBMITTED_TO_CENTER", resubmission: true };
    }
    return null;
  }

  if (list.type !== "CENTER_COMBINED") return null;

  if (actorRole === "CENTER") {
    if (list.status === "DRAFT") {
      return { toStatus: "SUBMITTED_TO_SUPERADMIN", resubmission: false };
    }
    if (list.status === "REJECTED") {
      return { toStatus: "SUBMITTED_TO_SUPERADMIN", resubmission: true };
    }
  }

  return null;
}

function assertListHasIncludedEntries(count) {
  if (count < 1) {
    throw createHttpError(
      409,
      "At least one student-level participation must be included",
      "COMPETITION_LIST_EMPTY"
    );
  }
}

function buildCompetitionAssessmentRevisionHash(competition) {
  return buildAssessmentSourceRevisionHash({
    competition: {
      id: competition.id,
      enrollmentStartAt: competition.enrollmentStartAt,
      enrollmentEndAt: competition.enrollmentEndAt,
      startsAt: competition.startsAt,
      endsAt: competition.endsAt,
      attemptLimit: competition.attemptLimit,
      resultStatus: competition.resultStatus,
      resultPublishedAt: competition.resultPublishedAt,
      workflowStage: competition.workflowStage,
      status: competition.status
    }
  });
}

async function ensureCompetitionAssessmentVersion({
  tx,
  tenantId,
  competition,
  actorUserId
}) {
  const assessment = await tx.assessment.upsert({
    where: {
      tenantId_sourceSystem_sourceEntityId: {
        tenantId,
        sourceSystem: "COMPETITION",
        sourceEntityId: competition.id
      }
    },
    update: {
      title: competition.title,
      description: competition.description || null,
      status: competition.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE"
    },
    create: {
      tenantId,
      assessmentType: "COMPETITION",
      sourceSystem: "COMPETITION",
      sourceEntityId: competition.id,
      title: competition.title,
      description: competition.description || null,
      status: competition.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
      createdByUserId: actorUserId || competition.createdByUserId
    },
    select: {
      id: true,
      activeVersionId: true
    }
  });

  let version = assessment.activeVersionId
    ? await tx.assessmentVersion.findFirst({
        where: {
          id: assessment.activeVersionId,
          tenantId,
          assessmentId: assessment.id
        },
        select: {
          id: true,
          versionNumber: true
        }
      })
    : null;

  if (!version) {
    version = await tx.assessmentVersion.findFirst({
      where: {
        tenantId,
        assessmentId: assessment.id,
        versionStatus: "CURRENT"
      },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        versionNumber: true
      }
    });
  }

  if (!version) {
    const latestVersion = await tx.assessmentVersion.findFirst({
      where: {
        tenantId,
        assessmentId: assessment.id
      },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        versionNumber: true
      }
    });

    version = await tx.assessmentVersion.create({
      data: {
        tenantId,
        assessmentId: assessment.id,
        versionNumber: (latestVersion?.versionNumber || 0) + 1,
        parentVersionId: latestVersion?.id || null,
        sourceEntityId: competition.id,
        sourceRevisionHash: buildCompetitionAssessmentRevisionHash(competition),
        versionStatus: "CURRENT",
        enrollmentStartAt: competition.enrollmentStartAt,
        enrollmentEndAt: competition.enrollmentEndAt,
        startsAt: competition.startsAt,
        endsAt: competition.endsAt,
        attemptLimit: competition.attemptLimit,
        resultStatusMirror: competition.resultStatus,
        resultPublishedAtMirror: competition.resultPublishedAt,
        legacyWorkflowStage: competition.workflowStage,
        createdByUserId: actorUserId || competition.createdByUserId
      },
      select: {
        id: true,
        versionNumber: true
      }
    });
  }

  await tx.assessmentVersion.update({
    where: { id: version.id },
    data: {
      sourceRevisionHash: buildCompetitionAssessmentRevisionHash(competition),
      versionStatus: "CURRENT",
      enrollmentStartAt: competition.enrollmentStartAt,
      enrollmentEndAt: competition.enrollmentEndAt,
      startsAt: competition.startsAt,
      endsAt: competition.endsAt,
      attemptLimit: competition.attemptLimit,
      resultStatusMirror: competition.resultStatus,
      resultPublishedAtMirror: competition.resultPublishedAt,
      legacyWorkflowStage: competition.workflowStage
    }
  });

  await tx.assessment.update({
    where: { id: assessment.id },
    data: {
      activeVersionId: version.id
    }
  });

  return {
    assessmentId: assessment.id,
    assessmentVersionId: version.id
  };
}

function chunkEntries(entries, size = 250) {
  const chunks = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks;
}

async function synchronizeApprovedCompetitionEntries({
  tx,
  tenantId,
  list,
  competition,
  items,
  allocations,
  actorUserId,
  approvedAt
}) {
  const { assessmentId, assessmentVersionId } =
    await ensureCompetitionAssessmentVersion({
      tx,
      tenantId,
      competition,
      actorUserId
    });

  const allocationByLevelId = new Map(
    allocations.map((allocation) => [
      allocation.competitionCourseLevelId,
      allocation
    ])
  );
  const uniqueWorksheetIds = [
    ...new Set(allocations.map((allocation) => allocation.worksheetId))
  ];

  if (uniqueWorksheetIds.length > 0) {
    await tx.legacyCompetitionWorksheetLink.createMany({
      data: uniqueWorksheetIds.map((worksheetId) => ({
        tenantId,
        competitionId: competition.id,
        worksheetId
      })),
      skipDuplicates: true
    });
  }

  if (allocations.length > 0) {
    await tx.assessmentPaper.createMany({
      data: allocations.map((allocation) => ({
        tenantId,
        assessmentVersionId,
        worksheetId: allocation.worksheetId,
        paperType: "COMMON",
        sourceMode: "COMPETITION_ASSIGNED",
        levelId: allocation.competitionCourseLevel.levelId,
        sourceListId: list.id,
        sourceLevelId: allocation.competitionCourseLevel.levelId,
        sourceWorksheetId: allocation.worksheetId,
        generationSeedMirror: allocation.worksheet.generationSeed || null,
        isPrimaryPaper: true
      })),
      skipDuplicates: true
    });
  }

  await tx.assessmentParticipant.updateMany({
    where: {
      tenantId,
      assessmentVersionId,
      sourceEntityType: "COMPETITION",
      sourceEntityId: competition.id,
      studentId: {
        in: items.map(({ enrollment }) => enrollment.studentId)
      }
    },
    data: {
      includedInAssessment: false,
      participantStatus: "EXCLUDED",
      legacyStatusMirror: "SUPERSEDED_BY_STUDENT_LEVEL_ENROLLMENT"
    }
  });

  await tx.assessmentParticipant.createMany({
    data: items.map(({ enrollment }) => ({
      tenantId,
      assessmentVersionId,
      studentId: enrollment.studentId,
      participantType: "STUDENT",
      sourceEntityType: "COMPETITION",
      sourceEntityId: enrollment.id,
      sourceContainerType: "COMPETITION_ENROLLMENT_LIST",
      sourceContainerId: list.id,
      levelId: enrollment.enrolledLevelId,
      hierarchyNodeId: enrollment.hierarchyNodeId,
      teacherUserId: enrollment.sourceTeacherUserId || null,
      includedInAssessment: true,
      participantStatus: "ACTIVE",
      legacyStatusMirror: enrollment.isTemporary
        ? "APPROVED_TEMPORARY"
        : "APPROVED",
      enrolledAt: enrollment.enrolledAt
    })),
    skipDuplicates: true
  });

  const worksheetAssignments = items
    .map(({ enrollment }) => {
      const allocation = allocationByLevelId.get(
        enrollment.competitionCourseLevelId
      );
      if (!allocation) return null;
      return {
        tenantId,
        worksheetId: allocation.worksheetId,
        studentId: enrollment.studentId,
        createdByUserId: actorUserId,
        assignedAt: approvedAt,
        dueDate: competition.endsAt,
        isActive: true
      };
    })
    .filter(Boolean);

  let worksheetAssignmentCreatedCount = 0;
  if (worksheetAssignments.length > 0) {
    const createdAssignments = await tx.worksheetAssignment.createMany({
      data: worksheetAssignments,
      skipDuplicates: true
    });
    worksheetAssignmentCreatedCount = createdAssignments.count;
  }

  for (const assignmentChunk of chunkEntries(worksheetAssignments)) {
    await tx.worksheetAssignment.updateMany({
      where: {
        tenantId,
        OR: assignmentChunk.map(({ worksheetId, studentId }) => ({
          worksheetId,
          studentId
        }))
      },
      data: {
        dueDate: competition.endsAt,
        unassignedAt: null,
        isActive: true
      }
    });
  }

  return {
    assessmentId,
    assessmentVersionId,
    assessmentPaperCount: uniqueWorksheetIds.length,
    assessmentParticipantCount: items.length,
    worksheetAssignmentCount: worksheetAssignments.length,
    worksheetAssignmentCreatedCount
  };
}

async function synchronizeDeferredCompetitionWorksheetAssignments({
  tenantId,
  competitionId,
  competitionCourseLevelId,
  businessPartnerIds,
  actorUserId
}) {
  const partnerIds = [...new Set(
    (Array.isArray(businessPartnerIds) ? businessPartnerIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];

  if (!partnerIds.length) {
    return { processedListCount: 0, approvedParticipationCount: 0, worksheetAssignmentCount: 0 };
  }

  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findFirst({
      where: { id: competitionId, tenantId },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        resultStatus: true,
        resultPublishedAt: true,
        workflowStage: true,
        enrollmentStartAt: true,
        enrollmentEndAt: true,
        startsAt: true,
        endsAt: true,
        attemptLimit: true,
        createdByUserId: true
      }
    });
    if (!competition) {
      throw createHttpError(404, "Competition not found", "COMPETITION_NOT_FOUND");
    }

    const assignmentRows = await tx.competitionWorksheetAssignment.findMany({
      where: {
        tenantId,
        businessPartnerId: { in: partnerIds },
        isActive: true,
        competitionWorksheet: {
          is: {
            tenantId,
            isActive: true,
            worksheetId: { not: null },
            competitionQuestionBank: {
              is: {
                tenantId,
                isActive: true,
                competitionCourseLevel: {
                  is: {
                    tenantId,
                    id: competitionCourseLevelId,
                    isActive: true,
                    competitionCourse: { is: { tenantId, competitionId, isActive: true } }
                  }
                }
              }
            },
            worksheet: { is: { tenantId, isPublished: true } }
          }
        }
      },
      select: {
        id: true,
        businessPartnerId: true,
        competitionWorksheet: {
          select: {
            worksheetId: true,
            competitionQuestionBank: {
              select: {
                competitionCourseLevel: { select: { id: true, levelId: true } }
              }
            },
            worksheet: {
              select: { tenantId: true, levelId: true, isPublished: true, generationSeed: true }
            }
          }
        }
      }
    });

    const rowsByPartner = new Map();
    for (const row of assignmentRows) {
      const rows = rowsByPartner.get(row.businessPartnerId) || [];
      rows.push(row);
      rowsByPartner.set(row.businessPartnerId, rows);
    }

    const allocationByPartner = new Map();
    for (const [businessPartnerId, rows] of rowsByPartner) {
      if (rows.length !== 1) continue;
      const row = rows[0];
      const courseLevel = row.competitionWorksheet.competitionQuestionBank.competitionCourseLevel;
      const worksheet = row.competitionWorksheet.worksheet;
      if (!worksheet || worksheet.tenantId !== tenantId || !worksheet.isPublished || worksheet.levelId !== courseLevel.levelId) continue;
      allocationByPartner.set(businessPartnerId, {
        id: row.id,
        competitionCourseLevelId: courseLevel.id,
        worksheetId: row.competitionWorksheet.worksheetId,
        competitionCourseLevel: courseLevel,
        worksheet
      });
    }

    const lists = await tx.competitionEnrollmentList.findMany({
      where: {
        tenantId,
        competitionId,
        type: "CENTER_COMBINED",
        status: "APPROVED",
        items: {
          some: {
            included: true,
            enrollment: {
              competitionCourseLevelId,
              isActive: true,
              approvedAt: { not: null }
            }
          }
        }
      },
      orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        competitionId: true,
        hierarchyNodeId: true,
        approvedAt: true,
        items: {
          where: {
            included: true,
            enrollment: {
              competitionCourseLevelId,
              isActive: true,
              approvedAt: { not: null }
            }
          },
          select: {
            enrollmentId: true,
            enrollment: {
              select: {
                id: true,
                competitionCourseLevelId: true,
                studentId: true,
                enrolledLevelId: true,
                hierarchyNodeId: true,
                sourceTeacherUserId: true,
                isTemporary: true,
                enrolledAt: true
              }
            }
          }
        }
      }
    });

    let processedListCount = 0;
    let approvedParticipationCount = 0;
    let worksheetAssignmentCount = 0;
    const processedEnrollmentIds = new Set();

    for (const list of lists) {
      const centerScope = await resolveCenterScope({ tx, tenantId, hierarchyNodeId: list.hierarchyNodeId });
      const allocation = allocationByPartner.get(centerScope.businessPartnerId);
      if (!allocation) continue;
      const items = list.items.filter(({ enrollmentId }) => {
        if (processedEnrollmentIds.has(enrollmentId)) return false;
        processedEnrollmentIds.add(enrollmentId);
        return true;
      });
      if (!items.length) continue;

      const result = await synchronizeApprovedCompetitionEntries({
        tx,
        tenantId,
        list,
        competition,
        items,
        allocations: [allocation],
        actorUserId,
        approvedAt: list.approvedAt || new Date()
      });
      processedListCount += 1;
      approvedParticipationCount += items.length;
      worksheetAssignmentCount += result.worksheetAssignmentCreatedCount;
    }

    return { processedListCount, approvedParticipationCount, worksheetAssignmentCount };
  }, { maxWait: 5000, timeout: 30000 });
}

async function forwardCompetitionEnrollmentList({
  tenantId,
  listId,
  actorUserId,
  actorRole
}) {
  const forwarded = await prisma.$transaction(async (tx) => {
    const { list } = await loadWorkflowContext({
      tx,
      tenantId,
      listId,
      actorUserId,
      actorRole,
      requireOpenEnrollment: ["TEACHER", "CENTER"].includes(actorRole)
    });

    const transition = getForwardTransition({ actorRole, list });
    if (!transition) {
      throw createHttpError(
        409,
        "Enrollment list is not forwardable by this role at its current stage",
        "COMPETITION_LIST_STAGE_CONFLICT"
      );
    }

    const includedCount = await tx.competitionEnrollmentListItem.count({
      where: {
        tenantId,
        listId: list.id,
        included: true,
        enrollment: {
          competitionId: list.competitionId,
          hierarchyNodeId: list.hierarchyNodeId,
          isActive: true
        }
      }
    });
    assertListHasIncludedEntries(includedCount);

    const now = new Date();
    const updated = await tx.competitionEnrollmentList.update({
      where: { id: list.id },
      data: {
        status: transition.toStatus,
        locked: true,
        submittedAt: list.status === "DRAFT" ? now : undefined,
        forwardedAt: now,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectedRemark: null
      }
    });

    return {
      list: updated,
      fromStatus: list.status,
      toStatus: transition.toStatus,
      includedCount,
      resubmission: transition.resubmission
    };
  });

  if (actorRole !== "CENTER") return forwarded;

  const quota = await evaluateEnrollmentListQuota({ tenantId, listId, actorUserId });
  if (quota.outcome !== "QUOTA_RESERVED") {
    return { ...forwarded, list: { ...forwarded.list, status: quota.outcome }, toStatus: quota.outcome, quota };
  }

  try {
    const approval = await approveCompetitionEnrollmentList({
      tenantId,
      listId,
      actorUserId,
      actorRole: "CENTER"
    });
    return { ...forwarded, ...approval, toStatus: "APPROVED", quota };
  } catch (error) {
    await markQuotaValidationFailed({ tenantId, listId, message: error.message });
    throw error;
  }
}

const returnRuleByRole = {
  CENTER: {
    type: "TEACHER",
    fromStatus: "SUBMITTED_TO_CENTER"
  },
  SUPERADMIN: {
    type: "CENTER_COMBINED",
    fromStatus: "SUBMITTED_TO_SUPERADMIN"
  }
};

async function returnCompetitionEnrollmentList({
  tenantId,
  listId,
  actorUserId,
  actorRole,
  remark
}) {
  const reason = normalizeText(remark);
  if (!reason) {
    throw createHttpError(400, "Return reason is required", "COMPETITION_RETURN_REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const { list } = await loadWorkflowContext({
      tx,
      tenantId,
      listId,
      actorUserId,
      actorRole
    });

    const rule = returnRuleByRole[actorRole];
    if (!rule || list.type !== rule.type || list.status !== rule.fromStatus) {
      throw createHttpError(
        409,
        "Enrollment list is not returnable by this role at its current stage",
        "COMPETITION_LIST_STAGE_CONFLICT"
      );
    }

    const now = new Date();
    const updated = await tx.competitionEnrollmentList.update({
      where: { id: list.id },
      data: {
        status: "REJECTED",
        locked: false,
        approvedAt: null,
        rejectedAt: now,
        rejectedByUserId: actorUserId,
        rejectedRemark: reason
      }
    });

    return {
      list: updated,
      fromStatus: list.status,
      toStatus: "REJECTED"
    };
  });
}

function canEditInclusion({ actorRole, list }) {
  if (actorRole === "TEACHER") {
    return (
      list.type === "TEACHER" &&
      (list.status === "DRAFT" ||
        (list.status === "REJECTED" && list.rejectedBy?.role === "CENTER"))
    );
  }

  if (list.type !== "CENTER_COMBINED") return false;

  if (actorRole === "CENTER") {
    return (
      list.status === "DRAFT" ||
      (list.status === "REJECTED" && list.rejectedBy?.role === "FRANCHISE")
    );
  }

  if (actorRole === "SUPERADMIN") {
    return list.status === "SUBMITTED_TO_SUPERADMIN";
  }

  return false;
}

async function setCompetitionEnrollmentInclusion({
  tenantId,
  listId,
  enrollmentId,
  included,
  reason,
  actorUserId,
  actorRole
}) {
  if (typeof included !== "boolean") {
    throw createHttpError(400, "included must be true or false", "COMPETITION_INCLUDED_INVALID");
  }

  const exclusionReason = normalizeText(reason);
  if (!included && !exclusionReason) {
    throw createHttpError(
      400,
      "Exclusion reason is required when unselecting a participation",
      "COMPETITION_EXCLUSION_REASON_REQUIRED"
    );
  }

  return prisma.$transaction(async (tx) => {
    const { list } = await loadWorkflowContext({
      tx,
      tenantId,
      listId,
      actorUserId,
      actorRole,
      requireOpenEnrollment: ["TEACHER", "CENTER"].includes(actorRole)
    });

    if (!canEditInclusion({ actorRole, list })) {
      throw createHttpError(
        409,
        "Enrollment inclusion cannot be changed by this role at the current stage",
        "COMPETITION_LIST_STAGE_CONFLICT"
      );
    }

    const item = await tx.competitionEnrollmentListItem.findFirst({
      where: {
        tenantId,
        listId: list.id,
        enrollmentId,
        enrollment: {
          competitionId: list.competitionId,
          hierarchyNodeId: list.hierarchyNodeId
        }
      },
      select: {
        listId: true,
        enrollmentId: true
      }
    });

    if (!item) {
      throw createHttpError(
        404,
        "Student-level participation was not found in this list",
        "COMPETITION_LIST_ITEM_NOT_FOUND"
      );
    }

    return tx.competitionEnrollmentListItem.update({
      where: {
        listId_enrollmentId: {
          listId: list.id,
          enrollmentId
        }
      },
      data: {
        included,
        exclusionReason: included ? null : exclusionReason
      }
    });
  });
}

async function approveCompetitionEnrollmentList({
  tenantId,
  listId,
  actorUserId,
  actorRole,
  approvalMode
}) {
  if (
    !prisma.assessment ||
    !prisma.assessmentVersion ||
    !prisma.assessmentPaper ||
    !prisma.assessmentParticipant
  ) {
    throw createHttpError(
      409,
      "Competition approval is unavailable until the assessment contract is deployed",
      "COMPETITION_ASSESSMENT_CONTRACT_UNAVAILABLE"
    );
  }

  return prisma.$transaction(async (tx) => {
    const { list, centerScope } = await loadWorkflowContext({
      tx,
      tenantId,
      listId,
      actorUserId,
      actorRole
    });

    if (!["SUPERADMIN", "CENTER"].includes(actorRole)) {
      throw createHttpError(403, "Role cannot approve enrollment lists", "COMPETITION_ROLE_FORBIDDEN");
    }

    if (list.type !== "CENTER_COMBINED" || list.status !== "SUBMITTED_TO_SUPERADMIN") {
      throw createHttpError(
        409,
        "Only a combined center list submitted to Superadmin can be approved",
        "COMPETITION_LIST_STAGE_CONFLICT"
      );
    }

    const items = await tx.competitionEnrollmentListItem.findMany({
      where: {
        tenantId,
        listId: list.id,
        included: true
      },
      select: {
        enrollmentId: true,
        enrollment: {
          select: {
            id: true,
            tenantId: true,
            competitionId: true,
            competitionCourseLevelId: true,
            studentId: true,
            enrolledLevelId: true,
            hierarchyNodeId: true,
            sourceTeacherUserId: true,
            isTemporary: true,
            isActive: true,
            enrolledAt: true
          }
        }
      }
    });

    assertListHasIncludedEntries(items.length);

    const invalidItem = items.find(
      ({ enrollment }) =>
        enrollment.tenantId !== tenantId ||
        enrollment.competitionId !== list.competitionId ||
        enrollment.hierarchyNodeId !== list.hierarchyNodeId ||
        !enrollment.isActive ||
        !enrollment.competitionCourseLevelId
    );

    if (invalidItem) {
      throw createHttpError(
        409,
        "List contains an invalid or legacy student-level participation",
        "COMPETITION_ENROLLMENT_INVALID"
      );
    }

    const courseLevelIds = [
      ...new Set(items.map(({ enrollment }) => enrollment.competitionCourseLevelId))
    ];

    const worksheetAssignmentRows =
      await tx.competitionWorksheetAssignment.findMany({
        where: {
          tenantId,
          businessPartnerId: centerScope.businessPartnerId,
          isActive: true,
          competitionWorksheet: {
            is: {
              tenantId,
              isActive: true,
              worksheetId: { not: null },
              competitionQuestionBank: {
                is: {
                  tenantId,
                  isActive: true,
                  competitionCourseLevel: {
                    is: {
                      tenantId,
                      id: { in: courseLevelIds },
                      isActive: true,
                      competitionCourse: {
                        is: {
                          tenantId,
                          competitionId: list.competitionId,
                          isActive: true
                        }
                      }
                    }
                  }
                }
              },
              worksheet: {
                is: {
                  tenantId,
                  isPublished: true
                }
              }
            }
          }
        },
        select: {
          id: true,
          competitionWorksheet: {
            select: {
              worksheetId: true,
              competitionQuestionBank: {
                select: {
                  competitionCourseLevel: {
                    select: {
                      id: true,
                      levelId: true
                    }
                  }
                }
              },
              worksheet: {
                select: {
                  tenantId: true,
                  levelId: true,
                  isPublished: true,
                  generationSeed: true
                }
              }
            }
          }
        }
      });

    const allocations = worksheetAssignmentRows.map((row) => ({
      id: row.id,
      competitionCourseLevelId:
        row.competitionWorksheet.competitionQuestionBank
          .competitionCourseLevel.id,
      worksheetId: row.competitionWorksheet.worksheetId,
      competitionCourseLevel:
        row.competitionWorksheet.competitionQuestionBank
          .competitionCourseLevel,
      worksheet: row.competitionWorksheet.worksheet
    }));

    const allocationCountByLevelId = new Map();
    for (const allocation of allocations) {
      allocationCountByLevelId.set(
        allocation.competitionCourseLevelId,
        (allocationCountByLevelId.get(allocation.competitionCourseLevelId) || 0) + 1
      );
    }

    const executableAllocations = allocations.filter(
      (allocation) =>
        (allocationCountByLevelId.get(allocation.competitionCourseLevelId) || 0) === 1 &&
        allocation.worksheet &&
        allocation.worksheet.tenantId === tenantId &&
        allocation.worksheet.isPublished &&
        allocation.worksheet.levelId === allocation.competitionCourseLevel.levelId
    );
    const executableLevelIds = new Set(
      executableAllocations.map((allocation) => allocation.competitionCourseLevelId)
    );
    const deferredWorksheetLevelIds = courseLevelIds.filter(
      (id) => !executableLevelIds.has(id)
    );

    const now = new Date();
    const approvedEnrollmentIds = items.map(({ enrollmentId }) => enrollmentId);
    const competition = await tx.competition.findFirst({
      where: {
        id: list.competitionId,
        tenantId
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        resultStatus: true,
        resultPublishedAt: true,
        workflowStage: true,
        enrollmentStartAt: true,
        enrollmentEndAt: true,
        startsAt: true,
        endsAt: true,
        attemptLimit: true,
        createdByUserId: true
      }
    });

    if (!competition) {
      throw createHttpError(
        404,
        "Competition not found",
        "COMPETITION_NOT_FOUND"
      );
    }

    await tx.competitionEnrollment.updateMany({
      where: {
        tenantId,
        competitionId: list.competitionId,
        hierarchyNodeId: list.hierarchyNodeId,
        id: {
          in: approvedEnrollmentIds
        }
      },
      data: {
        approvedAt: now
      }
    });

    await tx.competitionEnrollment.updateMany({
      where: {
        tenantId,
        competitionId: list.competitionId,
        hierarchyNodeId: list.hierarchyNodeId,
        listItems: {
          some: {
            listId: list.id,
            included: false
          }
        }
      },
      data: {
        approvedAt: null
      }
    });

    const synchronization = await synchronizeApprovedCompetitionEntries({
      tx,
      tenantId,
      list,
      competition,
      items,
      allocations: executableAllocations,
      actorUserId,
      approvedAt: now
    });

    const updated = await tx.competitionEnrollmentList.update({
      where: { id: list.id },
      data: {
        status: "APPROVED",
        locked: true,
        approvedAt: now,
        approvalMode: approvalMode || (actorRole === "CENTER" ? "AUTO_QUOTA" : "SUPERADMIN_OVERRIDE"),
        quotaEvaluatedAt: approvalMode === "AUTO_QUOTA" || actorRole === "CENTER" ? now : undefined,
        waitingReason: null,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectedRemark: null
      }
    });

    return {
      list: updated,
      approvedParticipationCount: approvedEnrollmentIds.length,
      worksheetAllocationCount: executableAllocations.length,
      deferredWorksheetLevelCount: deferredWorksheetLevelIds.length,
      ...synchronization
    };
  }, {
    maxWait: 5000,
    timeout: 30000
  });
}

async function reprocessCompetitionQuotaRequests({
  tenantId,
  competitionId,
  businessPartnerId,
  actorUserId
}) {
  const candidates = await prisma.competitionEnrollmentList.findMany({
    where: {
      tenantId,
      competitionId,
      type: "CENTER_COMBINED",
      status: { in: ["WAITING_FOR_QUOTA", "SUBMITTED_TO_FRANCHISE", "SUBMITTED_TO_BUSINESS_PARTNER"] },
      centerNode: {
        is: {
          users: {
            some: {
              centerProfile: {
                is: { franchiseProfile: { is: { businessPartnerId } } }
              }
            }
          }
        }
      }
    },
    orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
    select: { id: true }
  });

  const results = [];
  for (const candidate of candidates) {
    const quota = await evaluateEnrollmentListQuota({ tenantId, listId: candidate.id, actorUserId });
    if (quota.outcome !== "QUOTA_RESERVED") {
      results.push({ listId: candidate.id, outcome: quota.outcome });
      continue;
    }
    try {
      const approval = await approveCompetitionEnrollmentList({
        tenantId,
        listId: candidate.id,
        actorUserId,
        actorRole: "SUPERADMIN",
        approvalMode: "AUTO_QUOTA"
      });
      results.push({ listId: candidate.id, outcome: "APPROVED", approvedParticipationCount: approval.approvedParticipationCount });
    } catch (error) {
      await markQuotaValidationFailed({ tenantId, listId: candidate.id, message: error.message });
      results.push({ listId: candidate.id, outcome: "VALIDATION_FAILED", message: error.message });
    }
  }
  return results;
}

export {
  approveCompetitionEnrollmentList,
  forwardCompetitionEnrollmentList,
  reprocessCompetitionQuotaRequests,
  returnCompetitionEnrollmentList,
  setCompetitionEnrollmentInclusion,
  synchronizeDeferredCompetitionWorksheetAssignments
};
