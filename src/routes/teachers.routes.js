import { Router } from "express";
import { listTeachers, createTeacher, updateTeacher, shiftTeacherStudents, resetTeacherPassword, uploadTeacherPhoto } from "../controllers/teachers.controller.js";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { teacherPhotoUpload } from "../middleware/upload.js";

const teachersRouter = Router();

teachersRouter.get("/", requireOperationalRoles(), listTeachers);

teachersRouter.post(
	"/",
	requireRole("CENTER", "SUPERADMIN"),
	auditAction("CREATE_TEACHER", "TEACHER"),
	createTeacher
);

teachersRouter.put(
	"/:id",
	requireRole("CENTER", "SUPERADMIN"),
	auditAction("UPDATE_TEACHER", "TEACHER", (req) => req.params.id),
	updateTeacher
);

teachersRouter.post(
	"/:id/shift-students",
	requireRole("CENTER", "SUPERADMIN"),
	auditAction("SHIFT_TEACHER_STUDENTS", "ENROLLMENT", (req) => req.params.id),
	shiftTeacherStudents
);

teachersRouter.post(
	"/:id/photo",
	requireRole("CENTER", "SUPERADMIN"),
	auditAction("UPLOAD_TEACHER_PHOTO", "TEACHER", (req) => req.params.id),
	(req, res, next) => {
		teacherPhotoUpload(req, res, next);
	},
	uploadTeacherPhoto
);

teachersRouter.post(
	"/:id/reset-password",
	requireRole("CENTER", "SUPERADMIN"),
	auditAction("RESET_TEACHER_PASSWORD", "TEACHER", (req) => req.params.id),
	resetTeacherPassword
);

export { teachersRouter };