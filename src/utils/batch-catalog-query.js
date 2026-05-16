const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const BATCH_STATUSES = new Set([
  "ACTIVE",
  "UPCOMING",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
  "TRIAL"
]);

const BATCH_MODALITIES = new Set(["ONLINE", "OFFLINE", "HYBRID"]);

const SORT_FIELDS = new Set([
  "createdAt",
  "name",
  "status",
  "studentCount",
  "teacherName",
  "levelRank",
  "modality",
  "occupancyPercentage",
  "maxStudents"
]);

function toInteger(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseBooleanFlag(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return null;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeBatchStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "INACTIVE") {
    return "PAUSED";
  }

  return BATCH_STATUSES.has(normalized) ? normalized : null;
}

function normalizeBatchModality(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return BATCH_MODALITIES.has(normalized) ? normalized : null;
}

function normalizeTags(value) {
  if (value === undefined) {
    return undefined;
  }

  const rawValues = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((item) => item.trim());

  const cleaned = uniqueStrings(
    rawValues
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );

  return cleaned.length ? cleaned : null;
}

function normalizeStatuses(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return uniqueStrings(values.map(normalizeBatchStatus));
}

function batchStatusToIsActive(status) {
  return ["ACTIVE", "UPCOMING", "TRIAL"].includes(status);
}

function calculateOccupancy(maxStudents, currentStudents) {
  if (!Number.isFinite(Number(maxStudents)) || Number(maxStudents) <= 0) {
    return null;
  }

  const current = Number.isFinite(Number(currentStudents)) ? Number(currentStudents) : 0;
  return Math.round((current / Number(maxStudents)) * 100);
}

function parseBatchCatalogQuery(query = {}) {
  const limitOverride = toInteger(query.pageSize ?? query.limit);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, limitOverride ?? DEFAULT_PAGE_SIZE));

  const offsetOverride = toInteger(query.offset);
  const pageOverride = toInteger(query.page);
  const page = pageOverride && pageOverride > 0
    ? pageOverride
    : offsetOverride !== null
      ? Math.floor(Math.max(0, offsetOverride) / pageSize) + 1
      : 1;

  const offset = offsetOverride !== null ? Math.max(0, offsetOverride) : (page - 1) * pageSize;
  const statuses = normalizeStatuses(query.statuses || query.status);

  let dayType = String(query.dayType || "").trim().toUpperCase();
  if (parseBooleanFlag(query.weekendOnly) === true) dayType = "WEEKEND";
  if (parseBooleanFlag(query.weekdayOnly) === true) dayType = "WEEKDAY";
  if (!["", "WEEKDAY", "WEEKEND"].includes(dayType)) dayType = "";

  const sortBy = SORT_FIELDS.has(query.sortBy) ? query.sortBy : "createdAt";
  const sortDir = String(query.sortDir || "desc").trim().toLowerCase() === "asc" ? "asc" : "desc";
  const includeArchivedFlag = parseBooleanFlag(query.includeArchived);

  return {
    q: String(query.q || "").trim(),
    page,
    pageSize,
    limit: pageSize,
    offset,
    statuses,
    modality: normalizeBatchModality(query.modality || query.mode),
    teacherId: query.teacherId ? String(query.teacherId).trim() : null,
    levelId: query.levelId ? String(query.levelId).trim() : null,
    centerId: query.centerId ? String(query.centerId).trim() : null,
    includeArchived: includeArchivedFlag === true || statuses.includes("ARCHIVED"),
    assignedOnly: parseBooleanFlag(query.assignedOnly),
    hasTeacher: parseBooleanFlag(query.hasTeacher),
    fullOnly: parseBooleanFlag(query.fullOnly) === true,
    dayType: dayType || null,
    sortBy,
    sortDir
  };
}

export {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  batchStatusToIsActive,
  calculateOccupancy,
  normalizeBatchModality,
  normalizeBatchStatus,
  normalizeTags,
  parseBatchCatalogQuery
};