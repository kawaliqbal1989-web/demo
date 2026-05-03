import bcrypt from "bcryptjs";
import dotenv from "dotenv";

import { createPrismaClient } from "../src/lib/prisma-client.js";

dotenv.config();

const prisma = createPrismaClient();

function parseArgs(argv) {
  const options = {
    centerCode: process.env.CENTER_CODE || "CE002",
    teacherCount: Number.parseInt(process.env.TEACHER_COUNT || "12", 10),
    studentCount: Number.parseInt(process.env.STUDENT_COUNT || "100", 10),
    defaultPassword: process.env.DEFAULT_PASSWORD || "Pass@123"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "").trim();
    if (!arg) {
      continue;
    }

    if (arg.startsWith("--centerCode=")) {
      options.centerCode = arg.slice("--centerCode=".length).trim() || options.centerCode;
      continue;
    }

    if (arg === "--centerCode") {
      options.centerCode = String(argv[index + 1] || "").trim() || options.centerCode;
      index += 1;
      continue;
    }

    if (arg.startsWith("--teacherCount=")) {
      const parsed = Number.parseInt(arg.slice("--teacherCount=".length).trim(), 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        options.teacherCount = parsed;
      }
      continue;
    }

    if (arg === "--teacherCount") {
      const parsed = Number.parseInt(String(argv[index + 1] || "").trim(), 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        options.teacherCount = parsed;
      }
      index += 1;
      continue;
    }

    if (arg.startsWith("--studentCount=")) {
      const parsed = Number.parseInt(arg.slice("--studentCount=".length).trim(), 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        options.studentCount = parsed;
      }
      continue;
    }

    if (arg === "--studentCount") {
      const parsed = Number.parseInt(String(argv[index + 1] || "").trim(), 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        options.studentCount = parsed;
      }
      index += 1;
      continue;
    }

    if (arg.startsWith("--defaultPassword=")) {
      options.defaultPassword = arg.slice("--defaultPassword=".length).trim() || options.defaultPassword;
      continue;
    }

    if (arg === "--defaultPassword") {
      options.defaultPassword = String(argv[index + 1] || "").trim() || options.defaultPassword;
      index += 1;
    }
  }

  return options;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function padNumber(value, width = 2) {
  return String(value).padStart(width, "0");
}

function teacherUsername(centerCode, index) {
  return `${centerCode}TD${padNumber(index, 2)}`;
}

function teacherEmail(centerCode, index) {
  return `${centerCode.toLowerCase()}.teacher${padNumber(index, 2)}@test.local`;
}

function studentAdmissionNo(centerCode, index) {
  return `${centerCode}SD${padNumber(index, 3)}`;
}

function studentEmail(centerCode, index) {
  return `${centerCode.toLowerCase()}.student${padNumber(index, 3)}@test.local`;
}

function buildGuardianPhone(index) {
  return `90000${String(index).padStart(5, "0")}`.slice(0, 10);
}

async function upsertAuthUser({
  tenantId,
  username,
  email,
  role,
  passwordHash,
  hierarchyNodeId,
  parentUserId = null,
  studentId = null,
  mustChangePassword = false
}) {
  return prisma.authUser.upsert({
    where: {
      tenantId_username: {
        tenantId,
        username
      }
    },
    update: {
      email,
      role,
      passwordHash,
      hierarchyNodeId,
      parentUserId,
      studentId,
      mustChangePassword,
      isActive: true,
      failedAttempts: 0,
      lockUntil: null
    },
    create: {
      tenantId,
      username,
      email,
      role,
      passwordHash,
      hierarchyNodeId,
      parentUserId,
      studentId,
      mustChangePassword,
      isActive: true
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      hierarchyNodeId: true
    }
  });
}

async function resolveCenterScope(centerCode) {
  const byUsername = await prisma.authUser.findFirst({
    where: {
      username: centerCode,
      role: "CENTER",
      isActive: true
    },
    select: {
      id: true,
      tenantId: true,
      username: true,
      email: true,
      parentUserId: true,
      hierarchyNodeId: true,
      hierarchyNode: {
        select: {
          id: true,
          code: true,
          name: true,
          type: true
        }
      }
    }
  });

  if (byUsername?.hierarchyNodeId) {
    const centerProfile = await prisma.centerProfile.findFirst({
      where: { authUserId: byUsername.id },
      select: {
        id: true,
        code: true,
        name: true,
        franchiseProfileId: true
      }
    });

    return {
      tenantId: byUsername.tenantId,
      centerAuth: byUsername,
      centerNode: byUsername.hierarchyNode,
      centerProfile
    };
  }

  const profile = await prisma.centerProfile.findFirst({
    where: { code: centerCode, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      franchiseProfileId: true,
      tenantId: true,
      authUser: {
        select: {
          id: true,
          tenantId: true,
          username: true,
          email: true,
          parentUserId: true,
          hierarchyNodeId: true,
          hierarchyNode: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true
            }
          }
        }
      }
    }
  });

  if (!profile?.authUser?.hierarchyNodeId) {
    throw new Error(`Active center not found for code: ${centerCode}`);
  }

  return {
    tenantId: profile.tenantId,
    centerAuth: profile.authUser,
    centerNode: profile.authUser.hierarchyNode,
    centerProfile: {
      id: profile.id,
      code: profile.code,
      name: profile.name,
      franchiseProfileId: profile.franchiseProfileId
    }
  };
}

async function ensureCoursePool({ tenantId, centerCode, minimumCount = 3 }) {
  const seededCourses = [];
  for (let index = 1; index <= minimumCount; index += 1) {
    const code = `${centerCode}-COURSE-${padNumber(index, 2)}`;
    const course = await prisma.course.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code
        }
      },
      update: {
        name: `${centerCode} Test Course ${index}`,
        isActive: true
      },
      create: {
        tenantId,
        code,
        name: `${centerCode} Test Course ${index}`,
        isActive: true
      },
      select: { id: true, code: true, name: true }
    });
    seededCourses.push(course);
  }

  return seededCourses;
}

async function ensureLevelPool({ tenantId, minimumCount = 3 }) {
  const existingLevels = await prisma.level.findMany({
    where: { tenantId },
    orderBy: [{ rank: "asc" }],
    select: { id: true, name: true, rank: true }
  });

  if (existingLevels.length >= minimumCount) {
    return existingLevels.slice(0, minimumCount);
  }

  const createdLevels = [];
  let nextRank = existingLevels.length ? Math.max(...existingLevels.map((level) => Number(level.rank) || 0)) + 1 : 1;

  while (existingLevels.length + createdLevels.length < minimumCount) {
    const level = await prisma.level.upsert({
      where: {
        tenantId_rank: {
          tenantId,
          rank: nextRank
        }
      },
      update: {
        name: `Level ${nextRank}`
      },
      create: {
        tenantId,
        rank: nextRank,
        name: `Level ${nextRank}`,
        description: `Generated test level ${nextRank}`
      },
      select: { id: true, name: true, rank: true }
    });
    createdLevels.push(level);
    nextRank += 1;
  }

  return [...existingLevels, ...createdLevels].sort((left, right) => left.rank - right.rank).slice(0, minimumCount);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  requirePositiveInteger(options.teacherCount, "teacherCount");
  requirePositiveInteger(options.studentCount, "studentCount");

  const centerCode = String(options.centerCode || "").trim().toUpperCase();
  if (!centerCode) {
    throw new Error("centerCode is required");
  }

  const { tenantId, centerAuth, centerNode, centerProfile } = await resolveCenterScope(centerCode);
  if (!centerNode?.id) {
    throw new Error(`Center hierarchy node is missing for ${centerCode}`);
  }

  const [coursePool, levelPool, passwordHash] = await Promise.all([
    ensureCoursePool({ tenantId, centerCode, minimumCount: 3 }),
    ensureLevelPool({ tenantId, minimumCount: 3 }),
    bcrypt.hash(options.defaultPassword, 12)
  ]);

  const teacherRecords = [];
  for (let index = 1; index <= options.teacherCount; index += 1) {
    const username = teacherUsername(centerCode, index);
    const email = teacherEmail(centerCode, index);
    const level = levelPool[(index - 1) % levelPool.length];
    const course = coursePool[(index - 1) % coursePool.length];

    const authUser = await upsertAuthUser({
      tenantId,
      username,
      email,
      role: "TEACHER",
      passwordHash,
      hierarchyNodeId: centerNode.id,
      parentUserId: centerAuth.id,
      mustChangePassword: false
    });

    await prisma.teacherProfile.upsert({
      where: { authUserId: authUser.id },
      update: {
        tenantId,
        hierarchyNodeId: centerNode.id,
        fullName: `${centerCode} Teacher ${padNumber(index, 2)}`,
        phonePrimary: `98${String(index).padStart(8, "0")}`.slice(0, 10),
        status: "ACTIVE",
        isActive: true
      },
      create: {
        tenantId,
        hierarchyNodeId: centerNode.id,
        authUserId: authUser.id,
        fullName: `${centerCode} Teacher ${padNumber(index, 2)}`,
        phonePrimary: `98${String(index).padStart(8, "0")}`.slice(0, 10),
        status: "ACTIVE",
        isActive: true
      }
    });

    const batchName = `${centerCode}-BATCH-${padNumber(index, 2)}-L${padNumber(level.rank, 2)}`;
    const batch = await prisma.batch.upsert({
      where: {
        tenantId_hierarchyNodeId_name: {
          tenantId,
          hierarchyNodeId: centerNode.id,
          name: batchName
        }
      },
      update: {
        status: "ACTIVE",
        isActive: true,
        schedule: { mode: "WEEKDAY", slot: index % 2 === 0 ? "16:00-17:00" : "17:00-18:00" }
      },
      create: {
        tenantId,
        hierarchyNodeId: centerNode.id,
        name: batchName,
        status: "ACTIVE",
        isActive: true,
        schedule: { mode: "WEEKDAY", slot: index % 2 === 0 ? "16:00-17:00" : "17:00-18:00" }
      },
      select: { id: true, name: true }
    });

    await prisma.batchTeacherAssignment.upsert({
      where: {
        batchId_teacherUserId: {
          batchId: batch.id,
          teacherUserId: authUser.id
        }
      },
      update: {
        tenantId
      },
      create: {
        tenantId,
        batchId: batch.id,
        teacherUserId: authUser.id
      }
    });

    teacherRecords.push({
      index,
      authUser,
      batch,
      level,
      course
    });
  }

  const studentRecords = [];
  let createdStudents = 0;
  let updatedStudents = 0;

  for (let index = 1; index <= options.studentCount; index += 1) {
    const teacherRecord = teacherRecords[(index - 1) % teacherRecords.length];
    const admissionNo = studentAdmissionNo(centerCode, index);
    const email = studentEmail(centerCode, index);

    const student = await prisma.student.upsert({
      where: {
        tenantId_admissionNo: {
          tenantId,
          admissionNo
        }
      },
      update: {
        firstName: `${centerCode}Student${padNumber(index, 3)}`,
        lastName: `L${teacherRecord.level.rank}`,
        email,
        guardianName: `Guardian ${padNumber(index, 3)}`,
        guardianPhone: buildGuardianPhone(index),
        phonePrimary: buildGuardianPhone(index),
        hierarchyNodeId: centerNode.id,
        levelId: teacherRecord.level.id,
        courseId: teacherRecord.course.id,
        currentTeacherUserId: teacherRecord.authUser.id,
        isActive: true
      },
      create: {
        tenantId,
        admissionNo,
        firstName: `${centerCode}Student${padNumber(index, 3)}`,
        lastName: `L${teacherRecord.level.rank}`,
        email,
        guardianName: `Guardian ${padNumber(index, 3)}`,
        guardianPhone: buildGuardianPhone(index),
        phonePrimary: buildGuardianPhone(index),
        hierarchyNodeId: centerNode.id,
        levelId: teacherRecord.level.id,
        courseId: teacherRecord.course.id,
        currentTeacherUserId: teacherRecord.authUser.id,
        isActive: true
      },
      select: {
        id: true,
        admissionNo: true,
        createdAt: true,
        updatedAt: true,
        currentTeacherUserId: true,
        levelId: true,
        courseId: true
      }
    });

    if (student.createdAt.getTime() === student.updatedAt.getTime()) {
      createdStudents += 1;
    } else {
      updatedStudents += 1;
    }

    await upsertAuthUser({
      tenantId,
      username: admissionNo,
      email,
      role: "STUDENT",
      passwordHash,
      hierarchyNodeId: centerNode.id,
      parentUserId: centerAuth.id,
      studentId: student.id,
      mustChangePassword: false
    });

    studentRecords.push({
      id: student.id,
      admissionNo,
      teacherUserId: teacherRecord.authUser.id,
      batchId: teacherRecord.batch.id,
      levelId: teacherRecord.level.id,
      courseId: teacherRecord.course.id
    });
  }

  const createdStudentIds = studentRecords.map((student) => student.id);

  await prisma.enrollment.deleteMany({
    where: {
      tenantId,
      hierarchyNodeId: centerNode.id,
      studentId: { in: createdStudentIds }
    }
  });

  await prisma.enrollment.createMany({
    data: studentRecords.map((student) => ({
      tenantId,
      hierarchyNodeId: centerNode.id,
      studentId: student.id,
      batchId: student.batchId,
      assignedTeacherUserId: student.teacherUserId,
      levelId: student.levelId,
      status: "ACTIVE"
    }))
  });

  const validationRows = await prisma.student.findMany({
    where: {
      id: { in: createdStudentIds }
    },
    select: {
      id: true,
      admissionNo: true,
      currentTeacherUserId: true,
      levelId: true,
      courseId: true,
      batchEnrollments: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          hierarchyNodeId: true,
          assignedTeacherUserId: true,
          levelId: true,
          batchId: true
        }
      },
      authUsers: {
        where: { role: "STUDENT", isActive: true },
        select: { id: true, username: true }
      }
    }
  });

  const missingStudentLogins = [];
  const missingCourseAssignments = [];
  const missingActiveEnrollments = [];
  const duplicateActiveEnrollments = [];
  const teacherMismatches = [];
  const levelMismatches = [];
  const centerMismatches = [];

  for (const student of validationRows) {
    if (!student.authUsers.length) {
      missingStudentLogins.push(student.admissionNo);
    }
    if (!student.courseId) {
      missingCourseAssignments.push(student.admissionNo);
    }
    if (!student.batchEnrollments.length) {
      missingActiveEnrollments.push(student.admissionNo);
      continue;
    }
    if (student.batchEnrollments.length > 1) {
      duplicateActiveEnrollments.push(student.admissionNo);
    }

    const activeEnrollment = student.batchEnrollments[0];
    if ((activeEnrollment.assignedTeacherUserId || null) !== (student.currentTeacherUserId || null)) {
      teacherMismatches.push(student.admissionNo);
    }
    if ((activeEnrollment.levelId || null) !== (student.levelId || null)) {
      levelMismatches.push(student.admissionNo);
    }
    if ((activeEnrollment.hierarchyNodeId || null) !== centerNode.id) {
      centerMismatches.push(student.admissionNo);
    }
  }

  const teacherStudentCounts = await prisma.enrollment.groupBy({
    by: ["assignedTeacherUserId"],
    where: {
      tenantId,
      hierarchyNodeId: centerNode.id,
      status: "ACTIVE",
      studentId: { in: createdStudentIds }
    },
    _count: { _all: true }
  });

  const countByTeacherId = new Map(
    teacherStudentCounts.map((row) => [row.assignedTeacherUserId || "UNASSIGNED", Number(row?._count?._all || 0)])
  );

  const teacherSummary = teacherRecords.map((teacher) => ({
    username: teacher.authUser.username,
    email: teacher.authUser.email,
    batchName: teacher.batch.name,
    levelName: teacher.level.name,
    levelRank: teacher.level.rank,
    courseCode: teacher.course.code,
    assignedStudents: countByTeacherId.get(teacher.authUser.id) || 0
  }));

  const levelSummaryRows = await prisma.student.groupBy({
    by: ["levelId", "courseId"],
    where: {
      id: { in: createdStudentIds }
    },
    _count: { _all: true }
  });

  const levelsById = new Map(levelPool.map((level) => [level.id, level]));
  const coursesById = new Map(coursePool.map((course) => [course.id, course]));
  const distributionSummary = levelSummaryRows.map((row) => ({
    levelId: row.levelId,
    levelName: levelsById.get(row.levelId)?.name || row.levelId,
    levelRank: levelsById.get(row.levelId)?.rank ?? null,
    courseId: row.courseId,
    courseCode: coursesById.get(row.courseId)?.code || row.courseId,
    courseName: coursesById.get(row.courseId)?.name || null,
    students: Number(row?._count?._all || 0)
  }));

  console.log(
    JSON.stringify(
      {
        ok:
          teacherSummary.every((teacher) => teacher.assignedStudents > 0) &&
          missingStudentLogins.length === 0 &&
          missingCourseAssignments.length === 0 &&
          missingActiveEnrollments.length === 0 &&
          duplicateActiveEnrollments.length === 0 &&
          teacherMismatches.length === 0 &&
          levelMismatches.length === 0 &&
          centerMismatches.length === 0,
        center: {
          centerCode,
          centerName: centerProfile?.name || centerNode.name,
          hierarchyNodeId: centerNode.id,
          hierarchyNodeCode: centerNode.code || null,
          tenantId,
          centerAuthUsername: centerAuth.username
        },
        createdTeachers: teacherRecords.length,
        createdStudents,
        updatedStudents,
        activeEnrollmentsCreated: studentRecords.length,
        teacherSummary,
        distributionSummary,
        validation: {
          missingStudentLogins,
          missingCourseAssignments,
          missingActiveEnrollments,
          duplicateActiveEnrollments,
          teacherMismatches,
          levelMismatches,
          centerMismatches
        },
        credentials: {
          defaultPassword: options.defaultPassword,
          teacherUsernames: teacherRecords.map((teacher) => teacher.authUser.username),
          studentUsernamesSample: studentRecords.slice(0, 10).map((student) => student.admissionNo)
        }
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });