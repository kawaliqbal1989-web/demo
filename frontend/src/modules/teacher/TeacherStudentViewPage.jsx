import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  getStudent,
  getTeacherStudentAttempts,
  getTeacherStudentMaterials,
  getTeacherStudentPracticeReport
} from "../../services/teacherPortalService";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function renderFeatureBadge(enabled, label, assignedAt) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        padding: 10,
        background: enabled ? "var(--color-bg-success-light)" : "var(--color-bg-subtle)",
        display: "grid",
        gap: 4,
        minWidth: 180
      }}
    >
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, color: enabled ? "var(--color-text-success)" : "var(--color-text-muted)" }}>
        {enabled ? "Assigned" : "Not assigned"}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        {enabled && assignedAt ? `Assigned on ${formatDateTime(assignedAt)}` : "View only"}
      </div>
    </div>
  );
}

function TeacherStudentViewPage() {
  const { studentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [overview, setOverview] = useState({
    loading: false,
    attemptsTotal: 0,
    latestAttemptAt: "",
    worksheetsCount: 0,
    practiceTotalAttempts: 0,
    practiceAvgScore: null
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [studentRes, attemptsRes, materialsRes, practiceRes] = await Promise.all([
        getStudent(studentId),
        getTeacherStudentAttempts(studentId, { limit: 1, offset: 0 }),
        getTeacherStudentMaterials(studentId),
        getTeacherStudentPracticeReport(studentId, { limit: 5 })
      ]);

      setData(studentRes.data || null);

      const attemptsData = attemptsRes?.data || null;
      const latestAttempt = Array.isArray(attemptsData?.items) && attemptsData.items.length ? attemptsData.items[0] : null;
      const worksheets = Array.isArray(materialsRes?.data?.worksheets) ? materialsRes.data.worksheets : [];
      const practiceData = practiceRes?.data || null;

      setOverview({
        loading: false,
        attemptsTotal: typeof attemptsData?.total === "number" ? attemptsData.total : 0,
        latestAttemptAt: latestAttempt?.submittedAt || "",
        worksheetsCount: worksheets.length,
        practiceTotalAttempts: typeof practiceData?.totalAttempts === "number" ? practiceData.totalAttempts : 0,
        practiceAvgScore: practiceData?.avgScore ?? null
      });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load student.");
      setOverview((prev) => ({ ...prev, loading: false }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (loading) {
    return <LoadingState label="Loading student..." />;
  }

  if (!data) {
    return (
      <div className="card">
        <p className="error">{error || "Student not found"}</p>
      </div>
    );
  }

  const student = data.student;
  const practiceFeatures = student?.practiceFeatures || {};

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Student</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Teacher-scoped student view</div>
        </div>
        <Link className="button" style={{ width: "auto" }} to={`/teacher/students/${studentId}/360`}>
          View Full Profile →
        </Link>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 6 }}>
        <div><strong>{student?.firstName} {student?.lastName}</strong> ({student?.admissionNo})</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Level: {student?.level ? `${student.level.name} / ${student.level.rank}` : ""}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Guardian: {student?.guardianName || ""} {student?.guardianPhone ? `• ${student.guardianPhone}` : ""}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {renderFeatureBadge(Boolean(practiceFeatures?.PRACTICE), "Practice", practiceFeatures?.PRACTICE?.assignedAt)}
          {renderFeatureBadge(Boolean(practiceFeatures?.ABACUS_PRACTICE), "Abacus Practice", practiceFeatures?.ABACUS_PRACTICE?.assignedAt)}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="button" style={{ width: "auto" }} to={`/teacher/students/${encodeURIComponent(studentId)}/assign-worksheets`}>
            Assign Worksheets
          </Link>
          <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/notes?studentId=${encodeURIComponent(studentId)}`}>
            Notes
          </Link>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Student Overview</h3>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Everything important grouped into Activity, Result, and Others.
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>Activity</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Latest attempt: {formatDateTime(overview.latestAttemptAt)}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Worksheets assigned: {overview.worksheetsCount}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${encodeURIComponent(studentId)}/attempts`}>
                View Attempts
              </Link>
              <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${encodeURIComponent(studentId)}/materials`}>
                View Materials
              </Link>
            </div>
          </div>

          <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>Result</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Total attempts: {overview.attemptsTotal}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Practice avg score: {overview.practiceAvgScore === null ? "-" : overview.practiceAvgScore}
            </div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Practice records: {overview.practiceTotalAttempts}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${encodeURIComponent(studentId)}/practice-report`}>
                View Practice Report
              </Link>
            </div>
          </div>

          <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 10, display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>Others</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Attendance and enrollment summaries are shown below.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/notes?studentId=${encodeURIComponent(studentId)}`}>
                Open Notes
              </Link>
              <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/students/${encodeURIComponent(studentId)}/assign-worksheets`}>
                Assign Worksheets
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Enrollment</h3>
        {!data.enrollments?.length ? (
          <div style={{ color: "var(--color-text-muted)" }}>No active enrollments found.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {data.enrollments.map((e) => (
              <div key={e.enrollmentId} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <strong>{e.batch?.name || "Batch"}</strong>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status: {e.status}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{e.level ? `${e.level.name} / ${e.level.rank}` : ""}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Attendance Summary</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div><strong>PRESENT</strong>: {data.attendanceSummary?.PRESENT ?? 0}</div>
          <div><strong>ABSENT</strong>: {data.attendanceSummary?.ABSENT ?? 0}</div>
          <div><strong>LATE</strong>: {data.attendanceSummary?.LATE ?? 0}</div>
          <div><strong>EXCUSED</strong>: {data.attendanceSummary?.EXCUSED ?? 0}</div>
        </div>
        <Link className="button secondary" style={{ width: "auto", marginTop: 4 }} to={`/teacher/students/${studentId}/attendance`}>
          View Full History →
        </Link>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Recent Notes</h3>
        {!data.recentNotes?.length ? (
          <div style={{ color: "var(--color-text-muted)" }}>No notes yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {data.recentNotes.map((n) => (
              <div key={n.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{String(n.createdAt || "").slice(0, 10)}</div>
                <div>{n.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export { TeacherStudentViewPage };
