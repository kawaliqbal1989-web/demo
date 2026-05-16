import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getDashboardOverview } from "../services/bp-dashboard.api";

function useDashboardOverview(filters, { refreshTick = 0 } = {}) {
  const params = useMemo(
    () => ({
      asOf: filters.dateTo
    }),
    [filters.dateTo]
  );

  const loader = useCallback(({ signal }) => getDashboardOverview(params, { signal }), [params]);

  return useBpDashboardResource({
    enabled: Boolean(filters.dateTo),
    loader,
    requestKey: ["bp-dashboard-overview", params, refreshTick]
  });
}

export { useDashboardOverview };