import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { toCsv } from "../utils/csv.js";
import {
  getAttendanceAnalytics,
  getWorksheetAnalytics,
  getMockTestAnalytics,
  getExamAnalytics,
  getCompetitionAnalytics,
  getStudentProgressAnalytics
} from "../services/teacher-analytics.service.js";

function extractScope(req) {
  const tenantId = req.auth?.tenantId;
  const centerId = req.auth?.hierarchyNodeId;
  const teacherUserId = req.auth?.userId;
  if (!tenantId || !centerId || !teacherUserId) return null;
  return { tenantId, centerId, teacherUserId };
}

function formatDate(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
}

// ── Attendance ───────────────────────────────────────────────────────

const analyticsAttendance = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { limit, offset } = parsePagination(req.query);
  const { batchId, studentId, from, to } = req.query;

  const result = await getAttendanceAnalytics({
    ...scope, batchId, studentId, from, to, limit, offset
  });
  return res.apiSuccess("Attendance analytics fetched", result);
});

const exportAttendanceCsv = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { batchId, studentId, from, to } = req.query;

  const result = await getAttendanceAnalytics({
    ...scope, batchId, studentId, from, to, limit: 10000, offset: 0
  });

  const csv = toCsv({
    headers: ["Admission No", "Student Name", "Batch", "Sessions", "Present", "Absent", "Late", "Excused", "Rate %"],
    rows: result.items.map((r) => [
      r.admissionNo, r.studentName, r.batchName, r.totalSessions,
      r.presentCount, r.absentCount, r.lateCount, r.excusedCount, r.attendanceRate
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=attendance_analytics.csv");
  return res.status(200).send(csv);
});

// ── Worksheets ───────────────────────────────────────────────────────

const analyticsWorksheets = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { limit, offset } = parsePagination(req.query);
  const { batchId, studentId, levelId, from, to } = req.query;

  const result = await getWorksheetAnalytics({
    ...scope, batchId, studentId, levelId, from, to, limit, offset
  });
  return res.apiSuccess("Worksheet analytics fetched", result);
});

const exportWorksheetsCsv = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { batchId, studentId, levelId, from, to } = req.query;

  const result = await getWorksheetAnalytics({
    ...scope, batchId, studentId, levelId, from, to, limit: 10000, offset: 0
  });

  const csv = toCsv({
    headers: ["Admission No", "Student Name", "Level", "Assigned", "Completed", "Pending", "Avg Score", "Best Score", "Avg Time (s)"],
    rows: result.items.map((r) => [
      r.admissionNo, r.studentName, r.levelName, r.assignedCount,
      r.completedCount, r.pendingCount, r.avgScore, r.bestScore, r.avgTimeSeconds
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=worksheet_analytics.csv");
  return res.status(200).send(csv);
});

// ── Mock Tests ───────────────────────────────────────────────────────

const analyticsMockTests = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { limit, offset } = parsePagination(req.query);
  const { batchId, from, to } = req.query;

  const result = await getMockTestAnalytics({
    ...scope, batchId, from, to, limit, offset
  });
  return res.apiSuccess("Mock test analytics fetched", result);
});

const exportMockTestsCsv = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { batchId, from, to } = req.query;

  const result = await getMockTestAnalytics({
    ...scope, batchId, from, to, limit: 10000, offset: 0
  });

  const csv = toCsv({
    headers: ["Test", "Batch", "Date", "Max Marks", "Status", "Students", "Avg Marks", "Top Marks", "Pass Rate %"],
    rows: result.items.map((r) => [
      r.title, r.batchName, formatDate(r.date), r.maxMarks, r.status,
      r.studentsCount, r.avgMarks, r.maxObtainedMarks, r.passRate
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=mock_test_analytics.csv");
  return res.status(200).send(csv);
});

// ── Exams ────────────────────────────────────────────────────────────

const analyticsExams = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { limit, offset } = parsePagination(req.query);
  const { examCycleId, levelId, from, to } = req.query;

  const result = await getExamAnalytics({
    ...scope, examCycleId, levelId, from, to, limit, offset
  });
  return res.apiSuccess("Exam analytics fetched", result);
});

const exportExamsCsv = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { examCycleId, levelId, from, to } = req.query;

  const result = await getExamAnalytics({
    ...scope, examCycleId, levelId, from, to, limit: 10000, offset: 0
  });

  const csv = toCsv({
    headers: ["Admission No", "Student Name", "Level", "Exam Cycle", "Code", "Avg Score", "Attempts", "Result Status"],
    rows: result.items.map((r) => [
      r.admissionNo, r.studentName, r.levelName, r.examCycleName,
      r.examCycleCode, r.avgScore, r.totalAttempts, r.resultStatus
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=exam_analytics.csv");
  return res.status(200).send(csv);
});

// ── Competitions ─────────────────────────────────────────────────────

const analyticsCompetitions = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { limit, offset } = parsePagination(req.query);
  const { competitionId, levelId, from, to } = req.query;

  const result = await getCompetitionAnalytics({
    ...scope, competitionId, levelId, from, to, limit, offset
  });
  return res.apiSuccess("Competition analytics fetched", result);
});

const exportCompetitionsCsv = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { competitionId, levelId, from, to } = req.query;

  const result = await getCompetitionAnalytics({
    ...scope, competitionId, levelId, from, to, limit: 10000, offset: 0
  });

  const csv = toCsv({
    headers: ["Competition", "Admission No", "Student Name", "Level", "Score", "Rank", "Starts", "Ends"],
    rows: result.items.map((r) => [
      r.competitionTitle, r.admissionNo, r.studentName, r.levelName,
      r.totalScore, r.rank, formatDate(r.startsAt), formatDate(r.endsAt)
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=competition_analytics.csv");
  return res.status(200).send(csv);
});

// ── Student Progress ─────────────────────────────────────────────────

const analyticsStudentProgress = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { limit, offset } = parsePagination(req.query);
  const { batchId, studentId, levelId } = req.query;

  const result = await getStudentProgressAnalytics({
    ...scope, batchId, studentId, levelId, limit, offset
  });
  return res.apiSuccess("Student progress analytics fetched", result);
});

const exportStudentProgressCsv = asyncHandler(async (req, res) => {
  const scope = extractScope(req);
  if (!scope) return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  const { batchId, studentId, levelId } = req.query;

  const result = await getStudentProgressAnalytics({
    ...scope, batchId, studentId, levelId, limit: 10000, offset: 0
  });

  const csv = toCsv({
    headers: ["Admission No", "Student Name", "Level", "Days at Level", "Worksheets Done", "Avg Score", "Promotions"],
    rows: result.items.map((r) => [
      r.admissionNo, r.studentName, r.levelName, r.daysAtCurrentLevel,
      r.worksheetsDone, r.avgScore, r.totalPromotions
    ])
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=student_progress_analytics.csv");
  return res.status(200).send(csv);
});

export {
  analyticsAttendance,
  exportAttendanceCsv,
  analyticsWorksheets,
  exportWorksheetsCsv,
  analyticsMockTests,
  exportMockTestsCsv,
  analyticsExams,
  exportExamsCsv,
  analyticsCompetitions,
  exportCompetitionsCsv,
  analyticsStudentProgress,
  exportStudentProgressCsv
};
