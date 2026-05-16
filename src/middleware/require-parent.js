import { prisma } from "../lib/prisma.js";
import { sendError } from "../utils/api-response.js";

async function requireParent(req, res, next) {
  if (!req.auth?.userId) {
    return sendError(res, 401, "Unauthorized", "AUTH_REQUIRED");
  }

  if (req.auth.role !== "PARENT") {
    return sendError(res, 403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const authUser = await prisma.authUser.findFirst({
    where: {
      id: req.auth.userId,
      tenantId: req.auth.tenantId,
      role: "PARENT",
      isActive: true
    },
    select: {
      id: true,
      email: true,
      username: true,
      parentStudentLinks: {
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          student: {
            is: {
              tenantId: req.auth.tenantId,
              isActive: true
            }
          }
        },
        select: {
          studentId: true,
          relationship: true,
          isPrimary: true,
          visibilityKey: true
        }
      }
    }
  });

  if (!authUser) {
    return sendError(res, 403, "Parent access is inactive", "PARENT_INACTIVE");
  }

  if (!authUser.parentStudentLinks.length) {
    return sendError(res, 403, "No linked students available", "PARENT_STUDENT_SCOPE_REQUIRED");
  }

  req.parent = {
    id: authUser.id,
    email: authUser.email,
    username: authUser.username,
    linkedStudents: authUser.parentStudentLinks
  };

  return next();
}

export { requireParent };