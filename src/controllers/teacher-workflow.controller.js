import { asyncHandler } from "../utils/async-handler.js";
import { MAX_LIMIT } from "../utils/pagination.js";
import {
  acknowledgeTeacherWorkflow,
  bulkGradeTeacherWorkflow,
  completeTeacherWorkflowGrading,
  getTeacherWorkflowDetail,
  listTeacherWorkflowHistory,
  listTeacherWorkflows,
  markTeacherWorkflowAttendance,
  reopenTeacherWorkflow,
  resolveTeacherWorkflow,
  reviewTeacherWorkflow,
  startTeacherWorkflowRecovery
} from "../services/teacher-workflow.service.js";

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

function buildTeacherScope(req) {
  return {
    tenantId: req.auth?.tenantId,
    authUserId: req.auth?.userId,
    hierarchyNodeId: req.auth?.hierarchyNodeId
  };
}

function buildActionPayload(req) {
  return {
    ...buildTeacherScope(req),
    workflowId: req.params.id,
    actorUserId: req.auth?.userId,
    actorRole: req.auth?.role,
    expectedVersion: getExpectedVersion(req.body),
    notes: req.body?.notes,
    reason: req.body?.reason,
    taskDueAt: req.body?.taskDueAt,
    metadata: req.body?.metadata,
    entries: req.body?.entries,
    publish: req.body?.publish,
    attendanceSessionId: req.body?.attendanceSessionId,
    submissionIds: req.body?.submissionIds,
    score: req.body?.score,
    remarks: req.body?.remarks
  };
}

function formatActionResponse(result) {
  return {
    workflow: result.workflow,
    center: result.center,
    teacher: result.teacher,
    tasks: result.tasks,
    history: result.history,
    lastHistory: result.lastHistory,
    nextTask: result.nextTask,
    mutationResult: result.mutationResult || null,
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

const listTeacherWorkflowQueue = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listTeacherWorkflows({
    ...buildTeacherScope(req),
    filters: buildFilters(req),
    limit,
    offset,
    sortBy: parseSortBy(req.query.sortBy),
    sortOrder: parseSortOrder(req.query.sortOrder)
  });

  return res.apiSuccess("Teacher workflow queue fetched", data);
});

function createQueueHandler(queueTypes, successMessage) {
  return asyncHandler(async (req, res) => {
    const { limit, offset } = parsePagination(req.query);
    const data = await listTeacherWorkflows({
      ...buildTeacherScope(req),
      filters: buildFilters(req),
      limit,
      offset,
      sortBy: parseSortBy(req.query.sortBy),
      sortOrder: parseSortOrder(req.query.sortOrder),
      queueTypes
    });

    return res.apiSuccess(successMessage, data);
  });
}

const listTeacherAttendanceWorkflowQueue = createQueueHandler(["ATTENDANCE"], "Teacher attendance workflow queue fetched");
const listTeacherGradingWorkflowQueue = createQueueHandler(["GRADING"], "Teacher grading workflow queue fetched");
const listTeacherAnomalyWorkflowQueue = createQueueHandler(["CLASSROOM", "ANOMALY"], "Teacher anomaly workflow queue fetched");

const getTeacherWorkflowById = asyncHandler(async (req, res) => {
  const data = await getTeacherWorkflowDetail({
    ...buildTeacherScope(req),
    workflowId: req.params.id
  });

  return res.apiSuccess("Teacher workflow detail fetched", data);
});

const getTeacherWorkflowHistoryById = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const data = await listTeacherWorkflowHistory({
    ...buildTeacherScope(req),
    workflowId: req.params.id,
    limit,
    offset
  });

  return res.apiSuccess("Teacher workflow history fetched", data);
});

const reviewTeacherWorkflowAction = createActionHandler(reviewTeacherWorkflow, "Teacher workflow reviewed");
const acknowledgeTeacherWorkflowAction = createActionHandler(acknowledgeTeacherWorkflow, "Teacher workflow acknowledged");
const startTeacherWorkflowRecoveryAction = createActionHandler(startTeacherWorkflowRecovery, "Teacher workflow recovery started");
const markTeacherWorkflowAttendanceAction = createActionHandler(markTeacherWorkflowAttendance, "Teacher attendance workflow executed");
const completeTeacherWorkflowGradingAction = createActionHandler(completeTeacherWorkflowGrading, "Teacher grading workflow executed");
const bulkGradeTeacherWorkflowAction = createActionHandler(bulkGradeTeacherWorkflow, "Teacher bulk grading workflow executed");
const resolveTeacherWorkflowAction = createActionHandler(resolveTeacherWorkflow, "Teacher workflow resolved");
const reopenTeacherWorkflowAction = createActionHandler(reopenTeacherWorkflow, "Teacher workflow reopened");

export {
  acknowledgeTeacherWorkflowAction,
  bulkGradeTeacherWorkflowAction,
  completeTeacherWorkflowGradingAction,
  getTeacherWorkflowById,
  getTeacherWorkflowHistoryById,
  listTeacherAnomalyWorkflowQueue,
  listTeacherAttendanceWorkflowQueue,
  listTeacherGradingWorkflowQueue,
  listTeacherWorkflowQueue,
  markTeacherWorkflowAttendanceAction,
  reopenTeacherWorkflowAction,
  resolveTeacherWorkflowAction,
  reviewTeacherWorkflowAction,
  startTeacherWorkflowRecoveryAction
};