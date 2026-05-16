import { prisma } from "../lib/prisma.js";
import { getFranchiseAlertsAnalytics } from "./bp-analytics.service.js";
import { getCenterOperationalAnomaliesAnalytics } from "./center-operational-analytics.service.js";
import { getFranchiseOperationalAnomaliesAnalytics } from "./franchise-analytics.service.js";
import {
  ALERT_QUERY_LIMIT,
  getTeacherOperationalAnomaliesAnalytics,
  resolveTeacherOperationalScope
} from "./teacher-analytics.service.js";
import {
  getStudentEngagementAnalyticsBundle,
  listStudentEngagementCandidates
} from "./student-engagement-analytics.service.js";
import { resolveBusinessPartnerScope } from "./bp-scope.service.js";

const OPERATIONAL_RULE_KEYS = {
  SNAPSHOT_PIPELINE: "SNAPSHOT_PIPELINE",
  ALERT_EVALUATION: "ALERT_EVALUATION",
  WORKFLOW_AUTOMATION: "WORKFLOW_AUTOMATION",
  SCHEDULER: "SCHEDULER"
};

const ALERT_COOLDOWN_HOURS = 24;
const ALERT_EXPIRY_DAYS = 7;
const FAILURE_COOLDOWN_HOURS = 6;
const FAILURE_EXPIRY_DAYS = 3;

function addHours(value, hours) {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

function addDays(value, days) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeDate(value, fallback = new Date()) {
  if (value === undefined) {
    return fallback;
  }

  if (value === null) {
    return null;
  }

  const normalized = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalized.getTime())) {
    throw new Error("Invalid date value provided for operational alert evaluation");
  }

  return normalized;
}

function formatDateKey(value) {
  const normalized = normalizeDate(value);
  return normalized.toISOString().slice(0, 10);
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)));
}

function buildOperationalRuleScopeKey({ businessPartnerId } = {}) {
  return businessPartnerId ? `businessPartner:${businessPartnerId}` : "global";
}

function buildOperationalRuleWindowKey({ sourceWindowKey, snapshotDate } = {}) {
  const parts = [];

  if (sourceWindowKey) {
    parts.push(String(sourceWindowKey));
  }

  if (snapshotDate) {
    parts.push(`snapshot:${formatDateKey(snapshotDate)}`);
  }

  return parts.length ? parts.join("|") : null;
}

function getLogicalRuleKey(alertType) {
  if (alertType === "LOW_ATTENDANCE") {
    return "ATTENDANCE";
  }

  if (alertType === "NO_RECENT_ADMISSIONS") {
    return "NO_ADMISSIONS";
  }

  if (alertType === "DECLINING_GROWTH") {
    return "WEAK_GROWTH";
  }

  if (alertType === "INACTIVE_CENTER") {
    return "INACTIVE_CENTER";
  }

  if (alertType === "ATTENDANCE_COLLAPSE") {
    return "ATTENDANCE_COLLAPSE";
  }

  if (alertType === "TEACHER_INACTIVITY") {
    return "TEACHER_INACTIVITY";
  }

  if (alertType === "WORKSHEET_BACKLOG") {
    return "WORKSHEET_BACKLOG";
  }

  if (alertType === "CENTER_GROWTH_DECLINE") {
    return "CENTER_GROWTH_DECLINE";
  }

  if (alertType === "CENTER_OPERATIONAL_RISK") {
    return "CENTER_OPERATIONAL_RISK";
  }

  if (alertType === "DELAYED_ATTENDANCE_SUBMISSION") {
    return "DELAYED_ATTENDANCE_SUBMISSION";
  }

  if (alertType === "OVERDUE_WORKSHEET_REVIEW") {
    return "OVERDUE_WORKSHEET_REVIEW";
  }

  if (alertType === "INACTIVE_CLASSROOM_ACTIVITY") {
    return "INACTIVE_CLASSROOM_ACTIVITY";
  }

  if (alertType === "PENDING_OPERATIONAL_TASKS") {
    return "PENDING_OPERATIONAL_TASKS";
  }

  if (alertType === "GRADING_BACKLOG") {
    return "GRADING_BACKLOG";
  }

  if (alertType === "UNRESOLVED_CLASSROOM_ANOMALIES") {
    return "UNRESOLVED_CLASSROOM_ANOMALIES";
  }

  return alertType;
}

function mapOperationalAlertType(item) {
  switch (item?.type) {
    case "LOW_ATTENDANCE":
      return item?.severity === "CRITICAL" ? "CRITICAL_ATTENDANCE" : "LOW_ATTENDANCE";
    case "LOW_COLLECTIONS":
      return "LOW_COLLECTIONS";
    case "NO_RECENT_ADMISSIONS":
      return "NO_ADMISSIONS";
    case "UNHEALTHY_CENTER":
      return "UNHEALTHY_CENTER";
    case "DECLINING_GROWTH":
      return "WEAK_GROWTH";
    default:
      return null;
  }
}

function mapOperationalAlertCategory(item) {
  switch (item?.type) {
    case "LOW_ATTENDANCE":
    case "NO_RECENT_ADMISSIONS":
      return "ACADEMIC";
    case "LOW_COLLECTIONS":
      return "FINANCE";
    case "DECLINING_GROWTH":
      return "RISK";
    case "UNHEALTHY_CENTER":
    default:
      return "OPERATIONS";
  }
}

function mapOperationalAlertTitle(item) {
  const centerName = item?.centerName || "Center";

  switch (item?.type) {
    case "LOW_ATTENDANCE":
      return item?.severity === "CRITICAL"
        ? `${centerName} attendance is critical`
        : `${centerName} attendance is below target`;
    case "LOW_COLLECTIONS":
      return `${centerName} collections are below threshold`;
    case "NO_RECENT_ADMISSIONS":
      return `${centerName} has no recent admissions`;
    case "UNHEALTHY_CENTER":
      return `${centerName} health score is below floor`;
    case "DECLINING_GROWTH":
      return `${centerName} growth is declining`;
    default:
      return `${centerName} has an operational alert`;
  }
}

function buildAlertActiveFingerprint({ businessPartnerId, franchiseId, centerId, alertType }) {
  return [
    "bp",
    businessPartnerId,
    "franchise",
    franchiseId || "none",
    "center",
    centerId || "none",
    "rule",
    getLogicalRuleKey(alertType)
  ].join(":");
}

function buildFailureActiveFingerprint({ businessPartnerId, type, sourceWindowKey, snapshotDate }) {
  return [
    "bp",
    businessPartnerId,
    "failure",
    type,
    sourceWindowKey || "no-window",
    snapshotDate ? formatDateKey(snapshotDate) : "no-snapshot"
  ].join(":");
}

function buildFranchiseAlertActiveFingerprint({ franchiseId, centerId, teacherUserId, alertType }) {
  return [
    "franchise",
    franchiseId,
    "center",
    centerId || "none",
    "teacher",
    teacherUserId || "none",
    "rule",
    getLogicalRuleKey(alertType)
  ].join(":");
}

function buildCenterAlertActiveFingerprint({ centerId, teacherUserId, batchId, alertType }) {
  return [
    "center",
    centerId,
    "teacher",
    teacherUserId || "none",
    "batch",
    batchId || "none",
    "rule",
    getLogicalRuleKey(alertType)
  ].join(":");
}

function buildTeacherAlertActiveFingerprint({ teacherUserId, centerId, batchId, alertType }) {
  return [
    "teacher",
    teacherUserId,
    "center",
    centerId || "none",
    "batch",
    batchId || "none",
    "rule",
    getLogicalRuleKey(alertType)
  ].join(":");
}

function buildStudentAlertActiveFingerprint({ studentId, alertType }) {
  return ["student", studentId, "rule", getLogicalRuleKey(alertType)].join(":");
}

async function resolveBusinessPartnerNotificationTargets({
  tenantId,
  businessPartner,
  bpScope,
  tx = prisma,
  dependencies = {}
} = {}) {
  if (!tenantId || !businessPartner?.id) {
    return [];
  }

  const hierarchyNodeIds = uniqueStrings([
    businessPartner.hierarchyNodeId,
    ...(bpScope?.hierarchyNodeIds || [])
  ]);
  const orFilters = [];

  if (businessPartner.code) {
    orFilters.push({ username: businessPartner.code });
  }

  if (hierarchyNodeIds.length) {
    orFilters.push({ hierarchyNodeId: { in: hierarchyNodeIds } });
  }

  if (!orFilters.length) {
    return [];
  }

  const findRecipientUsers = dependencies.findRecipientUsers
    || ((query, dbClient) =>
      dbClient.authUser.findMany({
        where: query,
        select: {
          id: true,
          role: true
        },
        orderBy: [{ createdAt: "asc" }]
      }));

  const users = await findRecipientUsers(
    {
      tenantId,
      role: "BP",
      isActive: true,
      OR: orFilters
    },
    tx
  );

  return Array.from(new Map(users.map((user) => [user.id, {
    recipientUserId: user.id,
    recipientRole: user.role,
    businessPartnerId: businessPartner.id,
    targetKey: `user:${user.id}`
  }])).values());
}

async function resolveFranchiseNotificationTargets({
  tenantId,
  franchiseScope,
  tx = prisma,
  dependencies = {}
} = {}) {
  const franchiseId = franchiseScope?.franchise?.id;
  const authUserId = franchiseScope?.franchise?.authUserId;
  if (!tenantId || !franchiseId || !authUserId) {
    return [];
  }

  const findRecipientUsers = dependencies.findRecipientUsers
    || ((query, dbClient) =>
      dbClient.authUser.findMany({
        where: query,
        select: {
          id: true,
          role: true
        },
        orderBy: [{ createdAt: "asc" }]
      }));

  const users = await findRecipientUsers(
    {
      tenantId,
      id: authUserId,
      role: "FRANCHISE",
      isActive: true
    },
    tx
  );

  return Array.from(new Map(users.map((user) => [user.id, {
    recipientUserId: user.id,
    recipientRole: user.role,
    businessPartnerId: franchiseScope.franchise.businessPartnerId,
    franchiseId,
    targetKey: `user:${user.id}`
  }])).values());
}

async function resolveCenterNotificationTargets({
  tenantId,
  centerScope,
  tx = prisma,
  dependencies = {}
} = {}) {
  const center = centerScope?.center;
  if (!tenantId || !center?.id || !center?.authUserId) {
    return [];
  }

  const findRecipientUsers = dependencies.findRecipientUsers
    || ((query, dbClient) =>
      dbClient.authUser.findMany({
        where: query,
        select: {
          id: true,
          role: true
        },
        orderBy: [{ createdAt: "asc" }]
      }));

  const users = await findRecipientUsers(
    {
      tenantId,
      id: center.authUserId,
      role: "CENTER",
      isActive: true
    },
    tx
  );

  return Array.from(new Map(users.map((user) => [user.id, {
    recipientUserId: user.id,
    recipientRole: user.role,
    businessPartnerId: center.businessPartnerId,
    franchiseId: center.franchiseId,
    centerId: center.id,
    targetKey: `user:${user.id}`
  }])).values());
}

async function resolveTeacherNotificationTargets({
  tenantId,
  teacherScope,
  tx = prisma,
  dependencies = {}
} = {}) {
  if (!tenantId || !teacherScope?.teacherUserId) {
    return [];
  }

  const findRecipientUsers = dependencies.findRecipientUsers
    || ((query, dbClient) =>
      dbClient.authUser.findMany({
        where: query,
        select: {
          id: true,
          role: true
        },
        orderBy: [{ createdAt: "asc" }]
      }));

  const users = await findRecipientUsers(
    {
      tenantId,
      id: teacherScope.teacherUserId,
      role: "TEACHER",
      isActive: true
    },
    tx
  );

  return Array.from(new Map(users.map((user) => [user.id, {
    recipientUserId: user.id,
    recipientRole: user.role,
    businessPartnerId: teacherScope.businessPartnerId,
    franchiseId: teacherScope.franchiseId,
    centerId: teacherScope.centerId,
    targetKey: `user:${user.id}`
  }])).values());
}

async function resolveStudentOperationalContext({ tenantId, hierarchyNodeId, tx = prisma, dependencies = {} } = {}) {
  if (!tenantId || !hierarchyNodeId) {
    return null;
  }

  const findCenterByHierarchyNode = dependencies.findCenterByHierarchyNode
    || ((query, dbClient) =>
      dbClient.centerProfile.findFirst({
        where: query,
        select: {
          id: true,
          name: true,
          franchiseProfile: {
            select: {
              id: true,
              name: true,
              businessPartnerId: true
            }
          }
        }
      }));

  const center = await findCenterByHierarchyNode(
    {
      tenantId,
      isActive: true,
      authUser: {
        is: {
          tenantId,
          isActive: true,
          hierarchyNodeId
        }
      }
    },
    tx
  );

  if (!center?.franchiseProfile?.businessPartnerId) {
    return null;
  }

  return {
    centerId: center.id,
    centerName: center.name || null,
    franchiseId: center.franchiseProfile.id,
    franchiseName: center.franchiseProfile.name || null,
    businessPartnerId: center.franchiseProfile.businessPartnerId
  };
}

async function resolveStudentNotificationTargets({
  tenantId,
  candidate,
  operationalContext,
  tx = prisma,
  dependencies = {}
} = {}) {
  if (!tenantId || !candidate?.id || !operationalContext?.businessPartnerId) {
    return [];
  }

  const targets = [];

  const studentUserId = candidate.authUsers?.[0]?.id || null;
  if (studentUserId) {
    targets.push({
      recipientUserId: studentUserId,
      recipientRole: "STUDENT",
      businessPartnerId: operationalContext.businessPartnerId,
      franchiseId: operationalContext.franchiseId,
      centerId: operationalContext.centerId,
      targetKey: `user:${studentUserId}`,
      actionPathOverride: "/student/dashboard",
      metadata: {
        studentId: candidate.id,
        reminderScope: "STUDENT_ENGAGEMENT"
      }
    });
  }

  const parentIds = uniqueStrings((candidate.parentLinks || []).map((link) => link.parentUserId));
  if (!parentIds.length) {
    return targets;
  }

  const findRecipientUsers = dependencies.findRecipientUsers
    || ((query, dbClient) =>
      dbClient.authUser.findMany({
        where: query,
        select: {
          id: true,
          role: true
        },
        orderBy: [{ createdAt: "asc" }]
      }));

  const parents = await findRecipientUsers(
    {
      tenantId,
      id: { in: parentIds },
      role: "PARENT",
      isActive: true
    },
    tx
  );

  for (const parent of parents) {
    targets.push({
      recipientUserId: parent.id,
      recipientRole: parent.role,
      businessPartnerId: operationalContext.businessPartnerId,
      franchiseId: operationalContext.franchiseId,
      centerId: operationalContext.centerId,
      targetKey: `user:${parent.id}`,
      actionPathOverride: `/parent/dashboard?studentId=${candidate.id}`,
      metadata: {
        studentId: candidate.id,
        reminderScope: "STUDENT_ENGAGEMENT"
      }
    });
  }

  return Array.from(new Map(targets.map((target) => [target.targetKey, target])).values());
}

function buildOperationalAlertEvent({
  businessPartnerId,
  franchiseId,
  item,
  analyticsMeta,
  snapshotDate,
  sourceWindowKey,
  triggeredAt,
  targets
}) {
  const type = mapOperationalAlertType(item);
  if (!type) {
    return null;
  }

  const activeFingerprint = buildAlertActiveFingerprint({
    businessPartnerId,
    franchiseId,
    centerId: item.centerId,
    alertType: item.type
  });

  const snapshotKey = formatDateKey(snapshotDate);
  const sourceKind = analyticsMeta?.source?.liveFallback ? "LIVE_FALLBACK" : "SNAPSHOT";

  return {
    tenantId: analyticsMeta?.tenantId,
    businessPartnerId,
    franchiseId,
    centerId: item.centerId || null,
    type,
    category: mapOperationalAlertCategory(item),
    severity: item.severity,
    title: mapOperationalAlertTitle(item),
    message: item.message,
    metricKey: item.metric || null,
    thresholdValue: item.threshold ?? null,
    observedValue: item.observedValue ?? null,
    deltaPercent: null,
    sourceKind,
    sourceSnapshotDate: normalizeDate(snapshotDate),
    sourceWindowKey: sourceWindowKey || null,
    fingerprint: `${activeFingerprint}:snapshot:${snapshotKey}`,
    activeFingerprint,
    cooldownUntil: addHours(triggeredAt, ALERT_COOLDOWN_HOURS),
    triggeredAt,
    expiresAt: addDays(triggeredAt, ALERT_EXPIRY_DAYS),
    deepLinkPath: franchiseId ? `/bp/franchises/${franchiseId}` : "/bp",
    metadata: {
      source: "bp_analytics.franchise_alerts",
      sourceMeta: analyticsMeta?.source || null,
      originalType: item.type,
      centerName: item.centerName || null,
      logicalRuleKey: getLogicalRuleKey(item.type)
    },
    targets
  };
}

function mapFranchiseOperationalAlertCategory(item) {
  switch (item?.type) {
    case "ATTENDANCE_COLLAPSE":
    case "WORKSHEET_BACKLOG":
      return "ACADEMIC";
    case "CENTER_GROWTH_DECLINE":
    case "CENTER_OPERATIONAL_RISK":
      return "RISK";
    case "TEACHER_INACTIVITY":
    case "INACTIVE_CENTER":
    default:
      return "OPERATIONS";
  }
}

function buildFranchiseOperationalAlertEvent({
  tenantId,
  franchiseScope,
  item,
  analyticsMeta,
  snapshotDate,
  sourceWindowKey,
  triggeredAt,
  targets
}) {
  const franchiseId = franchiseScope?.franchise?.id;
  const businessPartnerId = franchiseScope?.franchise?.businessPartnerId;
  if (!franchiseId || !businessPartnerId || !item?.type) {
    return null;
  }

  const activeFingerprint = buildFranchiseAlertActiveFingerprint({
    franchiseId,
    centerId: item.centerId,
    teacherUserId: item.teacherUserId,
    alertType: item.type
  });
  const sourceKind = analyticsMeta?.source?.liveFallback ? "LIVE_FALLBACK" : "SNAPSHOT";
  const snapshotKey = snapshotDate ? formatDateKey(snapshotDate) : "no-snapshot";

  return {
    tenantId,
    businessPartnerId,
    franchiseId,
    centerId: item.centerId || null,
    type: item.type,
    category: mapFranchiseOperationalAlertCategory(item),
    severity: item.severity,
    title: item.title,
    message: item.message,
    metricKey: item.metricKey || null,
    thresholdValue: item.threshold ?? null,
    observedValue: item.observedValue ?? null,
    deltaPercent: null,
    sourceKind,
    sourceSnapshotDate: snapshotDate ? normalizeDate(snapshotDate) : null,
    sourceWindowKey: sourceWindowKey || null,
    fingerprint: `${activeFingerprint}:snapshot:${snapshotKey}`,
    activeFingerprint,
    cooldownUntil: addHours(triggeredAt, ALERT_COOLDOWN_HOURS),
    triggeredAt,
    expiresAt: addDays(triggeredAt, ALERT_EXPIRY_DAYS),
    deepLinkPath: "/franchise/dashboard",
    metadata: {
      source: "franchise_analytics.operational_anomalies",
      sourceMeta: analyticsMeta?.source || null,
      centerName: item.centerName || null,
      teacherName: item.teacherName || null,
      logicalRuleKey: getLogicalRuleKey(item.type)
    },
    targets
  };
}

function mapCenterOperationalAlertType(item) {
  switch (item?.type) {
    case "ATTENDANCE_COLLAPSE":
      return "CRITICAL_ATTENDANCE";
    case "CHRONIC_ABSENTEE_SPIKE":
      return item?.severity === "CRITICAL" ? "CRITICAL_ATTENDANCE" : "LOW_ATTENDANCE";
    case "WORKSHEET_BACKLOG":
    case "DELAYED_WORKSHEET_REVIEW":
    case "INACTIVE_BATCHES":
    case "TEACHER_INACTIVITY":
    case "OPERATIONAL_CLASSROOM_RISK":
      return "UNHEALTHY_CENTER";
    default:
      return null;
  }
}

function mapCenterOperationalAlertCategory(item) {
  switch (item?.type) {
    case "ATTENDANCE_COLLAPSE":
    case "CHRONIC_ABSENTEE_SPIKE":
    case "WORKSHEET_BACKLOG":
    case "DELAYED_WORKSHEET_REVIEW":
      return "ACADEMIC";
    case "OPERATIONAL_CLASSROOM_RISK":
      return "RISK";
    case "INACTIVE_BATCHES":
    case "TEACHER_INACTIVITY":
    default:
      return "OPERATIONS";
  }
}

function buildCenterOperationalAlertEvent({
  tenantId,
  centerScope,
  item,
  analyticsMeta,
  snapshotDate,
  sourceWindowKey,
  triggeredAt,
  targets
}) {
  const center = centerScope?.center;
  const type = mapCenterOperationalAlertType(item);
  if (!tenantId || !center?.id || !center?.businessPartnerId || !type) {
    return null;
  }

  const activeFingerprint = buildCenterAlertActiveFingerprint({
    centerId: center.id,
    teacherUserId: item.teacherUserId || null,
    batchId: item.batchId || null,
    alertType: item.type
  });
  const sourceKind = analyticsMeta?.source?.liveFallback ? "LIVE_FALLBACK" : "SNAPSHOT";
  const snapshotKey = snapshotDate ? formatDateKey(snapshotDate) : "no-snapshot";

  return {
    tenantId,
    businessPartnerId: center.businessPartnerId,
    franchiseId: center.franchiseId || null,
    centerId: center.id,
    type,
    category: mapCenterOperationalAlertCategory(item),
    severity: item.severity,
    title: item.title,
    message: item.message,
    metricKey: item.metricKey || null,
    thresholdValue: item.threshold ?? null,
    observedValue: item.observedValue ?? null,
    deltaPercent: null,
    sourceKind,
    sourceSnapshotDate: snapshotDate ? normalizeDate(snapshotDate) : null,
    sourceWindowKey: sourceWindowKey || null,
    fingerprint: `${activeFingerprint}:snapshot:${snapshotKey}`,
    activeFingerprint,
    cooldownUntil: addHours(triggeredAt, ALERT_COOLDOWN_HOURS),
    triggeredAt,
    expiresAt: addDays(triggeredAt, ALERT_EXPIRY_DAYS),
    deepLinkPath: "/center/dashboard",
    metadata: {
      source: "center_analytics.operational_anomalies",
      sourceMeta: analyticsMeta?.source || null,
      originalType: item.type,
      centerName: item.centerName || center.name || null,
      teacherName: item.teacherName || null,
      logicalRuleKey: getLogicalRuleKey(item.type)
    },
    targets
  };
}

function mapTeacherOperationalAlertCategory(item) {
  switch (item?.itemType) {
    case "DELAYED_ATTENDANCE_SUBMISSION":
    case "OVERDUE_WORKSHEET_REVIEW":
    case "GRADING_BACKLOG":
      return "ACADEMIC";
    case "PENDING_OPERATIONAL_TASKS":
    case "UNRESOLVED_CLASSROOM_ANOMALIES":
      return "WORKFLOW";
    case "INACTIVE_CLASSROOM_ACTIVITY":
    default:
      return "OPERATIONS";
  }
}

function buildTeacherOperationalAlertEvent({
  tenantId,
  teacherScope,
  item,
  analyticsMeta,
  snapshotDate,
  sourceWindowKey,
  triggeredAt,
  targets
}) {
  if (!tenantId || !teacherScope?.teacherUserId || !item?.itemType) {
    return null;
  }

  const activeFingerprint = buildTeacherAlertActiveFingerprint({
    teacherUserId: teacherScope.teacherUserId,
    centerId: teacherScope.centerId,
    batchId: item.batchId || null,
    alertType: item.itemType
  });
  const effectiveSnapshotDate = snapshotDate || analyticsMeta?.source?.snapshotDate || null;
  const sourceKind = analyticsMeta?.source?.liveFallback ? "LIVE_FALLBACK" : effectiveSnapshotDate ? "SNAPSHOT" : "SYSTEM";
  const snapshotKey = effectiveSnapshotDate ? formatDateKey(effectiveSnapshotDate) : "no-snapshot";

  return {
    tenantId,
    businessPartnerId: teacherScope.businessPartnerId,
    franchiseId: teacherScope.franchiseId,
    centerId: teacherScope.centerId,
    type: item.itemType,
    category: mapTeacherOperationalAlertCategory(item),
    severity: item.severity || "WARNING",
    title: item.title,
    message: item.summary,
    metricKey: item.itemType,
    thresholdValue: null,
    observedValue: item.priorityScore ?? item.delayedDays ?? null,
    deltaPercent: null,
    sourceKind,
    sourceSnapshotDate: effectiveSnapshotDate ? normalizeDate(effectiveSnapshotDate) : null,
    sourceWindowKey: sourceWindowKey || null,
    fingerprint: `${activeFingerprint}:snapshot:${snapshotKey}`,
    activeFingerprint,
    cooldownUntil: addHours(triggeredAt, ALERT_COOLDOWN_HOURS),
    triggeredAt,
    expiresAt: addDays(triggeredAt, ALERT_EXPIRY_DAYS),
    deepLinkPath: "/teacher/dashboard",
    metadata: {
      source: "teacher_analytics.productivity_anomalies",
      sourceMeta: analyticsMeta?.source || null,
      logicalRuleKey: getLogicalRuleKey(item.itemType),
      queueType: item.queueType || null,
      studentId: item.studentId || null,
      batchId: item.batchId || null
    },
    targets
  };
}

function getTrailingInactiveDays(items = []) {
  const sorted = [...items].sort((left, right) => String(right.key || "").localeCompare(String(left.key || "")));
  let days = 0;

  for (const item of sorted) {
    if ((item.completedCount || 0) > 0) {
      break;
    }
    days += 1;
  }

  return days;
}

function buildStudentEngagementReminderItems({ candidate, bundle }) {
  const overview = bundle?.overview || {};
  const streaks = bundle?.streaks || {};
  const practiceTrends = bundle?.practiceTrends?.items || [];
  const practiceTailGap = getTrailingInactiveDays(practiceTrends);
  const studentName = candidate?.firstName || candidate?.lastName
    ? `${String(candidate.firstName || "").trim()} ${String(candidate.lastName || "").trim()}`.trim()
    : candidate?.admissionNo || "Student";
  const reminders = [];

  if ((overview.inactiveDays ?? 0) >= 7) {
    reminders.push({
      type: "STUDENT_ENGAGEMENT_INACTIVE",
      severity: overview.inactiveDays >= 14 ? "CRITICAL" : overview.inactiveDays >= 10 ? "HIGH" : "WARNING",
      title: `${studentName} is inactive`,
      message: `${studentName} has not recorded meaningful activity for ${overview.inactiveDays} day(s).`,
      metricKey: "inactiveDays",
      threshold: 7,
      observedValue: overview.inactiveDays
    });
  }

  if ((streaks.practice?.current ?? 0) >= 3 && practiceTailGap >= 2) {
    reminders.push({
      type: "STUDENT_ENGAGEMENT_STREAK_RISK",
      severity: practiceTailGap >= 4 ? "HIGH" : "WARNING",
      title: `${studentName}'s practice streak is at risk`,
      message: `${studentName} built a ${streaks.practice.current}-day practice streak but has slowed down for ${practiceTailGap} day(s).`,
      metricKey: "practiceStreak",
      threshold: 2,
      observedValue: practiceTailGap
    });
  }

  if ((overview.practiceActiveDays ?? 0) <= 2 && (overview.totalCompletedWorksheets ?? 0) >= 3) {
    reminders.push({
      type: "STUDENT_ENGAGEMENT_PRACTICE_GAP",
      severity: (overview.practiceActiveDays ?? 0) === 0 ? "HIGH" : "WARNING",
      title: `${studentName} needs practice attention`,
      message: `${studentName} has only ${overview.practiceActiveDays || 0} active practice day(s) in the last two weeks.`,
      metricKey: "practiceActiveDays14",
      threshold: 3,
      observedValue: overview.practiceActiveDays || 0
    });
  }

  if ((overview.pendingWorksheetCount ?? 0) >= 2) {
    reminders.push({
      type: "STUDENT_ENGAGEMENT_PENDING_WORKSHEETS",
      severity: overview.pendingWorksheetCount >= 4 ? "HIGH" : "WARNING",
      title: `${studentName} has pending worksheets`,
      message: `${studentName} still has ${overview.pendingWorksheetCount} worksheet(s) pending completion.`,
      metricKey: "pendingWorksheetCount",
      threshold: 2,
      observedValue: overview.pendingWorksheetCount
    });
  }

  if ((overview.totalCompletedWorksheets ?? 0) >= 5 && (overview.examParticipationCount ?? 0) === 0) {
    reminders.push({
      type: "STUDENT_ENGAGEMENT_EXAM_GAP",
      severity: "WARNING",
      title: `${studentName} has not joined an exam cycle`,
      message: `${studentName} is practicing consistently but has not yet participated in an exam cycle.`,
      metricKey: "examParticipationCount",
      threshold: 1,
      observedValue: 0
    });
  }

  if ((overview.attendanceRate ?? 100) < 75) {
    reminders.push({
      type: "STUDENT_ENGAGEMENT_ATTENDANCE_DECLINE",
      severity: (overview.attendanceRate ?? 100) < 60 ? "HIGH" : "WARNING",
      title: `${studentName} attendance is slipping`,
      message: `${studentName}'s recent attendance rate is ${overview.attendanceRate}%, which is below the engagement target.`,
      metricKey: "attendanceRate",
      threshold: 75,
      observedValue: overview.attendanceRate
    });
  }

  return reminders;
}

function mapStudentReminderCategory(type) {
  if (type === "STUDENT_ENGAGEMENT_INACTIVE") {
    return "OPERATIONS";
  }

  return "ACADEMIC";
}

function buildStudentEngagementAlertEvent({
  tenantId,
  candidate,
  operationalContext,
  bundle,
  reminder,
  snapshotDate,
  sourceWindowKey,
  triggeredAt,
  targets
}) {
  if (!tenantId || !candidate?.id || !operationalContext?.businessPartnerId || !reminder?.type) {
    return null;
  }

  const effectiveSnapshotDate = snapshotDate || bundle?.meta?.source?.snapshotDate || null;
  const sourceKind = bundle?.meta?.source?.liveFallback ? "LIVE_FALLBACK" : effectiveSnapshotDate ? "SNAPSHOT" : "SYSTEM";
  const snapshotKey = effectiveSnapshotDate ? formatDateKey(effectiveSnapshotDate) : "no-snapshot";
  const activeFingerprint = buildStudentAlertActiveFingerprint({
    studentId: candidate.id,
    alertType: reminder.type
  });

  return {
    tenantId,
    businessPartnerId: operationalContext.businessPartnerId,
    franchiseId: operationalContext.franchiseId,
    centerId: operationalContext.centerId,
    type: reminder.type,
    category: mapStudentReminderCategory(reminder.type),
    severity: reminder.severity,
    title: reminder.title,
    message: reminder.message,
    metricKey: reminder.metricKey || null,
    thresholdValue: reminder.threshold ?? null,
    observedValue: reminder.observedValue ?? null,
    deltaPercent: null,
    sourceKind,
    sourceSnapshotDate: effectiveSnapshotDate ? normalizeDate(effectiveSnapshotDate) : null,
    sourceWindowKey: sourceWindowKey || null,
    fingerprint: `${activeFingerprint}:snapshot:${snapshotKey}`,
    activeFingerprint,
    cooldownUntil: addHours(triggeredAt, ALERT_COOLDOWN_HOURS),
    triggeredAt,
    expiresAt: addDays(triggeredAt, ALERT_EXPIRY_DAYS),
    deepLinkPath: "/student/dashboard",
    metadata: {
      source: "student_engagement.analytics",
      sourceMeta: bundle?.meta?.source || null,
      reminderScope: "STUDENT_ENGAGEMENT",
      reminderType: reminder.type,
      logicalRuleKey: getLogicalRuleKey(reminder.type),
      studentId: candidate.id,
      studentName: `${String(candidate.firstName || "").trim()} ${String(candidate.lastName || "").trim()}`.trim() || candidate.admissionNo || null,
      engagementScore: bundle?.overview?.engagementScore ?? null,
      inactiveDays: bundle?.overview?.inactiveDays ?? null,
      weakTopicCount: bundle?.overview?.weakTopicCount ?? null
    },
    targets
  };
}

async function evaluateStudentEngagementAlerts({
  tenantId,
  studentId,
  snapshotDate,
  sourceWindowKey,
  triggeredAt = new Date(),
  tx = prisma,
  dependencies = {}
} = {}) {
  if (!tenantId) {
    throw new Error("tenantId is required for student engagement alert evaluation");
  }

  const listCandidates = dependencies.listStudentEngagementCandidates || listStudentEngagementCandidates;
  const loadBundle = dependencies.getStudentEngagementAnalyticsBundle || getStudentEngagementAnalyticsBundle;
  const resolveOperationalContext = dependencies.resolveStudentOperationalContext || resolveStudentOperationalContext;
  const normalizedTriggeredAt = normalizeDate(triggeredAt);

  const candidates = await listCandidates({
    tenantId,
    studentIds: studentId ? [studentId] : undefined,
    limit: studentId ? 1 : 500,
    tx
  });

  if (!candidates.length) {
    return {
      skipped: true,
      reason: "student_candidates_not_resolved",
      events: [],
      targets: [],
      studentCount: 0,
      alertCount: 0
    };
  }

  const events = [];
  const allTargets = [];
  let alertCount = 0;

  for (const candidate of candidates) {
    const operationalContext = await resolveOperationalContext({
      tenantId,
      hierarchyNodeId: candidate.hierarchyNodeId,
      tx,
      dependencies
    });

    if (!operationalContext?.businessPartnerId) {
      continue;
    }

    const targets = await resolveStudentNotificationTargets({
      tenantId,
      candidate,
      operationalContext,
      tx,
      dependencies
    });

    if (!targets.length) {
      continue;
    }

    const bundle = await loadBundle({
      tenantId,
      studentId: candidate.id,
      asOf: snapshotDate,
      tx
    });

    const reminders = buildStudentEngagementReminderItems({ candidate, bundle });
    alertCount += reminders.length;
    allTargets.push(...targets);

    for (const reminder of reminders) {
      const event = buildStudentEngagementAlertEvent({
        tenantId,
        candidate,
        operationalContext,
        bundle,
        reminder,
        snapshotDate,
        sourceWindowKey,
        triggeredAt: normalizedTriggeredAt,
        targets
      });

      if (event) {
        events.push(event);
      }
    }
  }

  return {
    skipped: false,
    reason: null,
    events,
    targets: Array.from(new Map(allTargets.map((target) => [target.targetKey, target])).values()),
    studentCount: candidates.length,
    alertCount
  };
}

async function evaluateBusinessPartnerOperationalAlerts({
  tenantId,
  businessPartnerId,
  snapshotDate,
  sourceWindowKey,
  triggeredAt = new Date(),
  tx = prisma,
  dependencies = {}
} = {}) {
  if (!tenantId || !businessPartnerId) {
    throw new Error("tenantId and businessPartnerId are required for operational alert evaluation");
  }

  const resolveScope = dependencies.resolveBusinessPartnerScope || resolveBusinessPartnerScope;
  const loadFranchiseAlerts = dependencies.getFranchiseAlertsAnalytics || getFranchiseAlertsAnalytics;
  const bpScope = await resolveScope({
    tenantId,
    businessPartnerId,
    tx
  });

  if (!bpScope?.businessPartner?.id) {
    return {
      skipped: true,
      reason: "bp_scope_not_resolved",
      events: [],
      targets: [],
      franchiseCount: 0,
      alertCount: 0
    };
  }

  const targets = await resolveBusinessPartnerNotificationTargets({
    tenantId,
    businessPartner: bpScope.businessPartner,
    bpScope,
    tx,
    dependencies
  });

  if (!targets.length) {
    return {
      skipped: true,
      reason: "bp_targets_not_resolved",
      events: [],
      targets: [],
      franchiseCount: bpScope.franchiseIds.length,
      alertCount: 0
    };
  }

  const events = [];
  let alertCount = 0;

  for (const franchiseId of bpScope.franchiseIds) {
    const analytics = await loadFranchiseAlerts({
      tenantId,
      bpScope,
      franchiseId,
      asOf: snapshotDate
    });

    const items = Array.isArray(analytics?.items) ? analytics.items : [];
    alertCount += items.length;

    for (const item of items) {
      const event = buildOperationalAlertEvent({
        businessPartnerId,
        franchiseId,
        item,
        analyticsMeta: {
          tenantId,
          ...(analytics?.meta || {})
        },
        snapshotDate,
        sourceWindowKey,
        triggeredAt: normalizeDate(triggeredAt),
        targets
      });

      if (event) {
        events.push(event);
      }
    }
  }

  return {
    skipped: false,
    reason: null,
    events,
    targets,
    franchiseCount: bpScope.franchiseIds.length,
    alertCount
  };
}

async function evaluateFranchiseOperationalAlerts({
  tenantId,
  franchiseScope,
  snapshotDate,
  sourceWindowKey,
  triggeredAt = new Date(),
  tx = prisma,
  dependencies = {}
} = {}) {
  if (!tenantId || !franchiseScope?.franchise?.id) {
    throw new Error("tenantId and franchiseScope are required for franchise operational alert evaluation");
  }

  const loadAnomalies = dependencies.getFranchiseOperationalAnomaliesAnalytics || getFranchiseOperationalAnomaliesAnalytics;
  const targets = await resolveFranchiseNotificationTargets({
    tenantId,
    franchiseScope,
    tx,
    dependencies
  });

  if (!targets.length) {
    return {
      skipped: true,
      reason: "franchise_targets_not_resolved",
      events: [],
      targets: [],
      alertCount: 0
    };
  }

  const analytics = await loadAnomalies({
    tenantId,
    franchiseScope,
    query: {
      asOf: snapshotDate,
      limit: 200,
      offset: 0,
      sortBy: "severity",
      sortDirection: "desc"
    },
    tx
  });

  const items = Array.isArray(analytics?.items) ? analytics.items : [];
  const events = [];

  for (const item of items) {
    const event = buildFranchiseOperationalAlertEvent({
      tenantId,
      franchiseScope,
      item,
      analyticsMeta: analytics?.meta || {},
      snapshotDate,
      sourceWindowKey,
      triggeredAt: normalizeDate(triggeredAt),
      targets
    });

    if (event) {
      events.push(event);
    }
  }

  return {
    skipped: false,
    reason: null,
    events,
    targets,
    alertCount: items.length
  };
}

async function evaluateCenterOperationalAlerts({
  tenantId,
  centerScope,
  snapshotDate,
  sourceWindowKey,
  triggeredAt = new Date(),
  tx = prisma,
  dependencies = {}
} = {}) {
  if (!tenantId || !centerScope?.center?.id) {
    throw new Error("tenantId and centerScope are required for center operational alert evaluation");
  }

  const loadAnomalies = dependencies.getCenterOperationalAnomaliesAnalytics || getCenterOperationalAnomaliesAnalytics;
  const targets = await resolveCenterNotificationTargets({
    tenantId,
    centerScope,
    tx,
    dependencies
  });

  if (!targets.length) {
    return {
      skipped: true,
      reason: "center_targets_not_resolved",
      events: [],
      targets: [],
      alertCount: 0
    };
  }

  const analytics = await loadAnomalies({
    tenantId,
    centerScope,
    query: {
      asOf: snapshotDate,
      limit: 200,
      offset: 0,
      sortBy: "severity",
      sortDirection: "desc"
    },
    tx
  });

  const items = Array.isArray(analytics?.items) ? analytics.items : [];
  const events = [];

  for (const item of items) {
    const event = buildCenterOperationalAlertEvent({
      tenantId,
      centerScope,
      item,
      analyticsMeta: analytics?.meta || {},
      snapshotDate,
      sourceWindowKey,
      triggeredAt: normalizeDate(triggeredAt),
      targets
    });

    if (event) {
      events.push(event);
    }
  }

  return {
    skipped: false,
    reason: null,
    events,
    targets,
    alertCount: items.length
  };
}

async function evaluateTeacherOperationalAlerts({
  tenantId,
  teacherScope,
  snapshotDate,
  sourceWindowKey,
  triggeredAt = new Date(),
  tx = prisma,
  dependencies = {}
} = {}) {
  if (!tenantId || !teacherScope?.teacherUserId) {
    throw new Error("tenantId and teacherScope are required for teacher operational alert evaluation");
  }

  const resolveScope = dependencies.resolveTeacherOperationalScope || resolveTeacherOperationalScope;
  const loadAnomalies = dependencies.getTeacherOperationalAnomaliesAnalytics || getTeacherOperationalAnomaliesAnalytics;
  const resolvedTeacherScope = teacherScope.businessPartnerId
    ? teacherScope
    : await resolveScope({
        tenantId,
        authUserId: teacherScope.teacherUserId,
        hierarchyNodeId: teacherScope.hierarchyNodeId,
        tx
      });

  const targets = await resolveTeacherNotificationTargets({
    tenantId,
    teacherScope: resolvedTeacherScope,
    tx,
    dependencies
  });

  if (!targets.length) {
    return {
      skipped: true,
      reason: "teacher_targets_not_resolved",
      events: [],
      targets: [],
      alertCount: 0
    };
  }

  const analytics = await loadAnomalies({
    tenantId,
    authUserId: resolvedTeacherScope.teacherUserId,
    hierarchyNodeId: resolvedTeacherScope.hierarchyNodeId,
    query: {
      asOf: snapshotDate,
      limit: ALERT_QUERY_LIMIT,
      offset: 0,
      sortBy: "priorityScore",
      sortDirection: "desc"
    },
    tx
  });

  const items = Array.isArray(analytics?.items) ? analytics.items : [];
  const events = [];

  for (const item of items) {
    const event = buildTeacherOperationalAlertEvent({
      tenantId,
      teacherScope: resolvedTeacherScope,
      item,
      analyticsMeta: analytics?.meta || {},
      snapshotDate,
      sourceWindowKey,
      triggeredAt: normalizeDate(triggeredAt),
      targets
    });

    if (event) {
      events.push(event);
    }
  }

  return {
    skipped: false,
    reason: null,
    events,
    targets,
    alertCount: items.length
  };
}

async function recordOperationalRuleStateSuccess({
  tenantId,
  businessPartnerId = null,
  ruleKey,
  sourceWindowKey = null,
  snapshotDate = null,
  tx = prisma,
  now = new Date()
} = {}) {
  if (!tenantId || !ruleKey) {
    return null;
  }

  const scopeKey = buildOperationalRuleScopeKey({ businessPartnerId });
  const lastWindowKey = buildOperationalRuleWindowKey({ sourceWindowKey, snapshotDate });
  const timestamp = normalizeDate(now);

  return tx.operationalNotificationRuleState.upsert({
    where: {
      tenantId_scopeKey_ruleKey: {
        tenantId,
        scopeKey,
        ruleKey
      }
    },
    create: {
      tenantId,
      businessPartnerId,
      scopeKey,
      ruleKey,
      lastWindowKey,
      lastRunAt: timestamp,
      lastSuccessAt: timestamp,
      lastError: null,
      failureCount: 0
    },
    update: {
      businessPartnerId,
      lastWindowKey,
      lastRunAt: timestamp,
      lastSuccessAt: timestamp,
      lastError: null,
      failureCount: 0
    }
  });
}

async function recordOperationalRuleStateFailure({
  tenantId,
  businessPartnerId = null,
  ruleKey,
  sourceWindowKey = null,
  snapshotDate = null,
  error,
  tx = prisma,
  now = new Date()
} = {}) {
  if (!tenantId || !ruleKey) {
    return null;
  }

  const scopeKey = buildOperationalRuleScopeKey({ businessPartnerId });
  const lastWindowKey = buildOperationalRuleWindowKey({ sourceWindowKey, snapshotDate });
  const timestamp = normalizeDate(now);
  const lastError = error?.message || String(error || "Operational rule failure");

  return tx.operationalNotificationRuleState.upsert({
    where: {
      tenantId_scopeKey_ruleKey: {
        tenantId,
        scopeKey,
        ruleKey
      }
    },
    create: {
      tenantId,
      businessPartnerId,
      scopeKey,
      ruleKey,
      lastWindowKey,
      lastRunAt: timestamp,
      lastFailureAt: timestamp,
      lastError,
      failureCount: 1
    },
    update: {
      businessPartnerId,
      lastWindowKey,
      lastRunAt: timestamp,
      lastFailureAt: timestamp,
      lastError,
      failureCount: {
        increment: 1
      }
    }
  });
}

async function emitOperationalFailureNotification({
  tenantId,
  businessPartnerId,
  type,
  title,
  message,
  error,
  sourceWindowKey,
  snapshotDate,
  triggeredAt = new Date(),
  tx = prisma,
  dependencies = {}
} = {}) {
  if (!tenantId || !businessPartnerId || !type || !title || !message) {
    return {
      skipped: true,
      reason: "missing_failure_notification_input"
    };
  }

  const createEvent = dependencies.createOrUpdateOperationalEvent;
  if (typeof createEvent !== "function") {
    return {
      skipped: true,
      reason: "missing_create_operational_event"
    };
  }

  const resolveScope = dependencies.resolveBusinessPartnerScope || resolveBusinessPartnerScope;
  const bpScope = await resolveScope({ tenantId, businessPartnerId, tx });

  if (!bpScope?.businessPartner?.id) {
    return {
      skipped: true,
      reason: "bp_scope_not_resolved"
    };
  }

  const targets = await resolveBusinessPartnerNotificationTargets({
    tenantId,
    businessPartner: bpScope.businessPartner,
    bpScope,
    tx,
    dependencies
  });

  if (!targets.length) {
    return {
      skipped: true,
      reason: "bp_targets_not_resolved"
    };
  }

  const normalizedTriggeredAt = normalizeDate(triggeredAt);
  const activeFingerprint = buildFailureActiveFingerprint({
    businessPartnerId,
    type,
    sourceWindowKey,
    snapshotDate
  });

  return createEvent(
    {
      tenantId,
      businessPartnerId,
      type,
      category: "SYSTEM",
      severity: type === "SCHEDULER_FAILURE" ? "CRITICAL" : "HIGH",
      title,
      message,
      sourceKind: type === "SCHEDULER_FAILURE" ? "SCHEDULER" : snapshotDate ? "SNAPSHOT" : "SYSTEM",
      sourceSnapshotDate: snapshotDate ? normalizeDate(snapshotDate) : null,
      sourceWindowKey: sourceWindowKey || null,
      fingerprint: activeFingerprint,
      activeFingerprint,
      cooldownUntil: addHours(normalizedTriggeredAt, FAILURE_COOLDOWN_HOURS),
      triggeredAt: normalizedTriggeredAt,
      expiresAt: addDays(normalizedTriggeredAt, FAILURE_EXPIRY_DAYS),
      deepLinkPath: "/bp",
      metadata: {
        failureType: type,
        error: error?.message || String(error || "Operational failure")
      },
      targets
    },
    tx
  );
}

export {
  OPERATIONAL_RULE_KEYS,
  buildOperationalRuleScopeKey,
  buildOperationalRuleWindowKey,
  emitOperationalFailureNotification,
  evaluateBusinessPartnerOperationalAlerts,
  evaluateCenterOperationalAlerts,
  evaluateFranchiseOperationalAlerts,
  evaluateStudentEngagementAlerts,
  evaluateTeacherOperationalAlerts,
  recordOperationalRuleStateFailure,
  recordOperationalRuleStateSuccess,
  resolveCenterNotificationTargets,
  resolveTeacherNotificationTargets,
  resolveFranchiseNotificationTargets,
  resolveBusinessPartnerNotificationTargets,
  resolveStudentNotificationTargets
};