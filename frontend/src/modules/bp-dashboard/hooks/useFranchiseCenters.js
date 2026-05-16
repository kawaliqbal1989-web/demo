import { useCallback, useMemo } from "react";
import { useBpDashboardResource } from "./useBpDashboardResource";
import { getFranchiseCenters, stableSerializeDashboardValue } from "../services/bp-dashboard.api";
import {
  normalizeFranchiseAnalyticsParams,
  normalizeFranchiseQueryFilters
} from "../utils/filters";

const EMPTY_CENTERS = {
  meta: {
    generatedAt: null,
    source: null
  },
  items: [],
  pagination: {
    limit: 0,
    offset: 0,
    total: 0,
    returned: 0
  },
  sort: {
    sortBy: null,
    sortDirection: "desc"
  }
};

function useFranchiseCenters(
  franchiseId,
  filters = {},
  tableState = {},
  { refreshTick = 0, requestFilters = {} } = {}
) {
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
          limit: tableState?.limit,
          offset: tableState?.offset,
          sortBy: tableState?.sortBy,
          sortDirection: tableState?.sortDirection || tableState?.sortOrder,
          filters: normalizedRequestFilters
        },
        {
          includeAsOf: true,
          includePagination: true,
          includeSorting: true,
          includeFilters: true
        }
      ),
    [filters?.dateTo, normalizedRequestFilters, tableState?.limit, tableState?.offset, tableState?.sortBy, tableState?.sortDirection, tableState?.sortOrder]
  );

  const loader = useCallback(({ signal }) => getFranchiseCenters(franchiseId, params, { signal }), [franchiseId, params]);

  const resource = useBpDashboardResource({
    enabled: Boolean(franchiseId && filters?.dateTo),
    loader,
    requestKey: ["bp-franchise-centers", franchiseId, params, refreshTick]
  });

  const data = resource.data || EMPTY_CENTERS;
  const isEmpty = !resource.loading && !resource.error && data.items.length === 0;

  return {
    ...resource,
    data,
    isEmpty,
    items: data.items,
    meta: data.meta,
    pagination: data.pagination,
    sort: data.sort
  };
}

export { useFranchiseCenters };