import { useEffect, useMemo, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { MetricCard } from "../../components/MetricCard";
import { useAuth } from "../../hooks/useAuth";
import { getDashboardSummary, getHealthMetrics } from "../../services/reportsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "0";
  }
  return new Intl.NumberFormat(undefined).format(num);
}

function formatCurrencyInr(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "₹0";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(num);
}

function formatPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "0%";
  }
  return `${Math.round(num * 100)}%`;
}

function ReportsPage() {
  const { capabilities } = useAuth();
  const canViewReports = Boolean(capabilities?.canViewReports);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState(null);

  const params = useMemo(() => {
    return {
      ...(from ? { from } : {}),
      ...(to ? { to } : {})
    };
  }, [from, to]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [s, h] = await Promise.all([getDashboardSummary(params), getHealthMetrics(params)]);
      setSummary(s?.data || null);
      setHealth(h?.data || null);
    } catch (e) {
      setError(getFriendlyErrorMessage(e) || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewReports) {
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewReports]);

  if (!canViewReports) {
    return <ErrorState title="Access restricted" message="Reports are not available for your account." />;
  }

  if (loading && !summary) {
    return <LoadingState label="Loading reports..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Reports</h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Operational summary and system health metrics.
        </p>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>From (YYYY-MM-DD)</div>
            <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2026-02-01" />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>To (YYYY-MM-DD)</div>
            <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="2026-02-28" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="button" style={{ width: "auto" }} onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </button>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            disabled={loading}
          >
            Reset
          </button>
        </div>

        {error ? <p className="error" style={{ margin: 0 }}>{error}</p> : null}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <MetricCard label="Total Revenue" value={formatCurrencyInr(summary?.totalRevenue)} sublabel="In selected range" />
        <MetricCard label="Active Students" value={formatNumber(summary?.activeStudents)} />
        <MetricCard label="Active Centers" value={formatNumber(summary?.activeCenters)} />
        <MetricCard label="Courses (Active)" value={formatNumber(summary?.coursesCount)} />
        <MetricCard label="Worksheets" value={formatNumber(summary?.worksheetsCount)} />
        <MetricCard label="Worksheet Questions" value={formatNumber(summary?.worksheetQuestionsCount)} />
        <MetricCard label="Business Partners" value={formatNumber(summary?.totalBusinessPartners)} />
        <MetricCard label="Expired Subscriptions" value={formatNumber(health?.expiredSubscriptions)} />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ marginTop: 0 }}>Health Metrics</h3>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <MetricCard label="Competition Rejection Rate" value={formatPercent(health?.competitionRejectionRate)} />
          <MetricCard label="Average Promotion Rate" value={formatPercent(health?.averagePromotionRate)} />
        </div>
      </div>
    </section>
  );
}

export { ReportsPage };
