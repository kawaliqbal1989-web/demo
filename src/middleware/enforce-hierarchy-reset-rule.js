import { prisma } from "../lib/prisma.js";

async function enforceHierarchyResetRule(req, res, next) {
  const { targetUserId } = req.body;

  if (!targetUserId) {
    return res.apiError(400, "targetUserId is required", "TARGET_USER_REQUIRED");
  }

  const target = await prisma.authUser.findFirst({
    where: {
      id: targetUserId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      parentUserId: true,
      role: true,
      isActive: true
    }
  });

  if (!target) {
    return res.apiError(404, "Target user not found", "TARGET_USER_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && target.parentUserId !== req.auth.userId) {
    return res.apiError(
      403,
      "Only direct parent can reset password",
      "RESET_PARENT_RULE_FORBIDDEN"
    );
  }

  req.targetUser = target;
  return next();
}

export { enforceHierarchyResetRule };
