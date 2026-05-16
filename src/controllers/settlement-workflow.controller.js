import { asyncHandler } from "../utils/async-handler.js";
import { MAX_LIMIT } from "../utils/pagination.js";
import {
  addSettlementSupportingRecord,
  approveSettlement,
  escalateSettlement,
  getSettlementWorkflowDetail,
  getSettlementWorkflowQueueSummary,
  listSettlementSupportingRecordsScoped,
  listSettlementWorkflowEscalations,
  listSettlementWorkflowHistory,
  listSettlementWorkflowTasks,
  listSettlementWorkflows,
  markSettlementPaid,
  markSettlementReviewed,
  rejectSettlement,
  reopenSettlement,
  resolveSettlementEscalation,
  submitSettlementForReview
} from "../services/settlement-workflow.service.js";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function parseInteger(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return parsed;
}

function parsePagination(query = {}) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInteger(query.limit, 20)));
  const offset = Math.max(0, parseInteger(query.offset, 0));
  return { limit, offset };
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseCsvList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSortBy(value) {
  const allowed = new Set([
    "createdAt",
    "generatedAt",
    "updatedAt",
    "lastWorkflowActionAt",
    "payoutDueAt",
    "periodStart",
    "periodEnd",
    "grossAmount",
    "partnerEarnings",
    "status",
    "currentActionRole"
  ]);

  return allowed.has(value) ? value : "updatedAt";
}

function parseSortOrder(value) {
  return String(value || "desc").toLowerCase() === "asc" ? "asc" : "desc";
}

function getBpScope(req) {
  if (!req.bpScope?.tenantId || req.bpScope.tenantId !== req.auth?.tenantId || !req.bpScope.businessPartner?.id) {
    throw createHttpError(403, "Business partner scope not resolved", "BP_SCOPE_REQUIRED");
  }

  return req.bpScope;
}

function assertScopeId(ids, value, notFoundMessage, errorCode) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  if (!(Array.isArray(ids) ? ids : []).includes(normalized)) {
    throw createHttpError(404, notFoundMessage, errorCode);
  }

  return normalized;
}

function getExpectedVersion(body = {}) {
  if (body.expectedVersion !== undefined) {
    return body.expectedVersion;
  }
  if (body.workflowVersion !== undefined) {
    return body.workflowVersion;
  }
  if (body.workflow?.workflowVersion !== undefined) {
    return body.workflow.workflowVersion;
  }
  return undefined;
}

function buildScopedFilters(req) {
  const bpScope = getBpScope(req);

  return {
    statuses: parseCsvList(req.query.status),
    currentActionRoles: parseCsvList(req.query.currentActionRole),
    franchiseId: assertScopeId(bpScope.franchiseIds, req.query.franchiseId, "Franchise not found", "FRANCHISE_NOT_FOUND"),
    centerId: assertScopeId(bpScope.centerIds, req.query.centerId, "Center not found", "CENTER_NOT_FOUND"),
    overdueOnly: parseBoolean(req.query.overdueOnly, false),
    escalationOnly: parseBoolean(req.query.escalationOnly, false),
    pendingActionOnly: parseBoolean(req.query.pendingActionOnly, false),
    query: normalizeOptionalText(req.query.q)
  };
}

function buildActionPayload(req, extra = {}) {
  const bpScope = getBpScope(req);

  return {
    tenantId: req.auth.tenantId,
    settlementId: req.params.id,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role,
    expectedVersion: getExpectedVersion(req.body),
    notes: req.body?.notes,
    reason: req.body?.reason,
    payoutReference: req.body?.payoutReference,
    paidAt: req.body?.paidAt,
    payoutDueAt: req.body?.payoutDueAt,
    taskDueAt: req.body?.taskDueAt,
    escalationId: req.body?.escalationId,
    escalationType: req.body?.escalationType,
    severity: req.body?.severity,
    metadata: req.body?.metadata,
    franchiseId: assertScopeId(bpScope.franchiseIds, req.body?.franchiseId, "Franchise not found", "FRANCHISE_NOT_FOUND"),
    centerId: assertScopeId(bpScope.centerIds, req.body?.centerId, "Center not found", "CENTER_NOT_FOUND"),
    ...extra
  };
}

function formatActionResponse(result) {
  return {
    settlement: result.settlement,
    history: result.history,
    nextTask: result.nextTask,
    escalation: result.escalation,
    workflowVersion: result.settlement?.workflowVersion || null,
    allowedActions: Array.isArray(result.settlement?.allowedActions) ? result.settlement.allowedActions : []
  };
}

function createWorkflowActionHandler(serviceMethod, successMessage, extraPayloadBuilder) {
  return asyncHandler(async (req, res) => {
    const payload = buildActionPayload(req, typeof extraPayloadBuilder === "function" ? extraPayloadBuilder(req) : {});
    const result = await serviceMethod(payload);
    return res.apiSuccess(successMessage, formatActionResponse(result));
  });
}

const listPartnerSettlementWorkflows = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listSettlementWorkflows({
    tenantId: req.auth.tenantId,
    bpScope: getBpScope(req),
    actorRole: req.auth.role,
    filters: buildScopedFilters(req),
    limit,
    offset,
    sortBy: parseSortBy(req.query.sortBy),
    sortOrder: parseSortOrder(req.query.sortOrder)
  });

  return res.apiSuccess("Settlement workflows fetched", data);
});

const getPartnerSettlementWorkflowQueueSummary = asyncHandler(async (req, res) => {
  const data = await getSettlementWorkflowQueueSummary({
    tenantId: req.auth.tenantId,
    bpScope: getBpScope(req),
    actorRole: req.auth.role
  });

  return res.apiSuccess("Settlement workflow queue summary fetched", data);
});

const getPartnerSettlementWorkflowDetail = asyncHandler(async (req, res) => {
  const data = await getSettlementWorkflowDetail({
    tenantId: req.auth.tenantId,
    bpScope: getBpScope(req),
    settlementId: req.params.id,
    actorRole: req.auth.role
  });

  return res.apiSuccess("Settlement workflow detail fetched", data);
});

const listPartnerSettlementWorkflowHistory = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listSettlementWorkflowHistory({
    tenantId: req.auth.tenantId,
    bpScope: getBpScope(req),
    settlementId: req.params.id,
    limit,
    offset
  });

  return res.apiSuccess("Settlement workflow history fetched", data);
});

const listPartnerSettlementWorkflowTasks = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listSettlementWorkflowTasks({
    tenantId: req.auth.tenantId,
    bpScope: getBpScope(req),
    settlementId: req.params.id,
    limit,
    offset,
    activeOnly: parseBoolean(req.query.activeOnly, false)
  });

  return res.apiSuccess("Settlement workflow tasks fetched", data);
});

const listPartnerSettlementWorkflowEscalations = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listSettlementWorkflowEscalations({
    tenantId: req.auth.tenantId,
    bpScope: getBpScope(req),
    settlementId: req.params.id,
    limit,
    offset
  });

  return res.apiSuccess("Settlement workflow escalations fetched", data);
});

const listPartnerSettlementSupportingRecords = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listSettlementSupportingRecordsScoped({
    tenantId: req.auth.tenantId,
    bpScope: getBpScope(req),
    settlementId: req.params.id,
    limit,
    offset
  });

  return res.apiSuccess("Settlement supporting records fetched", data);
});

const createPartnerSettlementSupportingRecord = asyncHandler(async (req, res) => {
  const bpScope = getBpScope(req);
  const record = await addSettlementSupportingRecord({
    tenantId: req.auth.tenantId,
    settlementId: req.params.id,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role,
    recordType: req.body?.recordType,
    fileUrl: req.body?.fileUrl,
    fileName: req.body?.fileName,
    mimeType: req.body?.mimeType,
    notes: req.body?.notes,
    metadata: req.body?.metadata,
    franchiseId: assertScopeId(bpScope.franchiseIds, req.body?.franchiseId, "Franchise not found", "FRANCHISE_NOT_FOUND"),
    centerId: assertScopeId(bpScope.centerIds, req.body?.centerId, "Center not found", "CENTER_NOT_FOUND")
  });

  return res.apiSuccess("Settlement supporting record created", record, 201);
});

const submitPartnerSettlementWorkflow = createWorkflowActionHandler(
  submitSettlementForReview,
  "Settlement submitted for review"
);

const reviewPartnerSettlementWorkflow = createWorkflowActionHandler(
  markSettlementReviewed,
  "Settlement marked as reviewed"
);

const approvePartnerSettlementWorkflow = createWorkflowActionHandler(
  approveSettlement,
  "Settlement approved"
);

const rejectPartnerSettlementWorkflow = createWorkflowActionHandler(
  rejectSettlement,
  "Settlement rejected"
);

const reopenPartnerSettlementWorkflow = createWorkflowActionHandler(
  reopenSettlement,
  "Settlement reopened"
);

const escalatePartnerSettlementWorkflow = createWorkflowActionHandler(
  escalateSettlement,
  "Settlement escalated"
);

const resolvePartnerSettlementEscalation = createWorkflowActionHandler(
  resolveSettlementEscalation,
  "Settlement escalation resolved",
  (req) => ({
    escalationId: req.body?.escalationId
  })
);

const markPartnerSettlementPaid = createWorkflowActionHandler(
  markSettlementPaid,
  "Settlement marked as paid"
);

export {
  approvePartnerSettlementWorkflow,
  createPartnerSettlementSupportingRecord,
  escalatePartnerSettlementWorkflow,
  getPartnerSettlementWorkflowDetail,
  getPartnerSettlementWorkflowQueueSummary,
  listPartnerSettlementSupportingRecords,
  listPartnerSettlementWorkflowEscalations,
  listPartnerSettlementWorkflowHistory,
  listPartnerSettlementWorkflowTasks,
  listPartnerSettlementWorkflows,
  markPartnerSettlementPaid,
  rejectPartnerSettlementWorkflow,
  reopenPartnerSettlementWorkflow,
  resolvePartnerSettlementEscalation,
  reviewPartnerSettlementWorkflow,
  submitPartnerSettlementWorkflow
};