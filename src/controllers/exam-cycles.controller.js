import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { createBulkNotification } from "../services/notification.service.js";
import { resolveBusinessPartnerHierarchyNodeIds } from "../services/business-partner-cascade.service.js";
import { generateExamCode } from "../services/exam-code.service.js";
import { resolveActorExamScope } from "../services/exam-scope.service.js";
import { forwardEnrollmentList, rejectEnrollmentList, approveEnrollmentList } from "../services/exam-workflow.service.js";
import { recordAudit } from "../utils/audit.js";
import { assignSelectedExamWorksheets } from "../services/exam-worksheets.service.js";
import {
  generateQuestionSet,
  getConfig,
  getExamCycleLevels,
  getLevelQuestionBanks,
  getLevelWorksheets,
  saveConfig,
  validateConfig
} from "../services/assessmentConfig.service.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { generateUsername } from "../utils/username-generator.js";
import { getEnrollmentCounts } from "./exam-late-enrollment.controller.js";
import { deriveWorksheetQuestionExpectedAnswer } from "../services/worksheet-submission.service.js";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[\n\r",]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv({ headers, rows }) {
  const headerLine = headers.map((h) => csvEscape(h.label)).join(",");
  const lines = [headerLine];

  for (const row of rows) {
    const line = headers.map((h) => csvEscape(row[h.key])).join(",");
    lines.push(line);
  }

  return `${lines.join("\n")}\n`;
}

function roundPercentage(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
}

function normalizeExamCompletionTime(completionTimeSeconds, timeLimitSeconds) {
  if (
    completionTimeSeconds === null ||
    completionTimeSeconds === undefined ||
    completionTimeSeconds === ""
  ) {
    return null;
  }

  const completionTime = Number(completionTimeSeconds);

  if (!Number.isFinite(completionTime) || completionTime < 0) {
    return null;
  }

  const normalizedCompletionTime = Math.floor(completionTime);

  if (
    timeLimitSeconds === null ||
    timeLimitSeconds === undefined ||
    timeLimitSeconds === ""
  ) {
    return normalizedCompletionTime;
  }

  const timeLimit = Number(timeLimitSeconds);

  if (!Number.isFinite(timeLimit) || timeLimit <= 0) {
    return normalizedCompletionTime;
  }

  return Math.min(
    normalizedCompletionTime,
    Math.floor(timeLimit)
  );
}

function deriveCandidateStatus(submission, { now = new Date() } = {}) {
  if (!submission) return "ABSENT";
  const remark = String(submission.remarks || "").trim().toLowerCase();
  const completionTimeSeconds = toNullableNumber(submission.completionTimeSeconds);
  const timeLimitSeconds = toNullableNumber(submission?.worksheet?.timeLimitSeconds);
  const startedAtMs = submission.submittedAt ? new Date(submission.submittedAt).getTime() : NaN;
  const nowMs = now.getTime();
  const hasExpiredByWallClock =
    Number.isFinite(startedAtMs) &&
    timeLimitSeconds !== null &&
    timeLimitSeconds > 0 &&
    nowMs >= startedAtMs + timeLimitSeconds * 1000;
  const hasReachedTimeLimit =
    completionTimeSeconds !== null &&
    timeLimitSeconds !== null &&
    timeLimitSeconds > 0 &&
    completionTimeSeconds >= timeLimitSeconds;

  if (submission.finalSubmittedAt) {
    return remark === "timed out" || hasReachedTimeLimit ? "TIMED_OUT" : "SUBMITTED";
  }

  if (remark === "timed out" || hasReachedTimeLimit || hasExpiredByWallClock) {
    return "TIMED_OUT";
  }

  return "IN_PROGRESS";
}

const EXAM_RESULT_RULES = Object.freeze({
  scoreBasis: "Score, accuracy, answer count, and completion time",
  rankingOrder: [
    "Higher score",
    "Higher accuracy",
    "More correct answers",
    "Fewer wrong answers",
    "Shorter completion time",
    "Earlier submission time"
  ],
  passFailDisplayed: false,
  lateEnrollmentIncluded: true
});

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toValidDateMs(value) {
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function resolveAnswerPayloadValue(raw) {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw !== "object" || Array.isArray(raw)) return raw;

  if (Object.prototype.hasOwnProperty.call(raw, "answer")) return raw.answer;
  if (Object.prototype.hasOwnProperty.call(raw, "value")) return raw.value;
  if (Object.prototype.hasOwnProperty.call(raw, "enteredAnswer")) return raw.enteredAnswer;

  return null;
}

function normalizeAnswerForComparison(raw) {
  const value = resolveAnswerPayloadValue(raw);

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const commaStripped = text.replaceAll(",", "");
  if (/^[+-]?\d+(?:\.\d+)?$/.test(commaStripped)) {
    const numeric = Number(commaStripped);
    return Number.isFinite(numeric) ? String(numeric) : text;
  }

  return text;
}

function resolveQuestionNumberFromAnswerEntry(entry, { questionIdToNumber, questionNumberToCorrect }) {
  const byQuestionId = entry?.questionId ?? entry?.worksheetQuestionId;
  if (byQuestionId !== null && byQuestionId !== undefined && byQuestionId !== "") {
    const mapped = questionIdToNumber.get(String(byQuestionId));
    if (Number.isFinite(mapped) && questionNumberToCorrect.has(mapped)) {
      return mapped;
    }
  }

  const questionNumber = Number(entry?.questionNumber);
  if (Number.isFinite(questionNumber) && questionNumberToCorrect.has(questionNumber)) {
    return questionNumber;
  }

  return null;
}

function extractLastMeaningfulAnswerSaveMs(submission) {
  const payload = submission?.submittedAnswers;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NaN;
  }

  const byQuestionId = payload.answersByQuestionId;
  let hasMeaningfulAnswer = false;
  let latestMs = NaN;

  if (byQuestionId && typeof byQuestionId === "object" && !Array.isArray(byQuestionId)) {
    for (const valueObj of Object.values(byQuestionId)) {
      const normalized = normalizeAnswerForComparison(valueObj);
      if (normalized === null) {
        continue;
      }

      hasMeaningfulAnswer = true;
      for (const field of ["savedAt", "updatedAt", "lastSavedAt", "answeredAt"]) {
        const fieldMs = toValidDateMs(valueObj?.[field]);
        if (Number.isFinite(fieldMs)) {
          latestMs = Number.isFinite(latestMs) ? Math.max(latestMs, fieldMs) : fieldMs;
        }
      }
    }
  }

  if (hasMeaningfulAnswer) {
    for (const field of ["savedAt", "updatedAt", "lastSavedAt"]) {
      const fieldMs = toValidDateMs(payload[field]);
      if (Number.isFinite(fieldMs)) {
        latestMs = Number.isFinite(latestMs) ? Math.max(latestMs, fieldMs) : fieldMs;
      }
    }
  }

  return latestMs;
}

function resolveCompletionTimeSecondsFromSubmission({ submission, candidateStatus, answeredCount }) {
  if (!submission) {
    return null;
  }

  const timeLimitSeconds = toNullableNumber(submission?.worksheet?.timeLimitSeconds);
  const stored = normalizeExamCompletionTime(submission.completionTimeSeconds, timeLimitSeconds);
  const startMs = toValidDateMs(submission.createdAt || submission.submittedAt);
  const finalSubmittedMs = toValidDateMs(submission.finalSubmittedAt);

  if (Number.isFinite(finalSubmittedMs)) {
    if (stored !== null && stored > 0) {
      return stored;
    }
    if (!Number.isFinite(startMs)) {
      return stored;
    }
    const elapsed = Math.max(0, Math.floor((finalSubmittedMs - startMs) / 1000));
    const derived = normalizeExamCompletionTime(elapsed, timeLimitSeconds);
    return derived ?? stored;
  }

  if (candidateStatus === "TIMED_OUT") {
    if (!Number.isFinite(Number(answeredCount)) || Number(answeredCount) <= 0) {
      return 0;
    }

    if (stored !== null && stored > 0) {
      return stored;
    }

    if (Number.isFinite(startMs)) {
      const lastMeaningfulSaveMs = extractLastMeaningfulAnswerSaveMs(submission);
      const fallbackUpdatedMs = toValidDateMs(submission.updatedAt || submission.submittedAt);
      const endMs = Number.isFinite(lastMeaningfulSaveMs) ? lastMeaningfulSaveMs : fallbackUpdatedMs;

      if (Number.isFinite(endMs)) {
        const elapsed = Math.max(0, Math.floor((endMs - startMs) / 1000));
        return normalizeExamCompletionTime(elapsed, timeLimitSeconds);
      }
    }

    if (stored !== null) {
      return stored;
    }

    if (timeLimitSeconds !== null && timeLimitSeconds > 0) {
      return Math.floor(timeLimitSeconds);
    }

    return null;
  }

  if (stored !== null) {
    return stored;
  }

  if (!Number.isFinite(startMs)) {
    return null;
  }

  return stored;
}

function computeAverageCompletionTimeSeconds(rows = []) {
  const scoredRows = rows.filter((row) => row?.percentage !== null && row?.percentage !== undefined);
  const totalCompletionTime = scoredRows.reduce((sum, row) => sum + Number(row?.completionTimeSeconds || 0), 0);
  return scoredRows.length ? Number((totalCompletionTime / scoredRows.length).toFixed(2)) : 0;
}

function deriveResultOutcome({ candidateStatus, percentage }) {
  if (candidateStatus === "ABSENT") return "ABSENT";
  if (candidateStatus === "IN_PROGRESS") return "IN_PROGRESS";
  if (percentage === null || percentage === undefined) return "PENDING";
  return "SCORED";
}

function deriveSavedAnswerMetrics(submission) {
  const questions = Array.isArray(submission?.worksheet?.questions) ? submission.worksheet.questions : [];
  if (!questions.length) {
    return null;
  }

  const totalQuestions = questions.length;
  const questionNumberToCorrect = new Map();
  const questionIdToNumber = new Map();
  for (const question of questions) {
    const questionNumber = Number(question?.questionNumber);
    if (!Number.isFinite(questionNumber)) {
      continue;
    }
    questionNumberToCorrect.set(questionNumber, normalizeAnswerForComparison(deriveWorksheetQuestionExpectedAnswer(question)));
    if (question?.id) {
      questionIdToNumber.set(String(question.id), questionNumber);
    }
    if (question?.questionBankId) {
      questionIdToNumber.set(String(question.questionBankId), questionNumber);
    }
  }

  const answersByQuestionNumber = new Map();
  const saved = submission?.submittedAnswers;

  if (Array.isArray(saved)) {
    for (const item of saved) {
      const questionNumber = resolveQuestionNumberFromAnswerEntry(item, {
        questionIdToNumber,
        questionNumberToCorrect
      });
      const answer = normalizeAnswerForComparison(item?.answer ?? item?.value ?? item?.enteredAnswer);
      if (!Number.isFinite(questionNumber) || answer === null) {
        continue;
      }
      answersByQuestionNumber.set(questionNumber, answer);
    }
  } else if (saved && typeof saved === "object") {
    const byId = saved.answersByQuestionId;
    if (byId && typeof byId === "object" && !Array.isArray(byId)) {
      for (const [questionKey, valueObj] of Object.entries(byId)) {
        const fromId = questionIdToNumber.get(String(questionKey));
        const fromNumber = Number(questionKey);
        const questionNumber = Number.isFinite(fromId)
          ? fromId
          : Number.isFinite(fromNumber) && questionNumberToCorrect.has(fromNumber)
            ? fromNumber
            : null;
        const answer = normalizeAnswerForComparison(valueObj);
        if (!Number.isFinite(questionNumber) || answer === null) {
          continue;
        }
        answersByQuestionNumber.set(questionNumber, answer);
      }
    }

    const byNumber = saved.answersByQuestionNumber;
    if (byNumber && typeof byNumber === "object" && !Array.isArray(byNumber)) {
      for (const [questionNumberKey, valueObj] of Object.entries(byNumber)) {
        const questionNumber = Number(questionNumberKey);
        const answer = normalizeAnswerForComparison(valueObj);
        if (!Number.isFinite(questionNumber) || !questionNumberToCorrect.has(questionNumber) || answer === null) {
          continue;
        }
        answersByQuestionNumber.set(questionNumber, answer);
      }
    }
  }

  let correctCount = 0;
  for (const [questionNumber, answer] of answersByQuestionNumber.entries()) {
    const key = questionNumberToCorrect.get(questionNumber);
    if (key === null || key === undefined) {
      continue;
    }
    if (answer === key) {
      correctCount += 1;
    }
  }

  const answeredCount = answersByQuestionNumber.size;
  const wrongCount = Math.max(0, answeredCount - correctCount);
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);
  const percentage = totalQuestions > 0 ? roundPercentage((correctCount / totalQuestions) * 100) : 0;

  return {
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    percentage,
    answeredCount
  };
}

function hasSubmittedAnswersPayload(submission) {
  if (!submission) return false;
  const saved = submission.submittedAnswers;
  if (Array.isArray(saved)) return true;
  return Boolean(saved && typeof saved === "object");
}

function countSubmittedAnswersFromPayload(submission) {
  const saved = submission?.submittedAnswers;
  if (Array.isArray(saved)) {
    return saved.length;
  }
  if (saved?.answersByQuestionId && typeof saved.answersByQuestionId === "object") {
    return Object.keys(saved.answersByQuestionId).length;
  }
  return null;
}

function resolveExamResultMetricsForSubmission({ submission, candidateStatus }) {
  const correctCount = toNullableNumber(submission?.correctCount);
  const totalQuestions = toNullableNumber(submission?.totalQuestions);
  const submittedAnswerCount = countSubmittedAnswersFromPayload(submission);
  const unansweredCount =
    totalQuestions !== null && submittedAnswerCount !== null
      ? Math.max(0, totalQuestions - submittedAnswerCount)
      : null;
  const wrongCount =
    totalQuestions !== null && correctCount !== null
      ? Math.max(0, totalQuestions - correctCount - (unansweredCount || 0))
      : null;
  const calculatedPercentage =
    totalQuestions && totalQuestions > 0 && correctCount !== null && correctCount !== undefined
      ? roundPercentage((Number(correctCount) / Number(totalQuestions)) * 100)
      : null;
  const percentage = calculatedPercentage;
  const score = toNullableNumber(submission?.score ?? percentage);

  const submissionStatus = String(submission?.status || "").trim().toUpperCase();
  const isFinalizedCandidate = ["SUBMITTED", "TIMED_OUT"].includes(String(candidateStatus || "").toUpperCase())
    || ["SUBMITTED", "TIMED_OUT", "REVIEWED"].includes(submissionStatus);

  const derivedMetrics =
    submission && hasSubmittedAnswersPayload(submission) && isFinalizedCandidate
      ? deriveSavedAnswerMetrics(submission)
      : null;

  const preferDerivedMetrics = Boolean(
    derivedMetrics &&
      toNullableNumber(derivedMetrics.totalQuestions) !== null &&
      Number(derivedMetrics.totalQuestions) > 0
  );

  const resolvedCorrectCount = preferDerivedMetrics
    ? derivedMetrics.correctCount
    : correctCount ?? derivedMetrics?.correctCount ?? null;
  const resolvedTotalQuestions = preferDerivedMetrics
    ? derivedMetrics.totalQuestions
    : totalQuestions ?? derivedMetrics?.totalQuestions ?? null;
  const resolvedWrongCount = preferDerivedMetrics
    ? derivedMetrics.wrongCount
    : wrongCount ?? derivedMetrics?.wrongCount ?? null;
  const resolvedUnansweredCount = preferDerivedMetrics
    ? derivedMetrics.unansweredCount
    : unansweredCount ?? derivedMetrics?.unansweredCount ?? null;
  const resolvedPercentage = preferDerivedMetrics
    ? derivedMetrics.percentage
    : percentage ?? derivedMetrics?.percentage ?? null;
  const resolvedScore = preferDerivedMetrics
    ? toNullableNumber(derivedMetrics.percentage)
    : score ?? resolvedPercentage;
  const resolvedAnsweredCount =
    resolvedTotalQuestions !== null && resolvedUnansweredCount !== null
      ? Math.max(0, Number(resolvedTotalQuestions) - Number(resolvedUnansweredCount))
      : derivedMetrics?.answeredCount ?? submittedAnswerCount ?? 0;

  return {
    submittedAnswerCount,
    resolvedCorrectCount,
    resolvedTotalQuestions,
    resolvedWrongCount,
    resolvedUnansweredCount,
    resolvedPercentage,
    resolvedScore,
    resolvedAnsweredCount,
    preferDerivedMetrics
  };
}

function compareExamRankRows(left, right) {
  const leftScore = toNullableNumber(left.score) ?? -Infinity;
  const rightScore = toNullableNumber(right.score) ?? -Infinity;
  if (leftScore !== rightScore) return rightScore - leftScore;

  const leftPercentage = toNullableNumber(left.percentage) ?? -Infinity;
  const rightPercentage = toNullableNumber(right.percentage) ?? -Infinity;
  if (leftPercentage !== rightPercentage) return rightPercentage - leftPercentage;

  const leftCorrect = toNullableNumber(left.correctCount) ?? -Infinity;
  const rightCorrect = toNullableNumber(right.correctCount) ?? -Infinity;
  if (leftCorrect !== rightCorrect) return rightCorrect - leftCorrect;

  const leftWrong = toNullableNumber(left.wrongCount) ?? Infinity;
  const rightWrong = toNullableNumber(right.wrongCount) ?? Infinity;
  if (leftWrong !== rightWrong) return leftWrong - rightWrong;

  const leftDuration = toNullableNumber(left.completionTimeSeconds) ?? Infinity;
  const rightDuration = toNullableNumber(right.completionTimeSeconds) ?? Infinity;
  if (leftDuration !== rightDuration) return leftDuration - rightDuration;

  const leftSubmitted = left.submittedAt ? new Date(left.submittedAt).getTime() : Infinity;
  const rightSubmitted = right.submittedAt ? new Date(right.submittedAt).getTime() : Infinity;
  if (leftSubmitted !== rightSubmitted) return leftSubmitted - rightSubmitted;

  return String(left.studentId || "").localeCompare(String(right.studentId || ""));
}

function examRankTieKey(row) {
  return [
    toNullableNumber(row.score) ?? null,
    toNullableNumber(row.percentage) ?? null,
    toNullableNumber(row.correctCount) ?? null,
    toNullableNumber(row.wrongCount) ?? null,
    toNullableNumber(row.completionTimeSeconds) ?? null,
    row.submittedAt ? new Date(row.submittedAt).toISOString() : null
  ].join("|");
}

function assignExamResultRanks(rows = []) {
  const scoredRows = rows.filter((row) => row.resultOutcome === "SCORED");
  const rankByKey = new Map();
  const scoredRowsByLevel = new Map();

  scoredRows.forEach((row) => {
    const levelKey = row.enrolledLevelId || "__UNASSIGNED__";
    if (!scoredRowsByLevel.has(levelKey)) {
      scoredRowsByLevel.set(levelKey, []);
    }
    scoredRowsByLevel.get(levelKey).push(row);
  });

  scoredRowsByLevel.forEach((levelRows) => {
    const rankedRows = levelRows.sort(compareExamRankRows);
    let currentRank = 0;
    let previousTieKey = null;

    rankedRows.forEach((row, index) => {
      const tieKey = examRankTieKey(row);
      if (tieKey !== previousTieKey) {
        currentRank = index + 1;
        previousTieKey = tieKey;
      }
      rankByKey.set(`${row.studentId}:${row.enrolledLevelId || ""}`, currentRank);
    });
  });

  return rows.map((row) => ({
    ...row,
    rank: rankByKey.get(`${row.studentId}:${row.enrolledLevelId || ""}`) ?? null
  }));
}

function normalizeResultQuery(query = {}) {
  const sortByAllowList = new Set([
    "studentName",
    "admissionNo",
    "levelName",
    "teacherName",
    "centerName",
    "rank",
    "percentage",
    "score",
    "completionTimeSeconds",
    "submittedAt"
  ]);
  const sortBy = sortByAllowList.has(String(query.sortBy || "")) ? String(query.sortBy) : "admissionNo";
  const sortOrder = String(query.sortOrder || "asc").toLowerCase() === "desc" ? "desc" : "asc";

  return {
    q: String(query.q || "").trim().toLowerCase(),
    levelId: String(query.levelId || "").trim(),
    teacherUserId: String(query.teacherUserId || "").trim(),
    centerNodeId: String(query.centerNodeId || "").trim(),
    candidateStatus: String(query.candidateStatus || "").trim().toUpperCase(),
    resultOutcome: String(query.resultOutcome || "").trim().toUpperCase(),
    candidateType: String(query.candidateType || "").trim().toUpperCase(),
    sortBy,
    sortOrder
  };
}

function applyExamResultFiltersAndSort(rows = [], query = {}) {
  const filters = normalizeResultQuery(query);
  const filtered = rows.filter((row) => {
    if (filters.q) {
      const haystack = [
        row.admissionNo,
        row.studentName,
        row.teacherCode,
        row.teacherName,
        row.centerCode,
        row.centerName,
        row.levelName,
        row.rank
      ].map((value) => String(value || "").toLowerCase());
      if (!haystack.some((value) => value.includes(filters.q))) return false;
    }
    if (filters.levelId && row.enrolledLevelId !== filters.levelId) return false;
    if (filters.teacherUserId && row.teacherUserId !== filters.teacherUserId) return false;
    if (filters.centerNodeId && row.centerNodeId !== filters.centerNodeId) return false;
    if (filters.candidateStatus && row.candidateStatus !== filters.candidateStatus) return false;
    if (filters.resultOutcome && row.resultOutcome !== filters.resultOutcome) return false;
    if (filters.candidateType === "TEMPORARY" && !row.isTemporaryCandidate) return false;
    if (filters.candidateType === "REGULAR" && row.isTemporaryCandidate) return false;
    return true;
  });

  const direction = filters.sortOrder === "desc" ? -1 : 1;
  const valueForSort = (row) => {
    if (filters.sortBy === "rank" || filters.sortBy === "score" || filters.sortBy === "percentage" || filters.sortBy === "completionTimeSeconds") {
      const numeric = Number(row[filters.sortBy]);
      return Number.isFinite(numeric) ? numeric : null;
    }
    if (filters.sortBy === "submittedAt") {
      const time = row.submittedAt ? new Date(row.submittedAt).getTime() : null;
      return Number.isFinite(time) ? time : null;
    }
    return String(row[filters.sortBy] || "").toLowerCase();
  };

  return filtered.sort((a, b) => {
    const aValue = valueForSort(a);
    const bValue = valueForSort(b);
    if (aValue === null && bValue !== null) return 1;
    if (aValue !== null && bValue === null) return -1;
    if (aValue < bValue) return -1 * direction;
    if (aValue > bValue) return 1 * direction;
    return String(a.admissionNo || a.studentName || "").localeCompare(String(b.admissionNo || b.studentName || ""));
  });
}

function getScopedHierarchyNodeIds({ actor, scope }) {
  const nodeIds = Array.isArray(scope?.hierarchyNodeIds) ? scope.hierarchyNodeIds.filter(Boolean) : [];
  if (nodeIds.length) return nodeIds;
  return actor?.hierarchyNodeId ? [actor.hierarchyNodeId] : [];
}

function buildScopedLateEnrollmentWhere({ tenantId, examCycleId, actor, scope }) {
  const where = {
    tenantId,
    status: "APPROVED",
    request: {
      is: {
        examCycleId
      }
    }
  };

  if (actor.role === "SUPERADMIN") {
    return where;
  }

  if (actor.role === "TEACHER") {
    const centerNodeId = actor.hierarchyNodeId || "__NO_CENTER_SCOPE__";
    return {
      ...where,
      request: {
        is: {
          examCycleId,
          centerId: centerNodeId
        }
      },
      OR: [
        { student: { currentTeacherUserId: actor.userId } },
        {
          student: {
            batchEnrollments: {
              some: {
                tenantId,
                status: "ACTIVE",
                assignedTeacherUserId: actor.userId
              }
            }
          }
        }
      ]
    };
  }

  const nodeIds = getScopedHierarchyNodeIds({ actor, scope });
  return {
    ...where,
    request: {
      is: {
        examCycleId,
        centerId: nodeIds.length ? { in: nodeIds } : "__NO_HIERARCHY_SCOPE__"
      }
    }
  };
}

function parseDateTime(value, field) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const error = new Error(`${field} is invalid`);
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }
  return d;
}

function assertDateOrder(a, b, message) {
  if (a.getTime() > b.getTime()) {
    const error = new Error(message);
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function parseCourseStatus(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();
  if (normalized === "ACTIVE") {
    return "ACTIVE";
  }

  if (normalized === "ARCHIVED" || normalized === "INACTIVE") {
    return "ARCHIVED";
  }

  return null;
}

function isUniqueConstraintError(error) {
  return String(error?.code || "") === "P2002";
}

const listExamCourses = asyncHandler(async (req, res) => {
  const items = await prisma.course.findMany({
    where: {
      tenantId: req.auth.tenantId,
      scope: "EXAM"
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" }
    ],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          levels: true
        }
      },
      levels: {
        orderBy: [
          { levelNumber: "asc" }
        ],
        select: {
          id: true,
          levelNumber: true,
          title: true,
          sortOrder: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });

  return res.apiSuccess("Exam courses fetched", {
    total: items.length,
    items
  });
});

const createExamCourse = asyncHandler(async (req, res) => {
  const code = normalizeString(req.body?.code);
  const name = normalizeString(req.body?.name);
  const description = normalizeString(req.body?.description);
  const status = parseCourseStatus(req.body?.status);

  if (!code || !name) {
    return res.apiError(400, "code and name are required", "VALIDATION_ERROR");
  }

  let created;
  try {
    created = await prisma.course.create({
      data: {
        tenantId: req.auth.tenantId,
        code,
        name,
        description,
        scope: "EXAM",
        isActive: status === "ARCHIVED" ? false : true
      },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.apiError(409, "Exam course code or name already exists", "COURSE_EXISTS");
    }

    throw error;
  }

  res.locals.entityId = created.id;
  return res.apiSuccess("Exam course created", created, 201);
});

const createExamCourseLevel = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const examCourse = await prisma.course.findFirst({
    where: {
      id: courseId,
      tenantId: req.auth.tenantId,
      scope: "EXAM"
    },
    select: {
      id: true
    }
  });

  if (!examCourse) {
    return res.apiError(404, "Exam course not found", "COURSE_NOT_FOUND");
  }

  const levelNumber = Number(req.body?.levelNumber);
  const sortOrder = Number(req.body?.sortOrder);
  const title = normalizeString(req.body?.title);
  const status = parseCourseStatus(req.body?.status);

  if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 15) {
    return res.apiError(400, "levelNumber must be an integer between 1 and 15", "VALIDATION_ERROR");
  }

  if (!Number.isInteger(sortOrder)) {
    return res.apiError(400, "sortOrder must be an integer", "VALIDATION_ERROR");
  }

  if (!title) {
    return res.apiError(400, "title is required", "VALIDATION_ERROR");
  }

  const existingLevels = await prisma.courseLevel.findMany({
    where: {
      tenantId: req.auth.tenantId,
      courseId: examCourse.id
    },
    select: {
      levelNumber: true
    }
  });

  const existingNumbers = new Set(existingLevels.map((level) => level.levelNumber));
  if (existingNumbers.has(levelNumber)) {
    return res.apiError(409, "Level number already exists for this exam course", "COURSE_LEVEL_EXISTS");
  }

  for (let n = 1; n < levelNumber; n += 1) {
    if (!existingNumbers.has(n)) {
      return res.apiError(400, "Levels must be created sequentially without gaps", "COURSE_LEVEL_SEQUENCE_REQUIRED");
    }
  }

  let created;
  try {
    created = await prisma.courseLevel.create({
      data: {
        tenantId: req.auth.tenantId,
        courseId: examCourse.id,
        levelNumber,
        title,
        sortOrder,
        isActive: status === "ARCHIVED" ? false : true
      },
      select: {
        id: true,
        courseId: true,
        levelNumber: true,
        title: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.apiError(409, "Level number already exists for this exam course", "COURSE_LEVEL_EXISTS");
    }

    throw error;
  }

  res.locals.entityId = created.id;
  return res.apiSuccess("Exam course level created", created, 201);
});

function buildLifecycleFilterWhere(filter) {
  const now = new Date();
  const normalized = String(filter || "DEFAULT").trim().toUpperCase();

  if (normalized === "ALL") {
    return {};
  }

  if (normalized === "ARCHIVED") {
    return { isArchived: true };
  }

  if (normalized === "COMPLETED") {
    return {
      isArchived: false,
      OR: [
        { examEndsAt: { lt: now } },
        { resultStatus: { in: ["LOCKED", "PUBLISHED"] } }
      ]
    };
  }

  return {
    ...(normalized === "ACTIVE" ? { examEndsAt: { gte: now } } : {}),
    isArchived: false
  };
}

async function getExamCycleById({ tenantId, examCycleId }) {
  const cycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true,
      resultStatus: true,
      enrollmentStartAt: true,
      enrollmentEndAt: true,
      examStartsAt: true,
      examEndsAt: true,
      resultPublishedAt: true
    }
  });

  if (!cycle) {
    const error = new Error("Exam cycle not found");
    error.statusCode = 404;
    error.errorCode = "EXAM_CYCLE_NOT_FOUND";
    throw error;
  }

  return cycle;
}

async function assertExamCycleOperational({ tenantId, examCycleId }) {
  const cycle = await getExamCycleById({ tenantId, examCycleId });
  if (cycle.isArchived) {
    const error = new Error("Exam cycle is archived and unavailable for active workflows");
    error.statusCode = 409;
    error.errorCode = "EXAM_CYCLE_ARCHIVED";
    throw error;
  }
  return cycle;
}

async function resolveExamCourseLevelContext({ tenantId, courseId, levelNumber }) {
  const normalizedCourseId = normalizeString(courseId);
  const normalizedLevelNumberRaw = normalizeString(levelNumber);

  if (!normalizedCourseId && !normalizedLevelNumberRaw) {
    return null;
  }

  if (!normalizedCourseId || !normalizedLevelNumberRaw) {
    const error = new Error("courseId and levelNumber are required together");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  const parsedLevelNumber = Number(normalizedLevelNumberRaw);
  if (!Number.isInteger(parsedLevelNumber) || parsedLevelNumber <= 0) {
    const error = new Error("levelNumber must be a positive integer");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  const examCourse = await prisma.course.findFirst({
    where: {
      tenantId,
      id: normalizedCourseId,
      scope: "EXAM"
    },
    select: {
      id: true
    }
  });

  if (!examCourse) {
    const error = new Error("Exam course not found");
    error.statusCode = 404;
    error.errorCode = "EXAM_COURSE_NOT_FOUND";
    throw error;
  }

  const courseLevel = await prisma.courseLevel.findFirst({
    where: {
      tenantId,
      courseId: examCourse.id,
      levelNumber: parsedLevelNumber
    },
    select: {
      id: true,
      levelNumber: true
    }
  });

  if (!courseLevel) {
    const error = new Error("Exam course level not found");
    error.statusCode = 404;
    error.errorCode = "EXAM_COURSE_LEVEL_NOT_FOUND";
    throw error;
  }

  const mappedLevel = await prisma.level.findFirst({
    where: {
      tenantId,
      rank: parsedLevelNumber
    },
    orderBy: [
      { createdAt: "asc" }
    ],
    select: {
      id: true,
      rank: true
    }
  });

  if (!mappedLevel?.id) {
    const error = new Error("Academic level not found for selected exam course level");
    error.statusCode = 404;
    error.errorCode = "LEVEL_NOT_FOUND";
    throw error;
  }

  return {
    courseId: examCourse.id,
    courseLevelId: courseLevel.id,
    levelNumber: courseLevel.levelNumber,
    mappedLevelId: mappedLevel.id
  };
}

async function resolveExamCourseContext({ tenantId, courseId }) {
  const normalizedCourseId = normalizeString(courseId);
  if (!normalizedCourseId) {
    return null;
  }

  const examCourse = await prisma.course.findFirst({
    where: {
      tenantId,
      id: normalizedCourseId,
      scope: "EXAM"
    },
    select: {
      id: true
    }
  });

  if (!examCourse) {
    const error = new Error("Exam course not found");
    error.statusCode = 404;
    error.errorCode = "EXAM_COURSE_NOT_FOUND";
    throw error;
  }

  return { courseId: examCourse.id };
}

function createScopeNotConfiguredError() {
  const error = new Error("Exam cycle assessment scope is not configured");
  error.statusCode = 409;
  error.errorCode = "EXAM_ASSESSMENT_SCOPE_NOT_CONFIGURED";
  return error;
}

async function inferExamCourseLevelContext({ tenantId, examCycleId, listId, levelsRaw = [] }) {
  const candidateKeys = new Set();
  const expectedLevelIds = new Set((levelsRaw || []).map((level) => String(level.levelId || "")).filter(Boolean));

  const selectionRows = await prisma.examEnrollmentLevelWorksheetSelection.findMany({
    where: {
      tenantId,
      list: {
        is: {
          tenantId,
          examCycleId,
          type: "CENTER_COMBINED",
          ...(listId ? { id: listId } : {})
        }
      }
    },
    select: {
      levelId: true,
      baseWorksheet: {
        select: {
          courseId: true,
          courseLevelId: true,
          levelId: true
        }
      }
    }
  });

  for (const row of selectionRows) {
    const worksheet = row?.baseWorksheet;
    const levelId = String(row?.levelId || worksheet?.levelId || "");
    if (!worksheet?.courseId || !worksheet?.courseLevelId || !levelId) continue;
    if (expectedLevelIds.size && !expectedLevelIds.has(levelId)) continue;
    candidateKeys.add(`${worksheet.courseId}:${worksheet.courseLevelId}:${levelId}`);
  }

  const configRows = await prisma.examLevelAssessmentConfig.findMany({
    where: {
      tenantId,
      examCycleId,
      ...(expectedLevelIds.size ? { levelId: { in: Array.from(expectedLevelIds) } } : {})
    },
    select: {
      levelId: true,
      worksheet: {
        select: {
          courseId: true,
          courseLevelId: true,
          levelId: true
        }
      }
    }
  });

  for (const row of configRows) {
    const worksheet = row?.worksheet;
    const levelId = String(row?.levelId || worksheet?.levelId || "");
    if (!worksheet?.courseId || !worksheet?.courseLevelId || !levelId) continue;
    if (expectedLevelIds.size && !expectedLevelIds.has(levelId)) continue;
    candidateKeys.add(`${worksheet.courseId}:${worksheet.courseLevelId}:${levelId}`);
  }

  if (candidateKeys.size !== 1) {
    return null;
  }

  const [courseId, courseLevelId, mappedLevelId] = Array.from(candidateKeys)[0].split(":");
  const courseLevel = await prisma.courseLevel.findFirst({
    where: {
      tenantId,
      id: courseLevelId,
      courseId
    },
    select: {
      id: true,
      courseId: true,
      levelNumber: true
    }
  });

  if (!courseLevel) {
    return null;
  }

  return {
    courseId,
    courseLevelId: courseLevel.id,
    levelNumber: courseLevel.levelNumber,
    mappedLevelId
  };
}

async function inferExamCourseContext({ tenantId, examCycleId, listId, levelsRaw = [] }) {
  const expectedLevelIds = new Set((levelsRaw || []).map((level) => String(level.levelId || "")).filter(Boolean));
  const candidateCourseIds = new Set();

  const [selectionRows, configRows] = await Promise.all([
    prisma.examEnrollmentLevelWorksheetSelection.findMany({
      where: {
        tenantId,
        list: {
          is: {
            tenantId,
            examCycleId,
            type: "CENTER_COMBINED",
            ...(listId ? { id: listId } : {})
          }
        }
      },
      select: {
        levelId: true,
        baseWorksheet: {
          select: {
            levelId: true,
            courseId: true
          }
        }
      }
    }),
    prisma.examLevelAssessmentConfig.findMany({
      where: {
        tenantId,
        examCycleId,
        ...(expectedLevelIds.size ? { levelId: { in: Array.from(expectedLevelIds) } } : {})
      },
      select: {
        levelId: true,
        worksheet: {
          select: {
            levelId: true,
            courseId: true
          }
        }
      }
    })
  ]);

  for (const row of selectionRows) {
    const worksheet = row?.baseWorksheet;
    const levelId = String(row?.levelId || worksheet?.levelId || "");
    if (!worksheet?.courseId || !levelId) continue;
    if (expectedLevelIds.size && !expectedLevelIds.has(levelId)) continue;
    candidateCourseIds.add(String(worksheet.courseId));
  }

  for (const row of configRows) {
    const worksheet = row?.worksheet;
    const levelId = String(row?.levelId || worksheet?.levelId || "");
    if (!worksheet?.courseId || !levelId) continue;
    if (expectedLevelIds.size && !expectedLevelIds.has(levelId)) continue;
    candidateCourseIds.add(String(worksheet.courseId));
  }

  if (candidateCourseIds.size !== 1) {
    return null;
  }

  return { courseId: Array.from(candidateCourseIds)[0] };
}

async function buildLevelScopeByLevelId({ tenantId, courseId, levelsRaw = [], allowPartial = false }) {
  const levelNumbers = Array.from(
    new Set(levelsRaw.map((level) => Number(level?.levelRank)).filter((rank) => Number.isInteger(rank) && rank > 0))
  );

  if (!levelNumbers.length) {
    throw createScopeNotConfiguredError();
  }

  const courseLevels = await prisma.courseLevel.findMany({
    where: {
      tenantId,
      courseId,
      levelNumber: { in: levelNumbers }
    },
    select: {
      id: true,
      levelNumber: true
    }
  });

  const courseLevelByNumber = new Map(courseLevels.map((entry) => [Number(entry.levelNumber), entry]));
  const levelScopeByLevelId = {};
  const missingLevels = [];

  for (const level of levelsRaw) {
    const mappedLevelId = String(level?.levelId || "");
    const parsedRank = Number(level?.levelRank);
    if (!mappedLevelId || !Number.isInteger(parsedRank) || parsedRank <= 0) {
      continue;
    }

    const courseLevel = courseLevelByNumber.get(parsedRank);
    if (!courseLevel?.id) {
      if (!allowPartial) {
        const error = new Error("Selected exam course does not include all participating levels");
        error.statusCode = 409;
        error.errorCode = "EXAM_LEVEL_NOT_IN_SCOPE";
        throw error;
      }

      missingLevels.push({
        levelId: mappedLevelId,
        levelRank: parsedRank,
        levelName: level?.levelName || null,
        studentCount: Number(level?.studentCount || 0)
      });
      continue;
    }

    levelScopeByLevelId[mappedLevelId] = {
      courseId,
      courseLevelId: courseLevel.id,
      levelNumber: courseLevel.levelNumber,
      mappedLevelId
    };
  }

  return {
    levelScopeByLevelId,
    missingLevels
  };
}

async function resolvePendingAssessmentScope({ tenantId, examCycleId, listId = null, courseId = null, levelNumber = null, allowPartialLevels = false }) {
  const levelsRaw = await getExamCycleLevels({
    tenantId,
    examCycleId,
    listId
  });

  if (!levelsRaw.length) {
    throw createScopeNotConfiguredError();
  }

  const normalizedCourseId = normalizeString(courseId);
  const normalizedLevelNumber = normalizeString(levelNumber);

  if (!normalizedCourseId && normalizedLevelNumber) {
    const error = new Error("courseId and levelNumber are required together");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  let resolvedCourseId = normalizedCourseId;
  if (!resolvedCourseId) {
    const inferredCourse = await inferExamCourseContext({
      tenantId,
      examCycleId,
      listId,
      levelsRaw
    });
    resolvedCourseId = normalizeString(inferredCourse?.courseId);
  }

  if (!resolvedCourseId) {
    throw createScopeNotConfiguredError();
  }

  if (normalizedLevelNumber) {
    const examCourseContext = await resolveExamCourseLevelContext({
      tenantId,
      courseId: resolvedCourseId,
      levelNumber: normalizedLevelNumber
    });

    const levels = levelsRaw.filter((level) => level.levelId === examCourseContext.mappedLevelId);
    if (!levels.length) {
      const error = new Error("Selected exam course level is not part of this exam cycle context");
      error.statusCode = 409;
      error.errorCode = "EXAM_LEVEL_NOT_IN_SCOPE";
      throw error;
    }

    return {
      examCourseContext,
      levels,
      levelIds: levels.map((level) => level.levelId),
      configurableLevelIds: levels.map((level) => level.levelId),
      levelScopeByLevelId: {
        [examCourseContext.mappedLevelId]: examCourseContext
      },
      missingLevels: []
    };
  }

  const examCourseContext = await resolveExamCourseContext({
    tenantId,
    courseId: resolvedCourseId
  });
  const { levelScopeByLevelId, missingLevels } = await buildLevelScopeByLevelId({
    tenantId,
    courseId: examCourseContext.courseId,
    levelsRaw,
    allowPartial: allowPartialLevels
  });

  const levels = levelsRaw;
  const configurableLevelIds = Object.keys(levelScopeByLevelId);

  if (!levels.length || (!configurableLevelIds.length && !allowPartialLevels)) {
    throw createScopeNotConfiguredError();
  }

  return {
    examCourseContext: {
      courseId: examCourseContext.courseId,
      courseLevelId: null,
      levelNumber: null,
      mappedLevelId: null
    },
    levels,
    levelIds: levels.map((level) => level.levelId),
    configurableLevelIds,
    levelScopeByLevelId,
    missingLevels
  };
}

async function verifySuperadminPasswordOrThrow({ tenantId, userId, password }) {
  const actor = await prisma.authUser.findFirst({
    where: {
      id: userId,
      tenantId,
      role: "SUPERADMIN",
      isActive: true
    },
    select: { id: true, passwordHash: true, username: true }
  });

  if (!actor) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    error.errorCode = "ROLE_FORBIDDEN";
    throw error;
  }

  const validPassword = await verifyPassword(password, actor.passwordHash);
  if (!validPassword) {
    const error = new Error("Invalid password");
    error.statusCode = 401;
    error.errorCode = "INVALID_PASSWORD";
    throw error;
  }

  return actor;
}

const listExamCycles = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);
  const lifecycleFilter = req.query?.filter || req.query?.lifecycle || "DEFAULT";

  const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });
  const centerNodeId = scope.role === "CENTER" ? (scope.hierarchyNodeIds[0] || null) : null;
  const teacherNodeId = scope.role === "TEACHER" ? (scope.hierarchyNodeIds[0] || null) : null;

  const teacherStudentScope =
    scope.role === "TEACHER"
      ? {
          isActive: true,
          ...(teacherNodeId ? { hierarchyNodeId: teacherNodeId } : {}),
          OR: [
            { currentTeacherUserId: req.auth.userId },
            {
              batchEnrollments: {
                some: {
                  tenantId: req.auth.tenantId,
                  status: "ACTIVE",
                  assignedTeacherUserId: req.auth.userId
                }
              }
            }
          ]
        }
      : null;

  const where = {
    tenantId: req.auth.tenantId,
    ...buildLifecycleFilterWhere(lifecycleFilter),
    ...(scope.businessPartnerId ? { businessPartnerId: scope.businessPartnerId } : {})
  };

  const getStatusCount = (countsByType = {}, type, status) => Number(countsByType?.[type]?.[status] || 0);

  const buildHierarchySummary = (countsByType = {}) => {
    const teacherDraft = getStatusCount(countsByType, "TEACHER", "DRAFT");
    const teacherRejected = getStatusCount(countsByType, "TEACHER", "REJECTED");
    const teacherSubmittedToCenter = getStatusCount(countsByType, "TEACHER", "SUBMITTED_TO_CENTER");
    const centerDraft = getStatusCount(countsByType, "CENTER_COMBINED", "DRAFT");
    const centerRejected = getStatusCount(countsByType, "CENTER_COMBINED", "REJECTED");
    const centerSubmittedToFranchise = getStatusCount(countsByType, "CENTER_COMBINED", "SUBMITTED_TO_FRANCHISE");
    const franchiseSubmittedToBusinessPartner = getStatusCount(countsByType, "CENTER_COMBINED", "SUBMITTED_TO_BUSINESS_PARTNER");
    const businessPartnerSubmittedToSuperadmin = getStatusCount(countsByType, "CENTER_COMBINED", "SUBMITTED_TO_SUPERADMIN");
    const approved = getStatusCount(countsByType, "CENTER_COMBINED", "APPROVED");
    const rejected = centerRejected;

    return {
      teacherDraft,
      teacherRejected,
      teacherSubmittedToCenter,
      centerSubmittedToFranchise,
      franchiseSubmittedToBusinessPartner,
      businessPartnerSubmittedToSuperadmin,
      approved,
      rejected,
      centerReview: teacherSubmittedToCenter + centerDraft + centerRejected
    };
  };

  const resolveCurrentOwnerRole = (hierarchy) => {
    if ((hierarchy.businessPartnerSubmittedToSuperadmin || 0) > 0) return "SUPERADMIN";
    if ((hierarchy.franchiseSubmittedToBusinessPartner || 0) > 0) return "BP";
    if ((hierarchy.centerSubmittedToFranchise || 0) > 0) return "FRANCHISE";
    if ((hierarchy.teacherSubmittedToCenter || 0) > 0 || (hierarchy.centerReview || 0) > 0) return "CENTER";
    if ((hierarchy.teacherDraft || 0) > 0 || (hierarchy.teacherRejected || 0) > 0) return "TEACHER";
    if ((hierarchy.approved || 0) > 0) return "APPROVED";
    return null;
  };

  const [items, total, scopedExamCycleIds, publishedResultCycles] = await Promise.all([
    prisma.examCycle.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        businessPartner: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, email: true, role: true } }
      }
    }),
    prisma.examCycle.count({ where }),
    prisma.examCycle.findMany({
      where,
      select: { id: true }
    }),
    prisma.examCycle.count({
      where: {
        ...where,
        resultStatus: "PUBLISHED"
      }
    })
  ]);

  const scopedCycleIds = scopedExamCycleIds.map((cycle) => cycle.id);

  const [itemWorkflowRows, workflowByStatus, totalEnrollmentCount, lateEnrollmentCount] = scopedCycleIds.length
    ? await Promise.all([
        prisma.examEnrollmentList.groupBy({
          by: ["examCycleId", "type", "status"],
          where: {
            tenantId: req.auth.tenantId,
            examCycleId: { in: items.map((item) => item.id) },
            ...(centerNodeId ? { hierarchyNodeId: centerNodeId } : {}),
            ...(scope.role === "TEACHER" ? { teacherUserId: req.auth.userId } : {})
          },
          _count: { _all: true }
        }),
        prisma.examEnrollmentList.groupBy({
          by: ["type", "status"],
          where: {
            tenantId: req.auth.tenantId,
            examCycleId: { in: scopedCycleIds },
            ...(centerNodeId ? { hierarchyNodeId: centerNodeId } : {}),
            ...(scope.role === "TEACHER" ? { teacherUserId: req.auth.userId } : {})
          },
          _count: { _all: true }
        }),
        prisma.examEnrollmentEntry.count({
          where: {
            tenantId: req.auth.tenantId,
            examCycleId: { in: scopedCycleIds },
            ...(scope.role === "TEACHER" ? { sourceTeacherUserId: req.auth.userId } : {}),
            ...(teacherStudentScope
              ? { student: { is: teacherStudentScope } }
              : centerNodeId
                ? { student: { hierarchyNodeId: centerNodeId } }
                : {})
          }
        }),
        prisma.examLateEnrollmentStudent.count({
          where: {
            tenantId: req.auth.tenantId,
            status: "APPROVED",
            ...(teacherStudentScope ? { student: { is: teacherStudentScope } } : {}),
            request: {
              is: {
                examCycleId: { in: scopedCycleIds },
                ...(centerNodeId || teacherNodeId ? { centerId: centerNodeId || teacherNodeId } : {})
              }
            }
          }
        })
      ])
    : [[], [], 0, 0];

  const statusCountsByCycleId = itemWorkflowRows.reduce((acc, row) => {
    const key = row.examCycleId;
    if (!acc[key]) {
      acc[key] = {};
    }
    if (!acc[key][row.type]) {
      acc[key][row.type] = {};
    }
    acc[key][row.type][row.status] = Number(row?._count?._all || 0);
    return acc;
  }, {});

  const workflowStatusCounts = workflowByStatus.reduce((acc, row) => {
    if (!acc[row.type]) {
      acc[row.type] = {};
    }
    acc[row.type][row.status] = Number(row?._count?._all || 0);
    return acc;
  }, {});

  const workflowQueue = buildHierarchySummary(workflowStatusCounts);

  const itemsWithCounts = await Promise.all(
    items.map(async (item) => {
      const counts = await getEnrollmentCounts({
        tenantId: req.auth.tenantId,
        examCycleId: item.id,
        ...(centerNodeId || teacherNodeId ? { centerNodeId: centerNodeId || teacherNodeId } : {}),
        ...(scope.role === "TEACHER" ? { teacherUserId: req.auth.userId } : {})
      });

      const hierarchy = buildHierarchySummary(statusCountsByCycleId[item.id] || {});
      return {
        ...item,
        enrollmentCounts: counts,
        enrollmentListSummary: {
          hierarchy,
          currentOwnerRole: resolveCurrentOwnerRole(hierarchy),
          bpActionRequired: (hierarchy.franchiseSubmittedToBusinessPartner || 0) > 0,
          readOnly: (hierarchy.franchiseSubmittedToBusinessPartner || 0) <= 0
        }
      };
    })
  );

  const normalEnrollmentCount = Math.max(Number(totalEnrollmentCount || 0) - Number(lateEnrollmentCount || 0), 0);

  return res.apiSuccess("Exam cycles fetched", {
    items: itemsWithCounts,
    total,
    limit,
    offset,
    summary: {
      totalCycles: total,
      enrollment: {
        totalEnrollmentCount: Number(totalEnrollmentCount || 0),
        normalEnrollmentCount,
        lateEnrollmentCount: Number(lateEnrollmentCount || 0)
      },
      publishedResultCycles
    },
    workflowQueue,
    filter: String(lifecycleFilter || "DEFAULT").toUpperCase()
  });
});

const createExamCycle = asyncHandler(async (req, res) => {
  const {
    businessPartnerId,
    name,
    enrollmentStartAt,
    enrollmentEndAt,
    practiceStartAt,
    examStartsAt,
    examEndsAt,
    examDurationMinutes,
    attemptLimit,
    resultPublishAt
  } = req.body;

  if (!businessPartnerId || !name) {
    return res.apiError(400, "businessPartnerId and name are required", "VALIDATION_ERROR");
  }

  const enrollmentStart = parseDateTime(enrollmentStartAt, "enrollmentStartAt");
  const enrollmentEnd = parseDateTime(enrollmentEndAt, "enrollmentEndAt");
  const practiceStart = parseDateTime(practiceStartAt, "practiceStartAt");
  const examStart = parseDateTime(examStartsAt, "examStartsAt");
  const examEnd = parseDateTime(examEndsAt, "examEndsAt");

  if (!enrollmentStart || !enrollmentEnd || !practiceStart || !examStart || !examEnd) {
    return res.apiError(400, "All date fields are required", "VALIDATION_ERROR");
  }

  assertDateOrder(enrollmentStart, enrollmentEnd, "Enrollment start must be before enrollment end");
  assertDateOrder(practiceStart, examStart, "Practice start must be before exam start");
  assertDateOrder(examStart, examEnd, "Exam start must be before exam end");

  const duration = Number(examDurationMinutes);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 600) {
    return res.apiError(400, "examDurationMinutes must be a positive integer (<=600)", "VALIDATION_ERROR");
  }

  const limit = attemptLimit === undefined || attemptLimit === null ? 1 : Number(attemptLimit);
  if (!Number.isInteger(limit) || limit !== 1) {
    return res.apiError(400, "attemptLimit must be 1", "VALIDATION_ERROR");
  }

  const publishAt = resultPublishAt ? parseDateTime(resultPublishAt, "resultPublishAt") : null;

  const bp = await prisma.businessPartner.findFirst({
    where: { id: String(businessPartnerId), tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true, contactEmail: true }
  });

  if (!bp) {
    return res.apiError(404, "Business partner not found", "BUSINESS_PARTNER_NOT_FOUND");
  }

  let code = generateExamCode("EX");

  const created = await prisma.$transaction(async (tx) => {
    // Retry on rare collisions
    let cycle;
    for (let i = 0; i < 3; i += 1) {
      try {
        cycle = await tx.examCycle.create({
          data: {
            tenantId: req.auth.tenantId,
            businessPartnerId: bp.id,
            name: String(name).trim(),
            code,
            enrollmentStartAt: enrollmentStart,
            enrollmentEndAt: enrollmentEnd,
            practiceStartAt: practiceStart,
            examStartsAt: examStart,
            examEndsAt: examEnd,
            examDurationMinutes: duration,
            attemptLimit: 1,
            resultPublishAt: publishAt,
            createdByUserId: req.auth.userId,
            resultStatus: "DRAFT"
          }
        });
        break;
      } catch (err) {
        if (err?.code === "P2002") {
          code = generateExamCode("EX");
          continue;
        }
        throw err;
      }
    }

    if (!cycle) {
      const error = new Error("Unable to generate unique exam code");
      error.statusCode = 409;
      error.errorCode = "EXAM_CODE_CONFLICT";
      throw error;
    }

    if (!cycle) {
      return null;
    }

    return cycle;
  });

  if (!created) {
    const error = new Error("Unable to generate unique exam code");
    error.statusCode = 409;
    error.errorCode = "EXAM_CODE_CONFLICT";
    throw error;
  }

  res.locals.entityId = created.id;

  // Notify hierarchy under the selected business partner.
  void (async () => {
    try {
      const nodeIds = bp.hierarchyNodeId
        ? await resolveBusinessPartnerHierarchyNodeIds({
            tenantId: req.auth.tenantId,
            businessPartnerId: bp.id
          })
        : [];

      const recipients = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: { in: ["BP", "FRANCHISE", "CENTER", "TEACHER"] },
          ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
        },
        select: { id: true },
        take: 500
      });

      await createBulkNotification(
        recipients.map((r) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: r.id,
          type: "EXAM_CYCLE_CREATED",
          title: "New Exam Cycle",
          message: `Exam cycle created: ${created.name} (${created.code})`,
          entityType: "EXAM_CYCLE",
          entityId: created.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Exam cycle created", created, 201);
});

function withinEnrollmentWindow(examCycle, now = new Date()) {
  return now.getTime() >= new Date(examCycle.enrollmentStartAt).getTime() && now.getTime() <= new Date(examCycle.enrollmentEndAt).getTime();
}

async function loadExamCycleDeleteImpact({ tenantId, examCycleId }) {
  const examCycle = await getExamCycleById({ tenantId, examCycleId });

  const [listCount, approvedListCount, entryCount, worksheetCount, submissionCount, questionSetCount, tempStudentCount] = await Promise.all([
    prisma.examEnrollmentList.count({
      where: { tenantId, examCycleId }
    }),
    prisma.examEnrollmentList.count({
      where: { tenantId, examCycleId, status: "APPROVED" }
    }),
    prisma.examEnrollmentEntry.count({
      where: { tenantId, examCycleId }
    }),
    prisma.worksheet.count({
      where: { tenantId, examCycleId }
    }),
    prisma.worksheetSubmission.count({
      where: {
        tenantId,
        worksheet: {
          is: { examCycleId }
        }
      }
    }),
    prisma.examGeneratedQuestionSet.count({
      where: { tenantId, examCycleId }
    }),
    prisma.student.count({
      where: {
        tenantId,
        temporaryExamCycleId: examCycleId,
        isTemporaryExam: true
      }
    })
  ]);

  const now = new Date();
  const hasStarted = new Date(examCycle.examStartsAt).getTime() <= now.getTime();
  const hasApprovedLists = approvedListCount > 0;
  const isPublished = examCycle.resultStatus === "PUBLISHED";
  const hasSubmissions = submissionCount > 0;

  const blockers = [];
  if (hasApprovedLists) {
    blockers.push("Approved enrollment lists exist. Delete is blocked.");
  }

  const warnings = [];
  if (hasStarted) {
    warnings.push("Exam has started or ended. Delete will remove scheduling context.");
  }
  if (isPublished) {
    warnings.push("Results are published. Delete remains allowed but fully destructive.");
  }
  if (hasSubmissions) {
    warnings.push("Worksheet submissions exist and will lose exam-cycle linkage.");
  }
  if (examCycle.isArchived) {
    warnings.push("Cycle is already archived.");
  }

  return {
    examCycle,
    summary: {
      listCount,
      approvedListCount,
      entryCount,
      worksheetCount,
      submissionCount,
      questionSetCount,
      tempStudentCount
    },
    flags: {
      hasApprovedLists,
      hasStarted,
      isPublished,
      hasSubmissions,
      isArchived: examCycle.isArchived,
      canDelete: !hasApprovedLists,
      requiresPasswordConfirmation: true
    },
    blockers,
    warnings
  };
}

async function loadExamCycleArchiveImpact({ tenantId, examCycleId }) {
  const examCycle = await getExamCycleById({ tenantId, examCycleId });

  const [enrollmentCount, approvedEnrollmentCount, worksheetCount, resultCount, tempStudentCount, studentIds] = await Promise.all([
    prisma.examEnrollmentEntry.count({
      where: { tenantId, examCycleId }
    }),
    prisma.examEnrollmentList.count({
      where: { tenantId, examCycleId, status: "APPROVED" }
    }),
    prisma.worksheet.count({
      where: { tenantId, examCycleId }
    }),
    prisma.worksheetSubmission.count({
      where: {
        tenantId,
        worksheet: {
          is: { examCycleId }
        }
      }
    }),
    prisma.student.count({
      where: {
        tenantId,
        temporaryExamCycleId: examCycleId,
        isTemporaryExam: true
      }
    }),
    prisma.examEnrollmentEntry.findMany({
      where: { tenantId, examCycleId },
      select: { studentId: true }
    })
  ]);

  const uniqueStudentIds = Array.from(new Set(studentIds.map((entry) => entry.studentId).filter(Boolean)));

  const certificateCount = uniqueStudentIds.length
    ? await prisma.certificate.count({
        where: {
          tenantId,
          studentId: { in: uniqueStudentIds }
        }
      })
    : 0;

  const activeDependencies = {
    hasApprovedEnrollment: approvedEnrollmentCount > 0,
    hasResults: resultCount > 0,
    hasWorksheets: worksheetCount > 0,
    hasCertificates: certificateCount > 0,
    hasTemporaryStudents: tempStudentCount > 0,
    isPublished: examCycle.resultStatus === "PUBLISHED"
  };

  const warnings = [];
  if (activeDependencies.hasApprovedEnrollment) {
    warnings.push("Approved enrollment lists exist; archive is recommended before delete.");
  }
  if (activeDependencies.hasResults) {
    warnings.push("Result submissions exist and will remain in historical reports.");
  }
  if (activeDependencies.hasCertificates) {
    warnings.push("Certificates are linked to participating students and remain preserved.");
  }
  if (examCycle.isArchived) {
    warnings.push("Cycle is already archived.");
  }

  return {
    examCycle,
    summary: {
      enrollmentCount,
      approvedEnrollmentCount,
      resultCount,
      worksheetCount,
      certificateCount,
      tempStudentCount
    },
    activeDependencies,
    warnings
  };
}

async function resolveTeacherCenterNodeId({ tenantId, teacherUserId, requestedNodeId }) {
  if (requestedNodeId) {
    return requestedNodeId;
  }

  const teacherUser = await prisma.authUser.findFirst({
    where: { id: teacherUserId, tenantId },
    select: { hierarchyNodeId: true }
  });

  if (teacherUser?.hierarchyNodeId) {
    return teacherUser.hierarchyNodeId;
  }

  const recentEnrollment = await prisma.enrollment.findFirst({
    where: {
      tenantId,
      assignedTeacherUserId: teacherUserId,
      hierarchyNodeId: { not: null }
    },
    orderBy: { createdAt: "desc" },
    select: { hierarchyNodeId: true }
  });

  return recentEnrollment?.hierarchyNodeId || null;
}

async function getOrCreateTeacherList({ tenantId, examCycleId, teacherUserId, centerNodeId }) {
  const scopeKey = `TEACHER:${teacherUserId}`;

  let list = await prisma.examEnrollmentList.findFirst({
    where: { tenantId, examCycleId, scopeKey },
    select: { id: true, status: true, locked: true }
  });

  if (list) return list;

  list = await prisma.examEnrollmentList.create({
    data: {
      tenantId,
      examCycleId,
      type: "TEACHER",
      scopeKey,
      hierarchyNodeId: centerNodeId,
      teacherUserId,
      status: "DRAFT",
      locked: false,
      createdByUserId: teacherUserId
    },
    select: { id: true, status: true, locked: true }
  });

  return list;
}

const getTeacherList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const centerNodeId = await resolveTeacherCenterNodeId({
    tenantId: req.auth.tenantId,
    teacherUserId: req.auth.userId,
    requestedNodeId: req.auth.hierarchyNodeId
  });

  if (!centerNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const list = await getOrCreateTeacherList({
    tenantId: req.auth.tenantId,
    examCycleId,
    teacherUserId: req.auth.userId,
    centerNodeId
  });

  const full = await prisma.examEnrollmentList.findFirst({
    where: { id: list.id, tenantId: req.auth.tenantId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          entry: {
            include: {
              student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, isActive: true, levelId: true } },
              enrolledLevel: { select: { id: true, name: true, rank: true } }
            }
          }
        }
      }
    }
  });

  return res.apiSuccess("Teacher enrollment list", full);
});

const teacherEnrollStudents = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const studentIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : null;

  if (!studentIds || !studentIds.length) {
    return res.apiError(400, "studentIds[] is required", "VALIDATION_ERROR");
  }

  const centerNodeId = await resolveTeacherCenterNodeId({
    tenantId: req.auth.tenantId,
    teacherUserId: req.auth.userId,
    requestedNodeId: req.auth.hierarchyNodeId
  });

  if (!centerNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      enrollmentStartAt: true,
      enrollmentEndAt: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (!withinEnrollmentWindow(examCycle)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  const list = await getOrCreateTeacherList({
    tenantId: req.auth.tenantId,
    examCycleId,
    teacherUserId: req.auth.userId,
    centerNodeId
  });

  if (list.locked && list.status === "SUBMITTED_TO_CENTER") {
    return res.apiError(409, "List is submitted and locked", "LIST_LOCKED");
  }

  const activeEnrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: centerNodeId,
      status: "ACTIVE",
      assignedTeacherUserId: req.auth.userId,
      studentId: { in: studentIds }
    },
    select: {
      studentId: true,
      levelId: true,
      student: { select: { id: true, isActive: true, levelId: true } }
    }
  });

  const allowedByStudentId = new Map();
  for (const enrollment of activeEnrollments) {
    if (!enrollment?.student?.isActive) continue;
    if (!enrollment?.studentId) continue;

    const effectiveLevelId = enrollment?.levelId || enrollment?.student?.levelId;
    if (!effectiveLevelId) {
      return res.apiError(409, "Active enrollment level is missing for one or more students", "ENROLLMENT_LEVEL_MISSING");
    }

    if (!allowedByStudentId.has(enrollment.studentId)) {
      allowedByStudentId.set(enrollment.studentId, {
        ...enrollment,
        effectiveLevelId
      });
    }
  }

  for (const sid of studentIds) {
    if (!allowedByStudentId.has(sid)) {
      return res.apiError(403, "One or more students are not assigned/active under this teacher", "TEACHER_STUDENT_FORBIDDEN");
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const sid of studentIds) {
      const enrollment = allowedByStudentId.get(sid);

      const existing = await tx.examEnrollmentEntry.findUnique({
        where: {
          tenantId_examCycleId_studentId: {
            tenantId: req.auth.tenantId,
            examCycleId,
            studentId: sid
          }
        },
        select: { id: true, isTemporary: true, sourceTeacherUserId: true }
      });

      if (existing && !existing.isTemporary && existing.sourceTeacherUserId && existing.sourceTeacherUserId !== req.auth.userId) {
        const error = new Error("Student already enrolled in this exam cycle");
        error.statusCode = 409;
        error.errorCode = "DUPLICATE_ENROLLMENT";
        throw error;
      }

      const entry = await tx.examEnrollmentEntry.upsert({
        where: {
          tenantId_examCycleId_studentId: {
            tenantId: req.auth.tenantId,
            examCycleId,
            studentId: sid
          }
        },
        create: {
          tenantId: req.auth.tenantId,
          examCycleId,
          studentId: sid,
          enrolledLevelId: enrollment.effectiveLevelId,
          isTemporary: false,
          sourceTeacherUserId: req.auth.userId,
          createdByUserId: req.auth.userId
        },
        update: {},
        select: { id: true }
      });

      await tx.examEnrollmentListItem.create({
        data: {
          tenantId: req.auth.tenantId,
          listId: list.id,
          entryId: entry.id
        }
      }).catch((err) => {
        if (err?.code === "P2002") {
          return null;
        }
        throw err;
      });
    }
  });

  const updated = await prisma.examEnrollmentList.findFirst({
    where: { id: list.id },
    include: {
      items: { include: { entry: true } }
    }
  });

  return res.apiSuccess("Students enrolled", updated, 201);
});

const submitTeacherListToCenter = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });

  const centerNodeId = await resolveTeacherCenterNodeId({
    tenantId: req.auth.tenantId,
    teacherUserId: req.auth.userId,
    requestedNodeId: req.auth.hierarchyNodeId
  });

  if (!centerNodeId) {
    return res.apiError(400, "Teacher center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      enrollmentStartAt: true,
      enrollmentEndAt: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (!withinEnrollmentWindow(examCycle)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  const list = await getOrCreateTeacherList({
    tenantId: req.auth.tenantId,
    examCycleId,
    teacherUserId: req.auth.userId,
    centerNodeId
  });

  const entriesCount = await prisma.examEnrollmentListItem.count({
    where: { tenantId: req.auth.tenantId, listId: list.id }
  });

  if (entriesCount === 0) {
    return res.apiError(409, "Cannot submit an empty list", "EXAM_LIST_EMPTY");
  }

  const now = new Date();

  const updated = await prisma.examEnrollmentList.update({
    where: { id: list.id },
    data: {
      status: "SUBMITTED_TO_CENTER",
      locked: true,
      submittedAt: now,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectedRemark: null
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_TEACHER_LIST_SUBMIT",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: updated.id,
    metadata: { examCycleId }
  });

  // Notify center user(s) on same node.
  void (async () => {
    try {
      const centers = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: "CENTER",
          hierarchyNodeId: centerNodeId
        },
        select: { id: true },
        take: 500
      });

      await createBulkNotification(
        centers.map((c) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: c.id,
          type: "EXAM_LIST_SUBMITTED",
          title: "Exam Enrollment List Submitted",
          message: "A teacher submitted an exam enrollment list for your center.",
          entityType: "EXAM_ENROLLMENT_LIST",
          entityId: updated.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Teacher list submitted to center", updated);
});

async function getOrCreateCenterCombinedList({ tenantId, examCycleId, centerNodeId, actorUserId }) {
  const scopeKey = `CENTER:${centerNodeId}`;

  // MySQL upsert is not fully atomic under concurrency in Prisma; handle races explicitly.
  try {
    return await prisma.examEnrollmentList.create({
      data: {
        tenantId,
        examCycleId,
        type: "CENTER_COMBINED",
        scopeKey,
        hierarchyNodeId: centerNodeId,
        teacherUserId: null,
        status: "DRAFT",
        locked: false,
        createdByUserId: actorUserId
      },
      select: { id: true, status: true, locked: true }
    });
  } catch (error) {
    // Prisma unique constraint violation
    if (error && typeof error === "object" && error.code === "P2002") {
      const existing = await prisma.examEnrollmentList.findFirst({
        where: { tenantId, examCycleId, scopeKey },
        select: { id: true, status: true, locked: true }
      });
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

async function allocateTemporaryStudentUsername({ tx, tenantId }) {
  const maxAttempts = 40;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let username = null;

    try {
      username = await generateUsername({ tx, tenantId, role: "STUDENT" });
    } catch (error) {
      if (error?.errorCode !== "USERNAME_GENERATION_CONFLICT") {
        throw error;
      }

      const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      username = `ST${randomSuffix}`;
    }

    if (!username) continue;

    const [existingUser, existingStudent] = await Promise.all([
      tx.authUser.findFirst({
        where: { tenantId, username },
        select: { id: true }
      }),
      tx.student.findFirst({
        where: { tenantId, admissionNo: username },
        select: { id: true }
      })
    ]);

    if (!existingUser && !existingStudent) {
      return username;
    }
  }

  const error = new Error("Unable to allocate unique username");
  error.statusCode = 409;
  error.errorCode = "USERNAME_GENERATION_CONFLICT";
  throw error;
}

const centerPrepareCombinedList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const centerNodeId = req.auth.hierarchyNodeId;

  if (!centerNodeId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const combined = await getOrCreateCenterCombinedList({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerNodeId,
    actorUserId: req.auth.userId
  });

  // If list is already submitted/locked, allow viewing it in read-only mode.
  // (Selection edits are blocked by the PATCH endpoint.)
  if (combined.locked && combined.status !== "REJECTED") {
    const [fullLocked, lockedTeacherLists] = await Promise.all([
      prisma.examEnrollmentList.findFirst({
        where: { id: combined.id },
        include: {
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              entry: {
                include: {
                  student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, isTemporaryExam: true } },
                  enrolledLevel: { select: { id: true, name: true, rank: true } },
                  sourceTeacherUser: {
                    select: {
                      id: true,
                      username: true,
                      teacherProfile: { select: { fullName: true } }
                    }
                  }
                }
              }
            }
          }
        }
      }),
      prisma.examEnrollmentList.findMany({
        where: {
          tenantId: req.auth.tenantId,
          examCycleId,
          type: "TEACHER",
          hierarchyNodeId: centerNodeId
        },
        select: {
          id: true,
          teacherUserId: true,
          status: true,
          submittedAt: true,
          teacherUser: {
            select: {
              id: true,
              username: true,
              teacherProfile: { select: { fullName: true } }
            }
          },
          _count: { select: { items: true } }
        },
        orderBy: { submittedAt: "desc" }
      })
    ]);

    return res.apiSuccess("Combined list is locked", { ...fullLocked, teacherLists: lockedTeacherLists });
  }

  const teacherLists = await prisma.examEnrollmentList.findMany({
    where: {
      tenantId: req.auth.tenantId,
      examCycleId,
      type: "TEACHER",
      hierarchyNodeId: centerNodeId,
      status: "SUBMITTED_TO_CENTER",
      locked: true
    },
    select: {
      id: true,
      teacherUserId: true,
      status: true,
      submittedAt: true,
      teacherUser: {
        select: {
          id: true,
          username: true,
          teacherProfile: { select: { fullName: true } }
        }
      },
      _count: { select: { items: true } }
    },
    orderBy: { submittedAt: "desc" }
  });

  const teacherListIds = teacherLists.map((l) => l.id);
  const teacherItems = teacherListIds.length
    ? await prisma.examEnrollmentListItem.findMany({
        where: {
          tenantId: req.auth.tenantId,
          listId: { in: teacherListIds }
        },
        select: { entryId: true }
      })
    : [];

  const teacherEntryIds = Array.from(new Set(teacherItems.map((i) => i.entryId).filter(Boolean)));

  // Remove stale teacher-sourced entries (keep temp entries).
  await prisma.examEnrollmentListItem.deleteMany({
    where: {
      tenantId: req.auth.tenantId,
      listId: combined.id,
      entry: { is: { isTemporary: false } },
      ...(teacherEntryIds.length ? { entryId: { notIn: teacherEntryIds } } : {})
    }
  });

  // Add missing teacher entries without touching existing ones (preserves included flags).
  if (teacherEntryIds.length) {
    await prisma.examEnrollmentListItem.createMany({
      data: teacherEntryIds.map((entryId) => ({
        tenantId: req.auth.tenantId,
        listId: combined.id,
        entryId
      })),
      skipDuplicates: true
    });
  }

  const full = await prisma.examEnrollmentList.findFirst({
    where: { id: combined.id },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          entry: {
            include: {
              student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, isTemporaryExam: true } },
              enrolledLevel: { select: { id: true, name: true, rank: true } },
              sourceTeacherUser: {
                select: {
                  id: true,
                  username: true,
                  teacherProfile: { select: { fullName: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  // Also include all teacher lists (not just SUBMITTED_TO_CENTER) for the reject UI
  const allTeacherLists = await prisma.examEnrollmentList.findMany({
    where: {
      tenantId: req.auth.tenantId,
      examCycleId,
      type: "TEACHER",
      hierarchyNodeId: centerNodeId
    },
    select: {
      id: true,
      teacherUserId: true,
      status: true,
      submittedAt: true,
      teacherUser: {
        select: {
          id: true,
          username: true,
          teacherProfile: { select: { fullName: true } }
        }
      },
      _count: { select: { items: true } }
    },
    orderBy: { submittedAt: "desc" }
  });

  return res.apiSuccess("Combined list prepared", { ...full, teacherLists: allTeacherLists });
});

const centerSubmitCombinedListToFranchise = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const centerNodeId = req.auth.hierarchyNodeId;

  if (!centerNodeId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true, enrollmentStartAt: true, enrollmentEndAt: true }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (!withinEnrollmentWindow(examCycle)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  const combined = await getOrCreateCenterCombinedList({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerNodeId,
    actorUserId: req.auth.userId
  });

  if (combined.locked && combined.status !== "REJECTED") {
    return res.apiError(409, "Combined list is locked", "LIST_LOCKED");
  }

  const entriesCount = await prisma.examEnrollmentListItem.count({
    where: { tenantId: req.auth.tenantId, listId: combined.id, included: true }
  });

  if (entriesCount === 0) {
    return res.apiError(409, "Cannot submit an empty list", "EXAM_LIST_EMPTY");
  }

  // Ensure combined list is in DRAFT or REJECTED before submitting.
  const now = new Date();

  const updated = await prisma.examEnrollmentList.update({
    where: { id: combined.id },
    data: {
      status: "SUBMITTED_TO_FRANCHISE",
      locked: true,
      submittedAt: combined.status === "DRAFT" ? now : undefined,
      forwardedAt: now,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectedRemark: null
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_CENTER_LIST_SUBMIT",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: updated.id,
    metadata: { examCycleId }
  });

  return res.apiSuccess("Combined list submitted to franchise", updated);
});

const centerSetCombinedListItemIncluded = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const entryId = String(req.params.entryId);
  const centerNodeId = req.auth.hierarchyNodeId;
  const included = Boolean(req.body?.included);

  if (!centerNodeId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const combined = await getOrCreateCenterCombinedList({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerNodeId,
    actorUserId: req.auth.userId
  });

  if (combined.locked && combined.status !== "REJECTED") {
    return res.apiError(409, "Combined list is locked", "LIST_LOCKED");
  }

  const item = await prisma.examEnrollmentListItem.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      listId: combined.id,
      entryId
    },
    select: { listId: true, entryId: true, included: true }
  });

  if (!item) {
    return res.apiError(404, "Entry is not in combined list. Refresh combined list first.", "EXAM_LIST_ITEM_NOT_FOUND");
  }

  const updated = await prisma.examEnrollmentListItem.update({
    where: { listId_entryId: { listId: combined.id, entryId } },
    data: { included },
    select: { listId: true, entryId: true, included: true }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: included ? "EXAM_CENTER_LIST_ITEM_INCLUDE" : "EXAM_CENTER_LIST_ITEM_EXCLUDE",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: combined.id,
    metadata: { examCycleId, entryId, included }
  });

  return res.apiSuccess("Selection updated", updated);
});

const centerRejectTeacherList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = String(req.params.listId);
  const remark = req.body?.remark;

  const list = await prisma.examEnrollmentList.findFirst({
    where: {
      id: listId,
      tenantId: req.auth.tenantId,
      examCycleId,
      type: "TEACHER",
      hierarchyNodeId: req.auth.hierarchyNodeId
    },
    select: { id: true, status: true }
  });

  if (!list) {
    return res.apiError(404, "Teacher list not found", "EXAM_LIST_NOT_FOUND");
  }

  const updated = await rejectEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: "CENTER",
    remark
  });

  return res.apiSuccess("Teacher list rejected", updated.list);
});

const exportEnrollmentListCsv = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const listId = String(req.params.listId);

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: listId, tenantId: req.auth.tenantId, examCycleId },
    select: {
      id: true,
      type: true,
      status: true,
      hierarchyNodeId: true,
      teacherUserId: true,
      scopeKey: true,
      examCycle: { select: { code: true, name: true } },
      centerNode: { select: { code: true, name: true } }
    }
  });

  if (!list) {
    return res.apiError(404, "Enrollment list not found", "EXAM_LIST_NOT_FOUND");
  }

  // Scope enforcement
  if (req.auth.role === "TEACHER") {
    if (list.type !== "TEACHER" || list.teacherUserId !== req.auth.userId) {
      return res.apiError(403, "Forbidden", "HIERARCHY_SCOPE_DENIED");
    }
  } else if (req.auth.role === "CENTER") {
    if (!req.auth.hierarchyNodeId || list.hierarchyNodeId !== req.auth.hierarchyNodeId) {
      return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
    }
  } else if (req.auth.role === "FRANCHISE" || req.auth.role === "BP") {
    const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });
    if (scope.hierarchyNodeIds.length && !scope.hierarchyNodeIds.includes(list.hierarchyNodeId)) {
      return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
    }
  } else if (req.auth.role !== "SUPERADMIN") {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const full = await prisma.examEnrollmentList.findFirst({
    where: { id: list.id, tenantId: req.auth.tenantId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        ...(list.type === "CENTER_COMBINED" ? { where: { included: true } } : {}),
        include: {
          entry: {
            include: {
              student: { select: { admissionNo: true, firstName: true, lastName: true, isTemporaryExam: true } },
              enrolledLevel: { select: { name: true, rank: true } }
              ,
              sourceTeacherUser: {
                select: {
                  username: true,
                  teacherProfile: { select: { fullName: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  const headers = [
    { key: "examCode", label: "Exam Code" },
    { key: "examName", label: "Exam Name" },
    { key: "listType", label: "List Type" },
    { key: "listStatus", label: "List Status" },
    { key: "centerCode", label: "Center Code" },
    { key: "centerName", label: "Center Name" },
    { key: "teacherCode", label: "Teacher Code" },
    { key: "teacherName", label: "Teacher Name" },
    { key: "studentCode", label: "Student Code" },
    { key: "studentName", label: "Student Name" },
    { key: "temporary", label: "Temporary" },
    { key: "level", label: "Level" }
  ];

  const rows = (full?.items || []).map((item) => {
    const s = item?.entry?.student;
    const lvl = item?.entry?.enrolledLevel;
    const t = item?.entry?.sourceTeacherUser;
    const teacherCode = t?.username || "";
    const teacherName = t?.teacherProfile?.fullName || teacherCode;
    return {
      examCode: list.examCycle?.code || "",
      examName: list.examCycle?.name || "",
      listType: list.type,
      listStatus: list.status,
      centerCode: list.centerNode?.code || "",
      centerName: list.centerNode?.name || "",
      teacherCode,
      teacherName,
      studentCode: s?.admissionNo || "",
      studentName: s ? `${s.firstName} ${s.lastName}`.trim() : "",
      temporary: s?.isTemporaryExam ? "YES" : "NO",
      level: lvl ? `${lvl.name} (${lvl.rank})` : ""
    };
  });

  const csv = toCsv({ headers, rows });
  const filename = `exam_enrollment_${list.examCycle?.code || examCycleId}_${list.type}_${list.id}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

async function buildExamResultsPayload({ tenantId, actor, examCycleId, query = {} }) {
  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId },
  select: { id: true, resultStatus: true, isArchived: true, businessPartnerId: true }
  });

  if (!examCycle) {
    const error = new Error("Exam cycle not found");
    error.statusCode = 404;
    error.errorCode = "EXAM_CYCLE_NOT_FOUND";
    throw error;
  }

  const scope = await resolveActorExamScope({ tenantId, actor });

  if (actor.role !== "SUPERADMIN" && scope.businessPartnerId && examCycle.businessPartnerId !== scope.businessPartnerId) {
    const error = new Error("Hierarchy scope denied");
    error.statusCode = 403;
    error.errorCode = "HIERARCHY_SCOPE_DENIED";
    throw error;
  }

  if (actor.role !== "SUPERADMIN" && examCycle.resultStatus !== "PUBLISHED") {
    const error = new Error("Results are not published");
    error.statusCode = 403;
    error.errorCode = "RESULTS_NOT_PUBLISHED";
    throw error;
  }

  const approvedCombinedLists = await prisma.examEnrollmentList.findMany({
    where: {
      tenantId,
      examCycleId,
      type: "CENTER_COMBINED",
      status: "APPROVED"
    },
    select: { id: true }
  });

  const listIds = approvedCombinedLists.map((l) => l.id);

  const itemWhere = {
    tenantId,
    listId: { in: listIds },
    included: true
  };

  if (actor.role === "CENTER" || actor.role === "TEACHER") {
    itemWhere.entry = { is: { student: { is: { hierarchyNodeId: actor.hierarchyNodeId } } } };
  } else if (actor.role === "FRANCHISE" || actor.role === "BP") {
    const nodeIds = scope.hierarchyNodeIds;
    if (nodeIds.length) {
      itemWhere.entry = { is: { student: { is: { hierarchyNodeId: { in: nodeIds } } } } };
    }
  }

  if (actor.role === "TEACHER") {
    itemWhere.entry = { is: { ...(itemWhere.entry?.is || {}), sourceTeacherUserId: actor.userId } };
  }

  const teacherSelect = {
    id: true,
    username: true,
    teacherProfile: { select: { fullName: true } }
  };
  const studentSelect = {
    id: true,
    admissionNo: true,
    firstName: true,
    lastName: true,
    currentTeacherUserId: true,
    currentTeacher: { select: teacherSelect },
    batchEnrollments: {
      where: { tenantId, status: "ACTIVE" },
      select: {
        assignedTeacherUserId: true,
        assignedTeacher: { select: teacherSelect }
      },
      orderBy: { createdAt: "desc" },
      take: 1
    }
  };
  const enrollmentEntrySelect = {
    id: true,
    studentId: true,
    enrolledLevelId: true,
    isTemporary: true,
    allowSecondAttempt: true,
    attemptOverride: true,
    secondAttemptGrantedAt: true,
    secondAttemptGrantedByUserId: true,
    sourceTeacherUserId: true,
    enrolledLevel: { select: { id: true, name: true, rank: true } },
    sourceTeacherUser: { select: teacherSelect },
    student: {
      select: {
        ...studentSelect,
        hierarchyNodeId: true
      }
    }
  };

  const items = listIds.length
    ? await prisma.examEnrollmentListItem.findMany({
        where: itemWhere,
        select: {
          list: {
            select: {
              hierarchyNodeId: true,
              centerNode: { select: { id: true, code: true, name: true } }
            }
          },
          entry: {
            select: enrollmentEntrySelect
          }
        },
        orderBy: { createdAt: "asc" }
      })
    : [];

  const approvedLateRows = await prisma.examLateEnrollmentStudent.findMany({
    where: buildScopedLateEnrollmentWhere({ tenantId, examCycleId, actor, scope }),
    select: {
      id: true,
      studentId: true,
      levelId: true,
      approvedAt: true,
      request: {
        select: {
          id: true,
          centerId: true,
          centerNode: { select: { id: true, code: true, name: true } }
        }
      },
      level: { select: { id: true, name: true, rank: true } },
      student: { select: studentSelect }
    },
    orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }]
  });

  const lateStudentIds = Array.from(new Set(approvedLateRows.map((row) => row.studentId).filter(Boolean)));
  const lateEntryRows = lateStudentIds.length
    ? await prisma.examEnrollmentEntry.findMany({
        where: {
          tenantId,
          examCycleId,
          studentId: { in: lateStudentIds }
        },
        select: enrollmentEntrySelect
      })
    : [];
  const lateEntryByStudentId = new Map(lateEntryRows.map((entry) => [entry.studentId, entry]));

  const byCandidateKey = new Map();
  for (const item of items) {
    if (item.entry?.studentId) {
      const key = `${item.entry.studentId}:${item.entry.enrolledLevelId || ""}`;
      if (!byCandidateKey.has(key)) {
        byCandidateKey.set(key, { ...item, isLateEnrollment: false });
      }
    }
  }

  for (const lateRow of approvedLateRows) {
    const lateEntry = lateEntryByStudentId.get(lateRow.studentId);
    const fallbackTeacher =
      lateRow.student?.currentTeacher ||
      lateRow.student?.batchEnrollments?.[0]?.assignedTeacher ||
      null;
    const fallbackTeacherUserId =
      lateRow.student?.currentTeacherUserId ||
      lateRow.student?.batchEnrollments?.[0]?.assignedTeacherUserId ||
      null;
    const lateLevelId = lateEntry?.enrolledLevelId || lateRow.levelId;
    const key = `${lateRow.studentId}:${lateLevelId || ""}`;

    if (byCandidateKey.has(key)) {
      continue;
    }

    byCandidateKey.set(key, {
      isLateEnrollment: true,
      lateEnrollmentStudentId: lateRow.id,
      lateEnrollmentRequestId: lateRow.request?.id || null,
      lateEnrollmentApprovedAt: lateRow.approvedAt || null,
      list: {
        hierarchyNodeId: lateRow.request?.centerId || null,
        centerNode: lateRow.request?.centerNode || null
      },
      entry: {
        id: lateEntry?.id || `late:${lateRow.id}`,
        studentId: lateRow.studentId,
        enrolledLevelId: lateLevelId,
        isTemporary: Boolean(lateEntry?.isTemporary),
        sourceTeacherUserId: lateEntry?.sourceTeacherUserId || fallbackTeacherUserId || null,
        enrolledLevel: lateEntry?.enrolledLevel || lateRow.level || null,
        sourceTeacherUser: lateEntry?.sourceTeacherUser || fallbackTeacher,
        student: lateEntry?.student || lateRow.student || null
      }
    });
  }

  const scopedItems = Array.from(byCandidateKey.values());
  const entries = scopedItems.map((i) => i.entry).filter(Boolean);
  const studentIds = Array.from(new Set(entries.map((e) => e.studentId).filter(Boolean)));

  const submissions = studentIds.length
    ? await prisma.worksheetSubmission.findMany({
        where: {
          tenantId,
          studentId: { in: studentIds },
          worksheet: {
            is: {
              examCycleId,
              generationMode: "EXAM"
            }
          }
        },
        select: {
          id: true,
          studentId: true,
          status: true,
          attemptNo: true,
          score: true,
          correctCount: true,
          submittedAnswers: true,
          totalQuestions: true,
          completionTimeSeconds: true,
          finalSubmittedAt: true,
          submittedAt: true,
          createdAt: true,
          updatedAt: true,
          remarks: true,
          worksheet: {
            select: {
              id: true,
              levelId: true,
              timeLimitSeconds: true,
              questions: {
                select: {
                  id: true,
                  questionBankId: true,
                  questionNumber: true,
                  operands: true,
                  operation: true,
                  correctAnswer: true
                }
              }
            }
          }
        }
      })
    : [];

  const submissionsByStudentAndLevel = new Map();
  const submissionsByStudent = new Map();
  for (const submission of submissions) {
    const levelId = submission.worksheet?.levelId || "";
    const studentBucket = submissionsByStudent.get(submission.studentId) || [];
    studentBucket.push(submission);
    submissionsByStudent.set(submission.studentId, studentBucket);
    if (levelId) {
      const key = `${submission.studentId}:${levelId}`;
      const bucket = submissionsByStudentAndLevel.get(key) || [];
      bucket.push(submission);
      submissionsByStudentAndLevel.set(key, bucket);
    }
  }

  const sortSubmissions = (bucket) => {
    bucket.sort((a, b) => {
      const aAttemptNo = Number(a.attemptNo || 1);
      const bAttemptNo = Number(b.attemptNo || 1);
      if (aAttemptNo !== bAttemptNo) return bAttemptNo - aAttemptNo;
      const aFinal = a.finalSubmittedAt ? 1 : 0;
      const bFinal = b.finalSubmittedAt ? 1 : 0;
      if (aFinal !== bFinal) return bFinal - aFinal;
      const aTime = new Date(a.finalSubmittedAt || a.submittedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.finalSubmittedAt || b.submittedAt || b.createdAt || 0).getTime();
      if (aTime !== bTime) return bTime - aTime;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  };

  for (const bucket of submissionsByStudentAndLevel.values()) sortSubmissions(bucket);
  for (const bucket of submissionsByStudent.values()) sortSubmissions(bucket);

  const now = new Date();
  const results = scopedItems.map((item) => {
    const e = item.entry;
    const candidates = submissionsByStudentAndLevel.get(`${e.studentId}:${e.enrolledLevelId}`) || [];
    const sub = candidates[0] || null;
    const fallbackSub = sub ? null : (submissionsByStudent.get(e.studentId) || []).find((candidate) => candidate.finalSubmittedAt) || null;
    const attempt1 = candidates.find((candidate) => Number(candidate.attemptNo || 1) === 1) || null;
    const attempt2 = candidates.find((candidate) => Number(candidate.attemptNo || 1) === 2) || null;
    const hasAttempt1 = Boolean(attempt1);
    const hasAttempt2 = Boolean(attempt2);
    const secondAttemptGranted = Boolean(
      e.secondAttemptGrantedAt ||
        e.allowSecondAttempt ||
        e.attemptOverride === "SECOND_ATTEMPT_GRANTED"
    );
    const canGrantSecondAttempt = Boolean(
      actor.role === "SUPERADMIN" &&
        hasAttempt1 &&
        !hasAttempt2 &&
        !secondAttemptGranted &&
        examCycle.resultStatus !== "PUBLISHED" &&
        !examCycle.isArchived
    );
    const canRevokeSecondAttempt = Boolean(
      actor.role === "SUPERADMIN" &&
        secondAttemptGranted &&
        !hasAttempt2 &&
        examCycle.resultStatus !== "PUBLISHED" &&
        !examCycle.isArchived
    );
    const statusSubmission = sub || fallbackSub;
    const hasLevelMismatchSubmission = Boolean(!sub && fallbackSub);
    const finalizedMatches = candidates.filter((candidate) => candidate.finalSubmittedAt);
    const finalizedAttemptNoCounts = finalizedMatches.reduce((acc, candidate) => {
      const attemptNo = Number(candidate.attemptNo || 1);
      acc.set(attemptNo, (acc.get(attemptNo) || 0) + 1);
      return acc;
    }, new Map());
    const hasDuplicateFinalizedAttemptNo = Array.from(finalizedAttemptNoCounts.values()).some((count) => count > 1);
    const hasAttemptLimitViolation = candidates.some((candidate) => Number(candidate.attemptNo || 1) > 2);
    const candidateStatus = deriveCandidateStatus(statusSubmission, { now });
    const metricResolution = resolveExamResultMetricsForSubmission({
      submission: sub,
      candidateStatus
    });
    const resolvedCorrectCount = metricResolution.resolvedCorrectCount;
    const resolvedTotalQuestions = metricResolution.resolvedTotalQuestions;
    const resolvedWrongCount = metricResolution.resolvedWrongCount;
    const resolvedUnansweredCount = metricResolution.resolvedUnansweredCount;
    const resolvedPercentage = metricResolution.resolvedPercentage;
    const resolvedScore = metricResolution.resolvedScore;
    const resolvedAnsweredCount = metricResolution.resolvedAnsweredCount;
    const resolvedCompletionTime = resolveCompletionTimeSecondsFromSubmission({
      submission: sub,
      candidateStatus,
      answeredCount: resolvedAnsweredCount
    });
    const teacher =
      e.sourceTeacherUser ||
      e.student?.currentTeacher ||
      e.student?.batchEnrollments?.[0]?.assignedTeacher ||
      null;
    const teacherUserId =
      e.sourceTeacherUserId ||
      e.student?.currentTeacherUserId ||
      e.student?.batchEnrollments?.[0]?.assignedTeacherUserId ||
      null;
    const teacherName = teacher?.teacherProfile?.fullName || teacher?.username || null;
    const centerNode = item.list?.centerNode || null;

    return {
      studentId: e.studentId,
      admissionNo: e.student?.admissionNo || null,
      studentName: `${e.student?.firstName || ""} ${e.student?.lastName || ""}`.trim(),
      enrolledLevelId: e.enrolledLevelId,
      levelName: e.enrolledLevel?.name || null,
      levelRank: e.enrolledLevel?.rank ?? null,
      teacherUserId,
      teacherName,
      teacherCode: teacher?.username || null,
      centerNodeId: centerNode?.id || item.list?.hierarchyNodeId || null,
      centerName: centerNode?.name || null,
      centerCode: centerNode?.code || null,
      isTemporaryCandidate: Boolean(e.isTemporary),
      isLateEnrollment: Boolean(item.isLateEnrollment),
      enrollmentEntryId: e.id,
      activeAttemptNo: toNullableNumber(statusSubmission?.attemptNo),
      secondAttemptGranted,
      attempt2Status: attempt2 ? deriveCandidateStatus(attempt2, { now }) : null,
      canGrantSecondAttempt,
      canRevokeSecondAttempt,
      candidateStatus,
      resultOutcome: deriveResultOutcome({ candidateStatus, percentage: resolvedPercentage }),
      rank: null,
      score: resolvedScore,
      percentage: resolvedPercentage,
      correctCount: resolvedCorrectCount,
      wrongCount: resolvedWrongCount,
      unansweredCount: resolvedUnansweredCount,
      totalQuestions: resolvedTotalQuestions,
      completionTimeSeconds: resolvedCompletionTime,
      submittedAt: statusSubmission?.finalSubmittedAt ?? null,
      worksheetId: sub?.worksheet?.id ?? null,
      resultConflict: hasDuplicateFinalizedAttemptNo || hasLevelMismatchSubmission || hasAttemptLimitViolation,
      resultConflictReason: hasLevelMismatchSubmission
        ? "LEVEL_MISMATCH_SUBMISSION"
        : hasAttemptLimitViolation
          ? "ATTEMPT_LIMIT_EXCEEDED"
          : hasDuplicateFinalizedAttemptNo
            ? "DUPLICATE_FINALIZED_ATTEMPT"
            : null
    };
  });

  const rankedResults = assignExamResultRanks(results);

  return {
    status: examCycle.resultStatus,
    resultRules: EXAM_RESULT_RULES,
    results: applyExamResultFiltersAndSort(rankedResults, query)
  };
}

const grantSecondAttemptToStudent = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const studentId = String(req.params.studentId);

  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: {
      id: examCycleId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      resultStatus: true,
      isArchived: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (examCycle.isArchived) {
    return res.apiError(409, "Archived exam cycle cannot be modified", "EXAM_CYCLE_ARCHIVED");
  }

  if (examCycle.resultStatus === "PUBLISHED") {
    return res.apiError(409, "Published results cannot be modified", "EXAM_RESULTS_PUBLISHED");
  }

  const entry = await prisma.examEnrollmentEntry.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      examCycleId,
      studentId
    },
    select: {
      id: true,
      enrolledLevelId: true,
      allowSecondAttempt: true,
      attemptOverride: true,
      secondAttemptGrantedAt: true,
      secondAttemptGrantedByUserId: true
    }
  });

  if (!entry) {
    return res.apiError(404, "Enrollment not found", "EXAM_ENROLLMENT_NOT_FOUND");
  }

  if (
    entry.allowSecondAttempt ||
    entry.secondAttemptGrantedAt ||
    entry.attemptOverride === "SECOND_ATTEMPT_GRANTED"
  ) {
    return res.apiError(409, "Second attempt already granted", "SECOND_ATTEMPT_ALREADY_GRANTED");
  }

  const assignedExamWorksheet = await prisma.worksheetAssignment.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      studentId,
      isActive: true,
      worksheet: {
        is: {
          tenantId: req.auth.tenantId,
          examCycleId,
          generationMode: "EXAM",
          levelId: entry.enrolledLevelId
        }
      }
    },
    select: {
      worksheetId: true
    }
  });

  if (!assignedExamWorksheet?.worksheetId) {
    return res.apiError(409, "Assigned exam worksheet not found", "EXAM_WORKSHEET_NOT_ASSIGNED");
  }

  const attempts = await prisma.worksheetSubmission.findMany({
    where: {
      tenantId: req.auth.tenantId,
      studentId,
      worksheetId: assignedExamWorksheet.worksheetId
    },
    select: {
      attemptNo: true
    }
  });

  const hasAttempt1 = attempts.some((attempt) => Number(attempt.attemptNo || 1) === 1);
  const hasAttempt2 = attempts.some((attempt) => Number(attempt.attemptNo || 1) >= 2);

  if (!hasAttempt1) {
    return res.apiError(409, "Attempt 1 not found", "FIRST_ATTEMPT_REQUIRED");
  }

  if (hasAttempt2) {
    return res.apiError(409, "Attempt 2 already exists", "SECOND_ATTEMPT_ALREADY_EXISTS");
  }

  const updated = await prisma.examEnrollmentEntry.update({
    where: { id: entry.id },
    data: {
      allowSecondAttempt: true,
      attemptOverride: "SECOND_ATTEMPT_GRANTED",
      secondAttemptGrantedAt: new Date(),
      secondAttemptGrantedByUserId: req.auth.userId
    },
    select: {
      id: true,
      allowSecondAttempt: true,
      attemptOverride: true,
      secondAttemptGrantedAt: true,
      secondAttemptGrantedByUserId: true
    }
  });

  return res.apiSuccess("Second attempt granted", updated);
});

const revokeSecondAttemptFromStudent = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const studentId = String(req.params.studentId);

  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: {
      id: examCycleId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      resultStatus: true,
      isArchived: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (examCycle.isArchived) {
    return res.apiError(409, "Archived exam cycle cannot be modified", "EXAM_CYCLE_ARCHIVED");
  }

  if (examCycle.resultStatus === "PUBLISHED") {
    return res.apiError(409, "Published results cannot be modified", "EXAM_RESULTS_PUBLISHED");
  }

  const entry = await prisma.examEnrollmentEntry.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      examCycleId,
      studentId
    },
    select: {
      id: true,
      allowSecondAttempt: true,
      attemptOverride: true,
      secondAttemptGrantedAt: true
    }
  });

  if (!entry) {
    return res.apiError(404, "Enrollment not found", "EXAM_ENROLLMENT_NOT_FOUND");
  }

  const hasGrant = Boolean(
    entry.allowSecondAttempt ||
      entry.secondAttemptGrantedAt ||
      entry.attemptOverride === "SECOND_ATTEMPT_GRANTED"
  );

  if (!hasGrant) {
    return res.apiError(409, "Second attempt grant not found", "SECOND_ATTEMPT_NOT_GRANTED");
  }

  const hasAttempt2 = await prisma.worksheetSubmission.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      studentId,
      attemptNo: { gte: 2 },
      worksheet: {
        is: {
          tenantId: req.auth.tenantId,
          examCycleId,
          generationMode: "EXAM"
        }
      }
    },
    select: { id: true }
  });

  if (hasAttempt2) {
    return res.apiError(409, "Attempt 2 already started", "SECOND_ATTEMPT_ALREADY_STARTED");
  }

  const updated = await prisma.examEnrollmentEntry.update({
    where: { id: entry.id },
    data: {
      allowSecondAttempt: false,
      attemptOverride: null,
      secondAttemptGrantedAt: null,
      secondAttemptGrantedByUserId: null
    },
    select: {
      id: true,
      allowSecondAttempt: true,
      attemptOverride: true,
      secondAttemptGrantedAt: true,
      secondAttemptGrantedByUserId: true
    }
  });

  return res.apiSuccess("Second attempt revoked", updated);
});

async function buildExamResultReviewSummary({ tenantId, examCycleId, actor }) {
  const [examCycle, payload] = await Promise.all([
    prisma.examCycle.findFirst({
      where: { id: examCycleId, tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        resultStatus: true,
        resultPublishedAt: true,
        resultPublishedByUserId: true,
        examStartsAt: true,
        examEndsAt: true,
        businessPartnerId: true,
        businessPartner: { select: { id: true, code: true, name: true } }
      }
    }),
    buildExamResultsPayload({
      tenantId,
      actor,
      examCycleId
    })
  ]);

  if (!examCycle) {
    const error = new Error("Exam cycle not found");
    error.statusCode = 404;
    error.errorCode = "EXAM_CYCLE_NOT_FOUND";
    throw error;
  }

  const results = payload.results || [];
  const appeared = results.filter((row) => row.candidateStatus !== "ABSENT");
  const absentCount = results.filter((row) => row.candidateStatus === "ABSENT").length;
  const inProgressCount = results.filter((row) => row.candidateStatus === "IN_PROGRESS").length;
  const timedOutCount = results.filter((row) => row.candidateStatus === "TIMED_OUT").length;
  const scored = results.filter((row) => row.percentage !== null && row.percentage !== undefined);
  const rankedCount = results.filter((row) => row.rank !== null && row.rank !== undefined).length;
  const lateEnrollmentCount = results.filter((row) => row.isLateEnrollment).length;
  const totalScore = scored.reduce((sum, row) => sum + Number(row.percentage || 0), 0);
  const avgScore = scored.length ? Number((totalScore / scored.length).toFixed(2)) : 0;
  const avgCompletionTimeSeconds = computeAverageCompletionTimeSeconds(results);

  const levelWiseMap = new Map();
  for (const row of results) {
    const levelId = row.enrolledLevelId || "UNASSIGNED";

    if (!levelWiseMap.has(levelId)) {
      levelWiseMap.set(levelId, {
        levelId,
        levelName: row.levelName || "Unassigned",
        levelRank: row.levelRank ?? null,
        total: 0,
        appeared: 0,
        absent: 0,
        scored: 0,
        ranked: 0,
        lateEnrollment: 0,
        inProgress: 0,
        timedOut: 0,
        totalScore: 0
      });
    }

    const bucket = levelWiseMap.get(levelId);
    bucket.total += 1;

    if (row.isLateEnrollment) {
      bucket.lateEnrollment += 1;
    }

    if (row.candidateStatus === "ABSENT") {
      bucket.absent += 1;
      continue;
    }

    bucket.appeared += 1;
    if (row.percentage !== null && row.percentage !== undefined) {
      bucket.totalScore += Number(row.percentage || 0);
      bucket.scored += 1;
    }
    if (row.rank !== null && row.rank !== undefined) {
      bucket.ranked += 1;
    }
    if (row.candidateStatus === "IN_PROGRESS") {
      bucket.inProgress += 1;
    }
    if (row.candidateStatus === "TIMED_OUT") {
      bucket.timedOut += 1;
    }
  }

  const levelWise = Array.from(levelWiseMap.values())
    .map((bucket) => ({
      levelId: bucket.levelId,
      levelName: bucket.levelName,
      levelRank: bucket.levelRank,
      total: bucket.total,
      appeared: bucket.appeared,
      absent: bucket.absent,
      scored: bucket.scored,
      ranked: bucket.ranked,
      lateEnrollment: bucket.lateEnrollment,
      inProgress: bucket.inProgress,
      timedOut: bucket.timedOut,
      avgScore: bucket.scored ? Number((bucket.totalScore / bucket.scored).toFixed(2)) : 0
    }))
    .sort((a, b) => {
      const rankA = Number(a.levelRank ?? Number.MAX_SAFE_INTEGER);
      const rankB = Number(b.levelRank ?? Number.MAX_SAFE_INTEGER);
      if (rankA !== rankB) return rankA - rankB;
      return String(a.levelName || "").localeCompare(String(b.levelName || ""));
    });

  const topPerformers = appeared
    .filter((row) => row.percentage !== null && row.percentage !== undefined)
    .map((row) => ({
      studentId: row.studentId,
      admissionNo: row.admissionNo,
      studentName: row.studentName,
      score: Number(row.percentage || 0),
      rank: row.rank ?? null,
      correctCount: row.correctCount ?? null,
      totalQuestions: row.totalQuestions ?? null,
      completionTimeSeconds: row.completionTimeSeconds ?? null,
      levelId: row.enrolledLevelId || null,
      levelName: row.levelName || null
    }))
    .sort((a, b) => {
      const rankA = Number(a.rank ?? Number.MAX_SAFE_INTEGER);
      const rankB = Number(b.rank ?? Number.MAX_SAFE_INTEGER);
      if (rankA !== rankB) return rankA - rankB;
      return b.score - a.score || String(a.studentName || "").localeCompare(String(b.studentName || ""));
    })
    .slice(0, 10);

  return {
    examCycle,
    publication: {
      status: payload.status,
      canPublish: payload.status === "READY_FOR_REVIEW" || payload.status === "LOCKED",
      canUnpublish: payload.status === "PUBLISHED",
      resultPublishedAt: examCycle.resultPublishedAt,
      resultPublishedByUserId: examCycle.resultPublishedByUserId
    },
    summary: {
      totalCandidates: results.length,
      appearedCount: appeared.length,
      absentCount,
      scoredCount: scored.length,
      rankedCount,
      lateEnrollmentCount,
      inProgressCount,
      timedOutCount,
      avgScore,
      avgCompletionTimeSeconds
    },
    resultRules: payload.resultRules || EXAM_RESULT_RULES,
    topPerformers,
    levelWise,
    rows: results
  };
}

const listExamResultsControlCenter = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);
  const statusFilter = String(req.query?.status || "ALL").trim().toUpperCase();
  const q = String(req.query?.q || "").trim();

  const where = {
    tenantId: req.auth.tenantId,
    ...(statusFilter && statusFilter !== "ALL" ? { resultStatus: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q } },
            { name: { contains: q } }
          ]
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.examCycle.findMany({
      where,
      orderBy: orderBy || { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        code: true,
        name: true,
        examStartsAt: true,
        examEndsAt: true,
        resultStatus: true,
        resultPublishAt: true,
        resultPublishedAt: true,
        resultPublishedByUserId: true,
        businessPartner: { select: { id: true, code: true, name: true } },
        publishedByUser: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        _count: {
          select: {
            enrollmentEntries: true,
            resultPublicationAudits: true
          }
        }
      }
    }),
    prisma.examCycle.count({ where })
  ]);

  const enriched = await Promise.all(
    items.map(async (cycle) => {
      const [enrollmentCounts, reviewSummary] = await Promise.all([
        getEnrollmentCounts({
          tenantId: req.auth.tenantId,
          examCycleId: cycle.id
        }),
        buildExamResultReviewSummary({
          tenantId: req.auth.tenantId,
          examCycleId: cycle.id,
          actor: req.auth
        })
      ]);

      return {
        ...cycle,
        enrollmentCounts,
        metrics: {
          enrolledCount: cycle._count.enrollmentEntries,
          totalCandidates: Number(reviewSummary?.summary?.totalCandidates || 0),
          appearedCount: Number(reviewSummary?.summary?.appearedCount || 0),
          scoredCount: Number(reviewSummary?.summary?.scoredCount || 0),
          publicationEvents: cycle._count.resultPublicationAudits
        },
        publication: {
          canPublish: cycle.resultStatus === "READY_FOR_REVIEW" || cycle.resultStatus === "LOCKED",
          canUnpublish: cycle.resultStatus === "PUBLISHED"
        }
      };
    })
  );

  return res.apiSuccess("Exam result control center", {
    items: enriched,
    total,
    limit,
    offset,
    status: statusFilter
  });
});

const getExamResultsReview = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const payload = await buildExamResultReviewSummary({
    tenantId: req.auth.tenantId,
    examCycleId,
    actor: req.auth
  });
  return res.apiSuccess("Exam result review summary", payload);
});

const getExamResultPublicationAuditTrail = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);

  const cycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true }
  });

  if (!cycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const audits = await prisma.examResultPublicationAudit.findMany({
    where: {
      tenantId: req.auth.tenantId,
      examCycleId
    },
    orderBy: { actedAt: "desc" },
    include: {
      actedByUser: {
        select: {
          id: true,
          username: true,
          email: true,
          role: true
        }
      }
    }
  });

  return res.apiSuccess("Exam result publication audit trail", audits);
});

const listPendingEnrollmentLists = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });

  const statusByRole = {
    FRANCHISE: "SUBMITTED_TO_FRANCHISE",
    BP: "SUBMITTED_TO_BUSINESS_PARTNER",
    SUPERADMIN: "SUBMITTED_TO_SUPERADMIN"
  };

  const desiredStatus = statusByRole[req.auth.role];
  if (!desiredStatus) {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const where = {
    tenantId: req.auth.tenantId,
    examCycleId,
    type: "CENTER_COMBINED",
    status: desiredStatus
  };

  if (req.auth.role !== "SUPERADMIN") {
    if (!scope.hierarchyNodeIds.length) {
      // If scope nodes not computed, fall back to actor node.
      where.hierarchyNodeId = req.auth.hierarchyNodeId || undefined;
    } else {
      where.hierarchyNodeId = { in: scope.hierarchyNodeIds };
    }
  }

  const lists = await prisma.examEnrollmentList.findMany({
    where,
    orderBy: { forwardedAt: "asc" },
    include: {
      centerNode: { select: { id: true, name: true, code: true, type: true } },
      _count: { select: { items: { where: { included: true } } } }
    }
  });

  const enrichedLists = await Promise.all(
    lists.map(async (l) => {
      const levelBreakdown = await getExamCycleLevels({
        tenantId: req.auth.tenantId,
        examCycleId,
        listId: l.id
      });

      let assessmentScope = {
        canConfigureAssessment: false,
        scopeError: "Exam cycle assessment scope is not configured"
      };

      try {
        const scope = await resolvePendingAssessmentScope({
          tenantId: req.auth.tenantId,
          examCycleId,
          listId: l.id
        });

        assessmentScope = {
          canConfigureAssessment: true,
          examCourseId: scope.examCourseContext.courseId,
          examLevelNumber: scope.examCourseContext.levelNumber,
          examCourseLevelId: scope.examCourseContext.courseLevelId,
          mappedLevelId: scope.examCourseContext.mappedLevelId,
          scopedLevelNumbers: Array.from(
            new Set(
              Object.values(scope.levelScopeByLevelId || {})
                .map((entry) => Number(entry?.levelNumber))
                .filter((rank) => Number.isInteger(rank) && rank > 0)
            )
          )
        };
      } catch (scopeError) {
        assessmentScope = {
          canConfigureAssessment: false,
          scopeError: scopeError?.errorCode === "EXAM_ASSESSMENT_SCOPE_NOT_CONFIGURED"
            ? "Exam cycle assessment scope is not configured"
            : (scopeError?.message || "Exam cycle assessment scope is not configured"),
          errorCode: scopeError?.errorCode || "EXAM_ASSESSMENT_SCOPE_NOT_CONFIGURED"
        };
      }

      return {
        ...l,
        entriesCount: l._count?.items ?? 0,
        _count: undefined,
        levelBreakdown,
        assessmentScope
      };
    })
  );

  return res.apiSuccess("Pending lists", enrichedLists);
});

async function getRequiredLevelIdsForList({ tenantId, examCycleId, listId }) {
  const items = await prisma.examEnrollmentListItem.findMany({
    where: {
      tenantId,
      listId,
      included: true,
      list: {
        is: {
          id: listId,
          examCycleId,
          tenantId,
          type: "CENTER_COMBINED"
        }
      }
    },
    select: {
      entry: { select: { enrolledLevelId: true } }
    }
  });

  return Array.from(new Set(items.map((item) => item.entry?.enrolledLevelId).filter(Boolean)));
}

const getEnrollmentListLevelBreakdown = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const listId = String(req.params.listId);
  const tenantId = req.auth.tenantId;

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: listId, tenantId, examCycleId, type: "CENTER_COMBINED" },
    select: { id: true }
  });

  if (!list) {
    return res.apiError(404, "List not found", "EXAM_LIST_NOT_FOUND");
  }

  const breakdown = await getExamCycleLevels({ tenantId, examCycleId, listId });

  return res.apiSuccess("Level breakdown", breakdown);
});

const getExamCycleLevelsForAssessment = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = req.query?.listId ? String(req.query.listId) : null;
  const scope = await resolvePendingAssessmentScope({
    tenantId: req.auth.tenantId,
    examCycleId,
    listId,
    courseId: req.query?.courseId,
    levelNumber: req.query?.levelNumber
  });

  return res.apiSuccess("Exam cycle levels", scope.levels);
});

const getExamCycleAssessmentConfig = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = req.query?.listId ? String(req.query.listId) : null;
  const scope = await resolvePendingAssessmentScope({
    tenantId: req.auth.tenantId,
    examCycleId,
    listId,
    courseId: req.query?.courseId,
    levelNumber: req.query?.levelNumber,
    allowPartialLevels: true
  });
  const levelIds = Array.isArray(scope.configurableLevelIds) ? scope.configurableLevelIds : [];

  const [configs, worksheetsByLevelId, questionBanksByLevelId] = await Promise.all([
    getConfig({ tenantId: req.auth.tenantId, examCycleId, levelIds }),
    getLevelWorksheets({
      tenantId: req.auth.tenantId,
      levelIds,
      provenanceContext: {
        courseId: scope.examCourseContext.courseId,
        courseLevelId: scope.examCourseContext.courseLevelId,
        levelScopeByLevelId: scope.levelScopeByLevelId || {}
      }
    }),
    getLevelQuestionBanks({
      tenantId: req.auth.tenantId,
      levelIds,
      provenanceContext: {
        courseId: scope.examCourseContext.courseId,
        courseLevelId: scope.examCourseContext.courseLevelId,
        levelScopeByLevelId: scope.levelScopeByLevelId || {}
      }
    })
  ]);

  const worksheetScopeWarningsByLevelId = {};
  await Promise.all(
    scope.levels.map(async (level) => {
      const levelId = String(level?.levelId || "");
      const levelScope = scope.levelScopeByLevelId?.[levelId];
      if (!levelScope?.courseId || !levelScope?.courseLevelId) return;
      const worksheetOptions = Array.isArray(worksheetsByLevelId[levelId]) ? worksheetsByLevelId[levelId] : [];
      const unavailableWorksheet = worksheetOptions.find((worksheet) => worksheet?.unavailableReason);
      if (unavailableWorksheet?.unavailableReason) {
        worksheetScopeWarningsByLevelId[levelId] = unavailableWorksheet.unavailableReason;
      }
      if (worksheetOptions.length > 0) return;

      const draftWorksheetCount = await prisma.worksheet.count({
        where: {
          tenantId: req.auth.tenantId,
          levelId,
          courseId: levelScope.courseId,
          courseLevelId: levelScope.courseLevelId,
          examCycleId: null,
          isPublished: false
        }
      });

      if (draftWorksheetCount > 0) {
        worksheetScopeWarningsByLevelId[levelId] = "Worksheet exists but is draft/unpublished. Publish it before approval.";
      }
    })
  );

  const levels = scope.levels.map((level) => {
    const levelId = String(level?.levelId || "");
    const levelScope = scope.levelScopeByLevelId?.[levelId] || null;
    return {
      ...level,
      canConfigureAssessment: Boolean(levelScope),
      examLevelNumber: levelScope?.levelNumber ?? null,
      examCourseLevelId: levelScope?.courseLevelId ?? null,
      scopeError: levelScope
        ? null
        : `Exam course Level ${String(level?.levelRank ?? "") || "?"} is not configured. Create Level ${String(level?.levelRank ?? "") || "?"} under Exam Course before approval.`
    };
  });

  const configuredLevels = new Set(configs.map((config) => config.levelId));
  const isComplete = levels.length > 0 && levels.every((level) => {
    if (!level?.canConfigureAssessment) {
      return false;
    }
    return configuredLevels.has(level.levelId);
  });

  return res.apiSuccess("Assessment config fetched", {
    levels,
    configs,
    worksheetsByLevelId,
    questionBanksByLevelId,
    worksheetScopeWarningsByLevelId,
    isComplete
  });
});

const saveExamCycleAssessmentConfig = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = req.body?.listId ? String(req.body.listId) : req.query?.listId ? String(req.query.listId) : null;
  const scope = await resolvePendingAssessmentScope({
    tenantId: req.auth.tenantId,
    examCycleId,
    listId,
    courseId: req.body?.courseId || req.query?.courseId,
    levelNumber: req.body?.levelNumber || req.query?.levelNumber,
    allowPartialLevels: true
  });

  const allowedLevelIds = Array.isArray(scope.configurableLevelIds) ? scope.configurableLevelIds : [];
  if (!allowedLevelIds.length) {
    return res.apiError(409, "Selected exam course has no configured participating levels", "EXAM_LEVEL_NOT_IN_SCOPE");
  }

  const submittedConfigs = Array.isArray(req.body?.configs) ? req.body.configs : [];
  const allowedLevelIdSet = new Set(allowedLevelIds.map((levelId) => String(levelId)));
  const validConfigs = submittedConfigs.filter((config) => allowedLevelIdSet.has(String(config?.levelId || "")));

  if (!validConfigs.length) {
    return res.apiError(409, "No valid level configurations to save for selected exam course", "EXAM_ASSESSMENT_LEVEL_INVALID");
  }

  const saved = await saveConfig({
    tenantId: req.auth.tenantId,
    examCycleId,
    actorUserId: req.auth.userId,
    configs: validConfigs,
    allowedLevelIds,
    provenanceContext: {
      courseId: scope.examCourseContext.courseId,
      courseLevelId: scope.examCourseContext.courseLevelId,
      levelScopeByLevelId: scope.levelScopeByLevelId || {}
    }
  });

  const skippedLevels = Array.from(
    new Set(
      submittedConfigs
        .map((config) => String(config?.levelId || ""))
        .filter((levelId) => levelId && !allowedLevelIdSet.has(levelId))
    )
  );

  return res.apiSuccess("Assessment config saved", {
    saved,
    skippedLevels,
    missingLevels: scope.missingLevels || []
  });
});

const generateExamCycleQuestionSet = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const studentId = String(req.body?.studentId || "").trim();
  const requestedLevelId = String(req.body?.levelId || "").trim();
  const scope = await resolvePendingAssessmentScope({
    tenantId: req.auth.tenantId,
    examCycleId,
    courseId: req.body?.courseId || req.query?.courseId,
    levelNumber: req.body?.levelNumber || req.query?.levelNumber
  });

  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const enrollment = await prisma.examEnrollmentEntry.findUnique({
    where: {
      tenantId_examCycleId_studentId: {
        tenantId: req.auth.tenantId,
        examCycleId,
        studentId
      }
    },
    select: {
      enrolledLevelId: true
    }
  });

  if (!enrollment?.enrolledLevelId) {
    return res.apiError(404, "Exam enrollment not found", "EXAM_ENROLLMENT_NOT_FOUND");
  }

  if (requestedLevelId && requestedLevelId !== enrollment.enrolledLevelId) {
    return res.apiError(409, "Requested level does not match enrolled exam level", "EXAM_LEVEL_MISMATCH");
  }

  if (enrollment.enrolledLevelId !== scope.examCourseContext.mappedLevelId) {
    return res.apiError(409, "Selected exam course level does not match enrolled exam level", "EXAM_LEVEL_MISMATCH");
  }

  const result = await generateQuestionSet({
    tenantId: req.auth.tenantId,
    examCycleId,
    studentId,
    levelId: enrollment.enrolledLevelId,
    provenanceContext: {
      courseId: scope.examCourseContext.courseId,
      courseLevelId: scope.examCourseContext.courseLevelId,
      levelScopeByLevelId: scope.levelScopeByLevelId || {}
    }
  });

  return res.apiSuccess("Question set generated", result);
});

const forwardPendingEnrollmentList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = String(req.params.listId);

  const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: listId, tenantId: req.auth.tenantId, examCycleId, type: "CENTER_COMBINED" },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!list) {
    return res.apiError(404, "List not found", "EXAM_LIST_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && scope.hierarchyNodeIds.length) {
    if (!scope.hierarchyNodeIds.includes(list.hierarchyNodeId)) {
      return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
    }
  }

  const result = await forwardEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_LIST_FORWARD",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: listId,
    metadata: { examCycleId, from: result.fromStatus, to: result.toStatus }
  });

  return res.apiSuccess("List forwarded", result.list);
});

const rejectPendingEnrollmentList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = String(req.params.listId);
  const remark = req.body?.remark;

  const scope = await resolveActorExamScope({ tenantId: req.auth.tenantId, actor: req.auth });

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: listId, tenantId: req.auth.tenantId, examCycleId, type: "CENTER_COMBINED" },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!list) {
    return res.apiError(404, "List not found", "EXAM_LIST_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && scope.hierarchyNodeIds.length) {
    if (!scope.hierarchyNodeIds.includes(list.hierarchyNodeId)) {
      return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
    }
  }

  const result = await rejectEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role,
    remark
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_LIST_REJECT",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: listId,
    metadata: { examCycleId }
  });

  return res.apiSuccess("List rejected", result.list);
});

const superadminApproveEnrollmentList = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const listId = String(req.params.listId);
  const scope = await resolvePendingAssessmentScope({
    tenantId: req.auth.tenantId,
    examCycleId,
    listId,
    courseId: req.body?.courseId || req.query?.courseId,
    levelNumber: req.body?.levelNumber || req.query?.levelNumber,
    allowPartialLevels: true
  });

  const requiredLevelIds = await getRequiredLevelIdsForList({
    tenantId: req.auth.tenantId,
    examCycleId,
    listId
  });
  if (!requiredLevelIds.length) {
    return res.apiError(409, "No enrolled students in list", "EXAM_LIST_EMPTY");
  }

  const missingRequiredLevel = requiredLevelIds
    .map((levelId) => String(levelId || ""))
    .find((levelId) => !scope.levelScopeByLevelId?.[levelId]);

  if (missingRequiredLevel) {
    const levelInfo = (scope.levels || []).find((level) => String(level?.levelId || "") === missingRequiredLevel);
    const rank = String(levelInfo?.levelRank ?? "").trim();
    const rankLabel = rank || "?";
    return res.apiError(
      409,
      `Exam course Level ${rankLabel} is not configured. Create Level ${rankLabel} under Exam Course before approval.`,
      "EXAM_LEVEL_NOT_IN_SCOPE"
    );
  }

  try {
    await validateConfig({
      tenantId: req.auth.tenantId,
      examCycleId,
      requiredLevelIds,
      provenanceContext: {
        courseId: scope.examCourseContext.courseId,
        courseLevelId: scope.examCourseContext.courseLevelId,
        levelScopeByLevelId: scope.levelScopeByLevelId || {}
      }
    });
  } catch (error) {
    return res.apiError(error?.statusCode || 409, error?.message || "Assessment configuration is incomplete", error?.errorCode || "EXAM_ASSESSMENT_CONFIG_INCOMPLETE");
  }

  const approved = await approveEnrollmentList({
    tenantId: req.auth.tenantId,
    listId,
    actorUserId: req.auth.userId,
    actorRole: req.auth.role
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_LIST_APPROVE",
    entityType: "EXAM_ENROLLMENT_LIST",
    entityId: listId,
    metadata: { examCycleId, configuredLevels: requiredLevelIds.length }
  });

  // Keep the configured practice schedule intact; approval only finalizes the list
  // and assigns exam worksheets/questions for this cycle based on level config.
  const generation = await assignSelectedExamWorksheets({
    tenantId: req.auth.tenantId,
    examCycleId,
    combinedListId: listId,
    actorUserId: req.auth.userId,
    provenanceContext: {
      courseId: scope.examCourseContext.courseId,
      courseLevelId: scope.examCourseContext.courseLevelId,
      levelScopeByLevelId: scope.levelScopeByLevelId || {}
    }
  });

  await prisma.examCycle.updateMany({
    where: {
      id: examCycleId,
      tenantId: req.auth.tenantId,
      resultStatus: { in: ["DRAFT", "LOCKED"] }
    },
    data: {
      resultStatus: "READY_FOR_REVIEW",
      resultPublishedAt: null,
      resultPublishedByUserId: null
    }
  });

  return res.apiSuccess("List approved; assessments assigned", { list: approved.list, worksheets: generation });
});

const centerCreateTemporaryStudents = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const centerNodeId = req.auth.hierarchyNodeId;

  if (!centerNodeId) {
    return res.apiError(400, "Center scope missing", "CENTER_SCOPE_REQUIRED");
  }

  const items = Array.isArray(req.body?.students) ? req.body.students : null;
  if (!items || !items.length) {
    return res.apiError(400, "students[] is required", "VALIDATION_ERROR");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true, enrollmentStartAt: true, enrollmentEndAt: true, examEndsAt: true }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (!withinEnrollmentWindow(examCycle)) {
    return res.apiError(409, "Enrollment window is closed", "ENROLLMENT_WINDOW_CLOSED");
  }

  const combined = await getOrCreateCenterCombinedList({
    tenantId: req.auth.tenantId,
    examCycleId,
    centerNodeId,
    actorUserId: req.auth.userId
  });

  if (combined.locked && combined.status !== "REJECTED") {
    return res.apiError(409, "Combined list is locked", "LIST_LOCKED");
  }

  const expiryBufferDays = 7;
  const expiresAt = new Date(new Date(examCycle.examEndsAt).getTime() + expiryBufferDays * 24 * 60 * 60 * 1000);

  const created = await prisma.$transaction(async (tx) => {
    const out = [];

    for (const raw of items) {
      const firstName = raw?.firstName ? String(raw.firstName).trim() : "Temp";
      const lastName = raw?.lastName ? String(raw.lastName).trim() : "Student";
      const levelId = raw?.levelId ? String(raw.levelId).trim() : null;
      const password = raw?.password ? String(raw.password) : "Pass@123";

      if (!levelId) {
        const error = new Error("levelId is required for temporary student");
        error.statusCode = 400;
        error.errorCode = "VALIDATION_ERROR";
        throw error;
      }

      const passwordHash = await hashPassword(password);

      let createdRecord = null;

      for (let usernameAttempt = 0; usernameAttempt < 40; usernameAttempt += 1) {
        const username = await allocateTemporaryStudentUsername({ tx, tenantId: req.auth.tenantId });

        try {
          const student = await tx.student.create({
            data: {
              tenantId: req.auth.tenantId,
              admissionNo: username,
              firstName,
              lastName,
              email: null,
              hierarchyNodeId: centerNodeId,
              levelId,
              isActive: true,
              isTemporaryExam: true,
              temporaryExpiresAt: expiresAt,
              temporaryExamCycleId: examCycleId
            },
            select: { id: true, admissionNo: true, firstName: true, lastName: true, levelId: true }
          });

          const user = await tx.authUser.create({
            data: {
              tenantId: req.auth.tenantId,
              username,
              email: `${username.toLowerCase()}@temp.local`,
              passwordHash,
              role: "STUDENT",
              isActive: true,
              hierarchyNodeId: centerNodeId,
              parentUserId: req.auth.userId,
              studentId: student.id,
              mustChangePassword: true
            },
            select: { id: true, username: true }
          });

          const entry = await tx.examEnrollmentEntry.create({
            data: {
              tenantId: req.auth.tenantId,
              examCycleId,
              studentId: student.id,
              enrolledLevelId: levelId,
              isTemporary: true,
              sourceTeacherUserId: null,
              createdByUserId: req.auth.userId
            },
            select: { id: true }
          });

          await tx.examEnrollmentListItem.create({
            data: {
              tenantId: req.auth.tenantId,
              listId: combined.id,
              entryId: entry.id
            }
          });

          createdRecord = { student, user, entry, password };
          break;
        } catch (error) {
          if (error?.code !== "P2002") {
            throw error;
          }
        }
      }

      if (!createdRecord) {
        const error = new Error("Unable to allocate unique username");
        error.statusCode = 409;
        error.errorCode = "USERNAME_GENERATION_CONFLICT";
        throw error;
      }

      out.push(createdRecord);
    }

    return out;
  });

  return res.apiSuccess("Temporary students created", created, 201);
});

const getExamCycleArchiveImpact = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const impact = await loadExamCycleArchiveImpact({
    tenantId: req.auth.tenantId,
    examCycleId
  });

  res.locals.auditMetadata = {
    examCycleCode: impact.examCycle.code,
    approvedEnrollmentCount: impact.summary.approvedEnrollmentCount,
    certificateCount: impact.summary.certificateCount,
    resultCount: impact.summary.resultCount,
    isArchived: impact.examCycle.isArchived
  };

  return res.apiSuccess("Archive impact", impact);
});

const archiveExamCycle = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const password = String(req.body?.password || "").trim();
  const confirmCode = String(req.body?.confirmCode || "").trim();
  const archiveReason = String(req.body?.archiveReason || "").trim();

  if (!password) {
    return res.apiError(400, "password is required", "VALIDATION_ERROR");
  }

  if (!confirmCode) {
    return res.apiError(400, "confirmCode is required", "VALIDATION_ERROR");
  }

  if (archiveReason.length < 20) {
    return res.apiError(400, "archiveReason must be at least 20 characters", "VALIDATION_ERROR");
  }

  const impact = await loadExamCycleArchiveImpact({ tenantId: req.auth.tenantId, examCycleId });

  if (impact.examCycle.isArchived) {
    return res.apiError(409, "Exam cycle is already archived", "EXAM_CYCLE_ALREADY_ARCHIVED");
  }

  if (confirmCode !== String(impact.examCycle.code || "")) {
    return res.apiError(400, "confirmCode must match exam cycle code", "EXAM_CYCLE_CODE_CONFIRMATION_MISMATCH");
  }

  const actor = await verifySuperadminPasswordOrThrow({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    password
  });

  const archived = await prisma.examCycle.update({
    where: { id: examCycleId },
    data: {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: req.auth.userId,
      archiveReason
    },
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true,
      archivedAt: true,
      archivedBy: true,
      archiveReason: true
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_CYCLE_ARCHIVED",
    entityType: "EXAM_CYCLE",
    entityId: archived.id,
    metadata: {
      cycleId: archived.id,
      cycleCode: archived.code,
      cycleName: archived.name,
      userId: req.auth.userId,
      username: actor.username || req.auth.username || null,
      timestamp: new Date().toISOString(),
      reason: archiveReason,
      tenantId: req.auth.tenantId
    }
  }, { strict: true });

  res.locals.auditMetadata = {
    cycleCode: archived.code,
    reasonLength: archiveReason.length
  };

  return res.apiSuccess("Exam cycle archived", archived);
});

const restoreExamCycle = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const password = String(req.body?.password || "").trim();

  if (!password) {
    return res.apiError(400, "password is required", "VALIDATION_ERROR");
  }

  const examCycle = await getExamCycleById({ tenantId: req.auth.tenantId, examCycleId });
  if (!examCycle.isArchived) {
    return res.apiError(409, "Exam cycle is not archived", "EXAM_CYCLE_NOT_ARCHIVED");
  }

  const actor = await verifySuperadminPasswordOrThrow({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    password
  });

  const restored = await prisma.examCycle.update({
    where: { id: examCycleId },
    data: {
      isArchived: false,
      archivedAt: null,
      archivedBy: null,
      archiveReason: null
    },
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_CYCLE_RESTORED",
    entityType: "EXAM_CYCLE",
    entityId: restored.id,
    metadata: {
      cycleId: restored.id,
      cycleCode: restored.code,
      cycleName: restored.name,
      userId: req.auth.userId,
      username: actor.username || req.auth.username || null,
      timestamp: new Date().toISOString(),
      reason: "RESTORE",
      tenantId: req.auth.tenantId
    }
  }, { strict: true });

  res.locals.auditMetadata = {
    cycleCode: restored.code,
    restored: true
  };

  return res.apiSuccess("Exam cycle restored", restored);
});

const getExamCycleDeleteImpact = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const impact = await loadExamCycleDeleteImpact({
    tenantId: req.auth.tenantId,
    examCycleId
  });

  res.locals.auditMetadata = {
    examCycleCode: impact.examCycle.code,
    canDelete: impact.flags.canDelete,
    approvedListCount: impact.summary.approvedListCount,
    submissionCount: impact.summary.submissionCount
  };

  return res.apiSuccess("Delete impact", impact);
});

const getExamCycleAuditCheck = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      code: true,
      name: true,
      resultStatus: true,
      enrollmentStartAt: true,
      enrollmentEndAt: true,
      practiceStartAt: true,
      examStartsAt: true,
      examEndsAt: true,
      resultPublishAt: true,
      resultPublishedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const [lists, approvedListCount, rawAudit] = await Promise.all([
    prisma.examEnrollmentList.findMany({
      where: { tenantId: req.auth.tenantId, examCycleId },
      select: {
        id: true,
        status: true,
        locked: true,
        submittedAt: true,
        forwardedAt: true,
        approvedAt: true,
        rejectedAt: true
      }
    }),
    prisma.examEnrollmentList.count({
      where: { tenantId: req.auth.tenantId, examCycleId, status: "APPROVED" }
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId: req.auth.tenantId,
        action: { startsWith: "EXAM_" }
      },
      orderBy: { createdAt: "desc" },
      take: 250,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        role: true,
        metadata: true,
        createdAt: true,
        user: { select: { id: true, username: true, email: true } }
      }
    })
  ]);

  const statusCounts = lists.reduce((acc, list) => {
    acc[list.status] = (acc[list.status] || 0) + 1;
    return acc;
  }, {});

  const timeline = rawAudit
    .filter((event) => {
      if (event.entityType === "EXAM_CYCLE" && event.entityId === examCycleId) {
        return true;
      }
      const metadataExamCycleId = String(event?.metadata?.examCycleId || "");
      return metadataExamCycleId === examCycleId;
    })
    .slice(0, 40);

  const now = new Date();
  const healthChecks = {
    publishedWithoutApprovedList: examCycle.resultStatus === "PUBLISHED" && approvedListCount === 0,
    examWindowEndedButDraft: now.getTime() > new Date(examCycle.examEndsAt).getTime() && examCycle.resultStatus === "DRAFT",
    practiceStartsAfterExam: new Date(examCycle.practiceStartAt).getTime() > new Date(examCycle.examStartsAt).getTime(),
    enrollmentEndsAfterExamStart:
      new Date(examCycle.enrollmentEndAt).getTime() > new Date(examCycle.examStartsAt).getTime(),
    publishedMissingPublishedAt: examCycle.resultStatus === "PUBLISHED" && !examCycle.resultPublishedAt
  };

  res.locals.auditMetadata = {
    examCycleCode: examCycle.code,
    timelineCount: timeline.length,
    approvedListCount
  };

  return res.apiSuccess("Exam audit check", {
    examCycle,
    enrollmentListSummary: {
      total: lists.length,
      approved: approvedListCount,
      byStatus: statusCounts
    },
    healthChecks,
    timeline
  });
});

const deleteExamCycle = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  const password = String(req.body?.password || "").trim();
  const confirmCode = String(req.body?.confirmCode || "").trim();

  if (!password) {
    return res.apiError(400, "password is required", "VALIDATION_ERROR");
  }

  const impact = await loadExamCycleDeleteImpact({
    tenantId: req.auth.tenantId,
    examCycleId
  });

  if (!confirmCode) {
    return res.apiError(400, "confirmCode is required", "VALIDATION_ERROR");
  }

  if (confirmCode !== String(impact.examCycle.code || "")) {
    return res.apiError(400, "confirmCode must match exam cycle code", "EXAM_CYCLE_CODE_CONFIRMATION_MISMATCH");
  }

  if (!impact.flags.canDelete) {
    return res.apiError(409, impact.blockers[0] || "Delete is blocked", "EXAM_CYCLE_DELETE_BLOCKED");
  }

  await verifySuperadminPasswordOrThrow({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    password
  });

  await prisma.$transaction(async (tx) => {
    await tx.worksheet.updateMany({
      where: { tenantId: req.auth.tenantId, examCycleId },
      data: { examCycleId: null }
    });

    await tx.examCycle.delete({
      where: { id: examCycleId }
    });
  });

  res.locals.auditMetadata = {
    examCycleCode: impact.examCycle.code,
    approvedListCount: impact.summary.approvedListCount,
    resultStatus: impact.examCycle.resultStatus,
    submissionCount: impact.summary.submissionCount
  };

  return res.apiSuccess("Exam cycle deleted", {
    id: impact.examCycle.id,
    code: impact.examCycle.code,
    name: impact.examCycle.name
  });
});

const getExamResults = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);

  const payload = await buildExamResultsPayload({ tenantId: req.auth.tenantId, actor: req.auth, examCycleId, query: req.query });
  return res.apiSuccess("Exam results", payload);
});

function formatCsvRank(rank) {
  const numericRank = toNullableNumber(rank);
  return numericRank !== null ? `#${numericRank}` : "";
}

function formatCsvDuration(completionTimeSeconds) {
  const totalSeconds = toNullableNumber(completionTimeSeconds);
  if (totalSeconds === null || totalSeconds < 0) return "";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatCsvSecondAttempt(row = {}) {
  const status = String(row.attempt2Status || "").toUpperCase();

  if (status === "IN_PROGRESS") return "Attempt 2 In Progress";
  if (status === "SUBMITTED") return "Attempt 2 Submitted";
  if (status === "TIMED_OUT") return "Attempt 2 Time Up";
  if (row.secondAttemptGranted) return "2nd Attempt Granted";

  return "";
}

function formatCsvYesNo(value) {
  return value ? "YES" : "NO";
}

const exportExamResultsCsv = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: { id: true, code: true, name: true }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const payload = await buildExamResultsPayload({ tenantId: req.auth.tenantId, actor: req.auth, examCycleId, query: req.query });

  const headers = [
    { key: "examCode", label: "Exam Code" },
    { key: "examName", label: "Exam Name" },
    { key: "resultStatus", label: "Result Status" },
    { key: "rank", label: "Rank" },
    { key: "studentCode", label: "Student Code" },
    { key: "studentName", label: "Student Name" },
    { key: "candidateType", label: "Candidate Type" },
    { key: "enrollment", label: "Enrollment" },
    { key: "level", label: "Level" },
    { key: "levelOrder", label: "Level Order" },
    { key: "teacherCode", label: "Teacher Code" },
    { key: "teacherName", label: "Teacher Name" },
    { key: "centerCode", label: "Center Code" },
    { key: "centerName", label: "Center Name" },
    { key: "status", label: "Status" },
    { key: "correctCount", label: "Correct" },
    { key: "wrongCount", label: "Wrong" },
    { key: "unansweredCount", label: "Unanswered" },
    { key: "totalQuestions", label: "Total" },
    { key: "accuracy", label: "Accuracy %" },
    { key: "resultState", label: "Result State" },
    { key: "completionTime", label: "Completion Time" },
    { key: "completionTimeSeconds", label: "Completion Time (sec)" },
    { key: "submittedAt", label: "Submitted At" },
    { key: "attemptNo", label: "Attempt No" },
    { key: "secondAttempt", label: "Second Attempt" },
    { key: "resultConflict", label: "Result Conflict" },
    { key: "resultConflictReason", label: "Result Conflict Reason" }
  ];

  const rows = (payload.results || []).map((r) => ({
    examCode: examCycle.code,
    examName: examCycle.name,
    resultStatus: payload.status,
    rank: formatCsvRank(r.rank),
    studentCode: r.admissionNo,
    studentName: r.studentName,
    candidateType: r.isTemporaryCandidate ? "Temporary" : "Regular",
    enrollment: r.isLateEnrollment ? "Late Enrollment" : "Regular",
    level: r.levelName,
    levelOrder: r.levelRank,
    teacherCode: r.teacherCode,
    teacherName: r.teacherName,
    centerCode: r.centerCode,
    centerName: r.centerName,
    status: r.candidateStatus,
    correctCount: r.correctCount,
    wrongCount: r.wrongCount,
    unansweredCount: r.unansweredCount,
    totalQuestions: r.totalQuestions,
    accuracy: r.percentage,
    resultState: r.resultOutcome,
    completionTime: formatCsvDuration(r.completionTimeSeconds),
    completionTimeSeconds: r.completionTimeSeconds,
    submittedAt: r.submittedAt ? new Date(r.submittedAt).toISOString() : "",
    attemptNo: r.activeAttemptNo,
    secondAttempt: formatCsvSecondAttempt(r),
    resultConflict: formatCsvYesNo(r.resultConflict),
    resultConflictReason: r.resultConflictReason
  }));

  const csv = toCsv({ headers, rows });
  const filename = `exam_results_${examCycle.code || examCycleId}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
});

const publishExamResults = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const note = req.body?.note ? String(req.body.note).trim() : null;
  const confirmationAccepted = req.body?.confirmationAccepted === undefined ? true : Boolean(req.body?.confirmationAccepted);

  if (!confirmationAccepted) {
    return res.apiError(400, "Publish confirmation is required", "PUBLISH_CONFIRMATION_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      name: true,
      code: true,
      businessPartnerId: true,
      resultStatus: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (examCycle.resultStatus === "PUBLISHED") {
    return res.apiError(409, "Results are already published", "EXAM_RESULTS_ALREADY_PUBLISHED");
  }

  if (!(["READY_FOR_REVIEW", "LOCKED"].includes(examCycle.resultStatus))) {
    return res.apiError(409, "Results must be ready for review before publishing", "EXAM_RESULTS_NOT_READY_FOR_PUBLICATION");
  }

  const publishedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const cycle = await tx.examCycle.update({
      where: { id: examCycle.id },
      data: {
        resultStatus: "PUBLISHED",
        resultPublishedAt: publishedAt,
        resultPublishedByUserId: req.auth.userId
      }
    });

    await tx.examResultPublicationAudit.create({
      data: {
        tenantId: req.auth.tenantId,
        examCycleId: examCycle.id,
        action: "PUBLISHED",
        notes: note,
        actedByUserId: req.auth.userId,
        actedAt: publishedAt
      }
    });

    return cycle;
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_RESULTS_PUBLISH",
    entityType: "EXAM_CYCLE",
    entityId: examCycleId,
    metadata: {
      previousStatus: examCycle.resultStatus,
      newStatus: "PUBLISHED",
      note
    }
  });

  void (async () => {
    try {
      const bp = await prisma.businessPartner.findFirst({
        where: { id: examCycle.businessPartnerId, tenantId: req.auth.tenantId },
        select: { id: true, hierarchyNodeId: true }
      });

      const nodeIds = bp?.hierarchyNodeId
        ? await resolveBusinessPartnerHierarchyNodeIds({ tenantId: req.auth.tenantId, businessPartnerId: bp.id })
        : [];

      const operationalRecipients = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: { in: ["BP", "FRANCHISE", "CENTER", "TEACHER"] },
          ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
        },
        select: { id: true },
        take: 500
      });

      const enrolled = await prisma.examEnrollmentEntry.findMany({
        where: {
          tenantId: req.auth.tenantId,
          examCycleId: examCycle.id
        },
        select: { studentId: true }
      });

      const studentIds = Array.from(new Set(enrolled.map((row) => row.studentId).filter(Boolean)));

      const [studentRecipients, parentLinks] = await Promise.all([
        studentIds.length
          ? prisma.authUser.findMany({
              where: {
                tenantId: req.auth.tenantId,
                role: "STUDENT",
                isActive: true,
                studentId: { in: studentIds }
              },
              select: { id: true }
            })
          : [],
        studentIds.length
          ? prisma.parentStudentLink.findMany({
              where: {
                tenantId: req.auth.tenantId,
                studentId: { in: studentIds },
                isActive: true
              },
              select: { parentUserId: true }
            })
          : []
      ]);

      const parentRecipientIds = Array.from(new Set(parentLinks.map((row) => row.parentUserId).filter(Boolean)));
      const parentRecipients = parentRecipientIds.length
        ? await prisma.authUser.findMany({
            where: {
              tenantId: req.auth.tenantId,
              role: "PARENT",
              isActive: true,
              id: { in: parentRecipientIds }
            },
            select: { id: true }
          })
        : [];

      const recipients = Array.from(
        new Set([
          ...operationalRecipients.map((r) => r.id),
          ...studentRecipients.map((r) => r.id),
          ...parentRecipients.map((r) => r.id)
        ])
      ).map((id) => ({ id }));

      await createBulkNotification(
        recipients.map((r) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: r.id,
          type: "EXAM_RESULT_PUBLISHED",
          title: "Exam Results Published",
          message: `Exam results are now available for ${examCycle.name} (${examCycle.code}).`,
          entityType: "EXAM_CYCLE",
          entityId: examCycle.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Results published", updated);
});

const unpublishExamResults = asyncHandler(async (req, res) => {
  const examCycleId = String(req.params.id);
  await assertExamCycleOperational({ tenantId: req.auth.tenantId, examCycleId });
  const note = req.body?.note ? String(req.body.note).trim() : null;

  if (!note || note.length < 8) {
    return res.apiError(400, "note is required and must be at least 8 characters", "UNPUBLISH_NOTE_REQUIRED");
  }

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId: req.auth.tenantId },
    select: {
      id: true,
      name: true,
      code: true,
      businessPartnerId: true,
      resultStatus: true
    }
  });

  if (!examCycle) {
    return res.apiError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  if (examCycle.resultStatus !== "PUBLISHED") {
    return res.apiError(409, "Results are not published", "EXAM_RESULTS_NOT_PUBLISHED");
  }

  const actedAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const cycle = await tx.examCycle.update({
      where: { id: examCycle.id },
      data: {
        resultStatus: "READY_FOR_REVIEW",
        resultPublishedAt: null,
        resultPublishedByUserId: null
      }
    });

    await tx.examResultPublicationAudit.create({
      data: {
        tenantId: req.auth.tenantId,
        examCycleId: examCycle.id,
        action: "UNPUBLISHED",
        notes: note,
        actedByUserId: req.auth.userId,
        actedAt
      }
    });

    return cycle;
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "EXAM_RESULTS_UNPUBLISH",
    entityType: "EXAM_CYCLE",
    entityId: examCycleId,
    metadata: {
      previousStatus: "PUBLISHED",
      newStatus: "READY_FOR_REVIEW",
      note
    }
  });

  void (async () => {
    try {
      const bp = await prisma.businessPartner.findFirst({
        where: { id: examCycle.businessPartnerId, tenantId: req.auth.tenantId },
        select: { id: true, hierarchyNodeId: true }
      });

      const nodeIds = bp?.hierarchyNodeId
        ? await resolveBusinessPartnerHierarchyNodeIds({ tenantId: req.auth.tenantId, businessPartnerId: bp.id })
        : [];

      const recipients = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          role: { in: ["BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT", "PARENT"] },
          ...(nodeIds.length ? { hierarchyNodeId: { in: nodeIds } } : {})
        },
        select: { id: true },
        take: 500
      });

      await createBulkNotification(
        recipients.map((r) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: r.id,
          type: "EXAM_RESULT_UNPUBLISHED",
          title: "Exam Results Unpublished",
          message: `Exam results are temporarily unavailable for ${examCycle.name} (${examCycle.code}) due to review updates.`,
          entityType: "EXAM_CYCLE",
          entityId: examCycle.id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Results unpublished", updated);
});

const __examResultsInternals = Object.freeze({
  normalizeAnswerForComparison,
  deriveSavedAnswerMetrics,
  resolveCompletionTimeSecondsFromSubmission,
  resolveExamResultMetricsForSubmission,
  computeAverageCompletionTimeSeconds
});

export {
  listExamCycles,
  listExamCourses,
  createExamCourse,
  createExamCourseLevel,
  listExamResultsControlCenter,
  createExamCycle,
  getTeacherList,
  teacherEnrollStudents,
  submitTeacherListToCenter,
  centerPrepareCombinedList,
  centerSubmitCombinedListToFranchise,
  centerSetCombinedListItemIncluded,
  centerRejectTeacherList,
  exportEnrollmentListCsv,
  getEnrollmentListLevelBreakdown,
  getExamCycleLevelsForAssessment,
  getExamCycleAssessmentConfig,
  saveExamCycleAssessmentConfig,
  generateExamCycleQuestionSet,
  listPendingEnrollmentLists,
  forwardPendingEnrollmentList,
  rejectPendingEnrollmentList,
  superadminApproveEnrollmentList,
  centerCreateTemporaryStudents,
  getExamCycleArchiveImpact,
  archiveExamCycle,
  restoreExamCycle,
  getExamCycleDeleteImpact,
  getExamCycleAuditCheck,
  deleteExamCycle,
  getExamResults,
  getExamResultsReview,
  getExamResultPublicationAuditTrail,
  exportExamResultsCsv,
  publishExamResults,
  unpublishExamResults,
  grantSecondAttemptToStudent,
  revokeSecondAttemptFromStudent,
  __examResultsInternals
};
