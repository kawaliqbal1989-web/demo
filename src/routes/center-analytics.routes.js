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
} from "../controllers/center-analytics.controller.js";

const centerAnalyticsRouter = Router();

centerAnalyticsRouter.use(requireRole("CENTER"));

centerAnalyticsRouter.get("/attendance", analyticsAttendance);
centerAnalyticsRouter.get("/attendance/export.csv", exportAttendanceCsv);

centerAnalyticsRouter.get("/worksheets", analyticsWorksheets);
centerAnalyticsRouter.get("/worksheets/export.csv", exportWorksheetsCsv);

centerAnalyticsRouter.get("/mock-tests", analyticsMockTests);
centerAnalyticsRouter.get("/mock-tests/export.csv", exportMockTestsCsv);

centerAnalyticsRouter.get("/exams", analyticsExams);
centerAnalyticsRouter.get("/exams/export.csv", exportExamsCsv);

centerAnalyticsRouter.get("/competitions", analyticsCompetitions);
centerAnalyticsRouter.get("/competitions/export.csv", exportCompetitionsCsv);

centerAnalyticsRouter.get("/student-progress", analyticsStudentProgress);
centerAnalyticsRouter.get("/student-progress/export.csv", exportStudentProgressCsv);

export { centerAnalyticsRouter };
