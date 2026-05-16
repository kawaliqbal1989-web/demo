import { asyncHandler } from "../utils/async-handler.js";
import { MAX_LIMIT } from "../utils/pagination.js";
import {
  acknowledgeCenterWorkflow,
  escalateCenterWorkflowToFranchise,
  getCenterWorkflowDetail,
  listCenterWorkflowHistory,
  listCenterWorkflows,
  reopenCenterWorkflow,
  resolveCenterWorkflow,
  reviewCenterWorkflow,
  scheduleCenterWorkflowFollowUp,
  startCenterWorkflowRecovery
} from "../services/center-workflow.service.js";

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

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

function parseSortBy(value) {
  const allowed = new Set([
    "createdAt",
    "updatedAt",
    "lastDetectedAt",
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
    workflowTypes: parseCsvList(req.query.type),
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

function buildCenterScope(req) {
  return {
    tenantId: req.auth?.tenantId,
    authUserId: req.auth?.userId,
    hierarchyNodeId: req.auth?.hierarchyNodeId
  };
}

function buildActionPayload(req) {
  return {
    ...buildCenterScope(req),
    workflowId: req.params.id,
    actorUserId: req.auth?.userId,
    actorRole: req.auth?.role,
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
    center: result.center,
    tasks: result.tasks,
    history: result.history,
    lastHistory: result.lastHistory,
    nextTask: result.nextTask,
    workflowVersion: result.workflow?.workflowVersion || null,
    allowedActions: Array.isArray(result.workflow?.allowedActions) ? result.workflow.allowedActions : []
  };
}

function createActionHandler(serviceMethod, successMessage) {
  return asyncHandler(async (req, res) => {
    const result = await serviceMethod(buildActionPayload(req));
    return res.apiSuccess(successMessage, formatActionResponse(result));
  });
}

const listCenterWorkflowQueue = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listCenterWorkflows({
    ...buildCenterScope(req),
    filters: buildFilters(req),
    limit,
    offset,
    sortBy: parseSortBy(req.query.sortBy),
    sortOrder: parseSortOrder(req.query.sortOrder)
  });

  return res.apiSuccess("Center workflows fetched", data);
});

function createQueueHandler(queueType, successMessage) {
  return asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const data = await listCenterWorkflows({
      ...buildCenterScope(req),
      filters: buildFilters(req),
      limit,
      offset,
      sortBy: parseSortBy(req.query.sortBy),
      sortOrder: parseSortOrder(req.query.sortOrder),
      queueType
    });

    return res.apiSuccess(successMessage, data);
  });
}

const listCenterAttendanceWorkflowQueue = createQueueHandler("ATTENDANCE", "Center attendance workflows fetched");
const listCenterWorksheetWorkflowQueue = createQueueHandler("WORKSHEET", "Center worksheet workflows fetched");
const listCenterTeacherWorkflowQueue = createQueueHandler("TEACHER", "Center teacher workflows fetched");
const listCenterAnomalyWorkflowQueue = createQueueHandler("ANOMALY", "Center anomaly workflows fetched");

const getCenterWorkflowById = asyncHandler(async (req, res) => {
  const data = await getCenterWorkflowDetail({
    ...buildCenterScope(req),
    workflowId: req.params.id
  });

  return res.apiSuccess("Center workflow detail fetched", data);
});

const getCenterWorkflowHistoryById = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listCenterWorkflowHistory({
    ...buildCenterScope(req),
    workflowId: req.params.id,
    limit,
    offset
  });

  return res.apiSuccess("Center workflow history fetched", data);
});

const reviewCenterWorkflowAction = createActionHandler(reviewCenterWorkflow, "Center workflow reviewed");
const acknowledgeCenterWorkflowAction = createActionHandler(acknowledgeCenterWorkflow, "Center workflow acknowledged");
const startCenterWorkflowRecoveryAction = createActionHandler(startCenterWorkflowRecovery, "Center workflow recovery started");
const scheduleCenterWorkflowFollowUpAction = createActionHandler(scheduleCenterWorkflowFollowUp, "Center workflow follow-up scheduled");
const escalateCenterWorkflowToFranchiseAction = createActionHandler(escalateCenterWorkflowToFranchise, "Center workflow escalated to franchise");
const resolveCenterWorkflowAction = createActionHandler(resolveCenterWorkflow, "Center workflow resolved");
const reopenCenterWorkflowAction = createActionHandler(reopenCenterWorkflow, "Center workflow reopened");

export {
  acknowledgeCenterWorkflowAction,
  escalateCenterWorkflowToFranchiseAction,
  getCenterWorkflowById,
  getCenterWorkflowHistoryById,
  listCenterAnomalyWorkflowQueue,
  listCenterAttendanceWorkflowQueue,
  listCenterTeacherWorkflowQueue,
  listCenterWorkflowQueue,
  listCenterWorksheetWorkflowQueue,
  reopenCenterWorkflowAction,
  resolveCenterWorkflowAction,
  reviewCenterWorkflowAction,
  scheduleCenterWorkflowFollowUpAction,
  startCenterWorkflowRecoveryAction
};