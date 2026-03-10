import { useEffect, useMemo, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { getStudentPracticeReport } from "../../services/studentPortalService";
import { Link } from "react-router-dom";

function formatSeconds(secs) {
  const safe = Number.isFinite(Number(secs)) ? Math.max(0, Math.floor(Number(secs))) : null;
  if (safe === null) return "—";
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function StudentResultsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getStudentPracticeReport({ limit: 200 })
      .then((res) => {
        if (cancelled) return;
        const recent = res.data?.data?.recent;
        setRows(Array.isArray(recent) ? recent : []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load results.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    let out = Array.isArray(rows) ? [...rows] : [];
    if (q) {
      out = out.filter((r) => {
        const title = String(r.worksheetTitle || "").toLowerCase();
        const date = r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "";
        const score = r.score == null ? "" : String(r.score);
        return title.includes(q) || date.includes(q) || score.includes(q);
      });
    }

    out.sort((a, b) => {
      if (sortBy === "score") {
        const va = Number.isFinite(Number(a.score)) ? Number(a.score) : -Infinity;
        const vb = Number.isFinite(Number(b.score)) ? Number(b.score) : -Infinity;
        return sortDir === "asc" ? va - vb : vb - va;
      }
      // default: date
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return sortDir === "asc" ? ta - tb : tb - ta;
    });

    return out;
  }, [rows, search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (loading) {
    return <LoadingState label="Loading results..." />;
  }

  return (
    <section className="dash-section">
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0 }}>Results</h2>
          <div className="dash-card__subtitle" style={{ marginTop: 6 }}>
            Latest worksheet submissions.
          </div>
        </div>
        <div className="dash-header__actions">
          <input
            placeholder="Search worksheet, date, score"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border-strong)" }}
          />

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
            <option value="date">Sort: Date</option>
            <option value="score">Sort: Score</option>
          </select>

          <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>

          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ padding: 8, borderRadius: 8 }}>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
          </select>

          <button
            className="button secondary"
            style={{ width: "auto" }}
            onClick={() => {
              // export visible rows as CSV
              const cols = ["Date", "Worksheet", "Score", "Total"];
              const lines = [cols.join(",")];
              for (const r of filtered) {
                const date = r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "";
                const title = `"${(r.worksheetTitle||"").replace(/"/g, '""') }"`;
                const score = r.score == null ? "" : `${r.score}%`;
                const total = r.total ?? "";
                lines.push([date, title, score, total].join(','));
              }
              const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `practice-results-${new Date().toISOString().slice(0,10)}.csv`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            }}
          >
            Export
          </button>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="card dash-card">
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Worksheet</th>
                <th>Score</th>
                <th>Correct</th>
                <th>Total</th>
                <th>Attempted Time</th>
                <th>Limit</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? (
                pageRows.map((r) => (
                  <tr key={r.resultId || `${r.worksheetId}_${r.submittedAt || ''}`}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "—"}</td>
                    <td style={{ minWidth: 320 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          {r.worksheetTitle || "—"}
                          {r.source === "ARCHIVED_REASSIGNMENT" ? (
                            <div className="muted" style={{ fontSize: 11 }}>Archived before reassignment</div>
                          ) : null}
                        </div>
                        <div style={{ marginLeft: 12 }}>
                          <Link className="button secondary" style={{ width: "auto", marginRight: 8 }} to={`/student/worksheets/${r.worksheetId}`}>
                            View
                          </Link>
                        </div>
                      </div>
                    </td>
                    <td>{r.score == null ? "—" : `${Number(r.score).toFixed(2)}%`}</td>
                    <td>{r.correctCount ?? "—"}</td>
                    <td>{r.total ?? "—"}</td>
                    <td>{r.completionTimeSeconds == null ? "—" : formatSeconds(r.completionTimeSeconds)}</td>
                    <td>{r.timeLimitSeconds == null ? "—" : formatSeconds(r.timeLimitSeconds)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    —
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
        <button className="button secondary" onClick={() => setPage(Math.max(1, page-1))} disabled={page<=1}>Prev</button>
        <div className="muted">Page {page} / {totalPages}</div>
        <button className="button secondary" onClick={() => setPage(Math.min(totalPages, page+1))} disabled={page>=totalPages}>Next</button>
      </div>
    </section>
  );
}

export { StudentResultsPage };
