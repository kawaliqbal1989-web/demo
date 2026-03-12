import { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { getStudentAttendanceHistory as teacherGetHistory } from "../../services/teacherPortalService";
import { getStudentAttendanceHistory as centerGetHistory } from "../../services/centerService";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { ATTENDANCE_STATUS_COLORS, getAttendanceRate } from "../../utils/attendance";

function StudentAttendanceHistoryPage() {
  const { studentId } = useParams();
  const { role } = useAuth();

  const isCenter = role === "CENTER";
  const fetchHistory = isCenter ? centerGetHistory : teacherGetHistory;
  const backLink = isCenter
    ? `/center/students/${studentId}`
    : `/teacher/students/${studentId}`;

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 });
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const params = { limit, offset };
    if (statusFilter) params.status = statusFilter;
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;

    fetchHistory(studentId, params)
      .then((res) => {
        if (cancelled) return;
        const d = res.data || res;
        setItems(Array.isArray(d.items) ? d.items : []);
        setTotal(d.total || 0);
        setStudent(d.student || null);
        if (d.summary) setSummary(d.summary);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load attendance history.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [studentId, limit, offset, statusFilter, fromDate, toDate, fetchHistory]);

  const percentage = getAttendanceRate(summary);

  const columns = useMemo(() => [
    {
      key: "date",
      header: "Date",
      render: (r) => r.date ? new Date(r.date).toLocaleDateString() : "—"
    },
    { key: "batchName", header: "Batch", render: (r) => r.batchName || "—" },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const c = ATTENDANCE_STATUS_COLORS[r.status] || { bg: "var(--color-bg-muted)", fg: "var(--color-text-label)" };
        return (
          <span style={{ background: c.bg, color: c.fg, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
            {r.status}
          </span>
        );
      }
    },
    { key: "note", header: "Note", render: (r) => r.note || "—" },
    {
      key: "markedAt",
      header: "Marked At",
      render: (r) => r.markedAt ? new Date(r.markedAt).toLocaleString() : "—"
    }
  ], []);

  return (
    <div>
      {/* Header */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>📅 Attendance History</h2>
          <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
            Detailed attendance records for this student
          </p>
        </div>
        <Link className="button secondary" to={backLink}>← Back</Link>
      </div>

      {!loading && !error && student ? (
        <div className="card" style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{student.fullName || "Student"}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
              {student.admissionNo ? `Code: ${student.admissionNo}` : "Code not available"}
              {student.levelName ? ` • ${student.levelName}${student.levelRank != null ? ` (Rank ${student.levelRank})` : ""}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "var(--color-text-muted)" }}>
            <div><strong>Guardian:</strong> {student.guardianName || "—"}</div>
            <div><strong>Phone:</strong> {student.guardianPhone || "—"}</div>
            <div><strong>Email:</strong> {student.email || "—"}</div>
            <div><strong>Teacher:</strong> {student.teacherName || "—"}</div>
          </div>
        </div>
      ) : null}

      {/* Summary */}
      {!loading && !error && summary.total > 0 && (
        <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 12 }}>
          <div style={{ textAlign: "center", minWidth: 100 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: percentage >= 75 ? "#16a34a" : percentage >= 50 ? "#d97706" : "#dc2626" }}>
              {percentage}%
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Attendance Rate</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#16a34a" }}>{summary.PRESENT}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Present</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#dc2626" }}>{summary.ABSENT}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Absent</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-text-warning)" }}>{summary.LATE}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Late</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-text-info)" }}>{summary.EXCUSED}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Excused</div>
          </div>
          <div style={{ textAlign: "center", minWidth: 80 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#3b82f6" }}>{summary.total}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block" }}>From</label>
          <input type="date" className="input" style={{ width: 150 }} value={fromDate} onChange={(e) => { setFromDate(e.target.value); setOffset(0); }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block" }}>To</label>
          <input type="date" className="input" style={{ width: 150 }} value={toDate} onChange={(e) => { setToDate(e.target.value); setOffset(0); }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block" }}>Status</label>
          <select className="input" style={{ width: 140 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}>
            <option value="">All</option>
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="LATE">Late</option>
            <option value="EXCUSED">Excused</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block" }}>Rows per page</label>
          <select className="input" style={{ width: 80 }} value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0); }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        {(fromDate || toDate || statusFilter) && (
          <button className="button secondary" style={{ width: "auto" }} onClick={() => { setFromDate(""); setToDate(""); setStatusFilter(""); setOffset(0); }}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ marginTop: 12 }}>
        {loading && <p style={{ color: "var(--color-text-muted)" }}>Loading…</p>}
        {error && <p style={{ color: "#dc2626" }}>{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p style={{ color: "var(--color-text-muted)" }}>No attendance records found.</p>
        )}
        {!loading && !error && items.length > 0 && (
          <>
            <DataTable
              columns={columns}
              rows={items}
              keyField={(row, index) => row?.sessionId || `session-${index}`}
            />
            <PaginationBar
              limit={limit}
              offset={offset}
              count={items.length}
              total={total}
              onChange={setOffset}
            />
          </>
        )}
      </div>
    </div>
  );
}

export { StudentAttendanceHistoryPage };
