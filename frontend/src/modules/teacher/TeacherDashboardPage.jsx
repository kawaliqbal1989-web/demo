import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Link } from "react-router-dom";
import { ReportActionButtons } from "../../components/ReportActionButtons";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { InsightPanel } from "../../components/InsightCard";
import { AtRiskQueue, BatchHeatmap, WorksheetRecommendations, InterventionPanel } from "../../components/TeacherCockpit";
import { getInsights } from "../../services/insightsService";
import { getCockpitDashboard } from "../../services/teacherCockpitService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getTeacherFinancialOverview, getTeacherMe, listMyStudents } from "../../services/teacherPortalService";
import { TeacherCopilot } from "../../components/AiNarrativeSurfaces";

function TeacherDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);
  const [assignedStudentsCount, setAssignedStudentsCount] = useState(0);
  const [activeEnrollmentsCount, setActiveEnrollmentsCount] = useState(0);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [cockpit, setCockpit] = useState(null);
  const [cockpitLoading, setCockpitLoading] = useState(true);
  const [financial, setFinancial] = useState(null);
  const [financialLoading, setFinancialLoading] = useState(true);
  const { branding } = useAuth();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [m, s] = await Promise.all([getTeacherMe(), listMyStudents()]);
      setMe(m?.data || null);

      const enrollments = s.data || [];
      setActiveEnrollmentsCount(enrollments.length);

      const unique = new Set();
      for (const r of enrollments) {
        if (r?.studentId) unique.add(r.studentId);
      }
      setAssignedStudentsCount(unique.size);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load dashboard.");
    } finally {
      setLoading(false);
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

    setCockpitLoading(true);
    getCockpitDashboard()
      .then((res) => setCockpit(res.data || null))
      .catch(() => {})
      .finally(() => setCockpitLoading(false));

    setFinancialLoading(true);
    getTeacherFinancialOverview({ limit: 20, offset: 0 })
      .then((res) => setFinancial(res?.data?.data || null))
      .catch(() => setFinancial(null))
      .finally(() => setFinancialLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="dash-section">
        <SkeletonLoader variant="card" count={2} />
        <SkeletonLoader variant="detail" />
      </section>
    );
  }

  return (
    <section className="dash-section">
      <PageHeader
        title="Teacher Dashboard"
        subtitle="Your assigned students and enrollments."
        actions={
          <>
            <ReportActionButtons reportKey="teacher-productivity" />
            <Link className="button secondary" style={{ width: "auto" }} to="/teacher/workflows">Workflow Queue</Link>
            <Link className="button secondary" style={{ width: "auto" }} to="/teacher/notes">Notes</Link>
            <Link className="button secondary" style={{ width: "auto" }} to="/teacher/fees">Fee Visibility</Link>
            <Link className="button" style={{ width: "auto" }} to="/teacher/students">Assigned Students</Link>
          </>
        }
      />

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
                {branding?.displayName || branding?.name ? (
                  <div className="dash-brand-name">{branding?.displayName || branding?.name}</div>
                ) : null}
        </div>
      ) : null}

      <InsightPanel
        insights={insights}
        loading={insightsLoading}
        onDismiss={(id) => setInsights((prev) => prev.filter((i) => i.id !== id))}
      />

      <TeacherCopilot />

      <div className="dash-kpi-grid">
        <MetricCard label="Assigned Students" value={assignedStudentsCount} icon="👥" accent="var(--role-teacher)" />
        <MetricCard label="Active Enrollments" value={activeEnrollmentsCount} icon="📚" />
        <MetricCard label="Pending Fee Students" value={financial?.widgets?.pendingFeeStudents ?? 0} icon="💳" accent="#b45309" />
        <MetricCard label="Overdue Students" value={financial?.widgets?.overdueStudents ?? 0} icon="⚠️" accent="#dc2626" />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div className="section-header">
          <span className="section-header__text">Assigned Student Fee Visibility</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Read-only dues visibility for your assigned students. Collections and receipt actions remain center-only.
        </div>

        {financial?.alerts?.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {financial.alerts.map((alert) => (
              <div
                key={alert.id}
                style={{
                  borderRadius: 10,
                  padding: "10px 12px",
                  border: `1px solid ${alert.severity === "critical" ? "#fecaca" : "#fde68a"}`,
                  background: alert.severity === "critical" ? "#fff1f2" : "#fffbeb"
                }}
              >
                <div style={{ fontWeight: 700, color: "#111827" }}>{alert.title}</div>
                <div style={{ fontSize: 12, color: "#4b5563" }}>{alert.message}</div>
              </div>
            ))}
          </div>
        ) : null}

        {financialLoading ? (
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Loading student dues visibility...</div>
        ) : null}

        {!financialLoading && Array.isArray(financial?.items) && financial.items.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Pending</th>
                  <th style={{ textAlign: "right" }}>Overdue</th>
                  <th>Next Due</th>
                  <th>Latest Payment</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {financial.items.slice(0, 10).map((item) => (
                  <tr key={item.studentId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.studentName}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.admissionNo || "-"}</div>
                    </td>
                    <td>{item.totals?.status || "-"}</td>
                    <td style={{ textAlign: "right" }}>Rs {Number(item.totals?.totalPending || 0).toLocaleString("en-IN")}</td>
                    <td style={{ textAlign: "right" }}>Rs {Number(item.totals?.totalOverdue || 0).toLocaleString("en-IN")}</td>
                    <td>{item.nextDue?.monthLabel || "-"}</td>
                    <td>{item.latestPayment?.paidAt ? new Date(item.latestPayment.paidAt).toLocaleDateString() : "-"}</td>
                    <td>
                      <span
                        style={{
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 9px",
                          background: item.riskLevel === "HIGH" ? "#fee2e2" : item.riskLevel === "MEDIUM" ? "#ffedd5" : "#ecfccb",
                          color: item.riskLevel === "HIGH" ? "#b91c1c" : item.riskLevel === "MEDIUM" ? "#b45309" : "#3f6212"
                        }}
                      >
                        {item.riskLevel || "NONE"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!financialLoading && (!Array.isArray(financial?.items) || financial.items.length === 0) ? (
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            No assigned students are currently visible for this teacher scope.
          </p>
        ) : null}
      </div>

      <InterventionPanel items={cockpit?.interventions} loading={cockpitLoading} />

      <AtRiskQueue data={cockpit?.atRiskQueue} loading={cockpitLoading} />

      <div className="cockpit-grid">
        <BatchHeatmap batches={cockpit?.batchHeatmap} loading={cockpitLoading} />
        <WorksheetRecommendations items={cockpit?.worksheetRecommendations} loading={cockpitLoading} />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div className="section-header">
          <span className="section-header__text">Teacher Profile</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>View your profile information.</div>

        <div className="info-grid">
          <div className="info-grid__label">Name</div>
          <div className="info-grid__value">{me?.fullName || ""}</div>

          <div className="info-grid__label">Teacher Code</div>
          <div className="info-grid__value">{me?.teacherCode || me?.username || ""}</div>

          <div className="info-grid__label">Username</div>
          <div className="info-grid__value">{me?.username || ""}</div>

          <div className="info-grid__label">Email</div>
          <div className="info-grid__value">{me?.email || ""}</div>

          <div className="info-grid__label">Phone</div>
          <div className="info-grid__value">{me?.phonePrimary || ""}</div>

          <div className="info-grid__label">Status</div>
          <div className="info-grid__value">{me?.status || ""}</div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <Link className="button secondary" style={{ width: "auto" }} to="/change-password">
            Change Password
          </Link>
          <Link className="button" style={{ width: "auto" }} to="/teacher/attendance">
            My Attendance
          </Link>
        </div>
      </div>
    </section>
  );
}

export { TeacherDashboardPage };
