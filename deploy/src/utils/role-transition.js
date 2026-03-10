const ROLE_RANK = {
  STUDENT: 1,
  TEACHER: 2,
  CENTER: 3,
  FRANCHISE: 4,
  BP: 5,
  SUPERADMIN: 6
};

function validateRoleTransition(actorRole, targetOldRole, targetNewRole, actorUserId, targetUserId) {
  if (!ROLE_RANK[targetNewRole]) {
    const error = new Error("Invalid target role");
    error.statusCode = 400;
    error.errorCode = "INVALID_ROLE";
    throw error;
  }

  if (!ROLE_RANK[actorRole]) {
    const error = new Error("Invalid actor role");
    error.statusCode = 403;
    error.errorCode = "ROLE_FORBIDDEN";
    throw error;
  }

  if (targetOldRole && !ROLE_RANK[targetOldRole]) {
    const error = new Error("Invalid current target role");
    error.statusCode = 400;
    error.errorCode = "INVALID_ROLE";
    throw error;
  }

  if (targetOldRole === targetNewRole) {
    return true;
  }

  if (actorUserId && targetUserId && actorUserId === targetUserId) {
    const error = new Error("Self role changes are not allowed");
    error.statusCode = 403;
    error.errorCode = "SELF_ROLE_MUTATION_FORBIDDEN";
    throw error;
  }

  if (targetNewRole === "SUPERADMIN" && actorRole !== "SUPERADMIN") {
    const error = new Error("Only SUPERADMIN can assign SUPERADMIN role");
    error.statusCode = 403;
    error.errorCode = "SUPERADMIN_ASSIGNMENT_FORBIDDEN";
    throw error;
  }

  const isSuperadminManagingSuperadmin = actorRole === "SUPERADMIN" && targetOldRole === "SUPERADMIN";

  if (targetOldRole && ROLE_RANK[targetOldRole] >= ROLE_RANK[actorRole] && !isSuperadminManagingSuperadmin) {
    const error = new Error("Cannot mutate equal or higher privilege account");
    error.statusCode = 403;
    error.errorCode = "LATERAL_PRIVILEGE_MUTATION_FORBIDDEN";
    throw error;
  }

  if (targetNewRole !== "SUPERADMIN" && ROLE_RANK[targetNewRole] >= ROLE_RANK[actorRole]) {
    const error = new Error("Cannot assign equal or higher privilege role");
    error.statusCode = 403;
    error.errorCode = "ROLE_ESCALATION_FORBIDDEN";
    throw error;
  }

  return true;
}

export { ROLE_RANK, validateRoleTransition };
