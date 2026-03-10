import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { generateUsername } from "../utils/username-generator.js";
import { hashPassword } from "../utils/password.js";
import crypto from "crypto";

function generateTempPassword() {
  // 16 chars-ish, URL-safe; example: QdE_sws-72J4Treq
  return crypto.randomBytes(12).toString("base64url");
}

function normalizeString(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function normalizeBoolean(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function generateFallbackEmail({ teacherCode }) {
  const safe = normalizeString(teacherCode).toLowerCase() || `teacher_${Date.now()}`;
  return `${safe}@internal.local`;
}

function normalizeTeacherStatus(value) {
  const v = String(value || "").trim().toUpperCase();
  if (["ACTIVE", "INACTIVE", "ARCHIVED"].includes(v)) {
    return v;
  }
  return null;
}

function normalizeNullableInteger(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) {
    const err = new Error("experienceYears must be a non-negative integer");
    err.statusCode = 400;
    err.errorCode = "VALIDATION_ERROR";
    throw err;
  }
  return num;
}

function normalizeDateOnly(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const err = new Error(`${fieldName} must be in YYYY-MM-DD format`);
    err.statusCode = 400;
    err.errorCode = "VALIDATION_ERROR";
    throw err;
  }
  return new Date(`${text}T00:00:00.000Z`);
}

function getUniqueConstraintTargets(error) {
  const target = error?.meta?.target;
  if (!target) return [];
  if (Array.isArray(target)) return target.map((item) => String(item));
  return [String(target)];
}

function uniqueTargetsInclude(error, needle) {
  const targets = getUniqueConstraintTargets(error).join("|").toLowerCase();
  return targets.includes(String(needle).toLowerCase());
}

const listTeachers = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);

  const where = {
    tenantId: req.auth.tenantId,
    role: "TEACHER"
  };

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId) {
    where.hierarchyNodeId = req.auth.hierarchyNodeId;
  }

  const q = normalizeString(req.query.q);
  if (q) {
    where.OR = [
      { username: { contains: q } },
      { email: { contains: q } },
      { teacherProfile: { is: { fullName: { contains: q } } } },
      { teacherProfile: { is: { phonePrimary: { contains: q } } } }
    ];
  }

  const status = normalizeTeacherStatus(req.query.status);
  if (status) {
    where.teacherProfile = {
      is: {
        status
      }
    };
  }

  const active = normalizeBoolean(req.query.isActive);
  if (active !== null) {
    where.isActive = active;
  }

  const data = await prisma.authUser.findMany({
    where,
    orderBy,
    skip,
    take,
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      isActive: true,
      hierarchyNodeId: true,
      createdAt: true,
      teacherProfile: {
        select: {
          id: true,
          fullName: true,
          phonePrimary: true,
          joiningDate: true,
          qualification: true,
          experienceYears: true,
          specialization: true,
          phoneAlternate: true,
          whatsappNumber: true,
          address: true,
          city: true,
          state: true,
          pincode: true,
          emergencyContactName: true,
          emergencyContactPhone: true,
          emergencyContactRelation: true,
          photoUrl: true,
          notes: true,
          preferredLanguage: true,
          employmentType: true,
          salaryType: true,
          isProbation: true,
          status: true,
          isActive: true
        }
      },
      hierarchyNode: {
        select: {
          id: true,
          name: true,
          type: true
        }
      }
    }
  });

  return res.apiSuccess("Teachers fetched", data);
});

const createTeacher = asyncHandler(async (req, res) => {
  const {
    teacherCode,
    email,
    fullName,
    phonePrimary,
    joiningDate,
    qualification,
    experienceYears,
    specialization,
    phoneAlternate,
    whatsappNumber,
    address,
    city,
    state,
    pincode,
    emergencyContactName,
    emergencyContactPhone,
    relation,
    photoUrl,
    notes,
    preferredLanguage,
    employmentType,
    salaryType,
    isProbation,
    status,
    centerId,
    createLoginAccount
  } = req.body;

  if (!fullName || !String(fullName).trim()) {
    return res.apiError(400, "fullName is required", "VALIDATION_ERROR");
  }

  const hierarchyNodeId = req.auth.role === "SUPERADMIN" ? (centerId ? String(centerId) : null) : req.auth.hierarchyNodeId;
  if (!hierarchyNodeId) {
    return res.apiError(400, "centerId is required", "VALIDATION_ERROR");
  }

  const normalizedStatus = normalizeTeacherStatus(status) || "ACTIVE";
  const active = normalizedStatus === "ACTIVE";
  const normalizedJoiningDate = normalizeDateOnly(joiningDate, "joiningDate");
  const normalizedExperienceYears = normalizeNullableInteger(experienceYears);

  const requestedTeacherCode = normalizeString(teacherCode);
  const shouldCreateLogin = createLoginAccount !== undefined ? Boolean(createLoginAccount) : true;
  const tempPassword = shouldCreateLogin ? (requestedTeacherCode || null) : null;

  if (requestedTeacherCode) {
    const existingUsername = await prisma.authUser.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        username: requestedTeacherCode
      },
      select: { id: true }
    });

    if (existingUsername) {
      return res.apiError(409, "Teacher code already exists", "TEACHER_CODE_EXISTS");
    }
  }

  const normalizedEmail = normalizeString(email);
  if (normalizedEmail) {
    const existingEmail = await prisma.authUser.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        email: normalizedEmail
      },
      select: { id: true }
    });

    if (existingEmail) {
      return res.apiError(409, "Email already exists", "EMAIL_ALREADY_EXISTS");
    }
  }

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const username = requestedTeacherCode || (await generateUsername({ tx, tenantId: req.auth.tenantId, role: "TEACHER" }));

      let resolvedEmail = normalizeString(email);
      if (!resolvedEmail) {
        resolvedEmail = generateFallbackEmail({ teacherCode: username });
      }

      // Avoid unique collisions when auto-generating.
      if (!normalizeString(email)) {
        const existing = await tx.authUser.findFirst({
          where: { tenantId: req.auth.tenantId, email: resolvedEmail },
          select: { id: true }
        });
        if (existing) {
          resolvedEmail = `${username.toLowerCase()}_${Date.now()}@internal.local`;
        }
      }

      const passwordHash = await hashPassword(tempPassword || `tmp_${Date.now()}_${Math.floor(Math.random() * 100000)}`);

      const user = await tx.authUser.create({
        data: {
          tenantId: req.auth.tenantId,
          username,
          email: resolvedEmail,
          passwordHash,
          role: "TEACHER",
          hierarchyNodeId,
          parentUserId: req.auth.userId,
          mustChangePassword: true,
          isActive: shouldCreateLogin ? active : false
        },
        select: { id: true, username: true, email: true, isActive: true, hierarchyNodeId: true, createdAt: true }
      });

      const profile = await tx.teacherProfile.create({
        data: {
          tenantId: req.auth.tenantId,
          hierarchyNodeId,
          authUserId: user.id,
          fullName: String(fullName).trim(),
          phonePrimary: phonePrimary ? String(phonePrimary).trim() : null,
          joiningDate: normalizedJoiningDate === undefined ? null : normalizedJoiningDate,
          qualification: normalizeString(qualification) || null,
          experienceYears: normalizedExperienceYears === undefined ? null : normalizedExperienceYears,
          specialization: normalizeString(specialization) || null,
          phoneAlternate: normalizeString(phoneAlternate) || null,
          whatsappNumber: normalizeString(whatsappNumber) || null,
          address: normalizeString(address) || null,
          city: normalizeString(city) || null,
          state: normalizeString(state) || null,
          pincode: normalizeString(pincode) || null,
          emergencyContactName: normalizeString(emergencyContactName) || null,
          emergencyContactPhone: normalizeString(emergencyContactPhone) || null,
          emergencyContactRelation: normalizeString(relation) || null,
          photoUrl: normalizeString(photoUrl) || null,
          notes: normalizeString(notes) || null,
          preferredLanguage: normalizeString(preferredLanguage) || null,
          employmentType: normalizeString(employmentType) || null,
          salaryType: normalizeString(salaryType) || null,
          isProbation: isProbation === undefined ? null : Boolean(isProbation),
          status: normalizedStatus,
          isActive: active
        }
      });

      return { user, profile, tempPassword };
    });
  } catch (error) {
    if (error?.code === "P2002") {
      if (uniqueTargetsInclude(error, "username")) {
        return res.apiError(409, "Teacher code already exists", "TEACHER_CODE_EXISTS");
      }
      if (uniqueTargetsInclude(error, "email")) {
        return res.apiError(409, "Email already exists", "EMAIL_ALREADY_EXISTS");
      }
      return res.apiError(409, "Teacher already exists", "DUPLICATE_TEACHER");
    }

    if (error?.code === "P2003") {
      return res.apiError(400, "Invalid center reference", "VALIDATION_ERROR");
    }

    throw error;
  }

  res.locals.entityId = created.user.id;
  return res.apiSuccess("Teacher created", created, 201);
});

const updateTeacher = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    fullName,
    phonePrimary,
    status,
    isActive,
    teacherCode,
    email,
    joiningDate,
    qualification,
    experienceYears,
    specialization,
    phoneAlternate,
    whatsappNumber,
    address,
    city,
    state,
    pincode,
    emergencyContactName,
    emergencyContactPhone,
    relation,
    photoUrl,
    notes,
    preferredLanguage,
    employmentType,
    salaryType,
    isProbation
  } = req.body;

  const teacher = await prisma.authUser.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId,
      role: "TEACHER"
    },
    select: { id: true, hierarchyNodeId: true, username: true, email: true }
  });

  if (!teacher) {
    return res.apiError(404, "Teacher not found", "TEACHER_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && teacher.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  if (teacherCode !== undefined) {
    return res.apiError(400, "teacherCode cannot be changed", "VALIDATION_ERROR");
  }

  const normalizedStatus = status !== undefined ? normalizeTeacherStatus(status) : null;
  const normalizedEmail = email !== undefined ? normalizeString(email) : null;
  const normalizedJoiningDate = normalizeDateOnly(joiningDate, "joiningDate");
  const normalizedExperienceYears = normalizeNullableInteger(experienceYears);

  const isSuspending =
    (isActive !== undefined && !Boolean(isActive))
    || (normalizedStatus !== null && normalizedStatus !== "ACTIVE");

  if (isSuspending) {
    const activeAssignedCount = await prisma.enrollment.count({
      where: {
        tenantId: req.auth.tenantId,
        hierarchyNodeId: teacher.hierarchyNodeId,
        assignedTeacherUserId: teacher.id,
        status: "ACTIVE"
      }
    });

    if (activeAssignedCount > 0) {
      return res.apiError(
        409,
        `Cannot suspend teacher with ${activeAssignedCount} active assigned students. Shift or unassign students first.`,
        "TEACHER_HAS_ACTIVE_STUDENTS",
        { activeAssignedCount }
      );
    }
  }

  if (email !== undefined && !normalizedEmail) {
    return res.apiError(400, "email cannot be empty", "VALIDATION_ERROR");
  }

  if (normalizedEmail && normalizedEmail !== teacher.email) {
    const existingEmail = await prisma.authUser.findFirst({
      where: {
        tenantId: req.auth.tenantId,
        email: normalizedEmail,
        NOT: { id: teacher.id }
      },
      select: { id: true }
    });
    if (existingEmail) {
      return res.apiError(409, "Email already exists", "EMAIL_ALREADY_EXISTS");
    }
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const user = await tx.authUser.update({
        where: { id: teacher.id },
        data: {
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {})
        }
      });

      const profile = await tx.teacherProfile.upsert({
        where: { authUserId: teacher.id },
        update: {
          ...(fullName !== undefined ? { fullName: String(fullName).trim() } : {}),
          ...(phonePrimary !== undefined ? { phonePrimary: phonePrimary ? String(phonePrimary).trim() : null } : {}),
          ...(joiningDate !== undefined ? { joiningDate: normalizedJoiningDate } : {}),
          ...(qualification !== undefined ? { qualification: normalizeString(qualification) || null } : {}),
          ...(experienceYears !== undefined ? { experienceYears: normalizedExperienceYears } : {}),
          ...(specialization !== undefined ? { specialization: normalizeString(specialization) || null } : {}),
          ...(phoneAlternate !== undefined ? { phoneAlternate: normalizeString(phoneAlternate) || null } : {}),
          ...(whatsappNumber !== undefined ? { whatsappNumber: normalizeString(whatsappNumber) || null } : {}),
          ...(address !== undefined ? { address: normalizeString(address) || null } : {}),
          ...(city !== undefined ? { city: normalizeString(city) || null } : {}),
          ...(state !== undefined ? { state: normalizeString(state) || null } : {}),
          ...(pincode !== undefined ? { pincode: normalizeString(pincode) || null } : {}),
          ...(emergencyContactName !== undefined ? { emergencyContactName: normalizeString(emergencyContactName) || null } : {}),
          ...(emergencyContactPhone !== undefined ? { emergencyContactPhone: normalizeString(emergencyContactPhone) || null } : {}),
          ...(relation !== undefined ? { emergencyContactRelation: normalizeString(relation) || null } : {}),
          ...(photoUrl !== undefined ? { photoUrl: normalizeString(photoUrl) || null } : {}),
          ...(notes !== undefined ? { notes: normalizeString(notes) || null } : {}),
          ...(preferredLanguage !== undefined ? { preferredLanguage: normalizeString(preferredLanguage) || null } : {}),
          ...(employmentType !== undefined ? { employmentType: normalizeString(employmentType) || null } : {}),
          ...(salaryType !== undefined ? { salaryType: normalizeString(salaryType) || null } : {}),
          ...(isProbation !== undefined ? { isProbation: Boolean(isProbation) } : {}),
          ...(normalizedStatus ? { status: normalizedStatus } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {})
        },
        create: {
          tenantId: req.auth.tenantId,
          hierarchyNodeId: teacher.hierarchyNodeId,
          authUserId: teacher.id,
          fullName: fullName ? String(fullName).trim() : "(unknown)",
          phonePrimary: phonePrimary ? String(phonePrimary).trim() : null,
          joiningDate: normalizedJoiningDate === undefined ? null : normalizedJoiningDate,
          qualification: normalizeString(qualification) || null,
          experienceYears: normalizedExperienceYears === undefined ? null : normalizedExperienceYears,
          specialization: normalizeString(specialization) || null,
          phoneAlternate: normalizeString(phoneAlternate) || null,
          whatsappNumber: normalizeString(whatsappNumber) || null,
          address: normalizeString(address) || null,
          city: normalizeString(city) || null,
          state: normalizeString(state) || null,
          pincode: normalizeString(pincode) || null,
          emergencyContactName: normalizeString(emergencyContactName) || null,
          emergencyContactPhone: normalizeString(emergencyContactPhone) || null,
          emergencyContactRelation: normalizeString(relation) || null,
          photoUrl: normalizeString(photoUrl) || null,
          notes: normalizeString(notes) || null,
          preferredLanguage: normalizeString(preferredLanguage) || null,
          employmentType: normalizeString(employmentType) || null,
          salaryType: normalizeString(salaryType) || null,
          isProbation: isProbation === undefined ? null : Boolean(isProbation),
          status: normalizedStatus || "ACTIVE",
          isActive: isActive !== undefined ? Boolean(isActive) : user.isActive
        }
      });

      return { user, profile };
    });
  } catch (error) {
    if (error?.code === "P2002") {
      if (uniqueTargetsInclude(error, "email")) {
        return res.apiError(409, "Email already exists", "EMAIL_ALREADY_EXISTS");
      }
      return res.apiError(409, "Duplicate teacher data", "DUPLICATE_TEACHER");
    }
    throw error;
  }

  return res.apiSuccess("Teacher updated", updated);
});

const shiftTeacherStudents = asyncHandler(async (req, res) => {
  const sourceTeacherId = String(req.params.id || "").trim();
  const targetTeacherId = String(req.body?.targetTeacherId || "").trim();

  if (!sourceTeacherId || !targetTeacherId) {
    return res.apiError(400, "source and target teacher ids are required", "VALIDATION_ERROR");
  }

  if (sourceTeacherId === targetTeacherId) {
    return res.apiError(400, "target teacher must be different", "VALIDATION_ERROR");
  }

  const sourceTeacher = await prisma.authUser.findFirst({
    where: {
      id: sourceTeacherId,
      tenantId: req.auth.tenantId,
      role: "TEACHER"
    },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!sourceTeacher) {
    return res.apiError(404, "Source teacher not found", "TEACHER_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && sourceTeacher.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const targetTeacher = await prisma.authUser.findFirst({
    where: {
      id: targetTeacherId,
      tenantId: req.auth.tenantId,
      role: "TEACHER",
      hierarchyNodeId: sourceTeacher.hierarchyNodeId,
      isActive: true
    },
    select: { id: true }
  });

  if (!targetTeacher) {
    return res.apiError(400, "Invalid target teacher", "INVALID_TARGET_TEACHER");
  }

  const result = await prisma.enrollment.updateMany({
    where: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: sourceTeacher.hierarchyNodeId,
      assignedTeacherUserId: sourceTeacher.id,
      status: "ACTIVE"
    },
    data: {
      assignedTeacherUserId: targetTeacher.id
    }
  });

  return res.apiSuccess("Students shifted", {
    shiftedCount: result.count,
    sourceTeacherId: sourceTeacher.id,
    targetTeacherId: targetTeacher.id
  });
});

const resetTeacherPassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword, mustChangePassword = true } = req.body || {};

  const teacher = await prisma.authUser.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId,
      role: "TEACHER"
    },
    select: { id: true, username: true, email: true, hierarchyNodeId: true }
  });

  if (!teacher) {
    return res.apiError(404, "Teacher not found", "TEACHER_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && teacher.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const trimmed = newPassword === undefined || newPassword === null ? "" : String(newPassword).trim();
  const tempPassword = trimmed || generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await prisma.authUser.update({
    where: { id: teacher.id },
    data: {
      passwordHash,
      mustChangePassword: Boolean(mustChangePassword)
    }
  });

  return res.apiSuccess("Teacher password reset", {
    id: teacher.id,
    username: teacher.username,
    email: teacher.email,
    tempPassword: trimmed ? null : tempPassword
  });
});

const uploadTeacherPhoto = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const file = req.file;

  if (!file?.filename) {
    return res.apiError(400, "file is required", "FILE_REQUIRED");
  }

  const teacher = await prisma.authUser.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId,
      role: "TEACHER"
    },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!teacher) {
    return res.apiError(404, "Teacher not found", "TEACHER_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && teacher.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const url = `${req.protocol}://${req.get("host")}/uploads/teacher-photos/${file.filename}`;

  const profile = await prisma.teacherProfile.upsert({
    where: { authUserId: teacher.id },
    update: { photoUrl: url },
    create: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: teacher.hierarchyNodeId,
      authUserId: teacher.id,
      fullName: "(unknown)",
      photoUrl: url,
      status: "ACTIVE",
      isActive: true
    },
    select: { authUserId: true, photoUrl: true }
  });

  res.locals.entityId = teacher.id;
  return res.apiSuccess("Teacher photo uploaded", {
    id: teacher.id,
    photoUrl: profile.photoUrl
  });
});

export { listTeachers, createTeacher, updateTeacher, shiftTeacherStudents, resetTeacherPassword, uploadTeacherPhoto };