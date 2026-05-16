import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedValue } from "./useDebouncedValue";
import {
  buildDashboardSearchParams,
  getDefaultDateRange,
  normalizeDashboardFilters,
  parseDashboardSearchParams
} from "../utils/filters";

function useDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParamsValue = searchParams.toString();
  const [draftFilters, setDraftFilters] = useState(() => parseDashboardSearchParams(searchParams));
  const debouncedFilters = useDebouncedValue(draftFilters, 250);

  useEffect(() => {
    setDraftFilters(parseDashboardSearchParams(searchParams));
  }, [searchParamsValue]);

  useEffect(() => {
    const nextParams = buildDashboardSearchParams(debouncedFilters);
    const current = searchParamsValue;
    const next = nextParams.toString();
    if (current !== next) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [debouncedFilters, searchParamsValue, setSearchParams]);

  const appliedFilters = useMemo(() => normalizeDashboardFilters(debouncedFilters), [debouncedFilters]);

  const updateFilter = useCallback((key, value) => {
    setDraftFilters((current) => normalizeDashboardFilters({
      ...current,
      [key]: value
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setDraftFilters(getDefaultDateRange());
  }, []);

  return {
    appliedFilters,
    draftFilters,
    resetFilters,
    updateFilter
  };
}

export { useDashboardFilters };