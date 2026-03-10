import { useEffect, useMemo, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import {
  getStudentMe,
  getStudentPracticeReport,
  getStudentWeakTopics,
  listStudentAttendance,
  listStudentWorksheets,
  listStudentExamEnrollments,
  listStudentEnrollments,
  getStudentPerformanceTrends
} from "../../services/studentPortalService";
import { isAttendancePresentLike } from "../../utils/attendance";

/* ------------------------------------------------------------------ */
/*  Tiny CSS-only chart components                                    */
/* ------------------------------------------------------------------ */

function ProgressRing({ value, label, color = "#2563eb", size = 100 }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value || 0));
  const offset = c - (c * pct) / 100;

  return (
    <div style={{ textAlign: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-bg-badge)" strokeWidth={10} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div style={{ marginTop: -size / 2 - 14, fontWeight: 800, fontSize: 20, lineHeight: `${size}px` }}>
        {pct}%
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function BarChart({ data, maxValue, barColor = "#2563eb", height = 140 }) {
  if (!data?.length) return <div className="muted">No data yet</div>;

  const max = maxValue || Math.max(...data.map((d) => d.value), 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, padding: "0 4px" }}>
      {data.map((d, i) => {
        const h = Math.max(4, (d.value / max) * (height - 24));
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 700 }}>{d.value}</div>
            <div
              title={`${d.label}: ${d.value}`}
              style={{
                width: "100%",
                maxWidth: 32,
                height: h,
                background: d.color || barColor,
                borderRadius: "4px 4px 0 0",
                transition: "height 0.4s ease"
              }}
            />
            <div style={{ fontSize: 9, color: "var(--color-text-muted)", textAlign: "center", lineHeight: 1.1 }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBar({ label, value, max, color = "#2563eb" }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 8, background: "var(--color-bg-badge)", borderRadius: 4 }}>
        <div
          style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: color, transition: "width .4s" }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Progress Page                                                */
/* ------------------------------------------------------------------ */

function StudentProgressPage() {
  const [me, setMe] = useState(null);
  const [report, setReport] = useState(null);
  const [weakTopics, setWeakTopics] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [worksheets, setWorksheets] = useState([]);
  const [exams, setExams] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [perfTrends, setPerfTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      getStudentMe(),
      getStudentPracticeReport(),
      getStudentWeakTopics({ threshold: 60 }),
      listStudentAttendance({ limit: 30 }),
      listStudentWorksheets({ page: 1, pageSize: 100 }),
      listStudentExamEnrollments(),
      listStudentEnrollments({}),
      getStudentPerformanceTrends()
    ])
      .then(([meRes, reportRes, weakRes, attRes, wsRes, examRes, enrollRes, perfRes]) => {
        if (cancelled) return;
        setMe(meRes.data?.data || null);
        setReport(reportRes.data?.data || null);
        setWeakTopics(Array.isArray(weakRes.data?.data) ? weakRes.data.data : []);
        setAttendance(Array.isArray(attRes.data?.data) ? attRes.data.data : []);
        const items = wsRes.data?.data?.items;
        setWorksheets(Array.isArray(items) ? items : []);
        setExams(Array.isArray(examRes.data?.data) ? examRes.data.data : []);
        setEnrollments(Array.isArray(enrollRes.data?.data) ? enrollRes.data.data : []);
        setPerfTrends(perfRes.data?.data || null);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load progress data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  /* ---- Derived Data ---- */

  const worksheetStats = useMemo(() => {
    const total = worksheets.length;
    const completed = worksheets.filter((w) => w?.status === "COMPLETED" || w?.status === "SUBMITTED").length;
    const inProgress = worksheets.filter((w) => w?.status === "IN_PROGRESS").length;
    const notStarted = worksheets.filter((w) => w?.status === "NOT_STARTED").length;
    return { total, completed, inProgress, notStarted };
  }, [worksheets]);

  const recentScores = useMemo(() => {
    const recent = report?.recent;
    if (!Array.isArray(recent) || !recent.length) return [];
    return recent
      .filter((r) => r?.score != null)
      .slice(0, 10)
      .map((r) => ({
        label: (r.worksheetTitle || "WS").substring(0, 8),
        value: Math.round(Number(r.score))
      }))
      .reverse();
  }, [report]);

  const attendanceStats = useMemo(() => {
    const total = attendance.length;
    const present = attendance.filter((a) => isAttendancePresentLike(a?.status)).length;
    const absent = attendance.filter((a) => a?.status === "ABSENT").length;
    const late = attendance.filter((a) => a?.status === "LATE").length;
    return { total, present, absent, late, pct: total ? Math.round((present / total) * 100) : 0 };
  }, [attendance]);

  const weeklyAttendance = useMemo(() => {
    return attendance.slice(0, 7).reverse().map((a) => ({
      label: a?.date ? new Date(a.date).toLocaleDateString(undefined, { weekday: "short" }) : "?",
      value: isAttendancePresentLike(a?.status) ? 1 : 0,
      color: a?.status === "PRESENT" ? "#22c55e" : a?.status === "LATE" ? "#f59e0b" : "#ef4444"
    }));
  }, [attendance]);

  const topicAccuracyData = useMemo(() => {
    return weakTopics.slice(0, 8).map((t) => ({
      label: (t.topic || "").substring(0, 10),
      value: t.accuracy ?? 0
    }));
  }, [weakTopics]);

  const completionPct = worksheetStats.total
    ? Math.round((worksheetStats.completed / worksheetStats.total) * 100)
    : 0;

  if (loading) return <LoadingState label="Loading your progress..." />;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>📊 My Progress</h2>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
          Track your learning journey — worksheets, scores, attendance, and more.
        </div>
      </div>

      {error ? <div className="card" style={{ color: "#ef4444" }}>{error}</div> : null}

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {[
          { label: "Total Attempts", value: report?.totalAttempts ?? 0, color: "#2563eb" },
          { label: "Average Score", value: report?.avgScore != null ? `${report.avgScore}%` : "—", color: "#8b5cf6" },
          { label: "Worksheets Done", value: worksheetStats.completed, color: "#22c55e" },
          { label: "Attendance", value: `${attendanceStats.pct}%`, color: "#f59e0b" },
          { label: "Enrollments", value: enrollments.length, color: "#06b6d4" },
          { label: "Exams", value: exams.length, color: "#ec4899" }
        ].map((kpi) => (
          <div key={kpi.label} className="card" style={{ textAlign: "center", padding: "12px 8px" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>

        {/* Completion ring */}
        <div className="card" style={{ display: "grid", gap: 8, justifyItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Worksheet Completion</div>
          <ProgressRing value={completionPct} label="completed" color="#22c55e" size={120} />
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--color-text-muted)" }}>
            <span>✅ Done: {worksheetStats.completed}</span>
            <span>🔄 In Progress: {worksheetStats.inProgress}</span>
            <span>⬜ Not Started: {worksheetStats.notStarted}</span>
          </div>
        </div>

        {/* Avg score ring */}
        <div className="card" style={{ display: "grid", gap: 8, justifyItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Average Score</div>
          <ProgressRing
            value={report?.avgScore ?? 0}
            label="avg score"
            color={
              (report?.avgScore ?? 0) >= 80
                ? "#22c55e"
                : (report?.avgScore ?? 0) >= 50
                  ? "#f59e0b"
                  : "#ef4444"
            }
            size={120}
          />
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Based on {report?.totalAttempts ?? 0} attempt(s)
          </div>
        </div>

        {/* Attendance ring */}
        <div className="card" style={{ display: "grid", gap: 8, justifyItems: "center" }}>
          <div style={{ fontWeight: 700 }}>Attendance Rate</div>
          <ProgressRing
            value={attendanceStats.pct}
            label="attendance"
            color={attendanceStats.pct >= 80 ? "#22c55e" : attendanceStats.pct >= 50 ? "#f59e0b" : "#ef4444"}
            size={120}
          />
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--color-text-muted)" }}>
            <span>✅ {attendanceStats.present}</span>
            <span>❌ {attendanceStats.absent}</span>
            <span>⏰ {attendanceStats.late}</span>
          </div>
        </div>
      </div>

      {/* Score history bar chart */}
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Recent Scores (last 10 worksheets)</div>
        {recentScores.length ? (
          <BarChart data={recentScores} maxValue={100} barColor="#8b5cf6" height={140} />
        ) : (
          <div className="muted">No scores recorded yet.</div>
        )}
      </div>

      {/* Weekly attendance visual */}
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>This Week's Attendance</div>
        {weeklyAttendance.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {weeklyAttendance.map((d, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: d.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14
                  }}
                >
                  {d.value ? "✓" : "✗"}
                </div>
                <div style={{ fontSize: 10, marginTop: 2, color: "var(--color-text-muted)" }}>{d.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">No attendance records in range.</div>
        )}
      </div>

      {/* Weak topics horizontal bars */}
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Weak Topics (accuracy below 60%)</div>
        {topicAccuracyData.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {weakTopics.slice(0, 10).map((t) => (
              <HorizontalBar
                key={t.topic}
                label={t.topic}
                value={t.accuracy ?? 0}
                max={100}
                color={
                  (t.accuracy ?? 0) < 30 ? "#ef4444" : (t.accuracy ?? 0) < 50 ? "#f59e0b" : "#eab308"
                }
              />
            ))}
          </div>
        ) : (
          <div className="muted">No weak topics — great job! 🎉</div>
        )}
      </div>

      {/* Performance Trends */}
      {perfTrends && (perfTrends.currentLevel || (perfTrends.trends && perfTrends.trends.length > 0)) && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>📈 Performance Trends</div>

          {perfTrends.currentLevel && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { label: "Avg Accuracy (Last 5)", value: perfTrends.currentLevel.averageAccuracyLast5 != null ? `${perfTrends.currentLevel.averageAccuracyLast5}%` : "—", color: "#2563eb" },
                { label: "Best Score", value: perfTrends.currentLevel.bestScore != null ? perfTrends.currentLevel.bestScore : "—", color: "#8b5cf6" },
                { label: "Total Attempts", value: perfTrends.currentLevel.totalAttempts ?? 0, color: "#22c55e" },
                {
                  label: "Improvement",
                  value: perfTrends.currentLevel.improvementTrendPercentage != null
                    ? `${perfTrends.currentLevel.improvementTrendPercentage > 0 ? "▲" : perfTrends.currentLevel.improvementTrendPercentage < 0 ? "▼" : "—"} ${Math.abs(perfTrends.currentLevel.improvementTrendPercentage)}%`
                    : "—",
                  color: perfTrends.currentLevel.improvementTrendPercentage > 0 ? "#16a34a" : perfTrends.currentLevel.improvementTrendPercentage < 0 ? "#dc2626" : "var(--color-text-muted)"
                }
              ].map((kpi) => (
                <div key={kpi.label} style={{ textAlign: "center", padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 8, minWidth: 110 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{kpi.label}</div>
                </div>
              ))}
            </div>
          )}

          {perfTrends.trends && perfTrends.trends.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Per-Level Trends</div>
              <div style={{ display: "grid", gap: 6 }}>
                {perfTrends.trends.map((t) => (
                  <div key={t.levelId} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, padding: "6px 10px", border: "1px solid var(--color-border-divider)", borderRadius: 6 }}>
                    <span style={{ fontWeight: 600, minWidth: 80 }}>Level {t.levelId?.slice(0, 8) || "?"}</span>
                    <span style={{ color: t.accuracyTrendPercentage > 0 ? "#16a34a" : t.accuracyTrendPercentage < 0 ? "#dc2626" : "var(--color-text-muted)" }}>
                      {t.accuracyTrendPercentage != null ? `${t.accuracyTrendPercentage > 0 ? "▲" : t.accuracyTrendPercentage < 0 ? "▼" : "—"} ${Math.abs(t.accuracyTrendPercentage)}% accuracy` : "—"}
                    </span>
                    <span style={{ color: t.timeTrendPercentage > 0 ? "#16a34a" : t.timeTrendPercentage < 0 ? "#dc2626" : "var(--color-text-muted)" }}>
                      {t.timeTrendPercentage != null ? `${t.timeTrendPercentage > 0 ? "▲" : t.timeTrendPercentage < 0 ? "▼" : "—"} ${Math.abs(t.timeTrendPercentage)}% speed` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Exam results */}
      {exams.length ? (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Exam Enrollments</div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => (
                  <tr key={e.entryId}>
                    <td>{e?.examCycle?.name || "—"}</td>
                    <td>{e?.status || "—"}</td>
                    <td>{e?.examCycle?.examStartsAt ? new Date(e.examCycle.examStartsAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { StudentProgressPage };
