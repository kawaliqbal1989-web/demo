import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { InsightPanel } from "../../components/InsightCard";
import { NetworkPulseCard, CenterRanking } from "../../components/LeadershipIntel";
import { getInsights } from "../../services/insightsService";
import { getFranchiseNetworkPulse } from "../../services/leadershipIntelService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { useAuth } from "../../hooks/useAuth";
import { getFranchiseDashboard, getMyFranchise } from "../../services/franchiseService";
import { NetworkAdvisor } from "../../components/AiNarrativeSurfaces";

const ALERT_STYLES = {
  critical: {
    background: "var(--color-bg-danger-light)",
    border: "1px solid var(--color-border-danger)",
    color: "var(--color-text-danger)"
  },
  warning: {
    background: "var(--color-bg-warning)",
    border: "1px solid var(--color-border-warning)",
    color: "var(--color-text-warning)"
  },
  info: {
    background: "var(--color-bg-info-light)",
    border: "1px solid var(--color-primary)",
    color: "var(--color-text-info)"
  }
};

function formatPercent(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function DashboardBand({ title, description, metrics, links }) {
  return (
    <div className="card" style={{ display: "grid", gap: 14 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
        <div className="subtext">{description}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            sublabel={metric.sublabel}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {links.map((link) => (
          <Link key={link.to} className="button secondary" style={{ width: "auto" }} to={link.to}>
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function RankingList({ title, items, valueLabel, valueFormatter, subtitle }) {
  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
        <div className="subtext">{subtitle}</div>
      </div>
      {items?.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((item) => (
            <div
              key={`${title}-${item.hierarchyNodeId || item.centerProfileId || item.centerCode}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                paddingBottom: 10,
                borderBottom: "1px solid var(--color-border-divider)"
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{item.centerName}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {item.centerCode || ""}
                  {item.centerStatus ? ` · ${item.centerStatus}` : ""}
                  {item.activeEnrollments !== undefined ? ` · ${item.activeEnrollments} enrollments` : ""}
                  {item.overdueAmount ? ` · ${formatCurrency(item.overdueAmount)} overdue` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{valueFormatter(item)}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{valueLabel}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="subtext">No data available for this period.</div>
      )}
    </div>
  );
}

function FranchiseDashboard() {
  const { username, userId, role, branding } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kpis, setKpis] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [profile, setProfile] = useState(null);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [networkPulse, setNetworkPulse] = useState(null);
  const [networkPulseLoading, setNetworkPulseLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    void Promise.all([getFranchiseDashboard(), getMyFranchise()])
      .then(([dash, me]) => {
        if (cancelled) return;
        setKpis(dash.data?.kpis || null);
        setDashboard(dash.data?.dashboard || null);
        setProfile(me.data?.profile || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load dashboard.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setInsightsLoading(true);
    getInsights()
      .then((res) => setInsights(res.data?.insights || []))
      .catch(() => {})
      .finally(() => setInsightsLoading(false));

    setNetworkPulseLoading(true);
    getFranchiseNetworkPulse()
      .then((res) => setNetworkPulse(res.data || null))
      .catch(() => {})
      .finally(() => setNetworkPulseLoading(false));
  }, []);

  if (loading && !kpis && !profile && !dashboard) {
    return (
      <section style={{ display: "grid", gap: 16 }}>
        <SkeletonLoader variant="card" count={4} />
        <SkeletonLoader variant="detail" />
        <SkeletonLoader variant="table" />
      </section>
    );
  }

  const overview = dashboard?.overview || {};
  const operations = dashboard?.operations || {};
  const performance = dashboard?.performance || {};
  const finance = dashboard?.finance || {};
  const workflow = dashboard?.workflow || {};
  const alerts = dashboard?.alerts || [];
  const rankings = dashboard?.rankings || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PageHeader
        title="Franchise Dashboard"
        subtitle={branding?.displayName || branding?.name || "Manage your centers and operations."}
      >
        {dashboard?.meta?.generatedAt ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: -4 }}>
            Window: last {dashboard.meta.windowDays} days · Updated {new Date(dashboard.meta.generatedAt).toLocaleString()}
          </div>
        ) : null}
        {error ? <div style={{ color: "var(--color-text-danger)" }}>{error}</div> : null}
      </PageHeader>

      <InsightPanel
        insights={insights}
        loading={insightsLoading}
        onDismiss={(id) => setInsights((prev) => prev.filter((i) => i.id !== id))}
      />

      <NetworkAdvisor role="FRANCHISE" />

      <NetworkPulseCard data={networkPulse} loading={networkPulseLoading} roleLabel="Franchise" />

      <CenterRanking
        topCenters={networkPulse?.topCenters}
        bottomCenters={networkPulse?.bottomCenters}
        loading={networkPulseLoading}
      />

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Welcome, {username || profile?.name || "Franchise"}</div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {profile?.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt="Franchise logo"
              style={{ width: 150, height: 150, borderRadius: 8, objectFit: "cover" }}
            />
          ) : null}
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
              Franchise Code: {profile?.code || ""}
              {userId ? ` · User ID: ${userId}` : ""}
              {profile?.status ? ` · Status: ${profile.status}` : ""}
            </div>
            <div style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
              Contact: {profile?.emailOfficial || ""}
              {profile?.phonePrimary ? ` · ${profile.phonePrimary}` : ""}
              {role ? ` · Role: ${String(role).charAt(0) + String(role).slice(1).toLowerCase()}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard
          label="Active Centers"
          value={`${overview.activeCentersCount ?? kpis?.centersCount ?? 0}/${overview.centersCount ?? kpis?.centersCount ?? 0}`}
          sublabel={`${overview.inactiveCentersCount ?? 0} need attention or are inactive`}
          icon="🏫"
          accent="var(--role-franchise)"
        />
        <MetricCard label="Active Students" value={overview.activeStudentsCount ?? kpis?.studentsCount ?? 0} icon="👥" />
        <MetricCard label="Teachers" value={overview.teachersCount ?? kpis?.teachersCount ?? 0} icon="🏅" />
        <MetricCard label="Attendance 30d" value={formatPercent(operations.attendanceRate30d ?? kpis?.attendanceRate30d)} icon="📊" />
        <MetricCard label="Collections 30d" value={formatCurrency(finance.collections30d ?? kpis?.collections30d)} icon="💰" accent="#16a34a" />
        <MetricCard label="Pending Settlements" value={finance.pendingSettlementsCount ?? 0} icon="⏳" accent="#d97706" />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {alerts.length ? (
          alerts.map((alert) => (
            <div key={alert.id} className="card" style={ALERT_STYLES[alert.severity] || ALERT_STYLES.info}>
              <div style={{ fontWeight: 700 }}>{alert.title}</div>
              <div style={{ fontSize: 13 }}>{alert.detail}</div>
            </div>
          ))
        ) : (
          <div className="card" style={ALERT_STYLES.info}>
            <div style={{ fontWeight: 700 }}>No urgent alerts</div>
            <div style={{ fontSize: 13 }}>Center coverage, collections, and workflows are within current dashboard thresholds.</div>
          </div>
        )}
      </div>

      <DashboardBand
        title="Center Health And Operations"
        description="Monitor attendance, teacher coverage, admissions, and batch ownership across centers."
        metrics={[
          { label: "Attendance Rate", value: formatPercent(operations.attendanceRate30d) },
          { label: "Sessions Finalized", value: operations.sessionsFinalized30d ?? 0 },
          { label: "Teacher Coverage", value: formatPercent(operations.teacherCoverageRate) },
          { label: "Recent Admissions", value: operations.recentAdmissions30d ?? 0 },
          { label: "Centers Without Teachers", value: operations.centersWithoutTeachers ?? 0 },
          { label: "Unassigned Batches", value: operations.batchesWithoutTeachers ?? 0 }
        ]}
        links={[
          { label: "Open Centers", to: "/franchise/centers" },
          { label: "Open Students", to: "/franchise/students" }
        ]}
      />

      <DashboardBand
        title="Student Performance"
        description="Use recent practice, mock-test, competition, and progression signals to spot activity gaps."
        metrics={[
          { label: "Worksheet Submissions", value: performance.worksheetSubmissions30d ?? 0 },
          { label: "Students Practicing", value: performance.studentsPracticing30d ?? 0 },
          { label: "Worksheet Avg", value: formatPercent(performance.worksheetAverageScore30d) },
          { label: "Mock-Test Attempts", value: performance.mockTestAttempts30d ?? 0 },
          { label: "Mock-Test Avg", value: formatPercent(performance.mockTestAveragePercentage30d) },
          { label: "Level Completions", value: performance.levelCompletions30d ?? 0 }
        ]}
        links={[
          { label: "Student Reports", to: "/franchise/students" },
          { label: "Exam Cycles", to: "/franchise/exam-cycles" }
        ]}
      />

      <DashboardBand
        title="Finance And Settlements"
        description="Track fee collection momentum, overdue balances, and settlement backlog at franchise scope."
        metrics={[
          { label: "Collections 30d", value: formatCurrency(finance.collections30d) },
          { label: "Overdue Installments", value: finance.overdueInstallmentsCount ?? 0 },
          { label: "Overdue Amount", value: formatCurrency(finance.overdueAmount) },
          { label: "Pending Settlements", value: finance.pendingSettlementsCount ?? 0 },
          { label: "Pending Settlement Value", value: formatCurrency(finance.pendingSettlementAmount) },
          { label: "Active Enrollments", value: overview.activeEnrollments ?? kpis?.activeEnrollments ?? 0 }
        ]}
        links={[
          { label: "Reports", to: "/franchise/reports" },
          { label: "Settlements", to: "/franchise/settlements" },
          { label: "Margins", to: "/franchise/margins" }
        ]}
      />

      <DashboardBand
        title="Compliance And Workflow"
        description="Watch approvals, certificates, and academic workflow queues before they turn into backlog."
        metrics={[
          { label: "Pending Competition Requests", value: workflow.pendingCompetitionRequests ?? 0 },
          { label: "Certificates Issued", value: workflow.certificatesIssued30d ?? 0 },
          { label: "Certificates Revoked", value: workflow.certificatesRevoked30d ?? 0 },
          { label: "Competition Enrollments", value: performance.activeCompetitionEnrollments ?? 0 }
        ]}
        links={[
          { label: "Competition Queue", to: "/franchise/competition-requests" },
          { label: "Exam Cycles", to: "/franchise/exam-cycles" },
          { label: "Notifications", to: "/notifications" }
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <RankingList
          title="Largest Centers"
          subtitle="Highest active student load in the current scope."
          items={rankings.topCentersByStudents}
          valueLabel="active students"
          valueFormatter={(item) => item.activeStudentsCount ?? 0}
        />
        <RankingList
          title="Lowest Attendance"
          subtitle="Centers currently performing worst on finalized attendance."
          items={rankings.lowAttendanceCenters}
          valueLabel="attendance"
          valueFormatter={(item) => formatPercent(item.attendanceRate30d)}
        />
        <RankingList
          title="Attention Required"
          subtitle="Combined signal from attendance, teacher coverage, status, and overdue pressure."
          items={rankings.attentionCenters}
          valueLabel="attention score"
          valueFormatter={(item) => item.attentionScore ?? 0}
        />
      </div>
    </div>
  );
}

export { FranchiseDashboard };
