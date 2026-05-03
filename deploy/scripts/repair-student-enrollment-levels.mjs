import dotenv from "dotenv";

import { createPrismaClient } from "../src/lib/prisma-client.js";

dotenv.config();

const prisma = createPrismaClient();

function parseArgs(argv) {
  const options = {
    apply: false,
    tenantId: null,
    studentId: null,
    limit: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "").trim();
    if (!arg) {
      continue;
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg.startsWith("--tenantId=")) {
      options.tenantId = arg.slice("--tenantId=".length).trim() || null;
      continue;
    }

    if (arg === "--tenantId") {
      options.tenantId = String(argv[index + 1] || "").trim() || null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--studentId=")) {
      options.studentId = arg.slice("--studentId=".length).trim() || null;
      continue;
    }

    if (arg === "--studentId") {
      options.studentId = String(argv[index + 1] || "").trim() || null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.slice("--limit=".length).trim(), 10);
      options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      continue;
    }

    if (arg === "--limit") {
      const parsed = Number.parseInt(String(argv[index + 1] || "").trim(), 10);
      options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      index += 1;
    }
  }

  return options;
}

function fullName(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(" ").trim() || null;
}

function sameLevelId(left, right) {
  return (left || null) === (right || null);
}

function buildMismatchGroup(enrollment) {
  return {
    tenantId: enrollment.tenantId,
    studentId: enrollment.student.id,
    admissionNo: enrollment.student.admissionNo || null,
    fullName: fullName(enrollment.student),
    targetLevelId: enrollment.student.levelId || null,
    targetLevelName: enrollment.student.level?.name || null,
    targetLevelRank: enrollment.student.level?.rank ?? null,
    enrollments: []
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const activeEnrollments = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      ...(options.tenantId ? { tenantId: options.tenantId } : {}),
      ...(options.studentId ? { studentId: options.studentId } : {})
    },
    orderBy: [{ tenantId: "asc" }, { studentId: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      levelId: true,
      batch: { select: { id: true, name: true } },
      level: { select: { id: true, name: true, rank: true } },
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          levelId: true,
          level: { select: { id: true, name: true, rank: true } }
        }
      }
    }
  });

  const groups = new Map();
  for (const enrollment of activeEnrollments) {
    const key = `${enrollment.tenantId}:${enrollment.student.id}`;
    if (!groups.has(key)) {
      groups.set(key, buildMismatchGroup(enrollment));
    }

    groups.get(key).enrollments.push({
      enrollmentId: enrollment.id,
      batchId: enrollment.batch?.id || null,
      batchName: enrollment.batch?.name || null,
      currentLevelId: enrollment.levelId || null,
      currentLevelName: enrollment.level?.name || null,
      currentLevelRank: enrollment.level?.rank ?? null
    });
  }

  const allGroups = Array.from(groups.values());
  const mismatchedGroups = allGroups.filter((group) =>
    group.enrollments.some((enrollment) => !sameLevelId(enrollment.currentLevelId, group.targetLevelId))
  );

  const candidateGroups = options.limit ? mismatchedGroups.slice(0, options.limit) : mismatchedGroups;

  let updatedStudents = 0;
  let updatedEnrollments = 0;
  let skippedStudents = 0;
  let pendingEnrollments = 0;
  const notes = [];

  for (const group of candidateGroups) {
    const mismatchedEnrollments = group.enrollments.filter(
      (enrollment) => !sameLevelId(enrollment.currentLevelId, group.targetLevelId)
    );

    if (!group.targetLevelId) {
      skippedStudents += 1;
      notes.push({
        tenantId: group.tenantId,
        studentId: group.studentId,
        admissionNo: group.admissionNo,
        fullName: group.fullName,
        status: "skipped",
        reason: "student.levelId is null, so active enrollments were left unchanged for manual review.",
        mismatchedEnrollments
      });
      continue;
    }

    if (options.apply) {
      const result = await prisma.enrollment.updateMany({
        where: {
          tenantId: group.tenantId,
          studentId: group.studentId,
          status: "ACTIVE"
        },
        data: {
          levelId: group.targetLevelId
        }
      });

      updatedStudents += 1;
      updatedEnrollments += result.count;
      notes.push({
        tenantId: group.tenantId,
        studentId: group.studentId,
        admissionNo: group.admissionNo,
        fullName: group.fullName,
        status: "updated",
        targetLevelId: group.targetLevelId,
        targetLevelName: group.targetLevelName,
        targetLevelRank: group.targetLevelRank,
        updatedEnrollmentCount: result.count,
        mismatchedEnrollments
      });
      continue;
    }

    pendingEnrollments += mismatchedEnrollments.length;
    notes.push({
      tenantId: group.tenantId,
      studentId: group.studentId,
      admissionNo: group.admissionNo,
      fullName: group.fullName,
      status: "pending",
      targetLevelId: group.targetLevelId,
      targetLevelName: group.targetLevelName,
      targetLevelRank: group.targetLevelRank,
      mismatchedEnrollments
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: options.apply ? "apply" : "dry-run",
        filters: {
          tenantId: options.tenantId,
          studentId: options.studentId,
          limit: options.limit
        },
        scannedActiveEnrollments: activeEnrollments.length,
        scannedStudents: allGroups.length,
        totalMismatchedStudents: mismatchedGroups.length,
        processedMismatchedStudents: candidateGroups.length,
        skippedStudents,
        updatedStudents,
        updatedEnrollments,
        pendingEnrollments,
        notes
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