import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getRevenueTrend } from "../services/bp-dashboard.api";
import { getTrendMonths } from "../utils/filters";

function useRevenueTrend(filters, { refreshTick = 0 } = {}) {
  const params = useMemo(
    () => ({
      asOf: filters.dateTo,
      months: getTrendMonths(filters)
    }),
    [filters]
  );

  const loader = useCallback(({ signal }) => getRevenueTrend(params, { signal }), [params]);

  return useBpDashboardResource({
    enabled: Boolean(filters.dateTo),
    loader,
    requestKey: ["bp-dashboard-revenue-trend", params, refreshTick]
  });
}

export { useRevenueTrend };