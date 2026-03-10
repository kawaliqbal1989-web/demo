import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getKpis, recordDashboardAction } from "../../../services/superadminService";

const SuperadminDashboardContext = createContext(null);

function SuperadminDashboardProvider({ children, refreshIntervalMs = 30000, historyLimit = 40 }) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const abortRef = useRef(null);
  const requestSeqRef = useRef(0);

  const appendHistory = useCallback(
    (payload) => {
      const point = {
        asOf: payload?.asOf || new Date().toISOString(),
        metrics: payload?.metrics || {}
      };

      setHistory((prev) => {
        const next = [...prev, point];
        if (next.length > historyLimit) {
          return next.slice(next.length - historyLimit);
        }
        return next;
      });
    },
    [historyLimit]
  );

  const fetchKpis = useCallback(
    async ({ reason = "manual" } = {}) => {
      requestSeqRef.current += 1;
      const requestId = requestSeqRef.current;

      abortRef.current?.abort?.();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const response = await getKpis({ signal: controller.signal });
        if (requestId !== requestSeqRef.current) {
          return;
        }
        const payload = response?.data;
        setData(payload);
        appendHistory(payload);
        setLastUpdatedAt(new Date());

        // Best-effort audit of dashboard usage.
        void recordDashboardAction({
          actionType: "KPI_REFRESH",
          metadata: { reason }
        }).catch(() => {});
      } catch (e) {
        if (e?.name === "CanceledError" || e?.name === "AbortError") {
          return;
        }

        if (requestId !== requestSeqRef.current) {
          return;
        }
        setError(e);
      } finally {
        if (requestId === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [appendHistory]
  );

  useEffect(() => {
    void fetchKpis({ reason: "mount" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void fetchKpis({ reason: "interval" });
    };

    const id = window.setInterval(tick, refreshIntervalMs);
    return () => window.clearInterval(id);
  }, [fetchKpis, refreshIntervalMs]);

  useEffect(() => {
    return () => abortRef.current?.abort?.();
  }, []);

  const value = useMemo(
    () => ({
      data,
      history,
      loading,
      error,
      lastUpdatedAt,
      fetchKpis
    }),
    [data, history, loading, error, lastUpdatedAt, fetchKpis]
  );

  return <SuperadminDashboardContext.Provider value={value}>{children}</SuperadminDashboardContext.Provider>;
}

export { SuperadminDashboardContext, SuperadminDashboardProvider };
