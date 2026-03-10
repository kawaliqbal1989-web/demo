import fs from "fs";
import path from "path";

const file = process.argv[2] || "ABACUS_LEVEL_1_COMPLETE_IMPORT.json";
const filePath = path.isAbsolute(file) ? file : path.join(process.cwd(), file);

const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
const worksheets = json?.level?.worksheets || [];

const opCounts = new Map();
const diffCounts = new Map();
let questionsTotal = 0;
let missingAnswer = 0;
let badAnswer = 0;

function sumFromPrompt(prompt) {
  const nums = String(prompt)
    .match(/-?\d+/g)
    ?.map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  if (!nums?.length) return null;
  return nums.reduce((a, b) => a + b, 0);
}

for (const ws of worksheets) {
  const qs = ws?.questions || [];
  questionsTotal += qs.length;
  for (const q of qs) {
    const op = q?.operationType || "(missing)";
    opCounts.set(op, (opCounts.get(op) || 0) + 1);

    const d = Number(q?.difficulty);
    const dKey = Number.isFinite(d) ? String(d) : "(missing)";
    diffCounts.set(dKey, (diffCounts.get(dKey) || 0) + 1);

    if (q?.answer === null || q?.answer === undefined) {
      missingAnswer += 1;
      continue;
    }
    const expected = sumFromPrompt(q?.prompt);
    if (expected === null) {
      continue;
    }
    if (Number(q.answer) !== expected) {
      badAnswer += 1;
    }
  }
}

const opTypes = Array.from(opCounts.entries()).sort((a, b) => b[1] - a[1]);
const diffs = Array.from(diffCounts.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));

console.log(
  JSON.stringify(
    {
      file: filePath,
      courseName: json?.courseName,
      level: {
        rank: json?.level?.rank,
        title: json?.level?.title
      },
      worksheets: worksheets.length,
      questionsTotal,
      operationTypes: opTypes,
      difficultyCounts: diffs,
      missingAnswer,
      promptSumMismatches: badAnswer
    },
    null,
    2
  )
);
