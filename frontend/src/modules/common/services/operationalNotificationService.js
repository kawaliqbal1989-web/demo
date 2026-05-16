import { apiClient } from "../../../services/apiClient";

const CLIENT_CACHE_TTL_MS = 15_000;
const inflightRequests = new Map();
const responseCache = new Map();

function stableSerializeValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableSerializeValue(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function buildCacheKey(path, params = {}) {
  return `${path}?${stableSerializeValue(params)}`;
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

function normalizeBooleanParam(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return value ? "true" : "false";
}

function normalizeListRequestParams({
  limit = 20,
  offset = 0,
  page,
  unread,
  severity,
  category,
  franchiseId,
  centerId,
  sortBy,
  sortOrder
} = {}) {
  const params = {
    limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    offset: Math.max(0, Number(offset) || 0),
    sortBy: sortBy === "createdAt" ? "createdAt" : "lastTriggeredAt",
    sortOrder: String(sortOrder || "").toLowerCase() === "asc" ? "asc" : "desc"
  };

  if (page !== undefined && page !== null && page !== "") {
    params.page = Math.max(1, Number(page) || 1);
  }

  const unreadParam = normalizeBooleanParam(unread);
  if (unreadParam !== undefined) {
    params.unread = unreadParam;
  }

  if (severity) params.severity = String(severity).trim().toUpperCase();
  if (category) params.category = String(category).trim().toUpperCase();
  if (franchiseId) params.franchiseId = String(franchiseId).trim();
  if (centerId) params.centerId = String(centerId).trim();

  return params;
}

function normalizeUnreadCountParams({ severity, category, franchiseId, centerId } = {}) {
  const params = {};
  if (severity) params.severity = String(severity).trim().toUpperCase();
  if (category) params.category = String(category).trim().toUpperCase();
  if (franchiseId) params.franchiseId = String(franchiseId).trim();
  if (centerId) params.centerId = String(centerId).trim();
  return params;
}

function normalizeUnreadCountsPayload(payload = {}) {
  const resolved = payload && typeof payload === "object" ? payload : {};
  const grouped = resolved?.grouped && typeof resolved.grouped === "object" ? resolved.grouped : {};

  return {
    totalUnread: Number.isFinite(resolved?.totalUnread) ? resolved.totalUnread : 0,
    criticalUnread: Number.isFinite(resolved?.criticalUnread) ? resolved.criticalUnread : 0,
    highUnread: Number.isFinite(resolved?.highUnread) ? resolved.highUnread : 0,
    grouped: {
      bySeverity: grouped?.bySeverity && typeof grouped.bySeverity === "object" ? grouped.bySeverity : {},
      byCategory: grouped?.byCategory && typeof grouped.byCategory === "object" ? grouped.byCategory : {}
    }
  };
}

function normalizeOperationalItem(item = {}) {
  const resolved = item && typeof item === "object" ? item : {};

  return {
    ...resolved,
    notificationKind: "operational",
    id: resolved.notificationId || resolved.id || null,
    isUnread: Boolean(resolved.isUnread),
    readAt: resolved.readAt || null,
    title: resolved.title || resolved.type || "Operational alert",
    message: resolved.message || "",
    category: resolved.category || "OPERATIONS",
    severity: resolved.severity || "INFO",
    timestamp: resolved.lastTriggeredAt || resolved.createdAt || null,
    createdAt: resolved.createdAt || resolved.lastTriggeredAt || null,
    franchiseLabel: resolved.franchiseLabel || null,
    centerLabel: resolved.centerLabel || null,
    deepLinkPath: resolved.deepLinkPath || null,
    observedValue: resolved.observedValue ?? null,
    thresholdValue: resolved.thresholdValue ?? null,
    occurrenceCount: Number.isFinite(resolved.occurrenceCount) ? resolved.occurrenceCount : 1,
    reopenedAt: resolved.reopenedAt || null
  };
}

function normalizeNotificationsPayload(payload = {}) {
  const resolved = payload && typeof payload === "object" ? payload : {};
  const items = Array.isArray(resolved?.items) ? resolved.items.map(normalizeOperationalItem) : [];

  return {
    page: Number.isFinite(resolved?.page) ? resolved.page : 1,
    limit: Number.isFinite(resolved?.limit) ? resolved.limit : items.length,
    offset: Number.isFinite(resolved?.offset) ? resolved.offset : 0,
    total: Number.isFinite(resolved?.total) ? resolved.total : items.length,
    unreadCount: Number.isFinite(resolved?.unreadCount) ? resolved.unreadCount : items.filter((item) => item.isUnread).length,
    items
  };
}

async function requestOperationalResource(path, params = {}, options = {}) {
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

function clearOperationalNotificationClientCache() {
  inflightRequests.clear();
  responseCache.clear();
}

function getOperationalNotifications(params = {}, options = {}) {
  return requestOperationalResource(
    "/partner/notifications/operational",
    normalizeListRequestParams(params),
    options
  ).then(normalizeNotificationsPayload);
}

function getOperationalUnreadCounts(params = {}, options = {}) {
  return requestOperationalResource(
    "/partner/notifications/operational/unread-count",
    normalizeUnreadCountParams(params),
    options
  ).then(normalizeUnreadCountsPayload);
}

async function markOperationalNotificationRead(id) {
  const response = await apiClient.patch(`/partner/notifications/operational/${encodeURIComponent(id)}/read`);
  clearOperationalNotificationClientCache();
  return unwrapApiPayload(response);
}

async function markAllOperationalNotificationsRead(filters = {}) {
  const response = await apiClient.patch("/partner/notifications/operational/read-all", null, {
    params: normalizeListRequestParams(filters),
    _skipGlobalLoading: true,
    _suppressErrorLogging: true
  });
  clearOperationalNotificationClientCache();
  return unwrapApiPayload(response);
}

export {
  clearOperationalNotificationClientCache,
  getOperationalNotifications,
  getOperationalUnreadCounts,
  markOperationalNotificationRead,
  markAllOperationalNotificationsRead,
  normalizeNotificationsPayload,
  normalizeUnreadCountsPayload,
  stableSerializeValue
};