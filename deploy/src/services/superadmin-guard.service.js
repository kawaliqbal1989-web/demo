import { validateRoleTransition } from "../utils/role-transition.js";

async function assertLastSuperadminProtection(tx, { tenantId, targetUserId, nextRole, nextIsActive }) {
  const targetUser = await tx.authUser.findFirst({
    where: {
      id: targetUserId,
      tenantId
    },
    select: {
      id: true,
      role: true,
      isActive: true
    }
  });

  if (!targetUser) {
    const error = new Error("Target user not found");
    error.statusCode = 404;
    error.errorCode = "USER_NOT_FOUND";
    throw error;
  }

  const effectiveRole = nextRole || targetUser.role;
  const effectiveActive = nextIsActive ?? targetUser.isActive;

  const removesSuperadminPrivilege =
    targetUser.role === "SUPERADMIN" && (effectiveRole !== "SUPERADMIN" || !effectiveActive);

  if (!removesSuperadminPrivilege) {
    return targetUser;
  }

  const activeSuperadminCount = await tx.authUser.count({
    where: {
      tenantId,
      role: "SUPERADMIN",
      isActive: true
    }
  });

  if (activeSuperadminCount <= 1) {
    const error = new Error("Cannot remove or downgrade the last active SUPERADMIN");
    error.statusCode = 403;
    error.errorCode = "LAST_SUPERADMIN_PROTECTED";
    throw error;
  }

  return targetUser;
}

async function safelyUpdateUserRole({ tx, actor, targetUserId, targetNewRole }) {
  const targetUser = await tx.authUser.findFirst({
    where: {
      id: targetUserId,
      tenantId: actor.tenantId
    },
    select: {
      id: true,
      role: true,
      isActive: true,
      tenantId: true
    }
  });

  if (!targetUser) {
    const error = new Error("Target user not found");
    error.statusCode = 404;
    error.errorCode = "USER_NOT_FOUND";
    throw error;
  }

  validateRoleTransition(
    actor.role,
    targetUser.role,
    targetNewRole,
    actor.userId,
    targetUser.id
  );

  await assertLastSuperadminProtection(tx, {
    tenantId: actor.tenantId,
    targetUserId,
    nextRole: targetNewRole,
    nextIsActive: targetUser.isActive
  });

  return tx.authUser.update({
    where: { id: targetUserId },
    data: { role: targetNewRole },
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      tenantId: true,
      updatedAt: true
    }
  });
}

export { assertLastSuperadminProtection, safelyUpdateUserRole };
