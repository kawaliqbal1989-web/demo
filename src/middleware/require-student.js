import { prisma } from "../lib/prisma.js";
import { sendError } from "../utils/api-response.js";

async function requireStudent(req, res, next) {
  if (!req.auth?.userId) {
    return sendError(res, 401, "Unauthorized", "AUTH_REQUIRED");
  }

  if (req.auth.role !== "STUDENT") {
    return sendError(res, 403, "Forbidden", "ROLE_FORBIDDEN");
  }

  if (!req.auth.studentId) {
    return sendError(res, 403, "Forbidden", "STUDENT_SCOPE_REQUIRED");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: req.auth.studentId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      hierarchyNodeId: true,
      levelId: true,
      isActive: true,
      isTemporaryExam: true,
      temporaryExpiresAt: true
    }
  });

  if (!student) {
    return sendError(res, 404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (!student.isActive) {
    return sendError(res, 403, "Student is inactive", "STUDENT_INACTIVE");
  }

  if (student.isTemporaryExam && student.temporaryExpiresAt) {
    const now = Date.now();
    const expiresAt = new Date(student.temporaryExpiresAt).getTime();
    if (Number.isFinite(expiresAt) && now > expiresAt) {
      return sendError(res, 403, "Temporary student access expired", "STUDENT_ACCESS_EXPIRED");
    }
  }

  req.student = student;
  return next();
}

export { requireStudent };
