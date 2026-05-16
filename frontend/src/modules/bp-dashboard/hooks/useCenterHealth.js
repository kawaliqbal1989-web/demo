import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getCenterHealth } from "../services/bp-dashboard.api";

function useCenterHealth(filters, tableState, { refreshTick = 0 } = {}) {
  const params = useMemo(
    () => ({
      asOf: filters.dateTo,
      franchiseId: filters.franchiseId || undefined,
      limit: filters.centerId ? 100 : tableState.limit,
      offset: filters.centerId ? 0 : tableState.offset,
      sortBy: tableState.sortBy,
      sortDirection: tableState.sortDirection
    }),
    [filters.centerId, filters.dateTo, filters.franchiseId, tableState.limit, tableState.offset, tableState.sortBy, tableState.sortDirection]
  );

  const loader = useCallback(({ signal }) => getCenterHealth(params, { signal }), [params]);

  return useBpDashboardResource({
    enabled: Boolean(filters.dateTo),
    loader,
    requestKey: ["bp-dashboard-center-health", params, refreshTick]
  });
}

export { useCenterHealth };