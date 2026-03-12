import { useEffect, useMemo, useState } from "react";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { PageHeader } from "../../components/PageHeader";
import { ReadinessGauge, PerformanceExplainer, StreakBar } from "../../components/StudentCoach";
import { getCoachDashboard } from "../../services/studentCoachService";
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

function ProgressRing({ value, label, color = "#2563eb", size = 100 }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  const offset = circumference - (circumference * percent) / 100;
  const valueFontSize = Math.max(20, Math.round(size * 0.18));

  return (
    <div className="progress-ring" style={{ "--progress-ring-size": `${size}px`, "--progress-ring-value-size": `${valueFontSize}px` }}>
      <div className="progress-ring__visual">
        <svg className="progress-ring__svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-bg-badge)" strokeWidth={10} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="progress-ring__value">{percent}%</div>
      </div>
      <div className="progress-ring__label">{label}</div>
    </div>
  );
}

function BarChart({ data, maxValue, barColor = "#2563eb", height = 140 }) {
  if (!data?.length) {
    return <div className="muted">No data yet</div>;
  }

  const max = maxValue || Math.max(...data.map((item) => item.value), 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, padding: "0 4px" }}>
      {data.map((item, index) => {
        const barHeight = Math.max(4, (item.value / max) * (height - 24));
        return (
          <div key={`${item.label}-${index}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 700 }}>{item.value}</div>
            <div
              title={`${item.label}: ${item.value}`}
              style={{
                width: "100%",
                maxWidth: 32,
                height: barHeight,
                background: item.color || barColor,
                borderRadius: "4px 4px 0 0",
                transition: "height 0.4s ease"
              }}
            />
            <div style={{ fontSize: 9, color: "var(--color-text-muted)", textAlign: "center", lineHeight: 1.1 }}>{item.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function HorizontalBar({ label, value, max, color = "#2563eb" }) {
  const percent = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, gap: 12 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700 }}>{value}</span>
      </div>
      <div style={{ height: 8, background: "var(--color-bg-badge)", borderRadius: 4 }}>
        <div style={{ width: `${percent}%`, height: "100%", borderRadius: 4, background: color, transition: "width .4s" }} />
      </div>
    </div>
  );
}

function formatCenterLabel(name, code) {
  const safeName = String(name || "").trim();
  const safeCode = String(code || "").trim();
  if (safeName && safeCode) {
    return `${safeName} (${safeCode})`;
  }
  return safeName || safeCode || "—";
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return "ST";
  }

  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function formatDelta(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return { text: "—", color: "var(--color-text-muted)" };
  }
  if (numeric > 0) {
    return { text: `+${Math.abs(numeric)}%`, color: "var(--color-success)" };
  }
  if (numeric < 0) {
    return { text: `-${Math.abs(numeric)}%`, color: "var(--color-danger)" };
  }
  return { text: "0%", color: "var(--color-text-muted)" };
}

function StudentProgressPage() {
  const [me, setMe] = useState(null);
  const [report, setReport] = useState(null);
  const [weakTopics, setWeakTopics] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [worksheets, setWorksheets] = useState([]);
  const [exams, setExams] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [perfTrends, setPerfTrends] = useState(null);
  const [coach, setCoach] = useState(null);
  const [coachLoading, setCoachLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

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
      .then(([meRes, reportRes, weakRes, attendanceRes, worksheetsRes, examsRes, enrollmentsRes, trendsRes]) => {
        if (cancelled) {
          return;
        }

        setMe(meRes.data?.data || null);
        setReport(reportRes.data?.data || null);
        setWeakTopics(Array.isArray(weakRes.data?.data) ? weakRes.data.data : []);
        setAttendance(Array.isArray(attendanceRes.data?.data) ? attendanceRes.data.data : []);
        setWorksheets(Array.isArray(worksheetsRes.data?.data?.items) ? worksheetsRes.data.data.items : []);
        setExams(Array.isArray(examsRes.data?.data) ? examsRes.data.data : []);
        setEnrollments(Array.isArray(enrollmentsRes.data?.data) ? enrollmentsRes.data.data : []);
        setPerfTrends(trendsRes.data?.data || null);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load progress data.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setCoachLoading(true);

    getCoachDashboard()
      .then((res) => {
        if (!cancelled) {
          setCoach(res.data?.data || null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setCoachLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const worksheetStats = useMemo(() => {
    const total = worksheets.length;
    const completed = worksheets.filter((item) => item?.status === "COMPLETED" || item?.status === "SUBMITTED").length;
    const inProgress = worksheets.filter((item) => item?.status === "IN_PROGRESS").length;
    const notStarted = worksheets.filter((item) => item?.status === "NOT_STARTED").length;
    return { total, completed, inProgress, notStarted };
  }, [worksheets]);

  const completionPct = worksheetStats.total ? Math.round((worksheetStats.completed / worksheetStats.total) * 100) : 0;

  const recentScores = useMemo(() => {
    const recent = report?.recent;
    if (!Array.isArray(recent) || !recent.length) {
      return [];
    }
    return recent
      .filter((item) => item?.score != null)
      .slice(0, 10)
      .map((item) => ({
        label: String(item.worksheetTitle || "WS").substring(0, 8),
        value: Math.round(Number(item.score))
      }))
      .reverse();
  }, [report]);

  const attendanceStats = useMemo(() => {
    const total = attendance.length;
    const present = attendance.filter((item) => isAttendancePresentLike(item?.status)).length;
    const absent = attendance.filter((item) => item?.status === "ABSENT").length;
    const late = attendance.filter((item) => item?.status === "LATE").length;
    return {
      total,
      present,
      absent,
      late,
      pct: total ? Math.round((present / total) * 100) : 0
    };
  }, [attendance]);

  const weeklyAttendance = useMemo(() => {
    return attendance.slice(0, 7).reverse().map((item) => ({
      label: item?.date ? new Date(item.date).toLocaleDateString(undefined, { weekday: "short" }) : "?",
      value: isAttendancePresentLike(item?.status) ? 1 : 0,
      color: item?.status === "PRESENT" ? "#22c55e" : item?.status === "LATE" ? "#f59e0b" : "#ef4444"
    }));
  }, [attendance]);

  const activeEnrollment = useMemo(() => {
    if (!enrollments.length) {
      return null;
    }
    return enrollments.find((item) => item?.status === "ACTIVE") || enrollments[0] || null;
  }, [enrollments]);

  const avgScore = report?.avgScore != null ? Math.round(Number(report.avgScore)) : null;
  const perfDelta = formatDelta(perfTrends?.currentLevel?.improvementTrendPercentage);
  const topicCount = weakTopics.length;
  const studentName = String(me?.fullName || "Student").trim() || "Student";
  const studentLevel = me?.levelTitle || activeEnrollment?.levelTitle || "Level pending";
  const studentCourse = activeEnrollment?.courseCode || me?.courseCode || "Course pending";
  const studentCenter = formatCenterLabel(me?.centerName, me?.centerCode);
  const spotlightWeakTopic = weakTopics[0]?.topic || "Keep building consistency";
  const heroStats = [
    {
      label: "Average Score",
      value: avgScore != null ? `${avgScore}%` : "—",
      hint: `${report?.totalAttempts ?? 0} recorded attempts`
    },
    {
      label: "Completion",
      value: `${completionPct}%`,
      hint: `${worksheetStats.completed}/${worksheetStats.total} worksheets done`
    },
    {
      label: "Attendance",
      value: `${attendanceStats.pct}%`,
      hint: `${attendanceStats.present}/${attendanceStats.total} days present`
    }
  ];

  if (loading) {
    return (
      <section style={{ display: "grid", gap: 16 }}>
        <SkeletonLoader variant="card" count={3} />
        <SkeletonLoader variant="table" />
      </section>
    );
  }

  return (
    <section className="student-progress-page">
      <PageHeader
        title="My Progress"
        subtitle="Track worksheets, scores, attendance, and readiness in one place."
      />

      {error ? <div className="card" style={{ color: "#ef4444" }}>{error}</div> : null}

      <div className="card student-progress-page__hero">
        <div className="student-progress-page__hero-main">
          <div className="student-progress-page__avatar">{getInitials(studentName)}</div>
          <div className="student-progress-page__hero-copy">
            <div className="student-progress-page__eyebrow">Student Snapshot</div>
            <h3 className="student-progress-page__hero-title">{studentName}</h3>
            <p className="student-progress-page__hero-subtitle">
              {studentLevel} · {studentCourse} · {studentCenter}
            </p>
            <div className="student-progress-page__chip-row">
              <span className="student-progress-page__chip">Focus area: {spotlightWeakTopic}</span>
              <span className="student-progress-page__chip">Active enrollments: {enrollments.length}</span>
              <span className="student-progress-page__chip">Exam entries: {exams.length}</span>
            </div>
          </div>
        </div>

        <div className="student-progress-page__hero-stats">
          {heroStats.map((item) => (
            <div key={item.label} className="student-progress-page__hero-stat">
              <span className="student-progress-page__hero-stat-label">{item.label}</span>
              <strong className="student-progress-page__hero-stat-value">{item.value}</strong>
              <span className="student-progress-page__hero-stat-hint">{item.hint}</span>
            </div>
          ))}
        </div>
      </div>

      <StreakBar streaks={coach?.streaks} />

      <div className="student-progress-page__kpi-grid">
        {[
          { label: "Total Attempts", value: report?.totalAttempts ?? 0, color: "#2563eb" },
          { label: "Average Score", value: avgScore != null ? `${avgScore}%` : "—", color: "#8b5cf6" },
          { label: "Worksheets Done", value: worksheetStats.completed, color: "#16a34a" },
          { label: "Attendance", value: `${attendanceStats.pct}%`, color: "#d97706" },
          { label: "Enrollments", value: enrollments.length, color: "#0891b2" },
          { label: "Exams", value: exams.length, color: "#db2777" }
        ].map((item) => (
          <div key={item.label} className="card student-progress-page__kpi-card">
            <div className="student-progress-page__kpi-value" style={{ color: item.color }}>{item.value}</div>
            <div className="student-progress-page__kpi-label">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="student-progress-page__analytics-grid">
        <div className="student-progress-page__analytics-main">
          <div className="card student-progress-page__panel student-progress-page__panel--feature">
            <div className="student-progress-page__panel-head">
              <div>
                <div className="student-progress-page__panel-title">Recent Scores</div>
                <div className="student-progress-page__panel-subtitle">Last 10 worksheets with recorded scores</div>
              </div>
              <div className="student-progress-page__pill">Average {avgScore != null ? `${avgScore}%` : "—"}</div>
            </div>
            {recentScores.length ? (
              <BarChart data={recentScores} maxValue={100} barColor="#0f766e" height={176} />
            ) : (
              <div className="muted">No scores recorded yet.</div>
            )}
          </div>

          <div className="card student-progress-page__panel">
            <div className="student-progress-page__panel-head">
              <div>
                <div className="student-progress-page__panel-title">Performance Trends</div>
                <div className="student-progress-page__panel-subtitle">Current level momentum and cross-level changes</div>
              </div>
              <div className="student-progress-page__pill" style={{ color: perfDelta.color }}>{perfDelta.text}</div>
            </div>

            {perfTrends?.currentLevel ? (
              <div className="student-progress-page__trend-summary">
                {[
                  {
                    label: "Avg Accuracy",
                    value: perfTrends.currentLevel.averageAccuracyLast5 != null ? `${perfTrends.currentLevel.averageAccuracyLast5}%` : "—"
                  },
                  {
                    label: "Best Score",
                    value: perfTrends.currentLevel.bestScore != null ? perfTrends.currentLevel.bestScore : "—"
                  },
                  {
                    label: "Attempts",
                    value: perfTrends.currentLevel.totalAttempts ?? 0
                  },
                  {
                    label: "Improvement",
                    value: perfDelta.text,
                    tone: perfDelta.color
                  }
                ].map((item) => (
                  <div key={item.label} className="student-progress-page__trend-card">
                    <div className="student-progress-page__trend-card-label">{item.label}</div>
                    <div className="student-progress-page__trend-card-value" style={item.tone ? { color: item.tone } : undefined}>{item.value}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {perfTrends?.trends?.length ? (
              <div className="student-progress-page__trend-list">
                {perfTrends.trends.map((item, index) => {
                  const accuracyDelta = formatDelta(item?.accuracyTrendPercentage);
                  const timeDelta = formatDelta(item?.timeTrendPercentage);
                  const levelLabel = item?.levelName || item?.levelTitle || item?.levelCode || item?.levelId || `Level ${index + 1}`;
                  return (
                    <div key={item?.levelId || `${levelLabel}-${index}`} className="student-progress-page__trend-row">
                      <span className="student-progress-page__trend-level">{String(levelLabel)}</span>
                      <span className="student-progress-page__trend-metric" style={{ color: accuracyDelta.color }}>Accuracy {accuracyDelta.text}</span>
                      <span className="student-progress-page__trend-metric" style={{ color: timeDelta.color }}>Speed {timeDelta.text}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="muted">Trend data will appear after more recorded attempts.</div>
            )}
          </div>
        </div>

        <div className="student-progress-page__analytics-side">
          <div className="student-progress-page__ring-grid">
            <div className="card student-progress-page__ring-card">
              <div className="student-progress-page__panel-title">Worksheet Completion</div>
              <ProgressRing value={completionPct} label="completed" color="#16a34a" size={120} />
              <div className="student-progress-page__ring-caption">
                <span className="student-progress-page__ring-caption-item">Done {worksheetStats.completed}</span>
                <span className="student-progress-page__ring-caption-item">In progress {worksheetStats.inProgress}</span>
                <span className="student-progress-page__ring-caption-item">Pending {worksheetStats.notStarted}</span>
              </div>
            </div>

            <div className="card student-progress-page__ring-card">
              <div className="student-progress-page__panel-title">Average Score</div>
              <ProgressRing
                value={avgScore ?? 0}
                label="avg score"
                color={avgScore >= 80 ? "#16a34a" : avgScore >= 50 ? "#d97706" : "#dc2626"}
                size={120}
              />
              <div className="student-progress-page__ring-caption student-progress-page__ring-caption--single">
                <span className="student-progress-page__ring-caption-item student-progress-page__ring-caption-item--single">
                  Based on {report?.totalAttempts ?? 0} attempt(s)
                </span>
              </div>
            </div>

            <div className="card student-progress-page__ring-card">
              <div className="student-progress-page__panel-title">Attendance Rate</div>
              <ProgressRing
                value={attendanceStats.pct}
                label="attendance"
                color={attendanceStats.pct >= 80 ? "#16a34a" : attendanceStats.pct >= 50 ? "#d97706" : "#dc2626"}
                size={120}
              />
              <div className="student-progress-page__ring-caption">
                <span className="student-progress-page__ring-caption-item">Present {attendanceStats.present}</span>
                <span className="student-progress-page__ring-caption-item">Absent {attendanceStats.absent}</span>
                <span className="student-progress-page__ring-caption-item">Late {attendanceStats.late}</span>
              </div>
            </div>
          </div>

          <div className="card student-progress-page__panel">
            <div className="student-progress-page__panel-head">
              <div>
                <div className="student-progress-page__panel-title">Weekly Attendance</div>
                <div className="student-progress-page__panel-subtitle">Most recent 7 attendance records</div>
              </div>
            </div>
            {weeklyAttendance.length ? (
              <div className="student-progress-page__attendance-row">
                {weeklyAttendance.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="student-progress-page__attendance-day">
                    <div className="student-progress-page__attendance-badge" style={{ background: item.color }}>
                      {item.value ? "P" : "A"}
                    </div>
                    <div className="student-progress-page__attendance-label">{item.label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No attendance records in range.</div>
            )}
          </div>

          <div className="card student-progress-page__panel">
            <div className="student-progress-page__panel-head">
              <div>
                <div className="student-progress-page__panel-title">Weak Topics</div>
                <div className="student-progress-page__panel-subtitle">Accuracy below 60%</div>
              </div>
              <div className="student-progress-page__pill">{topicCount} topic(s)</div>
            </div>
            {topicCount ? (
              <div style={{ display: "grid", gap: 8 }}>
                {weakTopics.slice(0, 10).map((item) => (
                  <HorizontalBar
                    key={item.topic}
                    label={item.topic}
                    value={item.accuracy ?? 0}
                    max={100}
                    color={(item.accuracy ?? 0) < 30 ? "#dc2626" : (item.accuracy ?? 0) < 50 ? "#d97706" : "#ca8a04"}
                  />
                ))}
              </div>
            ) : (
              <div className="muted">No weak topics yet. Accuracy is holding up well.</div>
            )}
          </div>
        </div>
      </div>

      {exams.length ? (
        <div className="card student-progress-page__panel">
          <div className="student-progress-page__panel-head">
            <div>
              <div className="student-progress-page__panel-title">Exam Enrollments</div>
              <div className="student-progress-page__panel-subtitle">Scheduled and completed exam registrations</div>
            </div>
          </div>
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
                {exams.map((item) => (
                  <tr key={item.entryId}>
                    <td>{item?.examCycle?.name || "—"}</td>
                    <td>{item?.status || "—"}</td>
                    <td>{item?.examCycle?.examStartsAt ? new Date(item.examCycle.examStartsAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="coach-grid">
        <ReadinessGauge readiness={coach?.readiness} loading={coachLoading} />
        <PerformanceExplainer data={coach?.performanceExplainer} loading={coachLoading} />
      </div>
    </section>
  );
}

export { StudentProgressPage };
