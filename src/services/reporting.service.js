import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import {
  getBusinessPartnerCenterHealth,
  getBusinessPartnerDashboardOverview,
  getBusinessPartnerFranchiseRanking,
  getBusinessPartnerRevenueTrend,
  getBusinessPartnerStudentGrowthTrend
} from "./bp-dashboard.service.js";
import {
  getFranchiseDashboardAnomalies,
  getFranchiseDashboardCenterHealth,
  getFranchiseDashboardOverview,
  getFranchiseDashboardTeacherOps,
  getFranchiseDashboardTrends
} from "./franchise-dashboard.service.js";
import {
  getCenterDashboardAnomalies,
  getCenterDashboardAttendanceHealth,
  getCenterDashboardBatchHealth,
  getCenterDashboardOverview,
  getCenterDashboardTeacherOps,
  getCenterDashboardTrends,
  getCenterDashboardWorksheetOps
} from "./center-dashboard.service.js";
import {
  getTeacherDashboardAnomalies,
  getTeacherDashboardAttendanceProductivity,
  getTeacherDashboardGradingProductivity,
  getTeacherDashboardOverview,
  getTeacherDashboardTaskQueue,
  getTeacherDashboardTrends
} from "./teacher-dashboard.service.js";
import {
  getStudentDashboardAttendanceTrends,
  getStudentDashboardOverview,
  getStudentDashboardPracticeTrends,
  getStudentDashboardReminders,
  getStudentDashboardWeakTopics
} from "./student-dashboard.service.js";
import {
  getParentAchievementVisibility,
  getParentAttendanceVisibility,
  getParentDashboardOverview,
  getParentEngagementVisibility,
  getParentWorksheetProgressVisibility,
  listParentDashboardReminders
} from "./parent-visibility.service.js";
import { resolveCenterOperationalScope } from "./center-operational-analytics.service.js";
import { resolveTeacherOperationalScope } from "./teacher-productivity-analytics.service.js";

const REPORT_KEY_BY_ALIAS = {
  "bp-operational": "bp-operational",
  "franchise-operational": "franchise-operational",
  "center-operational": "center-operational",
  "teacher-productivity": "teacher-productivity",
  "student-engagement": "student-engagement",
  "parent-visibility": "parent-visibility",
  "governance-audit": "governance-audit",
  "workflow-lifecycle": "workflow-lifecycle"
};

const SNAPSHOT_TIMESTAMP_KEYS = new Set([
  "approvedAt",
  "assignedAt",
  "capturedAt",
  "completedAt",
  "createdAt",
  "date",
  "earnedAt",
  "finalSubmittedAt",
  "generatedAt",
  "resolvedAt",
  "reviewedAt",
  "snapshotDate",
  "submittedAt",
  "triggeredAt",
  "updatedAt"
]);

const APPEND_ONLY_ORDERING = Object.freeze({
  "governance-audit": ["createdAt", "id"],
  "workflow-lifecycle": ["createdAt", "id"],
  "student-engagement": ["snapshotDate", "id"]
});

const EXPORT_LIFECYCLE_AUDIT_ENTITY_TYPE = "REPORT_EXPORT_JOB";
const THIRTY_DAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const GOVERNANCE_SELF_AUDIT_ACTIONS = Object.freeze([
  "SUPERADMIN_VIEW_GOVERNANCE_AUDIT_REPORT",
  "VIEW_PRINTABLE_REPORT",
  "EXPORT_REPORT_PDF",
  "EXPORT_REPORT_EXCEL"
]);

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function humanizeKey(value) {
  return String(value || "Value")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatDisplayValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }

  return String(value);
}

function clampInteger(value, { fallback, min, max }) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))].sort();
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "data") && Object.keys(payload).every((key) => ["data", "meta"].includes(key))) {
    return payload.data;
  }

  return payload;
}

function stableSerialize(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function normalizeTimestampValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function collectSnapshotTimestamps(value, results = []) {
  if (value === null || value === undefined) {
    return results;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSnapshotTimestamps(item, results);
    }
    return results;
  }

  if (value instanceof Date) {
    const normalized = normalizeTimestampValue(value);
    if (normalized) {
      results.push(normalized);
    }
    return results;
  }

  if (typeof value !== "object") {
    return results;
  }

  for (const [key, child] of Object.entries(value)) {
    if (SNAPSHOT_TIMESTAMP_KEYS.has(key)) {
      const normalized = normalizeTimestampValue(child);
      if (normalized) {
        results.push(normalized);
      }
      continue;
    }

    collectSnapshotTimestamps(child, results);
  }

  return results;
}

function buildReportSnapshotMetadata({ reportKey, title, subtitle, scope, filters, highlights, sections, tables }) {
  const snapshotPayload = {
    reportKey,
    title,
    subtitle,
    scope,
    filters,
    highlights,
    sections,
    tables
  };
  const timestamps = collectSnapshotTimestamps(snapshotPayload).sort();
  const capturedAt = timestamps[timestamps.length - 1] || new Date().toISOString();
  const digest = sha256(snapshotPayload);

  return {
    referenceId: `snapshot_${digest.slice(0, 24)}`,
    capturedAt,
    lineage: {
      firstTimestamp: timestamps[0] || null,
      lastTimestamp: timestamps[timestamps.length - 1] || null,
      timestampCount: timestamps.length,
      deterministicOrdering: APPEND_ONLY_ORDERING[reportKey] || ["id"]
    },
    counts: {
      highlightCount: (highlights || []).length,
      sectionCount: (sections || []).length,
      tableCount: (tables || []).length,
      rowCount: (tables || []).reduce((total, table) => total + ((table.rows || []).length), 0)
    },
    filterHash: sha256(filters || {}),
    scopeHash: sha256(scope || {}),
    isAppendOnly: Boolean(APPEND_ONLY_ORDERING[reportKey]),
    contentDigest: digest
  };
}

function buildGovernanceAuditWhere({ tenantId, since = null } = {}) {
  return {
    tenantId,
    ...(since ? { createdAt: { gte: since } } : {}),
    NOT: [
      { entityType: EXPORT_LIFECYCLE_AUDIT_ENTITY_TYPE },
      {
        entityType: "REPORT",
        entityId: "governance-audit",
        action: { in: GOVERNANCE_SELF_AUDIT_ACTIONS }
      }
    ]
  };
}

function collectScalarSummaryItems(value, prefix = "", depth = 0, items = []) {
  if (items.length >= 10 || depth > 2 || value === null || value === undefined) {
    return items;
  }

  if (["string", "number", "boolean"].includes(typeof value) || value instanceof Date) {
    items.push({
      label: prefix || "Value",
      value,
      displayValue: formatDisplayValue(value)
    });
    return items;
  }

  if (Array.isArray(value)) {
    if (value.length && value.every((entry) => typeof entry !== "object" || entry === null)) {
      items.push({
        label: prefix || "Items",
        value: value.join(", "),
        displayValue: value.join(", ") || "-"
      });
    }
    return items;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (Array.isArray(child) || child === null || child === undefined) {
        continue;
      }
      collectScalarSummaryItems(child, prefix ? `${prefix} ${humanizeKey(key)}` : humanizeKey(key), depth + 1, items);
      if (items.length >= 10) {
        break;
      }
    }
  }

  return items;
}

function normalizeRowValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (["string", "number", "boolean"].includes(typeof value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatDisplayValue(item)).join(", ");
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }

  return String(value);
}

function inferColumnsFromRows(rows) {
  const orderedKeys = [];
  const seen = new Set();

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    for (const key of Object.keys(row)) {
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      orderedKeys.push(key);
      if (orderedKeys.length >= 10) {
        return orderedKeys;
      }
    }
  }

  return orderedKeys;
}

function createTable({ id, title, rows = [] }) {
  const normalizedRows = rows
    .filter((row) => row && typeof row === "object" && !Array.isArray(row))
    .map((row) => {
      const normalized = {};
      for (const key of Object.keys(row)) {
        normalized[key] = normalizeRowValue(row[key]);
      }
      return normalized;
    });

  const columns = inferColumnsFromRows(normalizedRows).map((key) => ({
    key,
    label: humanizeKey(key)
  }));

  return {
    id,
    title,
    columns,
    rows: normalizedRows
  };
}

function extractTablesFromData(sectionId, title, data) {
  const tables = [];
  const normalizedData = unwrapPayload(data);

  if (Array.isArray(normalizedData)) {
    if (normalizedData.length && typeof normalizedData[0] === "object") {
      tables.push(createTable({ id: `${sectionId}-items`, title, rows: normalizedData }));
    }
    return tables;
  }

  if (!normalizedData || typeof normalizedData !== "object") {
    return tables;
  }

  for (const [key, value] of Object.entries(normalizedData)) {
    if (!Array.isArray(value) || !value.length || typeof value[0] !== "object" || Array.isArray(value[0])) {
      continue;
    }

    tables.push(
      createTable({
        id: `${sectionId}-${key}`,
        title: `${title} ${humanizeKey(key)}`,
        rows: value
      })
    );
  }

  return tables;
}

function buildSection({ id, title, payload }) {
  const normalized = unwrapPayload(payload);
  const summaryItems = collectScalarSummaryItems(normalized);
  const tables = extractTablesFromData(id, title, normalized);

  return {
    section: {
      id,
      title,
      summaryItems,
      tableIds: tables.map((table) => table.id),
      meta: payload?.meta || null
    },
    tables
  };
}

function buildReportDocument({ reportKey, title, subtitle, scope, filters, highlights, sectionEntries }) {
  const sections = [];
  const tables = [];

  for (const entry of sectionEntries) {
    sections.push(entry.section);
    tables.push(...entry.tables);
  }

  const normalizedHighlights = (highlights || []).filter(Boolean).map((item) => ({
    id: item.id,
    label: item.label,
    value: item.value,
    displayValue: item.displayValue || formatDisplayValue(item.value)
  }));
  const snapshot = buildReportSnapshotMetadata({
    reportKey,
    title,
    subtitle,
    scope,
    filters,
    highlights: normalizedHighlights,
    sections,
    tables
  });

  return {
    reportKey,
    title,
    subtitle,
    documentTitle: `${title} - ${scope.label || scope.role || "Scope"}`,
    generatedAt: snapshot.capturedAt,
    scope,
    filters,
    highlights: normalizedHighlights,
    sections,
    tables,
    metadata: {
      snapshot,
      integrity: {
        algorithm: "sha256",
        digest: snapshot.contentDigest,
        filterHash: snapshot.filterHash,
        scopeHash: snapshot.scopeHash
      }
    },
    printable: {
      mode: "printable",
      pageTitle: `${title} - Printable`
    }
  };
}

async function countOpenWorkflowItems(where) {
  const [franchise, center, teacher] = await Promise.all([
    prisma.franchiseOperationalWorkflow.count({ where }),
    prisma.centerOperationalWorkflow.count({ where }),
    prisma.teacherOperationalWorkflow.count({ where })
  ]);

  return franchise + center + teacher;
}

async function buildBusinessPartnerOperationalReport({ tenantId, bpScope, query }) {
  const months = clampInteger(query.months, { fallback: 6, min: 1, max: 24 });
  const bpId = bpScope?.businessPartner?.id;

  const [overview, revenueTrend, studentGrowth, franchiseRanking, centerHealth, totalFranchises, totalCenters, totalStudents, openWorkflows] = await Promise.all([
    getBusinessPartnerDashboardOverview({ tenantId, bpScope, query }),
    getBusinessPartnerRevenueTrend({ tenantId, bpScope, query: { ...query, months } }),
    getBusinessPartnerStudentGrowthTrend({ tenantId, bpScope, query: { ...query, months } }),
    getBusinessPartnerFranchiseRanking({ tenantId, bpScope, query: { ...query, limit: clampInteger(query.limit, { fallback: 10, min: 1, max: 50 }), offset: 0 } }),
    getBusinessPartnerCenterHealth({ tenantId, bpScope, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    prisma.franchiseProfile.count({ where: { tenantId, businessPartnerId: bpId, isActive: true } }),
    prisma.centerProfile.count({ where: { tenantId, franchiseProfile: { is: { businessPartnerId: bpId } }, isActive: true } }),
    prisma.student.count({ where: { tenantId, isActive: true, hierarchyNodeId: { in: uniqueStrings(bpScope?.hierarchyNodeIds || []) } } }),
    countOpenWorkflowItems({ tenantId, businessPartnerId: bpId, status: { not: "RESOLVED" } })
  ]);

  const sectionEntries = [
    buildSection({ id: "bp-overview", title: "Network Overview", payload: overview }),
    buildSection({ id: "bp-revenue-trend", title: "Revenue Trend", payload: revenueTrend }),
    buildSection({ id: "bp-student-growth", title: "Student Growth Trend", payload: studentGrowth }),
    buildSection({ id: "bp-franchise-ranking", title: "Franchise Ranking", payload: franchiseRanking }),
    buildSection({ id: "bp-center-health", title: "Center Health", payload: centerHealth })
  ];

  return buildReportDocument({
    reportKey: "bp-operational",
    title: "Business Partner Operational Summary",
    subtitle: "Snapshot-backed network performance across franchises, centers, and growth trends.",
    scope: {
      role: "BP",
      label: bpScope?.businessPartner?.name || bpScope?.businessPartner?.code || "Business Partner",
      tenantId,
      entityId: bpId || null
    },
    filters: { asOf: query.asOf || null, months },
    highlights: [
      { id: "total-franchises", label: "Active Franchises", value: totalFranchises },
      { id: "total-centers", label: "Active Centers", value: totalCenters },
      { id: "total-students", label: "Active Students", value: totalStudents },
      { id: "open-workflows", label: "Open Workflows", value: openWorkflows },
      { id: "risk-centers", label: "Centers In Risk Band", value: (unwrapPayload(centerHealth)?.items || []).filter((item) => toNumber(item.healthScore, 100) < 60).length }
    ],
    sectionEntries
  });
}

async function buildFranchiseOperationalReport({ tenantId, franchiseScope, query }) {
  const months = clampInteger(query.months, { fallback: 6, min: 1, max: 24 });
  const franchiseId = franchiseScope?.franchise?.id;

  const [overview, centerHealth, teacherOps, anomalies, trends, totalCenters, totalStudents, openWorkflows] = await Promise.all([
    getFranchiseDashboardOverview({ tenantId, franchiseScope, query }),
    getFranchiseDashboardCenterHealth({ tenantId, franchiseScope, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getFranchiseDashboardTeacherOps({ tenantId, franchiseScope, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getFranchiseDashboardAnomalies({ tenantId, franchiseScope, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getFranchiseDashboardTrends({ tenantId, franchiseScope, query: { ...query, months } }),
    prisma.centerProfile.count({ where: { tenantId, franchiseProfileId: franchiseId, isActive: true } }),
    prisma.student.count({ where: { tenantId, isActive: true, hierarchyNodeId: { in: uniqueStrings(franchiseScope?.hierarchyNodeIds || []) } } }),
    countOpenWorkflowItems({ tenantId, franchiseId, status: { not: "RESOLVED" } })
  ]);

  const sectionEntries = [
    buildSection({ id: "franchise-overview", title: "Operational Overview", payload: overview }),
    buildSection({ id: "franchise-center-health", title: "Center Health", payload: centerHealth }),
    buildSection({ id: "franchise-teacher-ops", title: "Teacher Operations", payload: teacherOps }),
    buildSection({ id: "franchise-anomalies", title: "Operational Anomalies", payload: anomalies }),
    buildSection({ id: "franchise-trends", title: "Operational Trends", payload: trends })
  ];

  return buildReportDocument({
    reportKey: "franchise-operational",
    title: "Franchise Operational Summary",
    subtitle: "Center health, teacher operations, anomaly queues, and operational trends within franchise scope.",
    scope: {
      role: "FRANCHISE",
      label: franchiseScope?.franchise?.displayName || franchiseScope?.franchise?.name || "Franchise",
      tenantId,
      entityId: franchiseId || null
    },
    filters: { asOf: query.asOf || null, months },
    highlights: [
      { id: "total-centers", label: "Active Centers", value: totalCenters },
      { id: "total-students", label: "Active Students", value: totalStudents },
      { id: "open-workflows", label: "Open Workflows", value: openWorkflows },
      { id: "active-anomalies", label: "Active Anomalies", value: (unwrapPayload(anomalies)?.items || []).length },
      { id: "risk-centers", label: "Centers In Risk Band", value: (unwrapPayload(centerHealth)?.items || []).filter((item) => toNumber(item.healthScore, 100) < 60).length }
    ],
    sectionEntries
  });
}

async function buildCenterOperationalReport({ tenantId, authUserId, hierarchyNodeId, query }) {
  const months = clampInteger(query.months, { fallback: 6, min: 1, max: 24 });
  const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId, hierarchyNodeId });

  const [overview, attendanceHealth, worksheetOps, teacherOps, batchHealth, anomalies, trends, totalStudents, totalTeachers, openWorkflows] = await Promise.all([
    getCenterDashboardOverview({ tenantId, authUserId, hierarchyNodeId, query }),
    getCenterDashboardAttendanceHealth({ tenantId, authUserId, hierarchyNodeId, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getCenterDashboardWorksheetOps({ tenantId, authUserId, hierarchyNodeId, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getCenterDashboardTeacherOps({ tenantId, authUserId, hierarchyNodeId, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getCenterDashboardBatchHealth({ tenantId, authUserId, hierarchyNodeId, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getCenterDashboardAnomalies({ tenantId, authUserId, hierarchyNodeId, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getCenterDashboardTrends({ tenantId, authUserId, hierarchyNodeId, query: { ...query, months } }),
    prisma.student.count({ where: { tenantId, isActive: true, hierarchyNodeId: centerScope.center.hierarchyNodeId } }),
    prisma.teacherProfile.count({ where: { tenantId, isActive: true, hierarchyNodeId: centerScope.center.hierarchyNodeId } }),
    countOpenWorkflowItems({ tenantId, centerId: centerScope.center.id, status: { not: "RESOLVED" } })
  ]);

  const sectionEntries = [
    buildSection({ id: "center-overview", title: "Operational Overview", payload: overview }),
    buildSection({ id: "center-attendance", title: "Attendance Health", payload: attendanceHealth }),
    buildSection({ id: "center-worksheets", title: "Worksheet Operations", payload: worksheetOps }),
    buildSection({ id: "center-teachers", title: "Teacher Operations", payload: teacherOps }),
    buildSection({ id: "center-batches", title: "Batch Health", payload: batchHealth }),
    buildSection({ id: "center-anomalies", title: "Operational Anomalies", payload: anomalies }),
    buildSection({ id: "center-trends", title: "Operational Trends", payload: trends })
  ];

  return buildReportDocument({
    reportKey: "center-operational",
    title: "Center Operational Summary",
    subtitle: "Attendance, worksheet, teacher, batch, and anomaly health for the current center.",
    scope: {
      role: "CENTER",
      label: centerScope.center.name,
      tenantId,
      entityId: centerScope.center.id
    },
    filters: { asOf: query.asOf || null, months },
    highlights: [
      { id: "total-students", label: "Active Students", value: totalStudents },
      { id: "total-teachers", label: "Active Teachers", value: totalTeachers },
      { id: "open-workflows", label: "Open Workflows", value: openWorkflows },
      { id: "active-anomalies", label: "Active Anomalies", value: (unwrapPayload(anomalies)?.items || []).length },
      { id: "at-risk-batches", label: "At-Risk Batches", value: (unwrapPayload(batchHealth)?.items || []).filter((item) => toNumber(item.healthScore, 100) < 60).length }
    ],
    sectionEntries
  });
}

async function buildTeacherProductivityReport({ tenantId, authUserId, hierarchyNodeId, query }) {
  const months = clampInteger(query.months, { fallback: 6, min: 1, max: 24 });
  const teacherScope = await resolveTeacherOperationalScope({ tenantId, authUserId, hierarchyNodeId });

  const [overview, attendanceProductivity, gradingProductivity, taskQueue, anomalies, trends, openWorkflows] = await Promise.all([
    getTeacherDashboardOverview({ tenantId, authUserId, hierarchyNodeId, query }),
    getTeacherDashboardAttendanceProductivity({ tenantId, authUserId, hierarchyNodeId, query }),
    getTeacherDashboardGradingProductivity({ tenantId, authUserId, hierarchyNodeId, query }),
    getTeacherDashboardTaskQueue({ tenantId, authUserId, hierarchyNodeId, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getTeacherDashboardAnomalies({ tenantId, authUserId, hierarchyNodeId, query: { ...query, limit: clampInteger(query.limit, { fallback: 12, min: 1, max: 50 }), offset: 0 } }),
    getTeacherDashboardTrends({ tenantId, authUserId, hierarchyNodeId, query: { ...query, months } }),
    prisma.teacherOperationalWorkflow.count({ where: { tenantId, teacherUserId: authUserId, status: { not: "RESOLVED" } } })
  ]);

  const sectionEntries = [
    buildSection({ id: "teacher-overview", title: "Operational Overview", payload: overview }),
    buildSection({ id: "teacher-attendance", title: "Attendance Productivity", payload: attendanceProductivity }),
    buildSection({ id: "teacher-grading", title: "Grading Productivity", payload: gradingProductivity }),
    buildSection({ id: "teacher-task-queue", title: "Task Queue", payload: taskQueue }),
    buildSection({ id: "teacher-anomalies", title: "Operational Anomalies", payload: anomalies }),
    buildSection({ id: "teacher-trends", title: "Operational Trends", payload: trends })
  ];

  return buildReportDocument({
    reportKey: "teacher-productivity",
    title: "Teacher Productivity Summary",
    subtitle: "Attendance throughput, grading velocity, anomaly load, and operational queue health.",
    scope: {
      role: "TEACHER",
      label: teacherScope.teacherName,
      tenantId,
      entityId: teacherScope.teacherUserId
    },
    filters: { asOf: query.asOf || null, months },
    highlights: [
      { id: "center", label: "Center", value: teacherScope.centerName },
      { id: "open-workflows", label: "Open Workflows", value: openWorkflows },
      { id: "queued-tasks", label: "Queued Tasks", value: (unwrapPayload(taskQueue)?.items || []).length },
      { id: "active-anomalies", label: "Active Anomalies", value: (unwrapPayload(anomalies)?.items || []).length }
    ],
    sectionEntries
  });
}

async function buildStudentEngagementReport({ tenantId, authUserId, studentId, query }) {
  const overview = await getStudentDashboardOverview({ tenantId, authUserId, studentId });
  const practiceTrends = await getStudentDashboardPracticeTrends({ tenantId, authUserId, studentId });
  const attendanceTrends = await getStudentDashboardAttendanceTrends({ tenantId, authUserId, studentId });
  const weakTopics = await getStudentDashboardWeakTopics({ tenantId, authUserId, studentId });
  const reminders = await getStudentDashboardReminders({
    tenantId,
    authUserId,
    studentId,
    limit: clampInteger(query.limit, { fallback: 10, min: 1, max: 25 })
  });
  const recentAuditCount = await prisma.auditLog.count({
    where: {
      tenantId,
      userId: authUserId,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  });

  const overviewData = unwrapPayload(overview) || {};
  const sectionEntries = [
    buildSection({ id: "student-overview", title: "Engagement Overview", payload: overview }),
    buildSection({ id: "student-practice", title: "Practice Trends", payload: practiceTrends }),
    buildSection({ id: "student-attendance", title: "Attendance Trends", payload: attendanceTrends }),
    buildSection({ id: "student-weak-topics", title: "Weak Topic Visibility", payload: weakTopics }),
    buildSection({ id: "student-reminders", title: "Operational Reminders", payload: reminders })
  ];

  return buildReportDocument({
    reportKey: "student-engagement",
    title: "Student Engagement Summary",
    subtitle: "Practice momentum, attendance consistency, weak-topic visibility, and reminders.",
    scope: {
      role: "STUDENT",
      label: overviewData.student?.studentName || overviewData.student?.admissionNo || "Student",
      tenantId,
      entityId: overviewData.student?.studentId || studentId || null
    },
    filters: { asOf: query.asOf || null },
    highlights: [
      { id: "engagement-score", label: "Engagement Score", value: overviewData.overview?.engagementScore ?? null },
      { id: "engagement-band", label: "Engagement Band", value: overviewData.overview?.engagementBand ?? null },
      { id: "unread-reminders", label: "Unread Reminders", value: overviewData.reminderSummary?.unreadCount ?? 0 },
      { id: "audit-activity", label: "30 Day Audit Activity", value: recentAuditCount }
    ],
    sectionEntries
  });
}

async function buildParentVisibilityReport({ tenantId, authUserId, query }) {
  const selectedStudentId = query.studentId ? String(query.studentId) : undefined;

  const overview = await getParentDashboardOverview({ tenantId, authUserId, studentId: selectedStudentId });
  const attendance = await getParentAttendanceVisibility({ tenantId, authUserId, studentId: selectedStudentId });
  const worksheetProgress = await getParentWorksheetProgressVisibility({ tenantId, authUserId, studentId: selectedStudentId });
  const engagement = await getParentEngagementVisibility({ tenantId, authUserId, studentId: selectedStudentId });
  const achievements = await getParentAchievementVisibility({ tenantId, authUserId, studentId: selectedStudentId });
  const reminders = await listParentDashboardReminders({
    tenantId,
    authUserId,
    studentId: selectedStudentId,
    limit: clampInteger(query.limit, { fallback: 10, min: 1, max: 25 })
  });

  const overviewData = unwrapPayload(overview) || {};
  const sectionEntries = [
    buildSection({ id: "parent-overview", title: "Household Overview", payload: overview }),
    buildSection({ id: "parent-attendance", title: "Attendance Visibility", payload: attendance }),
    buildSection({ id: "parent-worksheets", title: "Worksheet Progress", payload: worksheetProgress }),
    buildSection({ id: "parent-engagement", title: "Engagement Visibility", payload: engagement }),
    buildSection({ id: "parent-achievements", title: "Achievement Visibility", payload: achievements }),
    buildSection({ id: "parent-reminders", title: "Operational Reminders", payload: reminders })
  ];

  return buildReportDocument({
    reportKey: "parent-visibility",
    title: "Parent Visibility Summary",
    subtitle: "Household engagement, attendance, worksheet progress, achievements, and reminders for linked students.",
    scope: {
      role: "PARENT",
      label: overviewData.parent?.displayName || overviewData.parent?.username || "Parent",
      tenantId,
      entityId: null
    },
    filters: { studentId: selectedStudentId || null },
    highlights: [
      { id: "linked-students", label: "Linked Students", value: overviewData.householdSummary?.studentCount ?? 0 },
      { id: "average-engagement", label: "Average Engagement", value: overviewData.householdSummary?.averageEngagementScore ?? 0 },
      { id: "at-risk-students", label: "At-Risk Students", value: overviewData.householdSummary?.atRiskStudents ?? 0 },
      { id: "unread-reminders", label: "Unread Reminders", value: overviewData.householdSummary?.totalUnreadReminders ?? 0 }
    ],
    sectionEntries
  });
}

function buildGovernanceAuditSection({ id, title, groupedItems, recentItems }) {
  return {
    section: {
      id,
      title,
      summaryItems: groupedItems.slice(0, 8).map((item) => ({
        label: item.label,
        value: item.count,
        displayValue: formatDisplayValue(item.count)
      })),
      tableIds: [`${id}-summary`, `${id}-recent`],
      meta: null
    },
    tables: [
      createTable({ id: `${id}-summary`, title: `${title} Summary`, rows: groupedItems }),
      createTable({ id: `${id}-recent`, title: `${title} Recent Activity`, rows: recentItems })
    ]
  };
}

async function buildGovernanceAuditReport({ tenantId }) {
  const latestIncludedAudit = await prisma.auditLog.findFirst({
    where: buildGovernanceAuditWhere({ tenantId }),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      createdAt: true
    }
  });

  const since = latestIncludedAudit
    ? new Date(latestIncludedAudit.createdAt.getTime() - THIRTY_DAY_WINDOW_MS)
    : null;
  const [groupedByAction, groupedByEntity, recentAuditLogs] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ["action"],
      where: buildGovernanceAuditWhere({ tenantId, since }),
      _count: { _all: true },
      orderBy: { _count: { action: "desc" } },
      take: 12
    }),
    prisma.auditLog.groupBy({
      by: ["entityType"],
      where: buildGovernanceAuditWhere({ tenantId, since }),
      _count: { _all: true },
      orderBy: { _count: { entityType: "desc" } },
      take: 12
    }),
    prisma.auditLog.findMany({
      where: buildGovernanceAuditWhere({ tenantId }),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        createdAt: true,
        role: true,
        action: true,
        entityType: true,
        entityId: true,
        userId: true
      }
    })
  ]);

  const actions = groupedByAction.map((item) => ({ label: item.action, count: item._count._all }));
  const entities = groupedByEntity.map((item) => ({ label: item.entityType, count: item._count._all }));
  const recentItems = recentAuditLogs.map((item) => ({
    createdAt: item.createdAt,
    role: item.role,
    action: item.action,
    entityType: item.entityType,
    entityId: item.entityId,
    userId: item.userId
  }));

  return buildReportDocument({
    reportKey: "governance-audit",
    title: "Governance Audit Summary",
    subtitle: "Deterministic audit activity summary over the last 30 days plus the most recent governance events.",
    scope: {
      role: "SUPERADMIN",
      label: "Tenant Governance",
      tenantId,
      entityId: null
    },
    filters: { since: since ? since.toISOString() : null },
    highlights: [
      { id: "total-30d-actions", label: "30 Day Audit Events", value: actions.reduce((total, item) => total + item.count, 0) },
      { id: "action-categories", label: "Unique Actions", value: actions.length },
      { id: "entity-categories", label: "Entity Categories", value: entities.length },
      { id: "recent-events", label: "Recent Events Sample", value: recentItems.length }
    ],
    sectionEntries: [
      buildGovernanceAuditSection({ id: "audit-actions", title: "Actions", groupedItems: actions, recentItems }),
      buildGovernanceAuditSection({ id: "audit-entities", title: "Entities", groupedItems: entities, recentItems })
    ]
  });
}

async function buildWorkflowLifecycleReport({ tenantId, auth, bpScope, franchiseScope }) {
  const sharedWhere = { tenantId };
  let franchiseWhere = { ...sharedWhere };
  let centerWhere = { ...sharedWhere };
  let teacherWhere = { ...sharedWhere };
  let settlementWhere = { ...sharedWhere };

  if (auth.role === "BP") {
    const businessPartnerId = bpScope?.businessPartner?.id || null;
    franchiseWhere = { ...franchiseWhere, businessPartnerId };
    centerWhere = { ...centerWhere, businessPartnerId };
    teacherWhere = { ...teacherWhere, businessPartnerId };
    settlementWhere = { ...settlementWhere, businessPartnerId };
  }

  if (auth.role === "FRANCHISE") {
    const franchiseId = franchiseScope?.franchise?.id || null;
    franchiseWhere = { ...franchiseWhere, franchiseId };
    centerWhere = { ...centerWhere, franchiseId };
    teacherWhere = { ...teacherWhere, franchiseId };
    settlementWhere = { ...settlementWhere, franchiseId };
  }

  if (auth.role === "CENTER") {
    const centerScope = await resolveCenterOperationalScope({ tenantId, authUserId: auth.userId, hierarchyNodeId: auth.hierarchyNodeId });
    franchiseWhere = { ...franchiseWhere, centerId: centerScope.center.id };
    centerWhere = { ...centerWhere, centerId: centerScope.center.id };
    teacherWhere = { ...teacherWhere, centerId: centerScope.center.id };
    settlementWhere = { ...settlementWhere, centerId: centerScope.center.id };
  }

  if (auth.role === "TEACHER") {
    teacherWhere = { ...teacherWhere, teacherUserId: auth.userId };
  }

  const [franchiseStatus, centerStatus, teacherStatus, settlementTasks, recentFranchiseHistory, recentCenterHistory, recentTeacherHistory, recentSettlementHistory] = await Promise.all([
    prisma.franchiseOperationalWorkflow.groupBy({ by: ["status"], where: franchiseWhere, _count: { _all: true }, orderBy: { status: "asc" } }),
    prisma.centerOperationalWorkflow.groupBy({ by: ["status"], where: centerWhere, _count: { _all: true }, orderBy: { status: "asc" } }),
    prisma.teacherOperationalWorkflow.groupBy({ by: ["status"], where: teacherWhere, _count: { _all: true }, orderBy: { status: "asc" } }),
    prisma.settlementWorkflowTask.groupBy({ by: ["state"], where: settlementWhere, _count: { _all: true }, orderBy: { state: "asc" } }),
    prisma.franchiseOperationalWorkflowHistory.findMany({ where: franchiseWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { createdAt: true, actionType: true, fromStatus: true, toStatus: true, workflowId: true } }),
    prisma.centerOperationalWorkflowHistory.findMany({ where: centerWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { createdAt: true, actionType: true, fromStatus: true, toStatus: true, workflowId: true } }),
    prisma.teacherOperationalWorkflowHistory.findMany({ where: teacherWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { createdAt: true, actionType: true, fromStatus: true, toStatus: true, workflowId: true } }),
    prisma.settlementWorkflowHistory.findMany({ where: settlementWhere, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, select: { createdAt: true, actionType: true, fromStatus: true, toStatus: true, settlementId: true } })
  ]);

  const statusRows = [
    ...franchiseStatus.map((item) => ({ workflowSurface: "Franchise", status: item.status, count: item._count._all })),
    ...centerStatus.map((item) => ({ workflowSurface: "Center", status: item.status, count: item._count._all })),
    ...teacherStatus.map((item) => ({ workflowSurface: "Teacher", status: item.status, count: item._count._all })),
    ...settlementTasks.map((item) => ({ workflowSurface: "Settlement Task", status: item.state, count: item._count._all }))
  ];

  const recentRows = [
    ...recentFranchiseHistory.map((item) => ({ surface: "Franchise", createdAt: item.createdAt, actionType: item.actionType, fromStatus: item.fromStatus, toStatus: item.toStatus, entityId: item.workflowId })),
    ...recentCenterHistory.map((item) => ({ surface: "Center", createdAt: item.createdAt, actionType: item.actionType, fromStatus: item.fromStatus, toStatus: item.toStatus, entityId: item.workflowId })),
    ...recentTeacherHistory.map((item) => ({ surface: "Teacher", createdAt: item.createdAt, actionType: item.actionType, fromStatus: item.fromStatus, toStatus: item.toStatus, entityId: item.workflowId })),
    ...recentSettlementHistory.map((item) => ({ surface: "Settlement", createdAt: item.createdAt, actionType: item.actionType, fromStatus: item.fromStatus, toStatus: item.toStatus, entityId: item.settlementId }))
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 20);

  const sectionEntries = [
    {
      section: {
        id: "workflow-status",
        title: "Lifecycle Status Overview",
        summaryItems: statusRows.slice(0, 8).map((item) => ({
          label: `${item.workflowSurface} ${item.status}`,
          value: item.count,
          displayValue: formatDisplayValue(item.count)
        })),
        tableIds: ["workflow-status-table", "workflow-recent-table"],
        meta: null
      },
      tables: [
        createTable({ id: "workflow-status-table", title: "Workflow Status Counts", rows: statusRows }),
        createTable({ id: "workflow-recent-table", title: "Recent Workflow Activity", rows: recentRows })
      ]
    }
  ];

  return buildReportDocument({
    reportKey: "workflow-lifecycle",
    title: "Workflow Lifecycle Summary",
    subtitle: "Scoped lifecycle counts and recent state transitions across operational workflow surfaces.",
    scope: {
      role: auth.role,
      label: auth.role === "BP"
        ? bpScope?.businessPartner?.name || "Business Partner"
        : auth.role === "FRANCHISE"
          ? franchiseScope?.franchise?.displayName || franchiseScope?.franchise?.name || "Franchise"
          : auth.role,
      tenantId,
      entityId: null
    },
    filters: {},
    highlights: [
      { id: "total-status-buckets", label: "Status Buckets", value: statusRows.length },
      { id: "tracked-transitions", label: "Recent Transitions", value: recentRows.length },
      { id: "open-workflows", label: "Open Workflow Items", value: statusRows.filter((item) => !String(item.status).includes("RESOLVED") && !String(item.status).includes("DONE") && !String(item.status).includes("CLOSED")).reduce((total, item) => total + item.count, 0) }
    ],
    sectionEntries
  });
}

async function getReportDocument({ reportKey, auth, query = {}, bpScope, franchiseScope, student, parent }) {
  const tenantId = auth?.tenantId;
  if (!tenantId) {
    throw createHttpError(401, "Authentication is required", "AUTH_REQUIRED");
  }

  switch (reportKey) {
    case "bp-operational":
      return buildBusinessPartnerOperationalReport({ tenantId, bpScope, query });
    case "franchise-operational":
      return buildFranchiseOperationalReport({ tenantId, franchiseScope, query });
    case "center-operational":
      return buildCenterOperationalReport({ tenantId, authUserId: auth.userId, hierarchyNodeId: auth.hierarchyNodeId, query });
    case "teacher-productivity":
      return buildTeacherProductivityReport({ tenantId, authUserId: auth.userId, hierarchyNodeId: auth.hierarchyNodeId, query });
    case "student-engagement":
      return buildStudentEngagementReport({ tenantId, authUserId: auth.userId, studentId: student?.id || auth.studentId, query });
    case "parent-visibility":
      return buildParentVisibilityReport({ tenantId, authUserId: parent?.id || auth.userId, query });
    case "governance-audit":
      return buildGovernanceAuditReport({ tenantId });
    case "workflow-lifecycle":
      return buildWorkflowLifecycleReport({ tenantId, auth, bpScope, franchiseScope });
    default:
      throw createHttpError(404, "Report not found", "REPORT_NOT_FOUND");
  }
}

function resolveReportKeyAlias(alias) {
  const normalized = String(alias || "").trim().toLowerCase();
  return REPORT_KEY_BY_ALIAS[normalized] || null;
}

export { createHttpError, getReportDocument, resolveReportKeyAlias };