import { prisma } from "../lib/prisma.js";

const BP_SCOPE_CACHE_TTL_MS = 30_000;

const identityCache = new Map();
const scopeCache = new Map();

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function createCacheKey(prefix, tenantId, suffix) {
  return `${prefix}:${tenantId}:${suffix}`;
}

function cloneCacheValue(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return [...value];
  }

  if (typeof value === "object") {
    const cloned = { ...value };

    if (cloned.businessPartner) {
      cloned.businessPartner = { ...cloned.businessPartner };
    }

    if (Array.isArray(cloned.franchiseIds)) {
      cloned.franchiseIds = [...cloned.franchiseIds];
    }

    if (Array.isArray(cloned.centerIds)) {
      cloned.centerIds = [...cloned.centerIds];
    }

    if (Array.isArray(cloned.hierarchyNodeIds)) {
      cloned.hierarchyNodeIds = [...cloned.hierarchyNodeIds];
    }

    if (cloned.meta) {
      cloned.meta = { ...cloned.meta };
    }

    return cloned;
  }

  return value;
}

function getCacheValue(cache, key) {
  const entry = cache.get(key);
  if (!entry) {
    return { hit: false, value: undefined };
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return { hit: false, value: undefined };
  }

  return {
    hit: true,
    value: cloneCacheValue(entry.value)
  };
}

function setCacheValue(cache, key, value, ttlMs = BP_SCOPE_CACHE_TTL_MS) {
  cache.set(key, {
    value: cloneCacheValue(value),
    expiresAt: Date.now() + ttlMs
  });
}

function dedupeIds(values) {
  return Array.from(new Set((values || []).filter((value) => typeof value === "string" && value.trim().length)));
}

function normalizeRequiredScopeId(value, fieldName) {
  if (value === undefined || value === null) {
    throw createHttpError(400, `${fieldName} is required`, `${String(fieldName).toUpperCase()}_REQUIRED`);
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `${fieldName} must be a string`, `${String(fieldName).toUpperCase()}_INVALID`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw createHttpError(400, `${fieldName} is required`, `${String(fieldName).toUpperCase()}_REQUIRED`);
  }

  return normalized;
}

function buildNormalizedIdSet(values) {
  return new Set(dedupeIds(values).map((value) => value.trim()));
}

function isScopeRowActive(row, now = new Date()) {
  if (!row || row.status !== "ACTIVE") {
    return false;
  }

  if (row.activeFrom && row.activeFrom > now) {
    return false;
  }

  if (row.activeTo && row.activeTo < now) {
    return false;
  }

  return true;
}

function supportsCache(tx) {
  return tx === prisma;
}

function selectBusinessPartnerFields() {
  return {
    id: true,
    code: true,
    name: true,
    tenantId: true,
    hierarchyNodeId: true,
    accessMode: true,
    isActive: true,
    status: true
  };
}

async function resolveBusinessPartnerForUser({ tenantId, userId, tx = prisma, forceRefresh = false } = {}) {
  if (!tenantId || !userId) {
    return null;
  }

  const cacheKey = createCacheKey("bp-identity", tenantId, userId);
  if (!forceRefresh && supportsCache(tx)) {
    const cached = getCacheValue(identityCache, cacheKey);
    if (cached.hit) {
      return cached.value;
    }
  }

  const user = await tx.authUser.findFirst({
    where: {
      id: userId,
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      role: true,
      username: true,
      email: true,
      hierarchyNodeId: true
    }
  });

  if (!user || user.role !== "BP") {
    if (supportsCache(tx)) {
      setCacheValue(identityCache, cacheKey, null);
    }
    return null;
  }

  const select = selectBusinessPartnerFields();
  const username = user.username ? String(user.username).trim() : "";
  let businessPartner = null;

  if (username) {
    businessPartner = await tx.businessPartner.findFirst({
      where: {
        tenantId,
        code: username,
        isActive: true,
        status: "ACTIVE"
      },
      select,
      orderBy: { createdAt: "desc" }
    });
  }

  if (!businessPartner && user.hierarchyNodeId) {
    businessPartner = await tx.businessPartner.findFirst({
      where: {
        tenantId,
        hierarchyNodeId: user.hierarchyNodeId,
        isActive: true,
        status: "ACTIVE"
      },
      select,
      orderBy: { createdAt: "desc" }
    });
  }

  if (!businessPartner && user.email) {
    const email = String(user.email).trim().toLowerCase();
    if (email) {
      businessPartner = await tx.businessPartner.findFirst({
        where: {
          tenantId,
          contactEmail: email,
          isActive: true,
          status: "ACTIVE"
        },
        select,
        orderBy: { createdAt: "desc" }
      });
    }
  }

  const resolvedPartner = businessPartner?.isActive && businessPartner?.status === "ACTIVE" ? businessPartner : null;

  if (supportsCache(tx)) {
    setCacheValue(identityCache, cacheKey, resolvedPartner);
  }

  return resolvedPartner;
}

async function resolveBusinessPartnerById({ tenantId, businessPartnerId, tx = prisma, forceRefresh = false } = {}) {
  if (!tenantId || !businessPartnerId) {
    return null;
  }

  const cacheKey = createCacheKey("bp-scope", tenantId, businessPartnerId);
  if (!forceRefresh && supportsCache(tx)) {
    const cached = getCacheValue(scopeCache, cacheKey);
    if (cached.hit) {
      return cached.value?.businessPartner || null;
    }
  }

  return tx.businessPartner.findFirst({
    where: {
      tenantId,
      id: businessPartnerId,
      isActive: true,
      status: "ACTIVE"
    },
    select: selectBusinessPartnerFields()
  });
}

async function resolveAccessibleFranchiseScope({ tenantId, businessPartnerId, tx = prisma, now = new Date() }) {
  const explicitScopeQuery = tx.businessPartnerFranchise?.findMany
    ? tx.businessPartnerFranchise.findMany({
        where: {
          tenantId,
          businessPartnerId
        },
        select: {
          franchiseId: true,
          status: true,
          activeFrom: true,
          activeTo: true
        }
      })
    : Promise.resolve([]);

  const [explicitRows, franchiseProfiles] = await Promise.all([
    explicitScopeQuery,
    tx.franchiseProfile.findMany({
      where: {
        tenantId,
        businessPartnerId
      },
      select: {
        id: true,
        businessPartnerId: true,
        status: true
      }
    })
  ]);

  const explicitAllowedIds = new Set(
    explicitRows.filter((row) => isScopeRowActive(row, now)).map((row) => row.franchiseId)
  );
  const explicitBlockedIds = new Set(
    explicitRows.filter((row) => !isScopeRowActive(row, now)).map((row) => row.franchiseId)
  );

  const accessibleIds = [];
  let usedLegacyFallback = false;

  for (const franchise of franchiseProfiles) {
    if (franchise.status === "ARCHIVED") {
      continue;
    }

    if (explicitBlockedIds.has(franchise.id)) {
      continue;
    }

    const allowedByExplicit = explicitAllowedIds.has(franchise.id);
    const allowedByLegacy = franchise.businessPartnerId === businessPartnerId;

    if (!allowedByExplicit && !allowedByLegacy) {
      continue;
    }

    if (!allowedByExplicit && allowedByLegacy) {
      usedLegacyFallback = true;
    }

    accessibleIds.push(franchise.id);
  }

  return {
    ids: dedupeIds(accessibleIds),
    meta: {
      usedExplicitScopes: explicitRows.length > 0,
      usedLegacyFallback
    }
  };
}

async function getAccessibleFranchiseIds({ tenantId, businessPartnerId, tx = prisma, forceRefresh = false, now = new Date() } = {}) {
  if (!tenantId || !businessPartnerId) {
    return [];
  }

  if (!forceRefresh && supportsCache(tx)) {
    const cached = getCacheValue(scopeCache, createCacheKey("bp-scope", tenantId, businessPartnerId));
    if (cached.hit) {
      return cached.value?.franchiseIds || [];
    }
  }

  const scope = await resolveAccessibleFranchiseScope({ tenantId, businessPartnerId, tx, now });
  return scope.ids;
}

async function resolveAccessibleCenterScope({
  tenantId,
  businessPartnerId,
  franchiseIds,
  tx = prisma,
  now = new Date()
} = {}) {
  const accessibleFranchiseIds = dedupeIds(franchiseIds);

  const explicitRows = tx.businessPartnerCenterScope?.findMany
    ? await tx.businessPartnerCenterScope.findMany({
        where: {
          tenantId,
          businessPartnerId
        },
        select: {
          centerId: true,
          status: true,
          activeFrom: true,
          activeTo: true
        }
      })
    : [];
  const explicitCenterIds = dedupeIds(explicitRows.map((row) => row.centerId));

  const centerWhere = {
    tenantId,
    OR: [
      {
        franchiseProfile: {
          is: {
            businessPartnerId
          }
        }
      }
    ]
  };

  if (explicitCenterIds.length) {
    centerWhere.OR.push({
      id: { in: explicitCenterIds }
    });
  }

  if (accessibleFranchiseIds.length) {
    centerWhere.OR.push({
      franchiseProfileId: { in: accessibleFranchiseIds }
    });
  }

  const centerProfiles = await tx.centerProfile.findMany({
    where: centerWhere,
    select: {
      id: true,
      franchiseProfileId: true,
      status: true,
      franchiseProfile: {
        select: {
          businessPartnerId: true
        }
      }
    }
  });

  const explicitAllowedIds = new Set(
    explicitRows.filter((row) => isScopeRowActive(row, now)).map((row) => row.centerId)
  );
  const explicitBlockedIds = new Set(
    explicitRows.filter((row) => !isScopeRowActive(row, now)).map((row) => row.centerId)
  );
  const accessibleFranchiseIdSet = new Set(accessibleFranchiseIds);

  const accessibleIds = [];
  let usedLegacyFallback = false;

  for (const center of centerProfiles) {
    if (center.status === "ARCHIVED") {
      continue;
    }

    if (explicitBlockedIds.has(center.id)) {
      continue;
    }

    const allowedByExplicit = explicitAllowedIds.has(center.id);
    const allowedByFranchise = accessibleFranchiseIdSet.has(center.franchiseProfileId);
    const allowedByLegacy = center.franchiseProfile?.businessPartnerId === businessPartnerId;

    if (!allowedByExplicit && !allowedByFranchise && !allowedByLegacy) {
      continue;
    }

    if (!allowedByExplicit && allowedByLegacy && !allowedByFranchise) {
      usedLegacyFallback = true;
    }

    accessibleIds.push(center.id);
  }

  return {
    ids: dedupeIds(accessibleIds),
    meta: {
      usedExplicitScopes: explicitRows.length > 0,
      usedLegacyFallback
    }
  };
}

async function getAccessibleCenterIds({
  tenantId,
  businessPartnerId,
  franchiseIds,
  tx = prisma,
  forceRefresh = false,
  now = new Date()
} = {}) {
  if (!tenantId || !businessPartnerId) {
    return [];
  }

  if (!forceRefresh && supportsCache(tx)) {
    const cached = getCacheValue(scopeCache, createCacheKey("bp-scope", tenantId, businessPartnerId));
    if (cached.hit) {
      return cached.value?.centerIds || [];
    }
  }

  const effectiveFranchiseIds = franchiseIds || (await getAccessibleFranchiseIds({ tenantId, businessPartnerId, tx, now }));
  const scope = await resolveAccessibleCenterScope({
    tenantId,
    businessPartnerId,
    franchiseIds: effectiveFranchiseIds,
    tx,
    now
  });

  return scope.ids;
}

async function resolveHierarchyNodeIdsFromRoots({ tenantId, rootIds, tx = prisma }) {
  const normalizedRoots = dedupeIds(rootIds);
  if (!tenantId || !normalizedRoots.length) {
    return [];
  }

  const visited = new Set(normalizedRoots);
  let frontier = [...normalizedRoots];
  let safety = 0;

  while (frontier.length && safety < 50) {
    // eslint-disable-next-line no-await-in-loop
    const children = await tx.hierarchyNode.findMany({
      where: {
        tenantId,
        parentId: { in: frontier }
      },
      select: { id: true }
    });

    const next = [];
    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        next.push(child.id);
      }
    }

    frontier = next;
    safety += 1;
  }

  return Array.from(visited);
}

async function resolveHierarchyNodeIdsForScope({
  tenantId,
  businessPartner,
  franchiseIds,
  centerIds,
  tx = prisma
} = {}) {
  const [franchiseRoots, centerRoots] = await Promise.all([
    franchiseIds?.length
      ? tx.franchiseProfile.findMany({
          where: {
            tenantId,
            id: { in: franchiseIds }
          },
          select: {
            authUser: {
              select: {
                hierarchyNodeId: true
              }
            }
          }
        })
      : [],
    centerIds?.length
      ? tx.centerProfile.findMany({
          where: {
            tenantId,
            id: { in: centerIds }
          },
          select: {
            authUser: {
              select: {
                hierarchyNodeId: true
              }
            }
          }
        })
      : []
  ]);

  const rootIds = dedupeIds([
    businessPartner?.hierarchyNodeId || null,
    ...franchiseRoots.map((row) => row.authUser?.hierarchyNodeId || null),
    ...centerRoots.map((row) => row.authUser?.hierarchyNodeId || null)
  ]);

  return resolveHierarchyNodeIdsFromRoots({ tenantId, rootIds, tx });
}

async function resolveBusinessPartnerScope({
  tenantId,
  userId,
  businessPartnerId,
  tx = prisma,
  forceRefresh = false,
  now = new Date()
} = {}) {
  if (!tenantId) {
    throw createHttpError(400, "tenantId is required", "TENANT_REQUIRED");
  }

  if (!userId && !businessPartnerId) {
    throw createHttpError(400, "userId or businessPartnerId is required", "BP_SCOPE_INPUT_REQUIRED");
  }

  let businessPartner = null;
  if (businessPartnerId) {
    businessPartner = await resolveBusinessPartnerById({ tenantId, businessPartnerId, tx, forceRefresh });
  } else {
    businessPartner = await resolveBusinessPartnerForUser({ tenantId, userId, tx, forceRefresh });
  }

  if (!businessPartner) {
    return null;
  }

  const scopeCacheKey = createCacheKey("bp-scope", tenantId, businessPartner.id);
  if (!forceRefresh && supportsCache(tx)) {
    const cached = getCacheValue(scopeCache, scopeCacheKey);
    if (cached.hit) {
      return {
        ...cached.value,
        meta: {
          ...(cached.value?.meta || {}),
          cacheHit: true
        }
      };
    }
  }

  const franchiseScope = await resolveAccessibleFranchiseScope({
    tenantId,
    businessPartnerId: businessPartner.id,
    tx,
    now
  });

  const centerScope = await resolveAccessibleCenterScope({
    tenantId,
    businessPartnerId: businessPartner.id,
    franchiseIds: franchiseScope.ids,
    tx,
    now
  });

  const hierarchyNodeIds = await resolveHierarchyNodeIdsForScope({
    tenantId,
    businessPartner,
    franchiseIds: franchiseScope.ids,
    centerIds: centerScope.ids,
    tx
  });

  const resolvedScope = {
    tenantId,
    businessPartner,
    franchiseIds: franchiseScope.ids,
    centerIds: centerScope.ids,
    hierarchyNodeIds,
    meta: {
      cacheHit: false,
      usedExplicitScopes: franchiseScope.meta.usedExplicitScopes || centerScope.meta.usedExplicitScopes,
      usedLegacyFallback: franchiseScope.meta.usedLegacyFallback || centerScope.meta.usedLegacyFallback
    }
  };

  if (supportsCache(tx)) {
    setCacheValue(scopeCache, scopeCacheKey, resolvedScope);
  }

  return cloneCacheValue(resolvedScope);
}

async function validateFranchiseAccess({
  tenantId,
  businessPartnerId,
  franchiseId,
  bpScope,
  tx = prisma,
  now = new Date()
} = {}) {
  if (!tenantId || !businessPartnerId || !franchiseId) {
    return false;
  }

  if (bpScope && (bpScope.tenantId !== tenantId || bpScope.businessPartner?.id !== businessPartnerId)) {
    return false;
  }

  const franchiseIds = bpScope?.franchiseIds || (await getAccessibleFranchiseIds({ tenantId, businessPartnerId, tx, now }));
  return dedupeIds(franchiseIds).includes(franchiseId);
}

function assertBusinessPartnerFranchiseAccess({ tenantId, bpScope, franchiseId } = {}) {
  if (!tenantId) {
    throw createHttpError(400, "tenantId is required", "TENANT_REQUIRED");
  }

  if (!bpScope || bpScope.tenantId !== tenantId || !bpScope.businessPartner?.id) {
    throw createHttpError(403, "Business partner scope not resolved", "BP_SCOPE_REQUIRED");
  }

  const normalizedFranchiseId = normalizeRequiredScopeId(franchiseId, "franchiseId");
  const scopedFranchiseIds = buildNormalizedIdSet(bpScope.franchiseIds);

  if (!scopedFranchiseIds.has(normalizedFranchiseId)) {
    throw createHttpError(404, "Franchise not found", "FRANCHISE_NOT_FOUND");
  }

  return normalizedFranchiseId;
}

async function validateCenterAccess({
  tenantId,
  businessPartnerId,
  centerId,
  bpScope,
  tx = prisma,
  now = new Date()
} = {}) {
  if (!tenantId || !businessPartnerId || !centerId) {
    return false;
  }

  if (bpScope && (bpScope.tenantId !== tenantId || bpScope.businessPartner?.id !== businessPartnerId)) {
    return false;
  }

  const centerIds = bpScope?.centerIds || (await getAccessibleCenterIds({ tenantId, businessPartnerId, tx, now }));
  return dedupeIds(centerIds).includes(centerId);
}

function invalidateBusinessPartnerScopeCache({ tenantId, businessPartnerId, userId } = {}) {
  for (const [key] of scopeCache) {
    if (!tenantId || key.startsWith(`bp-scope:${tenantId}:`)) {
      if (!businessPartnerId || key === createCacheKey("bp-scope", tenantId, businessPartnerId)) {
        scopeCache.delete(key);
      }
    }
  }

  for (const [key] of identityCache) {
    if (!tenantId || key.startsWith(`bp-identity:${tenantId}:`)) {
      if (!userId || key === createCacheKey("bp-identity", tenantId, userId)) {
        identityCache.delete(key);
      }
    }
  }
}

function clearBusinessPartnerScopeCache() {
  scopeCache.clear();
  identityCache.clear();
}

export {
  BP_SCOPE_CACHE_TTL_MS,
  clearBusinessPartnerScopeCache,
  getAccessibleCenterIds,
  getAccessibleFranchiseIds,
  invalidateBusinessPartnerScopeCache,
  resolveBusinessPartnerForUser,
  resolveBusinessPartnerScope,
  assertBusinessPartnerFranchiseAccess,
  validateCenterAccess,
  validateFranchiseAccess
};
