import fs from "fs";
const wb = JSON.parse(fs.readFileSync("WORKBOOK_L1_PART_A_structured.json", "utf8"));
const rows = wb.Sheet1 || [];
const keys = [
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
const isNumericRow = (r) => r && keys.every((k) => typeof r[k] === "number");

const blocks = [];
for (let i = 0; i < rows.length; i += 1) {
  const r = rows[i];
  const tag = r?.["DATE: _______________"];
  const a = r?.["Unnamed: 1"];
  if (typeof tag === "string" && tag.length === 1 && a === "A") {
    const r1 = rows[i + 1];
    const r2 = rows[i + 2];
    const r3 = rows[i + 3];
    if (isNumericRow(r1) && isNumericRow(r2) && isNumericRow(r3)) {
      blocks.push({ index: i, label: tag });
    }
  }
}

console.log(JSON.stringify({ blocks: blocks.length, questions: blocks.length * keys.length, sampleBlocks: blocks.slice(0, 20) }, null, 2));
