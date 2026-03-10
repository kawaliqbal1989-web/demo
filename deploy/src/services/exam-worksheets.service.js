import { prisma } from "../lib/prisma.js";
import { generateWorksheet } from "./abacus-question-generator.service.js";
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

async function assignSelectedExamWorksheets({ tenantId, examCycleId, combinedListId, actorUserId }) {
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

  const selections = await prisma.examEnrollmentLevelWorksheetSelection.findMany({
    where: { tenantId, listId: combinedListId },
    select: { levelId: true, baseWorksheetId: true }
  });

  const selectionByLevelId = new Map(selections.map((s) => [s.levelId, s.baseWorksheetId]));
  if (!selectionByLevelId.size) {
    throw createHttpError(409, "No exam worksheet selection found for this request", "EXAM_WORKSHEET_SELECTION_MISSING");
  }

  const baseWorksheetIds = Array.from(new Set(selections.map((s) => s.baseWorksheetId)));
  const baseWorksheets = await prisma.worksheet.findMany({
    where: { tenantId, id: { in: baseWorksheetIds } },
    select: {
      id: true,
      levelId: true,
      templateId: true,
      title: true,
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
  });

  const baseById = new Map(baseWorksheets.map((w) => [w.id, w]));

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

      const baseWorksheetId = selectionByLevelId.get(entry.enrolledLevelId);
      if (!baseWorksheetId) {
        const error = createHttpError(409, "Missing selected exam worksheet for one or more levels", "EXAM_WORKSHEET_SELECTION_INCOMPLETE");
        throw error;
      }

      const base = baseById.get(baseWorksheetId);
      if (!base) {
        throw createHttpError(409, "Selected exam worksheet not found", "EXAM_WORKSHEET_NOT_FOUND");
      }

      if (base.levelId !== entry.enrolledLevelId) {
        throw createHttpError(409, "Selected exam worksheet level mismatch", "EXAM_WORKSHEET_LEVEL_MISMATCH");
      }

      if (!Array.isArray(base.questions) || base.questions.length <= 0) {
        throw createHttpError(409, "Selected exam worksheet has no questions", "EXAM_WORKSHEET_QUESTIONS_MISSING");
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
      const seed = `EXAM_SELECTED:${examCycleId}:${baseWorksheetId}:${entry.studentId}`;
      const shuffled = shuffleDeterministic(base.questions, seed);

      const worksheet = await tx.worksheet.create({
        data: {
          tenantId,
          title: `${examCycle.name} Exam`,
          description: `Exam worksheet for ${studentName}`,
          difficulty: "MEDIUM",
          levelId: entry.enrolledLevelId,
          createdByUserId: actorUserId,
          isPublished: false,
          templateId: base.templateId,
          generationMode: "EXAM",
          generationSeed: seed,
          generatedAt: new Date(),
          timeLimitSeconds: examTimeLimitSeconds,
          examCycleId
        },
        select: { id: true }
      });

      await tx.worksheetQuestion.createMany({
        data: shuffled.map((q, idx) => ({
          tenantId,
          worksheetId: worksheet.id,
          questionNumber: idx + 1,
          questionBankId: q.questionBankId,
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
