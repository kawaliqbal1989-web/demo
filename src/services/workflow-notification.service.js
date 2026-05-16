import { prisma } from "../lib/prisma.js";
import { createOrUpdateOperationalEvent } from "./operational-notification.service.js";
import { resolveBusinessPartnerNotificationTargets } from "./operational-alert-evaluator.service.js";
import { resolveBusinessPartnerScope } from "./bp-scope.service.js";

const WORKFLOW_NOTIFICATION_TYPES = {
  PENDING_SETTLEMENT: "PENDING_SETTLEMENT",
  SETTLEMENT_APPROVED: "SETTLEMENT_APPROVED",
  SETTLEMENT_REJECTED: "SETTLEMENT_REJECTED",
  SETTLEMENT_ESCALATION_TRIGGERED: "SETTLEMENT_ESCALATION_TRIGGERED",
  SETTLEMENT_ESCALATION_SEVERITY_INCREASED: "SETTLEMENT_ESCALATION_SEVERITY_INCREASED",
  SETTLEMENT_PAYOUT_DELAY: "SETTLEMENT_PAYOUT_DELAY",
  SETTLEMENT_REPEATED_REJECTION: "SETTLEMENT_REPEATED_REJECTION"
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
    throw new Error("Invalid workflow notification date value");
  }

  return normalized;
}

function addHours(value, hours) {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

function addDays(value, days) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function buildWorkflowTransitionActiveFingerprint({ businessPartnerId, settlementId, actionType, workflowVersion }) {
  return [
    "bp",
    businessPartnerId,
    "workflow-transition",
    "settlement",
    settlementId,
    "action",
    actionType,
    "version",
    workflowVersion
  ].join(":");
}

async function resolveWorkflowNotificationTargets({ tenantId, businessPartnerId, tx = prisma, dependencies = {} } = {}) {
  if (!tenantId || !businessPartnerId) {
    return {
      bpScope: null,
      targets: []
    };
  }

  const resolveScope = dependencies.resolveBusinessPartnerScope || resolveBusinessPartnerScope;
  const resolveTargets = dependencies.resolveBusinessPartnerNotificationTargets || resolveBusinessPartnerNotificationTargets;
  const bpScope = await resolveScope({ tenantId, businessPartnerId, tx });

  if (!bpScope?.businessPartner?.id) {
    return {
      bpScope: null,
      targets: []
    };
  }

  const targets = await resolveTargets({
    tenantId,
    businessPartner: bpScope.businessPartner,
    bpScope,
    tx,
    dependencies
  });

  return {
    bpScope,
    targets
  };
}

function buildWorkflowOperationalEventPayload({
  tenantId,
  businessPartnerId,
  franchiseId = null,
  centerId = null,
  notificationType,
  severity,
  title,
  message,
  sourceKind = "SYSTEM",
  sourceWindowKey = null,
  activeFingerprint,
  fingerprint,
  workflowId,
  workflowStatus,
  workflowVersion,
  actionRequiredRole = null,
  deepLinkPath,
  escalationId = null,
  escalationSeverity = null,
  triggeredAt = new Date(),
  cooldownHours = 24,
  expiresAt = null,
  metadata = {},
  targets = []
}) {
  const normalizedTriggeredAt = normalizeDate(triggeredAt, new Date());
  return {
    tenantId,
    businessPartnerId,
    franchiseId,
    centerId,
    type: notificationType,
    category: "WORKFLOW",
    severity,
    title,
    message,
    sourceKind,
    sourceWindowKey,
    activeFingerprint,
    fingerprint,
    cooldownUntil: addHours(normalizedTriggeredAt, cooldownHours),
    triggeredAt: normalizedTriggeredAt,
    expiresAt: expiresAt || addDays(normalizedTriggeredAt, 7),
    deepLinkPath,
    metadata: {
      workflowId,
      workflowStatus,
      workflowVersion,
      escalationId,
      escalationSeverity,
      actionRequiredRole,
      deepLinkPath,
      ...metadata
    },
    targets
  };
}

function mapTransitionNotificationConfig({ settlement, history, escalation, nextTask }) {
  switch (history?.actionType) {
    case "SUBMIT":
      return {
        type: WORKFLOW_NOTIFICATION_TYPES.PENDING_SETTLEMENT,
        severity: "WARNING",
        title: `Settlement ${settlement.id} submitted for review`,
        message: `Settlement ${settlement.id} is pending workflow review at version ${history.resultingVersion}.`,
        actionRequiredRole: nextTask?.targetRole || settlement.currentActionRole || "FRANCHISE"
      };
    case "APPROVE":
      return {
        type: WORKFLOW_NOTIFICATION_TYPES.SETTLEMENT_APPROVED,
        severity: "INFO",
        title: `Settlement ${settlement.id} approved`,
        message: `Settlement ${settlement.id} was approved and is awaiting payout handling.`,
        actionRequiredRole: nextTask?.targetRole || settlement.currentActionRole || "SUPERADMIN"
      };
    case "REJECT":
      return {
        type: WORKFLOW_NOTIFICATION_TYPES.SETTLEMENT_REJECTED,
        severity: "HIGH",
        title: `Settlement ${settlement.id} rejected`,
        message: `Settlement ${settlement.id} was rejected and requires correction before resubmission.`,
        actionRequiredRole: nextTask?.targetRole || settlement.currentActionRole || "FRANCHISE"
      };
    case "ESCALATE":
      return {
        type: WORKFLOW_NOTIFICATION_TYPES.SETTLEMENT_ESCALATION_TRIGGERED,
        severity: escalation?.severity || "HIGH",
        title: `Settlement ${settlement.id} escalated`,
        message: `Settlement ${settlement.id} has been escalated for governed workflow intervention.`,
        actionRequiredRole: nextTask?.targetRole || settlement.currentActionRole || "BP"
      };
    default:
      return null;
  }
}

async function emitSettlementWorkflowLifecycleNotification({ settlement, history, escalation = null, nextTask = null, tx = prisma, dependencies = {} } = {}) {
  if (!settlement?.tenantId || !settlement?.businessPartnerId || !history?.actionType) {
    return {
      skipped: true,
      reason: "missing_workflow_transition_context"
    };
  }

  const config = mapTransitionNotificationConfig({ settlement, history, escalation, nextTask });
  if (!config) {
    return {
      skipped: true,
      reason: "unsupported_transition_notification"
    };
  }

  const { targets } = await resolveWorkflowNotificationTargets({
    tenantId: settlement.tenantId,
    businessPartnerId: settlement.businessPartnerId,
    tx,
    dependencies
  });

  if (!targets.length) {
    return {
      skipped: true,
      reason: "no_notification_targets"
    };
  }

  const createEvent = dependencies.createOrUpdateOperationalEvent || createOrUpdateOperationalEvent;
  const activeFingerprint = buildWorkflowTransitionActiveFingerprint({
    businessPartnerId: settlement.businessPartnerId,
    settlementId: settlement.id,
    actionType: history.actionType,
    workflowVersion: history.resultingVersion
  });

  return createEvent(
    buildWorkflowOperationalEventPayload({
      tenantId: settlement.tenantId,
      businessPartnerId: settlement.businessPartnerId,
      franchiseId: history.franchiseId || escalation?.franchiseId || null,
      centerId: history.centerId || escalation?.centerId || null,
      notificationType: config.type,
      severity: config.severity,
      title: config.title,
      message: config.message,
      sourceKind: "SYSTEM",
      activeFingerprint,
      fingerprint: activeFingerprint,
      workflowId: settlement.id,
      workflowStatus: settlement.status,
      workflowVersion: history.resultingVersion,
      actionRequiredRole: config.actionRequiredRole,
      deepLinkPath: `/bp/settlements/${settlement.id}`,
      escalationId: escalation?.id || null,
      escalationSeverity: escalation?.severity || null,
      cooldownHours: 6,
      expiresAt: addDays(new Date(), 3),
      metadata: {
        lifecycleKind: "transition",
        actionType: history.actionType,
        reason: history.reason || null,
        notes: history.notes || null
      },
      targets
    }),
    tx
  );
}

export {
  WORKFLOW_NOTIFICATION_TYPES,
  buildWorkflowOperationalEventPayload,
  buildWorkflowTransitionActiveFingerprint,
  emitSettlementWorkflowLifecycleNotification,
  resolveWorkflowNotificationTargets
};