function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function parseNonNegativeInteger(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    throw createHttpError(400, `${fieldName} must be a non-negative integer`, "VALIDATION_ERROR");
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createHttpError(400, `${fieldName} must be a non-negative integer`, "VALIDATION_ERROR");
  }

  return parsed;
}

function parseBoolean(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }

  throw createHttpError(400, `${fieldName} must be true or false`, "VALIDATION_ERROR");
}

function normalizeCapacityPatchInput(payload = {}) {
  const maxTeachers = parseNonNegativeInteger(payload.maxTeachers, "maxTeachers");
  const maxStudents = parseNonNegativeInteger(payload.maxStudents, "maxStudents");
  const allowOverAllocation = parseBoolean(payload.allowOverAllocation, "allowOverAllocation");

  if (maxTeachers === undefined && maxStudents === undefined && allowOverAllocation === undefined) {
    throw createHttpError(400, "At least one capacity field is required", "VALIDATION_ERROR");
  }

  return {
    ...(maxTeachers !== undefined ? { maxTeachers } : {}),
    ...(maxStudents !== undefined ? { maxStudents } : {}),
    ...(allowOverAllocation !== undefined ? { allowOverAllocation } : {})
  };
}

function normalizeAuditLimit(value, { defaultValue = 10, maxValue = 25 } = {}) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxValue) {
    throw createHttpError(400, `auditLimit must be an integer between 1 and ${maxValue}`, "VALIDATION_ERROR");
  }

  return parsed;
}

function normalizeCapacitySummaryState(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["healthy", "warning", "critical", "over", "unmanaged"].includes(normalized)) {
    return normalized;
  }

  throw createHttpError(400, "state must be healthy, warning, critical, over, or unmanaged", "VALIDATION_ERROR");
}

function normalizeCapacitySummarySort(sortBy, sortDirection) {
  const allowedSortBy = new Set([
    "centerName",
    "teacherUtilizationPercent",
    "studentUtilizationPercent",
    "maxUtilizationPercent",
    "teachersUsed",
    "studentsUsed",
    "remainingTeachers",
    "remainingStudents",
    "updatedAt"
  ]);

  const resolvedSortBy = allowedSortBy.has(String(sortBy || "").trim())
    ? String(sortBy).trim()
    : "maxUtilizationPercent";
  const resolvedSortDirection = String(sortDirection || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc";

  return {
    sortBy: resolvedSortBy,
    sortDirection: resolvedSortDirection
  };
}

export {
  createHttpError,
  normalizeAuditLimit,
  normalizeCapacityPatchInput,
  normalizeCapacitySummarySort,
  normalizeCapacitySummaryState
};