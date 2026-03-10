import { Router } from "express";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import {
  listAttendanceSessions,
  listAttendanceCorrections,
  createAttendanceSession,
  getAttendanceSession,
  updateAttendanceEntries,
  publishAttendanceSession,
  lockAttendanceSession,
  cancelAttendanceSession,
  reopenAttendanceSession,
  createAttendanceCorrectionRequest,
  reviewAttendanceCorrectionRequest
} from "../controllers/attendance.controller.js";

const attendanceRouter = Router();

attendanceRouter.get("/sessions", requireOperationalRoles(), listAttendanceSessions);
attendanceRouter.get("/corrections", requireOperationalRoles(), listAttendanceCorrections);
attendanceRouter.post(
  "/sessions",
  requireRole("CENTER", "TEACHER", "SUPERADMIN"),
  auditAction("ATTENDANCE_CREATE_SESSION", "ATTENDANCE_SESSION"),
  createAttendanceSession
);
attendanceRouter.get("/sessions/:id", requireOperationalRoles(), getAttendanceSession);
attendanceRouter.put(
  "/sessions/:id/entries",
  requireRole("CENTER", "TEACHER", "SUPERADMIN"),
  auditAction("ATTENDANCE_MARK_ENTRIES", "ATTENDANCE_SESSION", (req) => req.params.id),
  updateAttendanceEntries
);
attendanceRouter.post(
  "/sessions/:id/publish",
  requireRole("CENTER", "TEACHER", "SUPERADMIN"),
  auditAction("ATTENDANCE_PUBLISH", "ATTENDANCE_SESSION", (req) => req.params.id),
  publishAttendanceSession
);
attendanceRouter.post(
  "/sessions/:id/lock",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("ATTENDANCE_LOCK", "ATTENDANCE_SESSION", (req) => req.params.id),
  lockAttendanceSession
);

attendanceRouter.post(
  "/sessions/:id/cancel",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("ATTENDANCE_CANCEL", "ATTENDANCE_SESSION", (req) => req.params.id),
  cancelAttendanceSession
);

attendanceRouter.post(
  "/sessions/:id/reopen",
  requireRole("CENTER", "TEACHER", "SUPERADMIN"),
  auditAction("ATTENDANCE_REOPEN", "ATTENDANCE_SESSION", (req) => req.params.id),
  reopenAttendanceSession
);

attendanceRouter.post(
  "/sessions/:id/corrections",
  requireRole("CENTER", "TEACHER", "SUPERADMIN"),
  auditAction("ATTENDANCE_CORRECTION_REQUEST", "ATTENDANCE_SESSION", (req) => req.params.id),
  createAttendanceCorrectionRequest
);

attendanceRouter.post(
  "/corrections/:requestId/review",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("ATTENDANCE_CORRECTION_REVIEW", "ATTENDANCE_CORRECTION", (req) => req.params.requestId),
  reviewAttendanceCorrectionRequest
);

export { attendanceRouter };
