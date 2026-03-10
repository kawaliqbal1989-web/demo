import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import { listMyBatches } from "../../services/teacherPortalService";
import { listLevels } from "../../services/levelsService";
import { listExamCycles } from "../../services/examCyclesService";
import { listCompetitions } from "../../services/competitionsService";
import {
  getAnalyticsAttendance,
  exportAnalyticsAttendanceCsv,
  getAnalyticsWorksheets,
  exportAnalyticsWorksheetsCsv,
  getAnalyticsMockTests,
  exportAnalyticsMockTestsCsv,
  getAnalyticsExams,
  exportAnalyticsExamsCsv,
  getAnalyticsCompetitions,
  exportAnalyticsCompetitionsCsv,
  getAnalyticsStudentProgress,
  exportAnalyticsStudentProgressCsv
} from "../../services/teacherPortalService";

const TABS = [
  { key: "attendance", label: "📅 Attendance" },
  { key: "worksheets", label: "📝 Worksheets" },
  { key: "mock-tests", label: "🧪 Mock Tests" },
  { key: "exams", label: "🎯 Exams" },
  { key: "competitions", label: "🏆 Competitions" },
  { key: "student-progress", label: "📈 Progress" }
];

function MetricCard({ label, value }) {
  return (
    <div className="card" style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDate(d) {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toISOString().slice(0, 10);
}

function extractItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.data && Array.isArray(data.data.items)) return data.data.items;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function TeacherAnalyticsPage() {
  const [tab, setTab] = useState("attendance");

  // Filter dropdowns data
  const [batches, setBatches] = useState([]);
  const [levels, setLevels] = useState([]);
  const [examCycles, setExamCycles] = useState([]);
  const [competitions, setCompetitions] = useState([]);

  // Filter values
  const [batchId, setBatchId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [examCycleId, setExamCycleId] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());

  // Data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Load filter dropdowns
  useEffect(() => {
    const load = async () => {
      try {
        const [bRes, lRes, ecRes, cRes] = await Promise.allSettled([
          listMyBatches(),
          listLevels(),
          listExamCycles({ limit: 200, offset: 0 }),
          listCompetitions({ limit: 200, offset: 0 })
        ]);
        if (bRes.status === "fulfilled") setBatches(extractItems(bRes.value));
        if (lRes.status === "fulfilled") setLevels(extractItems(lRes.value));
        if (ecRes.status === "fulfilled") setExamCycles(extractItems(ecRes.value));
        if (cRes.status === "fulfilled") setCompetitions(extractItems(cRes.value));
      } catch {
        // non-critical
      }
    };
    load();
  }, []);

  const buildParams = useCallback(() => {
    const p = { limit, offset };
    if (from) p.from = from;
    if (to) p.to = to;

    if (tab === "attendance" || tab === "worksheets" || tab === "mock-tests" || tab === "student-progress") {
      if (batchId) p.batchId = batchId;
    }
    if (tab === "worksheets" || tab === "exams" || tab === "competitions" || tab === "student-progress") {
      if (levelId) p.levelId = levelId;
    }
    if (tab === "exams" && examCycleId) p.examCycleId = examCycleId;
    if (tab === "competitions" && competitionId) p.competitionId = competitionId;

    return p;
  }, [tab, batchId, levelId, examCycleId, competitionId, from, to, limit, offset]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = buildParams();
      let result;
      if (tab === "attendance") result = await getAnalyticsAttendance(params);
      else if (tab === "worksheets") result = await getAnalyticsWorksheets(params);
      else if (tab === "mock-tests") result = await getAnalyticsMockTests(params);
      else if (tab === "exams") result = await getAnalyticsExams(params);
      else if (tab === "competitions") result = await getAnalyticsCompetitions(params);
      else if (tab === "student-progress") result = await getAnalyticsStudentProgress(params);

      const d = result?.data || result || {};
      setSummary(d.summary || null);
      setItems(Array.isArray(d.items) ? d.items : []);
      setTotal(typeof d.total === "number" ? d.total : 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load analytics.");
      setSummary(null);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, buildParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTabChange = (key) => {
    setTab(key);
    setOffset(0);
  };

  const handleApply = () => {
    setOffset(0);
    fetchData();
  };

  const handleReset = () => {
    setBatchId("");
    setLevelId("");
    setExamCycleId("");
    setCompetitionId("");
    setFrom(firstOfMonthStr());
    setTo(todayStr());
    setOffset(0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildParams();
      let resp;
      if (tab === "attendance") resp = await exportAnalyticsAttendanceCsv(params);
      else if (tab === "worksheets") resp = await exportAnalyticsWorksheetsCsv(params);
      else if (tab === "mock-tests") resp = await exportAnalyticsMockTestsCsv(params);
      else if (tab === "exams") resp = await exportAnalyticsExamsCsv(params);
      else if (tab === "competitions") resp = await exportAnalyticsCompetitionsCsv(params);
      else if (tab === "student-progress") resp = await exportAnalyticsStudentProgressCsv(params);
      if (resp) downloadBlob(resp.data, `${tab}_analytics.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    } finally {
      setExporting(false);
    }
  };

  // ── Tab-specific columns and summary cards ──

  const attendanceColumns = [
    { key: "admissionNo", header: "Adm. No" },
    { key: "studentName", header: "Student" },
    { key: "batchName", header: "Batch" },
    { key: "totalSessions", header: "Sessions" },
    { key: "presentCount", header: "Present" },
    { key: "absentCount", header: "Absent" },
    { key: "lateCount", header: "Late" },
    { key: "excusedCount", header: "Excused" },
    { key: "attendanceRate", header: "Rate %", render: (r) => `${r.attendanceRate}%` }
  ];

  const worksheetColumns = [
    { key: "admissionNo", header: "Adm. No" },
    { key: "studentName", header: "Student" },
    { key: "levelName", header: "Level" },
    { key: "assignedCount", header: "Assigned" },
    { key: "completedCount", header: "Completed" },
    { key: "pendingCount", header: "Pending" },
    { key: "avgScore", header: "Avg Score" },
    { key: "bestScore", header: "Best" },
    { key: "avgTimeSeconds", header: "Avg Time (s)" }
  ];

  const mockTestColumns = [
    { key: "title", header: "Test" },
    { key: "batchName", header: "Batch" },
    { key: "date", header: "Date", render: (r) => formatDate(r.date) },
    { key: "maxMarks", header: "Max Marks" },
    { key: "status", header: "Status" },
    { key: "studentsCount", header: "Students" },
    { key: "avgMarks", header: "Avg Marks" },
    { key: "maxObtainedMarks", header: "Top Marks" },
    { key: "passRate", header: "Pass Rate %", render: (r) => `${r.passRate}%` }
  ];

  const examColumns = [
    { key: "admissionNo", header: "Adm. No" },
    { key: "studentName", header: "Student" },
    { key: "levelName", header: "Level" },
    { key: "examCycleName", header: "Exam Cycle" },
    { key: "examCycleCode", header: "Code" },
    { key: "avgScore", header: "Avg Score" },
    { key: "totalAttempts", header: "Attempts" },
    { key: "resultStatus", header: "Result Status" }
  ];

  const competitionColumns = [
    { key: "competitionTitle", header: "Competition" },
    { key: "admissionNo", header: "Adm. No" },
    { key: "studentName", header: "Student" },
    { key: "levelName", header: "Level" },
    { key: "totalScore", header: "Score" },
    { key: "rank", header: "Rank", render: (r) => r.rank ?? "—" },
    { key: "startsAt", header: "Starts", render: (r) => formatDate(r.startsAt) },
    { key: "endsAt", header: "Ends", render: (r) => formatDate(r.endsAt) }
  ];

  const progressColumns = [
    { key: "admissionNo", header: "Adm. No" },
    { key: "studentName", header: "Student" },
    { key: "levelName", header: "Level" },
    { key: "daysAtCurrentLevel", header: "Days at Level" },
    { key: "worksheetsDone", header: "Worksheets Done" },
    { key: "avgScore", header: "Avg Score" },
    { key: "totalPromotions", header: "Promotions" }
  ];

  const columnsMap = {
    attendance: attendanceColumns,
    worksheets: worksheetColumns,
    "mock-tests": mockTestColumns,
    exams: examColumns,
    competitions: competitionColumns,
    "student-progress": progressColumns
  };

  const keyFieldMap = {
    attendance: "studentId",
    worksheets: "studentId",
    "mock-tests": "mockTestId",
    exams: "entryId",
    competitions: (r) => `${r.competitionId}-${r.studentId}`,
    "student-progress": "studentId"
  };

  const renderSummary = () => {
    if (!summary) return null;
    if (tab === "attendance") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
          <MetricCard label="Total Sessions" value={summary.totalSessions ?? 0} />
          <MetricCard label="Avg Attendance %" value={`${summary.avgAttendanceRate ?? 0}%`} />
          <MetricCard label="100% Students" value={summary.perfect100Count ?? 0} />
          <MetricCard label="Below 75%" value={summary.below75Count ?? 0} />
        </div>
      );
    }
    if (tab === "worksheets") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
          <MetricCard label="Assigned" value={summary.totalAssigned ?? 0} />
          <MetricCard label="Completed" value={summary.totalCompleted ?? 0} />
          <MetricCard label="Avg Accuracy" value={`${summary.avgAccuracy ?? 0}%`} />
          <MetricCard label="Avg Time (s)" value={summary.avgTimeSeconds ?? 0} />
        </div>
      );
    }
    if (tab === "mock-tests") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
          <MetricCard label="Total Tests" value={summary.totalTests ?? 0} />
          <MetricCard label="Avg Score" value={summary.avgScore ?? 0} />
          <MetricCard label="Pass Rate" value={`${summary.overallPassRate ?? 0}%`} />
          <MetricCard label="Students Tested" value={summary.totalStudentsTested ?? 0} />
        </div>
      );
    }
    if (tab === "exams") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
          <MetricCard label="Enrolled" value={summary.totalEnrolled ?? 0} />
          <MetricCard label="Results Published" value={summary.resultsPublished ?? 0} />
          <MetricCard label="Avg Score" value={summary.avgScore ?? 0} />
        </div>
      );
    }
    if (tab === "competitions") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
          <MetricCard label="Competitions" value={summary.totalCompetitions ?? 0} />
          <MetricCard label="Enrolled" value={summary.totalEnrolled ?? 0} />
          <MetricCard label="Avg Score" value={summary.avgScore ?? 0} />
        </div>
      );
    }
    if (tab === "student-progress") {
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
          <MetricCard label="Total Students" value={summary.totalStudents ?? 0} />
          <MetricCard label="Promoted (30d)" value={summary.promotedLast30d ?? 0} />
          <MetricCard label="Avg Level" value={summary.avgLevel ?? 0} />
        </div>
      );
    }
    return null;
  };

  // Which filters apply to which tabs
  const showBatch = ["attendance", "worksheets", "mock-tests", "student-progress"].includes(tab);
  const showLevel = ["worksheets", "exams", "competitions", "student-progress"].includes(tab);
  const showExamCycle = tab === "exams";
  const showCompetition = tab === "competitions";
  const showDate = ["attendance", "worksheets", "mock-tests", "exams", "competitions"].includes(tab);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 8 }}>📊 My Analytics</h2>
      <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
        Analytics for your assigned students — attendance, worksheets, tests, exams, competitions and progress.
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`button ${tab === t.key ? "" : "secondary"}`}
            style={{ width: "auto", fontSize: 13 }}
            onClick={() => handleTabChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Filters</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          {showBatch && (
            <label style={{ fontSize: 12 }}>
              Batch
              <select value={batchId} onChange={(e) => setBatchId(e.target.value)} style={{ display: "block", marginTop: 4, minWidth: 140 }}>
                <option value="">All My Batches</option>
                {batches.map((b) => (
                  <option key={b.batchId || b.id} value={b.batchId || b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}
          {showLevel && (
            <label style={{ fontSize: 12 }}>
              Level
              <select value={levelId} onChange={(e) => setLevelId(e.target.value)} style={{ display: "block", marginTop: 4, minWidth: 120 }}>
                <option value="">All Levels</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>
          )}
          {showExamCycle && (
            <label style={{ fontSize: 12 }}>
              Exam Cycle
              <select value={examCycleId} onChange={(e) => setExamCycleId(e.target.value)} style={{ display: "block", marginTop: 4, minWidth: 160 }}>
                <option value="">All Cycles</option>
                {examCycles.map((ec) => (
                  <option key={ec.id} value={ec.id}>{ec.name || ec.code}</option>
                ))}
              </select>
            </label>
          )}
          {showCompetition && (
            <label style={{ fontSize: 12 }}>
              Competition
              <select value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} style={{ display: "block", marginTop: 4, minWidth: 160 }}>
                <option value="">All Competitions</option>
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </label>
          )}
          {showDate && (
            <>
              <label style={{ fontSize: 12 }}>
                From
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ display: "block", marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                To
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ display: "block", marginTop: 4 }} />
              </label>
            </>
          )}
          <button className="button" style={{ width: "auto" }} onClick={handleApply}>Apply</button>
          <button className="button secondary" style={{ width: "auto" }} onClick={handleReset}>Reset</button>
          <button className="button secondary" style={{ width: "auto" }} onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting..." : "📥 Export CSV"}
          </button>
        </div>
      </div>

      {error && <div style={{ color: "#dc2626", marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)" }}>Loading...</div>
      ) : (
        <>
          {renderSummary()}
          <DataTable
            columns={columnsMap[tab] || []}
            rows={items}
            keyField={keyFieldMap[tab] || "id"}
          />
          <div style={{ marginTop: 12 }}>
            <PaginationBar
              limit={limit}
              offset={offset}
              count={items.length}
              total={total}
              onChange={({ offset: newOffset }) => setOffset(newOffset)}
            />
          </div>
        </>
      )}
    </div>
  );
}

export { TeacherAnalyticsPage };
