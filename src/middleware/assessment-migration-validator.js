import { sendError } from "../utils/api-response.js";

const VALID_SOURCE_SYSTEMS = new Set(["EXAM_CYCLE", "COMPETITION"]);

function validateAssessmentMigrationRequest(req, res, next) {
  const input = req.method === "GET" ? req.query || {} : req.body || {};
  const { sourceSystem, sourceEntityId, limit } = input;

  if (sourceSystem !== undefined && !VALID_SOURCE_SYSTEMS.has(sourceSystem)) {
    return sendError(res, 400, "Invalid sourceSystem", "ASSESSMENT_MIGRATION_INVALID_SOURCE");
  }

  if (sourceEntityId !== undefined && typeof sourceEntityId !== "string") {
    return sendError(res, 400, "sourceEntityId must be a string", "ASSESSMENT_MIGRATION_INVALID_SOURCE_ENTITY");
  }

  if (limit !== undefined) {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
      return sendError(res, 400, "limit must be between 1 and 500", "ASSESSMENT_MIGRATION_INVALID_LIMIT");
    }
  }

  return next();
}

export { validateAssessmentMigrationRequest };
