import crypto from "crypto";

function formatDateYYYYMMDD(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function generateExamCode(prefix = "EX") {
  const day = formatDateYYYYMMDD(new Date());
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${day}-${rand}`;
}

export { generateExamCode };
