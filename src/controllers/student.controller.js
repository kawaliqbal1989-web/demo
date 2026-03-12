import { prisma } from "../lib/prisma.js";
import crypto from "crypto";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { submitWorksheet } from "../services/worksheet-submission.service.js";
import { getLevelPerformance, getImprovementTrend } from "../services/student-performance.service.js";
import {
  createReassignmentRequest as svcCreateReassignment,
  listReassignmentRequests as svcListReassignments,
  cancelReassignmentRequest as svcCancelReassignment,
} from "../services/worksheet-reassignment.service.js";
import {
  checkStudentHasFeature,
  requireStudentFeature,
} from "../services/practice-entitlement.service.js";
import { logger } from "../lib/logger.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";

function fullName(student) {
  const first = String(student?.firstName || "").trim();
  const last = String(student?.lastName || "").trim();
  return [first, last].filter(Boolean).join(" ").trim();
}

function mapSubmissionToAttempt(submission) {
  if (!submission) {
    return [];
  }

  return [
    {
      attemptId: submission.id,
      attemptNo: 1,
      status: submission.finalSubmittedAt ? "SUBMITTED" : "IN_PROGRESS",
      score: submission.score === null ? null : Number(submission.score),
      total: submission.totalQuestions ?? null,
      submittedAt: submission.finalSubmittedAt || null,
      durationSeconds: submission.completionTimeSeconds ?? null
    }
  ];
}

function normalizeArchivedResultSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  return {
    submissionId: snapshot.submissionId || null,
    score: snapshot.score === null || snapshot.score === undefined ? null : Number(snapshot.score),
    correctCount: snapshot.correctCount ?? null,
    totalQuestions: snapshot.totalQuestions ?? null,
    completionTimeSeconds: snapshot.completionTimeSeconds ?? null,
    submittedAt: snapshot.submittedAt || null,
    status: snapshot.status || null
  };
}

function buildAttemptResultPayload(submission) {
  if (!submission?.finalSubmittedAt) {
    return null;
  }

  return {
    status: submission.remarks === "Timed out" ? "TIMED_OUT" : "SUBMITTED",
    submittedAt: submission.finalSubmittedAt,
    score: submission.score === null || submission.score === undefined ? null : Number(submission.score),
    total: submission.totalQuestions ?? null,
    resultBreakdown: {
      correctCount: submission.correctCount ?? null,
      passThreshold: null,
      passed: submission.passed ?? null,
      completionTime: submission.completionTimeSeconds ?? null
    }
  };
}

function deriveStudentWorksheetKind(worksheet) {
  const mode = String(worksheet?.generationMode || "").trim().toUpperCase();
  if (mode === "EXAM") {
    return "EXAM";
  }

  if (mode === "PRACTICE") {
    const questions = Array.isArray(worksheet?.questions) ? worksheet.questions : [];
    const isAbacusPractice = questions.some((question) => {
      const source = question?.operands && typeof question.operands === "object" ? question.operands.source : null;
      const generator = source && typeof source === "object" ? source.generator : null;
      return String(generator || "").trim().toUpperCase() === "ABACUS_AUTO";
    });
    return isAbacusPractice ? "ABACUS_PRACTICE" : "PRACTICE";
  }

  return "WORKSHEET";
}

function deriveAttemptTimerMode(worksheetKind) {
  return worksheetKind === "PRACTICE" || worksheetKind === "ABACUS_PRACTICE" ? "COUNTDOWN" : "ELAPSED";
}

const getStudentMe = asyncHandler(async (req, res) => {
  const student = await prisma.student.findFirst({
    where: {
      id: req.student.id,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      photoUrl: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      email: true,
      gender: true,
      dateOfBirth: true,
      guardianName: true,
      guardianPhone: true,
      guardianEmail: true,
      phonePrimary: true,
      phoneSecondary: true,
      address: true,
      state: true,
      district: true,
      hierarchyNodeId: true,
      levelId: true,
      isActive: true,
      hierarchyNode: { select: { id: true, name: true, code: true } },
      level: { select: { id: true, name: true, rank: true } },
      course: { select: { id: true, code: true, name: true } }
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const [activeEnrollmentsCount, assignedWorksheetsCount, user] = await Promise.all([
    prisma.enrollment.count({
      where: {
        tenantId: req.auth.tenantId,
        studentId: student.id,
        status: "ACTIVE"
      }
    }),
    prisma.worksheet.count({
      where: {
        tenantId: req.auth.tenantId,
        levelId: student.levelId,
        isPublished: true
      }
    }),
    prisma.authUser.findFirst({
      where: {
        id: req.auth.userId,
        tenantId: req.auth.tenantId
      },
      select: {
        mustChangePassword: true,
        username: true
      }
    })
  ]);

  // fetch any explicit assigned courses (multi-assign feature)
  let assignedCourseRows = [];
  try {
    assignedCourseRows = await prisma.studentAssignedCourse.findMany({
      where: { tenantId: req.auth.tenantId, studentId: student.id },
      include: { course: { select: { id: true, code: true, name: true } } }
    });
  } catch (error) {
    if (!isSchemaMismatchError(error, ["studentassignedcourse"])) {
      throw error;
    }
  }

  const assignedCourses = assignedCourseRows.map((r) => ({
    courseId: r.course.id,
    courseCode: r.course.code || null,
    courseName: r.course.name || null
  }));

  return res.apiSuccess("Student profile fetched", {
    studentId: student.id,
    studentCode: student.admissionNo,
    username: user?.username || null,
    fullName: fullName(student),
    centerId: student.hierarchyNodeId,
    centerName: student.hierarchyNode?.name || null,
    centerCode: student.hierarchyNode?.code || null,
    levelId: student.levelId,
    levelTitle: student.level?.name || null,
    levelRank: student.level?.rank ?? null,
    activeEnrollmentsCount,
    assignedWorksheetsCount,
    courseId: student.course?.id || null,
    courseCode: student.course?.code || null,
    courseName: student.course?.name || null,
    assignedCourses,
    mustChangePassword: Boolean(user?.mustChangePassword),
    status: student.isActive ? "ACTIVE" : "INACTIVE",
    email: student.email || null,
    photoUrl: student.photoUrl || null,
    gender: student.gender || null,
    guardianName: student.guardianName || null,
    guardianPhone: student.guardianPhone || null,
    guardianEmail: student.guardianEmail || null,
    phonePrimary: student.phonePrimary || null,
    phoneSecondary: student.phoneSecondary || null,
    address: student.address || null,
    state: student.state || null,
    district: student.district || null,
    dateOfBirth: student.dateOfBirth || null
  });
});

const updateStudentProfile = asyncHandler(async (req, res) => {
  const allowedStringFields = [
    "email",
    "phonePrimary",
    "phoneSecondary",
    "guardianName",
    "guardianPhone",
    "guardianEmail",
    "address",
    "state",
    "district"
  ];
  const data = {};

  for (const field of allowedStringFields) {
    if (req.body[field] !== undefined) {
      const val = req.body[field] === null ? null : String(req.body[field]).trim();
      data[field] = val || null;
    }
  }

  if (req.body.gender !== undefined) {
    const rawGender = req.body.gender === null ? null : String(req.body.gender).trim().toUpperCase();
    if (!rawGender) {
      data.gender = null;
    } else if (!["MALE", "FEMALE", "OTHER"].includes(rawGender)) {
      return res.apiError(400, "Invalid gender", "INVALID_GENDER");
    } else {
      data.gender = rawGender;
    }
  }

  if (req.body.dateOfBirth !== undefined) {
    const rawDate = req.body.dateOfBirth === null ? null : String(req.body.dateOfBirth).trim();
    if (!rawDate) {
      data.dateOfBirth = null;
    } else {
      const parsedDate = new Date(rawDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.apiError(400, "Invalid date of birth", "INVALID_DATE_OF_BIRTH");
      }
      data.dateOfBirth = parsedDate;
    }
  }

  if (data.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      return res.apiError(400, "Invalid email format", "INVALID_EMAIL");
    }
    // Check uniqueness
    const existing = await prisma.student.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        email: data.email,
        id: { not: req.student.id }
      },
      select: { id: true }
    });
    if (existing) {
      return res.apiError(409, "Email already in use by another student", "EMAIL_TAKEN");
    }
  }

  if (data.guardianEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.guardianEmail)) {
      return res.apiError(400, "Invalid guardian email format", "INVALID_GUARDIAN_EMAIL");
    }
  }

  if (Object.keys(data).length === 0) {
    return res.apiError(400, "No fields to update", "NO_FIELDS");
  }

  await prisma.student.update({
    where: { id: req.student.id },
    data
  });

  return res.apiSuccess("Profile updated successfully");
});

const listStudentEnrollments = asyncHandler(async (req, res) => {
  const VALID_ENROLLMENT_STATUSES = ["ACTIVE", "INACTIVE", "TRANSFERRED", "ARCHIVED"];
  const rawStatus = req.query.status ? String(req.query.status).trim().toUpperCase() : null;
  const status = rawStatus && VALID_ENROLLMENT_STATUSES.includes(rawStatus) ? rawStatus : null;

  const where = {
    tenantId: req.auth.tenantId,
    studentId: req.student.id,
    ...(status ? { status } : {})
  };

  const enrollments = await prisma.enrollment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      level: { select: { id: true, name: true, rank: true } },
      assignedTeacher: { select: { id: true, username: true } },
      batch: { select: { id: true, name: true } },
      centerNode: { select: { id: true, name: true, code: true } }
    }
  });

  const teacherProfiles = new Map();
  const teacherIds = enrollments
    .map((enrollment) => enrollment.assignedTeacher?.id)
    .filter(Boolean);

  if (teacherIds.length) {
    const profiles = await prisma.teacherProfile.findMany({
      where: {
        tenantId: req.auth.tenantId,
        authUserId: { in: teacherIds }
      },
      select: {
        authUserId: true,
        fullName: true
      }
    });

    for (const profile of profiles) {
      teacherProfiles.set(profile.authUserId, profile.fullName);
    }
  }

  const response = enrollments.map((enrollment) => ({
    enrollmentId: enrollment.id,
    courseId: null,
    courseCode: enrollment.level?.rank ? `AB-L${enrollment.level.rank}` : null,
    level: enrollment.level?.rank ?? null,
    levelTitle: enrollment.level?.name ?? null,
    status: enrollment.status,
    assignedTeacherId: enrollment.assignedTeacher?.id || null,
    assignedTeacherName:
      (enrollment.assignedTeacher?.id && teacherProfiles.get(enrollment.assignedTeacher.id)) ||
      enrollment.assignedTeacher?.username ||
      null,
    centerId: enrollment.centerNode?.id || null,
    centerName: enrollment.centerNode?.name || null,
    centerCode: enrollment.centerNode?.code || null,
    batchId: enrollment.batch?.id || null,
    batchName: enrollment.batch?.name || null,
    startedAt: enrollment.startDate || enrollment.createdAt,
    dueDate: null
  }));

  return res.apiSuccess("Enrollments fetched", response);
});

async function assertWorksheetAccessibleForStudent({ tenantId, student, worksheetId }) {
  const activeAssignment = await prisma.worksheetAssignment.findFirst({
    where: {
      tenantId,
      studentId: student.id,
      worksheetId,
      isActive: true
    },
    select: { worksheetId: true }
  });

  const isAssigned = Boolean(activeAssignment);

  const worksheet = await prisma.worksheet.findFirst({
    where: {
      id: worksheetId,
      tenantId,
      ...(isAssigned ? {} : { isPublished: true })
    },
    select: {
      id: true,
      levelId: true,
      timeLimitSeconds: true,
      title: true,
      createdAt: true,
      isPublished: true,
      generationMode: true,
      examCycleId: true
    }
  });

  if (!worksheet) {
    const error = new Error("Worksheet not found");
    error.statusCode = 404;
    error.errorCode = "WORKSHEET_NOT_FOUND";
    throw error;
  }

  if (worksheet.examCycleId) {
    const examCycle = await prisma.examCycle.findFirst({
      where: {
        id: worksheet.examCycleId,
        tenantId
      },
      select: {
        id: true,
        practiceStartAt: true,
        examStartsAt: true,
        examEndsAt: true
      }
    });

    if (!examCycle) {
      const error = new Error("Exam cycle not found for worksheet");
      error.statusCode = 409;
      error.errorCode = "EXAM_CYCLE_NOT_FOUND";
      throw error;
    }

    const now = new Date();
    const practiceStartAt = new Date(examCycle.practiceStartAt);
    const examStartsAt = new Date(examCycle.examStartsAt);
    const examEndsAt = new Date(examCycle.examEndsAt);

    if (worksheet.generationMode === "PRACTICE") {
      if (now.getTime() < practiceStartAt.getTime()) {
        const error = new Error("Practice window not started");
        error.statusCode = 403;
        error.errorCode = "PRACTICE_NOT_STARTED";
        throw error;
      }
      // Requirement: practice remains valid until exam is fully held.
      if (now.getTime() > examEndsAt.getTime()) {
        const error = new Error("Practice window closed");
        error.statusCode = 403;
        error.errorCode = "PRACTICE_CLOSED";
        throw error;
      }
    }

    if (worksheet.generationMode === "EXAM") {
      if (now.getTime() < examStartsAt.getTime()) {
        const error = new Error("Exam is not live");
        error.statusCode = 403;
        error.errorCode = "EXAM_NOT_LIVE";
        throw error;
      }
      if (now.getTime() > examEndsAt.getTime()) {
        const error = new Error("Exam window closed");
        error.statusCode = 403;
        error.errorCode = "EXAM_WINDOW_CLOSED";
        throw error;
      }
    }
  }

  if (!isAssigned && worksheet.levelId !== student.levelId) {
    const activeEnrollment = await prisma.enrollment.findFirst({
      where: {
        tenantId,
        studentId: student.id,
        status: "ACTIVE",
        levelId: worksheet.levelId
      },
      select: { id: true }
    });

    if (!activeEnrollment) {
      const error = new Error("Not enrolled for this worksheet");
      error.statusCode = 403;
      error.errorCode = "WORKSHEET_NOT_ALLOWED";
      throw error;
    }
  }

  return { worksheet, isAssigned };
}

function getAttemptTiming({ startedAt, timeLimitSeconds }) {
  const safeLimit = Number.isFinite(Number(timeLimitSeconds)) && Number(timeLimitSeconds) > 0 ? Number(timeLimitSeconds) : null;
  const endsAt = safeLimit ? new Date(new Date(startedAt).getTime() + safeLimit * 1000) : null;
  return {
    endsAt,
    timeLimitSeconds: safeLimit
  };
}

function deriveAttemptStatus({ finalSubmittedAt, endsAt, now }) {
  if (finalSubmittedAt) {
    return "SUBMITTED";
  }
  if (endsAt && now.getTime() >= endsAt.getTime()) {
    return "TIMED_OUT";
  }
  return "IN_PROGRESS";
}

function normalizeAnswersMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k) continue;
    if (!v || typeof v !== "object") continue;
    out[k] = v;
  }
  return out;
}

function getAttemptDraftFromSubmission(submission, questions = []) {
  const payload = submission?.submittedAnswers;
  if (!payload || typeof payload !== "object") {
    return { version: 0, answersByQuestionId: {}, savedAt: null };
  }

  if (Array.isArray(payload)) {
    const questionIdByNumber = new Map(
      (questions || []).map((question) => [Number(question?.questionNumber), question?.id]).filter((entry) => entry[0] && entry[1])
    );
    const answersByQuestionId = {};

    for (const item of payload) {
      const questionNumber = Number(item?.questionNumber);
      const questionId = questionIdByNumber.get(questionNumber);
      if (!questionId) continue;

      const answer = item?.answer;
      if (answer === null || answer === undefined || answer === "") continue;
      answersByQuestionId[questionId] = { value: String(answer) };
    }

    return {
      version: 0,
      answersByQuestionId,
      savedAt: submission?.finalSubmittedAt || submission?.submittedAt || null
    };
  }

  const version = Number(payload.version || 0);
  const answersByQuestionId = normalizeAnswersMap(payload.answersByQuestionId);
  const savedAt = payload.savedAt ? new Date(payload.savedAt) : null;
  return {
    version: Number.isFinite(version) && version >= 0 ? version : 0,
    answersByQuestionId,
    savedAt
  };
}

function getClientSessionId(req) {
  const raw = req.headers["x-client-session"] ?? req.headers["x-client-session-id"] ?? req.headers["X-Client-Session"];
  if (!raw) return null;
  const value = String(raw).trim();
  return value ? value : null;
}

function getExamAttemptLockFromSubmission(submission) {
  const payload = submission?.submittedAnswers;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { clientSessionId: null, lockedAt: null, lastSeenAt: null };
  }

  const clientSessionId = payload.clientSessionId ? String(payload.clientSessionId).trim() : null;
  const lockedAt = payload.lockedAt ? new Date(payload.lockedAt) : null;
  const lastSeenAt = payload.lastSeenAt ? new Date(payload.lastSeenAt) : null;
  return {
    clientSessionId: clientSessionId || null,
    lockedAt: lockedAt && !Number.isNaN(lockedAt.getTime()) ? lockedAt : null,
    lastSeenAt: lastSeenAt && !Number.isNaN(lastSeenAt.getTime()) ? lastSeenAt : null
  };
}

async function enforceExamAttemptDeviceLock({ req, attempt, worksheet }) {
  if (!worksheet || worksheet.generationMode !== "EXAM") {
    return attempt;
  }

  const incoming = getClientSessionId(req);
  if (!incoming) {
    const error = new Error("Client session header is required for exam attempts");
    error.statusCode = 400;
    error.errorCode = "CLIENT_SESSION_REQUIRED";
    throw error;
  }

  const lock = getExamAttemptLockFromSubmission(attempt);
  const nowIso = new Date().toISOString();

  if (lock.clientSessionId && lock.clientSessionId !== incoming) {
    const error = new Error("Exam attempt is locked to another device/session");
    error.statusCode = 409;
    error.errorCode = "EXAM_DEVICE_LOCKED";
    throw error;
  }

  // Bind lock if missing (backward compatible) and refresh lastSeenAt.
  const nextClientSessionId = lock.clientSessionId || incoming;
  const nextLockedAtIso = lock.lockedAt ? lock.lockedAt.toISOString() : nowIso;

  const currentDraft = getAttemptDraftFromSubmission(attempt);

  const updated = await prisma.worksheetSubmission.update({
    where: { id: attempt.id },
    data: {
      submittedAnswers: {
        version: currentDraft.version,
        answersByQuestionId: currentDraft.answersByQuestionId,
        savedAt: currentDraft.savedAt ? currentDraft.savedAt.toISOString?.() ?? currentDraft.savedAt : nowIso,
        clientSessionId: nextClientSessionId,
        lockedAt: nextLockedAtIso,
        lastSeenAt: nowIso
      }
    }
  });

  return updated;
}

function mapDraftAnswersToSubmissionAnswers({ answersByQuestionId, questions }) {
  const numberById = new Map((questions || []).map((q) => [q.id, q.questionNumber]));
  const out = [];
  for (const [questionId, valueObj] of Object.entries(answersByQuestionId || {})) {
    const questionNumber = numberById.get(questionId);
    if (!questionNumber) continue;

    const rawValue = valueObj?.value;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;

    out.push({ questionNumber, answer: value });
  }
  return out;
}

const startOrResumeStudentWorksheetAttempt = asyncHandler(async (req, res) => {
  const worksheetId = String(req.params.worksheetId);
  try {
    const access = await assertWorksheetAccessibleForStudent({
      tenantId: req.auth.tenantId,
      student: req.student,
      worksheetId
    });

    const worksheet = await prisma.worksheet.findFirst({
      where: {
        id: worksheetId,
        tenantId: req.auth.tenantId,
        ...(access.isAssigned ? {} : { isPublished: true })
      },
      select: {
        id: true,
        title: true,
        generationMode: true,
        examCycleId: true,
        timeLimitSeconds: true,
        questions: {
          orderBy: { questionNumber: "asc" },
          select: {
            id: true,
            questionNumber: true,
            operands: true,
            operation: true,
            correctAnswer: true,
            questionBank: { select: { prompt: true } }
          }
        }
      }
    });

    if (!worksheet) {
      return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
    }

    // Make this endpoint safe under concurrent calls (e.g., React StrictMode double-invokes effects in dev).
    // Prisma upsert can still race on MySQL, so handle unique-constraint collisions explicitly.
    const now = new Date();

    let attempt = await prisma.worksheetSubmission.findUnique({
      where: {
        worksheetId_studentId: {
          worksheetId,
          studentId: req.student.id
        }
      }
    });

    if (!attempt) {
      try {
        const nowIso = now.toISOString();
        const clientSessionId = worksheet.generationMode === "EXAM" ? getClientSessionId(req) : null;
        if (worksheet.generationMode === "EXAM" && !clientSessionId) {
          return res.apiError(400, "Client session header is required for exam attempts", "CLIENT_SESSION_REQUIRED");
        }

        attempt = await prisma.worksheetSubmission.create({
          data: {
            tenantId: req.auth.tenantId,
            worksheetId,
            studentId: req.student.id,
            status: "PENDING",
            submittedAt: now,
            submittedAnswers: {
              version: 0,
              answersByQuestionId: {},
              savedAt: nowIso,
              ...(worksheet.generationMode === "EXAM"
                ? {
                    clientSessionId,
                    lockedAt: nowIso,
                    lastSeenAt: nowIso
                  }
                : {})
            }
          }
        });
      } catch (err) {
        if (err?.code === "P2002") {
          attempt = await prisma.worksheetSubmission.findUnique({
            where: {
              worksheetId_studentId: {
                worksheetId,
                studentId: req.student.id
              }
            }
          });
        }
        if (!attempt) {
          throw err;
        }
      }
    }

    // Enforce device/session lock for EXAM attempts.
    attempt = await enforceExamAttemptDeviceLock({ req, attempt, worksheet });

    const startedAt = attempt.submittedAt || now;
    const timing = getAttemptTiming({ startedAt, timeLimitSeconds: worksheet.timeLimitSeconds });
    const status = deriveAttemptStatus({ finalSubmittedAt: attempt.finalSubmittedAt, endsAt: timing.endsAt, now });

    const draft = getAttemptDraftFromSubmission(attempt, worksheet.questions);
    const worksheetKind = deriveStudentWorksheetKind(worksheet);
    const attemptTimerMode = deriveAttemptTimerMode(worksheetKind);

    return res.apiSuccess("Attempt fetched", {
      attemptId: attempt.id,
      worksheetId,
      status,
      worksheetKind,
      attemptTimerMode,
      startedAt,
      endsAt: timing.endsAt,
      serverNow: now,
      version: draft.version,
      savedAt: draft.savedAt,
      answersByQuestionId: draft.answersByQuestionId,
      result: buildAttemptResultPayload(attempt),
      worksheet: {
        id: worksheet.id,
        title: worksheet.title,
        worksheetKind,
        attemptTimerMode,
        generationMode: worksheet.generationMode,
        examCycleId: worksheet.examCycleId,
        timeLimitSeconds: worksheet.timeLimitSeconds,
        questions: worksheet.questions.map((q) => ({
          questionId: q.id,
          questionNumber: q.questionNumber,
          prompt: q.questionBank?.prompt || null,
          operands: q.operands,
          operation: q.operation,
          correctAnswer: worksheet.generationMode === "EXAM" ? null : q.correctAnswer,
          type: "number",
          required: true,
          options: null,
          validation: null
        }))
      }
    });
  } catch (err) {
    logger.error("startOrResumeStudentWorksheetAttempt error", { error: err?.message, stack: err?.stack });
    const statusCode = Number(err?.statusCode) || 500;
    const errorCode = err?.errorCode || "INTERNAL_ERROR";
    return res.apiError(statusCode, err?.message || "Internal server error", errorCode);
  }
});

const saveStudentAttemptAnswers = asyncHandler(async (req, res) => {
  const attemptId = String(req.params.attemptId || "").trim();
  if (!attemptId) {
    return res.apiError(400, "attemptId is required", "VALIDATION_ERROR");
  }

  const requestedVersion = Number(req.body?.version ?? 0);
  const answersByQuestionIdFull = req.body?.answersByQuestionId;
  const answersDelta = req.body?.answersDelta;

  const hasFull = answersByQuestionIdFull && typeof answersByQuestionIdFull === "object" && !Array.isArray(answersByQuestionIdFull);
  const hasDelta = answersDelta && typeof answersDelta === "object" && !Array.isArray(answersDelta);

  if (!hasFull && !hasDelta) {
    return res.apiError(400, "answersByQuestionId or answersDelta must be provided", "VALIDATION_ERROR");
  }

  const attempt = await prisma.worksheetSubmission.findFirst({
    where: {
      id: attemptId,
      tenantId: req.auth.tenantId,
      studentId: req.student.id
    }
  });

  if (!attempt) {
    return res.apiError(404, "Attempt not found", "ATTEMPT_NOT_FOUND");
  }

  const worksheet = await prisma.worksheet.findFirst({
    where: { id: attempt.worksheetId, tenantId: req.auth.tenantId },
    select: { id: true, timeLimitSeconds: true, generationMode: true }
  });

  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const now = new Date();
  // Enforce device/session lock for EXAM attempts.
  try {
    await enforceExamAttemptDeviceLock({ req, attempt, worksheet });
  } catch (e) {
    return res.apiError(e.statusCode || 409, e.message || "Exam attempt locked", e.errorCode || "EXAM_DEVICE_LOCKED");
  }

  const timing = getAttemptTiming({ startedAt: attempt.submittedAt || now, timeLimitSeconds: worksheet.timeLimitSeconds });
  const derivedStatus = deriveAttemptStatus({ finalSubmittedAt: attempt.finalSubmittedAt, endsAt: timing.endsAt, now });
  if (derivedStatus !== "IN_PROGRESS") {
    return res.apiError(409, "Attempt ended", "ATTEMPT_ENDED", {
      status: derivedStatus,
      endsAt: timing.endsAt,
      serverNow: now
    });
  }

  const currentDraft = getAttemptDraftFromSubmission(attempt);
  if (Number.isFinite(requestedVersion) && requestedVersion < currentDraft.version) {
    return res.apiError(409, "Stale version", "STALE_VERSION", {
      status: derivedStatus,
      endsAt: timing.endsAt,
      serverNow: now,
      version: currentDraft.version,
      savedAt: currentDraft.savedAt,
      answersByQuestionId: currentDraft.answersByQuestionId
    });
  }

  const mergedAnswers = hasFull
    ? normalizeAnswersMap(answersByQuestionIdFull)
    : { ...currentDraft.answersByQuestionId, ...normalizeAnswersMap(answersDelta) };

  const nextVersion = Math.max(currentDraft.version, Number.isFinite(requestedVersion) ? requestedVersion : currentDraft.version) + 1;
  const savedAt = now.toISOString();

  const lock = getExamAttemptLockFromSubmission(attempt);
  const incoming = getClientSessionId(req);
  const boundClientSessionId = lock.clientSessionId || (worksheet.generationMode === "EXAM" ? incoming : null);
  const lockedAt = lock.lockedAt ? lock.lockedAt.toISOString() : (worksheet.generationMode === "EXAM" ? savedAt : undefined);

  await prisma.worksheetSubmission.update({
    where: { id: attempt.id },
    data: {
      submittedAnswers: {
        version: nextVersion,
        answersByQuestionId: mergedAnswers,
        savedAt,
        ...(worksheet.generationMode === "EXAM"
          ? {
              clientSessionId: boundClientSessionId,
              lockedAt,
              lastSeenAt: savedAt
            }
          : {})
      }
    }
  });

  return res.apiSuccess("Answers saved", {
    status: derivedStatus,
    endsAt: timing.endsAt,
    serverNow: now,
    version: nextVersion,
    savedAt,
    lastSavedAt: savedAt
  });
});

const submitStudentAttempt = asyncHandler(async (req, res) => {
  const attemptId = String(req.params.attemptId || "").trim();
  if (!attemptId) {
    return res.apiError(400, "attemptId is required", "VALIDATION_ERROR");
  }

  const submittedAnswersByQuestionId = normalizeAnswersMap(req.body?.answersByQuestionId);

  const attempt = await prisma.worksheetSubmission.findFirst({
    where: {
      id: attemptId,
      tenantId: req.auth.tenantId,
      studentId: req.student.id
    }
  });

  if (!attempt) {
    return res.apiError(404, "Attempt not found", "ATTEMPT_NOT_FOUND");
  }

  if (attempt.finalSubmittedAt) {
    const result = buildAttemptResultPayload(attempt);
    return res.apiSuccess("Attempt already submitted", {
      receiptId: attempt.id,
      serverNow: new Date(),
      ...(result || {
        status: "SUBMITTED",
        submittedAt: attempt.finalSubmittedAt
      })
    });
  }

  const worksheet = await prisma.worksheet.findFirst({
    where: { id: attempt.worksheetId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      generationMode: true,
      timeLimitSeconds: true,
      questions: {
        orderBy: { questionNumber: "asc" },
        select: { id: true, questionNumber: true }
      }
    }
  });

  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  const now = new Date();
  // Enforce device/session lock for EXAM attempts.
  try {
    await enforceExamAttemptDeviceLock({ req, attempt, worksheet });
  } catch (e) {
    return res.apiError(e.statusCode || 409, e.message || "Exam attempt locked", e.errorCode || "EXAM_DEVICE_LOCKED");
  }

  const timing = getAttemptTiming({ startedAt: attempt.submittedAt || now, timeLimitSeconds: worksheet.timeLimitSeconds });
  const derivedStatus = deriveAttemptStatus({ finalSubmittedAt: attempt.finalSubmittedAt, endsAt: timing.endsAt, now });
  const draft = getAttemptDraftFromSubmission(attempt);
  const mergedAnswersByQuestionId = Object.keys(submittedAnswersByQuestionId).length
    ? { ...draft.answersByQuestionId, ...submittedAnswersByQuestionId }
    : draft.answersByQuestionId;
  const answers = mapDraftAnswersToSubmissionAnswers({ answersByQuestionId: mergedAnswersByQuestionId, questions: worksheet.questions });
  const isTimedOut = derivedStatus === "TIMED_OUT";

  if (!answers.length) {
    await prisma.worksheetSubmission.update({
      where: { id: attempt.id },
      data: {
        finalSubmittedAt: now,
        remarks: isTimedOut ? "Timed out" : "Submitted with no answers"
      }
    });

    return res.apiSuccess("Attempt submitted", {
      status: isTimedOut ? "TIMED_OUT" : "SUBMITTED",
      submittedAt: now,
      receiptId: attempt.id,
      score: null,
      serverNow: now
    });
  }

  const result = await submitWorksheet({
    worksheetId: worksheet.id,
    studentId: req.student.id,
    tenantId: req.auth.tenantId,
    answers,
    allowExpired: isTimedOut,
    remarksOverride: isTimedOut ? "Timed out" : undefined
  });

  return res.apiSuccess("Attempt submitted", {
    status: isTimedOut ? "TIMED_OUT" : "SUBMITTED",
    submittedAt: now,
    receiptId: attempt.id,
    score: result.accuracy,
    total: result.totalQuestions,
    resultBreakdown: {
      correctCount: result.correctCount,
      passThreshold: result.passThreshold,
      passed: result.passed,
      completionTime: result.completionTime
    },
    serverNow: now
  });
});

const listStudentWorksheets = asyncHandler(async (req, res) => {
  const { take, skip } = parsePagination(req.query);
  const search = req.query.search ? String(req.query.search).trim() : "";

  const assignmentWhere = {
    tenantId: req.auth.tenantId,
    studentId: req.student.id,
    isActive: true,
    // Hide exam-linked practice worksheets; practice is via Abacus Practice (Auto).
    NOT: {
      worksheet: {
        is: {
          examCycleId: { not: null },
          generationMode: "PRACTICE"
        }
      }
    },
    ...(search
      ? {
          worksheet: {
            OR: [{ title: { contains: search } }, { description: { contains: search } }]
          }
        }
      : {})
  };

  const activeAssignmentCount = await prisma.worksheetAssignment.count({
    where: {
      tenantId: req.auth.tenantId,
      studentId: req.student.id,
      isActive: true
    }
  });

  let total = 0;
  let worksheets = [];

  if (activeAssignmentCount > 0) {
    const [assignmentTotal, assignments] = await Promise.all([
      prisma.worksheetAssignment.count({ where: assignmentWhere }),
      prisma.worksheetAssignment.findMany({
        where: assignmentWhere,
        orderBy: { assignedAt: "desc" },
        skip,
        take,
        include: {
          worksheet: {
            select: {
              id: true,
              title: true,
              timeLimitSeconds: true,
              createdAt: true,
              questions: { select: { id: true } }
            }
          }
        }
      })
    ]);

    total = assignmentTotal;
    worksheets = assignments.map((a) => a.worksheet).filter(Boolean);
  } else {
    const where = {
      tenantId: req.auth.tenantId,
      isPublished: true,
      levelId: req.student.levelId,
      ...(search
        ? {
            OR: [{ title: { contains: search } }, { description: { contains: search } }]
          }
        : {})
    };

    const [fallbackTotal, fallbackWorksheets] = await Promise.all([
      prisma.worksheet.count({ where }),
      prisma.worksheet.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          questions: { select: { id: true } }
        }
      })
    ]);

    total = fallbackTotal;
    worksheets = fallbackWorksheets;
  }

  const worksheetIds = worksheets.map((w) => w.id);
  let submissions = [];
  let reassignmentAggregates = [];

  if (worksheetIds.length) {
    [submissions, reassignmentAggregates] = await Promise.all([
      prisma.worksheetSubmission.findMany({
        where: {
          tenantId: req.auth.tenantId,
          studentId: req.student.id,
          worksheetId: { in: worksheetIds }
        },
        select: {
          worksheetId: true,
          id: true,
          finalSubmittedAt: true,
          status: true,
          score: true,
          totalQuestions: true
        }
      }),
      prisma.worksheetReassignmentRequest.groupBy({
        by: ["currentWorksheetId"],
        where: {
          tenantId: req.auth.tenantId,
          studentId: req.student.id,
          currentWorksheetId: { in: worksheetIds },
          status: "APPROVED"
        },
        _count: { id: true }
      }).catch((error) => {
        if (!isSchemaMismatchError(error, ["worksheetreassignmentrequest"])) {
          throw error;
        }

        return [];
      })
    ]);
  }

  const byWorksheetId = new Map(submissions.map((s) => [s.worksheetId, s]));
  const reassignmentCountByWorksheetId = new Map(reassignmentAggregates.map((item) => [item.currentWorksheetId, item._count.id]));

  const items = worksheets.map((worksheet) => {
    const submission = byWorksheetId.get(worksheet.id) || null;
    let status = "NOT_STARTED";
    if (submission) {
      status = submission.finalSubmittedAt ? "SUBMITTED" : "IN_PROGRESS";
    }

    return {
      worksheetId: worksheet.id,
      worksheetNumber: null,
      title: worksheet.title,
      totalQuestions: worksheet.questions.length,
      assignedCount: 1,
      status,
      availability: null,
      durationSeconds: worksheet.timeLimitSeconds || null,
      reassignmentCount: reassignmentCountByWorksheetId.get(worksheet.id) || 0,
      questionsPreviewUrl: null,
      latestAttempt: submission
        ? {
            attemptId: submission.id,
            score: submission.score === null ? null : Number(submission.score),
            total: submission.totalQuestions ?? null,
            status: submission.finalSubmittedAt ? "SUBMITTED" : "IN_PROGRESS"
          }
        : null
    };
  });

  return res.apiSuccess("Worksheets fetched", {
    total,
    page: Math.floor(skip / take) + 1,
    pageSize: take,
    items
  });
});

const getStudentWorksheet = asyncHandler(async (req, res) => {
  const worksheetId = String(req.params.worksheetId);
  const access = await assertWorksheetAccessibleForStudent({
    tenantId: req.auth.tenantId,
    student: req.student,
    worksheetId
  });

  const worksheet = await prisma.worksheet.findFirst({
    where: {
      id: worksheetId,
      tenantId: req.auth.tenantId,
      ...(access.isAssigned ? {} : { isPublished: true })
    },
    select: {
      id: true,
      title: true,
      description: true,
      timeLimitSeconds: true,
      createdAt: true,
      questions: {
        orderBy: { questionNumber: "asc" },
        select: {
          id: true,
          questionNumber: true,
          operands: true,
          operation: true,
          questionBank: { select: { prompt: true } }
        }
      }
    }
  });

  if (!worksheet) {
    return res.apiError(404, "Worksheet not found", "WORKSHEET_NOT_FOUND");
  }

  return res.apiSuccess("Worksheet fetched", worksheet);
});

const startStudentWorksheet = asyncHandler(async (req, res) => {
  const worksheetId = String(req.params.worksheetId);
  const attemptMode = req.body?.attemptMode ? String(req.body.attemptMode).trim().toLowerCase() : "practice";

  if (!["practice", "test"].includes(attemptMode)) {
    return res.apiError(400, "attemptMode must be practice or test", "VALIDATION_ERROR");
  }

  const { worksheet } = await assertWorksheetAccessibleForStudent({
    tenantId: req.auth.tenantId,
    student: req.student,
    worksheetId
  });

  const existing = await prisma.worksheetSubmission.findUnique({
    where: {
      worksheetId_studentId: {
        worksheetId,
        studentId: req.student.id
      }
    },
    select: {
      id: true,
      submittedAt: true,
      finalSubmittedAt: true
    }
  });

  if (existing?.finalSubmittedAt) {
    return res.apiError(409, "Worksheet already submitted", "SUBMISSION_ALREADY_FINALIZED");
  }

  const now = new Date();
  let attempt = existing;
  if (!attempt) {
    try {
      attempt = await prisma.worksheetSubmission.create({
        data: {
          tenantId: req.auth.tenantId,
          worksheetId,
          studentId: req.student.id,
          status: "PENDING",
          submittedAt: now
        },
        select: {
          id: true,
          submittedAt: true,
          finalSubmittedAt: true
        }
      });
    } catch (err) {
      if (err?.code === "P2002") {
        attempt = await prisma.worksheetSubmission.findUnique({
          where: {
            worksheetId_studentId: {
              worksheetId,
              studentId: req.student.id
            }
          },
          select: {
            id: true,
            submittedAt: true,
            finalSubmittedAt: true
          }
        });
      }
      if (!attempt) {
        throw err;
      }
    }
  }

  const expiresAt = worksheet.timeLimitSeconds
    ? new Date(now.getTime() + worksheet.timeLimitSeconds * 1000)
    : null;

  return res.apiSuccess(
    "Worksheet attempt started",
    {
      attemptId: attempt.id,
      worksheetId,
      startedAt: attempt.submittedAt || now,
      expiresAt,
      mode: attemptMode
    },
    201
  );
});

const listStudentWorksheetAttempts = asyncHandler(async (req, res) => {
  const worksheetId = String(req.params.worksheetId);
  await assertWorksheetAccessibleForStudent({
    tenantId: req.auth.tenantId,
    student: req.student,
    worksheetId
  });

  const submission = await prisma.worksheetSubmission.findUnique({
    where: {
      worksheetId_studentId: {
        worksheetId,
        studentId: req.student.id
      }
    }
  });

  return res.apiSuccess("Attempts fetched", mapSubmissionToAttempt(submission));
});

const submitStudentWorksheet = asyncHandler(async (req, res) => {
  const worksheetId = String(req.params.worksheetId);
  const attemptId = req.body?.attemptId ? String(req.body.attemptId) : null;
  const answers = req.body?.answers;

  await assertWorksheetAccessibleForStudent({
    tenantId: req.auth.tenantId,
    student: req.student,
    worksheetId
  });

  if (!attemptId) {
    return res.apiError(400, "attemptId is required", "VALIDATION_ERROR");
  }

  const existing = await prisma.worksheetSubmission.findFirst({
    where: {
      id: attemptId,
      tenantId: req.auth.tenantId,
      worksheetId,
      studentId: req.student.id
    },
    select: { id: true, finalSubmittedAt: true }
  });

  if (!existing) {
    return res.apiError(404, "Attempt not found", "ATTEMPT_NOT_FOUND");
  }

  if (existing.finalSubmittedAt) {
    return res.apiError(409, "Attempt already submitted", "SUBMISSION_ALREADY_FINALIZED");
  }

  const result = await submitWorksheet({
    worksheetId,
    studentId: req.student.id,
    tenantId: req.auth.tenantId,
    answers
  });

  return res.apiSuccess("Worksheet submitted", {
    attemptId,
    status: "SUBMITTED",
    score: result.accuracy,
    total: result.totalQuestions,
    resultBreakdown: {
      correctCount: result.correctCount,
      passThreshold: result.passThreshold,
      passed: result.passed,
      completionTime: result.completionTime
    }
  });
});

const listStudentMaterials = asyncHandler(async (req, res) => {
  const items = await prisma.material.findMany({
    where: {
      tenantId: req.auth.tenantId,
      isPublished: true,
      OR: [{ levelId: null }, { levelId: req.student.levelId }]
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      url: true,
      levelId: true,
      createdAt: true
    }
  });

  return res.apiSuccess(
    "Materials fetched",
    items.map((m) => ({
      materialId: m.id,
      title: m.title,
      description: m.description,
      type: m.type,
      url: m.url,
      levelId: m.levelId,
      publishedAt: m.createdAt
    }))
  );
});

const getStudentPracticeReport = asyncHandler(async (req, res) => {
  const rawLimit = req.query?.limit ?? req.query?.take;
  const safeLimit = Math.min(200, Math.max(1, normalizePositiveInt(rawLimit) || 50));

  const [recent, archivedResults] = await Promise.all([
    prisma.worksheetSubmission.findMany({
      where: {
        tenantId: req.auth.tenantId,
        studentId: req.student.id,
        finalSubmittedAt: { not: null }
      },
      orderBy: { finalSubmittedAt: "desc" },
      take: safeLimit,
      include: {
        worksheet: { select: { id: true, title: true, timeLimitSeconds: true } }
      }
    }),
    prisma.worksheetReassignmentRequest.findMany({
      where: {
        tenantId: req.auth.tenantId,
        studentId: req.student.id,
        status: "APPROVED",
        archivedResultSnapshot: { not: null }
      },
      orderBy: { reviewedAt: "desc" },
      take: safeLimit,
      include: {
        currentWorksheet: { select: { id: true, title: true, timeLimitSeconds: true } }
      }
    }).catch((error) => {
      if (!isSchemaMismatchError(error, ["worksheetreassignmentrequest"])) {
        throw error;
      }

      return [];
    })
  ]);

  const liveRows = recent.map((s) => ({
    resultId: s.id,
    worksheetId: s.worksheetId,
    worksheetTitle: s.worksheet?.title || null,
    score: s.score === null ? null : Number(s.score),
    total: s.totalQuestions ?? null,
    correctCount: s.correctCount ?? null,
    completionTimeSeconds: s.completionTimeSeconds ?? null,
    timeLimitSeconds: s.worksheet?.timeLimitSeconds ?? null,
    submittedAt: s.finalSubmittedAt,
    source: "LIVE"
  }));

  const archivedRows = archivedResults
    .map((request) => {
      const snapshot = normalizeArchivedResultSnapshot(request.archivedResultSnapshot);
      if (!snapshot?.submittedAt) {
        return null;
      }

      return {
        resultId: `reassign_${request.id}`,
        worksheetId: request.currentWorksheetId,
        worksheetTitle: request.currentWorksheet?.title || null,
        score: snapshot.score,
        total: snapshot.totalQuestions,
        correctCount: snapshot.correctCount,
        completionTimeSeconds: snapshot.completionTimeSeconds,
        timeLimitSeconds: request.currentWorksheet?.timeLimitSeconds ?? null,
        submittedAt: snapshot.submittedAt,
        source: "ARCHIVED_REASSIGNMENT"
      };
    })
    .filter(Boolean);

  const allRows = [...liveRows, ...archivedRows]
    .sort((a, b) => {
      const ta = a?.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b?.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return tb - ta;
    });

  const mergedRows = allRows.slice(0, safeLimit);

  const scoredRows = allRows.filter((row) => Number.isFinite(Number(row.score)));
  const scores = scoredRows.map((row) => Number(row.score));
  const avgScore = scores.length ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)) : null;
  const minScore = scores.length ? Math.min(...scores) : null;
  const maxScore = scores.length ? Math.max(...scores) : null;

  return res.apiSuccess("Practice report fetched", {
    totalAttempts: allRows.length,
    avgScore,
    minScore,
    maxScore,
    recent: mergedRows
  });
});

function normalizePositiveInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function createSeededRandom(seedValue) {
  const hashed = crypto.createHash("sha256").update(String(seedValue)).digest("hex");
  let state = parseInt(hashed.slice(0, 8), 16) || 1;

  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashToPositiveInt(value) {
  const hex = crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8);
  return parseInt(hex, 16) || 1;
}

function normalizeDigitsMode(value) {
  const v = String(value ?? "").trim().toUpperCase();
  if (v === "1" || v === "DIGIT_1" || v === "DIGIT1") return "DIGIT_1";
  if (v === "2" || v === "DIGIT_2" || v === "DIGIT2") return "DIGIT_2";
  if (v === "3" || v === "DIGIT_3" || v === "DIGIT3") return "DIGIT_3";
  if (v === "SMALL_FRIENDS" || v === "SMALLFRIENDS" || v === "SMALL_FRIEND") return "SMALL_FRIENDS";
  if (v === "LOWER_DECK_1_4" || v === "LD_1_4" || v === "LOWERDECK_1_4") return "LOWER_DECK_1_4";
  if (
    v === "LOWER_DECK_TENS_10_40" ||
    v === "TENS_LOWER_DECK" ||
    v === "TENS_LOWER_DECK_10_40" ||
    v === "LD_TENS" ||
    v === "LD_TENS_10_40"
  ) {
    return "LOWER_DECK_TENS_10_40";
  }
  if (
    v === "UPPER_DECK_TENS_50_90" ||
    v === "TENS_UPPER_DECK" ||
    v === "TENS_UPPER_DECK_50_90" ||
    v === "UD_TENS" ||
    v === "UD_TENS_50_90"
  ) {
    return "UPPER_DECK_TENS_50_90";
  }
  if (v === "UPPER_DECK_1_9" || v === "UD_1_9" || v === "UPPERDECK_1_9") return "UPPER_DECK_1_9";
  return null;
}

function randomIntInclusive(rng, min, max) {
  const a = Math.ceil(Number(min));
  const b = Math.floor(Number(max));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return a;
  return a + Math.floor(rng() * (b - a + 1));
}

function randomChoice(rng, arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

function digitsRange(digitsMode, { allowZero = true } = {}) {
  if (digitsMode === "DIGIT_1") return { min: allowZero ? 0 : 1, max: 9 };
  if (digitsMode === "DIGIT_2") return { min: 10, max: 99 };
  if (digitsMode === "DIGIT_3") return { min: allowZero ? 0 : 1, max: 999 };
  if (digitsMode === "SMALL_FRIENDS") return { min: 1, max: 8 };
  // Abacus lower deck: 1–4 beads (single-digit only).
  if (digitsMode === "LOWER_DECK_1_4") return { min: 1, max: 4 };
  // Abacus tens lower deck: tens rod only (10, 20, 30, 40).
  if (digitsMode === "LOWER_DECK_TENS_10_40") return { min: 10, max: 40 };
  // Abacus tens upper deck: tens rod upper-bead digits (50, 60, 70, 80, 90).
  if (digitsMode === "UPPER_DECK_TENS_50_90") return { min: allowZero ? 0 : 10, max: 90 };
  // Abacus upper deck: upper bead value is 5, so practice uses 5–9.
  // (Result should stay within 0–9 for unit-rod upper-deck drills.)
  if (digitsMode === "UPPER_DECK_1_9") return { min: 5, max: 9 };
  return { min: 0, max: 9 };
}

function allowedTermsProfileForDigitsMode(digitsMode) {
  if (digitsMode === "LOWER_DECK_TENS_10_40") {
    // Allow 0 as a valid running total; keep steps in tens.
    return { firstTerms: [0, 10, 20, 30, 40], otherTerms: [10, 20, 30, 40] };
  }
  if (digitsMode === "UPPER_DECK_TENS_50_90") {
    // Tens upper deck drills: tens-only running total.
    // Requirement: allow results in {0,10,20,30,40,50,60,70,80,90}.
    return { firstTerms: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], otherTerms: [10, 20, 30, 40] };
  }
  return null;
}

function opSymbol(op) {
  const normalized = String(op || "").trim().toUpperCase();
  if (normalized === "ADD") return "+";
  if (normalized === "SUB") return "-";
  if (normalized === "MUL") return "×";
  if (normalized === "DIV") return "÷";
  return normalized;
}

function evaluateExpressionLeftToRight({ terms, ops }) {
  let value = terms[0];
  for (let i = 0; i < ops.length; i += 1) {
    const op = String(ops[i] || "").trim().toUpperCase();
    const n = terms[i + 1];
    if (op === "ADD") value = value + n;
    else if (op === "SUB") value = value - n;
    else if (op === "MUL") value = value * n;
    else if (op === "DIV") value = value / n;
    else return { ok: false, value: null };

    if (!Number.isFinite(value)) return { ok: false, value: null };
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) return { ok: false, value: null };
  return { ok: true, value: Math.trunc(value) };
}

function buildExprString({ terms, ops }) {
  let out = String(terms[0]);
  for (let i = 0; i < ops.length; i += 1) {
    out += ` ${opSymbol(ops[i])} ${terms[i + 1]}`;
  }
  return out;
}

function generateAbacusExpression({ rng, termCount, digitsMode, operations }) {
  if (digitsMode === "SMALL_FRIENDS") {
    return generateAbacusSmallFriendsExpression({ rng, termCount, operations });
  }

  const maxAttempts = 200;
  const safeOps = Array.isArray(operations)
    ? operations.map((o) => String(o || "").trim().toUpperCase()).filter(Boolean)
    : [];

  const minResult = digitsMode === "LOWER_DECK_1_4"
    ? 0
    : (digitsMode === "UPPER_DECK_1_9"
        ? 0
        : (digitsMode === "LOWER_DECK_TENS_10_40" ? 0 : (digitsMode === "UPPER_DECK_TENS_50_90" ? 50 : 0)));
  const maxResult = digitsMode === "LOWER_DECK_1_4"
    ? 4
    : (digitsMode === "UPPER_DECK_1_9"
        ? 9
        : (digitsMode === "LOWER_DECK_TENS_10_40"
            ? 40
            : (digitsMode === "UPPER_DECK_TENS_50_90" ? 90 : 1_000_000)));

  const termsProfile = allowedTermsProfileForDigitsMode(digitsMode);
  const allowedFirstTerms = termsProfile?.firstTerms || null;
  const allowedOtherTerms = termsProfile?.otherTerms || allowedFirstTerms;

  if (termCount === 1) {
    const r = digitsRange(digitsMode, { allowZero: true });
    const n = allowedFirstTerms
      ? randomChoice(rng, allowedFirstTerms)
      : randomIntInclusive(rng, r.min, r.max);
    return {
      terms: [n],
      ops: [],
      expr: String(n),
      correctAnswer: Math.trunc(n)
    };
  }

  if (termCount < 2) {
    return null;
  }

  if (!safeOps.length) {
    return null;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const ops = [];
    for (let i = 0; i < termCount - 1; i += 1) {
      ops.push(safeOps[Math.min(safeOps.length - 1, Math.floor(rng() * safeOps.length))]);
    }

    const hasDiv = ops.includes("DIV");
    const firstRange = digitsRange(digitsMode, { allowZero: !hasDiv });
    const otherRange = allowedOtherTerms
      ? { min: Math.min(...allowedOtherTerms), max: Math.max(...allowedOtherTerms) }
      : digitsRange(digitsMode, { allowZero: true });

    const firstTerm = allowedFirstTerms
      ? randomChoice(rng, allowedFirstTerms.filter((x) => x >= firstRange.min && x <= firstRange.max))
      : randomIntInclusive(rng, firstRange.min, firstRange.max);
    const terms = [firstTerm];
    let current = terms[0];
    let ok = Number.isFinite(current) && current >= minResult && current <= maxResult;

    for (let i = 0; i < ops.length && ok; i += 1) {
      const op = ops[i];

      if (op === "ADD") {
        const minAdd = Math.max(1, otherRange.min);
        const maxAdd = Math.min(otherRange.max, maxResult - current);
        if (maxAdd < minAdd) {
          ok = false;
          break;
        }
        const n = allowedOtherTerms
          ? randomChoice(rng, allowedOtherTerms.filter((x) => x >= minAdd && x <= maxAdd))
          : randomIntInclusive(rng, minAdd, maxAdd);
        if (!Number.isFinite(n)) {
          ok = false;
          break;
        }
        terms.push(n);
        current = current + n;
      } else if (op === "SUB") {
        // Ensure result stays >= minResult.
        const maxSub = Math.min(current - minResult, otherRange.max);
        const minSub = Math.max(1, otherRange.min);
        if (maxSub < minSub) {
          ok = false;
          break;
        }
        const n = allowedOtherTerms
          ? randomChoice(rng, allowedOtherTerms.filter((x) => x >= minSub && x <= maxSub))
          : randomIntInclusive(rng, minSub, maxSub);
        if (!Number.isFinite(n)) {
          ok = false;
          break;
        }
        terms.push(n);
        current = current - n;
      } else if (op === "MUL") {
        // Keep multipliers smaller to avoid huge numbers.
        const mulMax = Math.min(otherRange.max, 99);
        const mulMin = Math.min(otherRange.min, mulMax);
        const n = randomIntInclusive(rng, mulMin, mulMax);
        terms.push(n);
        current = current * n;
      } else if (op === "DIV") {
        // Choose a divisor from 2..9 that divides current. If none, fail and regenerate.
        const candidates = [];
        for (let d = 2; d <= 9; d += 1) {
          if (current !== 0 && current % d === 0 && current / d >= minResult) {
            candidates.push(d);
          }
        }
        if (!candidates.length) {
          ok = false;
          break;
        }
        const n = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))];
        terms.push(n);
        current = current / n;
      } else {
        ok = false;
        break;
      }

      if (!Number.isFinite(current) || current < minResult || current > maxResult) {
        ok = false;
        break;
      }
    }

    if (!ok) {
      continue;
    }

    const evalResult = evaluateExpressionLeftToRight({ terms, ops });
    if (!evalResult.ok) {
      continue;
    }

    return {
      terms,
      ops,
      expr: buildExprString({ terms, ops }),
      correctAnswer: evalResult.value
    };
  }

  return null;
}

function generateAbacusSmallFriendsExpression({ rng, termCount, operations }) {
  const safeOps = Array.isArray(operations)
    ? operations.map((o) => String(o || "").trim().toUpperCase()).filter(Boolean)
    : [];

  if (!Number.isFinite(Number(termCount)) || termCount < 2) {
    return null;
  }

  const hasAdd = safeOps.includes("ADD");
  const hasSub = safeOps.includes("SUB");
  if (!hasAdd && !hasSub) return null;

  const addOnly = hasAdd && !hasSub;
  const subOnly = hasSub && !hasAdd;
  const both = hasAdd && hasSub;

  // Small friends (to 5) drills are only feasible for multi-term expressions when both ops exist
  // (they naturally alternate between 1–4 and 5–8).
  if ((addOnly || subOnly) && termCount > 2) {
    return null;
  }

  const ops = [];
  if (both) {
    let next = rng() < 0.5 ? "ADD" : "SUB";
    for (let i = 0; i < termCount - 1; i += 1) {
      ops.push(next);
      next = next === "ADD" ? "SUB" : "ADD";
    }
  } else if (addOnly) {
    for (let i = 0; i < termCount - 1; i += 1) ops.push("ADD");
  } else {
    for (let i = 0; i < termCount - 1; i += 1) ops.push("SUB");
  }

  // Choose a start value that makes the first operation require small friends.
  // ADD small-friends requires current in 1..4.
  // SUB small-friends requires current in 5..8 (9 doesn't have a small-friends subtraction).
  let current;
  if (ops[0] === "ADD") {
    current = randomIntInclusive(rng, 1, 4);
  } else {
    current = randomIntInclusive(rng, 5, 8);
  }

  const terms = [current];

  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];

    if (op === "ADD") {
      // Force small-friends addition: 1–4 + 1–4 -> 5–8.
      if (current < 1 || current > 4) return null;
      const minAdd = Math.max(1, 5 - current);
      const maxAdd = 4;
      if (maxAdd < minAdd) return null;
      const n = randomIntInclusive(rng, minAdd, maxAdd);
      terms.push(n);
      current += n;
      if (current < 5 || current > 8) return null;
    } else if (op === "SUB") {
      // Force small-friends subtraction: 5–8 - (current%5+1..4) -> 1–4.
      if (current < 5 || current > 8) return null;
      const remainder = current % 5; // 0..3 for 5..8
      const minSub = remainder + 1;
      const maxSub = 4;
      if (maxSub < minSub) return null;
      const n = randomIntInclusive(rng, minSub, maxSub);
      terms.push(n);
      current -= n;
      if (current < 1 || current > 4) return null;
    } else {
      return null;
    }
  }

  return {
    terms,
    ops,
    expr: buildExprString({ terms, ops }),
    correctAnswer: Math.trunc(current)
  };
}

const getStudentPracticeFeatureStatus = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = req.student.id;

  const [practiceEnabled, abacusPracticeEnabled] = await Promise.all([
    checkStudentHasFeature({ tenantId, studentId, featureKey: "PRACTICE" }),
    checkStudentHasFeature({ tenantId, studentId, featureKey: "ABACUS_PRACTICE" })
  ]);

  return res.apiSuccess("Student practice feature status loaded", {
    PRACTICE: practiceEnabled,
    ABACUS_PRACTICE: abacusPracticeEnabled
  });
});

const getStudentAbacusPracticeWorksheetOptions = asyncHandler(async (req, res) => {
  // Require student has ABACUS_PRACTICE feature assigned
  await requireStudentFeature({
    tenantId: req.auth.tenantId,
    studentId: req.student.id,
    featureKey: "ABACUS_PRACTICE"
  });

  const levelId = req.student.levelId;

  const level = await prisma.level.findFirst({
    where: { tenantId: req.auth.tenantId, id: levelId },
    select: { id: true, name: true, rank: true }
  });

  if (!level) {
    return res.apiError(404, "Student level not found", "LEVEL_NOT_FOUND");
  }

  // Determine allowed operations for this level based on what exists in question bank.
  const operationGroups = await prisma.questionBank.groupBy({
    by: ["operation"],
    where: {
      tenantId: req.auth.tenantId,
      levelId,
      isActive: true,
      operation: { in: ["ADD", "SUB", "MUL", "DIV"] }
    },
    _count: { _all: true },
    orderBy: { operation: "asc" }
  });

  const operations = operationGroups
    .map((g) => String(g.operation || "").trim())
    .filter(Boolean);

  return res.apiSuccess("Abacus practice options fetched", {
    level,
    operations,
    termCounts: Array.from({ length: 12 }, (_v, i) => i + 1),
    digitsModes: [
      "DIGIT_1",
      "DIGIT_2",
      "DIGIT_3",
      "SMALL_FRIENDS",
      "LOWER_DECK_1_4",
      "LOWER_DECK_TENS_10_40",
      "UPPER_DECK_1_9",
      "UPPER_DECK_TENS_50_90"
    ],
    defaultTotalQuestions: 200,
    maxTotalQuestions: 500
  });
});

const createStudentAbacusPracticeWorksheet = asyncHandler(async (req, res) => {
  // Require student has ABACUS_PRACTICE feature assigned
  await requireStudentFeature({
    tenantId: req.auth.tenantId,
    studentId: req.student.id,
    featureKey: "ABACUS_PRACTICE"
  });

  const levelId = req.student.levelId;
  const timeLimitSeconds = normalizePositiveInt(req.body?.timeLimitSeconds);
  const termCountRaw = Number(req.body?.termCount);
  const termCount = Number.isFinite(termCountRaw) ? Math.trunc(termCountRaw) : null;
  const digitsMode = normalizeDigitsMode(req.body?.digitsMode);

  const totalQuestionsRaw = req.body?.totalQuestions;
  const totalQuestions = normalizePositiveInt(totalQuestionsRaw) || 200;

  const operationsRaw = req.body?.operations;
  const requestedOps = Array.isArray(operationsRaw)
    ? Array.from(new Set(operationsRaw.map((o) => String(o || "").trim().toUpperCase()).filter(Boolean)))
    : [];

  if (!timeLimitSeconds) {
    return res.apiError(400, "timeLimitSeconds must be a positive integer", "VALIDATION_ERROR");
  }

  if (timeLimitSeconds < 30 || timeLimitSeconds > 7200) {
    return res.apiError(400, "timeLimitSeconds must be between 30 and 7200", "VALIDATION_ERROR");
  }

  if (!Number.isFinite(termCount) || termCount < 1 || termCount > 12) {
    return res.apiError(400, "termCount must be between 1 and 12", "VALIDATION_ERROR");
  }

  if (!digitsMode) {
    return res.apiError(400, "digitsMode is required", "VALIDATION_ERROR");
  }

  if (digitsMode === "SMALL_FRIENDS" && termCount < 2) {
    return res.apiError(400, "Small Friends requires termCount of 2 or more", "VALIDATION_ERROR");
  }

  if (totalQuestions > 500) {
    return res.apiError(400, "totalQuestions too large", "VALIDATION_ERROR");
  }

  const level = await prisma.level.findFirst({
    where: { tenantId: req.auth.tenantId, id: levelId },
    select: { id: true, name: true, rank: true }
  });

  if (!level) {
    return res.apiError(404, "Student level not found", "LEVEL_NOT_FOUND");
  }

  // Allowed operations determined by what exists in question bank for the level.
  const availableOpsRows = await prisma.questionBank.findMany({
    where: {
      tenantId: req.auth.tenantId,
      levelId,
      isActive: true,
      operation: { in: ["ADD", "SUB", "MUL", "DIV"] }
    },
    distinct: ["operation"],
    select: { operation: true }
  });

  const availableOps = new Set(
    availableOpsRows
      .map((row) => String(row.operation || "").trim().toUpperCase())
      .filter(Boolean)
  );

  if (availableOps.size === 0) {
    return res.apiError(409, "No operations available for this level", "QUESTION_BANK_EMPTY");
  }

  const opsToUse = termCount === 1
    ? []
    : (requestedOps.length
        ? requestedOps.filter((op) => availableOps.has(op))
        : Array.from(availableOps));

  if (digitsMode === "LOWER_DECK_1_4" && termCount > 1) {
    const filtered = opsToUse.filter((op) => op === "ADD" || op === "SUB");
    if (filtered.length !== opsToUse.length) {
      return res.apiError(400, "Lower Deck (1–4) supports Add/Less only", "VALIDATION_ERROR");
    }
  }

  if (digitsMode === "LOWER_DECK_TENS_10_40" && termCount > 1) {
    const filtered = opsToUse.filter((op) => op === "ADD" || op === "SUB");
    if (filtered.length !== opsToUse.length) {
      return res.apiError(400, "Tens Numbers Lower Deck supports Add/Less only", "VALIDATION_ERROR");
    }
  }

  if (digitsMode === "UPPER_DECK_TENS_50_90" && termCount > 1) {
    const filtered = opsToUse.filter((op) => op === "ADD" || op === "SUB");
    if (filtered.length !== opsToUse.length) {
      return res.apiError(400, "Tens Numbers Upper Deck supports Add/Less only", "VALIDATION_ERROR");
    }
  }

  if (digitsMode === "UPPER_DECK_1_9" && termCount > 1) {
    const filtered = opsToUse.filter((op) => op === "ADD" || op === "SUB");
    if (filtered.length !== opsToUse.length) {
      return res.apiError(400, "Upper Deck (1–9) supports Add/Less only", "VALIDATION_ERROR");
    }
  }

  if (termCount > 1 && !opsToUse.length) {
    return res.apiError(400, "Select at least one valid operation", "VALIDATION_ERROR");
  }

  if (digitsMode === "SMALL_FRIENDS" && termCount > 1) {
    const filtered = opsToUse.filter((op) => op === "ADD" || op === "SUB");
    if (filtered.length !== opsToUse.length) {
      return res.apiError(400, "Small Friends supports Add/Less only", "VALIDATION_ERROR");
    }

    const hasAdd = opsToUse.includes("ADD");
    const hasSub = opsToUse.includes("SUB");
    if (!hasAdd && !hasSub) {
      return res.apiError(400, "Small Friends supports Add/Less only", "VALIDATION_ERROR");
    }
    if (termCount > 2 && (!hasAdd || !hasSub)) {
      return res.apiError(400, "Small Friends with termCount > 2 requires both Add and Less", "VALIDATION_ERROR");
    }
  }

  // Guardrails: some bounded tens modes become impossible if the user selects only Add or only Less
  // and a high termCount (because each step is at least 10).
  if (termCount > 1 && (digitsMode === "LOWER_DECK_TENS_10_40" || digitsMode === "UPPER_DECK_TENS_50_90")) {
    const hasAdd = opsToUse.includes("ADD");
    const hasSub = opsToUse.includes("SUB");
    const addOnly = hasAdd && !hasSub;
    const subOnly = hasSub && !hasAdd;

    if (addOnly || subOnly) {
      const minStep = 10;
      const bounds = digitsMode === "LOWER_DECK_TENS_10_40"
        ? { minStart: 10, maxStart: 40, minResult: 0, maxResult: 40 }
        : { minStart: 0, maxStart: 90, minResult: 0, maxResult: 90 };

      const maxTerms = addOnly
        ? (Math.floor((bounds.maxResult - bounds.minStart) / minStep) + 1)
        : (Math.floor((bounds.maxStart - bounds.minResult) / minStep) + 1);

      if (termCount > maxTerms) {
        return res.apiError(
          400,
          `With ${digitsMode} and only ${addOnly ? "Add" : "Less"}, Terms per question cannot exceed ${maxTerms}`,
          "VALIDATION_ERROR"
        );
      }
    }
  }

  const seed = `${req.auth.tenantId}:${req.student.id}:${levelId}:ABACUS:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const rng = createSeededRandom(seed);

  const generated = [];
  for (let i = 0; i < totalQuestions; i += 1) {
    const expr = generateAbacusExpression({ rng, termCount, digitsMode, operations: opsToUse });
    if (!expr) {
      return res.apiError(409, "Unable to generate questions with selected options", "QUESTION_GENERATION_FAILED");
    }
    generated.push(expr);
  }

  const now = new Date();
  const title = `${String(level.name || "").toUpperCase()} — ${termCount} OPERATION${termCount === 1 ? "" : "S"}`;
  const digitsLabel = digitsMode === "DIGIT_1"
    ? "up to 1 digit"
    : digitsMode === "DIGIT_2"
      ? "up to 2 digits"
      : digitsMode === "DIGIT_3"
        ? "up to 3 digits"
        : String(digitsMode || "").trim();

  const description = [`Auto practice`, `${totalQuestions} questions`, `${Math.round(timeLimitSeconds / 60)} min`, `${termCount} term${termCount === 1 ? "" : "s"}`, digitsLabel, opsToUse.length ? opsToUse.join(", ") : "(no operation)"]
    .filter(Boolean)
    .join(" · ");

  const created = await prisma.$transaction(async (tx) => {
    const worksheet = await tx.worksheet.create({
      data: {
        tenantId: req.auth.tenantId,
        title,
        description,
        difficulty: level.rank <= 2 ? "EASY" : level.rank <= 4 ? "MEDIUM" : "HARD",
        levelId,
        createdByUserId: req.auth.userId,
        isPublished: false,
        generationMode: "PRACTICE",
        generationSeed: seed,
        generatedAt: now,
        timeLimitSeconds
      },
      select: { id: true, levelId: true, timeLimitSeconds: true }
    });

    await tx.worksheetQuestion.createMany({
      data: generated.map((q, index) => {
        const safeOps = Array.isArray(q.ops) ? q.ops.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean) : [];
        const onlyAddSub = safeOps.every((op) => op === "ADD" || op === "SUB");

        const nums = onlyAddSub
          ? (Array.isArray(q.terms)
              ? q.terms
                  .map((n) => Number(n))
                  .filter((n) => Number.isFinite(n))
                  .map((n, i2) => {
                    if (i2 === 0) return Math.trunc(n);
                    const op = safeOps[i2 - 1];
                    return op === "SUB" ? -Math.trunc(Math.abs(n)) : Math.trunc(n);
                  })
              : [])
          : [];

        return {
          tenantId: req.auth.tenantId,
          worksheetId: worksheet.id,
          questionBankId: null,
          questionNumber: index + 1,
          operands: {
            expr: q.expr,
            terms: q.terms,
            ops: q.ops,
            ...(onlyAddSub ? { nums } : {}),
            source: {
              generator: "ABACUS_AUTO",
              digitsMode,
              termCount,
              operations: opsToUse
            }
          },
          // Render like the attached worksheet for add/sub questions.
          operation: onlyAddSub ? "COLUMN_SUM" : "ABACUS_EXPR",
          correctAnswer: Math.trunc(q.correctAnswer)
        };
      })
    });

    await tx.worksheetAssignment.upsert({
      where: {
        worksheetId_studentId: {
          worksheetId: worksheet.id,
          studentId: req.student.id
        }
      },
      create: {
        tenantId: req.auth.tenantId,
        worksheetId: worksheet.id,
        studentId: req.student.id,
        createdByUserId: req.auth.userId,
        assignedAt: now,
        isActive: true
      },
      update: {
        unassignedAt: null,
        isActive: true
      }
    });

    return worksheet;
  });

  return res.apiSuccess(
    "Abacus practice worksheet created",
    {
      worksheetId: created.id,
      levelId: created.levelId,
      timeLimitSeconds: created.timeLimitSeconds,
      totalQuestions,
      termCount,
      digitsMode,
      operations: opsToUse
    },
    201
  );
});

const getStudentPracticeWorksheetOptions = asyncHandler(async (req, res) => {
  // Require student has PRACTICE feature assigned
  await requireStudentFeature({
    tenantId: req.auth.tenantId,
    studentId: req.student.id,
    featureKey: "PRACTICE"
  });

  const levelId = req.student.levelId;

  const level = await prisma.level.findFirst({
    where: { tenantId: req.auth.tenantId, id: levelId },
    select: { id: true, name: true, rank: true }
  });

  if (!level) {
    return res.apiError(404, "Student level not found", "LEVEL_NOT_FOUND");
  }

  const [operationGroups, totalAvailable] = await Promise.all([
    prisma.questionBank.groupBy({
      by: ["operation"],
      where: {
        tenantId: req.auth.tenantId,
        levelId,
        isActive: true
      },
      _count: { _all: true },
      orderBy: { operation: "asc" }
    }),
    prisma.questionBank.count({
      where: {
        tenantId: req.auth.tenantId,
        levelId,
        isActive: true
      }
    })
  ]);

  const operations = operationGroups
    .map((g) => String(g.operation || "").trim())
    .filter((op) => op);

  const operationCounts = operationGroups.reduce((acc, g) => {
    const op = String(g.operation || "").trim();
    if (!op) return acc;
    acc[op] = g?._count?._all ?? 0;
    return acc;
  }, {});

  // Syllabus topics (if imported with operands.source.sectionTitle / worksheetTitle).
  const topicRows = await prisma.questionBank.findMany({
    where: {
      tenantId: req.auth.tenantId,
      levelId,
      isActive: true
    },
    select: { operands: true },
    take: 5000
  });

  const topicCounts = {};
  for (const row of topicRows) {
    const src = row?.operands && typeof row.operands === "object" ? row.operands.source : null;
    const sectionTitle = src && typeof src === "object" ? src.sectionTitle : null;
    const worksheetTitle = src && typeof src === "object" ? src.worksheetTitle : null;
    const topic = String(sectionTitle || worksheetTitle || "").trim();
    if (!topic) continue;
    topicCounts[topic] = (topicCounts[topic] || 0) + 1;
  }
  const topics = Object.keys(topicCounts).sort((a, b) => a.localeCompare(b));

  return res.apiSuccess("Practice worksheet options fetched", {
    level,
    operations,
    operationCounts,
    totalAvailable,
    topics,
    topicCounts
  });
});

const createStudentPracticeWorksheet = asyncHandler(async (req, res) => {
  // Require student has PRACTICE feature assigned
  await requireStudentFeature({
    tenantId: req.auth.tenantId,
    studentId: req.student.id,
    featureKey: "PRACTICE"
  });

  const levelId = req.student.levelId;
  const totalQuestions = normalizePositiveInt(req.body?.totalQuestions);
  const timeLimitSeconds = normalizePositiveInt(req.body?.timeLimitSeconds);
  const operationsRaw = req.body?.operations;
  const allowRepeats = req.body?.allowRepeats === undefined ? true : Boolean(req.body.allowRepeats);
  const topicsRaw = req.body?.topics;

  const level = await prisma.level.findFirst({
    where: { tenantId: req.auth.tenantId, id: levelId },
    select: { id: true, name: true, rank: true }
  });

  if (!level) {
    return res.apiError(404, "Student level not found", "LEVEL_NOT_FOUND");
  }

  if (!totalQuestions) {
    return res.apiError(400, "totalQuestions must be a positive integer", "VALIDATION_ERROR");
  }

  const normalizedOps = Array.isArray(operationsRaw)
    ? Array.from(
        new Set(
          operationsRaw
            .map((op) => String(op || "").trim())
            .filter((op) => op)
        )
      )
    : [];

  // If no operations provided, we’ll allow any operation available for the level.
  const availableOpsRows = await prisma.questionBank.findMany({
    where: {
      tenantId: req.auth.tenantId,
      levelId,
      isActive: true
    },
    distinct: ["operation"],
    select: { operation: true }
  });

  const availableOps = new Set(
    availableOpsRows
      .map((row) => String(row.operation || "").trim())
      .filter((op) => op)
  );

  if (availableOps.size === 0) {
    return res.apiError(409, "No active questions available for this level", "QUESTION_BANK_EMPTY");
  }

  const opsToUse = normalizedOps.length ? normalizedOps.filter((op) => availableOps.has(op)) : Array.from(availableOps);

  if (!opsToUse.length) {
    return res.apiError(400, "No valid operations selected for this level", "VALIDATION_ERROR");
  }

  const normalizedTopics = Array.isArray(topicsRaw)
    ? Array.from(
        new Set(
          topicsRaw
            .map((t) => String(t || "").trim())
            .filter((t) => t)
        )
      )
    : [];

  // Topics are only supported for questions imported with syllabus metadata (currently COLUMN_SUM).
  if (normalizedTopics.length && !opsToUse.includes("COLUMN_SUM")) {
    return res.apiError(
      400,
      "Syllabus topics require selecting the Column Sum question type",
      "VALIDATION_ERROR"
    );
  }

  // Safety cap to prevent extreme payloads from exhausting memory/DB.
  if (totalQuestions > 2000) {
    return res.apiError(400, "totalQuestions too large", "VALIDATION_ERROR");
  }

  if (timeLimitSeconds && (timeLimitSeconds < 30 || timeLimitSeconds > 7200)) {
    return res.apiError(400, "timeLimitSeconds must be between 30 and 7200", "VALIDATION_ERROR");
  }

  const seed = `${req.auth.tenantId}:${req.student.id}:${levelId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  const baseWhere = {
    tenantId: req.auth.tenantId,
    levelId,
    isActive: true,
    operation: { in: opsToUse }
  };

  // We'll filter topics in-memory (portable across DB JSON capabilities).

  const totalAvailable = await prisma.questionBank.count({ where: baseWhere });
  if (totalAvailable === 0) {
    return res.apiError(409, "No questions available for the selected options", "QUESTION_BANK_EMPTY");
  }

  if (totalAvailable < totalQuestions && !allowRepeats) {
    return res.apiError(
      409,
      `Insufficient questions in question bank for selected options (available: ${totalAvailable}, requested: ${totalQuestions})`,
      "QUESTION_BANK_INSUFFICIENT"
    );
  }

  const seededRandom = createSeededRandom(seed);

  const rawPool = await prisma.questionBank.findMany({
    where: baseWhere,
    orderBy: { id: "asc" },
    select: {
      id: true,
      operands: true,
      operation: true,
      correctAnswer: true
    }
  });

  const pool = normalizedTopics.length
    ? rawPool.filter((q) => {
        const src = q?.operands && typeof q.operands === "object" ? q.operands.source : null;
        const sectionTitle = src && typeof src === "object" ? src.sectionTitle : null;
        const worksheetTitle = src && typeof src === "object" ? src.worksheetTitle : null;
        const topic = String(sectionTitle || worksheetTitle || "").trim();
        return topic && normalizedTopics.includes(topic);
      })
    : rawPool;

  if (!pool.length) {
    return res.apiError(409, "No questions available for the selected topics", "QUESTION_BANK_EMPTY");
  }

  if (pool.length < totalQuestions && !allowRepeats) {
    return res.apiError(
      409,
      `Insufficient questions in question bank for selected options/topics (available: ${pool.length}, requested: ${totalQuestions})`,
      "QUESTION_BANK_INSUFFICIENT"
    );
  }

  const selected = pool.length >= totalQuestions
    ? pool
        .map((item) => ({ item, sortKey: seededRandom() }))
        .sort((a, b) => a.sortKey - b.sortKey)
        .slice(0, totalQuestions)
        .map((entry) => entry.item)
    : Array.from({ length: totalQuestions }, () => {
        const idx = Math.min(pool.length - 1, Math.floor(seededRandom() * pool.length));
        return pool[idx];
      });

  const now = new Date();
  const opsLabel = `${opsToUse.length} OPERATION${opsToUse.length === 1 ? "" : "S"}`;
  const title = `${String(level.name || "").toUpperCase()} — ${opsLabel}`;
  const descriptionParts = [
    "Practice",
    `${totalQuestions} questions`,
    timeLimitSeconds ? `${Math.round(timeLimitSeconds / 60)} min` : "No time limit",
    opsToUse.join(", ")
  ].filter(Boolean);
  const description = descriptionParts.join(" · ");

  const created = await prisma.$transaction(async (tx) => {
    const worksheet = await tx.worksheet.create({
      data: {
        tenantId: req.auth.tenantId,
        title,
        description,
        difficulty: level.rank <= 2 ? "EASY" : level.rank <= 4 ? "MEDIUM" : "HARD",
        levelId,
        createdByUserId: req.auth.userId,
        isPublished: false,
        generationMode: "PRACTICE",
        generationSeed: seed,
        generatedAt: now,
        timeLimitSeconds: timeLimitSeconds || null
      },
      select: { id: true, levelId: true, timeLimitSeconds: true }
    });

    await tx.worksheetQuestion.createMany({
      data: selected.map((question, index) => ({
        tenantId: req.auth.tenantId,
        worksheetId: worksheet.id,
        questionBankId: question.id,
        questionNumber: index + 1,
        operands: question.operands,
        operation: question.operation,
        correctAnswer: Math.trunc(question.correctAnswer)
      }))
    });

    await tx.worksheetAssignment.upsert({
      where: {
        worksheetId_studentId: {
          worksheetId: worksheet.id,
          studentId: req.student.id
        }
      },
      create: {
        tenantId: req.auth.tenantId,
        worksheetId: worksheet.id,
        studentId: req.student.id,
        createdByUserId: req.auth.userId,
        assignedAt: now,
        isActive: true
      },
      update: {
        unassignedAt: null,
        isActive: true
      }
    });

    return worksheet;
  });

  return res.apiSuccess("Practice worksheet created", {
    worksheetId: created.id,
    levelId: created.levelId,
    timeLimitSeconds: created.timeLimitSeconds,
    totalQuestions,
    operations: opsToUse,
    allowRepeats,
    uniquePoolSize: pool.length,
    topics: normalizedTopics
  }, 201);
});

const listStudentRecentAttendance = asyncHandler(async (req, res) => {
  const limitRaw = req.query.limit ? Number(req.query.limit) : 7;
  const limit = Number.isFinite(limitRaw) ? Math.min(30, Math.max(1, limitRaw)) : 7;

  const rows = await prisma.attendanceEntry.findMany({
    where: {
      tenantId: req.auth.tenantId,
      studentId: req.student.id,
      session: {
        status: { in: ["PUBLISHED", "LOCKED"] }
      }
    },
    orderBy: {
      session: {
        date: "desc"
      }
    },
    take: limit,
    select: {
      status: true,
      note: true,
      markedAt: true,
      session: {
        select: {
          id: true,
          date: true,
          status: true
        }
      }
    }
  });

  return res.apiSuccess(
    "Attendance fetched",
    rows.map((row) => ({
      date: row.session?.date || null,
      status: row.status,
      sessionStatus: row.session?.status || null,
      note: row.note || null,
      markedAt: row.markedAt || null
    }))
  );
});

const getStudentWeakTopics = asyncHandler(async (req, res) => {
  const thresholdRaw = req.query.threshold ? Number(req.query.threshold) : 60;
  const threshold = Number.isFinite(thresholdRaw) ? Math.min(100, Math.max(0, thresholdRaw)) : 60;

  const lookbackRaw = req.query.lookback ? Number(req.query.lookback) : 20;
  const lookback = Number.isFinite(lookbackRaw) ? Math.min(100, Math.max(1, lookbackRaw)) : 20;

  const submissions = await prisma.worksheetSubmission.findMany({
    where: {
      tenantId: req.auth.tenantId,
      studentId: req.student.id,
      finalSubmittedAt: { not: null }
    },
    orderBy: { finalSubmittedAt: "desc" },
    take: lookback,
    select: {
      worksheetId: true,
      submittedAnswers: true,
      worksheet: {
        select: {
          questions: {
            select: {
              questionNumber: true,
              operation: true,
              correctAnswer: true
            }
          }
        }
      }
    }
  });

  const byOperation = new Map();

  for (const submission of submissions) {
    const answers = Array.isArray(submission.submittedAnswers) ? submission.submittedAnswers : [];
    const answerByNumber = new Map();
    for (const item of answers) {
      if (!item) continue;
      const questionNumber = Number(item.questionNumber);
      const answer = Number(item.answer);
      if (!Number.isFinite(questionNumber) || !Number.isFinite(answer)) continue;
      answerByNumber.set(questionNumber, answer);
    }

    const questions = submission.worksheet?.questions || [];
    for (const q of questions) {
      const operation = String(q.operation || "").trim();
      if (!operation) continue;
      if (!answerByNumber.has(q.questionNumber)) continue;

      const stats = byOperation.get(operation) || { operation, attempted: 0, correct: 0 };
      stats.attempted += 1;
      if (answerByNumber.get(q.questionNumber) === q.correctAnswer) {
        stats.correct += 1;
      }
      byOperation.set(operation, stats);
    }
  }

  const topics = Array.from(byOperation.values())
    .map((t) => ({
      topic: t.operation,
      attempted: t.attempted,
      correct: t.correct,
      accuracy: t.attempted ? Number(((t.correct / t.attempted) * 100).toFixed(2)) : null
    }))
    .filter((t) => t.accuracy !== null && t.accuracy < threshold)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .slice(0, 10);

  return res.apiSuccess("Weak topics fetched", topics);
});

const getStudentFeesSummary = asyncHandler(async (req, res) => {
  const payments = await prisma.financialTransaction.findMany({
    where: {
      tenantId: req.auth.tenantId,
      studentId: req.student.id,
      type: { in: ["ENROLLMENT", "RENEWAL", "COMPETITION"] }
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      grossAmount: true,
      createdAt: true
    }
  });

  const paidTotal = payments.reduce((sum, p) => sum + Number(p.grossAmount || 0), 0);

  return res.apiSuccess("Fees fetched", {
    isConfigured: false,
    message: "Fee not configured for your enrollment.",
    summary: {
      totalFee: null,
      paid: payments.length ? Number(paidTotal.toFixed(2)) : null,
      pending: null,
      status: null
    },
    payments: payments.map((p) => ({
      date: p.createdAt,
      amount: Number(p.grossAmount),
      mode: null,
      reference: null,
      type: p.type
    }))
  });
});

const getStudentMyCourse = asyncHandler(async (req, res) => {
  const student = await prisma.student.findFirst({
    where: {
      id: req.student.id,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      levelId: true,
      level: { select: { id: true, name: true, rank: true } }
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      studentId: student.id,
      status: "ACTIVE"
    },
    orderBy: { createdAt: "desc" },
    include: {
      level: { select: { id: true, name: true, rank: true } },
      assignedTeacher: { select: { id: true, username: true } },
      batch: { select: { id: true, name: true } },
      centerNode: { select: { id: true, name: true, code: true } }
    }
  });

  const teacherProfile = enrollment?.assignedTeacher?.id
    ? await prisma.teacherProfile.findFirst({
        where: {
          tenantId: req.auth.tenantId,
          authUserId: enrollment.assignedTeacher.id
        },
        select: { fullName: true }
      })
    : null;

  const levelRank = enrollment?.level?.rank ?? student.level?.rank ?? null;
  const courseCode = levelRank ? `AB-L${levelRank}` : null;
  const courseName = levelRank ? `Abacus Level ${levelRank}` : null;
  const levelTitle = enrollment?.level?.name ?? student.level?.name ?? null;

  const [totalWorksheets, attemptedCount, completedCount, latestSubmission] = await Promise.all([
    prisma.worksheet.count({
      where: {
        tenantId: req.auth.tenantId,
        levelId: student.levelId,
        isPublished: true
      }
    }),
    prisma.worksheetSubmission.count({
      where: {
        tenantId: req.auth.tenantId,
        studentId: student.id
      }
    }),
    prisma.worksheetSubmission.count({
      where: {
        tenantId: req.auth.tenantId,
        studentId: student.id,
        finalSubmittedAt: { not: null }
      }
    }),
    prisma.worksheetSubmission.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        studentId: student.id,
        finalSubmittedAt: { not: null }
      },
      orderBy: { finalSubmittedAt: "desc" },
      select: {
        worksheetId: true,
        score: true,
        totalQuestions: true,
        finalSubmittedAt: true,
        worksheet: { select: { title: true } }
      }
    })
  ]);

  return res.apiSuccess("My course fetched", {
    currentEnrollment: enrollment
      ? {
          courseLevelLabel: courseCode && levelTitle ? `${courseCode} / ${levelTitle}` : null,
          courseCode,
          levelTitle,
          enrollmentStatus: enrollment.status,
          assignedTeacherName:
            teacherProfile?.fullName || enrollment.assignedTeacher?.username || null,
          centerName: enrollment.centerNode?.name || null,
          centerCode: enrollment.centerNode?.code || null,
          batchName: enrollment.batch?.name || null
        }
      : null,
    myCourse: {
      courseName,
      courseCode,
      currentLevel: levelTitle,
      enrollmentStatus: enrollment?.status || null,
      teacher: enrollment?.assignedTeacher
        ? teacherProfile?.fullName || enrollment.assignedTeacher?.username || null
        : null,
      center: enrollment?.centerNode
        ? {
            name: enrollment.centerNode.name,
            code: enrollment.centerNode.code || null
          }
        : null,
      progress: {
        totalWorksheets,
        attempted: attemptedCount,
        completed: completedCount,
        lastAttemptAt: latestSubmission?.finalSubmittedAt || null
      },
      modules: levelRank
        ? [
            {
              title: `Level ${levelRank}`,
              subtitle: courseName && levelTitle ? `${courseName} · ${levelTitle}` : null
            }
          ]
        : []
    },
    latestResult: latestSubmission
      ? {
          worksheetTitle: latestSubmission.worksheet?.title || null,
          score: latestSubmission.score === null ? null : Number(latestSubmission.score),
          total: latestSubmission.totalQuestions ?? null,
          submittedAt: latestSubmission.finalSubmittedAt
        }
      : null
  });
});

const changeStudentPassword = asyncHandler(async (req, res) => {
  const currentPassword = req.body?.oldPassword ?? req.body?.currentPassword;
  const newPassword = req.body?.newPassword;

  if (!currentPassword || !newPassword) {
    return res.apiError(400, "oldPassword and newPassword are required", "VALIDATION_ERROR");
  }

  if (String(newPassword).length < 8) {
    return res.apiError(400, "Password must be at least 8 characters", "VALIDATION_ERROR");
  }

  // Reuse the existing /api/auth/change-password logic by calling into it would be ideal,
  // but controllers are not designed for direct composition.
  // Implement inline using the same logic to keep behavior consistent.
  const user = await prisma.authUser.findFirst({
    where: {
      id: req.auth.userId,
      tenantId: req.auth.tenantId,
      isActive: true
    },
    select: {
      id: true,
      tenantId: true,
      passwordHash: true
    }
  });

  if (!user) {
    return res.apiError(404, "User not found", "USER_NOT_FOUND");
  }

  const { verifyPassword, hashPassword } = await import("../utils/password.js");
  const valid = await verifyPassword(String(currentPassword), user.passwordHash);
  if (!valid) {
    return res.apiError(401, "Invalid current password", "INVALID_CURRENT_PASSWORD");
  }

  const passwordHash = await hashPassword(String(newPassword));

  await prisma.$transaction([
    prisma.authUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedAttempts: 0,
        lockUntil: null
      }
    }),
    prisma.refreshToken.updateMany({
      where: {
        userId: user.id,
        tenantId: user.tenantId,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    })
  ]);

  return res.apiSuccess("Password changed successfully", null);
});

const getStudentExamResult = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.examCycleId || "").trim();
  if (!examCycleId) {
    return res.apiError(400, "examCycleId is required", "VALIDATION_ERROR");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: {
      id: examCycleId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      name: true,
      code: true,
      resultStatus: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (examCycle.resultStatus !== "PUBLISHED") {
    return res.apiError(403, "Results are not published", "RESULTS_NOT_PUBLISHED");
  }

  const submission = await prisma.worksheetSubmission.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      studentId: req.student.id,
      worksheet: {
        is: {
          examCycleId,
          generationMode: "EXAM"
        }
      }
    },
    orderBy: {
      finalSubmittedAt: "desc"
    },
    select: {
      score: true,
      correctCount: true,
      totalQuestions: true,
      completionTimeSeconds: true,
      finalSubmittedAt: true,
      worksheet: { select: { id: true, title: true, levelId: true } }
    }
  });

  return res.apiSuccess("Exam result", {
    examCycle: {
      id: examCycle.id,
      name: examCycle.name,
      code: examCycle.code,
      resultStatus: examCycle.resultStatus
    },
    submission: submission || null
  });
});

const listStudentExamEnrollments = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;

  const entries = await prisma.examEnrollmentEntry.findMany({
    where: {
      tenantId,
      studentId: req.student.id
    },
    select: {
      id: true,
      examCycleId: true,
      createdAt: true,
      examCycle: {
        select: {
          id: true,
          code: true,
          name: true,
          enrollmentStartAt: true,
          enrollmentEndAt: true,
          practiceStartAt: true,
          examStartsAt: true,
          examEndsAt: true,
          resultStatus: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const entryIds = entries.map((e) => e.id);
  const items = entryIds.length
    ? await prisma.examEnrollmentListItem.findMany({
        where: {
          tenantId,
          entryId: { in: entryIds },
          list: {
            is: {
              type: "CENTER_COMBINED"
            }
          }
        },
        select: {
          entryId: true,
          included: true,
          list: {
            select: {
              status: true,
              locked: true
            }
          }
        }
      })
    : [];

  const byEntryId = new Map();
  for (const it of items) {
    byEntryId.set(it.entryId, it);
  }

  const payload = entries
    .map((e) => {
      const it = byEntryId.get(e.id);
      const status = it
        ? it.included
          ? it.list?.status || "DRAFT"
          : "NOT_SELECTED"
        : "NOT_IN_COMBINED_LIST";

      return {
        entryId: e.id,
        examCycleId: e.examCycleId,
        examCycle: e.examCycle,
        status,
        included: it ? Boolean(it.included) : null,
        locked: it ? Boolean(it.list?.locked) : null,
        createdAt: e.createdAt
      };
    })
    .sort((a, b) => {
      const at = a.examCycle?.examStartsAt ? new Date(a.examCycle.examStartsAt).getTime() : 0;
      const bt = b.examCycle?.examStartsAt ? new Date(b.examCycle.examStartsAt).getTime() : 0;
      return bt - at;
    });

  return res.apiSuccess("Student exam enrollments", payload);
});

const listStudentExamsOverview = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = req.student.id;

  const entries = await prisma.examEnrollmentEntry.findMany({
    where: {
      tenantId,
      studentId
    },
    select: {
      id: true,
      examCycleId: true,
      createdAt: true,
      examCycle: {
        select: {
          id: true,
          code: true,
          name: true,
          enrollmentStartAt: true,
          enrollmentEndAt: true,
          practiceStartAt: true,
          examStartsAt: true,
          examEndsAt: true,
          resultStatus: true
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const entryIds = entries.map((e) => e.id);
  const examCycleIds = Array.from(new Set(entries.map((e) => e.examCycleId).filter(Boolean)));

  const items = entryIds.length
    ? await prisma.examEnrollmentListItem.findMany({
        where: {
          tenantId,
          entryId: { in: entryIds },
          list: {
            is: {
              type: "CENTER_COMBINED"
            }
          }
        },
        select: {
          entryId: true,
          included: true,
          list: { select: { status: true, locked: true } }
        }
      })
    : [];

  const byEntryId = new Map();
  for (const it of items) {
    byEntryId.set(it.entryId, it);
  }

  const assignments = examCycleIds.length
    ? await prisma.worksheetAssignment.findMany({
        where: {
          tenantId,
          studentId,
          isActive: true,
          worksheet: {
            is: {
              examCycleId: { in: examCycleIds },
              generationMode: "EXAM"
            }
          }
        },
        orderBy: { assignedAt: "desc" },
        select: {
          worksheet: {
            select: {
              id: true,
              title: true,
              generationMode: true,
              timeLimitSeconds: true,
              examCycleId: true
            }
          }
        }
      })
    : [];

  const assignedWorksheets = assignments.map((a) => a.worksheet).filter(Boolean);
  const worksheetIds = assignedWorksheets.map((w) => w.id);

  const submissions = worksheetIds.length
    ? await prisma.worksheetSubmission.findMany({
        where: {
          tenantId,
          studentId,
          worksheetId: { in: worksheetIds }
        },
        orderBy: { submittedAt: "desc" },
        select: {
          worksheetId: true,
          id: true,
          finalSubmittedAt: true
        }
      })
    : [];

  const latestByWorksheetId = new Map();
  for (const s of submissions) {
    if (!latestByWorksheetId.has(s.worksheetId)) {
      latestByWorksheetId.set(s.worksheetId, s);
    }
  }

  const worksheetsByExamCycleId = new Map();
  for (const w of assignedWorksheets) {
    const current = worksheetsByExamCycleId.get(w.examCycleId) || { EXAM: null };
    if (w.generationMode === "EXAM" && !current.EXAM) current.EXAM = w;
    worksheetsByExamCycleId.set(w.examCycleId, current);
  }

  const payload = entries
    .map((e) => {
      const it = byEntryId.get(e.id);
      const enrollmentStatus = it
        ? it.included
          ? it.list?.status || "DRAFT"
          : "NOT_SELECTED"
        : "NOT_IN_COMBINED_LIST";

      const ws = worksheetsByExamCycleId.get(e.examCycleId) || { PRACTICE: null, EXAM: null };

      const mapWorksheet = (worksheet) => {
        if (!worksheet) return null;
        const sub = latestByWorksheetId.get(worksheet.id) || null;
        const status = sub ? (sub.finalSubmittedAt ? "SUBMITTED" : "IN_PROGRESS") : "NOT_STARTED";
        return {
          worksheetId: worksheet.id,
          title: worksheet.title,
          generationMode: worksheet.generationMode,
          durationSeconds: worksheet.timeLimitSeconds || null,
          status
        };
      };

      return {
        entryId: e.id,
        examCycleId: e.examCycleId,
        examCycle: e.examCycle,
        enrollmentStatus,
        included: it ? Boolean(it.included) : null,
        locked: it ? Boolean(it.list?.locked) : null,
        examWorksheet: mapWorksheet(ws.EXAM),
        createdAt: e.createdAt
      };
    })
    .sort((a, b) => {
      const at = a.examCycle?.examStartsAt ? new Date(a.examCycle.examStartsAt).getTime() : 0;
      const bt = b.examCycle?.examStartsAt ? new Date(b.examCycle.examStartsAt).getTime() : 0;
      return bt - at;
    });

  return res.apiSuccess("Student exams overview", payload);
});

const listStudentMockTests = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = req.student.id;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId,
      studentId,
      status: "ACTIVE"
    },
    select: {
      batchId: true
    }
  });

  const batchIds = Array.from(new Set(enrollments.map((e) => e.batchId).filter(Boolean)));
  if (!batchIds.length) {
    return res.apiSuccess("Student mock tests", []);
  }

  const mockTests = await prisma.mockTest.findMany({
    where: {
      tenantId,
      batchId: { in: batchIds },
      status: { in: ["PUBLISHED", "ARCHIVED"] }
    },
    orderBy: [
      { date: "desc" },
      { createdAt: "desc" }
    ],
    select: {
      id: true,
      title: true,
      date: true,
      maxMarks: true,
      status: true,
      worksheetId: true,
      worksheet: {
        select: {
          id: true,
          title: true,
          timeLimitSeconds: true,
          isPublished: true
        }
      },
      batch: { select: { id: true, name: true } },
      results: {
        where: { studentId },
        select: {
          marks: true,
          recordedAt: true
        },
        take: 1,
        orderBy: { recordedAt: "desc" }
      }
    }
  });

  const payload = mockTests.map((test) => {
    const result = test.results?.[0] || null;
    const marks = result?.marks ?? null;
    const percentage = marks === null || test.maxMarks <= 0
      ? null
      : Number(((Number(marks) / Number(test.maxMarks)) * 100).toFixed(2));

    return {
      id: test.id,
      title: test.title,
      date: test.date,
      maxMarks: test.maxMarks,
      status: test.status,
      worksheetId: test.worksheetId || null,
      worksheet: test.worksheet || null,
      batch: test.batch,
      marks,
      percentage,
      recordedAt: result?.recordedAt || null
    };
  });

  return res.apiSuccess("Student mock tests", payload);
});

const getStudentMockTest = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = req.student.id;
  const mockTestId = String(req.params.mockTestId || "").trim();

  if (!mockTestId) {
    return res.apiError(400, "mockTestId is required", "VALIDATION_ERROR");
  }

  const mockTest = await prisma.mockTest.findFirst({
    where: {
      id: mockTestId,
      tenantId
    },
    select: {
      id: true,
      title: true,
      date: true,
      maxMarks: true,
      status: true,
      batchId: true,
      worksheetId: true,
      worksheet: {
        select: {
          id: true,
          title: true,
          timeLimitSeconds: true,
          isPublished: true
        }
      },
      batch: { select: { id: true, name: true } },
      results: {
        where: { studentId },
        select: {
          marks: true,
          recordedAt: true
        },
        take: 1,
        orderBy: { recordedAt: "desc" }
      }
    }
  });

  if (!mockTest || mockTest.status === "DRAFT") {
    return res.apiError(404, "Mock test not found", "MOCK_TEST_NOT_FOUND");
  }

  const allowedEnrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      studentId,
      batchId: mockTest.batchId,
      status: "ACTIVE"
    },
    select: { id: true }
  });

  if (!allowedEnrollment) {
    return res.apiError(403, "Student not enrolled in this batch", "STUDENT_BATCH_FORBIDDEN");
  }

  const result = mockTest.results?.[0] || null;
  const marks = result?.marks ?? null;
  const percentage = marks === null || mockTest.maxMarks <= 0
    ? null
    : Number(((Number(marks) / Number(mockTest.maxMarks)) * 100).toFixed(2));

  return res.apiSuccess("Student mock test", {
    id: mockTest.id,
    title: mockTest.title,
    date: mockTest.date,
    maxMarks: mockTest.maxMarks,
    status: mockTest.status,
    worksheetId: mockTest.worksheetId || null,
    worksheet: mockTest.worksheet || null,
    batch: mockTest.batch,
    marks,
    percentage,
    recordedAt: result?.recordedAt || null
  });
});

async function assertMockTestAccessibleForStudent({ tenantId, studentId, mockTestId }) {
  const mockTest = await prisma.mockTest.findFirst({
    where: {
      id: mockTestId,
      tenantId
    },
    select: {
      id: true,
      title: true,
      date: true,
      maxMarks: true,
      status: true,
      batchId: true,
      worksheetId: true,
      worksheet: {
        select: {
          id: true,
          title: true,
          timeLimitSeconds: true,
          isPublished: true,
          questions: {
            orderBy: { questionNumber: "asc" },
            select: {
              id: true,
              questionNumber: true,
              operands: true,
              operation: true,
              correctAnswer: true,
              questionBank: { select: { prompt: true } }
            }
          }
        }
      }
    }
  });

  if (!mockTest || mockTest.status === "DRAFT") {
    const error = new Error("Mock test not found");
    error.statusCode = 404;
    error.errorCode = "MOCK_TEST_NOT_FOUND";
    throw error;
  }

  const allowedEnrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      studentId,
      batchId: mockTest.batchId,
      status: "ACTIVE"
    },
    select: { id: true }
  });

  if (!allowedEnrollment) {
    const error = new Error("Student not enrolled in this batch");
    error.statusCode = 403;
    error.errorCode = "STUDENT_BATCH_FORBIDDEN";
    throw error;
  }

  if (!mockTest.worksheetId || !mockTest.worksheet || !mockTest.worksheet.isPublished) {
    const error = new Error("Online attempt not configured for this mock test");
    error.statusCode = 409;
    error.errorCode = "MOCK_TEST_ONLINE_NOT_CONFIGURED";
    throw error;
  }

  return mockTest;
}

const startStudentMockTestAttempt = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = req.student.id;
  const mockTestId = String(req.params.mockTestId || "").trim();

  if (!mockTestId) {
    return res.apiError(400, "mockTestId is required", "VALIDATION_ERROR");
  }

  let mockTest;
  try {
    mockTest = await assertMockTestAccessibleForStudent({ tenantId, studentId, mockTestId });
  } catch (error) {
    return res.apiError(error.statusCode || 500, error.message || "Failed to start mock test", error.errorCode || "INTERNAL_ERROR");
  }

  const now = new Date();
  let attempt = await prisma.mockTestAttempt.findUnique({
    where: {
      mockTestId_studentId: {
        mockTestId,
        studentId
      }
    }
  });

  if (!attempt) {
    attempt = await prisma.mockTestAttempt.create({
      data: {
        tenantId,
        mockTestId,
        studentId,
        status: "IN_PROGRESS",
        startedAt: now,
        answersByQuestionId: {}
      }
    });
  }

  const limitSeconds = Number.isFinite(Number(mockTest.worksheet.timeLimitSeconds)) && Number(mockTest.worksheet.timeLimitSeconds) > 0
    ? Number(mockTest.worksheet.timeLimitSeconds)
    : null;
  const startedAt = attempt.startedAt || now;
  const endsAt = limitSeconds ? new Date(new Date(startedAt).getTime() + limitSeconds * 1000) : null;

  let status = attempt.status;
  if (!attempt.finalSubmittedAt && endsAt && now.getTime() > endsAt.getTime()) {
    status = "TIMED_OUT";
  }

  return res.apiSuccess("Mock test attempt ready", {
    mockTestId,
    attemptId: attempt.id,
    status,
    startedAt,
    endsAt,
    serverNow: now,
    mockTest: {
      id: mockTest.id,
      title: mockTest.title,
      date: mockTest.date,
      maxMarks: mockTest.maxMarks,
      status: mockTest.status,
      worksheetId: mockTest.worksheet.id,
      worksheetTitle: mockTest.worksheet.title,
      timeLimitSeconds: limitSeconds,
      questions: (mockTest.worksheet.questions || []).map((q) => ({
        questionId: q.id,
        questionNumber: q.questionNumber,
        prompt: q.questionBank?.prompt || null,
        operands: q.operands,
        operation: q.operation
      }))
    },
    answersByQuestionId: attempt.answersByQuestionId && typeof attempt.answersByQuestionId === "object" ? attempt.answersByQuestionId : {},
    submittedResult: attempt.finalSubmittedAt
      ? {
          status: attempt.status,
          marks: attempt.marksAwarded,
          percentage: attempt.percentage,
          correctCount: attempt.correctCount,
          totalQuestions: attempt.totalQuestions,
          submittedAt: attempt.finalSubmittedAt
        }
      : null
  });
});

const submitStudentMockTestAttempt = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = req.student.id;
  const mockTestId = String(req.params.mockTestId || "").trim();

  if (!mockTestId) {
    return res.apiError(400, "mockTestId is required", "VALIDATION_ERROR");
  }

  const answersByQuestionId = req.body?.answersByQuestionId;
  if (!answersByQuestionId || typeof answersByQuestionId !== "object" || Array.isArray(answersByQuestionId)) {
    return res.apiError(400, "answersByQuestionId is required", "VALIDATION_ERROR");
  }

  let mockTest;
  try {
    mockTest = await assertMockTestAccessibleForStudent({ tenantId, studentId, mockTestId });
  } catch (error) {
    return res.apiError(error.statusCode || 500, error.message || "Failed to submit mock test", error.errorCode || "INTERNAL_ERROR");
  }

  if (mockTest.status === "ARCHIVED") {
    return res.apiError(409, "Archived mock test cannot be submitted", "MOCK_TEST_ARCHIVED");
  }

  const now = new Date();
  const existingAttempt = await prisma.mockTestAttempt.findUnique({
    where: {
      mockTestId_studentId: {
        mockTestId,
        studentId
      }
    }
  });

  if (existingAttempt?.finalSubmittedAt) {
    return res.apiSuccess("Mock test already submitted", {
      mockTestId,
      attemptId: existingAttempt.id,
      status: existingAttempt.status,
      marks: existingAttempt.marksAwarded,
      percentage: existingAttempt.percentage,
      submittedAt: existingAttempt.finalSubmittedAt,
      serverNow: now
    });
  }

  const startedAt = existingAttempt?.startedAt || now;
  const limitSeconds = Number.isFinite(Number(mockTest.worksheet.timeLimitSeconds)) && Number(mockTest.worksheet.timeLimitSeconds) > 0
    ? Number(mockTest.worksheet.timeLimitSeconds)
    : null;
  const completionTimeSeconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));
  const timedOut = Boolean(limitSeconds && completionTimeSeconds > limitSeconds);

  const questions = mockTest.worksheet.questions || [];
  if (!questions.length) {
    return res.apiError(409, "Mock test worksheet has no questions", "WORKSHEET_QUESTIONS_MISSING");
  }

  let correctCount = 0;
  for (const question of questions) {
    if (question.correctAnswer === null || question.correctAnswer === undefined) {
      continue;
    }
    const raw = answersByQuestionId?.[question.id]?.value;
    const answerNum = Number(raw);
    const keyNum = Number(question.correctAnswer);
    if (!Number.isFinite(answerNum)) {
      continue;
    }
    if (!Number.isFinite(keyNum)) {
      continue;
    }
    if (Math.trunc(answerNum) === Math.trunc(keyNum)) {
      correctCount += 1;
    }
  }

  const totalQuestions = questions.length;
  const percentage = Number(((correctCount / totalQuestions) * 100).toFixed(2));
  const awardedMarks = Math.max(0, Math.min(mockTest.maxMarks, Math.round((percentage / 100) * Number(mockTest.maxMarks))));

  const attempt = await prisma.$transaction(async (tx) => {
    await tx.mockTestResult.upsert({
      where: {
        mockTestId_studentId: {
          mockTestId,
          studentId
        }
      },
      update: {
        marks: awardedMarks,
        recordedByUserId: req.auth.userId,
        recordedAt: now
      },
      create: {
        tenantId,
        mockTestId,
        studentId,
        marks: awardedMarks,
        recordedByUserId: req.auth.userId
      }
    });

    if (existingAttempt) {
      return tx.mockTestAttempt.update({
        where: { id: existingAttempt.id },
        data: {
          status: timedOut ? "TIMED_OUT" : "SUBMITTED",
          finalSubmittedAt: now,
          completionTimeSeconds,
          answersByQuestionId,
          correctCount,
          totalQuestions,
          percentage,
          marksAwarded: awardedMarks
        }
      });
    }

    return tx.mockTestAttempt.create({
      data: {
        tenantId,
        mockTestId,
        studentId,
        status: timedOut ? "TIMED_OUT" : "SUBMITTED",
        startedAt,
        finalSubmittedAt: now,
        completionTimeSeconds,
        answersByQuestionId,
        correctCount,
        totalQuestions,
        percentage,
        marksAwarded: awardedMarks
      }
    });
  });

  return res.apiSuccess("Mock test submitted", {
    mockTestId,
    attemptId: attempt.id,
    status: attempt.status,
    correctCount,
    totalQuestions,
    percentage,
    marks: awardedMarks,
    maxMarks: mockTest.maxMarks,
    submittedAt: now,
    serverNow: now
  });
});

const listStudentCertificates = asyncHandler(async (req, res) => {
  const where = {
    tenantId: req.auth.tenantId,
    studentId: req.student.id
  };
  const baseSelect = {
    id: true,
    certificateNumber: true,
    status: true,
    issuedAt: true,
    revokedAt: true,
    reason: true,
    level: { select: { id: true, name: true, rank: true } }
  };

  let certs;
  try {
    certs = await prisma.certificate.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      select: {
        ...baseSelect,
        verificationToken: true
      }
    });
  } catch (error) {
    if (!isSchemaMismatchError(error, ["Certificate.verificationToken", "verificationToken"])) {
      throw error;
    }

    certs = await prisma.certificate.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      select: baseSelect
    });
  }

  const data = certs.map((c) => ({
    id: c.id,
    certificateNumber: c.certificateNumber,
    status: c.status,
    levelName: c.level?.name || "—",
    levelRank: c.level?.rank ?? null,
    issuedAt: c.issuedAt,
    revokedAt: c.revokedAt,
    reason: c.reason,
    verificationToken: c.verificationToken || null
  }));

  return res.apiSuccess("Student certificates fetched", data);
});

/**
 * GET /student/performance-trends
 * Returns per-level performance stats and improvement trends.
 */
const getStudentPerformanceTrends = asyncHandler(async (req, res) => {
  const { id: studentId, tenantId, levelId } = req.student;

  const [levelPerformance, improvementTrend] = await Promise.all([
    levelId ? getLevelPerformance(studentId, levelId, tenantId) : null,
    getImprovementTrend(studentId, tenantId)
  ]);

  return res.apiSuccess("Performance trends", {
    currentLevel: levelPerformance,
    trends: improvementTrend
  });
});

/* ─── Student: Request Worksheet Reassignment ─── */
const createStudentReassignmentRequest = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const studentId = req.student.id;
  const { currentWorksheetId, type, newWorksheetId, reason } = req.body || {};

  if (!currentWorksheetId) return res.apiError(400, "currentWorksheetId is required", "VALIDATION_ERROR");
  if (!reason || !String(reason).trim()) return res.apiError(400, "Reason is required", "VALIDATION_ERROR");

  // Student reassignment requests are only valid for worksheets the student has already submitted.
  // Do not require an active assignment here because completed worksheets may have been unassigned
  // or surfaced via published history, while the reassignment service already enforces submission ownership.

  const result = await svcCreateReassignment({
    tenantId, studentId, currentWorksheetId,
    type: type || "RETRY", newWorksheetId,
    reason: String(reason).trim(),
    requestedByUserId: req.auth.userId,
  });

  if (result.error) return res.apiError(400, result.error, result.code);
  return res.apiSuccess("Reassignment request created", result.data, 201);
});

/* ─── Student: List My Reassignment Requests ─── */
const listStudentReassignmentRequests = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const { take, skip } = parsePagination(req.query);
  const VALID_REASSIGNMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
  const rawStatus = req.query.status ? String(req.query.status).trim().toUpperCase() : undefined;
  const status = rawStatus && VALID_REASSIGNMENT_STATUSES.includes(rawStatus) ? rawStatus : undefined;

  const result = await svcListReassignments({
    tenantId, studentId: req.student.id, status, skip, take,
  });
  return res.apiSuccess("Reassignment requests", result);
});

/* ─── Student: Cancel My Reassignment Request ─── */
const cancelStudentReassignmentRequest = asyncHandler(async (req, res) => {
  const tenantId = req.auth.tenantId;
  const requestId = String(req.params.requestId || "").trim();
  if (!requestId) return res.apiError(400, "requestId is required", "VALIDATION_ERROR");

  const result = await svcCancelReassignment({
    tenantId, requestId, userId: req.auth.userId,
  });

  if (result.error) return res.apiError(400, result.error, result.code);
  return res.apiSuccess("Request cancelled", result.data);
});

export {
  getStudentMe,
  listStudentEnrollments,
  listStudentExamEnrollments,
  listStudentExamsOverview,
  listStudentMockTests,
  getStudentMockTest,
  startStudentMockTestAttempt,
  submitStudentMockTestAttempt,
  listStudentWorksheets,
  getStudentWorksheet,
  startOrResumeStudentWorksheetAttempt,
  saveStudentAttemptAnswers,
  submitStudentAttempt,
  startStudentWorksheet,
  listStudentWorksheetAttempts,
  submitStudentWorksheet,
  listStudentMaterials,
  getStudentPracticeReport,
  getStudentPracticeFeatureStatus,
  getStudentPracticeWorksheetOptions,
  createStudentPracticeWorksheet,
  getStudentAbacusPracticeWorksheetOptions,
  createStudentAbacusPracticeWorksheet,
  changeStudentPassword,
  listStudentRecentAttendance,
  getStudentWeakTopics,
  getStudentFeesSummary,
  getStudentMyCourse,
  getStudentExamResult,
  listStudentCertificates,
  updateStudentProfile,
  getStudentPerformanceTrends,
  createStudentReassignmentRequest,
  listStudentReassignmentRequests,
  cancelStudentReassignmentRequest,
};
