import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listStudentExamsOverview } from "../../services/studentPortalService";

function formatStatus(value) {
  if (!value) return "-";
  if (value === "APPROVED") return "Approved";
  if (value === "REJECTED") return "Rejected";
  if (value === "NOT_SELECTED") return "Not Selected by Center";
  if (value === "NOT_IN_COMBINED_LIST") return "Pending (Center not prepared)";
  if (value === "SUBMITTED_TO_FRANCHISE") return "Submitted to Franchise";
  if (value === "SUBMITTED_TO_BUSINESS_PARTNER") return "Submitted to BP";
  if (value === "SUBMITTED_TO_SUPERADMIN") return "Submitted to Superadmin";
  if (value === "SUBMITTED_TO_CENTER") return "Submitted to Center";
  return String(value).split("_").join(" ");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function computeExamAvailability(examCycle) {
  const examStart = examCycle?.examStartsAt ? new Date(examCycle.examStartsAt) : null;
  const examEnd = examCycle?.examEndsAt ? new Date(examCycle.examEndsAt) : null;
  const now = new Date();
  if (!examStart || Number.isNaN(examStart.getTime()) || !examEnd || Number.isNaN(examEnd.getTime())) {
    return { bucket: "UNKNOWN", canStart: false, label: "Unavailable" };
  }
  if (now.getTime() < examStart.getTime()) return { bucket: "UPCOMING", canStart: false, label: "Not live" };
  if (now.getTime() > examEnd.getTime()) return { bucket: "COMPLETED", canStart: false, label: "Closed" };
  return { bucket: "LIVE", canStart: true, label: "Live" };
}

function formatWorksheetActionLabel(worksheet) {
  if (!worksheet) return "-";
  if (worksheet.status === "IN_PROGRESS") return "Resume";
  if (worksheet.status === "SUBMITTED") return "Submitted";
  if (worksheet.status === "TIMED_OUT") return "Time Up";
  return "Start";
}

function deriveRowBucket(row) {
  if (row?.examCycle?.resultStatus === "PUBLISHED") return "RESULTS";
  const availability = computeExamAvailability(row?.examCycle);
  return availability.bucket;
}

function SummaryCard({ label, value, hint, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card"
      style={{
        textAlign: "left",
        cursor: "pointer",
        display: "grid",
        gap: 6,
        minHeight: 96,
        borderColor: active ? "#2563eb" : undefined,
        background: active ? "#eff6ff" : undefined
      }}
    >
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900 }}>{Number(value || 0).toLocaleString()}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{hint}</div> : null}
    </button>
  );
}

function StudentExamsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    listStudentExamsOverview()
      .then((res) => {
        if (cancelled) return;
        const data = Array.isArray(res.data?.data) ? res.data.data : [];
        setRows(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load exams.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.ALL += 1;
        const bucket = deriveRowBucket(row);
        acc[bucket] = (acc[bucket] || 0) + 1;
        if (row?.examWorksheet?.status === "IN_PROGRESS") acc.IN_PROGRESS += 1;
        return acc;
      },
      { ALL: 0, UPCOMING: 0, LIVE: 0, COMPLETED: 0, RESULTS: 0, IN_PROGRESS: 0, UNKNOWN: 0 }
    );
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const bucket = deriveRowBucket(row);
      if (filter !== "ALL" && bucket !== filter && !(filter === "IN_PROGRESS" && row?.examWorksheet?.status === "IN_PROGRESS")) {
        return false;
      }
      if (!q) return true;
      return [
        row?.examCycle?.name,
        row?.examCycle?.code,
        formatStatus(row?.enrollmentStatus),
        row?.examWorksheet?.title
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [rows, filter, search]);

  if (loading) {
    return <LoadingState label="Loading exams..." />;
  }

  const cards = [
    { key: "ALL", label: "All Exams", value: summary.ALL, hint: "Enrolled exam cycles" },
    { key: "UPCOMING", label: "Upcoming", value: summary.UPCOMING, hint: "Not live yet" },
    { key: "LIVE", label: "Live", value: summary.LIVE, hint: "Available now" },
    { key: "IN_PROGRESS", label: "In Progress", value: summary.IN_PROGRESS, hint: "Resume attempts" },
    { key: "COMPLETED", label: "Completed", value: summary.COMPLETED, hint: "Exam window closed" },
    { key: "RESULTS", label: "Results", value: summary.RESULTS, hint: "Published by Superadmin" }
  ];

  return (
    <section className="dash-section" style={{ display: "grid", gap: 12 }}>
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0 }}>My Exams</h2>
          <div className="dash-card__subtitle" style={{ marginTop: 6 }}>
            Exam enrollment status, live attempts, and published results.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 12 }}>
        {cards.map(({ key, ...card }) => (
          <SummaryCard
            key={key}
            {...card}
            active={filter === key}
            onClick={() => setFilter(key)}
          />
        ))}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Search
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Exam name, code, worksheet" />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            View
            <select className="input" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="ALL">All exams</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="LIVE">Live</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="RESULTS">Results available</option>
            </select>
          </label>
          <Link className="button secondary" style={{ width: "auto" }} to="/student/abacus-practice">
            Abacus Practice (Auto)
          </Link>
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Showing {visibleRows.length} of {rows.length} exams.</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="card dash-card">
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Status</th>
                <th>Window</th>
                <th>Attempt</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length ? (
                visibleRows.map((row) => {
                  const worksheet = row?.examWorksheet;
                  const canViewResult = row?.examCycle?.resultStatus === "PUBLISHED";
                  const availability = computeExamAvailability(row?.examCycle);

                  return (
                    <tr key={row.entryId}>
                      <td>
                        <div style={{ display: "grid", gap: 2 }}>
                          <strong>{row?.examCycle?.name || "-"}</strong>
                          <span className="muted" style={{ fontSize: 12 }}>{row?.examCycle?.code || "-"}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "grid", gap: 4 }}>
                          <StatusBadge status={row?.enrollmentStatus || "PENDING"} />
                          <span className="muted" style={{ fontSize: 12 }}>{formatStatus(row?.enrollmentStatus)}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "grid", gap: 2, minWidth: 220 }}>
                          <span>Starts: {formatDateTime(row?.examCycle?.examStartsAt)}</span>
                          <span>Ends: {formatDateTime(row?.examCycle?.examEndsAt)}</span>
                        </div>
                      </td>
                      <td>
                        {worksheet?.worksheetId && (worksheet.status === "SUBMITTED" || worksheet.status === "TIMED_OUT") ? (
                          <button className="button" style={{ width: "auto" }} type="button" disabled>
                            {formatWorksheetActionLabel(worksheet)}
                          </button>
                        ) : worksheet?.worksheetId && availability.canStart ? (
                          <Link className="button" style={{ width: "auto" }} to={`/student/worksheets/${worksheet.worksheetId}`}>
                            {formatWorksheetActionLabel(worksheet)}
                          </Link>
                        ) : worksheet?.worksheetId ? (
                          <button className="button" style={{ width: "auto" }} type="button" disabled>
                            {availability.label || "Unavailable"}
                          </button>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>
                        {canViewResult ? (
                          <Link className="button secondary" style={{ width: "auto" }} to={`/student/exams/${row.examCycleId}/result`}>
                            View Result
                          </Link>
                        ) : (
                          <span className="muted">Awaiting publication</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="muted">
                    No exams match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export { StudentExamsPage };
