import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSettlementWorkflowClientCache,
  getSettlementWorkflowQueue,
  stableSerializeWorkflowValue
} from "../services/settlementWorkflowService";

const EMPTY_QUEUE = {
  items: [],
  limit: 20,
  offset: 0,
  total: 0,
  sortBy: "updatedAt",
  sortOrder: "desc"
};

function useSettlementWorkflowQueue(filters = {}, { enabled = true, refreshTick = 0 } = {}) {
  const [data, setData] = useState(EMPTY_QUEUE);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const requestKey = useMemo(
    () => ["settlement-workflow-queue", filters, refreshTick],
    [filters, refreshTick]
  );
  const stableKey = useMemo(() => stableSerializeWorkflowValue(requestKey), [requestKey]);
  const previousKeyRef = useRef(stableKey);

  useEffect(() => {
    if (!enabled) {
      previousKeyRef.current = stableKey;
      setData(EMPTY_QUEUE);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const didRequestKeyChange = previousKeyRef.current !== stableKey;
    previousKeyRef.current = stableKey;

    let isActive = true;
    const controller = new AbortController();

    if (didRequestKeyChange) {
      setData(EMPTY_QUEUE);
    }

    setLoading(true);
    setError(null);

    getSettlementWorkflowQueue(filters, { signal: controller.signal })
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
    clearSettlementWorkflowClientCache();
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
    retry,
    sortBy: data.sortBy,
    sortOrder: data.sortOrder,
    total: data.total
  };
}

export { useSettlementWorkflowQueue };