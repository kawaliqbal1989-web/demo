import { useEffect, useState } from "react";
import { listStudentAttendance } from "../../services/studentPortalService";
import { ATTENDANCE_STATUS_COLORS, getAttendanceStatusLabel, isAttendancePresentLike } from "../../utils/attendance";

function StudentAttendancePage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    listStudentAttendance({ limit })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setRows(Array.isArray(data) ? data : Array.isArray(data?.sessions) ? data.sessions : []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load attendance.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [limit]);

  const presentCount = rows.filter((r) => isAttendancePresentLike(r.status) || r.present).length;
  const totalCount = rows.length;
  const percentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

  return (
    <div>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>📅 My Attendance</h2>
          <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)" }}>Your recent attendance records</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)" }} htmlFor="att-limit">Show last</label>
          <select
            id="att-limit"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="input"
            style={{ width: 80 }}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
          </select>
        </div>
      </div>

      {/* Summary card */}
      {!loading && !error && totalCount > 0 && (
        <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ textAlign: "center", minWidth: 100 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: percentage >= 75 ? "#16a34a" : percentage >= 50 ? "#d97706" : "#dc2626" }}>
              {percentage}%
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Attendance Rate</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>{presentCount}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Present</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#dc2626" }}>{totalCount - presentCount}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Absent</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#3b82f6" }}>{totalCount}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total Sessions</div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        {loading && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>No attendance records found.</p>
        )}
        {!loading && !error && rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const status = getAttendanceStatusLabel(r.status || (r.present ? "PRESENT" : "ABSENT"));
                  const colors = ATTENDANCE_STATUS_COLORS[status] || ATTENDANCE_STATUS_COLORS.ABSENT;
                  return (
                    <tr key={r.id || i}>
                      <td>{i + 1}</td>
                      <td>{r.date ? new Date(r.date).toLocaleDateString() : r.sessionDate ? new Date(r.sessionDate).toLocaleDateString() : "—"}</td>
                      <td>{r.batchName || r.batch?.name || "—"}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: colors.bg,
                            color: colors.fg,
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 12,
                            fontWeight: 600
                          }}
                        >
                          {status}
                        </span>
                      </td>
                      <td style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{r.note || r.comment || r.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export { StudentAttendancePage };
