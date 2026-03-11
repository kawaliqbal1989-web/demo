import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { InsightPanel } from "../../components/InsightCard";
import { NetworkPulseCard, CenterRanking } from "../../components/LeadershipIntel";
import { getInsights } from "../../services/insightsService";
import { getBpNetworkPulse } from "../../services/leadershipIntelService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getPartnerDashboard } from "../../services/partnerService";
import { useAuth } from "../../hooks/useAuth";
import { getMyBusinessPartner } from "../../services/businessPartnersService";
import { resolveAssetUrl } from "../../utils/assetUrls";
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

function RankingList({ title, items, nameKey = "centerName", codeKey = "centerCode", valueLabel, valueFormatter, subtitle }) {
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
              key={`${title}-${item.franchiseProfileId || item.centerProfileId || item[codeKey]}`}
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
                <div style={{ fontWeight: 600 }}>{item[nameKey]}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {item[codeKey] || ""}
                  {item.centersCount !== undefined ? ` · ${item.centersCount} centers` : ""}
                  {item.activeStudentsCount !== undefined ? ` · ${item.activeStudentsCount} active students` : ""}
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

function BusinessPartnerDashboardPage() {
  const { username, branding } = useAuth();
  const [data, setData] = useState(null);
  const [partner, setPartner] = useState(null);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [networkPulse, setNetworkPulse] = useState(null);
  const [networkPulseLoading, setNetworkPulseLoading] = useState(true);

  const load = async () => {
    setError("");
    try {
      const resp = await getPartnerDashboard();
      setData(resp?.data || null);
      const mine = await getMyBusinessPartner();
      setPartner(mine?.data || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load dashboard.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setInsightsLoading(true);
    getInsights()
      .then((res) => setInsights(res.data?.insights || []))
      .catch(() => {})
      .finally(() => setInsightsLoading(false));

    setNetworkPulseLoading(true);
    getBpNetworkPulse()
      .then((res) => setNetworkPulse(res.data || null))
      .catch(() => {})
      .finally(() => setNetworkPulseLoading(false));
  }, []);

  if (error) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dashboard</h2>
        <p className="error">{error}</p>
        <button className="button" style={{ width: "auto" }} onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <section style={{ display: "grid", gap: 16 }}>
        <SkeletonLoader variant="card" count={4} />
        <SkeletonLoader variant="detail" />
        <SkeletonLoader variant="table" />
      </section>
    );
  }

  const kpis = data.kpis || {};
  const dashboard = data.dashboard || {};
  const overview = dashboard.overview || {};
  const operations = dashboard.operations || {};
  const performance = dashboard.performance || {};
  const finance = dashboard.finance || {};
  const workflow = dashboard.workflow || {};
  const alerts = dashboard.alerts || [];
  const rankings = dashboard.rankings || {};
  const franchiseComparison = dashboard.franchiseComparison || [];

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <PageHeader
        title="Partner Dashboard"
        subtitle={branding?.displayName || branding?.name || "Manage your franchise and center network."}
      >
        {dashboard?.meta?.generatedAt ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: -4 }}>
            Window: last {dashboard.meta.windowDays} days · Updated {new Date(dashboard.meta.generatedAt).toLocaleString()}
          </div>
        ) : null}
      </PageHeader>

      <InsightPanel
        insights={insights}
        loading={insightsLoading}
        onDismiss={(id) => setInsights((prev) => prev.filter((i) => i.id !== id))}
      />

      <NetworkAdvisor role="BP" />

      <NetworkPulseCard data={networkPulse} loading={networkPulseLoading} roleLabel="Network" />

      <CenterRanking
        topCenters={networkPulse?.topCenters}
        bottomCenters={networkPulse?.bottomCenters}
        loading={networkPulseLoading}
      />

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Welcome, {username || "Partner"}</div>
        {partner ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {resolveAssetUrl(partner.logoUrl) ? (
              <img
                src={resolveAssetUrl(partner.logoUrl)}
                alt="Partner logo"
                style={{ width: 150, height: 150, borderRadius: 8, objectFit: "contain", background: "var(--color-bg-card)", border: "1px solid var(--color-border)" }}
              />
            ) : null}
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Code: {partner.code} · Status: {partner.status}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Contact: {partner.contactEmail || ""}
                {partner.primaryPhone ? ` · ${partner.primaryPhone}` : ""}
              </div>
            </div>
          </div>
        ) : null}

        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Competitions: {kpis.competitionsTotal ?? 0} | Pending: {kpis.pendingRequests ?? 0}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <MetricCard label="Active Franchises" value={`${overview.franchisesCount ?? kpis.franchises ?? 0}/${kpis.franchises ?? overview.franchisesCount ?? 0}`} icon="🏢" accent="var(--role-bp)" />
        <MetricCard label="Centers" value={overview.centersCount ?? kpis.centers ?? 0} icon="🏫" />
        <MetricCard label="Students" value={overview.activeStudentsCount ?? kpis.students ?? 0} icon="👥" />
        <MetricCard label="Teachers" value={overview.teachersCount ?? kpis.teachersCount ?? 0} icon="🏅" />
        <MetricCard label="Attendance 30d" value={formatPercent(operations.attendanceRate30d ?? kpis.attendanceRate30d)} icon="📊" />
        <MetricCard label="Collections 30d" value={formatCurrency(finance.collections30d ?? kpis.collections30d)} icon="💰" accent="#16a34a" />
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
            <div style={{ fontSize: 13 }}>Franchise coverage, collections, and workflow backlog are within current dashboard thresholds.</div>
          </div>
        )}
      </div>

      <DashboardBand
        title="Network Health And Operations"
        description="Compare center activity, attendance, admissions, and teacher coverage across the partner network."
        metrics={[
          { label: "Attendance Rate", value: formatPercent(operations.attendanceRate30d) },
          { label: "Teacher Coverage", value: formatPercent(operations.teacherCoverageRate) },
          { label: "Recent Admissions", value: operations.recentAdmissions30d ?? 0 },
          { label: "Centers Without Teachers", value: operations.centersWithoutTeachers ?? 0 },
          { label: "Unassigned Batches", value: operations.batchesWithoutTeachers ?? 0 },
          { label: "Low Attendance Centers", value: operations.lowAttendanceCenters ?? 0 }
        ]}
        links={[
          { label: "Open Franchises", to: "/bp/franchises" },
          { label: "Open Centers", to: "/bp/centers" }
        ]}
      />

      <DashboardBand
        title="Student Performance"
        description="Use practice, mock-test, level-completion, and competition signals to compare franchise output."
        metrics={[
          { label: "Worksheet Submissions", value: performance.worksheetSubmissions30d ?? 0 },
          { label: "Students Practicing", value: performance.studentsPracticing30d ?? 0 },
          { label: "Worksheet Avg", value: formatPercent(performance.worksheetAverageScore30d) },
          { label: "Mock-Test Attempts", value: performance.mockTestAttempts30d ?? 0 },
          { label: "Mock-Test Avg", value: formatPercent(performance.mockTestAveragePercentage30d) },
          { label: "Level Completions", value: performance.levelCompletions30d ?? 0 }
        ]}
        links={[
          { label: "Students", to: "/bp/students" },
          { label: "Exam Cycles", to: "/bp/exam-cycles" }
        ]}
      />

      <DashboardBand
        title="Finance And Settlements"
        description="See collection momentum, fee stress, and pending partner earnings before they turn into escalations."
        metrics={[
          { label: "Collections 30d", value: formatCurrency(finance.collections30d) },
          { label: "Overdue Installments", value: finance.overdueInstallmentsCount ?? 0 },
          { label: "Overdue Amount", value: formatCurrency(finance.overdueAmount) },
          { label: "Pending Settlements", value: finance.pendingSettlementsCount ?? 0 },
          { label: "Pending Settlement Value", value: formatCurrency(finance.pendingSettlementAmount) },
          { label: "Active Enrollments", value: overview.activeEnrollments ?? 0 }
        ]}
        links={[
          { label: "Revenue", to: "/bp/revenue" },
          { label: "Settlements", to: "/bp/settlements" },
          { label: "Ledger", to: "/bp/ledger" }
        ]}
      />

      <DashboardBand
        title="Compliance And Workflow"
        description="Keep approvals, certificates, exams, and competition workflows moving across all franchises."
        metrics={[
          { label: "Pending Competition Requests", value: workflow.pendingCompetitionRequests ?? kpis.pendingRequests ?? 0 },
          { label: "Active Competitions", value: kpis.activeCompetitions ?? 0 },
          { label: "Upcoming Competitions", value: kpis.upcomingCompetitions ?? 0 },
          { label: "Unread Workflow Updates", value: kpis.competitionNotificationsUnread ?? 0 },
          { label: "Certificates Issued 30d", value: workflow.certificatesIssued30d ?? 0 },
          { label: "Certificates Revoked 30d", value: workflow.certificatesRevoked30d ?? 0 }
        ]}
        links={[
          { label: "Competition Requests", to: "/bp/competition-requests" },
          { label: "Certificates", to: "/bp/certificates" },
          { label: "Notifications", to: "/notifications" }
        ]}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <RankingList
          title="Franchise Comparison"
          subtitle="Franchises ranked by active student load, with attendance and overdue context."
          items={franchiseComparison.slice(0, 5)}
          nameKey="franchiseName"
          codeKey="franchiseCode"
          valueLabel="attendance"
          valueFormatter={(item) => formatPercent(item.attendanceRate30d)}
        />
        <RankingList
          title="Collection Leaders"
          subtitle="Centers with the strongest fee collection momentum in the last 30 days."
          items={rankings.collectionLeaders}
          valueLabel="collections"
          valueFormatter={(item) => formatCurrency(item.collections30d)}
        />
        <RankingList
          title="Attention Required"
          subtitle="Centers with the heaviest mix of overdue fees, low attendance, and staffing gaps."
          items={rankings.attentionCenters}
          valueLabel="attention score"
          valueFormatter={(item) => item.attentionScore ?? 0}
        />
      </div>
    </section>
  );
}

export { BusinessPartnerDashboardPage };
