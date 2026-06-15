import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import {
  listExamPlatformAudit,
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  listQuestionBankV2,
  createQuestionBankV2,
  updateQuestionBankV2,
  deleteQuestionBankV2,
  archiveQuestionBankV2,
  importQuestionBankCsvV2,
  exportQuestionBankCsvV2,
  bulkUploadQuestionBank,
  listExams,
  createExam,
  updateExam,
  publishExam,
  archiveExam,
  cloneExam,
  previewExam,
  generateExamPaper,
  startAttempt,
  autosaveAttempt,
  resumeAttempt,
  submitAttempt,
  evaluateAttempt,
  bulkEvaluateAttempts,
  moderateAttempt,
  approveAttempt,
  generateResults,
  listResults,
  generateCertificates,
  listCertificates,
  reissueCertificate,
  downloadCertificate,
  listCompetitionsBuilder,
  createCompetitionBuilder,
  updateCompetitionBuilder,
  registerCompetitionParticipant,
  advanceCompetitionStage,
  judgeCompetition,
  publishCompetitionWinners,
  getCompetitionLeaderboardV2,
  getExamPlatformDashboard
} from "../controllers/exam-platform.controller.js";

const examPlatformRouter = Router();

examPlatformRouter.get("/audit", requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"), listExamPlatformAudit);

examPlatformRouter.get("/subjects", requireRole("SUPERADMIN", "BP", "FRANCHISE"), auditAction("EXAM_SUBJECT_LIST", "EXAM_SUBJECT"), listSubjects);
examPlatformRouter.post("/subjects", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_SUBJECT_CREATE", "EXAM_SUBJECT"), createSubject);
examPlatformRouter.patch("/subjects/:id", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_SUBJECT_UPDATE", "EXAM_SUBJECT", (req) => req.params.id), updateSubject);
examPlatformRouter.delete("/subjects/:id", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_SUBJECT_DELETE", "EXAM_SUBJECT", (req) => req.params.id), deleteSubject);

examPlatformRouter.get("/question-bank", requireRole("SUPERADMIN", "BP", "CENTER", "FRANCHISE", "TEACHER"), auditAction("EXAM_QUESTION_LIST", "EXAM_QUESTION"), listQuestionBankV2);
examPlatformRouter.post("/question-bank", requireRole("SUPERADMIN", "BP", "CENTER"), auditAction("EXAM_QUESTION_CREATE", "EXAM_QUESTION"), createQuestionBankV2);
examPlatformRouter.patch("/question-bank/:id", requireRole("SUPERADMIN", "BP", "CENTER"), auditAction("EXAM_QUESTION_UPDATE", "EXAM_QUESTION", (req) => req.params.id), updateQuestionBankV2);
examPlatformRouter.delete("/question-bank/:id", requireRole("SUPERADMIN", "BP", "CENTER"), auditAction("EXAM_QUESTION_DELETE", "EXAM_QUESTION", (req) => req.params.id), deleteQuestionBankV2);
examPlatformRouter.post("/question-bank/:id/archive", requireRole("SUPERADMIN", "BP", "CENTER"), auditAction("EXAM_QUESTION_ARCHIVE", "EXAM_QUESTION", (req) => req.params.id), archiveQuestionBankV2);
examPlatformRouter.post("/question-bank/import-csv", requireRole("SUPERADMIN", "BP", "CENTER"), auditAction("EXAM_QUESTION_IMPORT_CSV", "EXAM_QUESTION"), importQuestionBankCsvV2);
examPlatformRouter.get("/question-bank/export-csv", requireRole("SUPERADMIN", "BP", "CENTER", "FRANCHISE", "TEACHER"), auditAction("EXAM_QUESTION_EXPORT_CSV", "EXAM_QUESTION"), exportQuestionBankCsvV2);
examPlatformRouter.post("/question-bank/bulk-upload", requireRole("SUPERADMIN", "BP", "CENTER"), auditAction("EXAM_QUESTION_BULK_UPLOAD", "EXAM_QUESTION"), bulkUploadQuestionBank);

examPlatformRouter.get("/exams", requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"), auditAction("EXAM_BUILDER_LIST", "EXAM"), listExams);
examPlatformRouter.post("/exams", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_BUILDER_CREATE", "EXAM"), createExam);
examPlatformRouter.patch("/exams/:id", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_BUILDER_UPDATE", "EXAM", (req) => req.params.id), updateExam);
examPlatformRouter.post("/exams/:id/publish", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_BUILDER_PUBLISH", "EXAM", (req) => req.params.id), publishExam);
examPlatformRouter.post("/exams/:id/archive", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_BUILDER_ARCHIVE", "EXAM", (req) => req.params.id), archiveExam);
examPlatformRouter.post("/exams/:id/clone", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_BUILDER_CLONE", "EXAM", (req) => req.params.id), cloneExam);
examPlatformRouter.get("/exams/:id/preview", requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"), auditAction("EXAM_BUILDER_PREVIEW", "EXAM", (req) => req.params.id), previewExam);
examPlatformRouter.post("/exams/:id/generate-paper", requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"), auditAction("EXAM_BUILDER_GENERATE_PAPER", "EXAM", (req) => req.params.id), generateExamPaper);

examPlatformRouter.post("/exams/:id/attempts/start", requireRole("STUDENT", "SUPERADMIN", "CENTER", "TEACHER"), auditAction("EXAM_ATTEMPT_START", "EXAM_ATTEMPT", (req) => req.params.id), startAttempt);
examPlatformRouter.patch("/attempts/:id/autosave", requireRole("STUDENT", "SUPERADMIN", "CENTER", "TEACHER"), auditAction("EXAM_ATTEMPT_AUTOSAVE", "EXAM_ATTEMPT", (req) => req.params.id), autosaveAttempt);
examPlatformRouter.get("/attempts/:id/resume", requireRole("STUDENT", "SUPERADMIN", "CENTER", "TEACHER"), auditAction("EXAM_ATTEMPT_RESUME", "EXAM_ATTEMPT", (req) => req.params.id), resumeAttempt);
examPlatformRouter.post("/attempts/:id/submit", requireRole("STUDENT", "SUPERADMIN", "CENTER", "TEACHER"), auditAction("EXAM_ATTEMPT_SUBMIT", "EXAM_ATTEMPT", (req) => req.params.id), submitAttempt);

examPlatformRouter.post("/attempts/:id/evaluate", requireRole("TEACHER", "CENTER", "SUPERADMIN"), auditAction("EXAM_ATTEMPT_EVALUATE", "EXAM_ATTEMPT", (req) => req.params.id), evaluateAttempt);
examPlatformRouter.post("/attempts/bulk-evaluate", requireRole("TEACHER", "CENTER", "SUPERADMIN"), auditAction("EXAM_ATTEMPT_BULK_EVALUATE", "EXAM_ATTEMPT"), bulkEvaluateAttempts);
examPlatformRouter.post("/attempts/:id/moderate", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_ATTEMPT_MODERATE", "EXAM_ATTEMPT", (req) => req.params.id), moderateAttempt);
examPlatformRouter.post("/attempts/:id/approve", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_ATTEMPT_APPROVE", "EXAM_ATTEMPT", (req) => req.params.id), approveAttempt);

examPlatformRouter.post("/results/generate", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_RESULT_GENERATE", "EXAM_RESULT"), generateResults);
examPlatformRouter.get("/results/:examId", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_RESULT_LIST", "EXAM_RESULT", (req) => req.params.examId), listResults);

examPlatformRouter.post("/certificates/generate", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_CERTIFICATE_GENERATE", "EXAM_CERTIFICATE"), generateCertificates);
examPlatformRouter.get("/certificates/:examId", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_CERTIFICATE_LIST", "EXAM_CERTIFICATE", (req) => req.params.examId), listCertificates);
examPlatformRouter.post("/certificates/:id/reissue", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_CERTIFICATE_REISSUE", "EXAM_CERTIFICATE", (req) => req.params.id), reissueCertificate);
examPlatformRouter.get("/certificates/download/:certificateNo", requireRole("SUPERADMIN", "BP"), auditAction("EXAM_CERTIFICATE_DOWNLOAD", "EXAM_CERTIFICATE", (req) => req.params.certificateNo), downloadCertificate);

examPlatformRouter.get("/competitions", requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"), auditAction("COMPETITION_BUILDER_LIST", "COMPETITION"), listCompetitionsBuilder);
examPlatformRouter.post("/competitions", requireRole("SUPERADMIN", "BP", "FRANCHISE"), auditAction("COMPETITION_BUILDER_CREATE", "COMPETITION"), createCompetitionBuilder);
examPlatformRouter.patch("/competitions/:id", requireRole("SUPERADMIN", "BP", "FRANCHISE"), auditAction("COMPETITION_BUILDER_UPDATE", "COMPETITION", (req) => req.params.id), updateCompetitionBuilder);
examPlatformRouter.post("/competitions/:id/register", requireRole("CENTER", "TEACHER", "SUPERADMIN", "BP", "FRANCHISE"), auditAction("COMPETITION_REGISTER", "COMPETITION", (req) => req.params.id), registerCompetitionParticipant);
examPlatformRouter.post("/competitions/:id/advance-stage", requireRole("SUPERADMIN", "BP", "FRANCHISE"), auditAction("COMPETITION_ADVANCE_STAGE", "COMPETITION", (req) => req.params.id), advanceCompetitionStage);
examPlatformRouter.post("/competitions/:id/judge", requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"), auditAction("COMPETITION_JUDGE", "COMPETITION", (req) => req.params.id), judgeCompetition);
examPlatformRouter.post("/competitions/:id/publish-winners", requireRole("SUPERADMIN", "BP", "FRANCHISE"), auditAction("COMPETITION_PUBLISH_WINNERS", "COMPETITION", (req) => req.params.id), publishCompetitionWinners);
examPlatformRouter.get("/competitions/:id/leaderboard", requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT"), auditAction("COMPETITION_LEADERBOARD", "COMPETITION", (req) => req.params.id), getCompetitionLeaderboardV2);

examPlatformRouter.get("/dashboards/summary", requireRole("SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT"), auditAction("EXAM_PLATFORM_DASHBOARD", "EXAM_PLATFORM"), getExamPlatformDashboard);

export { examPlatformRouter };
