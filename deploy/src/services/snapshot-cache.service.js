const BP_DASHBOARD_CACHE_TTL_MS = 30_000;
const dashboardCache = new Map();

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function pruneExpiredDashboardCache(now = Date.now()) {
  for (const [key, entry] of dashboardCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      dashboardCache.delete(key);
    }
  }
}

function buildScopeCacheKey(bpScope) {
  return {
    businessPartnerId: bpScope?.businessPartner?.id || null,
    franchiseIds: [...(bpScope?.franchiseIds || [])].sort(),
    centerIds: [...(bpScope?.centerIds || [])].sort(),
    hierarchyNodeIds: [...(bpScope?.hierarchyNodeIds || [])].sort()
  };
}

function buildDashboardCacheKey({ tenantId, segment, bpScope, filters = {} }) {
  return JSON.stringify({
    tenantId,
    segment,
    scope: buildScopeCacheKey(bpScope),
    filters
  });
}

function parseDashboardCacheKey(cacheKey) {
  try {
    return JSON.parse(cacheKey);
  } catch {
    return null;
  }
}

function withCacheMeta(payload, segment, hit) {
  const data = cloneData(payload);
  data.meta = {
    ...(data.meta || {}),
    cache: {
      segment,
      ttlMs: BP_DASHBOARD_CACHE_TTL_MS,
      hit
    }
  };
  return data;
}

async function resolveCachedBpDashboardSlice({ tenantId, bpScope, segment, filters, loader }) {
  pruneExpiredDashboardCache();
  const cacheKey = buildDashboardCacheKey({ tenantId, segment, bpScope, filters });
  const now = Date.now();
  const cached = dashboardCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return withCacheMeta(cached.payload, segment, true);
  }

  const payload = await loader();
  dashboardCache.set(cacheKey, {
    payload: cloneData(payload),
    expiresAt: now + BP_DASHBOARD_CACHE_TTL_MS
  });

  return withCacheMeta(payload, segment, false);
}

function clearBpDashboardCache() {
  const sizeBefore = dashboardCache.size;
  dashboardCache.clear();
  return {
    removed: sizeBefore
  };
}

function invalidateBpDashboardCache({ tenantId, businessPartnerId, segments } = {}) {
  pruneExpiredDashboardCache();
  const segmentSet = Array.isArray(segments) && segments.length ? new Set(segments) : null;
  let removed = 0;

  for (const [cacheKey] of dashboardCache.entries()) {
    const parsed = parseDashboardCacheKey(cacheKey);
    if (!parsed) {
      dashboardCache.delete(cacheKey);
      removed += 1;
      continue;
    }

    if (tenantId && parsed.tenantId !== tenantId) {
      continue;
    }

    if (businessPartnerId && parsed.scope?.businessPartnerId !== businessPartnerId) {
      continue;
    }

    if (segmentSet && !segmentSet.has(parsed.segment)) {
      continue;
    }

    dashboardCache.delete(cacheKey);
    removed += 1;
  }

  return {
    removed,
    tenantId: tenantId || null,
    businessPartnerId: businessPartnerId || null,
    segments: segmentSet ? [...segmentSet] : null
  };
}

function getBpDashboardCacheStats() {
  pruneExpiredDashboardCache();
  return {
    size: dashboardCache.size,
    ttlMs: BP_DASHBOARD_CACHE_TTL_MS
  };
}

export {
  BP_DASHBOARD_CACHE_TTL_MS,
  buildDashboardCacheKey,
  clearBpDashboardCache,
  getBpDashboardCacheStats,
  invalidateBpDashboardCache,
  resolveCachedBpDashboardSlice
};