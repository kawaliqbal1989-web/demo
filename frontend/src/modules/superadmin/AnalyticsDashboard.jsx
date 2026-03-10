import { lazy, Suspense, useContext } from "react";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import {
  SuperadminDashboardContext,
  SuperadminDashboardProvider
} from "./dashboard/SuperadminDashboardContext";

const DashboardCharts = lazy(() => import("./dashboard/DashboardCharts"));

function AnalyticsDashboardInner() {
  const { data, history, loading, error, lastUpdatedAt, fetchKpis } = useContext(SuperadminDashboardContext);

  if (loading && !data) {
    return <LoadingState label="Loading analytics..." />;
  }

  if (error && !data) {
    const message = error?.response?.data?.message || error?.message || "Failed to load analytics.";
    return <ErrorState title="Analytics unavailable" message={message} onRetry={() => fetchKpis({ reason: "retry" })} />;
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Analytics</h2>
          <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
            Trend analysis for key metrics and system health.
          </p>
          {lastUpdatedAt ? (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>
              Last updated: {lastUpdatedAt.toLocaleTimeString()}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="button secondary"
          style={{ width: "auto" }}
          onClick={() => fetchKpis({ reason: "manual" })}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <Suspense fallback={<div className="card">Loading charts...</div>}>
        <DashboardCharts data={data} history={history} />
      </Suspense>
    </section>
  );
}

function AnalyticsDashboard() {
  return (
    <SuperadminDashboardProvider>
      <AnalyticsDashboardInner />
    </SuperadminDashboardProvider>
  );
}

export { AnalyticsDashboard };
