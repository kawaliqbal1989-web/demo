function validationError(message, errorCode = "VALIDATION_ERROR") {
  const error = new Error(message);
  error.statusCode = 400;
  error.errorCode = errorCode;
  return error;
}

function normalizeString(value, field, { required = false, max = 191 } = {}) {
  if (value === undefined) {
    if (required) throw validationError(`${field} is required`);
    return undefined;
  }

  if (value === null) {
    if (required) throw validationError(`${field} is required`);
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    if (required) throw validationError(`${field} is required`);
    return null;
  }
  if (normalized.length > max) {
    throw validationError(`${field} must be at most ${max} characters`);
  }
  return normalized;
}

function normalizeDate(value, field, { required = false } = {}) {
  if (value === undefined) {
    if (required) throw validationError(`${field} is required`);
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validationError(`${field} must be a valid date`);
  }
  return date;
}

function assertSeasonDateRange(startDate, endDate) {
  if (startDate && endDate && endDate < startDate) {
    throw validationError("endDate must be on or after startDate");
  }
}

function validateSeasonPayload(body = {}, { partial = false } = {}) {
  const result = {
    name: normalizeString(body.name, "name", { required: !partial }),
    code: normalizeString(body.code, "code", { required: !partial }),
    description: normalizeString(body.description, "description"),
    startDate: normalizeDate(body.startDate, "startDate", { required: !partial }),
    endDate: normalizeDate(body.endDate, "endDate", { required: !partial })
  };
  if (!partial) assertSeasonDateRange(result.startDate, result.endDate);
  return result;
}

function validateCoursePayload(body = {}, { partial = false } = {}) {
  return {
    name: normalizeString(body.name, "name", { required: !partial }),
    code: normalizeString(body.code, "code", { required: false }),
    description: normalizeString(body.description, "description")
  };
}

function validateQuestionBankPayload(body = {}, { partial = false } = {}) {
  return {
    name: normalizeString(body.name, "name", { required: !partial }),
    code: normalizeString(body.code, "code", { required: false }),
    description: normalizeString(body.description, "description")
  };
}

function validateCompetitionWorksheetPayload(body = {}, { partial = false } = {}) {
  const version =
    body.version === undefined
      ? (partial ? undefined : 1)
      : Number(body.version);

  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    throw validationError("version must be a positive integer");
  }

  const worksheetId = normalizeString(body.worksheetId, "worksheetId", {
    required: !partial || body.worksheetId !== undefined
  });

  return {
    name: normalizeString(body.name, "name", { required: !partial }),
    code: normalizeString(body.code, "code", { required: false }),
    description: normalizeString(body.description, "description"),
    version,
    worksheetId
  };
}

function validateLevelPayload(body = {}) {
  const levelId = normalizeString(body.levelId, "levelId", { required: true });
  const sortOrder = body.sortOrder === undefined ? undefined : Number(body.sortOrder);
  if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 1)) {
    throw validationError("sortOrder must be a positive integer");
  }
  return { levelId, sortOrder };
}

function validateLevelReorderPayload(body = {}) {
  if (!Array.isArray(body.orderedLevelIds) || body.orderedLevelIds.length < 1) {
    throw validationError("orderedLevelIds must be a non-empty array");
  }
  const orderedLevelIds = body.orderedLevelIds.map((id) =>
    normalizeString(id, "orderedLevelIds", { required: true })
  );
  if (new Set(orderedLevelIds).size !== orderedLevelIds.length) {
    throw validationError("orderedLevelIds must not contain duplicates");
  }
  return { orderedLevelIds };
}

function validateCompetitionReusePayload(body = {}) {
  const sourceCompetitionId = normalizeString(
    body.sourceCompetitionId,
    "sourceCompetitionId",
    { required: true }
  );
  if (!Array.isArray(body.sourceCourseIds) || body.sourceCourseIds.length < 1) {
    throw validationError("sourceCourseIds must be a non-empty array");
  }
  const sourceCourseIds = body.sourceCourseIds.map((id) =>
    normalizeString(id, "sourceCourseIds", { required: true })
  );
  if (new Set(sourceCourseIds).size !== sourceCourseIds.length) {
    throw validationError("sourceCourseIds must not contain duplicates");
  }

  return {
    sourceCompetitionId,
    sourceCourseIds,
    includeQuestionBanks: body.includeQuestionBanks !== false,
    includeWorksheets: body.includeWorksheets !== false
  };
}

export {
  assertSeasonDateRange,
  validateCompetitionWorksheetPayload,
  validateCoursePayload,
  validateLevelPayload,
  validateLevelReorderPayload,
  validateQuestionBankPayload,
  validateCompetitionReusePayload,
  validateSeasonPayload,
  validationError
};
