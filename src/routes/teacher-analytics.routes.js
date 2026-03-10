import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import {
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
} from "../controllers/teacher-analytics.controller.js";

const teacherAnalyticsRouter = Router();

teacherAnalyticsRouter.use(requireRole("TEACHER"));

teacherAnalyticsRouter.get("/attendance", analyticsAttendance);
teacherAnalyticsRouter.get("/attendance/export.csv", exportAttendanceCsv);

teacherAnalyticsRouter.get("/worksheets", analyticsWorksheets);
teacherAnalyticsRouter.get("/worksheets/export.csv", exportWorksheetsCsv);

teacherAnalyticsRouter.get("/mock-tests", analyticsMockTests);
teacherAnalyticsRouter.get("/mock-tests/export.csv", exportMockTestsCsv);

teacherAnalyticsRouter.get("/exams", analyticsExams);
teacherAnalyticsRouter.get("/exams/export.csv", exportExamsCsv);

teacherAnalyticsRouter.get("/competitions", analyticsCompetitions);
teacherAnalyticsRouter.get("/competitions/export.csv", exportCompetitionsCsv);

teacherAnalyticsRouter.get("/student-progress", analyticsStudentProgress);
teacherAnalyticsRouter.get("/student-progress/export.csv", exportStudentProgressCsv);

export { teacherAnalyticsRouter };
