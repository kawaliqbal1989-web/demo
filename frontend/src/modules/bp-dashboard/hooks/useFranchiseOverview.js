import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getFranchiseOverview } from "../services/bp-dashboard.api";
import {
  normalizeFranchiseAnalyticsParams,
  normalizeFranchiseQueryFilters
} from "../utils/filters";
import { stableSerializeDashboardValue } from "../services/bp-dashboard.api";

const EMPTY_OVERVIEW = {
  meta: {
    generatedAt: null,
    source: null
  },
  kpis: {}
};

function useFranchiseOverview(franchiseId, filters = {}, { refreshTick = 0, requestFilters = {} } = {}) {
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

  const loader = useCallback(({ signal }) => getFranchiseOverview(franchiseId, params, { signal }), [franchiseId, params]);

  const resource = useBpDashboardResource({
    enabled: Boolean(franchiseId && filters?.dateTo),
    loader,
    requestKey: ["bp-franchise-overview", franchiseId, params, refreshTick]
  });

  const data = resource.data || EMPTY_OVERVIEW;
  const isEmpty = !resource.loading && !resource.error && Object.keys(data.kpis).length === 0;

  return {
    ...resource,
    data,
    isEmpty,
    kpis: data.kpis,
    meta: data.meta
  };
}

export { useFranchiseOverview };