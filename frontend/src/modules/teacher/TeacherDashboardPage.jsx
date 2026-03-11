import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Link } from "react-router-dom";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { InsightPanel } from "../../components/InsightCard";
import { AtRiskQueue, BatchHeatmap, WorksheetRecommendations, InterventionPanel } from "../../components/TeacherCockpit";
import { getInsights } from "../../services/insightsService";
import { getCockpitDashboard } from "../../services/teacherCockpitService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getTeacherMe, listMyStudents } from "../../services/teacherPortalService";
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
            <Link className="button secondary" style={{ width: "auto" }} to="/teacher/notes">Notes</Link>
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
