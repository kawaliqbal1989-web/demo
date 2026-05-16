import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  createOrUpdateOperationalEvent,
  resolveOperationalEventByActiveFingerprint
} from "./operational-notification.service.js";
import {
  escalateSettlement,
  getSettlementWorkflowAutomationActor
} from "./settlement-workflow.service.js";
import {
  buildWorkflowAutomationActiveFingerprint,
  buildWorkflowAutomationFingerprint,
  evaluateSettlementWorkflowSla
} from "./workflow-sla-evaluator.service.js";
import { resolveWorkflowNotificationTargets } from "./workflow-notification.service.js";

const ACTIVE_ESCALATION_STATES = ["ACTIVE", "ACKNOWLEDGED"];
const ACTIVE_TASK_STATES = ["OPEN", "IN_PROGRESS"];
const ESCALATABLE_STATUSES = new Set(["PENDING_REVIEW", "REVIEWED", "APPROVED", "OVERDUE"]);
const SEVERITY_RANK = {
  WARNING: 1,
  HIGH: 2,
  CRITICAL: 3
};

function normalizeDate(value, fallback = new Date()) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

  const normalized = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalized.getTime())) {
    throw new Error("Invalid settlement workflow automation date value");
  }

  return normalized;
}

function addDays(value, days) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function hasSeverityEscalated(previousSeverity, nextSeverity) {
  return (SEVERITY_RANK[nextSeverity] || 0) > (SEVERITY_RANK[previousSeverity] || 0);
}

function getCooldownHours(issue, asOf) {
  const normalizedAsOf = normalizeDate(asOf, new Date());
  const cooldownUntil = normalizeDate(issue?.cooldownUntil, null);
  if (!cooldownUntil) {
    return 24;
  }

  const diffHours = Math.round((cooldownUntil.getTime() - normalizedAsOf.getTime()) / (60 * 60 * 1000));
  return Math.max(1, diffHours || 24);
}

function buildAutomationNotificationType(issue) {
  if (issue.notificationType === "SETTLEMENT_ESCALATION_TRIGGERED" && hasSeverityEscalated(issue.existingSeverity, issue.severity)) {
    return "SETTLEMENT_ESCALATION_SEVERITY_INCREASED";
  }

  return issue.notificationType;
}

function buildAutomationReason(issue) {
  return issue.message || issue.title || `${issue.escalationType} exceeded the configured workflow SLA window.`;
}

function buildIssueActiveFingerprint(issue, escalationId = null) {
  return buildWorkflowAutomationActiveFingerprint({
    businessPartnerId: issue.businessPartnerId,
    settlementId: issue.settlementId,
    ruleKey: issue.escalationType,
    escalationId: escalationId || issue.escalationId || null
  });
}

function mergeEscalationMetadata(existingMetadata = null, { now, sourceWindowKey, nextSeverity = null, previousSeverity = null, note = null } = {}) {
  const base = existingMetadata && typeof existingMetadata === "object" ? existingMetadata : {};
  const history = Array.isArray(base.severityHistory) ? [...base.severityHistory] : [];

  if (previousSeverity && nextSeverity && previousSeverity !== nextSeverity) {
    history.push({
      fromSeverity: previousSeverity,
      toSeverity: nextSeverity,
      changedAt: normalizeDate(now, new Date()).toISOString(),
      sourceWindowKey: sourceWindowKey || null,
      source: "SCHEDULER"
    });
  }

  return {
    ...base,
    automation: {
      ...(base.automation && typeof base.automation === "object" ? base.automation : {}),
      lastEvaluatedAt: normalizeDate(now, new Date()).toISOString(),
      lastSourceWindowKey: sourceWindowKey || null,
      note: note || null
    },
    severityHistory: history
  };
}

function buildAutomationNotificationPayload({ issue, targets, asOf, sourceWindowKey, activeFingerprint, notificationType, workflowVersion, escalationId }) {
  const normalizedAsOf = normalizeDate(asOf, new Date());

  return {
    tenantId: issue.tenantId,
    businessPartnerId: issue.businessPartnerId,
    franchiseId: issue.franchiseId || null,
    centerId: issue.centerId || null,
    type: notificationType,
    category: "WORKFLOW",
    severity: issue.severity,
    title: issue.title,
    message: issue.message,
    sourceKind: "SCHEDULER",
    sourceWindowKey: sourceWindowKey || null,
    activeFingerprint,
    fingerprint: buildWorkflowAutomationFingerprint({
      activeFingerprint,
      asOf: normalizedAsOf,
      cooldownHours: getCooldownHours(issue, normalizedAsOf),
      severity: issue.severity
    }),
    cooldownUntil: issue.cooldownUntil || null,
    triggeredAt: normalizedAsOf,
    expiresAt: addDays(normalizedAsOf, 7),
    deepLinkPath: issue.deepLinkPath,
    metadata: {
      ...issue.metadata,
      workflowId: issue.settlementId,
      workflowVersion,
      workflowStatus: issue.workflowStatus,
      escalationId: escalationId || null,
      escalationSeverity: issue.severity,
      actionRequiredRole: issue.actionRequiredRole,
      deepLinkPath: issue.deepLinkPath,
      lifecycleKind: "automation",
      notificationType,
      sourceWindowKey: sourceWindowKey || null
    },
    targets
  };
}

async function markOverdueWorkflowTasks({ tenantId, businessPartnerId, asOf = new Date(), tx = prisma }) {
  const normalizedAsOf = normalizeDate(asOf, new Date());
  return tx.settlementWorkflowTask.updateMany({
    where: {
      tenantId,
      businessPartnerId,
      state: { in: ACTIVE_TASK_STATES },
      dueAt: { lt: normalizedAsOf }
    },
    data: {
      state: "OVERDUE",
      escalatedAt: normalizedAsOf
    }
  });
}

async function findActiveEscalation({ tenantId, settlementId, escalationType, tx = prisma }) {
  return tx.settlementEscalation.findFirst({
    where: {
      tenantId,
      settlementId,
      escalationType,
      state: { in: ACTIVE_ESCALATION_STATES }
    },
    orderBy: [{ triggeredAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      severity: true,
      state: true,
      franchiseId: true,
      centerId: true,
      metadata: true
    }
  });
}

async function createAutomationEscalation({ issue, asOf, sourceWindowKey, dependencies = {} } = {}) {
  if (issue.escalationId || !ESCALATABLE_STATUSES.has(issue.workflowStatus)) {
    return {
      issue,
      createdEscalation: null,
      created: false
    };
  }

  const resolveAutomationActor = dependencies.getSettlementWorkflowAutomationActor || getSettlementWorkflowAutomationActor;
  const runEscalation = dependencies.escalateSettlement || escalateSettlement;
  const actor = await resolveAutomationActor({
    tenantId: issue.tenantId,
    businessPartnerId: issue.businessPartnerId
  });

  try {
    const result = await runEscalation({
      tenantId: issue.tenantId,
      settlementId: issue.settlementId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      expectedVersion: issue.workflowVersion,
      escalationType: issue.escalationType,
      severity: issue.severity,
      reason: buildAutomationReason(issue),
      notes: `Automated escalation triggered by workflow SLA scheduler at ${normalizeDate(asOf, new Date()).toISOString()}.`,
      franchiseId: issue.franchiseId || undefined,
      centerId: issue.centerId || undefined,
      metadata: {
        automation: {
          source: "SCHEDULER",
          sourceWindowKey: sourceWindowKey || null,
          issueType: issue.escalationType,
          notificationType: issue.notificationType,
          hoursElapsed: issue.hoursElapsed || null
        }
      }
    });

    return {
      issue: {
        ...issue,
        escalationId: result.escalation?.id || issue.escalationId || null,
        existingSeverity: result.escalation?.severity || issue.severity,
        franchiseId: result.escalation?.franchiseId || issue.franchiseId || null,
        centerId: result.escalation?.centerId || issue.centerId || null,
        workflowStatus: result.settlement?.status || issue.workflowStatus,
        workflowVersion: result.settlement?.workflowVersion || issue.workflowVersion
      },
      createdEscalation: result.escalation || null,
      created: Boolean(result.escalation)
    };
  } catch (error) {
    if (!["INVALID_TRANSITION", "WORKFLOW_VERSION_CONFLICT"].includes(error?.errorCode)) {
      throw error;
    }

    const existingEscalation = await findActiveEscalation({
      tenantId: issue.tenantId,
      settlementId: issue.settlementId,
      escalationType: issue.escalationType,
      tx: dependencies.tx || prisma
    });

    if (!existingEscalation) {
      return {
        issue,
        createdEscalation: null,
        created: false,
        skippedReason: error.errorCode
      };
    }

    return {
      issue: {
        ...issue,
        escalationId: existingEscalation.id,
        existingSeverity: existingEscalation.severity,
        franchiseId: existingEscalation.franchiseId || issue.franchiseId || null,
        centerId: existingEscalation.centerId || issue.centerId || null
      },
      createdEscalation: existingEscalation,
      created: false,
      skippedReason: error.errorCode
    };
  }
}

async function upgradeEscalationSeverity({ issue, asOf, sourceWindowKey, tx = prisma } = {}) {
  if (!issue.escalationId || !hasSeverityEscalated(issue.existingSeverity, issue.severity)) {
    return {
      issue,
      escalation: null,
      upgraded: false
    };
  }

  const escalation = await tx.settlementEscalation.findFirst({
    where: {
      id: issue.escalationId,
      tenantId: issue.tenantId,
      state: { in: ACTIVE_ESCALATION_STATES }
    },
    select: {
      id: true,
      severity: true,
      metadata: true,
      franchiseId: true,
      centerId: true
    }
  });

  if (!escalation || !hasSeverityEscalated(escalation.severity, issue.severity)) {
    return {
      issue,
      escalation,
      upgraded: false
    };
  }

  const updated = await tx.settlementEscalation.update({
    where: { id: escalation.id },
    data: {
      severity: issue.severity,
      metadata: mergeEscalationMetadata(escalation.metadata, {
        now: asOf,
        sourceWindowKey,
        previousSeverity: escalation.severity,
        nextSeverity: issue.severity,
        note: "Severity upgraded by workflow automation scheduler"
      })
    },
    select: {
      id: true,
      severity: true,
      franchiseId: true,
      centerId: true,
      metadata: true
    }
  });

  return {
    issue: {
      ...issue,
      escalationId: updated.id,
      existingSeverity: updated.severity,
      franchiseId: updated.franchiseId || issue.franchiseId || null,
      centerId: updated.centerId || issue.centerId || null
    },
    escalation: updated,
    upgraded: true
  };
}

async function emitAutomationNotification({ issue, targets, asOf, sourceWindowKey, tx = prisma, dependencies = {} } = {}) {
  if (!targets.length) {
    return {
      skipped: true,
      reason: "no_notification_targets"
    };
  }

  const createEvent = dependencies.createOrUpdateOperationalEvent || createOrUpdateOperationalEvent;
  const notificationType = buildAutomationNotificationType(issue);
  const activeFingerprint = buildIssueActiveFingerprint(issue, issue.escalationId);

  return createEvent(
    buildAutomationNotificationPayload({
      issue,
      targets,
      asOf,
      sourceWindowKey,
      activeFingerprint,
      notificationType,
      workflowVersion: issue.workflowVersion,
      escalationId: issue.escalationId
    }),
    tx
  );
}

async function expireStaleEscalations({ tenantId, businessPartnerId, activeFingerprints, asOf, tx = prisma } = {}) {
  const staleEscalations = await tx.settlementEscalation.findMany({
    where: {
      tenantId,
      businessPartnerId,
      state: { in: ACTIVE_ESCALATION_STATES }
    },
    select: {
      id: true,
      settlementId: true,
      escalationType: true,
      metadata: true
    }
  });

  let expiredCount = 0;
  for (const escalation of staleEscalations) {
    const activeFingerprint = buildWorkflowAutomationActiveFingerprint({
      businessPartnerId,
      settlementId: escalation.settlementId,
      ruleKey: escalation.escalationType,
      escalationId: escalation.id
    });

    if (activeFingerprints.has(activeFingerprint)) {
      continue;
    }

    await tx.settlementEscalation.update({
      where: { id: escalation.id },
      data: {
        state: "EXPIRED",
        resolvedAt: normalizeDate(asOf, new Date()),
        metadata: mergeEscalationMetadata(escalation.metadata, {
          now: asOf,
          note: "Expired by workflow automation cleanup"
        })
      }
    });
    expiredCount += 1;
  }

  return expiredCount;
}

async function resolveInactiveWorkflowNotifications({ tenantId, businessPartnerId, activeFingerprints, asOf, tx = prisma, dependencies = {} } = {}) {
  const resolveEvent = dependencies.resolveOperationalEventByActiveFingerprint || resolveOperationalEventByActiveFingerprint;

  const notifications = await tx.operationalNotification.findMany({
    where: {
      tenantId,
      businessPartnerId,
      category: "WORKFLOW",
      sourceKind: "SCHEDULER",
      status: "ACTIVE"
    },
    select: {
      id: true,
      activeFingerprint: true,
      metadata: true
    }
  });

  let resolvedCount = 0;
  for (const notification of notifications) {
    if (activeFingerprints.has(notification.activeFingerprint)) {
      continue;
    }

    const result = await resolveEvent(
      {
        tenantId,
        activeFingerprint: notification.activeFingerprint,
        resolvedAt: normalizeDate(asOf, new Date()),
        status: "RESOLVED",
        metadata: {
          ...(notification.metadata && typeof notification.metadata === "object" ? notification.metadata : {}),
          resolvedBy: "SCHEDULER",
          resolutionReason: "workflow_condition_cleared"
        }
      },
      tx
    );

    if (result?.resolved) {
      resolvedCount += 1;
    }
  }

  return resolvedCount;
}

async function runSettlementWorkflowAutomation({
  tenantId,
  businessPartnerId,
  asOf = new Date(),
  sourceWindowKey = null,
  dependencies = {}
} = {}) {
  if (!tenantId || !businessPartnerId) {
    return {
      skipped: true,
      reason: "missing_scope"
    };
  }

  const tx = dependencies.tx || prisma;
  const evaluateSla = dependencies.evaluateSettlementWorkflowSla || evaluateSettlementWorkflowSla;
  const resolveTargets = dependencies.resolveWorkflowNotificationTargets || resolveWorkflowNotificationTargets;
  const log = dependencies.logger || logger;
  const normalizedAsOf = normalizeDate(asOf, new Date());

  const summary = {
    skipped: false,
    tenantId,
    businessPartnerId,
    asOf: normalizedAsOf.toISOString(),
    sourceWindowKey: sourceWindowKey || null,
    scannedCount: 0,
    issueCount: 0,
    overdueTaskUpdates: 0,
    createdEscalations: 0,
    upgradedEscalations: 0,
    expiredEscalations: 0,
    createdNotifications: 0,
    updatedNotifications: 0,
    suppressedNotifications: 0,
    resolvedNotifications: 0,
    skippedIssues: 0,
    failures: []
  };

  const overdueTasks = await markOverdueWorkflowTasks({
    tenantId,
    businessPartnerId,
    asOf: normalizedAsOf,
    tx
  });
  summary.overdueTaskUpdates = overdueTasks.count || 0;

  const evaluation = await evaluateSla({
    tenantId,
    businessPartnerId,
    asOf: normalizedAsOf,
    tx,
    batchSize: dependencies.batchSize || 200
  });

  summary.scannedCount = evaluation.scannedCount || 0;
  summary.issueCount = evaluation.issueCount || 0;

  const targetResolution = await resolveTargets({
    tenantId,
    businessPartnerId,
    tx,
    dependencies
  });
  const notificationTargets = targetResolution.targets || [];
  const activeFingerprints = new Set();

  for (const baseIssue of evaluation.issues || []) {
    try {
      let issue = { ...baseIssue };

      const createdEscalationResult = await createAutomationEscalation({
        issue,
        asOf: normalizedAsOf,
        sourceWindowKey,
        dependencies: {
          ...dependencies,
          tx
        }
      });
      issue = createdEscalationResult.issue;
      if (createdEscalationResult.created) {
        summary.createdEscalations += 1;
      }

      const upgradedEscalationResult = await upgradeEscalationSeverity({
        issue,
        asOf: normalizedAsOf,
        sourceWindowKey,
        tx
      });
      issue = upgradedEscalationResult.issue;
      if (upgradedEscalationResult.upgraded) {
        summary.upgradedEscalations += 1;
      }

      const activeFingerprint = buildIssueActiveFingerprint(issue, issue.escalationId);
      activeFingerprints.add(activeFingerprint);

      const notificationResult = await emitAutomationNotification({
        issue,
        targets: notificationTargets,
        asOf: normalizedAsOf,
        sourceWindowKey,
        tx,
        dependencies
      });

      if (notificationResult?.skipped) {
        summary.skippedIssues += 1;
      } else if (notificationResult?.created) {
        summary.createdNotifications += 1;
      } else {
        summary.updatedNotifications += 1;
        if (notificationResult?.suppressed) {
          summary.suppressedNotifications += 1;
        }
      }
    } catch (error) {
      summary.failures.push({
        settlementId: baseIssue.settlementId,
        escalationType: baseIssue.escalationType,
        error: error.message
      });
      log.error("settlement_workflow_automation_issue_failed", {
        tenantId,
        businessPartnerId,
        settlementId: baseIssue.settlementId,
        escalationType: baseIssue.escalationType,
        error: error.message
      });
    }
  }

  summary.expiredEscalations = await expireStaleEscalations({
    tenantId,
    businessPartnerId,
    activeFingerprints,
    asOf: normalizedAsOf,
    tx
  });

  summary.resolvedNotifications = await resolveInactiveWorkflowNotifications({
    tenantId,
    businessPartnerId,
    activeFingerprints,
    asOf: normalizedAsOf,
    tx,
    dependencies
  });

  return summary;
}

export {
  buildAutomationNotificationPayload,
  buildIssueActiveFingerprint,
  buildAutomationNotificationType,
  createAutomationEscalation,
  expireStaleEscalations,
  hasSeverityEscalated,
  markOverdueWorkflowTasks,
  resolveInactiveWorkflowNotifications,
  runSettlementWorkflowAutomation,
  upgradeEscalationSeverity
};