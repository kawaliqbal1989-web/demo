const BP_SCOPE_IMPOSSIBLE_TOKEN = "__NO_BP_SCOPE__";

function normalizeScopeIds(ids) {
  return Array.from(
    new Set(
      (Array.isArray(ids) ? ids : []).filter(
        (value) => typeof value === "string" && value.trim().length && value !== BP_SCOPE_IMPOSSIBLE_TOKEN
      )
    )
  );
}

function getImpossibleBpScopeIds() {
  return [BP_SCOPE_IMPOSSIBLE_TOKEN];
}

function toBpScopeIdsOrImpossible(ids) {
  const normalized = normalizeScopeIds(ids);
  return normalized.length ? normalized : getImpossibleBpScopeIds();
}

function mergePrismaWhere(...clauses) {
  const normalizedClauses = clauses.filter((clause) => clause && Object.keys(clause).length > 0);
  if (!normalizedClauses.length) {
    return {};
  }

  if (normalizedClauses.length === 1) {
    return normalizedClauses[0];
  }

  return { AND: normalizedClauses };
}

function createTenantClause(tenantId) {
  return {
    tenantId: tenantId || BP_SCOPE_IMPOSSIBLE_TOKEN
  };
}

function createFranchiseScopeClause(bpScope) {
  const franchiseIds = normalizeScopeIds(bpScope?.franchiseIds);
  const hierarchyNodeIds = normalizeScopeIds(bpScope?.hierarchyNodeIds);
  const orClauses = [];

  if (franchiseIds.length) {
    orClauses.push({ id: { in: franchiseIds } });
  }

  if (hierarchyNodeIds.length) {
    orClauses.push({
      authUser: {
        is: {
          hierarchyNodeId: { in: hierarchyNodeIds }
        }
      }
    });
  }

  if (!orClauses.length) {
    return { id: { in: getImpossibleBpScopeIds() } };
  }

  return orClauses.length === 1 ? orClauses[0] : { OR: orClauses };
}

function createCenterScopeClause(bpScope) {
  const centerIds = normalizeScopeIds(bpScope?.centerIds);
  const franchiseIds = normalizeScopeIds(bpScope?.franchiseIds);
  const hierarchyNodeIds = normalizeScopeIds(bpScope?.hierarchyNodeIds);
  const orClauses = [];

  if (centerIds.length) {
    orClauses.push({ id: { in: centerIds } });
  }

  if (franchiseIds.length) {
    orClauses.push({ franchiseProfileId: { in: franchiseIds } });
  }

  if (hierarchyNodeIds.length) {
    orClauses.push({
      authUser: {
        is: {
          hierarchyNodeId: { in: hierarchyNodeIds }
        }
      }
    });
  }

  if (!orClauses.length) {
    return { id: { in: getImpossibleBpScopeIds() } };
  }

  return orClauses.length === 1 ? orClauses[0] : { OR: orClauses };
}

function createStudentScopeClause(bpScope) {
  const hierarchyNodeIds = normalizeScopeIds(bpScope?.hierarchyNodeIds);
  if (!hierarchyNodeIds.length) {
    return { id: { in: getImpossibleBpScopeIds() } };
  }

  return {
    hierarchyNodeId: { in: hierarchyNodeIds }
  };
}

function createTeacherScopeClause(bpScope) {
  const hierarchyNodeIds = normalizeScopeIds(bpScope?.hierarchyNodeIds);
  if (!hierarchyNodeIds.length) {
    return { id: { in: getImpossibleBpScopeIds() } };
  }

  return {
    hierarchyNodeId: { in: hierarchyNodeIds }
  };
}

function applyBpScopeToFranchiseQuery({ tenantId, bpScope, where = {} } = {}) {
  return mergePrismaWhere(createTenantClause(tenantId), createFranchiseScopeClause(bpScope), where);
}

function applyBpScopeToCenterQuery({ tenantId, bpScope, where = {} } = {}) {
  return mergePrismaWhere(createTenantClause(tenantId), createCenterScopeClause(bpScope), where);
}

function applyBpScopeToStudentQuery({ tenantId, bpScope, where = {} } = {}) {
  return mergePrismaWhere(createTenantClause(tenantId), createStudentScopeClause(bpScope), where);
}

function applyBpScopeToTeacherQuery({ tenantId, bpScope, where = {} } = {}) {
  return mergePrismaWhere(createTenantClause(tenantId), createTeacherScopeClause(bpScope), where);
}

export {
  BP_SCOPE_IMPOSSIBLE_TOKEN,
  applyBpScopeToCenterQuery,
  applyBpScopeToFranchiseQuery,
  applyBpScopeToStudentQuery,
  applyBpScopeToTeacherQuery,
  getImpossibleBpScopeIds,
  mergePrismaWhere,
  normalizeScopeIds,
  toBpScopeIdsOrImpossible
};