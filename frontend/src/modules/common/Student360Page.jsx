import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { getStudent360 as centerGet360 } from "../../services/centerService";
import { getStudent360 as teacherGet360 } from "../../services/teacherPortalService";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

const RISK_COLORS = {
  HEALTHY: { bg: "var(--color-bg-success-light)", fg: "var(--color-text-success)", label: "Healthy" },
  ATTENTION: { bg: "var(--color-bg-warn-light)", fg: "var(--color-text-warning)", label: "Needs Attention" },
  AT_RISK: { bg: "var(--color-bg-danger-light)", fg: "var(--color-text-danger)", label: "At Risk" },
};

const STATUS_COLORS = {
  PRESENT: { bg: "var(--color-bg-success-light)", fg: "var(--color-text-success)" },
  ABSENT: { bg: "var(--color-bg-danger-light)", fg: "var(--color-text-danger)" },
  LATE: { bg: "var(--color-bg-warn-light)", fg: "var(--color-text-warning)" },
  EXCUSED: { bg: "var(--color-bg-info-light)", fg: "var(--color-text-info)" },
};

const ACTIVITY_ICONS = {
  WORKSHEET: "📝",
  ATTENDANCE: "📋",
  PAYMENT: "💳",
  NOTE: "📌",
  MOCK_TEST: "📊",
};

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Student360Page() {
  const { studentId } = useParams();
  const { role } = useAuth();

  const isCenter = role === "CENTER";
  const fetch360 = isCenter ? centerGet360 : teacherGet360;
  const backLink = isCenter
    ? `/center/students/${studentId}`
    : `/teacher/students/${studentId}`;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch360(studentId)
      .then((res) => {
        if (cancelled) return;
        // Service layers are inconsistent across modules: some return the
        // envelope ({ success, data }), others return payload directly.
        const payload = res?.data ?? res ?? null;
        setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(getFriendlyErrorMessage(err) || "Failed to load student data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  if (loading) return <LoadingState />;
  if (error) return <div className="card"><p className="error">{error}</p><Link className="button secondary" to={backLink}>← Back</Link></div>;
  if (!data) return <div className="card"><p>No data found.</p><Link className="button secondary" to={backLink}>← Back</Link></div>;

  const { student, performance, promotion, attendance, fees, engagement, risk, recentActivity, insights } = data;
  if (!student) {
    return <div className="card"><p>No student data found.</p><Link className="button secondary" to={backLink}>← Back</Link></div>;
  }
  const riskInfo = RISK_COLORS[risk?.level] || RISK_COLORS.HEALTHY;
  const fullName = [student.firstName, student.lastName].filter(Boolean).join(" ") || "—";

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {/* Back link */}
      <div><Link className="button secondary" to={backLink}>← Back to Student</Link></div>

      {/* ── Header Card ── */}
      <div className="card" style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{fullName}</h2>
            <span style={{
              padding: "2px 10px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 600,
              background: riskInfo.bg,
              color: riskInfo.fg,
            }}>
              {riskInfo.label}
            </span>
            {!student.isActive && (
              <span style={{ padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: "var(--color-bg-muted)", color: "var(--color-text-muted)" }}>
                Inactive
              </span>
            )}
          </div>
          <div className="info-grid" style={{ gridTemplateColumns: "auto 1fr", gap: "4px 16px", fontSize: 14 }}>
            <span className="info-grid__label">Admission #</span>
            <span className="info-grid__value">{student.admissionNo || "—"}</span>
            <span className="info-grid__label">Course</span>
            <span className="info-grid__value">{student.course?.name || "—"}</span>
            <span className="info-grid__label">Level</span>
            <span className="info-grid__value">{student.level?.name || "—"}</span>
            <span className="info-grid__label">Batch</span>
            <span className="info-grid__value">{student.batch?.name || "—"}</span>
            <span className="info-grid__label">Teacher</span>
            <span className="info-grid__value">{student.teacher?.fullName || student.teacher?.username || "—"}</span>
            <span className="info-grid__label">Guardian</span>
            <span className="info-grid__value">{student.guardianName || "—"}{student.guardianPhone ? ` • ${student.guardianPhone}` : ""}</span>
            <span className="info-grid__label">Joined</span>
            <span className="info-grid__value">{formatDate(student.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* ── AI Insights ── */}
      {insights && insights.length > 0 && (
        <div className="card" style={{ background: "var(--color-bg-warning)", borderLeft: "4px solid #f59e0b" }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: 15 }}>💡 Insights & Recommendations</h3>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {insights.map((ins, i) => (
              <li key={i} style={{ marginBottom: 4, fontSize: 14 }}>
                <strong style={{ color: ins.type === "alert" || ins.type === "warning" ? "#dc2626" : ins.type === "info" ? "#d97706" : "#059669" }}>
                  {ins.type === "alert" ? "⚠️" : ins.type === "warning" ? "🔔" : "✅"}
                </strong>{" "}
                {ins.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Risk Indicators ── */}
      {risk?.indicators?.length > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 8px 0", fontSize: 15 }}>🛡️ Risk Indicators (Score: {risk.score}/6)</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {risk.indicators.map((ind) => (
              <span
                key={ind.key}
                style={{
                  padding: "4px 12px",
                  borderRadius: 16,
                  fontSize: 12,
                  fontWeight: 500,
                  background: ind.triggered ? "var(--color-bg-danger-light)" : "var(--color-bg-success-light)",
                  color: ind.triggered ? "var(--color-text-danger)" : "var(--color-text-success)",
                  border: `1px solid ${ind.triggered ? "var(--color-border-danger-light)" : "var(--color-border-success-light)"}`,
                }}
              >
                {ind.triggered ? "✗" : "✓"} {ind.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Metrics Row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {/* Performance */}
        <div className="card">
          <h4 style={{ margin: "0 0 8px 0", fontSize: 14, color: "var(--color-text-muted)" }}>📈 Performance</h4>
          <MetricRow label="Accuracy (last 5)" value={performance?.accuracyLast5 != null ? `${Math.round(performance.accuracyLast5)}%` : "—"} />
          <MetricRow label="Best Score" value={performance?.bestScore != null ? `${performance.bestScore}%` : "—"} />
          <MetricRow label="Total Attempts" value={performance?.totalAttempts ?? "—"} />
          <MetricRow label="Consistency" value={performance?.consistencyScore != null ? `${Math.round(performance.consistencyScore)}%` : "—"} />
          <MetricRow label="Trend" value={
            performance?.improvementTrend != null
              ? (performance.improvementTrend > 0 ? `↑ ${performance.improvementTrend}%` : performance.improvementTrend < 0 ? `↓ ${Math.abs(performance.improvementTrend)}%` : "→ Flat")
              : "—"
          } color={performance?.improvementTrend > 0 ? "#16a34a" : performance?.improvementTrend < 0 ? "#dc2626" : undefined} />
        </div>

        {/* Attendance */}
        <div className="card">
          <h4 style={{ margin: "0 0 8px 0", fontSize: 14, color: "var(--color-text-muted)" }}>📋 Attendance (30 days)</h4>
          <MetricRow label="Rate" value={attendance?.last30?.rate != null ? `${attendance.last30.rate}%` : "—"} color={attendance?.last30?.rate >= 80 ? "#16a34a" : attendance?.last30?.rate >= 60 ? "#d97706" : "#dc2626"} />
          <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            {["PRESENT", "ABSENT", "LATE", "EXCUSED"].map((s) => {
              const c = STATUS_COLORS[s];
              return (
                <span key={s} style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: c.bg, color: c.fg }}>
                  {s}: {attendance?.last30?.[s.toLowerCase()] ?? 0}
                </span>
              );
            })}
          </div>
          <MetricRow label="Streak" value={`${attendance?.streakDays ?? 0} days`} />
        </div>

        {/* Fees */}
        <div className="card">
          <h4 style={{ margin: "0 0 8px 0", fontSize: 14, color: "var(--color-text-muted)" }}>💰 Fees</h4>
          <MetricRow label="Total Due" value={`₹${fees?.totalDue ?? 0}`} />
          <MetricRow label="Total Paid" value={`₹${fees?.totalPaid ?? 0}`} />
          {fees?.overdueCount > 0 && (
            <MetricRow label="Overdue" value={`₹${fees.overdueAmount} (${fees.overdueCount} installment${fees.overdueCount > 1 ? "s" : ""})`} color="#dc2626" />
          )}
          {fees?.nextInstallment && (
            <MetricRow label="Next Due" value={`₹${fees.nextInstallment.amount} on ${formatDate(fees.nextInstallment.dueDate)}`} />
          )}
        </div>

        {/* Promotion */}
        <div className="card">
          <h4 style={{ margin: "0 0 8px 0", fontSize: 14, color: "var(--color-text-muted)" }}>🎓 Promotion</h4>
          <MetricRow label="Eligible" value={promotion?.eligible ? "Yes" : "No"} color={promotion?.eligible ? "#16a34a" : "#dc2626"} />
          {promotion?.reasons?.length > 0 && !promotion.eligible && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12, color: "var(--color-text-muted)" }}>
              {promotion.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          {promotion?.metrics && (
            <>
              <MetricRow label="Worksheets" value={`${promotion.metrics.completedWorksheets ?? 0}/${promotion.metrics.totalWorksheets ?? 0}`} />
              <MetricRow label="Exam Score" value={promotion.metrics.examScore != null ? `${promotion.metrics.examScore}%` : "—"} />
            </>
          )}
        </div>
      </div>

      {/* ── Engagement ── */}
      <div className="card">
        <h3 style={{ margin: "0 0 8px 0", fontSize: 15 }}>🔥 Engagement</h3>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14 }}>
          <MetricRow label="Last Activity" value={engagement?.lastWorksheetDate ? `${formatDate(engagement.lastWorksheetDate)} (${engagement.daysSinceLastActivity ?? "—"} days ago)` : "No activity"} />
          <MetricRow label="Practice Attempts" value={engagement?.totalPracticeAttempts ?? 0} />
          <MetricRow label="Practice Avg Score" value={engagement?.practiceAvgScore != null ? `${engagement.practiceAvgScore}%` : "—"} />
        </div>
        {engagement?.practiceFeatures?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Practice Features:</span>{" "}
            {engagement.practiceFeatures.map((pf) => (
              <span key={pf.featureKey} style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "var(--color-bg-info-light)", color: "var(--color-text-info)", marginRight: 6 }}>
                {pf.featureKey}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Activity Timeline ── */}
      {recentActivity?.length > 0 && (
        <div className="card">
          <h3 style={{ margin: "0 0 8px 0", fontSize: 15 }}>🕐 Recent Activity</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {recentActivity.map((act, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, padding: "4px 0", borderBottom: i < recentActivity.length - 1 ? "1px solid var(--color-border-divider)" : "none" }}>
                <span style={{ fontSize: 16 }}>{ACTIVITY_ICONS[act.type] || "•"}</span>
                <span style={{ flex: 1 }}><strong>{act.title}</strong> — {act.detail}</span>
                <span style={{ color: "var(--color-text-faint)", fontSize: 12, whiteSpace: "nowrap" }}>{formatDate(act.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Quick Actions ── */}
      <div className="card">
        <h3 style={{ margin: "0 0 8px 0", fontSize: 15 }}>⚡ Quick Actions</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="button secondary" to={`${backLink}/assign-worksheets`}>Assign Worksheets</Link>
          <Link className="button secondary" to={`${backLink}/attendance`}>Attendance History</Link>
          {isCenter && <Link className="button secondary" to={`${backLink}/fees`}>View Fees</Link>}
          {isCenter && <Link className="button secondary" to={`${backLink}/notes`}>Notes</Link>}
          {!isCenter && <Link className="button secondary" to={`/teacher/notes?studentId=${studentId}`}>Notes</Link>}
          {!isCenter && <Link className="button secondary" to={`${backLink}/attempts`}>View Attempts</Link>}
          {!isCenter && <Link className="button secondary" to={`${backLink}/materials`}>View Materials</Link>}
          {!isCenter && <Link className="button secondary" to={`${backLink}/practice-report`}>Practice Report</Link>}
        </div>
      </div>
    </section>
  );
}

function MetricRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0" }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || "var(--color-text-primary)" }}>{value}</span>
    </div>
  );
}

export { Student360Page };
