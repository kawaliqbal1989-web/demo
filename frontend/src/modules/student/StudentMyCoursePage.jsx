import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getStudentMyCourse } from "../../services/studentPortalService";

function formatCenter(center) {
  if (!center) return "—";
  if (center.name && center.code) return `${center.name} (${center.code})`;
  return center.name || center.code || "—";
}

function StudentMyCoursePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getStudentMyCourse()
      .then((res) => {
        if (cancelled) return;
        setData(res.data?.data || null);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load my course.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <LoadingState label="Loading my course..." />;
  }

  const current = data?.currentEnrollment;
  const course = data?.myCourse;
  const progress = course?.progress;
  const latest = data?.latestResult;

  return (
    <section className="dash-section">
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0 }}>My Course</h2>
          <div className="dash-card__subtitle" style={{ marginTop: 6 }}>
            Your current course and progress.
          </div>
        </div>

        <div className="dash-header__actions">
          <Link className="button" style={{ width: "auto" }} to="/student/worksheets">
            Go to Worksheets
          </Link>
          <Link className="button secondary" style={{ width: "auto" }} to="/student/results">
            View Results
          </Link>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="dash-grid-2">
        <div className="card dash-card">
          <div className="dash-card__title">Current Enrollment</div>
          <div className="dash-card__subtitle">Active enrollment and assigned teacher.</div>

          <div className="info-grid">
            <div className="info-grid__label">Course / Level</div>
            <div className="info-grid__value">{current?.courseLevelLabel || "—"}</div>

            <div className="info-grid__label">Assigned Teacher</div>
            <div className="info-grid__value">{current?.assignedTeacherName || "—"}</div>

            <div className="info-grid__label">Center</div>
            <div className="info-grid__value">
              {current?.centerName || current?.centerCode
                ? `${current.centerName || ""}${current.centerName && current.centerCode ? " (" : ""}${
                    current.centerCode || ""
                  }${current.centerName && current.centerCode ? ")" : ""}` || "—"
                : "—"}
            </div>

            <div className="info-grid__label">Batch</div>
            <div className="info-grid__value">{current?.batchName || "No batch assigned"}</div>
          </div>
        </div>

        <div className="card dash-card">
          <div className="dash-card__title">My Course</div>
          <div className="dash-card__subtitle">Your current course and progress.</div>

          <div className="info-grid">
            <div className="info-grid__label">Course Name</div>
            <div className="info-grid__value">{course?.courseName || "—"}</div>

            <div className="info-grid__label">Course Code</div>
            <div className="info-grid__value">{course?.courseCode || "—"}</div>

            <div className="info-grid__label">Current Level</div>
            <div className="info-grid__value">{course?.currentLevel || "—"}</div>

            <div className="info-grid__label">Enrollment Status</div>
            <div className="info-grid__value">{course?.enrollmentStatus || "—"}</div>

            <div className="info-grid__label">Teacher</div>
            <div className="info-grid__value">{course?.teacher || "—"}</div>

            <div className="info-grid__label">Center</div>
            <div className="info-grid__value">{formatCenter(course?.center)}</div>
          </div>

          <div className="dash-card__title" style={{ marginTop: 10 }}>
            Progress
          </div>

          <div className="dash-kpi-grid" style={{ marginTop: 2 }}>
            <div className="card" style={{ margin: 0 }}>
              <div className="info-grid__label">Total Worksheets</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{progress?.totalWorksheets ?? 0}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="info-grid__label">Attempted</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{progress?.attempted ?? 0}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="info-grid__label">Completed</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{progress?.completed ?? 0}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="info-grid__label">Last Attempt</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6 }}>
                {progress?.lastAttemptAt ? new Date(progress.lastAttemptAt).toLocaleDateString() : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Modules</div>
        {course?.modules?.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Module</th>
                </tr>
              </thead>
              <tbody>
                {course.modules.map((m) => (
                  <tr key={m.title}>
                    <td>{m.title}</td>
                    <td className="muted">{m.subtitle || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted">No modules available.</div>
        )}
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Latest Result</div>
        <div className="info-grid">
          <div className="info-grid__label">Worksheet</div>
          <div className="info-grid__value">{latest?.worksheetTitle || "—"}</div>

          <div className="info-grid__label">Result</div>
          <div className="info-grid__value">{latest?.score == null ? "—" : `${latest.score}%`}</div>
        </div>
      </div>
    </section>
  );
}

export { StudentMyCoursePage };
