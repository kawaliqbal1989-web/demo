import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { getTeacherFinancialOverview } from "../../services/teacherPortalService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { useAuth } from "../../hooks/useAuth";

const PAGE_SIZE = 25;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "-";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const STATUS_STYLES = {
  PAID:     { background: "#ecfccb", color: "#3f6212" },
  PENDING:  { background: "#fffbeb", color: "#b45309" },
  OVERDUE:  { background: "#fee2e2", color: "#b91c1c" },
  NOT_SET:  { background: "#f3f4f6", color: "#374151" }
};
function statusStyle(s) {
  return STATUS_STYLES[String(s || "").toUpperCase()] || STATUS_STYLES.NOT_SET;
}

function toCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function TeacherFeesPage() {
  const { isAuthenticated, authBootstrapPending, mustChangePassword } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const initialized = useRef(false);
  const [payload, setPayload] = useState({
    widgets: null,
    alerts: [],
    items: [],
    total: 0,
    limit: PAGE_SIZE,
    offset: 0
  });

  useEffect(() => {
    if (authBootstrapPending || !isAuthenticated || mustChangePassword) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await getTeacherFinancialOverview({ limit: PAGE_SIZE, offset });
        if (cancelled) return;
        initialized.current = true;
        setPayload(response?.data?.data || {
          widgets: null,
          alerts: [],
          items: [],
          total: 0,
          limit: PAGE_SIZE,
          offset
        });
      } catch (err) {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(err) || "Failed to load teacher fee visibility.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [authBootstrapPending, isAuthenticated, mustChangePassword, offset]);

  const hasPrev = offset > 0;
  const hasNext = Number(payload.total || 0) > offset + Number(payload.limit || PAGE_SIZE);

  const summary = useMemo(() => ({
    pendingFeeStudents: Number(payload?.widgets?.pendingFeeStudents || 0),
    overdueStudents: Number(payload?.widgets?.overdueStudents || 0),
    highRiskStudents: Number(payload?.widgets?.highRiskStudents || 0),
    pendingAmount: Number(payload?.widgets?.pendingAmount || 0),
    collectionRisk: payload?.widgets?.collectionRisk || "NONE"
  }), [payload]);

  const filteredItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return payload.items || [];
    return (payload.items || []).filter(
      (row) =>
        String(row.studentName || "").toLowerCase().includes(term) ||
        String(row.admissionNo || "").toLowerCase().includes(term)
    );
  }, [payload.items, q]);

  return (
    <section className="dash-section">
      <PageHeader
        title="Teacher Fee Visibility"
        subtitle="Read-only financial visibility for assigned students only."
        actions={(
          <>
            <Link className="button secondary" style={{ width: "auto" }} to="/teacher/dashboard">Back to Dashboard</Link>
            <Link className="button" style={{ width: "auto" }} to="/teacher/students">Assigned Students</Link>
          </>
        )}
      />

      {loading && !initialized.current ? <SkeletonLoader variant="card" count={3} /> : null}

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {(initialized.current || !loading) && !error ? (
        <> 
          <div className="dash-kpi-grid">
            <MetricCard label="Pending Fee Students" value={summary.pendingFeeStudents} icon="💳" accent="#b45309" />
            <MetricCard label="Overdue Students" value={summary.overdueStudents} icon="⚠️" accent="#dc2626" />
            <MetricCard label="High Risk Students" value={summary.highRiskStudents} icon="🚨" accent="#991b1b" />
            <MetricCard label="Total Pending" value={toCurrency(summary.pendingAmount)} icon="📈" accent="#1d4ed8" />
            <MetricCard label="Collection Risk" value={summary.collectionRisk} icon="🧭" accent="#334155" />
          </div>

          {Array.isArray(payload.alerts) && payload.alerts.length ? (
            <div className="card" style={{ display: "grid", gap: 8 }}>
              <div className="section-header">
                <span className="section-header__text">Fee Reminder Alerts</span>
              </div>
              {payload.alerts.map((alert) => (
                <article
                  key={alert.id}
                  style={{
                    borderRadius: 10,
                    padding: "10px 12px",
                    border: `1px solid ${alert.severity === "critical" ? "#fecaca" : "#fde68a"}`,
                    background: alert.severity === "critical" ? "#fff1f2" : "#fffbeb"
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{alert.title}</div>
                  <div style={{ fontSize: 12, color: "#4b5563" }}>{alert.message}</div>
                </article>
              ))}
            </div>
          ) : null}

          <div className="card" style={{ display: "grid", gap: 12 }}>
            <div className="section-header">
              <span className="section-header__text">Assigned Student Fee Table</span>
            </div>

            <div style={{ marginBottom: 4 }}>
              <input
                className="input"
                type="search"
                placeholder="Search by name or admission no…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ maxWidth: 320 }}
              />
            </div>

            {Array.isArray(filteredItems) && filteredItems.length ? (
              <div style={{ overflowX: "auto", opacity: loading ? 0.5 : 1, transition: "opacity 0.2s" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>Pending</th>
                      <th style={{ textAlign: "right" }}>Overdue</th>
                      <th>Next Due</th>
                      <th>Latest Payment</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((row) => (
                      <tr key={row.studentId}>
                        <td>
                          <Link
                            to={`/teacher/students/${row.studentId}`}
                            style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
                            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                          >
                            {row.studentName}
                          </Link>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.admissionNo || "-"}</div>
                        </td>
                        <td>
                          {row.totals?.status ? (
                            <span style={{ borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "3px 9px", ...statusStyle(row.totals.status) }}>
                              {row.totals.status}
                            </span>
                          ) : "-"}
                        </td>
                        <td style={{ textAlign: "right" }}>{toCurrency(row.totals?.totalPending)}</td>
                        <td style={{ textAlign: "right" }}>{toCurrency(row.totals?.totalOverdue)}</td>
                        <td>{row.nextDue?.monthLabel || "-"}</td>
                        <td>{fmtDate(row.latestPayment?.paidAt)}</td>
                        <td>
                          <span
                            style={{
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "3px 9px",
                              background: row.riskLevel === "HIGH" ? "#fee2e2" : row.riskLevel === "MEDIUM" ? "#ffedd5" : "#ecfccb",
                              color: row.riskLevel === "HIGH" ? "#b91c1c" : row.riskLevel === "MEDIUM" ? "#b45309" : "#3f6212"
                            }}
                          >
                            {row.riskLevel || "NONE"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
                {q.trim() ? `No students match "${q.trim()}".` : "No assigned students found for the current teacher scope."}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Showing {Number(payload.items?.length || 0)} of {Number(payload.total || 0)} assigned students
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="button secondary" type="button" style={{ width: "auto" }} disabled={!hasPrev} onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}>
                  Previous
                </button>
                <button className="button secondary" type="button" style={{ width: "auto" }} disabled={!hasNext} onClick={() => setOffset((prev) => prev + PAGE_SIZE)}>
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div className="card" style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        Teachers can view assigned student dues, overdue indicators, next due details, and latest payment signals.
        Payment collection, refunds, cancellations, and receipt edits are intentionally not available in this portal.
      </div>
    </section>
  );
}

export { TeacherFeesPage };
