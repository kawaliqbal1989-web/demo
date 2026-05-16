import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearOperationalNotificationClientCache,
  getOperationalUnreadCounts,
  stableSerializeValue
} from "../services/operationalNotificationService";

const EMPTY_COUNTS = {
  totalUnread: 0,
  criticalUnread: 0,
  highUnread: 0,
  grouped: {
    bySeverity: {},
    byCategory: {}
  }
};

function useOperationalUnreadCounts(filters = {}, { enabled = true, pollIntervalMs = 0 } = {}) {
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const filtersKey = useMemo(() => stableSerializeValue(filters), [filters]);
  const intervalRef = useRef(null);

  const fetchCounts = useCallback(async (signal) => {
    if (!enabled) {
      setCounts(EMPTY_COUNTS);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getOperationalUnreadCounts(filters, { signal });
      setCounts(response);
    } catch (nextError) {
      if (signal?.aborted) {
        return;
      }
      setError(nextError);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [enabled, filters]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCounts(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchCounts, filtersKey, refreshTick]);

  useEffect(() => {
    if (!enabled || !pollIntervalMs || pollIntervalMs < 1000) {
      return undefined;
    }

    intervalRef.current = setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, pollIntervalMs);

    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [enabled, pollIntervalMs]);

  const refresh = useCallback(() => {
    clearOperationalNotificationClientCache();
    setRefreshTick((tick) => tick + 1);
  }, []);

  return {
    counts,
    error,
    hasCriticalUnread: counts.criticalUnread > 0,
    hasOperationalUnread: counts.totalUnread > 0,
    loading,
    refresh
  };
}

export { useOperationalUnreadCounts };