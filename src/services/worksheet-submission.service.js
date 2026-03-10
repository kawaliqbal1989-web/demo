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
          completionTimeSeconds: completionTime,
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

export { submitWorksheet };
