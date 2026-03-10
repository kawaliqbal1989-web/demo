import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_FILE = "WORKBOOK_L1_PART_A_structured.json";
const DEFAULT_TENANT = "tenant_default";
const DEFAULT_LEVEL_RANK = 1;
const DEFAULT_DIFFICULTY = "EASY";
const DEFAULT_CREATED_BY_USERNAME = "SA001";
const DEFAULT_WORKSHEET_TITLE = "Abacus L1 Part A - Single Rod Lower Deck";

const KEYS = [
  "Unnamed: 1",
  "Unnamed: 2",
  "Unnamed: 3",
  "Unnamed: 4",
  "Unnamed: 5",
  "TIME TAKEN: ______MIN ______SEC",
  "Unnamed: 7",
  "Unnamed: 8",
  "Unnamed: 9",
  "Unnamed: 10",
  "Unnamed: 11",
  "Unnamed: 12"
];

function parseArgs(argv) {
  const out = {
    file: DEFAULT_FILE,
    tenantId: DEFAULT_TENANT,
    levelRank: DEFAULT_LEVEL_RANK,
    difficulty: DEFAULT_DIFFICULTY,
    createdByUsername: DEFAULT_CREATED_BY_USERNAME,
    worksheetTitle: DEFAULT_WORKSHEET_TITLE,
    createWorksheet: true,
    replaceWorksheetQuestions: true
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
    if (arg === "--level-rank" && next) {
      out.levelRank = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--difficulty" && next) {
      out.difficulty = String(next).trim().toUpperCase();
      i += 1;
      continue;
    }
    if (arg === "--created-by" && next) {
      out.createdByUsername = next;
      i += 1;
      continue;
    }
    if (arg === "--worksheet-title" && next) {
      out.worksheetTitle = next;
      i += 1;
      continue;
    }
    if (arg === "--no-worksheet") {
      out.createWorksheet = false;
      continue;
    }
    if (arg === "--no-replace") {
      out.replaceWorksheetQuestions = false;
      continue;
    }
  }

  return out;
}

function isNumericRow(row) {
  return Boolean(row) && KEYS.every((k) => typeof row[k] === "number");
}

function isSectionHeaderRow(row) {
  const tag = row?.["DATE: _______________"];
  if (typeof tag !== "string") return false;
  const trimmed = tag.trim();
  if (!trimmed) return false;
  // Workbook section headers look like: "SINGLE ROD LOWER DECK – 3 OPERATIONS"
  return /ROD|SMALL FRIENDS|MIXED SUMS|DUPLEX|TEN\u2019S|TEN'S/i.test(trimmed);
}

function formatOps(ops) {
  return ops
    .map((v, idx) => {
      if (idx === 0) {
        return String(v);
      }
      return v >= 0 ? `+${v}` : String(v);
    })
    .join(" ");
}

function assertValidDifficulty(difficulty) {
  if (!["EASY", "MEDIUM", "HARD"].includes(difficulty)) {
    const error = new Error("difficulty must be EASY, MEDIUM, or HARD");
    error.code = "VALIDATION_ERROR";
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  assertValidDifficulty(args.difficulty);

  const filePath = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workbook file not found: ${filePath}`);
  }

  const workbook = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const rows = workbook.Sheet1 || [];

  const level = await prisma.level.findFirst({
    where: {
      tenantId: args.tenantId,
      rank: args.levelRank
    },
    select: {
      id: true,
      name: true,
      rank: true
    }
  });

  if (!level) {
    throw new Error(`Level not found for tenantId=${args.tenantId} rank=${args.levelRank}`);
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

  const blocks = [];
  let currentSectionTitle = null;
  for (let i = 0; i < rows.length; i += 1) {
    const headerRow = rows[i];
    const tag = headerRow?.["DATE: _______________"];
    const a = headerRow?.["Unnamed: 1"];

    if (isSectionHeaderRow(headerRow)) {
      currentSectionTitle = String(tag).trim();
      continue;
    }

    if (typeof tag === "string" && tag.length === 1 && a === "A") {
      const r1 = rows[i + 1];
      const r2 = rows[i + 2];
      const r3 = rows[i + 3];
      const r4 = rows[i + 4];

      // Some sections are 3 operations, some are 4 operations.
      if (isNumericRow(r1) && isNumericRow(r2) && isNumericRow(r3) && isNumericRow(r4)) {
        blocks.push({
          letter: tag,
          headerRow,
          rows: [r1, r2, r3, r4],
          sectionTitle: currentSectionTitle
        });
      } else if (isNumericRow(r1) && isNumericRow(r2) && isNumericRow(r3)) {
        blocks.push({
          letter: tag,
          headerRow,
          rows: [r1, r2, r3],
          sectionTitle: currentSectionTitle
        });
      }
    }
  }

  if (!blocks.length) {
    throw new Error("No question blocks detected in workbook JSON");
  }

  const entries = [];
  const orderedPrompts = [];
  for (const block of blocks) {
    for (const key of KEYS) {
      const colLabel = block.headerRow?.[key] ? String(block.headerRow[key]) : key;
      const ops = block.rows.map((r) => r[key]);
      if (!ops.every((v) => typeof v === "number" && Number.isFinite(v))) {
        continue;
      }

      const correctAnswer = ops.reduce((sum, v) => sum + v, 0);
      const sectionPrefix = block.sectionTitle ? `[${block.sectionTitle}] ` : "";
      const prompt = `${sectionPrefix}${block.letter}${colLabel}: ${formatOps(ops)}`;

      orderedPrompts.push(prompt);
      entries.push({
        tenantId: args.tenantId,
        levelId: level.id,
        difficulty: args.difficulty,
        prompt,
        operands: {
          nums: ops,
          source: {
            sectionTitle: block.sectionTitle || null,
            block: block.letter,
            column: colLabel,
            importedFrom: path.basename(filePath)
          }
        },
        operation: "COLUMN_SUM",
        correctAnswer
      });
    }
  }

  const created = await prisma.questionBank.createMany({
    data: entries,
    skipDuplicates: true
  });

  let worksheetResult = null;
  if (args.createWorksheet) {
    worksheetResult = await prisma.$transaction(async (tx) => {
      const existing = await tx.worksheet.findFirst({
        where: {
          tenantId: args.tenantId,
          levelId: level.id,
          title: args.worksheetTitle
        },
        select: {
          id: true
        }
      });

      const worksheet = existing
        ? await tx.worksheet.update({
            where: { id: existing.id },
            data: {
              difficulty: args.difficulty,
              timeLimitSeconds: 600,
              isPublished: false
            }
          })
        : await tx.worksheet.create({
            data: {
              tenantId: args.tenantId,
              title: args.worksheetTitle,
              description: `Imported from ${path.basename(filePath)} into ${level.name}`,
              difficulty: args.difficulty,
              levelId: level.id,
              createdByUserId: createdBy.id,
              isPublished: false,
              timeLimitSeconds: 600
            }
          });

      if (args.replaceWorksheetQuestions) {
        await tx.worksheetQuestion.deleteMany({
          where: {
            tenantId: args.tenantId,
            worksheetId: worksheet.id
          }
        });
      }

      const questions = await tx.questionBank.findMany({
        where: {
          tenantId: args.tenantId,
          levelId: level.id,
          prompt: { in: orderedPrompts }
        },
        select: {
          id: true,
          prompt: true,
          operands: true,
          operation: true,
          correctAnswer: true
        }
      });

      const byPrompt = new Map(questions.map((q) => [q.prompt, q]));
      const rows = [];
      let questionNumber = 1;
      for (const prompt of orderedPrompts) {
        const q = byPrompt.get(prompt);
        if (!q) {
          continue;
        }
        rows.push({
          tenantId: args.tenantId,
          worksheetId: worksheet.id,
          questionBankId: q.id,
          questionNumber,
          operands: q.operands,
          operation: q.operation,
          correctAnswer: q.correctAnswer
        });
        questionNumber += 1;
      }

      if (rows.length) {
        await tx.worksheetQuestion.createMany({ data: rows });
      }

      return {
        worksheetId: worksheet.id,
        questionsAdded: rows.length,
        replaced: args.replaceWorksheetQuestions
      };
    });
  }

  console.log(
    JSON.stringify(
      {
        file: filePath,
        tenantId: args.tenantId,
        level: level,
        createdBy: createdBy,
        blocks: blocks.length,
        questionsDetected: entries.length,
        questionBankInserted: created.count,
        worksheet: worksheetResult
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
