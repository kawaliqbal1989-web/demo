import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { listAttendanceHistory } from "../../services/centerService";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { ATTENDANCE_STATUS_COLORS, getAttendanceRate } from "../../utils/attendance";

function CenterAttendanceHistoryPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const fetchData = useCallback(() => {
    setLoading(true);
    setError("");

    const params = { limit, offset };
    if (statusFilter) params.status = statusFilter;
    if (fromDate) params.from = fromDate;
    if (toDate) params.to = toDate;
    if (search) params.search = search;

    listAttendanceHistory(params)
      .then((res) => {
        const d = res.data || res;
        setItems(Array.isArray(d.items) ? d.items : []);
        setTotal(d.total || 0);
        if (d.summary) setSummary(d.summary);
      })
      .catch(() => {
        setError("Failed to load attendance history.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [limit, offset, statusFilter, fromDate, toDate, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const percentage = getAttendanceRate(summary);

  const columns = useMemo(() => [
    {
      key: "date",
      header: "Date",
      render: (r) => r.date ? new Date(r.date).toLocaleDateString() : "—"
    },
    {
      key: "student",
      header: "Student",
      render: (r) => (
        <Link to={`/center/students/${r.studentId}/attendance`} style={{ color: "#2563eb", textDecoration: "none" }}>
          {r.studentName || "—"}
          {r.admissionNo ? <span style={{ color: "var(--color-text-faint)", fontSize: 11, marginLeft: 4 }}>({r.admissionNo})</span> : ""}
        </Link>
      )
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
            Detailed attendance records for all students
          </p>
        </div>
      </div>

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
          <label style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block" }}>Search Student</label>
          <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setOffset(0); }} style={{ display: "flex", gap: 4 }}>
            <input type="text" className="input" style={{ width: 180 }} placeholder="Name or Admission No" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            <button type="submit" className="button secondary" style={{ width: "auto", padding: "4px 10px" }}>🔍</button>
          </form>
        </div>
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
        {(fromDate || toDate || statusFilter || search) && (
          <button className="button secondary" style={{ width: "auto" }} onClick={() => { setFromDate(""); setToDate(""); setStatusFilter(""); setSearch(""); setSearchInput(""); setOffset(0); }}>
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
              keyField={(row, index) => `${row?.sessionId || "session"}-${row?.studentId || `student-${index}`}`}
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

export { CenterAttendanceHistoryPage };
