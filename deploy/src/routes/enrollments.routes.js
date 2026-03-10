import { Router } from "express";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import {
  listEnrollments,
  createEnrollment,
  updateEnrollment,
  exportEnrollmentsCsv
} from "../controllers/enrollments.controller.js";

const enrollmentsRouter = Router();

enrollmentsRouter.get("/", requireOperationalRoles(), listEnrollments);
enrollmentsRouter.get("/export.csv", requireOperationalRoles(), exportEnrollmentsCsv);

enrollmentsRouter.post(
  "/",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("CREATE_ENROLLMENT", "ENROLLMENT"),
  createEnrollment
);

enrollmentsRouter.put(
  "/:id",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("UPDATE_ENROLLMENT", "ENROLLMENT", (req) => req.params.id),
  updateEnrollment
);

export { enrollmentsRouter };
