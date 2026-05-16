import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSettlementWorkflowClientCache,
  getSettlementWorkflowSummary,
  stableSerializeWorkflowValue
} from "../services/settlementWorkflowService";

const EMPTY_SUMMARY = {
  pendingReviewCount: 0,
  approvalQueueCount: 0,
  overdueCount: 0,
  escalationCount: 0,
  payoutPendingCount: 0
};

function useSettlementWorkflowSummary({ enabled = true, refreshTick = 0 } = {}) {
  const [data, setData] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestKey = useMemo(
    () => ["settlement-workflow-summary", refreshTick],
    [refreshTick]
  );
  const stableKey = useMemo(() => stableSerializeWorkflowValue(requestKey), [requestKey]);
  const previousKeyRef = useRef(stableKey);

  useEffect(() => {
    if (!enabled) {
      previousKeyRef.current = stableKey;
      setData(EMPTY_SUMMARY);
      setLoading(false);
      setError(null);
      return undefined;
    }

    previousKeyRef.current = stableKey;

    let isActive = true;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    getSettlementWorkflowSummary({ signal: controller.signal })
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
  }, [enabled, retryCount, stableKey]);

  const retry = useCallback(() => {
    clearSettlementWorkflowClientCache();
    setRetryCount((count) => count + 1);
  }, []);

  return {
    counts: data,
    error,
    loading,
    retry
  };
}

export { useSettlementWorkflowSummary };