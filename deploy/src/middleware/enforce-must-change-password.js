import { prisma } from "../lib/prisma.js";

async function enforceMustChangePassword(req, res, next) {
  if (!req.auth?.userId) {
    return next();
  }

  const user = await prisma.authUser.findFirst({
    where: {
      id: req.auth.userId,
      tenantId: req.auth.tenantId
    },
    select: {
      mustChangePassword: true
    }
  });

  if (!user) {
    return res.apiError(401, "Unauthorized", "INVALID_ACCESS_TOKEN");
  }

  if (user.mustChangePassword) {
    return res.apiError(
      403,
      "Password change is required before accessing this resource",
      "MUST_CHANGE_PASSWORD"
    );
  }

  return next();
}

export { enforceMustChangePassword };
