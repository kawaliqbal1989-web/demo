import { prisma } from "../lib/prisma.js";
import crypto from "crypto";
import { detectAndFlagAbuse } from "./abuse-detection.service.js";

function normalizeAnswers(answers) {
  if (!Array.isArray(answers)) {
    return [];
  }

  return answers
    .map((item) => ({
      questionNumber: Number(item.questionNumber),
      answer: Number(item.answer)
    }))
    .filter((item) => Number.isFinite(item.questionNumber) && Number.isFinite(item.answer));
}

function buildEvaluationHash(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function normalizeCompetitionSubmissionAnswers(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const answersByQuestionId = raw.answersByQuestionId && typeof raw.answersByQuestionId === "object" && !Array.isArray(raw.answersByQuestionId)
    ? raw.answersByQuestionId
    : {};

  const normalized = {};
  for (const [questionId, item] of Object.entries(answersByQuestionId)) {
    if (!questionId) continue;
    if (!item || typeof item !== "object") continue;
    const value = item.value ?? item.answer ?? item.response ?? null;
    const numeric = toFiniteNumber(value);
    if (numeric === null) {
      continue;
    }
    normalized[questionId] = { value: numeric };
  }
  return normalized;
}

function compareNumericAnswers(left, right) {
  const a = toFiniteNumber(left);
  const b = toFiniteNumber(right);
  if (a === null || b === null) {
    return false;
  }
  return Math.abs(a - b) < 1e-9;
}

async function submitWorksheet({ worksheetId, studentId, tenantId, answers, allowExpired = false, remarksOverride } = {}) {
  const dedupedByQuestion = new Map();
  for (const answer of normalizeAnswers(answers)) {
    dedupedByQuestion.set(answer.questionNumber, answer.answer);
  }
  const normalizedAnswers = Array.from(dedupedByQuestion.entries()).map(([questionNumber, answer]) => ({
    questionNumber,
    answer
  }));

  if (!normalizedAnswers.length) {
    const error = new Error("Answers are required");
    error.statusCode = 400;
    error.errorCode = "ANSWERS_REQUIRED";
    throw error;
  }

  const result = await prisma.$transaction(async (tx) => {
    const worksheet = await tx.worksheet.findFirst({
      where: {
        id: worksheetId,
        tenantId
      },
      include: {
        level: {
          select: {
            id: true
          }
        },
        questions: {
          orderBy: {
            questionNumber: "asc"
          },
          select: {
            questionNumber: true,
            correctAnswer: true
          }
        }
      }
    });

    if (!worksheet) {
      const error = new Error("Worksheet not found");
      error.statusCode = 404;
      error.errorCode = "WORKSHEET_NOT_FOUND";
      throw error;
    }

    if (!worksheet.questions.length) {
      const error = new Error("Worksheet has no generated questions");
      error.statusCode = 409;
      error.errorCode = "WORKSHEET_QUESTIONS_MISSING";
      throw error;
    }

    const existingSubmission = await tx.worksheetSubmission.findUnique({
      where: {
        worksheetId_studentId: {
          worksheetId,
          studentId
        }
      },
      select: {
        id: true,
        submittedAt: true,
        finalSubmittedAt: true,
        status: true
      }
    });

    if (existingSubmission?.finalSubmittedAt) {
      const error = new Error("Worksheet submission already finalized");
      error.statusCode = 409;
      error.errorCode = "SUBMISSION_ALREADY_FINALIZED";
      throw error;
    }

    const now = new Date();
    const startedAt = existingSubmission?.submittedAt || worksheet.generatedAt || worksheet.createdAt;
    const completionTime = Math.max(
      0,
      Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000)
    );

    if (!allowExpired && worksheet.timeLimitSeconds && completionTime > worksheet.timeLimitSeconds) {
      const error = new Error("Time limit exceeded");
      error.statusCode = 409;
      error.errorCode = "TIME_LIMIT_EXCEEDED";
      throw error;
    }

    const expectedByQuestion = new Map(
      worksheet.questions.map((question) => [question.questionNumber, question.correctAnswer])
    );

    let correctCount = 0;
    for (const answer of normalizedAnswers) {
      const expected = expectedByQuestion.get(answer.questionNumber);
      if (expected !== undefined && answer.answer === expected) {
        correctCount += 1;
      }
    }

    const totalQuestions = worksheet.questions.length;
    const accuracy = Number(((correctCount / totalQuestions) * 100).toFixed(2));

    const levelRule = await tx.levelRule.findUnique({
      where: {
        tenantId_levelId: {
          tenantId,
          levelId: worksheet.level.id
        }
      },
      select: {
        passThreshold: true
      }
    });

    // Threshold is configured on LevelRule. If absent, preserve legacy default 85.
    const passThreshold = Number(levelRule?.passThreshold ?? 85);
    const passed = accuracy >= passThreshold;
    const submittedAnswers = normalizedAnswers.map((item) => ({
      questionNumber: item.questionNumber,
      answer: item.answer
    }));
    const evaluationHash = buildEvaluationHash({
      tenantId,
      worksheetId,
      studentId,
      totalQuestions,
      correctCount,
      accuracy,
      passed,
      submittedAnswers
    });

    if (existingSubmission) {
      await tx.worksheetSubmission.update({
        where: {
          id: existingSubmission.id
        },
        select: { id: true },
        data: {
          score: accuracy,
          status: "REVIEWED",
          submittedAt: now,
          finalSubmittedAt: now,
          correctCount,
          totalQuestions,
          completionTimeSeconds: completionTime,
          submittedAnswers,
          passed,
          evaluationHash,
          remarks: remarksOverride || "Auto-evaluated"
        }
      });
    } else {
      await tx.worksheetSubmission.create({
        select: { id: true },
        data: {
          tenantId,
          worksheetId,
          studentId,
          score: accuracy,
          status: "REVIEWED",
          submittedAt: now,
          finalSubmittedAt: now,
          correctCount,
          totalQuestions,
          completionTimeSeconds: completionTime,
          submittedAnswers,
          passed,
          evaluationHash,
          remarks: remarksOverride || "Auto-evaluated"
        }
      });
    }

    const abuseDetection = await detectAndFlagAbuse({
      tx,
      tenantId,
      studentId,
      worksheetId,
      submissionTime: now,
      completionTimeSeconds: completionTime,
      score: accuracy,
      totalQuestions
    });

    return {
      accuracy,
      correctCount,
      totalQuestions,
      completionTime,
      passed,
      passThreshold,
      abuseFlags: abuseDetection.createdFlags || []
    };
  });

  return result;
}

async function evaluateCompetitionWorksheetSubmission({
  worksheetId,
  studentId,
  tenantId,
  evaluatorType = "AUTO",
  evaluatorUserId = null
} = {}) {
  if (!worksheetId || !studentId || !tenantId) {
    const error = new Error("worksheetId, studentId, and tenantId are required");
    error.statusCode = 400;
    error.errorCode = "VALIDATION_ERROR";
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const submission = await tx.worksheetSubmission.findUnique({
      where: {
        worksheetId_studentId: {
          worksheetId,
          studentId
        }
      },
      select: {
        id: true,
        tenantId: true,
        worksheetId: true,
        studentId: true,
        finalSubmittedAt: true,
        score: true,
        totalMarks: true,
        earnedMarks: true,
        percentage: true,
        correctCount: true,
        wrongCount: true,
        unansweredCount: true,
        totalQuestions: true,
        completionTimeSeconds: true,
        submittedAnswers: true,
        status: true,
        evaluatedAt: true,
        evaluatorType: true,
        evaluationHash: true,
        evaluationSnapshot: true,
        remarks: true
      }
    });

    if (!submission) {
      const error = new Error("Worksheet submission not found");
      error.statusCode = 404;
      error.errorCode = "WORKSHEET_SUBMISSION_NOT_FOUND";
      throw error;
    }

    if (submission.tenantId !== tenantId) {
      const error = new Error("Submission outside tenant scope");
      error.statusCode = 403;
      error.errorCode = "TENANT_SCOPE_DENIED";
      throw error;
    }

    if (!submission.finalSubmittedAt) {
      const error = new Error("Submission must be finalized before evaluation");
      error.statusCode = 409;
      error.errorCode = "SUBMISSION_NOT_FINALIZED";
      throw error;
    }

    if (submission.status === "PUBLISHED") {
      return {
        submissionId: submission.id,
        evaluatedAt: submission.evaluatedAt || null,
        evaluatorType: submission.evaluatorType || evaluatorType,
        score: submission.score === null || submission.score === undefined ? null : Number(submission.score),
        totalMarks: submission.totalMarks === null || submission.totalMarks === undefined ? null : Number(submission.totalMarks),
        earnedMarks: submission.earnedMarks === null || submission.earnedMarks === undefined ? null : Number(submission.earnedMarks),
        percentage: submission.percentage === null || submission.percentage === undefined ? null : Number(submission.percentage),
        correctCount: submission.correctCount ?? null,
        wrongCount: submission.wrongCount ?? null,
        unansweredCount: submission.unansweredCount ?? null,
        totalQuestions: submission.totalQuestions ?? null,
        completionTimeSeconds: submission.completionTimeSeconds ?? null,
        publishedAt: null,
        questionEvaluations: Array.isArray(submission.evaluationSnapshot?.questionEvaluations)
          ? submission.evaluationSnapshot.questionEvaluations
          : []
      };
    }

    if (submission.evaluatedAt && submission.evaluationSnapshot) {
      if (submission.status !== "REVIEWED") {
        await tx.worksheetSubmission.update({
          where: { id: submission.id },
          select: { id: true },
          data: {
            status: "REVIEWED"
          }
        });
      }
      return {
        submissionId: submission.id,
        evaluatedAt: submission.evaluatedAt,
        evaluatorType: submission.evaluatorType || evaluatorType,
        score: submission.score === null || submission.score === undefined ? null : Number(submission.score),
        totalMarks: submission.totalMarks === null || submission.totalMarks === undefined ? null : Number(submission.totalMarks),
        earnedMarks: submission.earnedMarks === null || submission.earnedMarks === undefined ? null : Number(submission.earnedMarks),
        percentage: submission.percentage === null || submission.percentage === undefined ? null : Number(submission.percentage),
        correctCount: submission.correctCount ?? null,
        wrongCount: submission.wrongCount ?? null,
        unansweredCount: submission.unansweredCount ?? null,
        totalQuestions: submission.totalQuestions ?? null,
        completionTimeSeconds: submission.completionTimeSeconds ?? null,
        publishedAt: null,
        questionEvaluations: Array.isArray(submission.evaluationSnapshot?.questionEvaluations)
          ? submission.evaluationSnapshot.questionEvaluations
          : []
      };
    }

    const worksheet = await tx.worksheet.findFirst({
      where: {
        id: worksheetId,
        tenantId
      },
      select: {
        id: true,
        title: true,
        questions: {
          orderBy: { questionNumber: "asc" },
          select: {
            id: true,
            questionNumber: true,
            marks: true,
            negativeMarks: true,
            correctAnswer: true,
            operation: true,
            operands: true,
            questionBank: {
              select: {
                prompt: true
              }
            }
          }
        }
      }
    });

    if (!worksheet) {
      const error = new Error("Worksheet not found");
      error.statusCode = 404;
      error.errorCode = "WORKSHEET_NOT_FOUND";
      throw error;
    }

    const submittedAnswers = normalizeCompetitionSubmissionAnswers(submission.submittedAnswers);
    const questionEvaluations = [];
    let totalMarks = 0;
    let earnedMarks = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    for (const question of worksheet.questions) {
      const marks = Math.max(0, toFiniteNumber(question.marks) ?? 1);
      const negativeMarks = Math.max(0, toFiniteNumber(question.negativeMarks) ?? 0);
      const expectedAnswer = toFiniteNumber(question.correctAnswer);
      const answerPayload = submittedAnswers[question.id] || null;
      const submittedAnswer = answerPayload?.value ?? null;
      const hasAnswer = submittedAnswer !== null && submittedAnswer !== undefined;
      const isCorrect = hasAnswer && expectedAnswer !== null ? compareNumericAnswers(submittedAnswer, expectedAnswer) : false;
      const questionEarned = !hasAnswer ? 0 : (isCorrect ? marks : -negativeMarks);

      totalMarks += marks;
      earnedMarks += questionEarned;

      if (!hasAnswer) {
        unansweredCount += 1;
      } else if (isCorrect) {
        correctCount += 1;
      } else {
        wrongCount += 1;
      }

      questionEvaluations.push({
        questionId: question.id,
        questionNumber: question.questionNumber,
        prompt: question.questionBank?.prompt || null,
        operation: question.operation,
        operands: question.operands,
        marks,
        negativeMarks,
        correctAnswer: question.correctAnswer,
        submittedAnswer,
        isCorrect,
        earnedMarks: roundMoney(questionEarned)
      });
    }

    const clampedEarnedMarks = Math.max(0, earnedMarks);
    const percentage = totalMarks > 0 ? Number(((clampedEarnedMarks / totalMarks) * 100).toFixed(2)) : 0;
    const evaluationHash = buildEvaluationHash({
      worksheetId,
      studentId,
      tenantId,
      submittedAnswers,
      questionEvaluations: questionEvaluations.map((item) => ({
        questionId: item.questionId,
        submittedAnswer: item.submittedAnswer,
        isCorrect: item.isCorrect,
        earnedMarks: item.earnedMarks
      }))
    });
    const now = new Date();

    await tx.worksheetSubmission.update({
      where: { id: submission.id },
      select: { id: true },
      data: {
        score: percentage,
        totalMarks: roundMoney(totalMarks),
        earnedMarks: roundMoney(clampedEarnedMarks),
        percentage,
        status: "REVIEWED",
        correctCount,
        wrongCount,
        unansweredCount,
        totalQuestions: worksheet.questions.length,
        evaluatedAt: now,
        evaluatorType,
        evaluationSnapshot: {
          worksheetId,
          submissionId: submission.id,
          evaluatedAt: now.toISOString(),
          evaluatorType,
          totalMarks: roundMoney(totalMarks),
          earnedMarks: roundMoney(clampedEarnedMarks),
          percentage,
          correctCount,
          wrongCount,
          unansweredCount,
          questionEvaluations
        },
        evaluationHash,
        remarks: submission.remarks || "Competition evaluated"
      }
    });

    return {
      submissionId: submission.id,
      evaluatedAt: now,
      evaluatorType,
      score: percentage,
      totalMarks: roundMoney(totalMarks),
      earnedMarks: roundMoney(clampedEarnedMarks),
      percentage,
      correctCount,
      wrongCount,
      unansweredCount,
      totalQuestions: worksheet.questions.length,
      completionTimeSeconds: submission.completionTimeSeconds ?? null,
      publishedAt: null,
      questionEvaluations
    };
  });
}

export { submitWorksheet, evaluateCompetitionWorksheetSubmission };
