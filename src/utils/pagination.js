const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toInt(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
}

function parsePagination(query = {}) {
  const rawLimit = toInt(query.limit);
  const rawOffset = toInt(query.offset);

  const limit = Math.min(MAX_LIMIT, Math.max(1, rawLimit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, rawOffset ?? 0);

  return {
    limit,
    offset,
    take: limit,
    skip: offset,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  };
}

export { DEFAULT_LIMIT, MAX_LIMIT, parsePagination };