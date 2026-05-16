import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getFranchiseAlerts, stableSerializeDashboardValue } from "../services/bp-dashboard.api";
import {
  normalizeFranchiseAnalyticsParams,
  normalizeFranchiseQueryFilters
} from "../utils/filters";

const EMPTY_ALERTS = {
  meta: {
    generatedAt: null,
    source: null
  },
  summary: {
    totalAlerts: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0
  },
  items: []
};

function useFranchiseAlerts(franchiseId, filters = {}, { refreshTick = 0, requestFilters = {} } = {}) {
  const filtersKey = useMemo(() => stableSerializeDashboardValue(requestFilters), [requestFilters]);
  const normalizedRequestFilters = useMemo(
    () => normalizeFranchiseQueryFilters(requestFilters),
    [filtersKey]
  );

  const params = useMemo(
    () =>
      normalizeFranchiseAnalyticsParams(
        {
          asOf: filters?.dateTo,
          filters: normalizedRequestFilters
        },
        {
          includeAsOf: true,
          includeFilters: true
        }
      ),
    [filters?.dateTo, normalizedRequestFilters]
  );

  const loader = useCallback(({ signal }) => getFranchiseAlerts(franchiseId, params, { signal }), [franchiseId, params]);

  const resource = useBpDashboardResource({
    enabled: Boolean(franchiseId && filters?.dateTo),
    loader,
    requestKey: ["bp-franchise-alerts", franchiseId, params, refreshTick]
  });

  const data = resource.data || EMPTY_ALERTS;
  const isEmpty = !resource.loading && !resource.error && data.items.length === 0;

  return {
    ...resource,
    data,
    isEmpty,
    items: data.items,
    meta: data.meta,
    summary: data.summary
  };
}

export { useFranchiseAlerts };