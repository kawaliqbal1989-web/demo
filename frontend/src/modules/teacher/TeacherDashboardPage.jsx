import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { MetricCard } from "../../components/MetricCard";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getTeacherMe, listMyStudents } from "../../services/teacherPortalService";

function TeacherDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [me, setMe] = useState(null);
  const [assignedStudentsCount, setAssignedStudentsCount] = useState(0);
  const [activeEnrollmentsCount, setActiveEnrollmentsCount] = useState(0);
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

  if (loading) {
    return <LoadingState label="Loading dashboard..." />;
  }

  return (
    <section className="dash-section">
      <div className="dash-header">
        <div>
          <h2 className="dashboard-title">Teacher Dashboard</h2>
          <div className="subtext">Your assigned students and enrollments.</div>
        </div>

        <div className="dash-header__actions">
          <Link className="button secondary" style={{ width: "auto" }} to="/teacher/notes">
            Notes
          </Link>
          <Link className="button" style={{ width: "auto" }} to="/teacher/students">
            Assigned Students
          </Link>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
                {branding?.displayName || branding?.name ? (
                  <div className="dash-brand-name">{branding?.displayName || branding?.name}</div>
                ) : null}
        </div>
      ) : null}

      <div className="dash-kpi-grid">
        <MetricCard label="Assigned Students" value={assignedStudentsCount} />
        <MetricCard label="Active Enrollments" value={activeEnrollmentsCount} />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Teacher Profile</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>View your profile information.</div>

        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
          <div style={{ color: "var(--color-text-muted)" }}>Name</div>
          <div>{me?.fullName || ""}</div>

          <div style={{ color: "var(--color-text-muted)" }}>Teacher Code</div>
          <div>{me?.teacherCode || me?.username || ""}</div>

          <div style={{ color: "var(--color-text-muted)" }}>Username</div>
          <div>{me?.username || ""}</div>

          <div style={{ color: "var(--color-text-muted)" }}>Email</div>
          <div>{me?.email || ""}</div>

          <div style={{ color: "var(--color-text-muted)" }}>Phone</div>
          <div>{me?.phonePrimary || ""}</div>

          <div style={{ color: "var(--color-text-muted)" }}>Status</div>
          <div>{me?.status || ""}</div>
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
