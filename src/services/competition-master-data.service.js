import { prisma } from "../lib/prisma.js";
import { parsePagination } from "../utils/pagination.js";
import { assertSeasonDateRange, validationError } from "./competition-master-data.validation.js";

function httpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function conflictFromPrisma(error, message, errorCode) {
  if (error?.code === "P2002") {
    throw httpError(409, message, errorCode);
  }
  throw error;
}

async function nextGeneratedCode(model, where, prefix) {
  const records = await model.findMany({ where, select: { code: true } });
  const expression = new RegExp(`^${prefix}(\\d+)$`);
  const max = records.reduce((highest, record) => {
    const match = expression.exec(String(record.code || ""));
    const value = match ? Number(match[1]) : 0;
    return Number.isSafeInteger(value) ? Math.max(highest, value) : highest;
  }, 0);

  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

const seasonSelect = {
  id: true,
  name: true,
  code: true,
  description: true,
  startDate: true,
  endDate: true,
  isActive: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true
};

const courseSelect = {
  id: true,
  competitionId: true,
  name: true,
  code: true,
  description: true,
  isActive: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true
};

const levelSelect = {
  id: true,
  competitionCourseId: true,
  levelId: true,
  levelNumber: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  level: { select: { id: true, name: true, rank: true } }
};

const questionBankSelect = {
  id: true,
  competitionCourseLevelId: true,
  name: true,
  code: true,
  description: true,
  isActive: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { questions: true } }
};

const competitionQuestionSelect = {
  tenantId: true,
  competitionQuestionBankId: true,
  questionBankId: true,
  sortOrder: true,
  createdAt: true,
  questionBank: {
    select: {
      id: true,
      levelId: true,
      difficulty: true,
      prompt: true,
      operands: true,
      operation: true,
      correctAnswer: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  }
};

function normalizeCompetitionQuestionPayload(input = {}) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) {
    throw validationError("Question prompt is required", "COMPETITION_QUESTION_PROMPT_REQUIRED");
  }

  const difficulty = String(input.difficulty || "EASY").trim().toUpperCase();
  if (!["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
    throw validationError("difficulty must be EASY, MEDIUM, or HARD", "COMPETITION_QUESTION_DIFFICULTY_INVALID");
  }

  const operation = String(input.operation || "ADD").trim().toUpperCase();
  if (!operation) {
    throw validationError("Question operation is required", "COMPETITION_QUESTION_OPERATION_REQUIRED");
  }

  const correctAnswer = Number(input.correctAnswer);
  if (!Number.isInteger(correctAnswer)) {
    throw validationError("correctAnswer must be an integer", "COMPETITION_QUESTION_ANSWER_INVALID");
  }

  let operands = input.operands;
  if (typeof operands === "string") {
    try {
      operands = JSON.parse(operands);
    } catch {
      throw validationError("operands must be valid JSON", "COMPETITION_QUESTION_OPERANDS_INVALID");
    }
  }
  if (!operands || typeof operands !== "object" || Array.isArray(operands)) {
    throw validationError("operands must be a JSON object", "COMPETITION_QUESTION_OPERANDS_INVALID");
  }

  return {
    prompt,
    difficulty,
    operation,
    correctAnswer,
    operands
  };
}

const competitionWorksheetSelect = {
  id: true,
  competitionQuestionBankId: true,
  worksheetId: true,
  name: true,
  code: true,
  description: true,
  isActive: true,
  version: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  worksheet: {
    select: {
      id: true,
      title: true,
      levelId: true,
      isPublished: true,
      timeLimitSeconds: true,
      generationMode: true,
      _count: { select: { questions: true } }
    }
  }
};

async function listSeasons({ tenantId, query }) {
  const { take, skip, limit, offset, orderBy } = parsePagination(query);
  const where = { tenantId };
  const status = String(query.status || "").toUpperCase();
  if (status === "ACTIVE") where.isActive = true;
  if (["ARCHIVED", "INACTIVE"].includes(status)) where.isActive = false;
  if (query.q) {
    const q = String(query.q).trim();
    if (q) where.OR = [{ name: { contains: q } }, { code: { contains: q } }];
  }
  const [total, items] = await prisma.$transaction([
    prisma.competitionSeason.count({ where }),
    prisma.competitionSeason.findMany({ where, select: seasonSelect, orderBy, skip, take })
  ]);
  return { total, items, limit, offset };
}

async function createSeason({ tenantId, userId, data }) {
  try {
    return await prisma.competitionSeason.create({
      data: { tenantId, createdByUserId: userId, ...data },
      select: seasonSelect
    });
  } catch (error) {
    conflictFromPrisma(error, "Season name or code already exists", "COMPETITION_SEASON_EXISTS");
  }
}

async function getSeason({ tenantId, seasonId }) {
  const season = await prisma.competitionSeason.findFirst({
    where: { id: seasonId, tenantId },
    select: seasonSelect
  });
  if (!season) throw httpError(404, "Competition season not found", "COMPETITION_SEASON_NOT_FOUND");
  return season;
}

async function updateSeason({ tenantId, seasonId, data }) {
  const existing = await getSeason({ tenantId, seasonId });
  const startDate = data.startDate ?? existing.startDate;
  const endDate = data.endDate ?? existing.endDate;
  assertSeasonDateRange(startDate, endDate);
  try {
    return await prisma.competitionSeason.update({
      where: { id: existing.id },
      data,
      select: seasonSelect
    });
  } catch (error) {
    conflictFromPrisma(error, "Season name or code already exists", "COMPETITION_SEASON_EXISTS");
  }
}

async function archiveSeason({ tenantId, seasonId }) {
  const existing = await getSeason({ tenantId, seasonId });
  return prisma.competitionSeason.update({
    where: { id: existing.id },
    data: { isActive: false },
    select: seasonSelect
  });
}

async function requireCompetitionScope({ tenantId, competitionId }) {
  const competition = await prisma.competition.findFirst({
    where: { id: competitionId, tenantId },
    select: {
      id: true,
      tenantId: true,
      hierarchyNode: { select: { tenantId: true } }
    }
  });
  if (!competition) throw httpError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  if (competition.hierarchyNode?.tenantId !== tenantId) {
    throw httpError(403, "Competition hierarchy is outside the tenant", "COMPETITION_HIERARCHY_INVALID");
  }
  return competition;
}

async function requireCourseScope({ tenantId, competitionId, courseId }) {
  await requireCompetitionScope({ tenantId, competitionId });
  const course = await prisma.competitionCourse.findFirst({
    where: { id: courseId, tenantId, competitionId },
    select: courseSelect
  });
  if (!course) throw httpError(404, "Competition course not found", "COMPETITION_COURSE_NOT_FOUND");
  return course;
}

async function listCourses({ tenantId, competitionId, query }) {
  await requireCompetitionScope({ tenantId, competitionId });
  const { take, skip, limit, offset, orderBy } = parsePagination(query);
  const where = { tenantId, competitionId };
  const status = String(query.status || "").toUpperCase();
  if (status === "ACTIVE") where.isActive = true;
  if (["ARCHIVED", "INACTIVE"].includes(status)) where.isActive = false;
  if (query.q) {
    const q = String(query.q).trim();
    if (q) where.OR = [{ name: { contains: q } }, { code: { contains: q } }];
  }
  const [total, items] = await prisma.$transaction([
    prisma.competitionCourse.count({ where }),
    prisma.competitionCourse.findMany({ where, select: courseSelect, orderBy, skip, take })
  ]);
  return { total, items, limit, offset };
}

async function createCourse({ tenantId, userId, competitionId, data }) {
  await requireCompetitionScope({ tenantId, competitionId });
  try {
    const code = await nextGeneratedCode(
      prisma.competitionCourse,
      { competitionId },
      "CC"
    );
    return await prisma.competitionCourse.create({
      data: { tenantId, competitionId, createdByUserId: userId, ...data, code },
      select: courseSelect
    });
  } catch (error) {
    conflictFromPrisma(error, "Competition course name or code already exists", "COMPETITION_COURSE_EXISTS");
  }
}

async function listCompetitionReuseSources({ tenantId, competitionId }) {
  await requireCompetitionScope({ tenantId, competitionId });

  return prisma.competition.findMany({
    where: {
      tenantId,
      competitionCourses: { some: { isActive: true } }
    },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      startsAt: true,
      endsAt: true,
      competitionCourses: {
        where: { isActive: true },
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
          description: true,
          levels: {
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { levelNumber: "asc" }],
            select: {
              id: true,
              levelNumber: true,
              sortOrder: true,
              level: { select: { id: true, name: true, rank: true } },
              questionBanks: {
                where: { isActive: true },
                orderBy: [{ name: "asc" }, { createdAt: "asc" }],
                select: {
                  id: true,
                  name: true,
                  code: true,
                  description: true,
                  _count: { select: { questions: true } },
                  worksheets: {
                    where: { isActive: true },
                    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
                    select: {
                      id: true,
                      name: true,
                      code: true,
                      version: true,
                      worksheetId: true,
                      worksheet: {
                        select: { id: true, title: true, isPublished: true }
                      }
                    }
                  }
                }
              }
            }
          },
          _count: { select: { levels: true } }
        }
      }
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 100
  });
}

async function copyCompetitionResources({
  tenantId,
  userId,
  competitionId,
  sourceCompetitionId,
  sourceCourseIds,
  includeQuestionBanks,
  includeWorksheets
}) {
  await requireCompetitionScope({ tenantId, competitionId });
  if (sourceCompetitionId === competitionId) {
    throw validationError(
      "Source and destination competitions must be different",
      "COMPETITION_REUSE_SOURCE_INVALID"
    );
  }
  await requireCompetitionScope({ tenantId, competitionId: sourceCompetitionId });

  const sourceCourses = await prisma.competitionCourse.findMany({
    where: {
      tenantId,
      competitionId: sourceCompetitionId,
      id: { in: sourceCourseIds },
      isActive: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      levels: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { levelNumber: "asc" }],
        select: {
          id: true,
          levelId: true,
          levelNumber: true,
          sortOrder: true,
          questionBanks: {
            where: { isActive: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              name: true,
              description: true,
              questions: {
                where: { questionBank: { tenantId, isActive: true } },
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                select: { questionBankId: true, sortOrder: true }
              },
              worksheets: {
                where: { isActive: true },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                  worksheetId: true,
                  name: true,
                  description: true,
                  version: true,
                  worksheet: { select: { id: true, isPublished: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  if (sourceCourses.length !== sourceCourseIds.length) {
    throw httpError(
      404,
      "One or more selected source courses were not found",
      "COMPETITION_REUSE_COURSE_NOT_FOUND"
    );
  }

  const duplicateCourse = await prisma.competitionCourse.findFirst({
    where: {
      tenantId,
      competitionId,
      name: { in: sourceCourses.map((course) => course.name) }
    },
    select: { name: true }
  });
  if (duplicateCourse) {
    throw httpError(
      409,
      `A Competition Course named "${duplicateCourse.name}" already exists in the destination`,
      "COMPETITION_REUSE_COURSE_EXISTS"
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const summary = {
      coursesCopied: 0,
      levelsCopied: 0,
      questionBanksCopied: 0,
      questionsLinked: 0,
      worksheetsLinked: 0,
      skippedUnpublishedWorksheets: 0
    };

    for (const sourceCourse of sourceCourses) {
      const courseCode = await nextGeneratedCode(
        tx.competitionCourse,
        { competitionId },
        "CC"
      );
      const newCourse = await tx.competitionCourse.create({
        data: {
          tenantId,
          competitionId,
          name: sourceCourse.name,
          code: courseCode,
          description: sourceCourse.description,
          isActive: true,
          createdByUserId: userId
        },
        select: { id: true }
      });
      summary.coursesCopied += 1;

      for (const sourceLevel of sourceCourse.levels) {
        const newLevel = await tx.competitionCourseLevel.create({
          data: {
            tenantId,
            competitionCourseId: newCourse.id,
            levelId: sourceLevel.levelId,
            levelNumber: sourceLevel.levelNumber,
            sortOrder: sourceLevel.sortOrder,
            isActive: true
          },
          select: { id: true }
        });
        summary.levelsCopied += 1;

        if (!includeQuestionBanks) continue;

        for (const sourceBank of sourceLevel.questionBanks) {
          const bankCode = await nextGeneratedCode(
            tx.competitionQuestionBank,
            { competitionCourseLevelId: newLevel.id },
            "QB"
          );
          const newBank = await tx.competitionQuestionBank.create({
            data: {
              tenantId,
              competitionCourseLevelId: newLevel.id,
              name: sourceBank.name,
              code: bankCode,
              description: sourceBank.description,
              isActive: true,
              createdByUserId: userId
            },
            select: { id: true }
          });
          summary.questionBanksCopied += 1;

          if (sourceBank.questions.length) {
            await tx.competitionQuestionBankQuestion.createMany({
              data: sourceBank.questions.map((question) => ({
                tenantId,
                competitionQuestionBankId: newBank.id,
                questionBankId: question.questionBankId,
                sortOrder: question.sortOrder
              }))
            });
            summary.questionsLinked += sourceBank.questions.length;
          }

          if (!includeWorksheets) continue;

          for (const sourceWorksheet of sourceBank.worksheets) {
            if (!sourceWorksheet.worksheetId || !sourceWorksheet.worksheet?.isPublished) {
              summary.skippedUnpublishedWorksheets += 1;
              continue;
            }
            const worksheetCode = await nextGeneratedCode(
              tx.competitionWorksheet,
              { competitionQuestionBankId: newBank.id },
              "WS"
            );
            await tx.competitionWorksheet.create({
              data: {
                tenantId,
                competitionQuestionBankId: newBank.id,
                worksheetId: sourceWorksheet.worksheetId,
                name: sourceWorksheet.name,
                code: worksheetCode,
                description: sourceWorksheet.description,
                version: sourceWorksheet.version,
                isActive: true,
                createdByUserId: userId
              }
            });
            summary.worksheetsLinked += 1;
          }
        }
      }
    }

    return summary;
  });

  return result;
}

async function getCourse(args) {
  return requireCourseScope(args);
}

async function updateCourse({ tenantId, competitionId, courseId, data }) {
  const existing = await requireCourseScope({ tenantId, competitionId, courseId });
  try {
    return await prisma.competitionCourse.update({
      where: { id: existing.id },
      data,
      select: courseSelect
    });
  } catch (error) {
    conflictFromPrisma(error, "Competition course name or code already exists", "COMPETITION_COURSE_EXISTS");
  }
}

async function archiveCourse({ tenantId, competitionId, courseId }) {
  const existing = await requireCourseScope({ tenantId, competitionId, courseId });
  return prisma.competitionCourse.update({
    where: { id: existing.id },
    data: { isActive: false },
    select: courseSelect
  });
}
async function restoreCourse({ tenantId, competitionId, courseId }) {
  const existing = await requireCourseScope({
    tenantId,
    competitionId,
    courseId
  });

  return prisma.competitionCourse.update({
    where: { id: existing.id },
    data: { isActive: true },
    select: courseSelect
  });
}

async function listCourseLevels({ tenantId, competitionId, courseId, includeInactive = false }) {
  await requireCourseScope({ tenantId, competitionId, courseId });
  return prisma.competitionCourseLevel.findMany({
    where: { tenantId, competitionCourseId: courseId, ...(includeInactive ? {} : { isActive: true }) },
    select: levelSelect,
    orderBy: [{ sortOrder: "asc" }, { levelNumber: "asc" }]
  });
}

async function addCourseLevel({ tenantId, competitionId, courseId, levelId, sortOrder }) {
  await requireCourseScope({ tenantId, competitionId, courseId });
  const level = await prisma.level.findFirst({
    where: { id: levelId, tenantId, rank: { gte: 1, lte: 8 } },
    select: { id: true, rank: true }
  });
  if (!level) throw validationError("levelId must reference an ERP Level with rank 1–8", "COMPETITION_LEVEL_INVALID");

  const existing = await prisma.competitionCourseLevel.findFirst({
    where: { tenantId, competitionCourseId: courseId, levelId: level.id },
    select: { id: true, isActive: true }
  });
  if (existing?.isActive) {
    throw httpError(409, "Level already exists in this Competition Course", "COMPETITION_LEVEL_EXISTS");
  }
  if (existing) {
    return prisma.competitionCourseLevel.update({
      where: { id: existing.id },
      data: { isActive: true, levelNumber: level.rank, sortOrder: sortOrder ?? level.rank },
      select: levelSelect
    });
  }
  try {
    return await prisma.competitionCourseLevel.create({
      data: {
        tenantId,
        competitionCourseId: courseId,
        levelId: level.id,
        levelNumber: level.rank,
        sortOrder: sortOrder ?? level.rank
      },
      select: levelSelect
    });
  } catch (error) {
    conflictFromPrisma(error, "Level already exists in this Competition Course", "COMPETITION_LEVEL_EXISTS");
  }
}

async function removeCourseLevel({ tenantId, competitionId, courseId, courseLevelId }) {
  await requireCourseScope({ tenantId, competitionId, courseId });
  const existing = await prisma.competitionCourseLevel.findFirst({
    where: { id: courseLevelId, tenantId, competitionCourseId: courseId },
    select: { id: true }
  });
  if (!existing) throw httpError(404, "Competition course level not found", "COMPETITION_LEVEL_NOT_FOUND");
  return prisma.competitionCourseLevel.update({
    where: { id: existing.id },
    data: { isActive: false },
    select: levelSelect
  });
}

async function reorderCourseLevels({ tenantId, competitionId, courseId, orderedLevelIds }) {
  await requireCourseScope({ tenantId, competitionId, courseId });
  const activeLevels = await prisma.competitionCourseLevel.findMany({
    where: { tenantId, competitionCourseId: courseId, isActive: true },
    select: { id: true }
  });
  const activeIds = new Set(activeLevels.map(({ id }) => id));
  if (activeIds.size !== orderedLevelIds.length || orderedLevelIds.some((id) => !activeIds.has(id))) {
    throw validationError("orderedLevelIds must contain every active Competition Course Level exactly once");
  }
  await prisma.$transaction(
    orderedLevelIds.map((id, index) =>
      prisma.competitionCourseLevel.update({ where: { id }, data: { sortOrder: index + 1 } })
    )
  );
  return listCourseLevels({ tenantId, competitionId, courseId });
}


async function requireCourseLevelScope({ tenantId, competitionId, courseId, courseLevelId }) {
  await requireCourseScope({ tenantId, competitionId, courseId });
  const courseLevel = await prisma.competitionCourseLevel.findFirst({
    where: { id: courseLevelId, tenantId, competitionCourseId: courseId },
    select: levelSelect
  });
  if (!courseLevel) {
    throw httpError(404, "Competition course level not found", "COMPETITION_LEVEL_NOT_FOUND");
  }
  return courseLevel;
}

async function requireQuestionBankScope({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId
}) {
  await requireCourseLevelScope({ tenantId, competitionId, courseId, courseLevelId });
  const questionBank = await prisma.competitionQuestionBank.findFirst({
    where: {
      id: questionBankId,
      tenantId,
      competitionCourseLevelId: courseLevelId
    },
    select: questionBankSelect
  });
  if (!questionBank) {
    throw httpError(404, "Competition question bank not found", "COMPETITION_QUESTION_BANK_NOT_FOUND");
  }
  return questionBank;
}

async function listQuestionBanks({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  query = {}
}) {
  await requireCourseLevelScope({ tenantId, competitionId, courseId, courseLevelId });
  const { take, skip, limit, offset, orderBy } = parsePagination(query);
  const where = { tenantId, competitionCourseLevelId: courseLevelId };
  const status = String(query.status || "").toUpperCase();
  if (status === "ACTIVE") where.isActive = true;
  if (["ARCHIVED", "INACTIVE"].includes(status)) where.isActive = false;
  if (query.q) {
    const q = String(query.q).trim();
    if (q) where.OR = [{ name: { contains: q } }, { code: { contains: q } }];
  }
  const [total, items] = await prisma.$transaction([
    prisma.competitionQuestionBank.count({ where }),
    prisma.competitionQuestionBank.findMany({
      where,
      select: questionBankSelect,
      orderBy,
      skip,
      take
    })
  ]);
  return { total, items, limit, offset };
}

async function createQuestionBank({
  tenantId,
  userId,
  competitionId,
  courseId,
  courseLevelId,
  data
}) {
  await requireCourseLevelScope({ tenantId, competitionId, courseId, courseLevelId });
  try {
    const code = await nextGeneratedCode(
      prisma.competitionQuestionBank,
      { competitionCourseLevelId: courseLevelId },
      "QB"
    );
    return await prisma.competitionQuestionBank.create({
      data: {
        tenantId,
        competitionCourseLevelId: courseLevelId,
        createdByUserId: userId,
        ...data,
        code
      },
      select: questionBankSelect
    });
  } catch (error) {
    conflictFromPrisma(
      error,
      "Question bank code already exists in this Competition Course Level",
      "COMPETITION_QUESTION_BANK_EXISTS"
    );
  }
}

async function getQuestionBank(args) {
  return requireQuestionBankScope(args);
}

async function updateQuestionBank({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  data
}) {
  const existing = await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });
  try {
    return await prisma.competitionQuestionBank.update({
      where: { id: existing.id },
      data,
      select: questionBankSelect
    });
  } catch (error) {
    conflictFromPrisma(
      error,
      "Question bank code already exists in this Competition Course Level",
      "COMPETITION_QUESTION_BANK_EXISTS"
    );
  }
}

async function archiveQuestionBank({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId
}) {
  const existing = await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });
  return prisma.competitionQuestionBank.update({
    where: { id: existing.id },
    data: { isActive: false },
    select: questionBankSelect
  });
}


async function listCompetitionQuestionBankQuestions({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  query = {}
}) {
  const bank = await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });
  if (!bank.isActive) {
    throw httpError(409, "Archived Competition question bank is read-only", "COMPETITION_QUESTION_BANK_ARCHIVED");
  }

  const courseLevel = await requireCourseLevelScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId
  });

  const { take, skip, limit, offset } = parsePagination(query);
  const where = {
    tenantId,
    competitionQuestionBankId: questionBankId,
    questionBank: {
      tenantId,
      levelId: courseLevel.levelId,
      ...(String(query.includeInactive || "").toLowerCase() === "true"
        ? {}
        : { isActive: true })
    }
  };

  const q = String(query.q || "").trim();
  if (q) {
    where.questionBank = {
      ...where.questionBank,
      prompt: { contains: q }
    };
  }

  const difficulty = String(query.difficulty || "").trim().toUpperCase();
  if (["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
    where.questionBank = {
      ...where.questionBank,
      difficulty
    };
  }

  const [total, items] = await prisma.$transaction([
    prisma.competitionQuestionBankQuestion.count({ where }),
    prisma.competitionQuestionBankQuestion.findMany({
      where,
      select: competitionQuestionSelect,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { questionBankId: "asc" }],
      skip,
      take
    })
  ]);

  return { total, items, limit, offset };
}

async function createCompetitionQuestionBankQuestion({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  data
}) {
  const bank = await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });
  if (!bank.isActive) {
    throw httpError(409, "Archived Competition question bank is read-only", "COMPETITION_QUESTION_BANK_ARCHIVED");
  }

  const courseLevel = await requireCourseLevelScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId
  });

  const payload = normalizeCompetitionQuestionPayload(data);

  try {
    return await prisma.$transaction(async (tx) => {
      const question = await tx.questionBank.create({
        data: {
          tenantId,
          levelId: courseLevel.levelId,
          templateId: null,
          difficulty: payload.difficulty,
          prompt: payload.prompt,
          operands: JSON.stringify(payload.operands),
          operation: payload.operation,
          correctAnswer: payload.correctAnswer,
          isActive: true
        },
        select: { id: true }
      });

      const maxSort = await tx.competitionQuestionBankQuestion.aggregate({
        where: { tenantId, competitionQuestionBankId: questionBankId },
        _max: { sortOrder: true }
      });

      return tx.competitionQuestionBankQuestion.create({
        data: {
          tenantId,
          competitionQuestionBankId: questionBankId,
          questionBankId: question.id,
          sortOrder: Number(maxSort?._max?.sortOrder || 0) + 1
        },
        select: competitionQuestionSelect
      });
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw httpError(
        409,
        "A question with this prompt already exists at this ERP Level",
        "COMPETITION_QUESTION_PROMPT_EXISTS"
      );
    }
    throw error;
  }
}

async function importCompetitionQuestionBankQuestions({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  questions
}) {
  if (!Array.isArray(questions) || questions.length < 1) {
    throw validationError("questions must be a non-empty array", "COMPETITION_QUESTIONS_REQUIRED");
  }
  const bank = await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });
  if (!bank.isActive) {
    throw httpError(409, "Archived Competition question bank is read-only", "COMPETITION_QUESTION_BANK_ARCHIVED");
  }

  const courseLevel = await requireCourseLevelScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId
  });
  const normalized = questions.map((entry) => normalizeCompetitionQuestionPayload(entry));

  try {
    return await prisma.$transaction(async (tx) => {
      const maxSort = await tx.competitionQuestionBankQuestion.aggregate({
        where: { tenantId, competitionQuestionBankId: questionBankId },
        _max: { sortOrder: true }
      });
      let sortOrder = Number(maxSort?._max?.sortOrder || 0);
      const created = [];

      for (const payload of normalized) {
        let question = await tx.questionBank.findFirst({
          where: {
            tenantId,
            levelId: courseLevel.levelId,
            prompt: payload.prompt
          },
          select: { id: true }
        });

        if (!question) {
          question = await tx.questionBank.create({
            data: {
              tenantId,
              levelId: courseLevel.levelId,
              templateId: null,
              difficulty: payload.difficulty,
              prompt: payload.prompt,
              operands: JSON.stringify(payload.operands),
              operation: payload.operation,
              correctAnswer: payload.correctAnswer,
              isActive: true
            },
            select: { id: true }
          });
        }

        const existingMembership = await tx.competitionQuestionBankQuestion.findFirst({
          where: {
            tenantId,
            competitionQuestionBankId: questionBankId,
            questionBankId: question.id
          },
          select: { questionBankId: true }
        });
        if (existingMembership) continue;

        sortOrder += 1;
        const membership = await tx.competitionQuestionBankQuestion.create({
          data: {
            tenantId,
            competitionQuestionBankId: questionBankId,
            questionBankId: question.id,
            sortOrder
          },
          select: competitionQuestionSelect
        });
        created.push(membership);
      }

      return created;
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw httpError(
        409,
        "Import contains a prompt that already exists at this ERP Level",
        "COMPETITION_QUESTION_PROMPT_EXISTS"
      );
    }
    throw error;
  }
}

async function updateCompetitionQuestionBankQuestion({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  questionId,
  data
}) {
  const bank = await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });
  if (!bank.isActive) {
    throw httpError(409, "Archived Competition question bank is read-only", "COMPETITION_QUESTION_BANK_ARCHIVED");
  }

  const courseLevel = await requireCourseLevelScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId
  });

  const membership = await prisma.competitionQuestionBankQuestion.findFirst({
    where: {
      tenantId,
      competitionQuestionBankId: questionBankId,
      questionBankId: questionId,
      questionBank: { tenantId, levelId: courseLevel.levelId }
    },
    select: { questionBankId: true }
  });
  if (!membership) {
    throw httpError(404, "Question is not in this Competition question bank", "COMPETITION_QUESTION_NOT_FOUND");
  }

  const [membershipCount, worksheetReferenceCount] = await Promise.all([
    prisma.competitionQuestionBankQuestion.count({
      where: { tenantId, questionBankId: questionId }
    }),
    prisma.worksheetQuestion.count({
      where: { tenantId, questionBankId: questionId }
    })
  ]);

  if (membershipCount > 1 || worksheetReferenceCount > 0) {
    throw httpError(
      409,
      "This source question is already shared or used by a Worksheet and cannot be edited in place",
      "COMPETITION_QUESTION_SHARED_READ_ONLY"
    );
  }

  const payload = normalizeCompetitionQuestionPayload(data);
  try {
    await prisma.questionBank.update({
      where: { id: questionId },
      data: {
        ...payload,
        operands: JSON.stringify(payload.operands)
      }
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw httpError(
        409,
        "A question with this prompt already exists at this ERP Level",
        "COMPETITION_QUESTION_PROMPT_EXISTS"
      );
    }
    throw error;
  }

  return prisma.competitionQuestionBankQuestion.findUnique({
    where: {
      competitionQuestionBankId_questionBankId: {
        competitionQuestionBankId: questionBankId,
        questionBankId: questionId
      }
    },
    select: competitionQuestionSelect
  });
}

async function removeCompetitionQuestionBankQuestion({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  questionId
}) {
  const bank = await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });
  if (!bank.isActive) {
    throw httpError(409, "Archived Competition question bank is read-only", "COMPETITION_QUESTION_BANK_ARCHIVED");
  }

  const membership = await prisma.competitionQuestionBankQuestion.findFirst({
    where: {
      tenantId,
      competitionQuestionBankId: questionBankId,
      questionBankId: questionId
    },
    select: {
      competitionQuestionBankId: true,
      questionBankId: true
    }
  });

  if (!membership) {
    throw httpError(404, "Question is not in this Competition question bank", "COMPETITION_QUESTION_NOT_FOUND");
  }

  await prisma.competitionQuestionBankQuestion.delete({
    where: {
      competitionQuestionBankId_questionBankId: {
        competitionQuestionBankId: questionBankId,
        questionBankId: questionId
      }
    }
  });

  return { questionId, removed: true };
}


async function requireExecutableWorksheetForCourseLevel({
  tenantId,
  courseLevelId,
  worksheetId
}) {
  const courseLevel = await prisma.competitionCourseLevel.findFirst({
    where: {
      id: courseLevelId,
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      levelId: true
    }
  });

  if (!courseLevel) {
    throw httpError(
      404,
      "Competition course level not found",
      "COMPETITION_LEVEL_NOT_FOUND"
    );
  }

  const worksheet = await prisma.worksheet.findFirst({
    where: {
      id: worksheetId,
      tenantId,
      levelId: courseLevel.levelId,
      isPublished: true
    },
    select: {
      id: true,
      title: true,
      levelId: true,
      isPublished: true
    }
  });

  if (!worksheet) {
    throw httpError(
      400,
      "Executable worksheet must be a published worksheet from the same ERP Level",
      "COMPETITION_EXECUTABLE_WORKSHEET_INVALID"
    );
  }

  return worksheet;
}

async function requireCompetitionWorksheetScope({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  worksheetId
}) {
  await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });
  const worksheet = await prisma.competitionWorksheet.findFirst({
    where: {
      id: worksheetId,
      tenantId,
      competitionQuestionBankId: questionBankId
    },
    select: competitionWorksheetSelect
  });
  if (!worksheet) {
    throw httpError(404, "Competition worksheet not found", "COMPETITION_WORKSHEET_NOT_FOUND");
  }
  return worksheet;
}

async function listCompetitionWorksheets({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  query = {}
}) {
  await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });
  const { take, skip, limit, offset, orderBy } = parsePagination(query);
  const where = { tenantId, competitionQuestionBankId: questionBankId };
  const status = String(query.status || "").toUpperCase();
  if (status === "ACTIVE") where.isActive = true;
  if (["ARCHIVED", "INACTIVE"].includes(status)) where.isActive = false;
  if (query.q) {
    const q = String(query.q).trim();
    if (q) where.OR = [{ name: { contains: q } }, { code: { contains: q } }];
  }
  const [total, items] = await prisma.$transaction([
    prisma.competitionWorksheet.count({ where }),
    prisma.competitionWorksheet.findMany({
      where,
      select: competitionWorksheetSelect,
      orderBy,
      skip,
      take
    })
  ]);
  return { total, items, limit, offset };
}


async function buildCompetitionWorksheetFromQuestions({
  tenantId,
  userId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  data
}) {
  const bank = await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });

  if (!bank.isActive) {
    throw httpError(
      409,
      "Archived Competition question bank is read-only",
      "COMPETITION_QUESTION_BANK_ARCHIVED"
    );
  }

  const courseLevel = await requireCourseLevelScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId
  });

  if (!courseLevel.isActive) {
    throw httpError(
      409,
      "Archived Competition course level cannot create Worksheets",
      "COMPETITION_LEVEL_ARCHIVED"
    );
  }

  const name = String(data?.name || "").trim();
  const description = String(data?.description || "").trim() || null;
  const difficulty = String(data?.difficulty || "MEDIUM").trim().toUpperCase();
  const version = Number(data?.version ?? 1);
  const rawTimeLimit = data?.timeLimitSeconds;
  const timeLimitSeconds =
    rawTimeLimit === null || rawTimeLimit === undefined || rawTimeLimit === ""
      ? null
      : Number(rawTimeLimit);
  const isPublished = data?.isPublished === undefined ? true : Boolean(data.isPublished);

  const questionIds = Array.isArray(data?.questionIds)
    ? data.questionIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const uniqueQuestionIds = [...new Set(questionIds)];

  if (!name) {
    throw validationError("Worksheet name is required", "COMPETITION_WORKSHEET_NAME_REQUIRED");
  }
  if (!Number.isInteger(version) || version < 1) {
    throw validationError("Worksheet version must be a positive integer", "COMPETITION_WORKSHEET_VERSION_INVALID");
  }
  if (!["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
    throw validationError(
      "Worksheet difficulty must be EASY, MEDIUM, or HARD",
      "COMPETITION_WORKSHEET_DIFFICULTY_INVALID"
    );
  }
  if (
    timeLimitSeconds !== null &&
    (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 30 || timeLimitSeconds > 7200)
  ) {
    throw validationError(
      "timeLimitSeconds must be between 30 and 7200 seconds",
      "COMPETITION_WORKSHEET_TIME_LIMIT_INVALID"
    );
  }
  if (!uniqueQuestionIds.length) {
    throw validationError(
      "Select at least one question for the Worksheet",
      "COMPETITION_WORKSHEET_QUESTIONS_REQUIRED"
    );
  }

  const memberships = await prisma.competitionQuestionBankQuestion.findMany({
    where: {
      tenantId,
      competitionQuestionBankId: questionBankId,
      questionBankId: { in: uniqueQuestionIds },
      questionBank: {
        tenantId,
        levelId: courseLevel.levelId,
        isActive: true
      }
    },
    select: competitionQuestionSelect
  });

  if (memberships.length !== uniqueQuestionIds.length) {
    throw httpError(
      409,
      "One or more selected questions are not active members of this Competition Question Bank",
      "COMPETITION_WORKSHEET_QUESTION_SCOPE_MISMATCH"
    );
  }

  const membershipByQuestionId = new Map(
    memberships.map((membership) => [membership.questionBankId, membership])
  );

  try {
    const competitionWorksheetId = await prisma.$transaction(async (tx) => {
      const code = await nextGeneratedCode(
        tx.competitionWorksheet,
        { competitionQuestionBankId: questionBankId },
        "WS"
      );
      const worksheet = await tx.worksheet.create({
        data: {
          tenantId,
          title: name,
          description,
          difficulty,
          levelId: courseLevel.levelId,
          createdByUserId: userId,
          isPublished,
          generationMode: null,
          timeLimitSeconds
        },
        select: { id: true }
      });

      await tx.worksheetQuestion.createMany({
        data: uniqueQuestionIds.map((questionId, index) => {
          const source = membershipByQuestionId.get(questionId)?.questionBank;
          return {
            tenantId,
            worksheetId: worksheet.id,
            questionBankId: source.id,
            questionNumber: index + 1,
            operands: source.operands,
            operation: source.operation,
            correctAnswer: source.correctAnswer
          };
        })
      });

      const competitionWorksheet = await tx.competitionWorksheet.create({
        data: {
          tenantId,
          competitionQuestionBankId: questionBankId,
          worksheetId: worksheet.id,
          name,
          code,
          description,
          version,
          createdByUserId: userId,
          isActive: true
        },
        select: { id: true }
      });

      return competitionWorksheet.id;
    });

    return prisma.competitionWorksheet.findFirst({
      where: {
        id: competitionWorksheetId,
        tenantId,
        competitionQuestionBankId: questionBankId
      },
      select: competitionWorksheetSelect
    });
  } catch (error) {
    conflictFromPrisma(
      error,
      "Worksheet code already exists in this Competition Question Bank",
      "COMPETITION_WORKSHEET_EXISTS"
    );
  }
}

async function createCompetitionWorksheet({
  tenantId,
  userId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  data
}) {
  await requireQuestionBankScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId
  });

  await requireExecutableWorksheetForCourseLevel({
    tenantId,
    courseLevelId,
    worksheetId: data.worksheetId
  });

  try {
    const code = await nextGeneratedCode(
      prisma.competitionWorksheet,
      { competitionQuestionBankId: questionBankId },
      "WS"
    );
    return await prisma.competitionWorksheet.create({
      data: {
        tenantId,
        competitionQuestionBankId: questionBankId,
        createdByUserId: userId,
        ...data,
        code
      },
      select: competitionWorksheetSelect
    });
  } catch (error) {
    conflictFromPrisma(
      error,
      "Worksheet code already exists in this Competition Question Bank",
      "COMPETITION_WORKSHEET_EXISTS"
    );
  }
}

async function getCompetitionWorksheet(args) {
  return requireCompetitionWorksheetScope(args);
}

async function updateCompetitionWorksheet({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  worksheetId,
  data
}) {
  const existing = await requireCompetitionWorksheetScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId,
    worksheetId
  });

  if (data.worksheetId !== undefined) {
    await requireExecutableWorksheetForCourseLevel({
      tenantId,
      courseLevelId,
      worksheetId: data.worksheetId
    });
  }

  try {
    return await prisma.competitionWorksheet.update({
      where: { id: existing.id },
      data,
      select: competitionWorksheetSelect
    });
  } catch (error) {
    conflictFromPrisma(
      error,
      "Worksheet code already exists in this Competition Question Bank",
      "COMPETITION_WORKSHEET_EXISTS"
    );
  }
}

async function archiveCompetitionWorksheet({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  worksheetId
}) {
  const existing = await requireCompetitionWorksheetScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId,
    worksheetId
  });
  return prisma.competitionWorksheet.update({
    where: { id: existing.id },
    data: { isActive: false },
    select: competitionWorksheetSelect
  });
}


const competitionWorksheetAssignmentSelect = {
  id: true,
  competitionWorksheetId: true,
  businessPartnerId: true,
  createdByUserId: true,
  assignedAt: true,
  isActive: true,
  deactivatedAt: true,
  createdAt: true,
  updatedAt: true,
  businessPartner: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      status: true,
      isActive: true
    }
  }
};

async function listCompetitionWorksheetAssignments({
  tenantId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  worksheetId
}) {
  await requireCompetitionWorksheetScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId,
    worksheetId
  });

  return prisma.competitionWorksheetAssignment.findMany({
    where: {
      tenantId,
      competitionWorksheetId: worksheetId,
      isActive: true
    },
    select: competitionWorksheetAssignmentSelect,
    orderBy: [{ assignedAt: "asc" }, { createdAt: "asc" }]
  });
}

async function replaceCompetitionWorksheetAssignments({
  tenantId,
  userId,
  competitionId,
  courseId,
  courseLevelId,
  questionBankId,
  worksheetId,
  businessPartnerIds
}) {
  const worksheet = await requireCompetitionWorksheetScope({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId,
    worksheetId
  });

  if (!worksheet.isActive) {
    throw httpError(
      409,
      "Archived Competition worksheet cannot be assigned",
      "COMPETITION_WORKSHEET_ARCHIVED"
    );
  }

  const uniqueBusinessPartnerIds = [...new Set(businessPartnerIds)];

  if (uniqueBusinessPartnerIds.length) {
    const eligiblePartners = await prisma.businessPartner.findMany({
      where: {
        id: { in: uniqueBusinessPartnerIds },
        tenantId,
        isActive: true,
        status: "ACTIVE"
      },
      select: { id: true }
    });

    if (eligiblePartners.length !== uniqueBusinessPartnerIds.length) {
      throw httpError(
        400,
        "One or more Business Partners are invalid, inactive, or outside this tenant",
        "COMPETITION_WORKSHEET_BP_INVALID"
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    // A Business Partner can execute exactly one Worksheet for each
    // Competition Course + Level track. Assigning a BP here moves that BP
    // away from any other active Worksheet under the same Course Level.
    if (uniqueBusinessPartnerIds.length) {
      await tx.competitionWorksheetAssignment.updateMany({
        where: {
          tenantId,
          businessPartnerId: { in: uniqueBusinessPartnerIds },
          isActive: true,
          competitionWorksheetId: { not: worksheetId },
          competitionWorksheet: {
            is: {
              isActive: true,
              competitionQuestionBank: {
                is: {
                  competitionCourseLevelId: courseLevelId
                }
              }
            }
          }
        },
        data: {
          isActive: false,
          deactivatedAt: new Date()
        }
      });
    }

    await tx.competitionWorksheetAssignment.updateMany({
      where: {
        tenantId,
        competitionWorksheetId: worksheetId,
        isActive: true,
        ...(uniqueBusinessPartnerIds.length
          ? { businessPartnerId: { notIn: uniqueBusinessPartnerIds } }
          : {})
      },
      data: {
        isActive: false,
        deactivatedAt: new Date()
      }
    });

    for (const businessPartnerId of uniqueBusinessPartnerIds) {
      const existing = await tx.competitionWorksheetAssignment.findFirst({
        where: {
          tenantId,
          competitionWorksheetId: worksheetId,
          businessPartnerId
        },
        select: { id: true, isActive: true }
      });

      if (existing) {
        if (!existing.isActive) {
          await tx.competitionWorksheetAssignment.update({
            where: { id: existing.id },
            data: {
              isActive: true,
              deactivatedAt: null,
              assignedAt: new Date(),
              createdByUserId: userId
            }
          });
        }
      } else {
        await tx.competitionWorksheetAssignment.create({
          data: {
            tenantId,
            competitionWorksheetId: worksheetId,
            businessPartnerId,
            createdByUserId: userId
          }
        });
      }
    }
  });

  return listCompetitionWorksheetAssignments({
    tenantId,
    competitionId,
    courseId,
    courseLevelId,
    questionBankId,
    worksheetId
  });
}

export {
  addCourseLevel,
  archiveCourse,
  restoreCourse,
  archiveQuestionBank,
  archiveCompetitionWorksheet,
  archiveSeason,
  createCourse,
  createQuestionBank,
  createCompetitionWorksheet,
  buildCompetitionWorksheetFromQuestions,
  createSeason,
  getCourse,
  getQuestionBank,
  getCompetitionWorksheet,
  getSeason,
  listCourseLevels,
  listCourses,
  listCompetitionReuseSources,
  copyCompetitionResources,
  listQuestionBanks,
  listCompetitionQuestionBankQuestions,
  createCompetitionQuestionBankQuestion,
  importCompetitionQuestionBankQuestions,
  updateCompetitionQuestionBankQuestion,
  removeCompetitionQuestionBankQuestion,
  listCompetitionWorksheets,
  listCompetitionWorksheetAssignments,
  listSeasons,
  removeCourseLevel,
  reorderCourseLevels,
  replaceCompetitionWorksheetAssignments,
  updateCourse,
  updateQuestionBank,
  updateCompetitionWorksheet,
  updateSeason
};
