import { apiClient } from "../../../services/apiClient";
import { normalizeFranchiseAnalyticsParams } from "../utils/filters";

const CLIENT_CACHE_TTL_MS = 15_000;
const inflightRequests = new Map();
const responseCache = new Map();

function stableSerializeDashboardValue(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeDashboardValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableSerializeDashboardValue(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

function buildCacheKey(path, params = {}) {
  return `${path}?${stableSerializeDashboardValue(params)}`;
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

function normalizeMeta(meta = {}) {
  const sourceMode = meta?.source?.mode;

  return {
    ...meta,
    generatedAt: meta?.generatedAt || null,
    source:
      sourceMode === "snapshot" || sourceMode === "live"
        ? {
            ...meta.source,
            mode: sourceMode
          }
        : null
  };
}

function normalizePagination(pagination = {}, itemCount = 0) {
  const resolvedTotal = Number.isInteger(pagination?.total) ? pagination.total : itemCount;

  return {
    limit: Number.isInteger(pagination?.limit) ? pagination.limit : itemCount,
    offset: Number.isInteger(pagination?.offset) ? pagination.offset : 0,
    total: resolvedTotal,
    returned: Number.isInteger(pagination?.returned) ? pagination.returned : itemCount
  };
}

function normalizeSort(sort = {}) {
  return {
    sortBy: typeof sort?.sortBy === "string" && sort.sortBy.trim() ? sort.sortBy.trim() : null,
    sortDirection: sort?.sortDirection === "asc" ? "asc" : "desc"
  };
}

function normalizeFranchiseOverviewPayload(payload = {}) {
  const resolvedPayload = payload && typeof payload === "object" ? payload : {};

  return {
    ...resolvedPayload,
    meta: normalizeMeta(resolvedPayload?.meta),
    kpis: resolvedPayload?.kpis && typeof resolvedPayload.kpis === "object" ? resolvedPayload.kpis : {}
  };
}

function normalizeTrendPayload(payload = {}) {
  const resolvedPayload = payload && typeof payload === "object" ? payload : {};

  return {
    ...resolvedPayload,
    meta: normalizeMeta(resolvedPayload?.meta),
    series: Array.isArray(resolvedPayload?.series) ? resolvedPayload.series : [],
    summary:
      resolvedPayload?.summary && typeof resolvedPayload.summary === "object"
        ? resolvedPayload.summary
        : {}
  };
}

function normalizeCenterHealthPayload(payload = {}) {
  const resolvedPayload = payload && typeof payload === "object" ? payload : {};
  const items = Array.isArray(resolvedPayload?.items) ? resolvedPayload.items : [];

  return {
    ...resolvedPayload,
    meta: normalizeMeta(resolvedPayload?.meta),
    items,
    pagination: normalizePagination(resolvedPayload?.pagination, items.length),
    sort: normalizeSort(resolvedPayload?.sort)
  };
}

function normalizeAlertSummary(summary = {}) {
  return {
    totalAlerts: Number.isFinite(summary?.totalAlerts) ? summary.totalAlerts : 0,
    criticalCount: Number.isFinite(summary?.criticalCount) ? summary.criticalCount : 0,
    highCount: Number.isFinite(summary?.highCount) ? summary.highCount : 0,
    mediumCount: Number.isFinite(summary?.mediumCount) ? summary.mediumCount : 0,
    lowCount: Number.isFinite(summary?.lowCount) ? summary.lowCount : 0,
    ...summary
  };
}

function normalizeFranchiseAlertsPayload(payload = {}) {
  const resolvedPayload = payload && typeof payload === "object" ? payload : {};

  return {
    ...resolvedPayload,
    meta: normalizeMeta(resolvedPayload?.meta),
    summary: normalizeAlertSummary(resolvedPayload?.summary),
    items: Array.isArray(resolvedPayload?.items) ? resolvedPayload.items : []
  };
}

function resolveFranchiseId(franchiseId) {
  if (typeof franchiseId !== "string" || !franchiseId.trim()) {
    throw new Error("franchiseId is required");
  }

  return franchiseId.trim();
}

function buildFranchiseResourcePath(franchiseId, suffix) {
  return `/partner/franchises/${encodeURIComponent(resolveFranchiseId(franchiseId))}/${suffix}`;
}

async function requestDashboardResource(path, params = {}, options = {}) {
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
        _suppressErrorLogging: options.suppressErrorLogging ?? false
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
          _suppressErrorLogging: options.suppressErrorLogging ?? false
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

function clearBpDashboardClientCache() {
  inflightRequests.clear();
  responseCache.clear();
}

function getDashboardOverview(params = {}, options = {}) {
  return requestDashboardResource("/partner/dashboard/overview", params, options);
}

function getRevenueTrend(params = {}, options = {}) {
  return requestDashboardResource("/partner/dashboard/revenue-trend", params, options);
}

function getStudentGrowthTrend(params = {}, options = {}) {
  return requestDashboardResource("/partner/dashboard/student-growth-trend", params, options);
}

function getFranchiseRanking(params = {}, options = {}) {
  return requestDashboardResource("/partner/dashboard/franchise-ranking", params, options);
}

function getCenterHealth(params = {}, options = {}) {
  return requestDashboardResource("/partner/dashboard/center-health", params, options);
}

function getFranchiseOverview(franchiseId, params = {}, options = {}) {
  const normalizedParams = normalizeFranchiseAnalyticsParams(params, {
    includeAsOf: true,
    includeFilters: true
  });

  return requestDashboardResource(buildFranchiseResourcePath(franchiseId, "overview"), normalizedParams, options).then(
    normalizeFranchiseOverviewPayload
  );
}

function getFranchiseRevenueTrend(franchiseId, params = {}, options = {}) {
  const normalizedParams = normalizeFranchiseAnalyticsParams(params, {
    includeAsOf: true,
    includeMonths: true,
    includeFilters: true
  });

  return requestDashboardResource(
    buildFranchiseResourcePath(franchiseId, "revenue-trend"),
    normalizedParams,
    options
  ).then(normalizeTrendPayload);
}

function getFranchiseStudentGrowth(franchiseId, params = {}, options = {}) {
  const normalizedParams = normalizeFranchiseAnalyticsParams(params, {
    includeAsOf: true,
    includeMonths: true,
    includeFilters: true
  });

  return requestDashboardResource(
    buildFranchiseResourcePath(franchiseId, "student-growth"),
    normalizedParams,
    options
  ).then(normalizeTrendPayload);
}

function getFranchiseCenters(franchiseId, params = {}, options = {}) {
  const normalizedParams = normalizeFranchiseAnalyticsParams(params, {
    includeAsOf: true,
    includePagination: true,
    includeSorting: true,
    includeFilters: true
  });

  return requestDashboardResource(buildFranchiseResourcePath(franchiseId, "centers"), normalizedParams, options).then(
    normalizeCenterHealthPayload
  );
}

function getFranchiseAlerts(franchiseId, params = {}, options = {}) {
  const normalizedParams = normalizeFranchiseAnalyticsParams(params, {
    includeAsOf: true,
    includeFilters: true
  });

  return requestDashboardResource(buildFranchiseResourcePath(franchiseId, "alerts"), normalizedParams, options).then(
    normalizeFranchiseAlertsPayload
  );
}

async function getDashboardFilterCatalog(options = {}) {
  const [franchisesResponse, hierarchyResponse] = await Promise.all([
    requestDashboardResource(
      "/franchises",
      { limit: 200, offset: 0 },
      {
        ...options,
        skipGlobalLoading: true,
        suppressErrorLogging: true
      }
    ),
    requestDashboardResource(
      "/partner/hierarchy",
      { includeInactive: false },
      {
        ...options,
        skipGlobalLoading: true,
        suppressErrorLogging: true
      }
    )
  ]);

  return {
    franchises: franchisesResponse?.items || franchisesResponse?.data?.items || [],
    hierarchyNodes: Array.isArray(hierarchyResponse) ? hierarchyResponse : hierarchyResponse?.data || []
  };
}

export {
  clearBpDashboardClientCache,
  getCenterHealth,
  getDashboardFilterCatalog,
  getDashboardOverview,
  getFranchiseAlerts,
  getFranchiseCenters,
  getFranchiseOverview,
  getFranchiseRanking,
  getFranchiseRevenueTrend,
  getFranchiseStudentGrowth,
  getRevenueTrend,
  stableSerializeDashboardValue,
  getStudentGrowthTrend
};