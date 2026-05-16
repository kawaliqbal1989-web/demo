import { asyncHandler } from "../utils/async-handler.js";
import { MAX_LIMIT } from "../utils/pagination.js";
import {
  acknowledgeFranchiseEscalation,
  acknowledgeFranchiseWorkflow,
  escalateFranchiseCenterRisk,
  forwardFranchiseEscalation,
  getFranchiseWorkflowDetail,
  listFranchiseWorkflowHistory,
  listFranchiseWorkflows,
  reopenFranchiseWorkflow,
  requestFranchiseCenterAction,
  resolveFranchiseWorkflow,
  reviewFranchiseWorkflow
} from "../services/franchise-workflow.service.js";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function getFranchiseScope(req) {
  if (!req.franchiseScope?.franchise?.id || req.franchiseScope.franchise.authUserId !== req.auth?.userId) {
    throw createHttpError(403, "Franchise scope not resolved", "FRANCHISE_SCOPE_REQUIRED");
  }

  return req.franchiseScope;
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
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parsePagination(query = {}) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInteger(query.limit, 20)));
  const offset = Math.max(0, parseInteger(query.offset, 0));
  return { limit, offset };
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
    "updatedAt",
    "lastTriggeredAt",
    "lastWorkflowActionAt",
    "resolvedAt",
    "severity",
    "status"
  ]);

  return allowed.has(value) ? value : "updatedAt";
}

function parseSortOrder(value) {
  return String(value || "desc").toLowerCase() === "asc" ? "asc" : "desc";
}

function buildFilters(req) {
  return {
    statuses: parseCsvList(req.query.status),
    severities: parseCsvList(req.query.severity),
    notificationTypes: parseCsvList(req.query.type),
    centerId: normalizeOptionalText(req.query.centerId),
    query: normalizeOptionalText(req.query.q)
  };
}

function getExpectedVersion(body = {}) {
  if (body.expectedVersion !== undefined) {
    return body.expectedVersion;
  }

  if (body.workflowVersion !== undefined) {
    return body.workflowVersion;
  }

  return undefined;
}

function buildActionPayload(req) {
  return {
    tenantId: req.auth.tenantId,
    franchiseScope: getFranchiseScope(req),
    workflowId: req.params.id,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role,
    expectedVersion: getExpectedVersion(req.body),
    notes: req.body?.notes,
    reason: req.body?.reason,
    taskDueAt: req.body?.taskDueAt,
    metadata: req.body?.metadata
  };
}

function formatActionResponse(result) {
  return {
    workflow: result.workflow,
    notification: result.notification,
    center: result.center,
    tasks: result.tasks,
    escalations: result.escalations,
    history: result.history,
    lastHistory: result.lastHistory,
    nextTask: result.nextTask,
    escalation: result.escalation,
    workflowVersion: result.workflow?.workflowVersion || null,
    allowedActions: Array.isArray(result.workflow?.allowedActions) ? result.workflow.allowedActions : []
  };
}

function createActionHandler(serviceMethod, successMessage) {
  return asyncHandler(async (req, res) => {
    const payload = buildActionPayload(req);
    const result = await serviceMethod(payload);
    return res.apiSuccess(successMessage, formatActionResponse(result));
  });
}

const listFranchiseWorkflowQueue = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listFranchiseWorkflows({
    tenantId: req.auth.tenantId,
    franchiseScope: getFranchiseScope(req),
    filters: buildFilters(req),
    limit,
    offset,
    sortBy: parseSortBy(req.query.sortBy),
    sortOrder: parseSortOrder(req.query.sortOrder)
  });

  return res.apiSuccess("Franchise workflows fetched", data);
});

const listFranchiseWorkflowReviewQueue = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listFranchiseWorkflows({
    tenantId: req.auth.tenantId,
    franchiseScope: getFranchiseScope(req),
    filters: buildFilters(req),
    limit,
    offset,
    sortBy: parseSortBy(req.query.sortBy),
    sortOrder: parseSortOrder(req.query.sortOrder),
    queueType: "REVIEW"
  });

  return res.apiSuccess("Franchise review workflows fetched", data);
});

const listFranchiseWorkflowAnomalyQueue = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listFranchiseWorkflows({
    tenantId: req.auth.tenantId,
    franchiseScope: getFranchiseScope(req),
    filters: buildFilters(req),
    limit,
    offset,
    sortBy: parseSortBy(req.query.sortBy),
    sortOrder: parseSortOrder(req.query.sortOrder),
    queueType: "ANOMALY"
  });

  return res.apiSuccess("Franchise anomaly workflows fetched", data);
});

const listFranchiseWorkflowEscalationQueue = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listFranchiseWorkflows({
    tenantId: req.auth.tenantId,
    franchiseScope: getFranchiseScope(req),
    filters: buildFilters(req),
    limit,
    offset,
    sortBy: parseSortBy(req.query.sortBy),
    sortOrder: parseSortOrder(req.query.sortOrder),
    queueType: "ESCALATION"
  });

  return res.apiSuccess("Franchise escalation workflows fetched", data);
});

const getFranchiseWorkflowById = asyncHandler(async (req, res) => {
  const data = await getFranchiseWorkflowDetail({
    tenantId: req.auth.tenantId,
    franchiseScope: getFranchiseScope(req),
    workflowId: req.params.id
  });

  return res.apiSuccess("Franchise workflow detail fetched", data);
});

const getFranchiseWorkflowHistoryById = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listFranchiseWorkflowHistory({
    tenantId: req.auth.tenantId,
    franchiseScope: getFranchiseScope(req),
    workflowId: req.params.id,
    limit,
    offset
  });

  return res.apiSuccess("Franchise workflow history fetched", data);
});

const reviewFranchiseWorkflowAction = createActionHandler(reviewFranchiseWorkflow, "Franchise workflow reviewed");
const acknowledgeFranchiseWorkflowAction = createActionHandler(
  acknowledgeFranchiseWorkflow,
  "Franchise anomaly acknowledged"
);
const requestFranchiseCenterActionHandler = createActionHandler(
  requestFranchiseCenterAction,
  "Center action requested"
);
const escalateFranchiseCenterRiskAction = createActionHandler(
  escalateFranchiseCenterRisk,
  "Center risk escalated"
);
const acknowledgeFranchiseEscalationAction = createActionHandler(
  acknowledgeFranchiseEscalation,
  "Escalation acknowledged"
);
const forwardFranchiseEscalationAction = createActionHandler(
  forwardFranchiseEscalation,
  "Escalation forwarded"
);
const resolveFranchiseWorkflowAction = createActionHandler(resolveFranchiseWorkflow, "Operational issue resolved");
const reopenFranchiseWorkflowAction = createActionHandler(reopenFranchiseWorkflow, "Operational issue reopened");

export {
  acknowledgeFranchiseEscalationAction,
  acknowledgeFranchiseWorkflowAction,
  escalateFranchiseCenterRiskAction,
  forwardFranchiseEscalationAction,
  getFranchiseWorkflowById,
  getFranchiseWorkflowHistoryById,
  listFranchiseWorkflowAnomalyQueue,
  listFranchiseWorkflowEscalationQueue,
  listFranchiseWorkflowQueue,
  listFranchiseWorkflowReviewQueue,
  reopenFranchiseWorkflowAction,
  requestFranchiseCenterActionHandler,
  resolveFranchiseWorkflowAction,
  reviewFranchiseWorkflowAction
};