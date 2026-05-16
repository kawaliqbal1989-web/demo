import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getStudentGrowthTrend } from "../services/bp-dashboard.api";
import { getTrendMonths } from "../utils/filters";

function useStudentGrowthTrend(filters, { refreshTick = 0 } = {}) {
  const params = useMemo(
    () => ({
      asOf: filters.dateTo,
      months: getTrendMonths(filters)
    }),
    [filters]
  );

  const loader = useCallback(({ signal }) => getStudentGrowthTrend(params, { signal }), [params]);

  return useBpDashboardResource({
    enabled: Boolean(filters.dateTo),
    loader,
    requestKey: ["bp-dashboard-student-growth-trend", params, refreshTick]
  });
}

export { useStudentGrowthTrend };