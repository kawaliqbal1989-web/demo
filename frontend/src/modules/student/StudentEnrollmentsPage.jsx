import { useEffect, useState } from "react";
import { listStudentEnrollments } from "../../services/studentPortalService";

function StudentEnrollmentsPage() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    listStudentEnrollments({ status })
      .then((res) => {
        if (cancelled) {
          return;
        }
        setRows(Array.isArray(res.data?.data) ? res.data.data : []);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setError("Failed to load enrollments.");
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>My Enrollments</h2>
          <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)" }}>Batches and teacher assignments</p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)" }} htmlFor="enrollment-status">
            Status
          </label>
          <select
            id="enrollment-status"
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="">ALL</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="TRANSFERRED">TRANSFERRED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-text-muted)" }}>
                Course / Batch
              </th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-text-muted)" }}>
                Level
              </th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-text-muted)" }}>
                Teacher
              </th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-text-muted)" }}>
                Status
              </th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid var(--color-border)", fontSize: 12, color: "var(--color-text-muted)" }}>
                Enrolled On
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: 12, color: "var(--color-text-muted)" }}>
                  Loading…
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => (
                <tr key={row.enrollmentId}>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--color-border-divider)" }}>{row.courseCode || "—"}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--color-border-divider)" }}>{row.levelTitle || row.level || "—"}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--color-border-divider)" }}>{row.assignedTeacherName || "—"}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--color-border-divider)" }}>{row.status}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--color-border-divider)" }}>
                    {row.startedAt ? new Date(row.startedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: 12, color: "var(--color-text-muted)" }}>
                  No enrollments found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { StudentEnrollmentsPage };
