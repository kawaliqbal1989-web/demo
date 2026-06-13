import fs from "fs";
const raw = fs.readFileSync("validation-logs/09_workflow_execution.log", "utf16le").replace(/^\uFEFF+/, "").trim();
const j = JSON.parse(raw);
const out = {
  examCycleId: j?.dbVerification?.examCycleId,
  configRows: j?.dbVerification?.examLevelAssessmentConfigRows,
  generatedRowsCount: (j?.dbVerification?.examGeneratedQuestionSetRows || []).length,
  generatedRows: j?.dbVerification?.examGeneratedQuestionSetRows,
  studentABComparison: j?.dbVerification?.studentABComparison,
  runtimeScriptError: j?.runtimeError || null
};
console.log(JSON.stringify(out, null, 2));
