import { prisma } from "../lib/prisma.js";
import crypto from "crypto";
import { detectAndFlagAbuse } from "./abuse-detection.service.js";

function getWorksheetQuestionTerms(question) {
  const operands = question?.operands && typeof question.operands === "object" ? question.operands : {};
  const rawTerms = Array.isArray(operands?.nums)
    ? operands.nums
    : Array.isArray(operands?.terms)
      ? operands.terms
      : [];

  return rawTerms
    .map((term) => Number(term))
    .filter((term) => Number.isFinite(term));
}

function deriveWorksheetQuestionExpectedAnswer(question) {
  const operation = String(question?.operation || "").trim().toUpperCase();
  const terms = getWorksheetQuestionTerms(question);

  // Align scoring with what is rendered to students for vertical/column arithmetic cards.
  if ((operation === "COLUMN_SUM" || operation === "ADD") && terms.length) {
    const sum = terms.reduce((acc, term) => acc + term, 0);
    return Number.isFinite(sum) ? sum : null;
  }

  const correctAnswer = Number(question?.correctAnswer);
  return Number.isFinite(correctAnswer) ? correctAnswer : null;
}

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

async function submitWorksheet({ worksheetId, studentId, tenantId, answers, allowExpired = false, remarksOverride, submissionId } = {}) {
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
            operands: true,
            operation: true,
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

    const existingSubmission = submissionId
      ? await tx.worksheetSubmission.findFirst({
          where: {
            id: submissionId,
            tenantId,
            worksheetId,
            studentId
          },
          select: {
            id: true,
            submittedAt: true,
            finalSubmittedAt: true,
            status: true,
            attemptNo: true
          }
        })
      : await tx.worksheetSubmission.findFirst({
          where: {
            tenantId,
            worksheetId,
            studentId
          },
          orderBy: { attemptNo: "desc" },
          select: {
            id: true,
            submittedAt: true,
            finalSubmittedAt: true,
            status: true,
            attemptNo: true
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
    const rawCompletionTimeSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000)
    );
    const worksheetTimeLimitSeconds = Number(worksheet.timeLimitSeconds);
    const effectiveCompletionTimeSeconds =
      worksheet.generationMode === "EXAM" &&
      Number.isFinite(worksheetTimeLimitSeconds) &&
      worksheetTimeLimitSeconds > 0
        ? Math.min(
            rawCompletionTimeSeconds,
            Math.floor(worksheetTimeLimitSeconds)
          )
        : rawCompletionTimeSeconds;

    if (
      !allowExpired &&
      worksheet.timeLimitSeconds &&
      rawCompletionTimeSeconds > worksheet.timeLimitSeconds
    ) {
      const error = new Error("Time limit exceeded");
      error.statusCode = 409;
      error.errorCode = "TIME_LIMIT_EXCEEDED";
      throw error;
    }

    const expectedByQuestion = new Map(
      worksheet.questions.map((question) => [question.questionNumber, deriveWorksheetQuestionExpectedAnswer(question)])
    );

    let correctCount = 0;
    for (const answer of normalizedAnswers) {
      const expected = expectedByQuestion.get(answer.questionNumber);
      if (expected !== null && expected !== undefined && answer.answer === expected) {
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
        data: {
          score: accuracy,
          status: "REVIEWED",
          submittedAt: now,
          finalSubmittedAt: now,
          correctCount,
          totalQuestions,
          completionTimeSeconds: effectiveCompletionTimeSeconds,
          submittedAnswers,
          passed,
          evaluationHash,
          remarks: remarksOverride || "Auto-evaluated"
        }
      });
    } else {
      await tx.worksheetSubmission.create({
        data: {
          tenantId,
          worksheetId,
          studentId,
          attemptNo: existingSubmission?.attemptNo ?? 1,
          score: accuracy,
          status: "REVIEWED",
          submittedAt: now,
          finalSubmittedAt: now,
          correctCount,
          totalQuestions,
          completionTimeSeconds: effectiveCompletionTimeSeconds,
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
      completionTimeSeconds: effectiveCompletionTimeSeconds,
      score: accuracy,
      totalQuestions
    });

    return {
      accuracy,
      correctCount,
      totalQuestions,
      completionTime: effectiveCompletionTimeSeconds,
      passed,
      passThreshold,
      abuseFlags: abuseDetection.createdFlags || []
    };
  });

  return result;
}

export { submitWorksheet, deriveWorksheetQuestionExpectedAnswer };
