import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { prisma } from "../src/lib/prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const options = {
    apply: false,
    tenantId: null,
    levelId: null,
    sqlFile: path.resolve(__dirname, "..", "abacusweb.sql")
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--tenant" && next) {
      options.tenantId = String(next).trim() || null;
      index += 1;
      continue;
    }

    if (arg === "--level" && next) {
      options.levelId = String(next).trim() || null;
      index += 1;
      continue;
    }

    if (arg === "--sql-file" && next) {
      options.sqlFile = path.resolve(process.cwd(), next);
      index += 1;
    }
  }

  return options;
}

function chunk(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function normalizePrompt(prompt) {
  return String(prompt || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/operations\s*-\s*/gi, "operations - ")
    .toLowerCase();
}

function normalizeOperation(operation) {
  return String(operation || "").trim().toUpperCase();
}

function hasOwnProperty(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function hasRenderableOperands(operands) {
  if (!operands || typeof operands !== "object") {
    return false;
  }

  if (typeof operands.expr === "string" && operands.expr.trim()) {
    return true;
  }

  if (Array.isArray(operands.nums) && operands.nums.length > 0) {
    return true;
  }

  if (Array.isArray(operands.terms) && operands.terms.length > 0) {
    return true;
  }

  return ["a", "b", "left", "right", "x", "y"].some((key) => hasOwnProperty(operands, key));
}

function decodeSqlString(value) {
  return String(value)
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseSqlToken(token) {
  const trimmed = String(token || "").trim();
  if (!trimmed || trimmed === "NULL") {
    return null;
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return decodeSqlString(trimmed.slice(1, -1));
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

function parseSqlTuple(line) {
  let text = String(line || "").trim();
  if (!text.startsWith("(")) {
    return null;
  }

  if (text.endsWith(",") || text.endsWith(";")) {
    text = text.slice(0, -1);
  }

  if (!text.endsWith(")")) {
    return null;
  }

  text = text.slice(1, -1);

  const values = [];
  let current = "";
  let inQuote = false;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\" && inQuote) {
      current += char;
      escaped = true;
      continue;
    }

    if (char === "'") {
      inQuote = !inQuote;
      current += char;
      continue;
    }

    if (char === "," && !inQuote) {
      values.push(parseSqlToken(current));
      current = "";
      continue;
    }

    current += char;
  }

  values.push(parseSqlToken(current));
  return values;
}

function buildPromptKey({ prompt, operation, correctAnswer }) {
  return `${normalizePrompt(prompt)}|${normalizeOperation(operation)}|${Number(correctAnswer)}`;
}

function loadPromptMap(sqlFile) {
  if (!fs.existsSync(sqlFile)) {
    throw new Error(`SQL dump not found: ${sqlFile}`);
  }

  const content = fs.readFileSync(sqlFile, "utf8");
  const lines = content.split(/\r?\n/);
  const promptMap = new Map();
  let inQuestionBankInsert = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("INSERT INTO `questionbank`")) {
      inQuestionBankInsert = true;
      continue;
    }

    if (!inQuestionBankInsert) {
      continue;
    }

    if (!trimmed.startsWith("(")) {
      continue;
    }

    const fields = parseSqlTuple(trimmed);
    if (!fields || fields.length < 9) {
      if (trimmed.endsWith(");")) {
        inQuestionBankInsert = false;
      }
      continue;
    }

    const prompt = fields[5];
    const operandsText = fields[6];
    const operation = fields[7];
    const correctAnswer = fields[8];

    if (typeof prompt !== "string" || typeof operandsText !== "string" || !Number.isFinite(Number(correctAnswer))) {
      if (trimmed.endsWith(");")) {
        inQuestionBankInsert = false;
      }
      continue;
    }

    try {
      const operands = JSON.parse(operandsText);
      if (!hasRenderableOperands(operands)) {
        if (trimmed.endsWith(");")) {
          inQuestionBankInsert = false;
        }
        continue;
      }

      const key = buildPromptKey({ prompt, operation, correctAnswer });
      if (!promptMap.has(key)) {
        promptMap.set(key, operands);
      }
    } catch {
      // Ignore malformed rows in the dump.
    }

    if (trimmed.endsWith(");")) {
      inQuestionBankInsert = false;
    }
  }

  return promptMap;
}

async function applyUpdatesInBatches(updates, runUpdate) {
  for (const batch of chunk(updates, 50)) {
    await prisma.$transaction(batch.map((item) => runUpdate(item)));
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const promptMap = loadPromptMap(options.sqlFile);

  const scopedWhere = {
    ...(options.tenantId ? { tenantId: options.tenantId } : {}),
    ...(options.levelId ? { levelId: options.levelId } : {})
  };

  const questionBankRows = await prisma.questionBank.findMany({
    where: scopedWhere,
    select: {
      id: true,
      tenantId: true,
      levelId: true,
      prompt: true,
      operands: true,
      operation: true,
      correctAnswer: true
    }
  });

  const questionBankUpdates = questionBankRows
    .filter((row) => !hasRenderableOperands(row.operands))
    .map((row) => {
      const repairedOperands = promptMap.get(buildPromptKey(row));
      return repairedOperands ? { id: row.id, prompt: row.prompt, operands: repairedOperands } : null;
    })
    .filter(Boolean);

  const unresolvedQuestionBank = questionBankRows
    .filter((row) => !hasRenderableOperands(row.operands))
    .filter((row) => !promptMap.has(buildPromptKey(row)))
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      prompt: row.prompt,
      operation: row.operation,
      correctAnswer: row.correctAnswer
    }));

  const worksheetQuestionRows = await prisma.worksheetQuestion.findMany({
    where: {
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
      ...(options.levelId
        ? {
            worksheet: {
              is: { levelId: options.levelId }
            }
          }
        : {}),
      questionBankId: { not: null }
    },
    select: {
      id: true,
      operands: true,
      questionBank: {
        select: {
          prompt: true,
          operation: true,
          correctAnswer: true,
          operands: true
        }
      }
    }
  });

  const worksheetQuestionUpdates = worksheetQuestionRows
    .filter((row) => !hasRenderableOperands(row.operands))
    .map((row) => {
      const source = row.questionBank;
      if (!source) {
        return null;
      }

      const repairedOperands = hasRenderableOperands(source.operands)
        ? source.operands
        : promptMap.get(buildPromptKey(source));

      return repairedOperands ? { id: row.id, operands: repairedOperands, prompt: source.prompt } : null;
    })
    .filter(Boolean);

  const unresolvedWorksheetQuestions = worksheetQuestionRows
    .filter((row) => !hasRenderableOperands(row.operands))
    .filter((row) => {
      const source = row.questionBank;
      if (!source) {
        return true;
      }
      return !hasRenderableOperands(source.operands) && !promptMap.has(buildPromptKey(source));
    })
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      prompt: row.questionBank?.prompt || null,
      operation: row.questionBank?.operation || null,
      correctAnswer: row.questionBank?.correctAnswer || null
    }));

  if (options.apply) {
    await applyUpdatesInBatches(questionBankUpdates, (item) =>
      prisma.questionBank.update({
        where: { id: item.id },
        data: { operands: item.operands }
      })
    );

    await applyUpdatesInBatches(worksheetQuestionUpdates, (item) =>
      prisma.worksheetQuestion.update({
        where: { id: item.id },
        data: { operands: item.operands }
      })
    );
  }

  console.log(
    JSON.stringify(
      {
        dryRun: !options.apply,
        tenantId: options.tenantId,
        levelId: options.levelId,
        sqlFile: options.sqlFile,
        promptMappingsLoaded: promptMap.size,
        questionBankCandidates: questionBankRows.filter((row) => !hasRenderableOperands(row.operands)).length,
        questionBankMatched: questionBankUpdates.length,
        worksheetQuestionCandidates: worksheetQuestionRows.filter((row) => !hasRenderableOperands(row.operands)).length,
        worksheetQuestionMatched: worksheetQuestionUpdates.length,
        unresolvedQuestionBank,
        unresolvedWorksheetQuestions
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