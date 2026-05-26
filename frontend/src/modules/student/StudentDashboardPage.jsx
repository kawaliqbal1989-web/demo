import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { ReportActionButtons } from "../../components/ReportActionButtons";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import {
  getStudentDashboardAchievements,
  getStudentDashboardAttendanceTrends,
  getStudentFinancialSummary,
  getStudentDashboardOverview,
  getStudentDashboardPracticeTrends,
  getStudentDashboardReminders,
  getStudentDashboardStreaks,
  getStudentDashboardWeakTopics
} from "../../services/studentDashboardService";
import {
  BandBadge,
  MiniBarChart,
  MiniSparkline,
  ProgressStrip,
  ReminderList,
  SectionCard,
  formatBandLabel,
  formatDate,
  formatPercent,
  formatRelativeDayLabel,
  formatScore
} from "../common/EngagementDashboardShared";

function unwrapEnvelope(response) {
  const payload = response?.data?.data;
  return {
    data: payload?.data || null,
    meta: payload?.meta || null
  };
}

function shouldShowFinancialReminder(reminder) {
  if (!reminder?.dismissKey || !reminder?.reappearToken) {
    return true;
  }

  try {
    const raw = localStorage.getItem(`student_finance_reminder_${reminder.dismissKey}`);
    if (!raw) {
      return true;
    }

    const parsed = JSON.parse(raw);
    const now = Date.now();
    const dismissedUntil = Number(parsed?.dismissedUntil || 0);
    if (dismissedUntil > now && parsed?.reappearToken === reminder.reappearToken) {
      return false;
    }
  } catch {
    return true;
  }

  return true;
}

function dismissFinancialReminder(reminder) {
  if (!reminder?.dismissKey || !reminder?.reappearToken) {
    return;
  }

  const payload = {
    reappearToken: reminder.reappearToken,
    dismissedUntil: Date.now() + 6 * 60 * 60 * 1000
  };
  localStorage.setItem(`student_finance_reminder_${reminder.dismissKey}`, JSON.stringify(payload));
}

function StudentDashboardPage() {
  const [dashboard, setDashboard] = useState({
    overview: null,
    streaks: null,
    achievements: null,
    practice: null,
    attendance: null,
    weakTopics: null,
    reminders: null,
    financial: null,
    meta: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const responses = await Promise.all([
          getStudentDashboardOverview(),
          getStudentDashboardStreaks(),
          getStudentDashboardAchievements(),
          getStudentDashboardPracticeTrends(),
          getStudentDashboardAttendanceTrends(),
          getStudentDashboardWeakTopics({ threshold: 60, lookback: 20 }),
          getStudentDashboardReminders({ limit: 8 }),
          getStudentFinancialSummary()
        ]);

        if (cancelled) {
          return;
        }

        const overviewEnvelope = unwrapEnvelope(responses[0]);
        const streaksEnvelope = unwrapEnvelope(responses[1]);
        const achievementsEnvelope = unwrapEnvelope(responses[2]);
        const practiceEnvelope = unwrapEnvelope(responses[3]);
        const attendanceEnvelope = unwrapEnvelope(responses[4]);
        const weakTopicsEnvelope = unwrapEnvelope(responses[5]);
        const remindersEnvelope = unwrapEnvelope(responses[6]);
        const financialEnvelope = unwrapEnvelope(responses[7]);

        setDashboard({
          overview: overviewEnvelope.data,
          streaks: streaksEnvelope.data,
          achievements: achievementsEnvelope.data,
          practice: practiceEnvelope.data,
          attendance: attendanceEnvelope.data,
          weakTopics: weakTopicsEnvelope.data,
          reminders: remindersEnvelope.data,
          financial: financialEnvelope.data,
          meta: overviewEnvelope.meta
        });
      } catch {
        if (!cancelled) {
          setError("Failed to load the student engagement dashboard.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const overview = dashboard.overview?.overview || {};
  const student = dashboard.overview?.student || dashboard.meta?.scope || {};
  const streaks = dashboard.streaks || dashboard.overview?.streaks || {};
  const achievements = dashboard.achievements || { items: [], newlyEarned: [], nextHints: [], summary: {} };
  const practice = dashboard.practice || { items: [], summary: {} };
  const attendance = dashboard.attendance || { items: [], summary: {} };
  const weakTopics = dashboard.weakTopics || { items: [], summary: {} };
  const reminders = dashboard.reminders || { items: [], total: 0, unreadCount: 0 };
  const financial = dashboard.financial || { summary: {}, reminders: [], receipts: [], upcomingDues: [] };
  const visibleFinancialReminders = (Array.isArray(financial.reminders) ? financial.reminders : []).filter(shouldShowFinancialReminder);

  const weeklyMomentumCards = useMemo(() => ([
    {
      label: "Practice cadence",
      value: `${streaks?.practice?.weeklyCurrent ?? 0} active weeks`,
      detail: `${overview.practiceActiveDays ?? 0} active days in the current window`
    },
    {
      label: "Attendance cadence",
      value: `${streaks?.attendance?.weeklyCurrent ?? 0} weekly runs`,
      detail: `${formatPercent(attendance.summary?.attendanceRate)} attendance consistency`
    },
    {
      label: "Exam readiness",
      value: `${overview.examParticipationCount ?? 0} exam cycles`,
      detail: `${overview.pendingWorksheetCount ?? 0} pending worksheets still open`
    }
  ]), [attendance.summary?.attendanceRate, overview.examParticipationCount, overview.pendingWorksheetCount, overview.practiceActiveDays, streaks?.attendance?.weeklyCurrent, streaks?.practice?.weeklyCurrent]);

  const achievementItems = Array.isArray(achievements.items) ? achievements.items.slice(0, 8) : [];
  const practiceTrendItems = Array.isArray(practice.items) ? practice.items.slice(-8) : [];
  const attendanceTrendItems = Array.isArray(attendance.items) ? attendance.items.slice(-8) : [];
  const weakTopicItems = Array.isArray(weakTopics.items) ? weakTopics.items : [];

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <SkeletonLoader variant="detail" />
        <SkeletonLoader variant="card" count={4} />
        <SkeletonLoader variant="detail" />
      </div>
    );
  }

  if (error) {
    return (
      <section className="card engagement-dashboard__error-card">
        <h2>Student Dashboard</h2>
        <p>{error}</p>
        <button className="button" type="button" style={{ width: "auto" }} onClick={() => setRefreshToken((value) => value + 1)}>
          Retry dashboard
        </button>
      </section>
    );
  }

  return (
    <div className="engagement-dashboard">
      <PageHeader
        title="Student Dashboard"
        subtitle="Interactive engagement pulse for streaks, practice rhythm, weak-topic recovery, achievements, and operational reminders."
        actions={(
          <div className="engagement-dashboard__header-actions">
            <ReportActionButtons reportKey="student-engagement" />
            <Link className="button secondary" style={{ width: "auto" }} to="/student/weak-topics">Review weak topics</Link>
            <Link className="button" style={{ width: "auto" }} to="/student/practice">Resume practice</Link>
          </div>
        )}
      />

      <section className="card engagement-dashboard__hero engagement-dashboard__hero--student">
        <div className="engagement-dashboard__hero-copy">
          <span className="engagement-dashboard__eyebrow">Engagement overview</span>
          <div className="engagement-dashboard__hero-title-row">
            <h3>{student.studentName || "Student engagement snapshot"}</h3>
            <BandBadge band={overview.engagementBand} />
          </div>
          <p className="engagement-dashboard__hero-subtitle">
            {student.levelName ? `${student.levelName}` : "Active learning track"}
            {student.hierarchyNodeName ? ` • ${student.hierarchyNodeName}` : ""}
            {dashboard.meta?.source?.mode ? ` • ${String(dashboard.meta.source.mode).replace(/-/g, " ")}` : ""}
          </p>
          <div className="engagement-dashboard__chip-row">
            <span className="engagement-dashboard__chip">{student.studentCode || "No code"}</span>
            <span className="engagement-dashboard__chip">{formatBandLabel(overview.engagementBand)}</span>
            <span className="engagement-dashboard__chip">{formatRelativeDayLabel(overview.lastActivityAt)}</span>
          </div>
        </div>
        <div className="engagement-dashboard__hero-score-panel">
          <div className="engagement-dashboard__hero-score-value">{formatScore(overview.engagementScore)}</div>
          <div className="engagement-dashboard__hero-score-label">Engagement score</div>
          <div className="engagement-dashboard__hero-score-hint">Momentum {formatScore(overview.momentumScore)}</div>
        </div>
      </section>

      {visibleFinancialReminders.length ? (
        <section className="card" style={{ display: "grid", gap: 10 }}>
          <div className="section-header">
            <span className="section-header__text">Fee Reminders</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {visibleFinancialReminders.map((reminder) => (
              <article
                key={reminder.id}
                style={{
                  borderRadius: 10,
                  padding: "10px 12px",
                  border: `1px solid ${reminder.severity === "critical" ? "#fecaca" : reminder.severity === "warning" ? "#fde68a" : "#bae6fd"}`,
                  background: reminder.severity === "critical" ? "#fff1f2" : reminder.severity === "warning" ? "#fffbeb" : "#f0f9ff",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start"
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{reminder.title}</div>
                  <div style={{ fontSize: 12, color: "#4b5563" }}>{reminder.message}</div>
                </div>
                <button
                  type="button"
                  className="button secondary"
                  style={{ width: "auto", fontSize: 11, padding: "4px 8px" }}
                  onClick={() => {
                    dismissFinancialReminder(reminder);
                    setRefreshToken((value) => value + 1);
                  }}
                >
                  Dismiss
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="engagement-dashboard__metric-grid">
        <MetricCard label="Pending fee" value={`Rs ${Number(financial.summary?.totalPending || 0).toLocaleString("en-IN")}`} sublabel={financial.summary?.nextDue?.monthLabel || "No upcoming due"} icon="💳" accent="#b45309" />
        <MetricCard label="Overdue" value={`Rs ${Number(financial.summary?.totalOverdue || 0).toLocaleString("en-IN")}`} sublabel={Number(financial.summary?.totalOverdue || 0) > 0 ? "Immediate action required" : "No overdue dues"} icon="⚠️" accent="#dc2626" />
        <MetricCard label="Waived months" value={String(financial.summary?.waivedMonths || 0)} sublabel={`${financial.summary?.pausedMonths || 0} paused months`} icon="🛡️" accent="#0369a1" />
        <MetricCard label="Latest payment" value={financial.latestPayment?.amount ? `Rs ${Number(financial.latestPayment.amount).toLocaleString("en-IN")}` : "-"} sublabel={financial.latestPayment?.paidAt ? formatDate(financial.latestPayment.paidAt) : "No recent payment"} icon="🧾" accent="#047857" />
        <MetricCard label="Engagement band" value={formatBandLabel(overview.engagementBand)} sublabel={`${formatScore(overview.engagementScore)} / 100`} icon="⚡" accent="#0f766e" />
        <MetricCard label="Daily streak" value={`${streaks?.practice?.current ?? 0} days`} sublabel={`Target ${streaks?.practice?.target ?? 14} days`} icon="🔥" accent="#ea580c" />
        <MetricCard label="Attendance consistency" value={formatPercent(attendance.summary?.attendanceRate)} sublabel={`${attendance.summary?.presentCount ?? 0} present of ${attendance.summary?.totalSessions ?? 0}`} icon="🗓️" accent="#2563eb" />
        <MetricCard label="Achievement gallery" value={String(achievements.summary?.total ?? achievementItems.length ?? 0)} sublabel={`${achievements.newlyEarned?.length ?? 0} newly earned`} icon="🏆" accent="#7c3aed" />
        <MetricCard label="Weak-topic watchlist" value={String(weakTopics.summary?.weakTopicCount ?? weakTopicItems.length ?? 0)} sublabel={weakTopics.summary?.weakestTopic || "No topic risk detected"} icon="🎯" accent="#dc2626" />
        <MetricCard label="Operational reminders" value={String(reminders.unreadCount ?? 0)} sublabel={`${reminders.total ?? 0} active reminders`} icon="🔔" accent="#0f766e" />
      </div>

      <div className="engagement-dashboard__content-grid">
        <div className="engagement-dashboard__content-main">
          <SectionCard title="Daily streak card" subtitle="Track how practice and attendance are building current momentum.">
            <div className="engagement-dashboard__dual-grid">
              <article className="engagement-dashboard__surface">
                <div className="engagement-dashboard__surface-topline">
                  <strong>Practice streak</strong>
                  <span>{streaks?.practice?.current ?? 0} days</span>
                </div>
                <ProgressStrip value={streaks?.practice?.current ?? 0} target={streaks?.practice?.target ?? 14} color="#ea580c" />
                <div className="engagement-dashboard__surface-meta">
                  <span>Best run {streaks?.practice?.best ?? 0} days</span>
                  <span>{overview.practiceActiveDays ?? 0} active days this window</span>
                </div>
              </article>

              <article className="engagement-dashboard__surface">
                <div className="engagement-dashboard__surface-topline">
                  <strong>Attendance streak</strong>
                  <span>{streaks?.attendance?.current ?? 0} sessions</span>
                </div>
                <ProgressStrip value={streaks?.attendance?.current ?? 0} target={streaks?.attendance?.target ?? 30} color="#2563eb" />
                <div className="engagement-dashboard__surface-meta">
                  <span>Best run {streaks?.attendance?.best ?? 0} sessions</span>
                  <span>{attendance.summary?.lateCount ?? 0} late marks in recent history</span>
                </div>
              </article>
            </div>
          </SectionCard>

          <SectionCard title="Weekly streak summary" subtitle="Use weekly cadence to catch rhythm drops before the streak breaks.">
            <div className="engagement-dashboard__summary-grid">
              {weeklyMomentumCards.map((item) => (
                <article key={item.label} className="engagement-dashboard__summary-card">
                  <span className="engagement-dashboard__summary-label">{item.label}</span>
                  <strong className="engagement-dashboard__summary-value">{item.value}</strong>
                  <span className="engagement-dashboard__summary-detail">{item.detail}</span>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Achievement gallery"
            subtitle="Milestones stay visible so recent wins reinforce the next practice cycle."
            aside={<Link to="/student/certificates" className="button secondary" style={{ width: "auto" }}>Certificates</Link>}
          >
            {achievementItems.length ? (
              <div className="engagement-dashboard__achievement-grid">
                {achievementItems.map((item) => (
                  <article key={item.key} className="engagement-dashboard__achievement-card">
                    <div className="engagement-dashboard__achievement-icon">{item.icon || "🏅"}</div>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description || "Achievement unlocked from consistent engagement."}</p>
                      <span>{formatDate(item.earnedAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon="🏅" title="Achievement gallery" description="Complete more sessions to unlock your first engagement achievements." />
            )}

            {(achievements.newlyEarned?.length || achievements.nextHints?.length) ? (
              <div className="engagement-dashboard__callout-grid">
                {achievements.newlyEarned?.length ? (
                  <article className="engagement-dashboard__callout">
                    <strong>Newly earned</strong>
                    <p>{achievements.newlyEarned.map((item) => item?.title || item?.key).filter(Boolean).join(", ")}</p>
                  </article>
                ) : null}
                {achievements.nextHints?.length ? (
                  <article className="engagement-dashboard__callout">
                    <strong>Next milestone hints</strong>
                    <p>{achievements.nextHints.map((item) => item?.title || item?.hint || item?.description).filter(Boolean).join(" • ")}</p>
                  </article>
                ) : null}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            title="Practice trends"
            subtitle="Daily completions and scores show where repetition is building real consistency."
            aside={<Link to="/student/progress" className="button secondary" style={{ width: "auto" }}>View full progress</Link>}
          >
            <div className="engagement-dashboard__chart-grid">
              <div>
                <MiniBarChart
                  items={practiceTrendItems}
                  valueKey="completedCount"
                  color="#0f766e"
                  emptyLabel="Practice trend data will appear after more worksheet submissions."
                />
              </div>
              <div className="engagement-dashboard__stat-list">
                <div className="engagement-dashboard__stat-row"><span>Completed worksheets</span><strong>{practice.summary?.totalCompleted ?? 0}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Average score</span><strong>{formatPercent(practice.summary?.averageScore)}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Pending assignments</span><strong>{practice.summary?.pendingAssignments ?? 0}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Last submission</span><strong>{formatDate(practice.summary?.lastSubmissionAt)}</strong></div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Attendance consistency" subtitle="Attendance stability keeps the academic rhythm intact across the recent session window.">
            <div className="engagement-dashboard__chart-grid">
              <div>
                <MiniSparkline items={attendanceTrendItems} valueKey="attendanceRate" color="#2563eb" emptyLabel="Attendance trend will appear once session history is available." />
              </div>
              <div className="engagement-dashboard__stat-list">
                <div className="engagement-dashboard__stat-row"><span>Attendance rate</span><strong>{formatPercent(attendance.summary?.attendanceRate)}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Present sessions</span><strong>{attendance.summary?.presentCount ?? 0}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Late sessions</span><strong>{attendance.summary?.lateCount ?? 0}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Absent sessions</span><strong>{attendance.summary?.absentCount ?? 0}</strong></div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="engagement-dashboard__content-side">
          <SectionCard
            title="Weak-topic insights"
            subtitle="The lowest-accuracy operations stay in view so you can recover with deliberate practice."
            aside={<Link to="/student/weak-topics" className="button secondary" style={{ width: "auto" }}>Open weak topics</Link>}
          >
            {weakTopicItems.length ? (
              <div className="engagement-dashboard__insight-list">
                {weakTopicItems.map((item) => (
                  <article key={item.topic} className="engagement-dashboard__insight-card">
                    <div className="engagement-dashboard__insight-topline">
                      <strong>{item.topic}</strong>
                      <span>{formatPercent(item.accuracy, 1)}</span>
                    </div>
                    <ProgressStrip value={item.accuracy ?? 0} target={100} color="#dc2626" />
                    <div className="engagement-dashboard__surface-meta">
                      <span>{item.correct ?? 0} correct</span>
                      <span>{item.attempted ?? 0} attempted</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon="🎯" title="Weak-topic insights" description="No weak-topic risk has been detected in the current lookback window." />
            )}
          </SectionCard>

          <SectionCard
            title="Operational reminders"
            subtitle="These reminders are scoped to student engagement operations only."
            aside={<Link to="/notifications" className="button secondary" style={{ width: "auto" }}>Notifications</Link>}
          >
            <ReminderList
              items={Array.isArray(reminders.items) ? reminders.items : []}
              emptyTitle="Operational reminders"
              emptyDescription="No student engagement reminders need your attention right now."
            />
          </SectionCard>

          <SectionCard
            title="Recent receipts"
            subtitle="Immutable receipt history from your recorded fee transactions."
            aside={<Link to="/student/fees" className="button secondary" style={{ width: "auto" }}>Open fee details</Link>}
          >
            {Array.isArray(financial.receipts) && financial.receipts.length ? (
              <div className="engagement-dashboard__table-list">
                {financial.receipts.slice(0, 5).map((receipt) => (
                  <div key={receipt.id} className="engagement-dashboard__table-row">
                    <span>{receipt.receiptNumber || "Receipt"}</span>
                    <strong>Rs {Number(receipt.amount || 0).toLocaleString("en-IN")}</strong>
                    <span>{formatDate(receipt.collectedAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="🧾" title="Recent receipts" description="No receipts available yet." />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export { StudentDashboardPage };