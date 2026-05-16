import { apiClient } from "../../../services/apiClient";

const BASE_PATH = "/partner/workflows/settlements";
const CLIENT_CACHE_TTL_MS = 15_000;
const inflightRequests = new Map();
const responseCache = new Map();

function stableSerializeWorkflowValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeWorkflowValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableSerializeWorkflowValue(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function buildCacheKey(path, params = {}) {
  return `${path}?${stableSerializeWorkflowValue(params)}`;
}

function unwrapApiPayload(response) {
  return response?.data?.data ?? response?.data ?? null;
}

function shouldRetry(error) {
  if (!error) {
    return false;
  }

  const status = error?.response?.status;
  const code = error?.code;
  return !status && code !== "ERR_CANCELED" && code !== "AbortError";
}

function readFromCache(cacheKey) {
  const cached = responseCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function writeToCache(cacheKey, payload) {
  responseCache.set(cacheKey, {
    payload,
    expiresAt: Date.now() + CLIENT_CACHE_TTL_MS
  });
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizeBooleanParam(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value ? "true" : "false";
}

function normalizeInteger(value, fallback = null, minimum = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  if (minimum !== null && parsed < minimum) {
    return fallback;
  }

  return parsed;
}

function normalizeListValue(value, { upperCase = false } = {}) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const normalized = items
    .map((item) => normalizeOptionalText(item))
    .filter(Boolean)
    .map((item) => (upperCase ? item.toUpperCase() : item));

  return normalized.length ? Array.from(new Set(normalized)).join(",") : undefined;
}

function normalizeQueueRequestParams({
  limit = 20,
  offset = 0,
  status,
  currentActionRole,
  franchiseId,
  centerId,
  overdueOnly,
  escalationOnly,
  pendingActionOnly,
  q,
  sortBy,
  sortOrder
} = {}) {
  const params = {
    limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    offset: Math.max(0, Number(offset) || 0),
    sortBy: normalizeOptionalText(sortBy) || "updatedAt",
    sortOrder: String(sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc"
  };

  const normalizedStatus = normalizeListValue(status, { upperCase: true });
  if (normalizedStatus) {
    params.status = normalizedStatus;
  }

  const normalizedCurrentActionRole = normalizeListValue(currentActionRole, { upperCase: true });
  if (normalizedCurrentActionRole) {
    params.currentActionRole = normalizedCurrentActionRole;
  }

  const overdueOnlyParam = normalizeBooleanParam(overdueOnly);
  if (overdueOnlyParam !== undefined) {
    params.overdueOnly = overdueOnlyParam;
  }

  const escalationOnlyParam = normalizeBooleanParam(escalationOnly);
  if (escalationOnlyParam !== undefined) {
    params.escalationOnly = escalationOnlyParam;
  }

  const pendingActionOnlyParam = normalizeBooleanParam(pendingActionOnly);
  if (pendingActionOnlyParam !== undefined) {
    params.pendingActionOnly = pendingActionOnlyParam;
  }

  const normalizedFranchiseId = normalizeOptionalText(franchiseId);
  if (normalizedFranchiseId) {
    params.franchiseId = normalizedFranchiseId;
  }

  const normalizedCenterId = normalizeOptionalText(centerId);
  if (normalizedCenterId) {
    params.centerId = normalizedCenterId;
  }

  const normalizedQuery = normalizeOptionalText(q);
  if (normalizedQuery) {
    params.q = normalizedQuery;
  }

  return params;
}

function normalizeResourcePaginationParams({ limit = 20, offset = 0, activeOnly } = {}) {
  const params = {
    limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    offset: Math.max(0, Number(offset) || 0)
  };

  const activeOnlyParam = normalizeBooleanParam(activeOnly);
  if (activeOnlyParam !== undefined) {
    params.activeOnly = activeOnlyParam;
  }

  return params;
}

function normalizeActionPayload(payload = {}) {
  const expectedVersion = normalizeInteger(
    payload.expectedVersion ?? payload.workflowVersion ?? payload.workflow?.workflowVersion,
    undefined,
    1
  );

  const normalizedPayload = {
    ...(expectedVersion ? { expectedVersion } : {}),
    ...(normalizeOptionalText(payload.notes) ? { notes: normalizeOptionalText(payload.notes) } : {}),
    ...(normalizeOptionalText(payload.reason) ? { reason: normalizeOptionalText(payload.reason) } : {}),
    ...(normalizeOptionalText(payload.payoutReference) ? { payoutReference: normalizeOptionalText(payload.payoutReference) } : {}),
    ...(normalizeOptionalText(payload.franchiseId) ? { franchiseId: normalizeOptionalText(payload.franchiseId) } : {}),
    ...(normalizeOptionalText(payload.centerId) ? { centerId: normalizeOptionalText(payload.centerId) } : {}),
    ...(normalizeOptionalText(payload.escalationId) ? { escalationId: normalizeOptionalText(payload.escalationId) } : {}),
    ...(normalizeOptionalText(payload.escalationType) ? { escalationType: normalizeOptionalText(payload.escalationType).toUpperCase() } : {}),
    ...(normalizeOptionalText(payload.severity) ? { severity: normalizeOptionalText(payload.severity).toUpperCase() } : {}),
    ...(payload.taskDueAt ? { taskDueAt: payload.taskDueAt } : {}),
    ...(payload.payoutDueAt ? { payoutDueAt: payload.payoutDueAt } : {}),
    ...(payload.paidAt ? { paidAt: payload.paidAt } : {}),
    ...(payload.metadata && typeof payload.metadata === "object" ? { metadata: payload.metadata } : {})
  };

  return normalizedPayload;
}

function normalizeActionResponsePayload(payload = {}) {
  const resolvedPayload = payload && typeof payload === "object" ? payload : {};
  return {
    settlement: resolvedPayload.settlement || null,
    history: resolvedPayload.history || null,
    nextTask: resolvedPayload.nextTask || null,
    escalation: resolvedPayload.escalation || null,
    workflowVersion: Number.isFinite(resolvedPayload.workflowVersion)
      ? resolvedPayload.workflowVersion
      : resolvedPayload.settlement?.workflowVersion ?? null,
    allowedActions: Array.isArray(resolvedPayload.allowedActions)
      ? resolvedPayload.allowedActions
      : Array.isArray(resolvedPayload.settlement?.allowedActions)
        ? resolvedPayload.settlement.allowedActions
        : []
  };
}

function normalizeQueueItem(item = {}) {
  const resolved = item && typeof item === "object" ? item : {};
  return {
    ...resolved,
    id: resolved.id || null,
    periodLabel:
      Number.isInteger(resolved.periodYear) && Number.isInteger(resolved.periodMonth)
        ? `${resolved.periodYear}-${String(resolved.periodMonth).padStart(2, "0")}`
        : "-",
    allowedActions: Array.isArray(resolved.allowedActions) ? resolved.allowedActions : [],
    activeTask: resolved.activeTask || null,
    activeEscalation: resolved.activeEscalation || null,
    counts: resolved.counts || null,
    canUploadSupportingRecord: Boolean(resolved.canUploadSupportingRecord)
  };
}

function normalizeCollectionPayload(payload = {}, itemNormalizer) {
  const resolved = payload && typeof payload === "object" ? payload : {};
  const items = Array.isArray(resolved.items) ? resolved.items.map(itemNormalizer) : [];

  return {
    items,
    limit: Number.isFinite(resolved.limit) ? resolved.limit : items.length,
    offset: Number.isFinite(resolved.offset) ? resolved.offset : 0,
    total: Number.isFinite(resolved.total) ? resolved.total : items.length,
    sortBy: resolved.sortBy || null,
    sortOrder: resolved.sortOrder === "asc" ? "asc" : "desc"
  };
}

function normalizeSummaryPayload(payload = {}) {
  const resolved = payload && typeof payload === "object" ? payload : {};
  return {
    pendingReviewCount: Number.isFinite(resolved.pendingReviewCount) ? resolved.pendingReviewCount : 0,
    approvalQueueCount: Number.isFinite(resolved.approvalQueueCount) ? resolved.approvalQueueCount : 0,
    overdueCount: Number.isFinite(resolved.overdueCount) ? resolved.overdueCount : 0,
    escalationCount: Number.isFinite(resolved.escalationCount) ? resolved.escalationCount : 0,
    payoutPendingCount: Number.isFinite(resolved.payoutPendingCount) ? resolved.payoutPendingCount : 0
  };
}

function normalizeHistoryItem(item = {}) {
  const resolved = item && typeof item === "object" ? item : {};
  return {
    ...resolved,
    id: resolved.id || null,
    actorUser: resolved.actorUser || null,
    franchise: resolved.franchise || null,
    center: resolved.center || null,
    metadata: resolved.metadata || null
  };
}

function normalizeTaskItem(item = {}) {
  const resolved = item && typeof item === "object" ? item : {};
  return {
    ...resolved,
    id: resolved.id || null,
    targetUser: resolved.targetUser || null,
    franchise: resolved.franchise || null,
    center: resolved.center || null,
    metadata: resolved.metadata || null
  };
}

function normalizeEscalationItem(item = {}) {
  const resolved = item && typeof item === "object" ? item : {};
  return {
    ...resolved,
    id: resolved.id || null,
    franchise: resolved.franchise || null,
    center: resolved.center || null,
    metadata: resolved.metadata || null
  };
}

function normalizeSupportingRecordItem(item = {}) {
  const resolved = item && typeof item === "object" ? item : {};
  return {
    ...resolved,
    id: resolved.id || null,
    uploadedByUser: resolved.uploadedByUser || null,
    metadata: resolved.metadata || null
  };
}

function normalizeSettlementWorkflowQueuePayload(payload = {}) {
  return normalizeCollectionPayload(payload, normalizeQueueItem);
}

function normalizeSettlementWorkflowHistoryPayload(payload = {}) {
  return normalizeCollectionPayload(payload, normalizeHistoryItem);
}

function normalizeSettlementWorkflowTasksPayload(payload = {}) {
  return normalizeCollectionPayload(payload, normalizeTaskItem);
}

function normalizeSettlementWorkflowEscalationsPayload(payload = {}) {
  return normalizeCollectionPayload(payload, normalizeEscalationItem);
}

function normalizeSettlementSupportingRecordsPayload(payload = {}) {
  return normalizeCollectionPayload(payload, normalizeSupportingRecordItem);
}

function normalizeSettlementWorkflowDetailPayload(payload = {}) {
  const resolved = payload && typeof payload === "object" ? payload : {};
  return {
    settlement: resolved.settlement ? normalizeQueueItem(resolved.settlement) : null,
    workflow: {
      status: resolved.workflow?.status || resolved.settlement?.status || null,
      workflowVersion: Number.isFinite(resolved.workflow?.workflowVersion)
        ? resolved.workflow.workflowVersion
        : resolved.settlement?.workflowVersion ?? null,
      currentActionRole: resolved.workflow?.currentActionRole || resolved.settlement?.currentActionRole || null,
      allowedActions: Array.isArray(resolved.workflow?.allowedActions) ? resolved.workflow.allowedActions : [],
      canUploadSupportingRecord: Boolean(resolved.workflow?.canUploadSupportingRecord)
    },
    history: Array.isArray(resolved.history) ? resolved.history.map(normalizeHistoryItem) : [],
    tasks: Array.isArray(resolved.tasks) ? resolved.tasks.map(normalizeTaskItem) : [],
    escalations: Array.isArray(resolved.escalations) ? resolved.escalations.map(normalizeEscalationItem) : [],
    supportingRecords: Array.isArray(resolved.supportingRecords)
      ? resolved.supportingRecords.map(normalizeSupportingRecordItem)
      : []
  };
}

async function requestWorkflowResource(path, params = {}, options = {}) {
  const cacheKey = buildCacheKey(path, params);
  const cached = readFromCache(cacheKey);
  if (cached && !options.bypassCache) {
    return cached;
  }

  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    try {
      const response = await apiClient.get(path, {
        params,
        signal: options.signal,
        _skipGlobalLoading: options.skipGlobalLoading ?? true,
        _suppressErrorLogging: options.suppressErrorLogging ?? true
      });
      const payload = unwrapApiPayload(response);
      writeToCache(cacheKey, payload);
      return payload;
    } catch (error) {
      if (shouldRetry(error) && !options.signal?.aborted) {
        const retryResponse = await apiClient.get(path, {
          params,
          signal: options.signal,
          _skipGlobalLoading: options.skipGlobalLoading ?? true,
          _suppressErrorLogging: options.suppressErrorLogging ?? true
        });
        const payload = unwrapApiPayload(retryResponse);
        writeToCache(cacheKey, payload);
        return payload;
      }

      throw error;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

async function postWorkflowResource(path, payload = {}, options = {}) {
  const response = await apiClient.post(path, payload, {
    signal: options.signal,
    onUploadProgress: options.onUploadProgress,
    _skipGlobalLoading: options.skipGlobalLoading ?? true,
    _suppressErrorLogging: options.suppressErrorLogging ?? true
  });
  clearSettlementWorkflowClientCache();
  return unwrapApiPayload(response);
}

function clearSettlementWorkflowClientCache() {
  inflightRequests.clear();
  responseCache.clear();
}

function getSettlementWorkflowQueue(params = {}, options = {}) {
  return requestWorkflowResource(BASE_PATH, normalizeQueueRequestParams(params), options).then(
    normalizeSettlementWorkflowQueuePayload
  );
}

function getSettlementWorkflowSummary(options = {}) {
  return requestWorkflowResource(`${BASE_PATH}/queue/summary`, {}, options).then(normalizeSummaryPayload);
}

function getSettlementWorkflowDetail(settlementId, options = {}) {
  return requestWorkflowResource(`${BASE_PATH}/${encodeURIComponent(settlementId)}`, {}, options).then(
    normalizeSettlementWorkflowDetailPayload
  );
}

function getSettlementWorkflowHistory(settlementId, params = {}, options = {}) {
  return requestWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/history`,
    normalizeResourcePaginationParams(params),
    options
  ).then(normalizeSettlementWorkflowHistoryPayload);
}

function getSettlementWorkflowTasks(settlementId, params = {}, options = {}) {
  return requestWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/tasks`,
    normalizeResourcePaginationParams(params),
    options
  ).then(normalizeSettlementWorkflowTasksPayload);
}

function getSettlementWorkflowEscalations(settlementId, params = {}, options = {}) {
  return requestWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/escalations`,
    normalizeResourcePaginationParams(params),
    options
  ).then(normalizeSettlementWorkflowEscalationsPayload);
}

function getSettlementSupportingRecords(settlementId, params = {}, options = {}) {
  return requestWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/supporting-records`,
    normalizeResourcePaginationParams(params),
    options
  ).then(normalizeSettlementSupportingRecordsPayload);
}

function submitSettlementWorkflow(settlementId, payload = {}, options = {}) {
  return postWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/actions/submit`,
    normalizeActionPayload(payload),
    options
  ).then(normalizeActionResponsePayload);
}

function reviewSettlementWorkflow(settlementId, payload = {}, options = {}) {
  return postWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/actions/review`,
    normalizeActionPayload(payload),
    options
  ).then(normalizeActionResponsePayload);
}

function approveSettlementWorkflow(settlementId, payload = {}, options = {}) {
  return postWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/actions/approve`,
    normalizeActionPayload(payload),
    options
  ).then(normalizeActionResponsePayload);
}

function rejectSettlementWorkflow(settlementId, payload = {}, options = {}) {
  return postWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/actions/reject`,
    normalizeActionPayload(payload),
    options
  ).then(normalizeActionResponsePayload);
}

function reopenSettlementWorkflow(settlementId, payload = {}, options = {}) {
  return postWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/actions/reopen`,
    normalizeActionPayload(payload),
    options
  ).then(normalizeActionResponsePayload);
}

function escalateSettlementWorkflow(settlementId, payload = {}, options = {}) {
  return postWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/actions/escalate`,
    normalizeActionPayload(payload),
    options
  ).then(normalizeActionResponsePayload);
}

function resolveSettlementEscalationWorkflow(settlementId, payload = {}, options = {}) {
  return postWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/actions/resolve-escalation`,
    normalizeActionPayload(payload),
    options
  ).then(normalizeActionResponsePayload);
}

function markSettlementWorkflowPaid(settlementId, payload = {}, options = {}) {
  return postWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/actions/mark-paid`,
    normalizeActionPayload(payload),
    options
  ).then(normalizeActionResponsePayload);
}

function uploadSettlementSupportingRecord(settlementId, payload = {}, options = {}) {
  const body = {
    ...(normalizeOptionalText(payload.recordType) ? { recordType: normalizeOptionalText(payload.recordType) } : {}),
    ...(normalizeOptionalText(payload.fileUrl) ? { fileUrl: normalizeOptionalText(payload.fileUrl) } : {}),
    ...(normalizeOptionalText(payload.fileName) ? { fileName: normalizeOptionalText(payload.fileName) } : {}),
    ...(normalizeOptionalText(payload.mimeType) ? { mimeType: normalizeOptionalText(payload.mimeType) } : {}),
    ...(normalizeOptionalText(payload.notes) ? { notes: normalizeOptionalText(payload.notes) } : {}),
    ...(normalizeOptionalText(payload.franchiseId) ? { franchiseId: normalizeOptionalText(payload.franchiseId) } : {}),
    ...(normalizeOptionalText(payload.centerId) ? { centerId: normalizeOptionalText(payload.centerId) } : {}),
    ...(payload.metadata && typeof payload.metadata === "object" ? { metadata: payload.metadata } : {})
  };

  return postWorkflowResource(
    `${BASE_PATH}/${encodeURIComponent(settlementId)}/supporting-records`,
    body,
    {
      ...options,
      onUploadProgress: typeof options.onProgress === "function"
        ? (event) => {
            if (!event?.total) {
              options.onProgress(100);
              return;
            }

            options.onProgress(Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100))));
          }
        : undefined
    }
  ).then(normalizeSupportingRecordItem);
}

export {
  approveSettlementWorkflow,
  clearSettlementWorkflowClientCache,
  escalateSettlementWorkflow,
  getSettlementSupportingRecords,
  getSettlementWorkflowDetail,
  getSettlementWorkflowEscalations,
  getSettlementWorkflowHistory,
  getSettlementWorkflowQueue,
  getSettlementWorkflowSummary,
  getSettlementWorkflowTasks,
  markSettlementWorkflowPaid,
  normalizeActionPayload,
  normalizeQueueRequestParams,
  normalizeSettlementWorkflowDetailPayload,
  rejectSettlementWorkflow,
  reopenSettlementWorkflow,
  resolveSettlementEscalationWorkflow,
  reviewSettlementWorkflow,
  stableSerializeWorkflowValue,
  submitSettlementWorkflow,
  uploadSettlementSupportingRecord
};