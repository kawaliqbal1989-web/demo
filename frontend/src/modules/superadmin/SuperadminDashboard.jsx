import { Suspense, lazy, useContext, useEffect, useMemo, useState } from "react";
import { MetricCard } from "../../components/MetricCard";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { ErrorState } from "../../components/ErrorState";
import { PageHeader } from "../../components/PageHeader";
import { InsightPanel } from "../../components/InsightCard";
import { NetworkPulseCard, CenterRanking } from "../../components/LeadershipIntel";
import { AutomationPanel } from "../../components/NotificationWidgets";
import { getInsights } from "../../services/insightsService";
import { getSuperadminNetworkPulse } from "../../services/leadershipIntelService";
import { useAuth } from "../../hooks/useAuth";
import { createBusinessPartner } from "../../services/businessPartnersService";
import { recordDashboardAction } from "../../services/superadminService";
import { SuperadminDashboardProvider, SuperadminDashboardContext } from "./dashboard/SuperadminDashboardContext";
import { CommandCenterAi } from "../../components/AiNarrativeSurfaces";
import { ReleaseWaveSummary } from "../../components/ReleaseManagement";

const DashboardCharts = lazy(() => import("./dashboard/DashboardCharts"));

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

function getApiErrorMessage(error) {
  const status = error?.response?.status;
  const message = error?.response?.data?.message || error?.message;
  if (status) {
    return `(${status}) ${message || "Request failed"}`;
  }
  return message || "Request failed";
}

function CreateBusinessPartnerModal({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [trialDays, setTrialDays] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim());
  const daysValue = Number(trialDays);
  const trialOk = Number.isFinite(daysValue) && daysValue >= 1;
  const canSubmit = name.trim() && emailOk && adminPassword && trialOk;

  if (!open) {
    return null;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim() || !contactEmail.trim() || !adminPassword) {
      setError("Please fill name, email, and password.");
      return;
    }

    if (!emailOk) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!trialOk) {
      setError("Trial days must be 1 or more.");
      return;
    }

    const days = Math.max(1, Number(trialDays) || 30);

    setSubmitting(true);
    try {
      const result = await createBusinessPartner({
        name: name.trim(),
        contactEmail: contactEmail.trim(),
        adminPassword,
        trialDays: days
      });

      setSuccess(`Created. Admin username: ${result?.data?.adminUser?.username || "(generated)"}`);
      void recordDashboardAction({
        actionType: "CREATE_BUSINESS_PARTNER",
        metadata: { ok: true }
      }).catch(() => {});

      onCreated?.(result);
    } catch (e) {
      setError(getApiErrorMessage(e));
      void recordDashboardAction({
        actionType: "CREATE_BUSINESS_PARTNER",
        metadata: { ok: false }
      }).catch(() => {});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dash-modal" role="dialog" aria-modal="true" aria-label="Create Business Partner">
      <div className="card dash-modal__panel">
        <div className="dash-modal__header">
          <h3 style={{ margin: 0 }}>Create Business Partner</h3>
          <button type="button" className="button secondary" style={{ width: "auto" }} onClick={onClose}>
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Contact Email</span>
            <input
              className="input"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              type="email"
              inputMode="email"
              autoComplete="email"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Admin Temporary Password</span>
            <input
              className="input"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Trial Days</span>
            <input
              className="input"
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
              type="number"
              min={1}
            />
          </label>

          {error ? (
            <div className="error" role="alert" aria-live="assertive">
              {error}
            </div>
          ) : null}

          {success ? (
            <div role="status" aria-live="polite" style={{ color: "var(--color-text-success)", fontSize: 14 }}>
              {success}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button type="submit" className="button" style={{ width: "auto" }} disabled={!canSubmit || submitting}>
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SuperadminDashboardInner() {
  const { capabilities } = useAuth();
  const { data, history, loading, error, lastUpdatedAt, fetchKpis } = useContext(SuperadminDashboardContext);
  const [createOpen, setCreateOpen] = useState(false);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [networkPulse, setNetworkPulse] = useState(null);
  const [networkPulseLoading, setNetworkPulseLoading] = useState(true);

  useEffect(() => {
    setInsightsLoading(true);
    getInsights()
      .then((res) => setInsights(res.data?.insights || []))
      .catch(() => {})
      .finally(() => setInsightsLoading(false));

    setNetworkPulseLoading(true);
    getSuperadminNetworkPulse()
      .then((res) => setNetworkPulse(res.data || null))
      .catch(() => {})
      .finally(() => setNetworkPulseLoading(false));
  }, []);

  const canView = capabilities ? Boolean(capabilities?.canViewDashboard) : true;
  const canCreatePartner = Boolean(capabilities?.canCreateBusinessPartner);

  const metrics = data?.metrics || null;

  const previous = useMemo(() => {
    if (history.length < 2) {
      return null;
    }
    return history[history.length - 2]?.metrics || null;
  }, [history]);

  const getDelta = (key) => {
    if (!previous || !metrics) {
      return null;
    }
    const a = Number(previous?.[key]);
    const b = Number(metrics?.[key]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      return null;
    }
    const diff = b - a;
    if (!diff) {
      return "No change";
    }
    return diff > 0 ? `+${formatNumber(diff)} vs prev` : `${formatNumber(diff)} vs prev`;
  };

  if (!canView) {
    return <ErrorState title="Access restricted" message="Dashboard is not available for your account." />;
  }

  return (
    <div className="superadmin-dashboard">
      <PageHeader
        title="Dashboard"
        subtitle={lastUpdatedAt ? `Last updated: ${lastUpdatedAt.toLocaleTimeString()}` : ""}
        actions={
          <button
            type="button"
            className="button secondary"
            style={{ width: "auto" }}
            onClick={() => fetchKpis({ reason: "manual" })}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        }
      />

      {error && !data ? (
        <ErrorState
          title="Failed to load KPIs"
          message={getApiErrorMessage(error)}
          onRetry={() => fetchKpis({ reason: "retry" })}
          retryLabel="Retry"
        />
      ) : null}

      <InsightPanel
        insights={insights}
        loading={insightsLoading}
        onDismiss={(id) => setInsights((prev) => prev.filter((i) => i.id !== id))}
      />

      <CommandCenterAi />

      <div className="intel-grid">
        <NetworkPulseCard data={networkPulse} loading={networkPulseLoading} roleLabel="Platform" />
        <CenterRanking
          topCenters={networkPulse?.topCenters}
          bottomCenters={networkPulse?.bottomCenters}
          loading={networkPulseLoading}
        />
      </div>

      <AutomationPanel />

      <ReleaseWaveSummary />

      <section aria-label="KPI Statistics" className="dash-section">
        <h2 style={{ marginTop: 0 }}>KPI Statistics</h2>
        <div className="dash-kpi-grid" role="list">
          {!metrics && loading ? (
            <SkeletonLoader variant="card" count={8} />
          ) : (
            <>
              <MetricCard
                label="Active Business Partners"
                value={formatNumber(metrics?.activeBusinessPartners)}
                sublabel={getDelta("activeBusinessPartners")}
                icon="🏢"
                accent="var(--role-superadmin)"
              />
              <MetricCard
                label="Active Students"
                value={formatNumber(metrics?.activeStudents)}
                sublabel={getDelta("activeStudents")}
                icon="👥"
              />
              <MetricCard
                label="Active Center Users"
                value={formatNumber(metrics?.activeCenterUsers)}
                sublabel={getDelta("activeCenterUsers")}
                icon="🏫"
              />
              <MetricCard
                label="Active Franchise Users"
                value={formatNumber(metrics?.activeFranchiseUsers)}
                sublabel={getDelta("activeFranchiseUsers")}
                icon="🏢"
              />
              <MetricCard
                label="Active Competitions"
                value={formatNumber(metrics?.activeCompetitions)}
                sublabel={getDelta("activeCompetitions")}
                icon="🏆"
              />
              <MetricCard
                label="Pending Competition Approvals"
                value={formatNumber(metrics?.pendingCompetitionApprovals)}
                sublabel={getDelta("pendingCompetitionApprovals")}
                icon="⏳"
                accent="#d97706"
              />
              <MetricCard
                label="Open Abuse Flags"
                value={formatNumber(metrics?.openAbuseFlags)}
                sublabel={getDelta("openAbuseFlags")}
                icon="⚠️"
                accent="#dc2626"
              />
              <MetricCard
                label="Gross Revenue (MTD)"
                value={formatCurrencyInr(metrics?.grossRevenueMtd)}
                sublabel={getDelta("grossRevenueMtd")}
                icon="💰"
                accent="#16a34a"
              />
            </>
          )}
        </div>
      </section>

      <section aria-label="Analytics" className="dash-section">
        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Analytics</h2>
          <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: 13 }}>
            Trend analysis for key metrics and system health is now part of the dashboard.
          </p>
        </div>

        {loading && !data ? (
          <SkeletonLoader variant="detail" />
        ) : error && !data ? (
          <ErrorState
            title="Analytics unavailable"
            message={getApiErrorMessage(error)}
            onRetry={() => fetchKpis({ reason: "retry" })}
            retryLabel="Retry"
          />
        ) : (
          <Suspense fallback={<SkeletonLoader variant="card" count={2} />}>
            <DashboardCharts data={data} history={history} />
          </Suspense>
        )}
      </section>

      <section aria-label="Quick Actions" className="dash-section">
        <h2 style={{ marginTop: 0 }}>Quick Actions</h2>
        <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>Create Business Partner</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Onboards a new partner and creates a BP admin user (must change password on first login).
            </div>
          </div>

          {canCreatePartner ? (
            <button type="button" className="button" style={{ width: "auto" }} onClick={() => setCreateOpen(true)}>
              Create Business Partner
            </button>
          ) : (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Not permitted</div>
          )}
        </div>
      </section>

      <CreateBusinessPartnerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          void fetchKpis({ reason: "post-create" });
        }}
      />
    </div>
  );
}

function SuperadminDashboard() {
  return (
    <SuperadminDashboardProvider>
      <SuperadminDashboardInner />
    </SuperadminDashboardProvider>
  );
}

export { SuperadminDashboard };

