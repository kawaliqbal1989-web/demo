const academicMutationRoles = ["SUPERADMIN"];
const operationalMutationRoles = ["SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER"];

function canModifyAcademic(actorRole) {
  return academicMutationRoles.includes(actorRole);
}

function canModifyOperational(actorRole) {
  return operationalMutationRoles.includes(actorRole);
}

function assertCanModifyAcademic(actorRole) {
  if (canModifyAcademic(actorRole)) {
    return;
  }

  const error = new Error("Role cannot modify academic structures");
  error.statusCode = 403;
  error.errorCode = "ACADEMIC_OWNERSHIP_FORBIDDEN";
  throw error;
}

function assertCanModifyOperational(actorRole) {
  if (canModifyOperational(actorRole)) {
    return;
  }

  const error = new Error("Role cannot modify operational data");
  error.statusCode = 403;
  error.errorCode = "OPERATIONAL_OWNERSHIP_FORBIDDEN";
  throw error;
}

export {
  canModifyAcademic,
  canModifyOperational,
  assertCanModifyAcademic,
  assertCanModifyOperational
};
