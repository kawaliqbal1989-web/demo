import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import { ReportActionButtons } from "../../components/ReportActionButtons";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import {
  getParentDashboardAchievements,
  getParentDashboardAttendance,
  getParentDashboardEngagement,
  getParentFinancialSummary,
  getParentDashboardOverview,
  getParentDashboardReminders,
  getParentDashboardWorksheetProgress
} from "../../services/parentDashboardService";
import {
  BandBadge,
  MiniBarChart,
  MiniSparkline,
  ProgressStrip,
  ReminderList,
  SectionCard,
  StudentScopeSwitcher,
  formatBandLabel,
  formatDate,
  formatPercent,
  formatScore
} from "../common/EngagementDashboardShared";

function unwrapEnvelope(response) {
  const payload = response?.data?.data;
  return {
    data: payload?.data || null,
    meta: payload?.meta || null
  };
}

function ParentDashboardPage() {
  const [dashboard, setDashboard] = useState({
    overview: null,
    attendance: null,
    worksheetProgress: null,
    engagement: null,
    achievements: null,
    reminders: null,
    financial: null,
    meta: null
  });
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const params = selectedStudentId ? { studentId: selectedStudentId } : {};
        const responses = await Promise.all([
          getParentDashboardOverview(params),
          getParentDashboardAttendance(params),
          getParentDashboardWorksheetProgress(params),
          getParentDashboardEngagement(params),
          getParentDashboardAchievements(params),
          getParentDashboardReminders({ ...params, limit: 8 }),
          getParentFinancialSummary(params)
        ]);

        if (cancelled) {
          return;
        }

        const overviewEnvelope = unwrapEnvelope(responses[0]);
        const attendanceEnvelope = unwrapEnvelope(responses[1]);
        const worksheetEnvelope = unwrapEnvelope(responses[2]);
        const engagementEnvelope = unwrapEnvelope(responses[3]);
        const achievementsEnvelope = unwrapEnvelope(responses[4]);
        const remindersEnvelope = unwrapEnvelope(responses[5]);
        const financialEnvelope = unwrapEnvelope(responses[6]);

        setDashboard({
          overview: overviewEnvelope.data,
          attendance: attendanceEnvelope.data,
          worksheetProgress: worksheetEnvelope.data,
          engagement: engagementEnvelope.data,
          achievements: achievementsEnvelope.data,
          reminders: remindersEnvelope.data,
          financial: financialEnvelope.data,
          meta: overviewEnvelope.meta
        });
      } catch {
        if (!cancelled) {
          setError("Failed to load the parent dashboard.");
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
  }, [refreshToken, selectedStudentId]);

  const overview = dashboard.overview || {};
  const selectedStudent = overview.selectedStudent || dashboard.attendance?.selectedStudent || dashboard.engagement?.selectedStudent || null;
  const linkedStudents = overview.linkedStudents || dashboard.reminders?.linkedStudents || [];
  const householdSummary = overview.householdSummary || {};
  const studentOverview = overview.studentOverview || dashboard.engagement?.overview || {};
  const studentStreaks = overview.studentStreaks || dashboard.engagement?.streaks || {};
  const attendance = dashboard.attendance || { summary: {}, trends: [], recentAttendance: [] };
  const worksheetProgress = dashboard.worksheetProgress || { summary: {}, trends: [], assignments: [], recentSubmissions: [] };
  const engagement = dashboard.engagement || { weakTopics: { items: [] }, examParticipation: { items: [] } };
  const achievements = dashboard.achievements?.achievements || { items: [], summary: {} };
  const reminders = dashboard.reminders || { items: [], unreadCount: 0, total: 0 };
  const financial = dashboard.financial || { householdSummary: {}, childSummaries: [], reminders: [] };

  const activeStudentId = selectedStudentId || selectedStudent?.studentId || "";

  const performanceSummaryCards = useMemo(() => ([
    {
      label: "Weak topics",
      value: String(engagement.weakTopics?.summary?.weakTopicCount ?? engagement.weakTopics?.items?.length ?? 0),
      detail: engagement.weakTopics?.summary?.weakestTopic || "No topic risk detected"
    },
    {
      label: "Exam participation",
      value: String(engagement.examParticipation?.summary?.totalEnrollments ?? 0),
      detail: engagement.examParticipation?.summary?.latestEnrollmentAt ? `Latest ${formatDate(engagement.examParticipation.summary.latestEnrollmentAt)}` : "No exam enrollment yet"
    },
    {
      label: "Worksheet completion",
      value: `${worksheetProgress.summary?.totalCompleted ?? worksheetProgress.recentSubmissions?.length ?? 0}`,
      detail: `${worksheetProgress.summary?.pendingAssignments ?? 0} pending assignments`
    }
  ]), [engagement.examParticipation?.summary?.latestEnrollmentAt, engagement.examParticipation?.summary?.totalEnrollments, engagement.weakTopics?.items?.length, engagement.weakTopics?.summary?.weakTopicCount, engagement.weakTopics?.summary?.weakestTopic, worksheetProgress.recentSubmissions?.length, worksheetProgress.summary?.pendingAssignments, worksheetProgress.summary?.totalCompleted]);

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
        <h2>Parent Dashboard</h2>
        <p>{error}</p>
        <button className="button" type="button" style={{ width: "auto" }} onClick={() => setRefreshToken((value) => value + 1)}>
          Retry dashboard
        </button>
      </section>
    );
  }

  return (
    <div className="engagement-dashboard engagement-dashboard--parent">
      <PageHeader
        title="Parent Dashboard"
        subtitle="Scoped academic and operational visibility across attendance, worksheets, engagement momentum, streaks, achievements, and reminders."
        actions={(
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ReportActionButtons reportKey="parent-visibility" params={activeStudentId ? { studentId: activeStudentId } : {}} />
            <Link className="button secondary" style={{ width: "auto" }} to="/notifications">Notifications</Link>
          </div>
        )}
      />

      <StudentScopeSwitcher items={linkedStudents} selectedStudentId={activeStudentId} onChange={setSelectedStudentId} />

      <section className="card engagement-dashboard__hero engagement-dashboard__hero--parent">
        <div className="engagement-dashboard__hero-copy">
          <span className="engagement-dashboard__eyebrow">Parent visibility overview</span>
          <div className="engagement-dashboard__hero-title-row">
            <h3>{selectedStudent?.studentName || "Linked student"}</h3>
            <BandBadge band={studentOverview.engagementBand} />
          </div>
          <p className="engagement-dashboard__hero-subtitle">
            {selectedStudent?.relationship ? `${selectedStudent.relationship}` : "Primary linked student"}
            {selectedStudent?.levelName ? ` • ${selectedStudent.levelName}` : ""}
            {selectedStudent?.hierarchyNodeName ? ` • ${selectedStudent.hierarchyNodeName}` : ""}
          </p>
          <div className="engagement-dashboard__chip-row">
            <span className="engagement-dashboard__chip">{overview.parent?.displayName || overview.parent?.username || "Parent view"}</span>
            <span className="engagement-dashboard__chip">{linkedStudents.length} linked student{linkedStudents.length === 1 ? "" : "s"}</span>
            <span className="engagement-dashboard__chip">{formatBandLabel(studentOverview.engagementBand)}</span>
          </div>
        </div>
        <div className="engagement-dashboard__hero-score-panel">
          <div className="engagement-dashboard__hero-score-value">{formatScore(studentOverview.engagementScore)}</div>
          <div className="engagement-dashboard__hero-score-label">Selected student score</div>
          <div className="engagement-dashboard__hero-score-hint">Household average {formatScore(householdSummary.averageEngagementScore)}</div>
        </div>
      </section>

      <div className="engagement-dashboard__metric-grid">
        <MetricCard label="Household pending fees" value={`Rs ${Number(financial.householdSummary?.totalPending || 0).toLocaleString("en-IN")}`} sublabel={`${financial.householdSummary?.studentsWithPending || 0} children with pending fees`} icon="💳" accent="#b45309" />
        <MetricCard label="Household overdue" value={`Rs ${Number(financial.householdSummary?.totalOverdue || 0).toLocaleString("en-IN")}`} sublabel={`${financial.householdSummary?.studentsWithOverdue || 0} children overdue`} icon="⚠️" accent="#dc2626" />
        <MetricCard label="Household summary" value={String(householdSummary.studentCount ?? linkedStudents.length ?? 0)} sublabel="Linked students" icon="🏠" accent="#0f766e" />
        <MetricCard label="Average engagement" value={formatScore(householdSummary.averageEngagementScore)} sublabel="Across visible students" icon="📈" accent="#2563eb" />
        <MetricCard label="At-risk students" value={String(householdSummary.atRiskStudents ?? 0)} sublabel="Engagement band at risk" icon="⚠️" accent="#dc2626" />
        <MetricCard label="Unread reminders" value={String(householdSummary.totalUnreadReminders ?? reminders.unreadCount ?? 0)} sublabel={`${reminders.total ?? 0} active reminders`} icon="🔔" accent="#7c3aed" />
      </div>

      {Array.isArray(financial.reminders) && financial.reminders.length ? (
        <section className="card" style={{ display: "grid", gap: 8 }}>
          <div className="section-header">
            <span className="section-header__text">Fee Alerts for Selected Child</span>
          </div>
          {financial.reminders.map((reminder) => (
            <article
              key={reminder.id}
              style={{
                borderRadius: 10,
                padding: "10px 12px",
                border: `1px solid ${reminder.severity === "critical" ? "#fecaca" : reminder.severity === "warning" ? "#fde68a" : "#bae6fd"}`,
                background: reminder.severity === "critical" ? "#fff1f2" : reminder.severity === "warning" ? "#fffbeb" : "#f0f9ff"
              }}
            >
              <div style={{ fontWeight: 700 }}>{reminder.title}</div>
              <div style={{ fontSize: 12, color: "#4b5563" }}>{reminder.message}</div>
            </article>
          ))}
        </section>
      ) : null}

      <div className="engagement-dashboard__content-grid">
        <div className="engagement-dashboard__content-main">
          <SectionCard title="Attendance visibility" subtitle="Attendance consistency and the latest marked sessions for the selected student.">
            <div className="engagement-dashboard__chart-grid">
              <div>
                <MiniSparkline items={attendance.trends || []} valueKey="attendanceRate" color="#2563eb" emptyLabel="Attendance visibility will appear once session history is published." />
              </div>
              <div className="engagement-dashboard__stat-list">
                <div className="engagement-dashboard__stat-row"><span>Attendance rate</span><strong>{formatPercent(attendance.summary?.attendanceRate)}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Present count</span><strong>{attendance.summary?.presentCount ?? 0}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Late count</span><strong>{attendance.summary?.lateCount ?? 0}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Absent count</span><strong>{attendance.summary?.absentCount ?? 0}</strong></div>
              </div>
            </div>
            {attendance.recentAttendance?.length ? (
              <div className="engagement-dashboard__table-list">
                {attendance.recentAttendance.slice(0, 6).map((item, index) => (
                  <div key={`${item.sessionId || item.sessionDate}-${index}`} className="engagement-dashboard__table-row">
                    <span>{formatDate(item.sessionDate)}</span>
                    <strong>{String(item.status || "UNKNOWN").replace(/_/g, " ")}</strong>
                    <span>{String(item.sessionStatus || "").replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Worksheet completion visibility" subtitle="Recent worksheet assignments, completions, and submission quality at a glance.">
            <div className="engagement-dashboard__chart-grid">
              <div>
                <MiniBarChart items={(worksheetProgress.trends || []).slice(-8)} valueKey="completedCount" color="#0f766e" emptyLabel="Worksheet trend data will appear after more submissions." />
              </div>
              <div className="engagement-dashboard__stat-list">
                <div className="engagement-dashboard__stat-row"><span>Completed</span><strong>{worksheetProgress.summary?.totalCompleted ?? worksheetProgress.recentSubmissions?.length ?? 0}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Pending assignments</span><strong>{worksheetProgress.summary?.pendingAssignments ?? 0}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Practice active days</span><strong>{worksheetProgress.summary?.practiceActiveDays ?? 0}</strong></div>
                <div className="engagement-dashboard__stat-row"><span>Average score</span><strong>{formatPercent(worksheetProgress.summary?.averageScore)}</strong></div>
              </div>
            </div>
            {worksheetProgress.assignments?.length ? (
              <div className="engagement-dashboard__table-list">
                {worksheetProgress.assignments.slice(0, 6).map((item) => (
                  <div key={`${item.worksheetId}-${item.assignedAt}`} className="engagement-dashboard__table-row">
                    <span>{item.worksheetTitle || "Worksheet"}</span>
                    <strong>{item.status}</strong>
                    <span>{item.dueDate ? `Due ${formatDate(item.dueDate)}` : `Assigned ${formatDate(item.assignedAt)}`}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Engagement trend visibility" subtitle="Practice rhythm, engagement band, and topic risk stay visible without exposing classroom workflows.">
            <div className="engagement-dashboard__dual-grid">
              <article className="engagement-dashboard__surface">
                <div className="engagement-dashboard__surface-topline">
                  <strong>Engagement score</strong>
                  <span>{formatScore(studentOverview.engagementScore)}</span>
                </div>
                <ProgressStrip value={studentOverview.engagementScore ?? 0} target={100} color="#0f766e" />
                <div className="engagement-dashboard__surface-meta">
                  <span>{formatBandLabel(studentOverview.engagementBand)}</span>
                  <span>{studentOverview.inactiveDays ?? 0} inactive days</span>
                </div>
              </article>
              <article className="engagement-dashboard__surface">
                <div className="engagement-dashboard__surface-topline">
                  <strong>Weak-topic watchlist</strong>
                  <span>{engagement.weakTopics?.summary?.weakTopicCount ?? 0}</span>
                </div>
                <ProgressStrip value={100 - (engagement.weakTopics?.summary?.weakTopicCount ?? 0) * 10} target={100} color="#dc2626" />
                <div className="engagement-dashboard__surface-meta">
                  <span>{engagement.weakTopics?.summary?.weakestTopic || "No critical topic"}</span>
                  <span>{engagement.examParticipation?.summary?.totalEnrollments ?? 0} exam enrollments</span>
                </div>
              </article>
            </div>
          </SectionCard>

          <SectionCard title="Streak visibility" subtitle="Current streak momentum is kept separate from execution tooling and classroom controls.">
            <div className="engagement-dashboard__dual-grid">
              <article className="engagement-dashboard__surface">
                <div className="engagement-dashboard__surface-topline">
                  <strong>Practice streak</strong>
                  <span>{studentStreaks?.practice?.current ?? 0} days</span>
                </div>
                <ProgressStrip value={studentStreaks?.practice?.current ?? 0} target={studentStreaks?.practice?.target ?? 14} color="#ea580c" />
                <div className="engagement-dashboard__surface-meta">
                  <span>Best {studentStreaks?.practice?.best ?? 0} days</span>
                  <span>{studentStreaks?.practice?.weeklyCurrent ?? 0} weekly runs</span>
                </div>
              </article>
              <article className="engagement-dashboard__surface">
                <div className="engagement-dashboard__surface-topline">
                  <strong>Attendance streak</strong>
                  <span>{studentStreaks?.attendance?.current ?? 0} sessions</span>
                </div>
                <ProgressStrip value={studentStreaks?.attendance?.current ?? 0} target={studentStreaks?.attendance?.target ?? 30} color="#2563eb" />
                <div className="engagement-dashboard__surface-meta">
                  <span>Best {studentStreaks?.attendance?.best ?? 0} sessions</span>
                  <span>{studentStreaks?.attendance?.weeklyCurrent ?? 0} weekly runs</span>
                </div>
              </article>
            </div>
          </SectionCard>
        </div>

        <div className="engagement-dashboard__content-side">
          <SectionCard title="Achievement visibility" subtitle="Recent achievements stay parent-visible without exposing reward engines or workflow internals.">
            {achievements.items?.length ? (
              <div className="engagement-dashboard__achievement-grid">
                {achievements.items.slice(0, 6).map((item) => (
                  <article key={item.key} className="engagement-dashboard__achievement-card">
                    <div className="engagement-dashboard__achievement-icon">{item.icon || "🏅"}</div>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description || "Achievement unlocked from engagement progress."}</p>
                      <span>{formatDate(item.earnedAt)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon="🏅" title="Achievement visibility" description="No achievements have been recorded for this student yet." />
            )}
          </SectionCard>

          <SectionCard title="Operational reminders" subtitle="Parent reminders are limited to student engagement operations and linked student scope.">
            <ReminderList items={Array.isArray(reminders.items) ? reminders.items : []} emptyTitle="Operational reminders" emptyDescription="No active parent reminders are currently linked to this student." />
          </SectionCard>

          <SectionCard title="Performance summaries" subtitle="Focused summary cards for topic risk, participation, and worksheet completion.">
            <div className="engagement-dashboard__summary-grid">
              {performanceSummaryCards.map((item) => (
                <article key={item.label} className="engagement-dashboard__summary-card">
                  <span className="engagement-dashboard__summary-label">{item.label}</span>
                  <strong className="engagement-dashboard__summary-value">{item.value}</strong>
                  <span className="engagement-dashboard__summary-detail">{item.detail}</span>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Child fee snapshot" subtitle="Role-safe fee visibility across linked children.">
            {Array.isArray(financial.childSummaries) && financial.childSummaries.length ? (
              <div className="engagement-dashboard__table-list">
                {financial.childSummaries.slice(0, 8).map((child) => (
                  <div key={child.studentId} className="engagement-dashboard__table-row">
                    <span>{child.studentName}</span>
                    <strong>Rs {Number(child.totalPending || 0).toLocaleString("en-IN")}</strong>
                    <span>{child.nextDue?.monthLabel || child.status || "No pending due"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon="💳" title="Child fee snapshot" description="No fee dues are visible for linked students." />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export { ParentDashboardPage };