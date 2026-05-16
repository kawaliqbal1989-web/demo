import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSettlementWorkflowClientCache,
  getSettlementWorkflowDetail,
  stableSerializeWorkflowValue
} from "../services/settlementWorkflowService";

const EMPTY_DETAIL = {
  settlement: null,
  workflow: {
    status: null,
    workflowVersion: null,
    currentActionRole: null,
    allowedActions: [],
    canUploadSupportingRecord: false
  },
  history: [],
  tasks: [],
  escalations: [],
  supportingRecords: []
};

function useSettlementWorkflowDetail(settlementId, { enabled = true, refreshTick = 0 } = {}) {
  const [data, setData] = useState(EMPTY_DETAIL);
  const [loading, setLoading] = useState(Boolean(enabled && settlementId));
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestKey = useMemo(
    () => ["settlement-workflow-detail", settlementId, refreshTick],
    [settlementId, refreshTick]
  );
  const stableKey = useMemo(() => stableSerializeWorkflowValue(requestKey), [requestKey]);
  const previousKeyRef = useRef(stableKey);

  useEffect(() => {
    if (!enabled || !settlementId) {
      previousKeyRef.current = stableKey;
      setData(EMPTY_DETAIL);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const didRequestKeyChange = previousKeyRef.current !== stableKey;
    previousKeyRef.current = stableKey;

    let isActive = true;
    const controller = new AbortController();

    if (didRequestKeyChange) {
      setData(EMPTY_DETAIL);
    }

    setLoading(true);
    setError(null);

    getSettlementWorkflowDetail(settlementId, { signal: controller.signal })
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
  }, [enabled, retryCount, settlementId, stableKey]);

  const retry = useCallback(() => {
    clearSettlementWorkflowClientCache();
    setRetryCount((count) => count + 1);
  }, []);

  return {
    data,
    error,
    escalations: data.escalations,
    hasData: Boolean(data.settlement),
    history: data.history,
    loading,
    retry,
    settlement: data.settlement,
    supportingRecords: data.supportingRecords,
    tasks: data.tasks,
    workflow: data.workflow
  };
}

export { useSettlementWorkflowDetail };