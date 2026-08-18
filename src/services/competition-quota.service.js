import { prisma } from "../lib/prisma.js";

function httpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

async function assertScope(tx, tenantId, competitionId, businessPartnerId) {
  const [competition, businessPartner] = await Promise.all([
    tx.competition.findFirst({ where: { id: competitionId, tenantId }, select: { id: true } }),
    tx.businessPartner.findFirst({
      where: { id: businessPartnerId, tenantId, isActive: true },
      select: { id: true, code: true, name: true }
    })
  ]);
  if (!competition) throw httpError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  if (!businessPartner) throw httpError(404, "Business Partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  return businessPartner;
}

async function quotaMetrics(tx, quotaId) {
  const rows = await tx.competitionQuotaAllocation.groupBy({
    by: ["status"],
    where: { quotaId },
    _sum: { approvedIds: true, requestedIds: true },
    _count: { _all: true }
  });
  const approved = rows.find((row) => row.status === "APPROVED");
  const waiting = rows.find((row) => row.status === "WAITING_FOR_QUOTA");
  return {
    usedIds: Number(approved?._sum?.approvedIds || 0),
    waitingIds: Number(waiting?._sum?.requestedIds || 0),
    waitingRequestCount: Number(waiting?._count?._all || 0)
  };
}

async function listCompetitionBusinessPartnerQuotas({ tenantId, competitionId }) {
  return prisma.$transaction(async (tx) => {
    const competition = await tx.competition.findFirst({
      where: { id: competitionId, tenantId },
      select: { id: true }
    });
    if (!competition) throw httpError(404, "Competition not found", "COMPETITION_NOT_FOUND");

    const quotas = await tx.competitionBusinessPartnerQuota.findMany({
      where: { tenantId, competitionId },
      orderBy: [{ businessPartner: { code: "asc" } }, { createdAt: "asc" }],
      select: {
        id: true,
        businessPartnerId: true,
        quotaLimit: true,
        lastChangeReason: true,
        updatedAt: true,
        businessPartner: { select: { id: true, code: true, name: true } }
      }
    });

    return Promise.all(quotas.map(async (quota) => {
      const metrics = await quotaMetrics(tx, quota.id);
      return {
        ...quota,
        ...metrics,
        remainingIds: Math.max(0, quota.quotaLimit - metrics.usedIds)
      };
    }));
  });
}

async function setCompetitionBusinessPartnerQuota({
  tenantId,
  competitionId,
  businessPartnerId,
  quotaLimit,
  reason,
  actorUserId
}) {
  const normalizedReason = String(reason || "").trim();
  const parsedLimit = Number(quotaLimit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 0) {
    throw httpError(400, "quotaLimit must be a non-negative integer", "COMPETITION_QUOTA_LIMIT_INVALID");
  }
  if (!normalizedReason) {
    throw httpError(400, "Quota change reason is required", "COMPETITION_QUOTA_REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    const businessPartner = await assertScope(tx, tenantId, competitionId, businessPartnerId);
    const current = await tx.competitionBusinessPartnerQuota.findUnique({
      where: { tenantId_competitionId_businessPartnerId: { tenantId, competitionId, businessPartnerId } },
      select: { id: true, quotaLimit: true }
    });
    const metrics = current ? await quotaMetrics(tx, current.id) : { usedIds: 0, waitingIds: 0, waitingRequestCount: 0 };
    if (parsedLimit < metrics.usedIds) {
      throw httpError(409, `Quota cannot be below ${metrics.usedIds} already-approved IDs`, "COMPETITION_QUOTA_BELOW_USED");
    }

    const quota = current
      ? await tx.competitionBusinessPartnerQuota.update({
          where: { id: current.id },
          data: { quotaLimit: parsedLimit, lastChangeReason: normalizedReason, updatedByUserId: actorUserId }
        })
      : await tx.competitionBusinessPartnerQuota.create({
          data: { tenantId, competitionId, businessPartnerId, quotaLimit: parsedLimit, lastChangeReason: normalizedReason, createdByUserId: actorUserId, updatedByUserId: actorUserId }
        });

    await tx.competitionQuotaChange.create({
      data: {
        tenantId,
        quotaId: quota.id,
        competitionId,
        businessPartnerId,
        previousLimit: current?.quotaLimit || 0,
        newLimit: parsedLimit,
        reason: normalizedReason,
        changedByUserId: actorUserId
      }
    });

    return {
      id: quota.id,
      businessPartnerId,
      businessPartner,
      quotaLimit: parsedLimit,
      lastChangeReason: normalizedReason,
      ...metrics,
      remainingIds: Math.max(0, parsedLimit - metrics.usedIds)
    };
  }, { maxWait: 5000, timeout: 15000, isolationLevel: "Serializable" });
}

async function evaluateEnrollmentListQuota({ tenantId, listId, actorUserId }) {
  return prisma.$transaction(async (tx) => {
    const list = await tx.competitionEnrollmentList.findFirst({
      where: { id: listId, tenantId, type: "CENTER_COMBINED" },
      select: {
        id: true,
        competitionId: true,
        hierarchyNodeId: true,
        status: true,
        submittedAt: true
      }
    });
    if (!list) throw httpError(404, "Competition enrollment list not found", "COMPETITION_LIST_NOT_FOUND");
    if (["APPROVED", "REJECTED"].includes(list.status)) {
      return { outcome: list.status, listId: list.id };
    }

    const center = await tx.centerProfile.findFirst({
      where: { tenantId, isActive: true, authUser: { hierarchyNodeId: list.hierarchyNodeId } },
      select: { franchiseProfile: { select: { businessPartnerId: true, isActive: true } } }
    });
    const businessPartnerId = center?.franchiseProfile?.businessPartnerId;
    if (!businessPartnerId || !center.franchiseProfile.isActive) {
      throw httpError(409, "Center Business Partner hierarchy is invalid", "COMPETITION_CENTER_SCOPE_INVALID");
    }

    const requestedIds = await tx.competitionEnrollmentListItem.count({
      where: {
        tenantId,
        listId: list.id,
        included: true,
        enrollment: { competitionId: list.competitionId, hierarchyNodeId: list.hierarchyNodeId, isActive: true }
      }
    });
    if (requestedIds < 1) throw httpError(409, "Enrollment list has no included participation IDs", "COMPETITION_LIST_EMPTY");

    const quota = await tx.competitionBusinessPartnerQuota.findUnique({
      where: { tenantId_competitionId_businessPartnerId: { tenantId, competitionId: list.competitionId, businessPartnerId } },
      select: { id: true, quotaLimit: true }
    });
    if (!quota) {
      const waitingReason = "No Competition quota is configured for this Business Partner";
      await tx.competitionEnrollmentList.update({
        where: { id: list.id },
        data: { status: "WAITING_FOR_QUOTA", locked: true, quotaEvaluatedAt: new Date(), waitingReason }
      });
      return { outcome: "WAITING_FOR_QUOTA", listId: list.id, requestedIds, waitingReason };
    }

    const used = await tx.competitionQuotaAllocation.aggregate({
      where: { quotaId: quota.id, status: "APPROVED", enrollmentListId: { not: list.id } },
      _sum: { approvedIds: true }
    });
    const usedIdsBefore = Number(used._sum.approvedIds || 0);
    const fits = usedIdsBefore + requestedIds <= quota.quotaLimit;
    const now = new Date();
    const waitingReason = fits ? null : `Requested ${requestedIds} IDs; only ${Math.max(0, quota.quotaLimit - usedIdsBefore)} quota IDs remain`;

    await tx.competitionQuotaAllocation.upsert({
      where: { enrollmentListId: list.id },
      update: {
        quotaId: quota.id,
        requestedIds,
        approvedIds: fits ? requestedIds : 0,
        quotaLimitSnapshot: quota.quotaLimit,
        usedIdsBefore,
        usedIdsAfter: fits ? usedIdsBefore + requestedIds : usedIdsBefore,
        status: fits ? "APPROVED" : "WAITING_FOR_QUOTA",
        approvalMode: fits ? "AUTO_QUOTA" : null,
        waitingReason,
        evaluatedAt: now,
        approvedAt: fits ? now : null,
        releasedAt: null
      },
      create: {
        tenantId,
        quotaId: quota.id,
        competitionId: list.competitionId,
        businessPartnerId,
        enrollmentListId: list.id,
        submittedByUserId: actorUserId,
        requestedIds,
        approvedIds: fits ? requestedIds : 0,
        quotaLimitSnapshot: quota.quotaLimit,
        usedIdsBefore,
        usedIdsAfter: fits ? usedIdsBefore + requestedIds : usedIdsBefore,
        status: fits ? "APPROVED" : "WAITING_FOR_QUOTA",
        approvalMode: fits ? "AUTO_QUOTA" : null,
        waitingReason,
        evaluatedAt: now,
        approvedAt: fits ? now : null
      }
    });

    await tx.competitionEnrollmentList.update({
      where: { id: list.id },
      data: {
        status: fits ? "SUBMITTED_TO_SUPERADMIN" : "WAITING_FOR_QUOTA",
        locked: true,
        submittedAt: list.submittedAt || now,
        forwardedAt: now,
        approvalMode: fits ? "AUTO_QUOTA" : null,
        quotaEvaluatedAt: now,
        waitingReason
      }
    });

    return { outcome: fits ? "QUOTA_RESERVED" : "WAITING_FOR_QUOTA", listId: list.id, requestedIds, quotaId: quota.id, usedIdsBefore, usedIdsAfter: fits ? usedIdsBefore + requestedIds : usedIdsBefore, waitingReason };
  }, { maxWait: 5000, timeout: 15000, isolationLevel: "Serializable" });
}

async function markQuotaValidationFailed({ tenantId, listId, message }) {
  return prisma.$transaction([
    prisma.competitionQuotaAllocation.updateMany({
      where: { tenantId, enrollmentListId: listId, status: "APPROVED" },
      data: { status: "VALIDATION_FAILED", approvedIds: 0, waitingReason: message, approvedAt: null }
    }),
    prisma.competitionEnrollmentList.updateMany({
      where: { tenantId, id: listId, status: "SUBMITTED_TO_SUPERADMIN" },
      data: { status: "WAITING_FOR_QUOTA", approvalMode: null, waitingReason: message }
    })
  ]);
}

export {
  evaluateEnrollmentListQuota,
  listCompetitionBusinessPartnerQuotas,
  markQuotaValidationFailed,
  setCompetitionBusinessPartnerQuota
};
