import { Router } from "express";
import {
  assignLevelToStudent,
  assignCourseToStudent,
  confirmPromotion,
  createStudent,
  createStudentFeePayment,
  createStudentLogin,
  createStudentNote,
  deleteStudentNote,
  deleteStudentInstallment,
  exportStudentsExcel,
  exportStudentsCsv,
  exportStudentNotesCsv,
  getNextStudentCode,
  getStudent,
  getStudentFeesContext,
  getPerformanceSummary,
  getPromotionStatus,
  listStudentNotes,
  listStudents,
  uploadStudentPhoto,
  resetStudentPassword,
  upsertStudentInstallment,
  updateStudent,
  updateStudentNote,
  bulkImportStudentsCsv
} from "../controllers/students.controller.js";
import { requireOperationalRoles, requireRole } from "../middleware/rbac.js";
import { requireScopeAccess } from "../middleware/scope-access.js";
import { auditAction } from "../middleware/audit-logger.js";
import { studentPhotoUpload, csvUpload } from "../middleware/upload.js";

const studentsRouter = Router();

studentsRouter.get("/", requireOperationalRoles(), listStudents);
studentsRouter.get("/export.csv", requireOperationalRoles(), exportStudentsCsv);
studentsRouter.get("/export.xlsx", requireOperationalRoles(), exportStudentsExcel);
studentsRouter.get("/next-code", requireOperationalRoles(), getNextStudentCode);
studentsRouter.post(
  "/",
  requireOperationalRoles(),
  auditAction("CREATE_STUDENT", "STUDENT"),
  createStudent
);

studentsRouter.post(
  "/import-csv",
  requireRole("CENTER", "SUPERADMIN"),
  (req, res, next) => { csvUpload(req, res, next); },
  auditAction("BULK_IMPORT_STUDENTS", "STUDENT"),
  bulkImportStudentsCsv
);

studentsRouter.get(
  "/:id",
  requireOperationalRoles(),
  requireScopeAccess("student", "id"),
  auditAction("VIEW_STUDENT", "STUDENT", (req) => req.params.id),
  getStudent
);

studentsRouter.put(
  "/:id",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("UPDATE_STUDENT", "STUDENT", (req) => req.params.id),
  updateStudent
);

studentsRouter.post(
  "/:id/create-login",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("CREATE_STUDENT_LOGIN", "AUTH", (req) => req.params.id),
  createStudentLogin
);

studentsRouter.post(
  "/:id/reset-password",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("RESET_STUDENT_PASSWORD", "AUTH", (req) => req.params.id),
  resetStudentPassword
);

studentsRouter.post(
  "/:id/fees/payments",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("STUDENT_RECORD_PAYMENT", "FINANCIAL_TRANSACTION", (req) => req.params.id),
  createStudentFeePayment
);

studentsRouter.get(
  "/:id/fees",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("STUDENT_VIEW_FEES_CONTEXT", "STUDENT", (req) => req.params.id),
  getStudentFeesContext
);

studentsRouter.post(
  "/:id/fees/installments",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("STUDENT_CREATE_INSTALLMENT", "STUDENT", (req) => req.params.id),
  upsertStudentInstallment
);

studentsRouter.delete(
  "/:id/fees/installments/:installmentId",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("STUDENT_DELETE_INSTALLMENT", "STUDENT", (req) => req.params.installmentId),
  deleteStudentInstallment
);

studentsRouter.post(
  "/:id/photo",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("UPLOAD_STUDENT_PHOTO", "STUDENT", (req) => req.params.id),
  (req, res, next) => {
    studentPhotoUpload(req, res, next);
  },
  uploadStudentPhoto
);

studentsRouter.patch(
  "/:id/assign-level",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("ASSIGN_LEVEL", "STUDENT", (req) => req.params.id),
  assignLevelToStudent
);

studentsRouter.patch(
  "/:id/assign-course",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("ASSIGN_COURSE", "STUDENT", (req) => req.params.id),
  assignCourseToStudent
);

studentsRouter.get(
  "/:id/promotion-status",
  requireOperationalRoles(),
  requireScopeAccess("student", "id"),
  getPromotionStatus
);

studentsRouter.get(
  "/:id/performance-summary",
  requireOperationalRoles(),
  requireScopeAccess("student", "id"),
  getPerformanceSummary
);

studentsRouter.get(
  "/:id/notes",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("STUDENT_VIEW_NOTES", "TEACHER_NOTE", (req) => req.params.id),
  listStudentNotes
);

studentsRouter.post(
  "/:id/notes",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  auditAction("STUDENT_NOTE_CREATE", "TEACHER_NOTE", (req) => req.params.id),
  createStudentNote
);

studentsRouter.get(
  "/:id/notes/export.csv",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  exportStudentNotesCsv
);

studentsRouter.put(
  "/notes/:noteId",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("STUDENT_NOTE_UPDATE", "TEACHER_NOTE", (req) => req.params.noteId),
  updateStudentNote
);

studentsRouter.delete(
  "/notes/:noteId",
  requireRole("CENTER", "SUPERADMIN"),
  auditAction("STUDENT_NOTE_DELETE", "TEACHER_NOTE", (req) => req.params.noteId),
  deleteStudentNote
);

studentsRouter.post(
  "/:id/confirm-promotion",
  requireRole("CENTER", "SUPERADMIN"),
  requireScopeAccess("student", "id"),
  confirmPromotion
);

export { studentsRouter };
