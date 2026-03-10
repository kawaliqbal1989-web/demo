import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_FILE = "ABACUS_LEVEL_1_COMPLETE_IMPORT.json";
const DEFAULT_TENANT = "tenant_default";
const DEFAULT_CREATED_BY_USERNAME = "SA001";
const DEFAULT_WORKSHEET_TIME_LIMIT_SECONDS = 600;

function parseArgs(argv) {
  const out = {
    file: DEFAULT_FILE,
    tenantId: DEFAULT_TENANT,
    createdByUsername: DEFAULT_CREATED_BY_USERNAME,
    replaceWorksheetQuestions: true,
    worksheetTitlePrefix: "",
    dryRun: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--file" && next) {
      out.file = next;
      i += 1;
      continue;
    }
    if (arg === "--tenant" && next) {
      out.tenantId = next;
      i += 1;
      continue;
    }
    if (arg === "--created-by" && next) {
      out.createdByUsername = next;
      i += 1;
      continue;
    }
    if (arg === "--worksheet-title-prefix" && next) {
      out.worksheetTitlePrefix = next;
      i += 1;
      continue;
    }
    if (arg === "--no-replace") {
      out.replaceWorksheetQuestions = false;
      continue;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
  }

  return out;
}

function sumFromPrompt(prompt) {
  const nums = String(prompt)
    .match(/-?\d+/g)
    ?.map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  if (!nums?.length) return null;
  return { nums, sum: nums.reduce((a, b) => a + b, 0) };
}

function difficultyToEnum(d) {
  const n = Number(d);
  if (n === 2) return "MEDIUM";
  if (n === 3) return "HARD";
  return "EASY";
}

function resolveWorksheetDifficulty(questions) {
  const max = Math.max(
    1,
    ...questions
      .map((q) => Number(q?.difficulty))
      .filter((n) => Number.isFinite(n) && n >= 1)
  );
  return difficultyToEnum(max);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const filePath = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Import file not found: ${filePath}`);
  }

  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const levelRank = Number(payload?.level?.rank);
  if (!Number.isFinite(levelRank) || levelRank < 1) {
    throw new Error("Invalid payload.level.rank in JSON");
  }

  const worksheets = payload?.level?.worksheets || [];
  if (!Array.isArray(worksheets) || worksheets.length === 0) {
    throw new Error("No worksheets found in payload.level.worksheets");
  }

  const level = await prisma.level.findFirst({
    where: {
      tenantId: args.tenantId,
      rank: levelRank
    },
    select: {
      id: true,
      name: true,
      rank: true
    }
  });
  if (!level) {
    throw new Error(`Level not found for tenantId=${args.tenantId} rank=${levelRank}`);
  }

  const createdBy = await prisma.authUser.findFirst({
    where: {
      tenantId: args.tenantId,
      username: args.createdByUsername,
      isActive: true
    },
    select: {
      id: true,
      username: true,
      role: true
    }
  });
  if (!createdBy) {
    throw new Error(`AuthUser not found for createdBy username=${args.createdByUsername} tenantId=${args.tenantId}`);
  }

  let questionsTotal = 0;
  let mismatches = 0;
  const questionBankData = [];

  for (const ws of worksheets) {
    const qs = ws?.questions || [];
    questionsTotal += qs.length;
    for (let idx = 0; idx < qs.length; idx += 1) {
      const q = qs[idx];
      const prompt = String(q?.prompt || "").trim();
      if (!prompt) {
        continue;
      }
      const parsed = sumFromPrompt(prompt);
      const expected = parsed?.sum;
      const answer = Number(q?.answer);
      if (parsed && Number.isFinite(answer) && answer !== expected) {
        mismatches += 1;
      }

      const resolvedAnswer = Number.isFinite(answer) ? answer : expected;
      if (!Number.isFinite(resolvedAnswer)) {
        continue;
      }

      questionBankData.push({
        tenantId: args.tenantId,
        levelId: level.id,
        difficulty: difficultyToEnum(q?.difficulty),
        prompt,
        operands: {
          nums: parsed?.nums || null,
          source: {
            courseName: payload?.courseName || null,
            levelTitle: payload?.level?.title || null,
            worksheetCode: ws?.worksheetCode || null,
            worksheetTitle: ws?.worksheetTitle || null,
            questionIndex: idx
          }
        },
        operation: String(q?.operationType || "COLUMN_SUM"),
        correctAnswer: Math.trunc(resolvedAnswer)
      });
    }
  }

  const uniquePrompts = Array.from(new Set(questionBankData.map((q) => q.prompt)));

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        {
          file: filePath,
          tenantId: args.tenantId,
          level,
          createdBy,
          worksheets: worksheets.length,
          questionsTotal,
          uniquePrompts: uniquePrompts.length,
          promptSumMismatches: mismatches,
          mode: "dry-run"
        },
        null,
        2
      )
    );
    return;
  }

  const qbCreateResult = await prisma.questionBank.createMany({
    data: questionBankData,
    skipDuplicates: true
  });

  const promptToQB = new Map();
  for (const promptChunk of chunk(uniquePrompts, 500)) {
    const rows = await prisma.questionBank.findMany({
      where: {
        tenantId: args.tenantId,
        levelId: level.id,
        prompt: { in: promptChunk }
      },
      select: {
        id: true,
        prompt: true,
        operands: true,
        operation: true,
        correctAnswer: true
      }
    });
    for (const r of rows) {
      promptToQB.set(r.prompt, r);
    }
  }

  let worksheetsCreated = 0;
  let worksheetsUpdated = 0;
  let worksheetQuestionsInserted = 0;

  for (const ws of worksheets) {
    const worksheetCode = String(ws?.worksheetCode || "").trim();
    const worksheetTitle = String(ws?.worksheetTitle || "").trim();
    if (!worksheetCode || !worksheetTitle) {
      continue;
    }

    const titleBase = `${worksheetCode} - ${worksheetTitle}`;
    const title = args.worksheetTitlePrefix ? `${args.worksheetTitlePrefix}${titleBase}` : titleBase;

    const qs = ws?.questions || [];
    const difficulty = resolveWorksheetDifficulty(qs);

    const worksheet = await prisma.$transaction(async (tx) => {
      const existing = await tx.worksheet.findFirst({
        where: {
          tenantId: args.tenantId,
          levelId: level.id,
          title
        },
        select: { id: true }
      });

      const saved = existing
        ? await tx.worksheet.update({
            where: { id: existing.id },
            data: {
              difficulty,
              timeLimitSeconds: DEFAULT_WORKSHEET_TIME_LIMIT_SECONDS,
              isPublished: false
            },
            select: { id: true }
          })
        : await tx.worksheet.create({
            data: {
              tenantId: args.tenantId,
              title,
              description: `Imported from ${path.basename(filePath)} (${payload?.courseName || "Course"} - ${payload?.level?.title || "Level"})`,
              difficulty,
              levelId: level.id,
              createdByUserId: createdBy.id,
              isPublished: false,
              timeLimitSeconds: DEFAULT_WORKSHEET_TIME_LIMIT_SECONDS
            },
            select: { id: true }
          });

      if (existing) {
        worksheetsUpdated += 1;
      } else {
        worksheetsCreated += 1;
      }

      if (args.replaceWorksheetQuestions) {
        await tx.worksheetQuestion.deleteMany({
          where: {
            tenantId: args.tenantId,
            worksheetId: saved.id
          }
        });
      }

      const rows = [];
      let questionNumber = 1;
      for (let i = 0; i < qs.length; i += 1) {
        const q = qs[i];
        const prompt = String(q?.prompt || "").trim();
        if (!prompt) {
          continue;
        }
        const qb = promptToQB.get(prompt);
        if (!qb) {
          continue;
        }
        rows.push({
          tenantId: args.tenantId,
          worksheetId: saved.id,
          questionBankId: qb.id,
          questionNumber,
          operands: qb.operands,
          operation: qb.operation,
          correctAnswer: qb.correctAnswer
        });
        questionNumber += 1;
      }

      if (rows.length) {
        await tx.worksheetQuestion.createMany({ data: rows });
        worksheetQuestionsInserted += rows.length;
      }

      return saved;
    });

    void worksheet;
  }

  console.log(
    JSON.stringify(
      {
        file: filePath,
        tenantId: args.tenantId,
        level,
        createdBy,
        worksheets: worksheets.length,
        questionsTotal,
        uniquePrompts: uniquePrompts.length,
        promptSumMismatches: mismatches,
        questionBankInserted: qbCreateResult.count,
        worksheetsCreated,
        worksheetsUpdated,
        worksheetQuestionsInserted,
        replaceWorksheetQuestions: args.replaceWorksheetQuestions
      },
      null,
      2
    )
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
