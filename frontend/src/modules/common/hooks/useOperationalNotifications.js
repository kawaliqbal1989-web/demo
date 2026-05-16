import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearOperationalNotificationClientCache,
  getOperationalNotifications,
  stableSerializeValue
} from "../services/operationalNotificationService";

const EMPTY_DATA = {
  page: 1,
  limit: 20,
  offset: 0,
  total: 0,
  unreadCount: 0,
  items: []
};

function useOperationalNotifications(filters = {}, { enabled = true, refreshTick = 0 } = {}) {
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestKey = useMemo(
    () => ["operational-notifications", filters, refreshTick],
    [filters, refreshTick]
  );
  const stableKey = useMemo(() => stableSerializeValue(requestKey), [requestKey]);
  const previousKeyRef = useRef(stableKey);

  useEffect(() => {
    if (!enabled) {
      previousKeyRef.current = stableKey;
      setData(EMPTY_DATA);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const didRequestKeyChange = previousKeyRef.current !== stableKey;
    previousKeyRef.current = stableKey;

    let isActive = true;
    const controller = new AbortController();

    if (didRequestKeyChange) {
      setData(EMPTY_DATA);
    }

    setLoading(true);
    setError(null);

    getOperationalNotifications(filters, { signal: controller.signal })
      .then((response) => {
        if (!isActive) {
          return;
        }

        setData(response);
      })
      .catch((nextError) => {
        if (!isActive || controller.signal.aborted) {
          return;
        }

        setError(nextError);
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [enabled, filters, retryCount, stableKey]);

  const retry = useCallback(() => {
    clearOperationalNotificationClientCache();
    setRetryCount((count) => count + 1);
  }, []);

  return {
    data,
    error,
    hasData: data.items.length > 0,
    hasMore: data.offset + data.items.length < data.total,
    items: data.items,
    limit: data.limit,
    loading,
    offset: data.offset,
    page: data.page,
    retry,
    total: data.total,
    unreadCount: data.unreadCount
  };
}

export { useOperationalNotifications };