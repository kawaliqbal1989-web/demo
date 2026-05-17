import { prisma } from "../lib/prisma.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";

const COURSE_SCOPED_ROLES = new Set(["BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT"]);

function isCourseScopedRole(role) {
  return COURSE_SCOPED_ROLES.has(String(role || "").trim().toUpperCase());
}

async function resolveBusinessPartnerForScopedRole({ tenantId, userId, role, hierarchyNodeId, studentId }) {
  const normalizedRole = String(role || "").trim().toUpperCase();

  if (normalizedRole === "BP") {
    return prisma.businessPartner.findFirst({
      where: { tenantId, authUserId: userId },
      select: { id: true, accessMode: true }
    });
  }

  if (normalizedRole === "FRANCHISE") {
    const profile = await prisma.franchiseProfile.findFirst({
      where: { tenantId, authUserId: userId, isActive: true },
      select: {
        businessPartner: {
          select: { id: true, accessMode: true }
        }
      }
    });

    return profile?.businessPartner || null;
  }

  if (normalizedRole === "CENTER") {
    const profile = await prisma.centerProfile.findFirst({
      where: { tenantId, authUserId: userId, isActive: true },
      select: {
        franchiseProfile: {
          select: {
            businessPartner: {
              select: { id: true, accessMode: true }
            }
          }
        }
      }
    });

    return profile?.franchiseProfile?.businessPartner || null;
  }

  let centerNodeId = hierarchyNodeId || null;

  if (normalizedRole === "TEACHER") {
    if (!centerNodeId) {
      const teacher = await prisma.teacherProfile.findFirst({
        where: { tenantId, authUserId: userId, isActive: true },
        select: { hierarchyNodeId: true }
      });
      centerNodeId = teacher?.hierarchyNodeId || null;
    }
  }

  if (normalizedRole === "STUDENT") {
    if (!centerNodeId) {
      let student = null;

      if (studentId) {
        student = await prisma.student.findFirst({
          where: { tenantId, id: studentId },
          select: { hierarchyNodeId: true }
        });
      }

      if (!student) {
        student = await prisma.student.findFirst({
          where: { tenantId, authUserId: userId },
          select: { hierarchyNodeId: true }
        });
      }

      centerNodeId = student?.hierarchyNodeId || null;
    }
  }

  if (!centerNodeId) {
    return null;
  }

  const center = await prisma.centerProfile.findFirst({
    where: {
      tenantId,
      isActive: true,
      authUser: {
        hierarchyNodeId: centerNodeId
      }
    },
    select: {
      franchiseProfile: {
        select: {
          businessPartner: {
            select: { id: true, accessMode: true }
          }
        }
      }
    }
  });

  return center?.franchiseProfile?.businessPartner || null;
}

async function resolveScopedCourseIdsForAuth({ auth, studentId = null }) {
  const role = String(auth?.role || "").trim().toUpperCase();
  if (!isCourseScopedRole(role)) {
    return null;
  }

  try {
    const businessPartner = await resolveBusinessPartnerForScopedRole({
      tenantId: auth?.tenantId,
      userId: auth?.userId,
      role,
      hierarchyNodeId: auth?.hierarchyNodeId || null,
      studentId: studentId || auth?.studentId || null
    });

    if (!businessPartner) {
      return [];
    }

    if (businessPartner.accessMode !== "SELECTIVE") {
      return null;
    }

    const accesses = await prisma.partnerCourseAccess.findMany({
      where: { businessPartnerId: businessPartner.id },
      select: { courseId: true }
    });

    return accesses.map((item) => item.courseId);
  } catch (error) {
    if (!isSchemaMismatchError(error, ["partnercourseaccess", "businesspartner", "franchiseprofile", "centerprofile"])) {
      throw error;
    }

    // Fail closed for scoped roles when access scope cannot be resolved.
    return [];
  }
}

async function resolveScopedLevelIdsForAuth({ auth, studentId = null }) {
  const scopedCourseIds = await resolveScopedCourseIdsForAuth({ auth, studentId });

  // Null means unrestricted (e.g. SUPERADMIN, or partner access mode ALL).
  if (scopedCourseIds === null) {
    return null;
  }

  if (!scopedCourseIds.length) {
    return [];
  }

  try {
    const courseLevels = await prisma.courseLevel.findMany({
      where: {
        tenantId: auth?.tenantId,
        courseId: { in: scopedCourseIds },
        isActive: true
      },
      select: { levelNumber: true }
    });

    const ranks = Array.from(new Set(courseLevels.map((row) => row.levelNumber).filter((value) => Number.isFinite(Number(value)))));
    if (!ranks.length) {
      return [];
    }

    const levels = await prisma.level.findMany({
      where: {
        tenantId: auth?.tenantId,
        rank: { in: ranks }
      },
      select: { id: true }
    });

    return levels.map((level) => level.id);
  } catch (error) {
    if (!isSchemaMismatchError(error, ["courselevel", "level"])) {
      throw error;
    }

    return [];
  }
}

export {
  isCourseScopedRole,
  resolveScopedCourseIdsForAuth,
  resolveScopedLevelIdsForAuth
};