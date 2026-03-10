import { Router } from "express";
import {
  archiveCourse,
  createCourse,
  createCourseLevel,
  getCourse,
  listCourseLevels,
  listCourses,
  updateCourse,
  updateCourseLevel
} from "../controllers/courses.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const coursesRouter = Router();

coursesRouter.get("/", requireSuperadmin(), listCourses);

coursesRouter.post(
  "/",
  requireSuperadmin(),
  auditAction("CREATE_COURSE", "COURSE"),
  createCourse
);

coursesRouter.get(
  "/:id",
  requireSuperadmin(),
  auditAction("VIEW_COURSE", "COURSE", (req) => req.params.id),
  getCourse
);

coursesRouter.patch(
  "/:id",
  requireSuperadmin(),
  auditAction("UPDATE_COURSE", "COURSE", (req) => req.params.id),
  updateCourse
);

coursesRouter.put(
  "/:id",
  requireSuperadmin(),
  auditAction("UPDATE_COURSE", "COURSE", (req) => req.params.id),
  updateCourse
);

coursesRouter.post(
  "/:id/archive",
  requireSuperadmin(),
  auditAction("ARCHIVE_COURSE", "COURSE", (req) => req.params.id),
  archiveCourse
);

coursesRouter.delete(
  "/:id",
  requireSuperadmin(),
  auditAction("ARCHIVE_COURSE", "COURSE", (req) => req.params.id),
  archiveCourse
);

coursesRouter.get(
  "/:courseId/levels",
  requireSuperadmin(),
  auditAction("LIST_COURSE_LEVELS", "COURSE", (req) => req.params.courseId),
  listCourseLevels
);

coursesRouter.post(
  "/:courseId/levels",
  requireSuperadmin(),
  auditAction("CREATE_COURSE_LEVEL", "COURSE", (req) => req.params.courseId),
  createCourseLevel
);

coursesRouter.patch(
  "/:courseId/levels/:id",
  requireSuperadmin(),
  auditAction("UPDATE_COURSE_LEVEL", "COURSE_LEVEL", (req) => req.params.id),
  updateCourseLevel
);

export { coursesRouter };
