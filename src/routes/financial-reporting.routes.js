import { Router } from "express";
import {
  dashboardSummary,
  feesMonthlyDues,
  feesPendingInstallments,
  feesReminders,
  feesStudentWise,
  healthMetrics,
  monthlyRevenue,
  revenueByBusinessPartner,
  revenueByCenter,
  revenueByType,
  revenueSummary
} from "../controllers/financial-reporting.controller.js";
import { requireRole } from "../middleware/rbac.js";

const financialReportingRouter = Router();

financialReportingRouter.get(
  "/revenue/summary",
  requireRole("SUPERADMIN", "BP", "CENTER"),
  revenueSummary
);

financialReportingRouter.get(
  "/revenue/by-type",
  requireRole("SUPERADMIN", "BP", "CENTER"),
  revenueByType
);

financialReportingRouter.get(
  "/revenue/monthly",
  requireRole("SUPERADMIN", "BP", "CENTER"),
  monthlyRevenue
);

financialReportingRouter.get(
  "/revenue/by-business-partner",
  requireRole("SUPERADMIN"),
  revenueByBusinessPartner
);

financialReportingRouter.get(
  "/revenue/by-center",
  requireRole("BP"),
  revenueByCenter
);

financialReportingRouter.get(
  "/dashboard-summary",
  requireRole("SUPERADMIN", "BP", "CENTER"),
  dashboardSummary
);

financialReportingRouter.get(
  "/health-metrics",
  requireRole("SUPERADMIN"),
  healthMetrics
);

financialReportingRouter.get(
  "/fees/pending-installments",
  requireRole("CENTER"),
  feesPendingInstallments
);

financialReportingRouter.get(
  "/fees/student-wise",
  requireRole("CENTER"),
  feesStudentWise
);

financialReportingRouter.get(
  "/fees/monthly-dues",
  requireRole("CENTER"),
  feesMonthlyDues
);

financialReportingRouter.get(
  "/fees/reminders",
  requireRole("CENTER"),
  feesReminders
);

export { financialReportingRouter };