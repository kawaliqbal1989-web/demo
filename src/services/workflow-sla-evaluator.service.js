import { prisma } from "../lib/prisma.js";

const ACTIVE_ESCALATION_STATES = ["ACTIVE", "ACKNOWLEDGED"];
const ACTIVE_TASK_STATES = ["OPEN", "IN_PROGRESS", "OVERDUE"];
const REJECTION_LOOKBACK_DAYS = 30;

const WORKFLOW_SLA_RULES = {
  UNREVIEWED_SETTLEMENT: {
    notificationType: "PENDING_SETTLEMENT",
    actionRequiredRole: "FRANCHISE",
    thresholdsHours: { warning: 24, high: 72, critical: 168 },
    reminderCooldownHours: { WARNING: 24, HIGH: 24, CRITICAL: 12 }
  },
  UNAPPROVED_SETTLEMENT: {
    notificationType: "PENDING_SETTLEMENT",
    actionRequiredRole: "BP",
    thresholdsHours: { warning: 24, high: 72, critical: 168 },
    reminderCooldownHours: { WARNING: 24, HIGH: 24, CRITICAL: 12 }
  },
  PAYOUT_DELAY: {
    notificationType: "SETTLEMENT_PAYOUT_DELAY",
    actionRequiredRole: "SUPERADMIN",
    thresholdsHours: { warning: 24, high: 72, critical: 168 },
    reminderCooldownHours: { WARNING: 24, HIGH: 24, CRITICAL: 12 }
  },
  REPEATED_REJECTION: {
    notificationType: "SETTLEMENT_REPEATED_REJECTION",
    actionRequiredRole: "FRANCHISE",
    thresholdsHours: null,
    reminderCooldownHours: { WARNING: 48, HIGH: 48, CRITICAL: 24 }
  },
  ACTIVE_ESCALATION: {
    notificationType: "SETTLEMENT_ESCALATION_TRIGGERED",
    actionRequiredRole: "BP",
    thresholdsHours: { warning: 24, high: 72, critical: 168 },
    reminderCooldownHours: { WARNING: 24, HIGH: 24, CRITICAL: 12 }
  }
};

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const normalized = value instanceof Date ? value : new Date(value);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function addHours(value, hours) {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

function getHoursElapsed(from, to) {
  const start = normalizeDate(from);
  const end = normalizeDate(to);
  if (!start || !end) {
    return null;
  }

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60)));
}

function getSettlementWorkflowEscalationSeverity(hoursElapsed) {
  if (!Number.isFinite(hoursElapsed)) {
    return null;
  }

  if (hoursElapsed >= 24 * 7) {
    return "CRITICAL";
  }
  if (hoursElapsed >= 72) {
    return "HIGH";
  }
  if (hoursElapsed >= 24) {
    return "WARNING";
  }
  return null;
}

function getRepeatedRejectionSeverity(rejectionCount) {
  if (rejectionCount >= 3) {
    return "CRITICAL";
  }
  if (rejectionCount >= 2) {
    return "HIGH";
  }
  return null;
}

function getSettlementWorkflowReminderCooldownHours(ruleKey, severity) {
  return WORKFLOW_SLA_RULES[ruleKey]?.reminderCooldownHours?.[severity] || 24;
}

function buildWorkflowNotificationDeepLink(settlementId) {
  return `/bp/settlements/${settlementId}`;
}

function buildWorkflowAutomationActiveFingerprint({ businessPartnerId, settlementId, ruleKey, escalationId = null }) {
  return [
    "bp",
    businessPartnerId,
    "workflow",
    "settlement",
    settlementId,
    "rule",
    ruleKey,
    escalationId || "none"
  ].join(":");
}

function buildWorkflowAutomationFingerprint({ activeFingerprint, asOf, cooldownHours, severity }) {
  const slotSizeMs = Math.max(1, Number(cooldownHours || 24)) * 60 * 60 * 1000;
  const normalizedAsOf = normalizeDate(asOf) || new Date();
  const slot = Math.floor(normalizedAsOf.getTime() / slotSizeMs);
  return `${activeFingerprint}:severity:${severity}:slot:${slot}`;
}

function getPeriodLabel(settlement) {
  const month = String(settlement?.periodMonth || "").padStart(2, "0");
  return `${settlement?.periodYear || "unknown"}-${month || "??"}`;
}

function getActionRequiredRole(settlement, fallbackRole) {
  return settlement?.currentActionRole || fallbackRole || null;
}

function findActiveEscalationByType(settlement, escalationType) {
  return (settlement?.escalations || []).find(
    (escalation) => escalation?.escalationType === escalationType && ACTIVE_ESCALATION_STATES.includes(String(escalation?.state || "").toUpperCase())
  ) || null;
}

function deriveSettlementScope(settlement) {
  const activeTask = (settlement?.workflowTasks || []).find((task) => ACTIVE_TASK_STATES.includes(String(task?.state || "").toUpperCase()));
  const latestHistory = (settlement?.workflowHistory || [])[0] || null;
  const activeEscalation = (settlement?.escalations || [])[0] || null;

  return {
    franchiseId: activeEscalation?.franchiseId || activeTask?.franchiseId || latestHistory?.franchiseId || null,
    centerId: activeEscalation?.centerId || activeTask?.centerId || latestHistory?.centerId || null,
    activeTask: activeTask || null
  };
}

function buildWorkflowIssue({
  settlement,
  ruleKey,
  escalationType,
  severity,
  existingEscalation,
  asOf,
  anchorDate,
  hoursElapsed,
  rejectionCount = null,
  extraMetadata = {}
}) {
  const config = WORKFLOW_SLA_RULES[ruleKey];
  const cooldownHours = getSettlementWorkflowReminderCooldownHours(ruleKey, severity);
  const scope = deriveSettlementScope(settlement);
  const activeFingerprint = buildWorkflowAutomationActiveFingerprint({
    businessPartnerId: settlement.businessPartnerId,
    settlementId: settlement.id,
    ruleKey: escalationType,
    escalationId: existingEscalation?.id || null
  });

  return {
    tenantId: settlement.tenantId,
    businessPartnerId: settlement.businessPartnerId,
    settlementId: settlement.id,
    workflowStatus: settlement.status,
    workflowVersion: settlement.workflowVersion,
    escalationType,
    notificationType: config.notificationType,
    severity,
    existingSeverity: existingEscalation?.severity || null,
    escalationId: existingEscalation?.id || null,
    actionRequiredRole: getActionRequiredRole(settlement, config.actionRequiredRole),
    deepLinkPath: buildWorkflowNotificationDeepLink(settlement.id),
    activeFingerprint,
    fingerprint: buildWorkflowAutomationFingerprint({ activeFingerprint, asOf, cooldownHours, severity }),
    cooldownUntil: addHours(normalizeDate(asOf) || new Date(), cooldownHours),
    hoursElapsed,
    anchorDate: normalizeDate(anchorDate),
    franchiseId: scope.franchiseId,
    centerId: scope.centerId,
    title: `${getPeriodLabel(settlement)} workflow requires attention`,
    message: buildWorkflowIssueMessage({ settlement, escalationType, severity, hoursElapsed, rejectionCount }),
    metadata: {
      settlementId: settlement.id,
      workflowId: settlement.id,
      workflowVersion: settlement.workflowVersion,
      workflowStatus: settlement.status,
      escalationId: existingEscalation?.id || null,
      escalationSeverity: severity,
      actionRequiredRole: getActionRequiredRole(settlement, config.actionRequiredRole),
      deepLinkPath: buildWorkflowNotificationDeepLink(settlement.id),
      sourceRule: ruleKey,
      hoursElapsed,
      rejectionCount,
      ...extraMetadata
    }
  };
}

function buildWorkflowIssueMessage({ settlement, escalationType, severity, hoursElapsed, rejectionCount }) {
  const periodLabel = getPeriodLabel(settlement);

  if (escalationType === "UNREVIEWED_SETTLEMENT") {
    return `${periodLabel} is pending franchise review for ${hoursElapsed}h and now requires ${severity.toLowerCase()} attention.`;
  }
  if (escalationType === "UNAPPROVED_SETTLEMENT") {
    return `${periodLabel} is waiting for BP approval for ${hoursElapsed}h and now requires ${severity.toLowerCase()} attention.`;
  }
  if (escalationType === "PAYOUT_DELAY") {
    return `${periodLabel} payout is overdue by ${hoursElapsed}h and now requires ${severity.toLowerCase()} action.`;
  }
  if (escalationType === "REPEATED_REJECTION") {
    return `${periodLabel} has entered ${rejectionCount} rejection cycles within the last ${REJECTION_LOOKBACK_DAYS} days.`;
  }

  return `${periodLabel} has an active ${escalationType.toLowerCase().replaceAll("_", " ")} escalation for ${hoursElapsed}h.`;
}

function evaluateSettlementWorkflowCandidate(settlement, { asOf = new Date() } = {}) {
  const issues = [];
  const normalizedAsOf = normalizeDate(asOf) || new Date();

  if (settlement?.status === "PENDING_REVIEW") {
    const anchorDate = settlement.submittedAt || settlement.lastWorkflowActionAt || settlement.updatedAt || settlement.createdAt;
    const hoursElapsed = getHoursElapsed(anchorDate, normalizedAsOf);
    const severity = getSettlementWorkflowEscalationSeverity(hoursElapsed);
    if (severity) {
      issues.push(
        buildWorkflowIssue({
          settlement,
          ruleKey: "UNREVIEWED_SETTLEMENT",
          escalationType: "UNREVIEWED_SETTLEMENT",
          severity,
          existingEscalation: findActiveEscalationByType(settlement, "UNREVIEWED_SETTLEMENT"),
          asOf: normalizedAsOf,
          anchorDate,
          hoursElapsed
        })
      );
    }
  }

  if (settlement?.status === "REVIEWED") {
    const anchorDate = settlement.reviewedAt || settlement.lastWorkflowActionAt || settlement.updatedAt || settlement.createdAt;
    const hoursElapsed = getHoursElapsed(anchorDate, normalizedAsOf);
    const severity = getSettlementWorkflowEscalationSeverity(hoursElapsed);
    if (severity) {
      issues.push(
        buildWorkflowIssue({
          settlement,
          ruleKey: "UNAPPROVED_SETTLEMENT",
          escalationType: "UNAPPROVED_SETTLEMENT",
          severity,
          existingEscalation: findActiveEscalationByType(settlement, "UNAPPROVED_SETTLEMENT"),
          asOf: normalizedAsOf,
          anchorDate,
          hoursElapsed
        })
      );
    }
  }

  if (["APPROVED", "OVERDUE", "ESCALATED"].includes(settlement?.status) && settlement?.payoutDueAt) {
    const hoursElapsed = getHoursElapsed(settlement.payoutDueAt, normalizedAsOf);
    const severity = getSettlementWorkflowEscalationSeverity(hoursElapsed);
    if (severity) {
      issues.push(
        buildWorkflowIssue({
          settlement,
          ruleKey: "PAYOUT_DELAY",
          escalationType: "PAYOUT_DELAY",
          severity,
          existingEscalation: findActiveEscalationByType(settlement, "PAYOUT_DELAY"),
          asOf: normalizedAsOf,
          anchorDate: settlement.payoutDueAt,
          hoursElapsed,
          extraMetadata: {
            payoutDueAt: normalizeDate(settlement.payoutDueAt)?.toISOString() || null
          }
        })
      );
    }
  }

  for (const escalation of settlement?.escalations || []) {
    if (!ACTIVE_ESCALATION_STATES.includes(String(escalation?.state || "").toUpperCase())) {
      continue;
    }

    const anchorDate = escalation.triggeredAt || escalation.createdAt;
    const hoursElapsed = getHoursElapsed(anchorDate, normalizedAsOf);
    const targetSeverity = getSettlementWorkflowEscalationSeverity(hoursElapsed);
    const severity = targetSeverity || escalation.severity || "WARNING";

    issues.push(
      buildWorkflowIssue({
        settlement,
        ruleKey: "ACTIVE_ESCALATION",
        escalationType: escalation.escalationType,
        severity,
        existingEscalation: escalation,
        asOf: normalizedAsOf,
        anchorDate,
        hoursElapsed,
        extraMetadata: {
          escalationTriggeredAt: normalizeDate(anchorDate)?.toISOString() || null,
          escalationState: escalation.state,
          escalationReason: escalation.escalationReason || null,
          notificationType: severity !== escalation.severity ? "SETTLEMENT_ESCALATION_SEVERITY_INCREASED" : "SETTLEMENT_ESCALATION_TRIGGERED"
        }
      })
    );
  }

  const rejections = Array.isArray(settlement?.workflowHistory)
    ? settlement.workflowHistory.filter((entry) => entry?.actionType === "REJECT")
    : [];
  const rejectionCount = rejections.length;
  const repeatedSeverity = getRepeatedRejectionSeverity(rejectionCount);
  if (repeatedSeverity) {
    issues.push(
      buildWorkflowIssue({
        settlement,
        ruleKey: "REPEATED_REJECTION",
        escalationType: "REPEATED_REJECTION",
        severity: repeatedSeverity,
        existingEscalation: findActiveEscalationByType(settlement, "REPEATED_REJECTION"),
        asOf: normalizedAsOf,
        anchorDate: rejections[0]?.createdAt || settlement.lastWorkflowActionAt || settlement.updatedAt || settlement.createdAt,
        hoursElapsed: getHoursElapsed(rejections[0]?.createdAt || settlement.lastWorkflowActionAt, normalizedAsOf),
        rejectionCount,
        extraMetadata: {
          latestRejectionAt: normalizeDate(rejections[0]?.createdAt)?.toISOString() || null
        }
      })
    );
  }

  return issues;
}

async function listSettlementWorkflowSlaCandidates({ tenantId, businessPartnerId, asOf = new Date(), tx = prisma, batchSize = 200 } = {}) {
  if (!tenantId || !businessPartnerId) {
    return [];
  }

  const rejectionLookbackStart = addHours(normalizeDate(asOf) || new Date(), -(REJECTION_LOOKBACK_DAYS * 24));
  return tx.settlement.findMany({
    where: {
      tenantId,
      businessPartnerId,
      OR: [
        {
          status: {
            in: ["PENDING_REVIEW", "REVIEWED", "APPROVED", "OVERDUE", "ESCALATED", "REJECTED", "DRAFT"]
          }
        },
        {
          workflowHistory: {
            some: {
              actionType: "REJECT",
              createdAt: { gte: rejectionLookbackStart }
            }
          }
        }
      ]
    },
    orderBy: [{ lastWorkflowActionAt: "asc" }, { createdAt: "asc" }],
    take: batchSize,
    select: {
      id: true,
      tenantId: true,
      businessPartnerId: true,
      status: true,
      workflowVersion: true,
      currentActionRole: true,
      periodYear: true,
      periodMonth: true,
      submittedAt: true,
      reviewedAt: true,
      payoutDueAt: true,
      lastWorkflowActionAt: true,
      createdAt: true,
      updatedAt: true,
      escalations: {
        where: {
          state: { in: ACTIVE_ESCALATION_STATES }
        },
        orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          franchiseId: true,
          centerId: true,
          escalationType: true,
          severity: true,
          state: true,
          triggeredAt: true,
          createdAt: true,
          escalationReason: true,
          metadata: true
        }
      },
      workflowTasks: {
        where: {
          state: { in: ACTIVE_TASK_STATES }
        },
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        take: 3,
        select: {
          id: true,
          franchiseId: true,
          centerId: true,
          targetRole: true,
          state: true,
          dueAt: true,
          metadata: true
        }
      },
      workflowHistory: {
        where: {
          actionType: "REJECT",
          createdAt: { gte: rejectionLookbackStart }
        },
        orderBy: [{ createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          franchiseId: true,
          centerId: true,
          actionType: true,
          createdAt: true,
          reason: true
        }
      }
    }
  });
}

async function evaluateSettlementWorkflowSla({ tenantId, businessPartnerId, asOf = new Date(), tx = prisma, batchSize = 200 } = {}) {
  const candidates = await listSettlementWorkflowSlaCandidates({ tenantId, businessPartnerId, asOf, tx, batchSize });
  const issues = candidates.flatMap((settlement) => evaluateSettlementWorkflowCandidate(settlement, { asOf }));

  return {
    tenantId,
    businessPartnerId,
    asOf: (normalizeDate(asOf) || new Date()).toISOString(),
    scannedCount: candidates.length,
    issueCount: issues.length,
    issues
  };
}

export {
  REJECTION_LOOKBACK_DAYS,
  WORKFLOW_SLA_RULES,
  buildWorkflowAutomationActiveFingerprint,
  buildWorkflowAutomationFingerprint,
  buildWorkflowNotificationDeepLink,
  evaluateSettlementWorkflowCandidate,
  evaluateSettlementWorkflowSla,
  getRepeatedRejectionSeverity,
  getSettlementWorkflowEscalationSeverity,
  getSettlementWorkflowReminderCooldownHours,
  listSettlementWorkflowSlaCandidates
};