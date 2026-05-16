import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearBpDashboardClientCache,
  stableSerializeDashboardValue
} from "../services/bp-dashboard.api";

function useBpDashboardResource({ requestKey, loader, enabled = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const stableKey = useMemo(() => stableSerializeDashboardValue(requestKey), [requestKey]);
  const previousKeyRef = useRef(stableKey);

  useEffect(() => {
    if (!enabled) {
      previousKeyRef.current = stableKey;
      setData(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    const didRequestKeyChange = previousKeyRef.current !== stableKey;
    previousKeyRef.current = stableKey;

    let isActive = true;
    const controller = new AbortController();

    if (didRequestKeyChange) {
      setData(null);
    }

    setLoading(true);
    setError(null);

    loader({ signal: controller.signal })
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
  }, [enabled, loader, retryCount, stableKey]);

  const retry = useCallback(() => {
    clearBpDashboardClientCache();
    setRetryCount((count) => count + 1);
  }, []);

  return {
    data,
    error,
    hasData: data !== null,
    loading,
    retry
  };
}

export { useBpDashboardResource };