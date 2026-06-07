import { createHash } from "node:crypto";

function stableSerialize(value) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildAssessmentSourceRevisionHash(value) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export { stableSerialize, buildAssessmentSourceRevisionHash };
