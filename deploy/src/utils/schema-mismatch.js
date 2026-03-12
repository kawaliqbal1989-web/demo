function isSchemaMismatchError(error, extraNeedles = []) {
  const code = String(error?.code || "").trim().toUpperCase();
  if (code === "P2021" || code === "P2022") {
    return true;
  }

  const name = String(error?.constructor?.name || error?.name || "").trim();
  if (name === "PrismaClientValidationError") {
    return true;
  }

  const message = String(error?.message || "").toLowerCase();
  if (!message) {
    return false;
  }

  if (
    message.includes("does not exist in the current database") ||
    message.includes("unknown column") ||
    message.includes("unknown field") ||
    (message.includes("table") && message.includes("does not exist")) ||
    (message.includes("column") && message.includes("does not exist"))
  ) {
    return true;
  }

  return extraNeedles.some((needle) => message.includes(String(needle || "").toLowerCase()));
}

export { isSchemaMismatchError };