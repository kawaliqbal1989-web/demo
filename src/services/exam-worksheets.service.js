import { prisma } from "../lib/prisma.js";
import { generateWorksheet } from "./abacus-question-generator.service.js";
import { ASSESSMENT_TYPE, extractTemplateIdFromQuestionBankKey } from "./assessmentConfig.service.js";
import crypto from "crypto";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

async function generateWorksheetWithQuestions({ tx, tenantId, levelId, seed, title, description, createdByUserId, generationMode, timeLimitSecondsOverride = null, examCycleId }) {
  const generated = await generateWorksheet(levelId, tenantId, seed);

  const timeLimitSeconds = timeLimitSecondsOverride !== null ? timeLimitSecondsOverride : generated.timeLimitSeconds;

  const worksheet = await tx.worksheet.create({
    data: {
      tenantId,
      title,
      description,
      difficulty: "MEDIUM",
      levelId,
      createdByUserId,
      isPublished: false,
      templateId: generated.templateId,
      generationMode,
      generationSeed: seed,
      generatedAt: new Date(),
      timeLimitSeconds,
      examCycleId
    },
    select: { id: true, levelId: true, timeLimitSeconds: true }
  });

  await tx.worksheetQuestion.createMany({
    data: generated.questions.map((q) => ({
      tenantId,
      worksheetId: worksheet.id,
      questionNumber: q.questionNumber,
      questionBankId: q.questionBankId,
      operands: q.operands,
      operation: q.operation,
      correctAnswer: q.correctAnswer
    }))
  });

  return worksheet;
}

async function assignWorksheet({ tx, tenantId, worksheetId, studentId, createdByUserId }) {
  await tx.worksheetAssignment.upsert({
    where: {
      worksheetId_studentId: {
        worksheetId,
        studentId
      }
    },
    create: {
      tenantId,
      worksheetId,
      studentId,
      createdByUserId,
      assignedAt: new Date(),
      isActive: true
    },
    update: {
      unassignedAt: null,
      isActive: true
    }
  });
}

async function generateAndAssignExamAndPractice({ tenantId, examCycleId, combinedListId, actorUserId }) {
  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId },
    select: {
      id: true,
      name: true,
      examDurationMinutes: true,
      practiceStartAt: true,
      examStartsAt: true,
      examEndsAt: true
    }
  });

  if (!examCycle) {
    throw createHttpError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: combinedListId, tenantId, examCycleId, type: "CENTER_COMBINED" },
    select: { id: true, status: true }
  });

  if (!list) {
    throw createHttpError(404, "Combined enrollment list not found", "EXAM_LIST_NOT_FOUND");
  }

  if (list.status !== "APPROVED") {
    throw createHttpError(409, "Enrollment list must be approved before worksheet generation", "WORKFLOW_STAGE_CONFLICT");
  }

  const items = await prisma.examEnrollmentListItem.findMany({
    where: {
      tenantId,
      listId: combinedListId,
      included: true
    },
    select: {
      entry: {
        select: {
          id: true,
          studentId: true,
          enrolledLevelId: true,
          student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, isActive: true } }
        }
      }
    }
  });

  const entries = items.map((i) => i.entry);

  if (!entries.length) {
    throw createHttpError(409, "No enrolled students in list", "EXAM_LIST_EMPTY");
  }

  const examTimeLimitSeconds = Math.max(60, Math.floor(Number(examCycle.examDurationMinutes) * 60));

  const result = await prisma.$transaction(async (tx) => {
    const created = [];

    for (const entry of entries) {
      if (!entry.student?.isActive) {
        continue;
      }

      const studentName = `${entry.student.firstName} ${entry.student.lastName}`.trim();

      const existingExamWorksheet = await tx.worksheetAssignment.findFirst({
        where: {
          tenantId,
          studentId: entry.studentId,
          isActive: true,
          worksheet: {
            is: {
              examCycleId,
              generationMode: "EXAM",
              levelId: entry.enrolledLevelId
            }
          }
        },
        select: { worksheetId: true }
      });

      // Create exam worksheet if missing.
      if (!existingExamWorksheet) {
        const examSeed = `EXAM:${examCycleId}:${entry.studentId}`;

        const examWorksheet = await generateWorksheetWithQuestions({
          tx,
          tenantId,
          levelId: entry.enrolledLevelId,
          seed: examSeed,
          title: `${examCycle.name} Exam`,
          description: `Exam worksheet for ${studentName}`,
          createdByUserId: actorUserId,
          generationMode: "EXAM",
          timeLimitSecondsOverride: examTimeLimitSeconds,
          examCycleId
        });

        await assignWorksheet({
          tx,
          tenantId,
          worksheetId: examWorksheet.id,
          studentId: entry.studentId,
          createdByUserId: actorUserId
        });

        created.push({ studentId: entry.studentId, practiceWorksheetId: null, examWorksheetId: examWorksheet.id });
      }
    }

    return { createdCount: created.length, created };
  });

  return result;
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

function shuffleDeterministic(items, seed) {
  const rnd = createSeededRandom(seed);
  return items
    .map((item) => ({ item, sortKey: rnd() }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((e) => e.item);
}

async function assignSelectedExamWorksheets({ tenantId, examCycleId, combinedListId, actorUserId, provenanceContext = null }) {
  const getLevelScopeForLevelId = (levelId) => {
    const normalizedLevelId = String(levelId || "").trim();
    const map = provenanceContext?.levelScopeByLevelId || null;
    if (map && normalizedLevelId && map[normalizedLevelId]) {
      return map[normalizedLevelId];
    }

    if (provenanceContext?.courseId || provenanceContext?.courseLevelId) {
      return {
        courseId: provenanceContext?.courseId || null,
        courseLevelId: provenanceContext?.courseLevelId || null
      };
    }

    return null;
  };

  const matchesScope = (record, scope) => {
    if (!scope) return true;
    if (scope?.courseId && String(record?.courseId || "") !== String(scope.courseId)) return false;
    if (scope?.courseLevelId && String(record?.courseLevelId || "") !== String(scope.courseLevelId)) return false;
    return true;
  };

  const examCycle = await prisma.examCycle.findFirst({
    where: { id: examCycleId, tenantId },
    select: {
      id: true,
      name: true,
      examDurationMinutes: true
    }
  });

  if (!examCycle) {
    throw createHttpError(404, "Exam cycle not found", "EXAM_CYCLE_NOT_FOUND");
  }

  const list = await prisma.examEnrollmentList.findFirst({
    where: { id: combinedListId, tenantId, examCycleId, type: "CENTER_COMBINED" },
    select: { id: true, status: true }
  });

  if (!list) {
    throw createHttpError(404, "Combined enrollment list not found", "EXAM_LIST_NOT_FOUND");
  }

  if (list.status !== "APPROVED") {
    throw createHttpError(409, "Enrollment list must be approved before worksheet assignment", "WORKFLOW_STAGE_CONFLICT");
  }

  const items = await prisma.examEnrollmentListItem.findMany({
    where: {
      tenantId,
      listId: combinedListId,
      included: true
    },
    select: {
      entry: {
        select: {
          id: true,
          studentId: true,
          enrolledLevelId: true,
          student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, isActive: true } }
        }
      }
    }
  });

  const entries = items.map((i) => i.entry);

  if (!entries.length) {
    throw createHttpError(409, "No enrolled students in list", "EXAM_LIST_EMPTY");
  }

  const requiredLevelIds = Array.from(new Set(entries.map((entry) => entry.enrolledLevelId).filter(Boolean)));
  const configs = await prisma.examLevelAssessmentConfig.findMany({
    where: {
      tenantId,
      examCycleId,
      levelId: { in: requiredLevelIds }
    },
    select: {
      levelId: true,
      assessmentType: true,
      worksheetId: true,
      questionBankId: true,
      questionCount: true,
      timeLimitMinutes: true
    }
  });

  const configByLevelId = new Map(configs.map((config) => [config.levelId, config]));

  for (const levelId of requiredLevelIds) {
    if (!configByLevelId.has(levelId)) {
      throw createHttpError(409, "Missing assessment configuration for one or more levels", "EXAM_ASSESSMENT_CONFIG_INCOMPLETE");
    }
  }

  const worksheetIds = Array.from(
    new Set(configs.filter((config) => config.assessmentType === ASSESSMENT_TYPE.WORKSHEET).map((config) => config.worksheetId).filter(Boolean))
  );
  const baseWorksheets = worksheetIds.length
    ? await prisma.worksheet.findMany({
        where: {
          tenantId,
          id: { in: worksheetIds },
          ...(provenanceContext?.courseId ? { courseId: provenanceContext.courseId } : {})
        },
        select: {
          id: true,
          levelId: true,
          courseId: true,
          courseLevelId: true,
          templateId: true,
          questions: {
            orderBy: { questionNumber: "asc" },
            select: {
              questionBankId: true,
              operands: true,
              operation: true,
              correctAnswer: true
            }
          }
        }
      })
    : [];
  const baseWorksheetById = new Map(baseWorksheets.map((worksheet) => [worksheet.id, worksheet]));

  const questionBankLevelIds = Array.from(
    new Set(configs.filter((config) => config.assessmentType === ASSESSMENT_TYPE.QUESTION_BANK).map((config) => config.levelId).filter(Boolean))
  );
  const bankQuestionPool = questionBankLevelIds.length
    ? await prisma.questionBank.findMany({
        where: {
          tenantId,
          levelId: { in: questionBankLevelIds },
          ...(provenanceContext?.courseId ? { courseId: provenanceContext.courseId } : {}),
          isActive: true
        },
        select: {
          id: true,
          levelId: true,
          courseId: true,
          courseLevelId: true,
          templateId: true,
          operands: true,
          operation: true,
          correctAnswer: true
        }
      })
    : [];

  const bankQuestionsByKey = new Map();
  for (const question of bankQuestionPool) {
    const scope = getLevelScopeForLevelId(question.levelId);
    if (!matchesScope(question, scope)) {
      continue;
    }

    const key = `${question.levelId}:${question.templateId || "DEFAULT"}`;
    if (!bankQuestionsByKey.has(key)) {
      bankQuestionsByKey.set(key, []);
    }
    bankQuestionsByKey.get(key).push(question);
  }

  const examTimeLimitSeconds = Math.max(60, Math.floor(Number(examCycle.examDurationMinutes) * 60));

  const result = await prisma.$transaction(async (tx) => {
    const created = [];

    for (const entry of entries) {
      if (!entry.student?.isActive) {
        continue;
      }

      const levelConfig = configByLevelId.get(entry.enrolledLevelId);
      if (!levelConfig) {
        throw createHttpError(409, "Missing assessment configuration for one or more levels", "EXAM_ASSESSMENT_CONFIG_INCOMPLETE");
      }

      const existingExamWorksheet = await tx.worksheetAssignment.findFirst({
        where: {
          tenantId,
          studentId: entry.studentId,
          isActive: true,
          worksheet: {
            is: {
              examCycleId,
              generationMode: "EXAM",
              levelId: entry.enrolledLevelId
            }
          }
        },
        select: { worksheetId: true }
      });

      if (existingExamWorksheet) {
        continue;
      }

      const studentName = `${entry.student.firstName} ${entry.student.lastName}`.trim();
      let selectedQuestions;
      let seed;
      let templateId = null;
      let timeLimitSeconds = examTimeLimitSeconds;
      let sourceCourseId = null;
      let sourceCourseLevelId = null;

      if (levelConfig.assessmentType === ASSESSMENT_TYPE.WORKSHEET) {
        const baseWorksheetId = levelConfig.worksheetId;
        const baseWorksheet = baseWorksheetById.get(baseWorksheetId);
        if (!baseWorksheet || baseWorksheet.levelId !== entry.enrolledLevelId) {
          throw createHttpError(409, "Configured worksheet is invalid", "EXAM_ASSESSMENT_WORKSHEET_INVALID");
        }
        const levelScope = getLevelScopeForLevelId(entry.enrolledLevelId);
        if (!matchesScope(baseWorksheet, levelScope)) {
          throw createHttpError(409, "Configured worksheet is outside exam course scope", "EXAM_ASSESSMENT_WORKSHEET_INVALID");
        }
        if (!Array.isArray(baseWorksheet.questions) || baseWorksheet.questions.length <= 0) {
          throw createHttpError(409, "Configured worksheet has no questions", "EXAM_WORKSHEET_QUESTIONS_MISSING");
        }

        templateId = baseWorksheet.templateId || null;
        sourceCourseId = baseWorksheet.courseId || levelScope?.courseId || provenanceContext?.courseId || null;
        sourceCourseLevelId = baseWorksheet.courseLevelId || levelScope?.courseLevelId || provenanceContext?.courseLevelId || null;
        seed = `EXAM_SELECTED:${examCycleId}:${baseWorksheetId}:${entry.studentId}`;
        selectedQuestions = shuffleDeterministic(baseWorksheet.questions, seed);
      } else if (levelConfig.assessmentType === ASSESSMENT_TYPE.QUESTION_BANK) {
        const templateIdForBank = extractTemplateIdFromQuestionBankKey(levelConfig.questionBankId);
        const bankKey = `${entry.enrolledLevelId}:${templateIdForBank || "DEFAULT"}`;
        const bankQuestions = bankQuestionsByKey.get(bankKey) || [];
        const configuredCount = Number(levelConfig.questionCount || 0);

        if (bankQuestions.some((question) => question.levelId !== entry.enrolledLevelId)) {
          throw createHttpError(409, "Question bank selection includes invalid level questions", "EXAM_QUESTION_BANK_LEVEL_MISMATCH");
        }
        if (templateIdForBank && bankQuestions.some((question) => question.templateId !== templateIdForBank)) {
          throw createHttpError(409, "Question bank selection includes invalid template questions", "EXAM_QUESTION_BANK_TEMPLATE_MISMATCH");
        }

        if (!Number.isInteger(configuredCount) || configuredCount <= 0) {
          throw createHttpError(409, "Configured question count is invalid", "EXAM_QUESTION_COUNT_INVALID");
        }
        if (bankQuestions.length < configuredCount) {
          throw createHttpError(409, "Configured question count exceeds available bank questions", "EXAM_QUESTION_COUNT_EXCEEDS_BANK");
        }

        templateId = templateIdForBank;
        seed = `EXAM_BANK:${examCycleId}:${levelConfig.questionBankId}:${entry.studentId}`;
        selectedQuestions = shuffleDeterministic(bankQuestions, seed).slice(0, configuredCount);
        timeLimitSeconds = Math.max(60, Math.floor(Number(levelConfig.timeLimitMinutes || 0) * 60));
        const levelScope = getLevelScopeForLevelId(entry.enrolledLevelId);
        sourceCourseId = selectedQuestions[0]?.courseId || levelScope?.courseId || provenanceContext?.courseId || null;
        sourceCourseLevelId = selectedQuestions[0]?.courseLevelId || levelScope?.courseLevelId || provenanceContext?.courseLevelId || null;

        await tx.examGeneratedQuestionSet.upsert({
          where: {
            tenantId_examCycleId_studentId_levelId: {
              tenantId,
              examCycleId,
              studentId: entry.studentId,
              levelId: entry.enrolledLevelId
            }
          },
          create: {
            tenantId,
            examCycleId,
            studentId: entry.studentId,
            levelId: entry.enrolledLevelId,
            questionBankId: levelConfig.questionBankId,
            generatedQuestionIds: selectedQuestions.map((question) => question.id)
          },
          update: {
            questionBankId: levelConfig.questionBankId,
            generatedQuestionIds: selectedQuestions.map((question) => question.id),
            generatedAt: new Date()
          }
        });
      } else {
        throw createHttpError(409, "Invalid assessment type configuration", "EXAM_ASSESSMENT_TYPE_INVALID");
      }

      const worksheet = await tx.worksheet.create({
        data: {
          tenantId,
          title: `${examCycle.name} Exam`,
          description: `Exam worksheet for ${studentName}`,
          difficulty: "MEDIUM",
          levelId: entry.enrolledLevelId,
          courseId: sourceCourseId,
          courseLevelId: sourceCourseLevelId,
          createdByUserId: actorUserId,
          isPublished: false,
          templateId,
          generationMode: "EXAM",
          generationSeed: seed,
          generatedAt: new Date(),
          timeLimitSeconds,
          examCycleId
        },
        select: { id: true }
      });

      await tx.worksheetQuestion.createMany({
        data: selectedQuestions.map((q, idx) => ({
          tenantId,
          worksheetId: worksheet.id,
          questionNumber: idx + 1,
          questionBankId: q.questionBankId || (levelConfig.assessmentType === ASSESSMENT_TYPE.QUESTION_BANK ? q.id : null),
          operands: q.operands,
          operation: q.operation,
          correctAnswer: q.correctAnswer
        }))
      });

      await assignWorksheet({
        tx,
        tenantId,
        worksheetId: worksheet.id,
        studentId: entry.studentId,
        createdByUserId: actorUserId
      });

      created.push({ studentId: entry.studentId, examWorksheetId: worksheet.id });
    }

    return { createdCount: created.length, created };
  });

  return result;
}

export { generateAndAssignExamAndPractice, assignSelectedExamWorksheets };
