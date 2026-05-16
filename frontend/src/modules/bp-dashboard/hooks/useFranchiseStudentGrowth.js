import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getFranchiseStudentGrowth, stableSerializeDashboardValue } from "../services/bp-dashboard.api";
import {
  getTrendMonths,
  normalizeFranchiseAnalyticsParams,
  normalizeFranchiseQueryFilters
} from "../utils/filters";

const EMPTY_TREND = {
  meta: {
    generatedAt: null,
    source: null
  },
  series: [],
  summary: {}
};

function useFranchiseStudentGrowth(
  franchiseId,
  filters = {},
  { months, refreshTick = 0, requestFilters = {} } = {}
) {
  const filtersKey = useMemo(() => stableSerializeDashboardValue(requestFilters), [requestFilters]);
  const normalizedRequestFilters = useMemo(
    () => normalizeFranchiseQueryFilters(requestFilters),
    [filtersKey]
  );
  const resolvedMonths = useMemo(
    () => months ?? getTrendMonths(filters || {}),
    [filters, months]
  );

  const params = useMemo(
    () =>
      normalizeFranchiseAnalyticsParams(
        {
          asOf: filters?.dateTo,
          months: resolvedMonths,
          filters: normalizedRequestFilters
        },
        {
          includeAsOf: true,
          includeMonths: true,
          includeFilters: true,
          defaultMonths: resolvedMonths
        }
      ),
    [filters?.dateTo, normalizedRequestFilters, resolvedMonths]
  );

  const loader = useCallback(
    ({ signal }) => getFranchiseStudentGrowth(franchiseId, params, { signal }),
    [franchiseId, params]
  );

  const resource = useBpDashboardResource({
    enabled: Boolean(franchiseId && filters?.dateTo),
    loader,
    requestKey: ["bp-franchise-student-growth", franchiseId, params, refreshTick]
  });

  const data = resource.data || EMPTY_TREND;
  const isEmpty = !resource.loading && !resource.error && data.series.length === 0;

  return {
    ...resource,
    data,
    isEmpty,
    meta: data.meta,
    series: data.series,
    summary: data.summary
  };
}

export { useFranchiseStudentGrowth };