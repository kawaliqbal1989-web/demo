import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { getTeacherFinancialOverview } from "../../services/teacherPortalService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { useAuth } from "../../hooks/useAuth";

const PAGE_SIZE = 25;

function toCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function TeacherFeesPage() {
  const { isAuthenticated, authBootstrapPending, mustChangePassword } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
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

      {loading ? <SkeletonLoader variant="card" count={3} /> : null}

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {!loading && !error ? (
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

            {Array.isArray(payload.items) && payload.items.length ? (
              <div style={{ overflowX: "auto" }}>
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
                    {payload.items.map((row) => (
                      <tr key={row.studentId}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{row.studentName}</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{row.admissionNo || "-"}</div>
                        </td>
                        <td>{row.totals?.status || "-"}</td>
                        <td style={{ textAlign: "right" }}>{toCurrency(row.totals?.totalPending)}</td>
                        <td style={{ textAlign: "right" }}>{toCurrency(row.totals?.totalOverdue)}</td>
                        <td>{row.nextDue?.monthLabel || "-"}</td>
                        <td>{row.latestPayment?.paidAt ? new Date(row.latestPayment.paidAt).toLocaleDateString() : "-"}</td>
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
                No assigned students found for the current teacher scope.
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
