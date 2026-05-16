import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getFranchiseRevenueTrend, stableSerializeDashboardValue } from "../services/bp-dashboard.api";
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

function useFranchiseRevenueTrend(
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
    ({ signal }) => getFranchiseRevenueTrend(franchiseId, params, { signal }),
    [franchiseId, params]
  );

  const resource = useBpDashboardResource({
    enabled: Boolean(franchiseId && filters?.dateTo),
    loader,
    requestKey: ["bp-franchise-revenue-trend", franchiseId, params, refreshTick]
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

export { useFranchiseRevenueTrend };