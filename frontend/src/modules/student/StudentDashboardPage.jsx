import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { MetricCard } from "../../components/MetricCard";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { InsightPanel } from "../../components/InsightCard";
import { StreakBar, DailyMission, WeeklyPlan, ReadinessGauge, MilestoneCard, PerformanceExplainer } from "../../components/StudentCoach";
import { getInsights } from "../../services/insightsService";
import { getCoachDashboard } from "../../services/studentCoachService";
import {
  getStudentFees,
  getStudentMe,
  getStudentPracticeReport,
  getStudentWeakTopics,
  listStudentAttendance,
  listStudentExamEnrollments,
  listStudentEnrollments,
  listStudentWorksheets
} from "../../services/studentPortalService";
import { StudentAiCoach } from "../../components/AiNarrativeSurfaces";

function formatExamStatus(status) {
  if (!status) return "—";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  if (status === "NOT_SELECTED") return "Not Selected";
  if (status === "NOT_IN_COMBINED_LIST") return "Pending (Center not prepared)";
  return status;
}

function formatCenterLabel({ name, code }) {
  if (!name && !code) return "—";
  if (name && code) return `${name} (${code})`;
  return name || code || "—";
}

function formatAge(dateOfBirth) {
  if (!dateOfBirth) return "";
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  if (!Number.isFinite(age) || age < 0) return "";
  return `${age} yrs`;
}

function formatCourseLevel({ courseCode, levelTitle, level }) {
  const course = courseCode || (level ? `AB-L${level}` : "—");
  const lvl = levelTitle || (level ? `Level ${level}` : "—");
  return `${course} / ${lvl}`;
}

function StudentDashboardPage() {
  const [me, setMe] = useState(null);
  const [report, setReport] = useState(null);
  const [activeEnrollment, setActiveEnrollment] = useState(null);
  const [allEnrollments, setAllEnrollments] = useState([]);
  const [nextWorksheet, setNextWorksheet] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [weakTopics, setWeakTopics] = useState([]);
  const [fees, setFees] = useState(null);
  const [examEnrollments, setExamEnrollments] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [coach, setCoach] = useState(null);
  const [coachLoading, setCoachLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      getStudentMe(),
      getStudentPracticeReport(),
      listStudentEnrollments(),
      listStudentExamEnrollments(),
      listStudentWorksheets({ page: 1, pageSize: 20 }),
      listStudentAttendance({ limit: 7 }),
      getStudentWeakTopics({ threshold: 60 }),
      getStudentFees()
    ])
      .then(([meRes, reportRes, enrollRes, examEnrollRes, worksheetsRes, attendanceRes, weakTopicsRes, feesRes]) => {
        if (cancelled) {
          return;
        }
        setMe(meRes.data?.data || null);
        setReport(reportRes.data?.data || null);

        const enrollments = Array.isArray(enrollRes.data?.data) ? enrollRes.data.data : [];

        // include any explicitly assigned courses returned on the `me` payload
        const assignedCourses = Array.isArray(meRes.data?.data?.assignedCourses) ? meRes.data.data.assignedCourses : [];
        const existingCourseCodes = new Set(enrollments.map((e) => e.courseCode));
        const assignedAsEnrollments = assignedCourses
          .filter((c) => c && !existingCourseCodes.has(c.courseCode))
          .map((c) => ({
            enrollmentId: `assigned-${c.courseId}`,
            courseId: c.courseId,
            courseCode: c.courseCode || null,
            level: null,
            levelTitle: null,
            status: "ASSIGNED",
            assignedTeacherId: null,
            assignedTeacherName: null,
            centerId: meRes.data?.data?.centerId || null,
            centerName: meRes.data?.data?.centerName || null,
            centerCode: meRes.data?.data?.centerCode || null,
            batchId: null,
            batchName: null,
            startedAt: null,
            dueDate: null
          }));

        const combined = [...enrollments, ...assignedAsEnrollments];
        setAllEnrollments(combined);
        const current = combined.find((en) => en?.status === "ACTIVE") || combined[0] || null;
        setActiveEnrollment(current);

        const items = worksheetsRes.data?.data?.items;
        const worksheets = Array.isArray(items) ? items : [];
        const candidate =
          worksheets.find((w) => w?.status === "IN_PROGRESS") ||
          worksheets.find((w) => w?.status === "NOT_STARTED") ||
          null;
        setNextWorksheet(candidate);

        setAttendance(Array.isArray(attendanceRes.data?.data) ? attendanceRes.data.data : []);
        setWeakTopics(Array.isArray(weakTopicsRes.data?.data) ? weakTopicsRes.data.data : []);
        setFees(feesRes.data?.data || null);

        const examRows = Array.isArray(examEnrollRes.data?.data) ? examEnrollRes.data.data : [];
        setExamEnrollments(examRows);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setError("Failed to load student dashboard.");
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setInsightsLoading(true);
    getInsights()
      .then((res) => setInsights(res.data?.insights || []))
      .catch(() => {})
      .finally(() => setInsightsLoading(false));
  }, []);

  useEffect(() => {
    setCoachLoading(true);
    getCoachDashboard()
      .then((res) => setCoach(res.data?.data || null))
      .catch(() => {})
      .finally(() => setCoachLoading(false));
  }, []);

  const kpis = useMemo(() => {
    return [
      {
        label: "Active Enrollments",
        value: me?.activeEnrollmentsCount ?? "—",
        icon: "📚",
        accent: "var(--role-student)"
      },
      {
        label: "Assigned Worksheets",
        value: me?.assignedWorksheetsCount ?? "—",
        icon: "📝"
      },
      {
        label: "Total Attempts",
        value: report?.totalAttempts ?? "—",
        icon: "🎯"
      },
      {
        label: "Avg Score",
        value: report?.avgScore == null ? "—" : `${report.avgScore}%`,
        icon: "📊",
        accent: report?.avgScore >= 70 ? "#16a34a" : report?.avgScore >= 40 ? "#d97706" : undefined
      }
    ];
  }, [me, report]);

  const latestResult = report?.recent?.length ? report.recent[0] : null;

  if (loading) {
    return (
      <section className="dash-section">
        <SkeletonLoader variant="card" count={4} />
        <SkeletonLoader variant="detail" />
        <SkeletonLoader variant="table" />
      </section>
    );
  }

  return (
    <section className="dash-section">
      <PageHeader
        title="Student Dashboard"
        subtitle="Your profile and current enrollment details."
        actions={
          <>
            <Link className="button secondary" style={{ width: "auto" }} to="/change-password">Change Password</Link>
            <Link className="button secondary" style={{ width: "auto" }} to="/student/abacus-practice">Abacus Practice</Link>
            <Link className="button" style={{ width: "auto" }} to="/student/worksheets">Worksheets</Link>
          </>
        }
      />

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <InsightPanel
        insights={insights}
        loading={insightsLoading}
        onDismiss={(id) => setInsights((prev) => prev.filter((i) => i.id !== id))}
      />

      <StudentAiCoach />

      <StreakBar streaks={coach?.streaks} />

      <div className="coach-grid">
        <DailyMission missions={coach?.dailyMission} loading={coachLoading} />
        <WeeklyPlan plan={coach?.weeklyPlan} loading={coachLoading} />
      </div>

      <div className="dash-kpi-grid">
        {kpis.map((kpi) => (
          <MetricCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} accent={kpi.accent} />
        ))}
      </div>

      <div className="dash-grid-2">
        <div className="card dash-card">
          <div className="dash-card__title">Student Dashboard</div>
          <div className="dash-card__subtitle">Your profile and current enrollment details.</div>

          <div className="info-grid">
            <div className="info-grid__label">Full Name</div>
            <div className="info-grid__value">{me?.fullName || "—"}</div>

            <div className="info-grid__label">Student Code</div>
            <div className="info-grid__value">{me?.studentCode || "—"}</div>

            <div className="info-grid__label">Username</div>
            <div className="info-grid__value">{me?.username || "—"}</div>

            <div className="info-grid__label">Status</div>
            <div className="info-grid__value">{me?.status || "—"}</div>

            <div className="info-grid__label">Assigned Course</div>
            <div className="info-grid__value">
              {me?.courseName
                ? `${me.courseName}${me.courseCode ? ` (${me.courseCode})` : ""}`
                : "—"}
            </div>

            <div className="info-grid__label">Level</div>
            <div className="info-grid__value">{me?.levelTitle || "—"}</div>

            <div className="info-grid__label">DOB / Age</div>
            <div className="info-grid__value">
              {me?.dateOfBirth ? new Date(me.dateOfBirth).toISOString().slice(0, 10) : "—"}
              {me?.dateOfBirth ? ` (${formatAge(me.dateOfBirth)})` : ""}
            </div>

            <div className="info-grid__label">Guardian Name</div>
            <div className="info-grid__value">{me?.guardianName || "—"}</div>

            <div className="info-grid__label">Guardian Phone</div>
            <div className="info-grid__value">{me?.guardianPhone || "—"}</div>

            <div className="info-grid__label">Email</div>
            <div className="info-grid__value">{me?.email || "—"}</div>
          </div>
        </div>

        <div className="card dash-card">
          <div className="dash-card__title">Current Enrollment</div>
          <div className="dash-card__subtitle">Active enrollment and assigned teacher.</div>

          <div className="info-grid">
            <div className="info-grid__label">Course / Level</div>
            <div className="info-grid__value">
              {activeEnrollment
                ? formatCourseLevel({
                    courseCode: activeEnrollment.courseCode,
                    levelTitle: activeEnrollment.levelTitle,
                    level: activeEnrollment.level
                  })
                : "—"}
            </div>

            <div className="info-grid__label">Assigned Teacher</div>
            <div className="info-grid__value">{activeEnrollment?.assignedTeacherName || "—"}</div>

            <div className="info-grid__label">Center</div>
            <div className="info-grid__value">
              {activeEnrollment
                ? formatCenterLabel({ name: activeEnrollment.centerName, code: activeEnrollment.centerCode })
                : formatCenterLabel({ name: me?.centerName, code: me?.centerCode })}
            </div>

            <div className="info-grid__label">Batch</div>
            <div className="info-grid__value">{activeEnrollment?.batchName || "No batch assigned"}</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <Link className="button secondary" style={{ width: "auto" }} to="/student/enrollments">
              View Enrollments
            </Link>
          </div>
        </div>

        <div className="card dash-card">
          <div className="dash-card__title">Exam Enrollment</div>
          <div className="dash-card__subtitle">Your exam enrollment status (notification).</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <Link className="button secondary" style={{ width: "auto" }} to="/student/exams">
              View Exams
            </Link>
          </div>

          <div className="dash-table-wrap" style={{ marginTop: 8 }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Status</th>
                  <th>Exam Starts</th>
                </tr>
              </thead>
              <tbody>
                {examEnrollments.length ? (
                  examEnrollments.slice(0, 5).map((r) => (
                    <tr key={r.entryId}>
                      <td>{r?.examCycle ? `${r.examCycle.name} (${r.examCycle.code})` : "—"}</td>
                      <td>{formatExamStatus(r?.status)}</td>
                      <td>{r?.examCycle?.examStartsAt ? new Date(r.examCycle.examStartsAt).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="muted">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Learning Summary</div>
        <div className="dash-card__subtitle">What to do next.</div>

        <div className="info-grid">
          <div className="info-grid__label">Next Worksheet</div>
          <div className="info-grid__value">
            {nextWorksheet ? (
              <Link to={`/student/worksheets/${nextWorksheet.worksheetId}`}>{nextWorksheet.title}</Link>
            ) : (
              "—"
            )}
          </div>

          <div className="info-grid__label">Latest Result</div>
          <div className="info-grid__value">
            {latestResult?.worksheetTitle ? (
              <span>
                {latestResult.worksheetTitle} — {latestResult.score == null ? "—" : `${latestResult.score}%`}
              </span>
            ) : (
              "—"
            )}
          </div>
        </div>
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">All Assigned Courses</div>
        <div className="dash-card__subtitle">All your enrollments across course levels.</div>

        {allEnrollments.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Course / Level</th>
                  <th>Teacher</th>
                  <th>Center</th>
                  <th>Batch</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {allEnrollments.map((en) => (
                  <tr key={en.enrollmentId}>
                    <td>
                      {formatCourseLevel({
                        courseCode: en.courseCode,
                        levelTitle: en.levelTitle,
                        level: en.level
                      })}
                    </td>
                    <td>{en.assignedTeacherName || "—"}</td>
                    <td>{formatCenterLabel({ name: en.centerName, code: en.centerCode })}</td>
                    <td>{en.batchName || "No batch assigned"}</td>
                    <td>{en.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="📚" title="No enrollments" description="You don't have any course enrollments yet." />
        )}
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Practice Weak Topics</div>
        <div className="dash-card__subtitle">Topics with accuracy below 60%.</div>

        {weakTopics.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Accuracy</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {weakTopics.map((t) => (
                  <tr key={t.topic}>
                    <td>{t.topic}</td>
                    <td>
                      <span className={`badge-v2 ${t.accuracy < 40 ? "badge-v2--danger" : "badge-v2--warning"}`}>
                        {t.accuracy}%
                      </span>
                    </td>
                    <td>{t.attempted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="🎉" title="No weak topics" description="Great job! Keep practicing to stay sharp." />
        )}
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Attendance</div>
        <div className="dash-card__subtitle">Your last 7 attendance records.</div>

        {attendance.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>
                    Date
                  </th>
                  <th>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((row, idx) => (
                  <tr key={`${row.date || "unknown"}-${idx}`}>
                    <td>{row.date ? new Date(row.date).toLocaleDateString() : "—"}</td>
                    <td>{row.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted">No attendance records yet.</div>
        )}
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Fees</div>
        <div className="dash-card__subtitle">Payment summary and history.</div>

        <div className="info-grid">
          <div className="info-grid__label">Total Fee</div>
          <div className="info-grid__value">{fees?.summary?.totalFee ?? "—"}</div>

          <div className="info-grid__label">Paid</div>
          <div className="info-grid__value">{fees?.summary?.paid ?? "—"}</div>

          <div className="info-grid__label">Pending</div>
          <div className="info-grid__value">{fees?.summary?.pending ?? "—"}</div>

          <div className="info-grid__label">Status</div>
          <div className="info-grid__value">{fees?.summary?.status ?? "—"}</div>
        </div>

        {fees?.message ? <div className="muted">{fees.message}</div> : null}

        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>
                  Date
                </th>
                <th>
                  Amount
                </th>
                <th>
                  Mode
                </th>
                <th>
                  Reference
                </th>
              </tr>
            </thead>
            <tbody>
              {fees?.payments?.length ? (
                fees.payments.map((p, idx) => (
                  <tr key={`${p.date || "unknown"}-${idx}`}>
                    <td>{p.date ? new Date(p.date).toLocaleDateString() : "—"}</td>
                    <td>{p.amount ?? "—"}</td>
                    <td>{p.mode || "—"}</td>
                    <td>{p.reference || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="muted">
                    No payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="coach-grid">
        <ReadinessGauge readiness={coach?.readiness} loading={coachLoading} />
        <MilestoneCard milestones={coach?.milestones} loading={coachLoading} />
      </div>

      <PerformanceExplainer data={coach?.performanceExplainer} loading={coachLoading} />
    </section>
  );
}

export { StudentDashboardPage };
