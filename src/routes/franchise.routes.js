import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { requireFranchiseScope } from "../middleware/franchise-scope.js";
import { requireScopeAccess } from "../middleware/scope-access.js";
import {
  createCenter,
  deleteCenter,
  resetCenterPassword,
  exportFranchiseReportsCsv,
  exportFranchiseStudentsCsv,
  forwardFranchiseCompetitionRequest,
  getFranchiseDashboard,
  getFranchiseMe,
  getFranchiseReports,
  listFranchiseCenters,
  listFranchiseCompetitionRequests,
  listFranchiseCourses,
  listFranchiseMargins,
  listFranchiseSettlements,
  listFranchiseStudents,
  rejectFranchiseCompetitionRequest,
  updateCenter,
  updateFranchiseProfile
} from "../controllers/franchise.controller.js";

const franchiseRouter = Router();

franchiseRouter.use(requireRole("FRANCHISE"));
franchiseRouter.use(requireFranchiseScope);

franchiseRouter.get("/me", auditAction("FRANCHISE_VIEW_PROFILE", "FRANCHISE"), getFranchiseMe);

franchiseRouter.patch(
  "/profile",
  auditAction("FRANCHISE_UPDATE_PROFILE", "FRANCHISE"),
  updateFranchiseProfile
);

franchiseRouter.get(
  "/dashboard",
  auditAction("FRANCHISE_VIEW_DASHBOARD", "FRANCHISE"),
  getFranchiseDashboard
);

franchiseRouter.get(
  "/margins",
  auditAction("FRANCHISE_VIEW_MARGINS", "MARGIN"),
  listFranchiseMargins
);

franchiseRouter.get(
  "/settlements",
  auditAction("FRANCHISE_VIEW_SETTLEMENTS", "SETTLEMENT"),
  listFranchiseSettlements
);

franchiseRouter.get(
  "/centers",
  auditAction("FRANCHISE_LIST_CENTERS", "CENTER"),
  listFranchiseCenters
);

franchiseRouter.post(
  "/centers",
  auditAction("FRANCHISE_CREATE_CENTER", "CENTER"),
  createCenter
);

franchiseRouter.put(
  "/centers/:id",
  auditAction("FRANCHISE_UPDATE_CENTER", "CENTER", (req) => req.params.id),
  updateCenter
);

franchiseRouter.delete(
  "/centers/:id",
  auditAction("FRANCHISE_DELETE_CENTER", "CENTER", (req) => req.params.id),
  deleteCenter
);

franchiseRouter.post(
  "/centers/:id/reset-password",
  auditAction("FRANCHISE_RESET_CENTER_PASSWORD", "CENTER", (req) => req.params.id),
  resetCenterPassword
);

franchiseRouter.get(
  "/students",
  auditAction("FRANCHISE_VIEW_STUDENTS", "STUDENT"),
  listFranchiseStudents
);

franchiseRouter.get(
  "/students/export.csv",
  auditAction("FRANCHISE_EXPORT_STUDENTS", "STUDENT"),
  exportFranchiseStudentsCsv
);

franchiseRouter.get(
  "/reports",
  auditAction("FRANCHISE_VIEW_REPORTS", "REPORT"),
  getFranchiseReports
);

franchiseRouter.get(
  "/reports/export.csv",
  auditAction("FRANCHISE_EXPORT_REPORTS", "REPORT"),
  exportFranchiseReportsCsv
);

franchiseRouter.get(
  "/competition_requests",
  auditAction("FRANCHISE_VIEW_COMPETITION_REQUESTS", "COMPETITION"),
  listFranchiseCompetitionRequests
);

franchiseRouter.post(
  "/competition_requests/:id/forward",
  requireScopeAccess("competition", "id"),
  auditAction("FRANCHISE_FORWARD_COMPETITION_REQUEST", "COMPETITION", (req) => req.params.id),
  forwardFranchiseCompetitionRequest
);

franchiseRouter.post(
  "/competition_requests/:id/reject",
  requireScopeAccess("competition", "id"),
  auditAction("FRANCHISE_REJECT_COMPETITION_REQUEST", "COMPETITION", (req) => req.params.id),
  rejectFranchiseCompetitionRequest
);

franchiseRouter.get(
  "/courses",
  auditAction("FRANCHISE_VIEW_COURSES", "COURSE"),
  listFranchiseCourses
);

export { franchiseRouter };
