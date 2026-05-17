import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { resolveCenterOperationalScope } from "./center-operational-analytics.service.js";

const EXPORT_BATCH_SIZE = 500;
const EXPORT_ARTIFACT_ROOT = path.resolve(process.cwd(), "uploads", "report-exports");
const WORKFLOW_LIFECYCLE_SCHEMA_TOKENS = Object.freeze([
  "franchiseoperationalworkflow",
  "franchiseoperationalworkflowhistory",
  "franchiseoperationalworkflowtask",
  "centeroperationalworkflow",
  "centeroperationalworkflowhistory",
  "teacheroperationalworkflow",
  "teacheroperationalworkflowhistory",
  "settlementworkflowtask",
  "settlementworkflowhistory"
]);

function coerceDisplayValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => coerceDisplayValue(item)).join(", ");
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

function sanitizeWorksheetName(name, fallback) {
  const safe = String(name || fallback || "Sheet")
    .replace(/[\\/*?:\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (safe || fallback || "Sheet").slice(0, 31);
}

function slugify(value, fallback = "report") {
  const safe = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return safe || fallback;
}

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function normalizeSortValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (["string", "number", "boolean"].includes(typeof value)) {
    return String(value);
  }

  return JSON.stringify(value);
}

function compareCompositeKeys(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === right[index]) {
      continue;
    }

    return left[index] > right[index] ? 1 : -1;
  }

  return 0;
}

function assertAppendOnlyBatch(rows, sortKeys, previousKey = null) {
  let lastKey = previousKey;

  for (const row of rows) {
    const currentKey = sortKeys.map((key) => normalizeSortValue(row?.[key]));
    if (lastKey && compareCompositeKeys(currentKey, lastKey) < 0) {
      throw new Error(`Append-only export ordering violated for keys ${sortKeys.join(", ")}`);
    }
    lastKey = currentKey;
  }

  return lastKey;
}

async function yieldToEventLoop() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function sleep(ms) {
  const delayMs = Number(ms);
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function createCursorWhere(cursor, primaryKey, secondaryKey = "id") {
  if (!cursor) {
    return {};
  }

  return {
    OR: [
      { [primaryKey]: { gt: cursor[primaryKey] } },
      {
        [primaryKey]: cursor[primaryKey],
        [secondaryKey]: { gt: cursor[secondaryKey] }
      }
    ]
  };
}

function isWorkflowLifecycleSchemaMismatchError(error) {
  const code = String(error?.code || "");
  if (!["P2021", "P2022", "P2010"].includes(code)) {
    return false;
  }

  const message = String(error?.message || "").toLowerCase();
  const modelName = String(error?.meta?.modelName || "").toLowerCase();
  const table = String(error?.meta?.table || "").toLowerCase();
  const combined = `${message} ${modelName} ${table}`;

  return WORKFLOW_LIFECYCLE_SCHEMA_TOKENS.some((token) => combined.includes(token));
}

function safeWorkflowLifecycleRowSource(rowSourceFactory) {
  return async function* safeRowSource() {
    try {
      const rowSource = rowSourceFactory();
      for await (const batch of rowSource) {
        yield batch;
      }
    } catch (error) {
      if (isWorkflowLifecycleSchemaMismatchError(error)) {
        return;
      }
      throw error;
    }
  };
}

async function* paginateRows({ loadPage, sortKeys }) {
  let cursor = null;
  let previousKey = null;

  while (true) {
    const page = await loadPage(cursor);
    if (!page.length) {
      return;
    }

    previousKey = assertAppendOnlyBatch(page, sortKeys, previousKey);
    yield page;

    const lastRow = page[page.length - 1];
    cursor = Object.fromEntries(sortKeys.map((key) => [key, lastRow[key]]));
  }
}

async function* chunkArrayRows(rows = [], size = EXPORT_BATCH_SIZE) {
  for (let index = 0; index < rows.length; index += size) {
    yield rows.slice(index, index + size);
    await yieldToEventLoop();
  }
}

function buildPdfLines(report) {
  const lines = [];
  lines.push(report.title || "Report");
  if (report.subtitle) {
    lines.push(report.subtitle);
  }
  lines.push(`Generated: ${report.generatedAt || new Date().toISOString()}`);
  lines.push(`Scope: ${report.scope?.label || report.scope?.role || "-"}`);
  if (report.metadata?.snapshot?.referenceId) {
    lines.push(`Snapshot: ${report.metadata.snapshot.referenceId}`);
  }
  if (report.metadata?.integrity?.digest) {
    lines.push(`Integrity: ${report.metadata.integrity.digest}`);
  }
  lines.push("");

  if (Array.isArray(report.highlights) && report.highlights.length) {
    lines.push("Highlights");
    for (const item of report.highlights) {
      lines.push(`- ${item.label}: ${item.displayValue || coerceDisplayValue(item.value)}`);
    }
    lines.push("");
  }

  for (const section of report.sections || []) {
    lines.push(section.title || section.id || "Section");
    for (const item of section.summaryItems || []) {
      lines.push(`- ${item.label}: ${item.displayValue || coerceDisplayValue(item.value)}`);
    }
    if (section.summaryItems?.length) {
      lines.push("");
    }
  }

  for (const table of report.tables || []) {
    lines.push(table.title || table.id || "Table");
    const headers = (table.columns || []).map((column) => column.label || column.key);
    if (headers.length) {
      lines.push(headers.join(" | ").slice(0, 110));
    }
    for (const row of (table.rows || []).slice(0, 24)) {
      const rowLine = (table.columns || [])
        .map((column) => `${column.label || column.key}: ${coerceDisplayValue(row?.[column.key])}`)
        .join(" | ");
      lines.push(rowLine.slice(0, 110));
    }
    if ((table.rows || []).length > 24) {
      lines.push(`... ${table.rows.length - 24} additional row(s) omitted in PDF preview`);
    }
    lines.push("");
  }

  return lines;
}

function buildPdfContentStream(pageLines) {
  const content = ["BT", "/F1 11 Tf", "50 760 Td", "14 TL"];
  pageLines.forEach((line, index) => {
    const safeLine = escapePdfText(line || " ");
    if (index === 0) {
      content.push(`(${safeLine}) Tj`);
      return;
    }
    content.push("T*");
    content.push(`(${safeLine}) Tj`);
  });
  content.push("ET");
  return content.join("\n");
}

function buildPdfBuffer(report) {
  const lines = buildPdfLines(report);
  const pages = chunk(lines, 42);

  const objects = [];
  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageObjectIds = [];
  const contentObjectIds = [];

  for (const pageLines of pages) {
    const stream = buildPdfContentStream(pageLines);
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    contentObjectIds.push(contentId);
    pageObjectIds.push(addObject("__PAGE_PLACEHOLDER__"));
  }

  const pagesId = addObject(
    `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`
  );
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  pageObjectIds.forEach((pageId, index) => {
    objects[pageId - 1] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`;
  });

  let output = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "utf8"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(output, "utf8");
}

function buildReportFilename(report, extension) {
  const parts = [slugify(report.scope?.role || report.reportKey || "report"), slugify(report.reportKey || "report")];
  if (report.metadata?.snapshot?.referenceId) {
    parts.push(slugify(report.metadata.snapshot.referenceId.slice(-10), "snapshot"));
  }
  return `${parts.join("_")}.${extension}`;
}

function buildArtifactPath({ tenantId, jobId, report, extension }) {
  const safeTenantId = slugify(tenantId || "tenant");
  const safeJobId = slugify(jobId || "job");
  const safeSnapshot = slugify(report.metadata?.snapshot?.referenceId || Date.now(), "snapshot");
  return path.join(
    EXPORT_ARTIFACT_ROOT,
    safeTenantId,
    `${slugify(report.reportKey || "report")}_${safeSnapshot}_${safeJobId}.${extension}`
  );
}

async function ensureArtifactDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function resolveArtifactMimeType(format) {
  return format === "PDF"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

async function deleteReportArtifactFile(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildWorksheetColumns(table) {
  const columns = (table.columns || []).map((column) => ({
    header: column.label || column.key,
    key: column.key,
    width: Math.max(14, Math.min(36, String(column.label || column.key || "Column").length + 4))
  }));

  return columns.length ? columns : [{ header: "Value", key: "value", width: 50 }];
}

async function writeSummarySheet(workbook, report) {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Field", key: "field", width: 28 },
    { header: "Value", key: "value", width: 80 }
  ];

  const summaryRows = [
    { field: "Title", value: report.title || "Report" },
    { field: "Subtitle", value: report.subtitle || "-" },
    { field: "Generated At", value: report.generatedAt || new Date().toISOString() },
    { field: "Scope", value: report.scope?.label || report.scope?.role || "-" },
    { field: "Role", value: report.scope?.role || "-" },
    { field: "Report Key", value: report.reportKey || "-" },
    { field: "Snapshot Reference", value: report.metadata?.snapshot?.referenceId || "-" },
    { field: "Snapshot Captured At", value: report.metadata?.snapshot?.capturedAt || report.generatedAt || "-" },
    { field: "Integrity Digest", value: report.metadata?.integrity?.digest || "-" },
    { field: "Filters", value: coerceDisplayValue(report.filters || {}) },
    { field: "", value: "" },
    { field: "Highlights", value: "" },
    ...(report.highlights || []).map((item) => ({
      field: item.label || item.id || "Metric",
      value: item.displayValue || coerceDisplayValue(item.value)
    }))
  ];

  for (const row of summaryRows) {
    sheet.addRow(row).commit();
  }

  if (Array.isArray(report.sections) && report.sections.length) {
    sheet.addRow({ field: "", value: "" }).commit();
    sheet.addRow({ field: "Sections", value: "" }).commit();
    for (const section of report.sections) {
      sheet.addRow({
        field: section.title || section.id,
        value: (section.summaryItems || []).map((item) => `${item.label}: ${item.displayValue || coerceDisplayValue(item.value)}`).join(" | ") || "-"
      }).commit();
    }
  }

  sheet.commit();
}

async function writeTableSheet(workbook, table, { certificationConfig = null } = {}) {
  const worksheet = workbook.addWorksheet(sanitizeWorksheetName(table.title, table.id));
  const columns = buildWorksheetColumns(table);
  worksheet.columns = columns;

  let rowCount = 0;
  let batchCount = 0;
  let maxBatchRows = 0;
  for await (const batch of table.rowSource()) {
    batchCount += 1;
    maxBatchRows = Math.max(maxBatchRows, Array.isArray(batch) ? batch.length : 0);
    for (const row of batch) {
      if (!table.columns?.length) {
        worksheet.addRow({ value: coerceDisplayValue(row) }).commit();
      } else {
        const mappedRow = {};
        for (const column of columns) {
          mappedRow[column.key] = coerceDisplayValue(row?.[column.key]);
        }
        worksheet.addRow(mappedRow).commit();
      }
      rowCount += 1;
      if (rowCount % EXPORT_BATCH_SIZE === 0) {
        await yieldToEventLoop();
      }
    }

    if (certificationConfig?.perBatchDelayMs) {
      await sleep(certificationConfig.perBatchDelayMs);
    }
  }

  worksheet.commit();
  return {
    rowCount,
    batchCount,
    maxBatchRows
  };
}

function buildInMemorySheetDescriptors(report) {
  return (report.tables || []).map((table) => ({
    ...table,
    rowSource: () => chunkArrayRows(table.rows || [])
  }));
}

const EXPORT_LIFECYCLE_AUDIT_ENTITY_TYPE = "REPORT_EXPORT_JOB";
const GOVERNANCE_SELF_AUDIT_ACTIONS = Object.freeze([
  "SUPERADMIN_VIEW_GOVERNANCE_AUDIT_REPORT",
  "VIEW_PRINTABLE_REPORT",
  "EXPORT_REPORT_PDF",
  "EXPORT_REPORT_EXCEL"
]);

function buildGovernanceAuditWhere({ tenantId, since = null, cursor = null }) {
  return {
    tenantId,
    ...(since ? { createdAt: { gte: since } } : {}),
    ...createCursorWhere(cursor, "createdAt", "id"),
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

async function* paginateGovernanceAuditChain({ tenantId, since }) {
  const normalizedSince = since ? new Date(since) : null;
  yield* paginateRows({
    sortKeys: ["createdAt", "id"],
    loadPage: (cursor) => prisma.auditLog.findMany({
      where: buildGovernanceAuditWhere({ tenantId, since: normalizedSince, cursor }),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EXPORT_BATCH_SIZE,
      select: {
        id: true,
        createdAt: true,
        role: true,
        action: true,
        entityType: true,
        entityId: true,
        userId: true
      }
    })
  });
}

async function resolveWorkflowExportScopes({ tenantId, reportContext }) {
  const auth = reportContext.auth || {};
  let franchiseWhere = { tenantId };
  let centerWhere = { tenantId };
  let teacherWhere = { tenantId };
  let settlementWhere = { tenantId };

  if (auth.role === "BP") {
    const businessPartnerId = reportContext.bpScope?.businessPartner?.id || null;
    franchiseWhere = { ...franchiseWhere, businessPartnerId };
    centerWhere = { ...centerWhere, businessPartnerId };
    teacherWhere = { ...teacherWhere, businessPartnerId };
    settlementWhere = { ...settlementWhere, businessPartnerId };
  }

  if (auth.role === "FRANCHISE") {
    const franchiseId = reportContext.franchiseScope?.franchise?.id || null;
    franchiseWhere = { ...franchiseWhere, franchiseId };
    centerWhere = { ...centerWhere, franchiseId };
    teacherWhere = { ...teacherWhere, franchiseId };
    settlementWhere = { ...settlementWhere, franchiseId };
  }

  if (auth.role === "CENTER") {
    const centerScope = await resolveCenterOperationalScope({
      tenantId,
      authUserId: auth.userId,
      hierarchyNodeId: auth.hierarchyNodeId
    });
    franchiseWhere = { ...franchiseWhere, centerId: centerScope.center.id };
    centerWhere = { ...centerWhere, centerId: centerScope.center.id };
    teacherWhere = { ...teacherWhere, centerId: centerScope.center.id };
    settlementWhere = { ...settlementWhere, centerId: centerScope.center.id };
  }

  if (auth.role === "TEACHER") {
    teacherWhere = { ...teacherWhere, teacherUserId: auth.userId };
  }

  return { franchiseWhere, centerWhere, teacherWhere, settlementWhere };
}

async function* paginateWorkflowHistory(model, where, { includeSettlementId = false, includeWorkflowId = true } = {}) {
  yield* paginateRows({
    sortKeys: ["createdAt", "id"],
    loadPage: (cursor) => model.findMany({
      where: {
        ...where,
        ...createCursorWhere(cursor, "createdAt", "id")
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EXPORT_BATCH_SIZE,
      select: {
        id: true,
        createdAt: true,
        actionType: true,
        fromStatus: true,
        toStatus: true,
        ...(includeWorkflowId ? { workflowId: true } : {}),
        ...(includeSettlementId ? { settlementId: true } : {}),
        actorRole: true,
        actorUserId: true,
        expectedVersion: true,
        resultingVersion: true
      }
    })
  });
}

async function* paginateWorkflowTasks(where) {
  yield* paginateRows({
    sortKeys: ["createdAt", "id"],
    loadPage: (cursor) => prisma.franchiseOperationalWorkflowTask.findMany({
      where: {
        ...where,
        ...createCursorWhere(cursor, "createdAt", "id")
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EXPORT_BATCH_SIZE,
      select: {
        id: true,
        createdAt: true,
        taskType: true,
        state: true,
        targetRole: true,
        targetUserId: true,
        workflowId: true,
        escalationCount: true,
        dueAt: true,
        completedAt: true
      }
    })
  });
}

async function* paginateStudentSnapshotHistory({ tenantId, studentId }) {
  yield* paginateRows({
    sortKeys: ["snapshotDate", "id"],
    loadPage: (cursor) => prisma.studentEngagementSnapshot.findMany({
      where: {
        tenantId,
        studentId,
        ...createCursorWhere(cursor, "snapshotDate", "id")
      },
      orderBy: [{ snapshotDate: "asc" }, { id: "asc" }],
      take: EXPORT_BATCH_SIZE,
      select: {
        id: true,
        snapshotDate: true,
        engagementScore: true,
        consistencyScore: true,
        streakScore: true,
        attendanceRate: true,
        currentPracticeStreak: true,
        currentAttendanceStreak: true,
        completedWorksheetCount: true,
        pendingWorksheetCount: true,
        weakTopicCount: true,
        achievementsCount: true
      }
    })
  });
}

async function* paginateStudentSubmissionHistory({ tenantId, studentId }) {
  yield* paginateRows({
    sortKeys: ["finalSubmittedAt", "id"],
    loadPage: (cursor) => prisma.worksheetSubmission.findMany({
      where: {
        tenantId,
        studentId,
        finalSubmittedAt: { not: null },
        ...createCursorWhere(cursor, "finalSubmittedAt", "id")
      },
      orderBy: [{ finalSubmittedAt: "asc" }, { id: "asc" }],
      take: EXPORT_BATCH_SIZE,
      select: {
        id: true,
        worksheetId: true,
        score: true,
        status: true,
        submittedAt: true,
        finalSubmittedAt: true,
        worksheet: {
          select: {
            title: true
          }
        }
      }
    })
  });
}

async function getDynamicSheetDescriptors({ report, reportContext }) {
  const tenantId = report.scope?.tenantId || reportContext.auth?.tenantId;
  if (!tenantId) {
    return [];
  }

  if (report.reportKey === "governance-audit") {
    return [
      {
        id: "audit-chain",
        title: "Audit Append Only Chain",
        columns: [
          { key: "id", label: "Audit ID" },
          { key: "createdAt", label: "Created At" },
          { key: "role", label: "Role" },
          { key: "action", label: "Action" },
          { key: "entityType", label: "Entity Type" },
          { key: "entityId", label: "Entity ID" },
          { key: "userId", label: "User ID" }
        ],
        rowSource: () => paginateGovernanceAuditChain({ tenantId, since: report.filters?.since })
      }
    ];
  }

  if (report.reportKey === "workflow-lifecycle") {
    const scopes = await resolveWorkflowExportScopes({ tenantId, reportContext });
    return [
      {
        id: "franchise-history",
        title: "Franchise Workflow History",
        columns: [
          { key: "id", label: "History ID" },
          { key: "createdAt", label: "Created At" },
          { key: "actionType", label: "Action" },
          { key: "fromStatus", label: "From Status" },
          { key: "toStatus", label: "To Status" },
          { key: "workflowId", label: "Workflow ID" },
          { key: "actorRole", label: "Actor Role" },
          { key: "actorUserId", label: "Actor User ID" },
          { key: "expectedVersion", label: "Expected Version" },
          { key: "resultingVersion", label: "Resulting Version" }
        ],
        rowSource: safeWorkflowLifecycleRowSource(() => paginateWorkflowHistory(prisma.franchiseOperationalWorkflowHistory, scopes.franchiseWhere))
      },
      {
        id: "center-history",
        title: "Center Workflow History",
        columns: [
          { key: "id", label: "History ID" },
          { key: "createdAt", label: "Created At" },
          { key: "actionType", label: "Action" },
          { key: "fromStatus", label: "From Status" },
          { key: "toStatus", label: "To Status" },
          { key: "workflowId", label: "Workflow ID" },
          { key: "actorRole", label: "Actor Role" },
          { key: "actorUserId", label: "Actor User ID" },
          { key: "expectedVersion", label: "Expected Version" },
          { key: "resultingVersion", label: "Resulting Version" }
        ],
        rowSource: safeWorkflowLifecycleRowSource(() => paginateWorkflowHistory(prisma.centerOperationalWorkflowHistory, scopes.centerWhere))
      },
      {
        id: "teacher-history",
        title: "Teacher Workflow History",
        columns: [
          { key: "id", label: "History ID" },
          { key: "createdAt", label: "Created At" },
          { key: "actionType", label: "Action" },
          { key: "fromStatus", label: "From Status" },
          { key: "toStatus", label: "To Status" },
          { key: "workflowId", label: "Workflow ID" },
          { key: "actorRole", label: "Actor Role" },
          { key: "actorUserId", label: "Actor User ID" },
          { key: "expectedVersion", label: "Expected Version" },
          { key: "resultingVersion", label: "Resulting Version" }
        ],
        rowSource: safeWorkflowLifecycleRowSource(() => paginateWorkflowHistory(prisma.teacherOperationalWorkflowHistory, scopes.teacherWhere))
      },
      {
        id: "settlement-history",
        title: "Settlement Workflow History",
        columns: [
          { key: "id", label: "History ID" },
          { key: "createdAt", label: "Created At" },
          { key: "actionType", label: "Action" },
          { key: "fromStatus", label: "From Status" },
          { key: "toStatus", label: "To Status" },
          { key: "settlementId", label: "Settlement ID" },
          { key: "actorRole", label: "Actor Role" },
          { key: "actorUserId", label: "Actor User ID" },
          { key: "expectedVersion", label: "Expected Version" },
          { key: "resultingVersion", label: "Resulting Version" }
        ],
        rowSource: safeWorkflowLifecycleRowSource(() => paginateWorkflowHistory(prisma.settlementWorkflowHistory, scopes.settlementWhere, {
          includeSettlementId: true,
          includeWorkflowId: false
        }))
      },
      {
        id: "franchise-tasks",
        title: "Franchise Workflow Tasks",
        columns: [
          { key: "id", label: "Task ID" },
          { key: "createdAt", label: "Created At" },
          { key: "taskType", label: "Task Type" },
          { key: "state", label: "State" },
          { key: "targetRole", label: "Target Role" },
          { key: "targetUserId", label: "Target User ID" },
          { key: "workflowId", label: "Workflow ID" },
          { key: "escalationCount", label: "Escalation Count" },
          { key: "dueAt", label: "Due At" },
          { key: "completedAt", label: "Completed At" }
        ],
        rowSource: safeWorkflowLifecycleRowSource(() => paginateWorkflowTasks(scopes.franchiseWhere))
      }
    ];
  }

  if (report.reportKey === "student-engagement") {
    const studentId = report.scope?.entityId || reportContext.student?.id;
    if (!studentId) {
      return [];
    }

    return [
      {
        id: "engagement-snapshots",
        title: "Student Engagement Snapshot History",
        columns: [
          { key: "id", label: "Snapshot ID" },
          { key: "snapshotDate", label: "Snapshot Date" },
          { key: "engagementScore", label: "Engagement Score" },
          { key: "consistencyScore", label: "Consistency Score" },
          { key: "streakScore", label: "Streak Score" },
          { key: "attendanceRate", label: "Attendance Rate" },
          { key: "currentPracticeStreak", label: "Practice Streak" },
          { key: "currentAttendanceStreak", label: "Attendance Streak" },
          { key: "completedWorksheetCount", label: "Completed Worksheets" },
          { key: "pendingWorksheetCount", label: "Pending Worksheets" },
          { key: "weakTopicCount", label: "Weak Topics" },
          { key: "achievementsCount", label: "Achievements" }
        ],
        rowSource: () => paginateStudentSnapshotHistory({ tenantId, studentId })
      },
      {
        id: "worksheet-submissions",
        title: "Student Worksheet Submission History",
        columns: [
          { key: "id", label: "Submission ID" },
          { key: "worksheetId", label: "Worksheet ID" },
          { key: "worksheetTitle", label: "Worksheet Title" },
          { key: "status", label: "Status" },
          { key: "score", label: "Score" },
          { key: "submittedAt", label: "Submitted At" },
          { key: "finalSubmittedAt", label: "Final Submitted At" }
        ],
        rowSource: async function* rowSource() {
          for await (const batch of paginateStudentSubmissionHistory({ tenantId, studentId })) {
            yield batch.map((row) => ({
              ...row,
              worksheetTitle: row.worksheet?.title || null
            }));
          }
        }
      }
    ];
  }

  return [];
}

async function writeExcelReportToFile({ report, reportContext, filePath, certificationConfig = null }) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: false,
    useSharedStrings: false
  });
  const generatedAt = report.generatedAt ? new Date(report.generatedAt) : new Date();
  workbook.creator = "GitHub Copilot";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.lastPrinted = generatedAt;

  await writeSummarySheet(workbook, report);

  const tableSheets = [
    ...buildInMemorySheetDescriptors(report),
    ...(await getDynamicSheetDescriptors({ report, reportContext }))
  ];

  let totalRows = 0;
  let totalBatchCount = 0;
  let peakBatchRows = 0;
  for (const table of tableSheets) {
    const tableStats = await writeTableSheet(workbook, table, { certificationConfig });
    totalRows += tableStats.rowCount;
    totalBatchCount += tableStats.batchCount;
    peakBatchRows = Math.max(peakBatchRows, tableStats.maxBatchRows);
  }

  await workbook.commit();
  return {
    rowCount: totalRows,
    tableCount: tableSheets.length,
    batchCount: totalBatchCount,
    peakBatchRows,
    streamMode: "xlsx_stream_writer"
  };
}

async function generateReportExportArtifact({ job, format, report, reportContext }) {
  const certificationConfig = job?.workerMetadata?.certification || null;
  const extension = format === "PDF" ? "pdf" : "xlsx";
  const filename = buildReportFilename(report, extension);
  const filePath = buildArtifactPath({
    tenantId: job?.tenantId || report.scope?.tenantId,
    jobId: job?.id,
    report,
    extension
  });

  await ensureArtifactDirectory(filePath);

  let rowCount = report.metadata?.snapshot?.counts?.rowCount || 0;
  let tableCount = report.metadata?.snapshot?.counts?.tableCount || 0;
  let artifactTelemetry = {
    streamMode: format === "PDF" ? "buffered_pdf_preview" : "xlsx_stream_writer",
    batchCount: 0,
    peakBatchRows: 0,
    certification: certificationConfig ? {
      scenarioKey: certificationConfig.scenarioKey || null,
      runId: certificationConfig.runId || null,
      perBatchDelayMs: certificationConfig.perBatchDelayMs || 0,
      failAfterArtifactWriteOnce: Boolean(certificationConfig.failAfterArtifactWriteOnce)
    } : null
  };

  if (format === "PDF") {
    if (certificationConfig?.preWriteDelayMs) {
      await sleep(certificationConfig.preWriteDelayMs);
    }
    const buffer = buildPdfBuffer(report);
    await fs.writeFile(filePath, buffer);
    artifactTelemetry = {
      ...artifactTelemetry,
      byteLengthBeforeStat: buffer.length,
      previewLineCount: buildPdfLines(report).length
    };
  } else {
    const streamStats = await writeExcelReportToFile({ report, reportContext, filePath, certificationConfig });
    rowCount = streamStats.rowCount;
    tableCount = streamStats.tableCount;
    artifactTelemetry = {
      ...artifactTelemetry,
      batchCount: streamStats.batchCount,
      peakBatchRows: streamStats.peakBatchRows,
      streamMode: streamStats.streamMode
    };
  }

  const stat = await fs.stat(filePath);

  if (certificationConfig?.failAfterArtifactWriteOnce && !job?.workerMetadata?.certification?.failureInjectedAt) {
    await prisma.reportExportJob.update({
      where: { id: job.id },
      data: {
        workerMetadata: {
          ...(job.workerMetadata || {}),
          certification: {
            ...(job.workerMetadata?.certification || {}),
            failureInjectedAt: new Date().toISOString()
          }
        }
      }
    });
    const injectedError = new Error("Certification failure injected after artifact write");
    injectedError.errorCode = "CERTIFICATION_FAILURE_INJECTED";
    throw injectedError;
  }

  return {
    tenantId: job?.tenantId || report.scope?.tenantId || null,
    reportKey: report.reportKey,
    exportFormat: format,
    snapshotReferenceId: report.metadata?.snapshot?.referenceId || job?.snapshotReferenceId || null,
    filePath,
    fileName: filename,
    rowCount,
    tableCount,
    byteLength: stat.size,
    mimeType: resolveArtifactMimeType(format),
    fileHash: report.metadata?.integrity?.digest || null,
    metadata: {
      snapshotReferenceId: report.metadata?.snapshot?.referenceId || null,
      integrityDigest: report.metadata?.integrity?.digest || null,
      artifactTelemetry
    }
  };
}

function createReportArtifactReadStream(filePath) {
  return createReadStream(filePath);
}

export {
  buildPdfBuffer,
  buildReportFilename,
  createReportArtifactReadStream,
  deleteReportArtifactFile,
  generateReportExportArtifact
};