import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getFranchiseRanking } from "../services/bp-dashboard.api";

function useFranchiseRanking(filters, tableState, { refreshTick = 0 } = {}) {
  const params = useMemo(
    () => ({
      asOf: filters.dateTo,
      limit: filters.franchiseId ? 100 : tableState.limit,
      offset: filters.franchiseId ? 0 : tableState.offset,
      sortBy: tableState.sortBy,
      sortDirection: tableState.sortDirection
    }),
    [filters.dateTo, filters.franchiseId, tableState.limit, tableState.offset, tableState.sortBy, tableState.sortDirection]
  );

  const loader = useCallback(({ signal }) => getFranchiseRanking(params, { signal }), [params]);

  return useBpDashboardResource({
    enabled: Boolean(filters.dateTo),
    loader,
    requestKey: ["bp-dashboard-franchise-ranking", params, refreshTick]
  });
}

export { useFranchiseRanking };