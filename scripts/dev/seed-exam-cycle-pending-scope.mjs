/**
 * Dev-only idempotent seed for testing Exam Cycle Pending approval scoped mapping.
 *
 * Creates/reuses:
 * - one EXAM scoped course (EX-GBLS-2026-JULY)
 * - exam course level 1 (levels 2/6 intentionally NOT created to test per-level scope messages)
 * - level 1 question bank sample questions scoped to the exam course
 * - level 1 published worksheet EX-GBLS-2026-JULY-L1-W1 with questions
 * - one exam cycle
 * - one pending (SUBMITTED_TO_SUPERADMIN) combined enrollment list with students across levels 1, 2, 6
 *
 * Never deletes data. Never touches GENERAL courses. Do NOT run on production.
 */
import { createHash } from "node:crypto";
import { prisma } from "../../src/lib/prisma.js";

const TENANT_ID = process.env.SEED_TENANT_ID || "tenant_default";
const EXAM_COURSE_CODE = "EX-GBLS-2026-JULY";
const EXAM_CYCLE_CODE = "EX-JULY-PENDING-SCOPE-TEST";
const WORKSHEET_TITLE = "EX-GBLS-2026-JULY-L1-W1";
const QB_SAMPLE_COUNT = 12;

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run seed in production.");
  process.exit(1);
}

function promptScopeKey({ courseId, courseLevelId, prompt }) {
  return createHash("sha256")
    .update(`${courseId || "LEGACY"}|${courseLevelId || "LEGACY"}|${String(prompt || "").trim()}`)
    .digest("hex");
}

async function ensureLevel(rank, name) {
  const existing = await prisma.level.findFirst({ where: { tenantId: TENANT_ID, rank } });
  if (existing) return existing;
  return prisma.level.create({
    data: { tenantId: TENANT_ID, rank, name, description: `Seeded academic level ${rank}` }
  });
}

async function ensureStudent({ admissionNo, firstName, lastName, levelId, hierarchyNodeId }) {
  const existing = await prisma.student.findFirst({ where: { tenantId: TENANT_ID, admissionNo } });
  if (existing) return existing;
  return prisma.student.create({
    data: {
      tenantId: TENANT_ID,
      admissionNo,
      firstName,
      lastName,
      levelId,
      hierarchyNodeId,
      isActive: true
    }
  });
}

async function main() {
  const superadmin = await prisma.authUser.findFirst({
    where: { tenantId: TENANT_ID, role: "SUPERADMIN", isActive: true },
    select: { id: true }
  });
  if (!superadmin) throw new Error("No active SUPERADMIN found for tenant");

  const businessPartner = await prisma.businessPartner.findFirst({
    where: { tenantId: TENANT_ID },
    select: { id: true }
  });
  if (!businessPartner) throw new Error("No BusinessPartner found for tenant");

  const centerNode = await prisma.hierarchyNode.findFirst({
    where: { tenantId: TENANT_ID, type: { in: ["SCHOOL", "BRANCH"] } },
    select: { id: true, name: true }
  });
  if (!centerNode) throw new Error("No center hierarchy node found for tenant");

  const level1 = await ensureLevel(1, "Level 1");
  const level2 = await ensureLevel(2, "Level 2");
  const level6 = await ensureLevel(6, "Level 6");

  // 1) EXAM scoped course
  let examCourse = await prisma.course.findFirst({ where: { tenantId: TENANT_ID, code: EXAM_COURSE_CODE } });
  if (!examCourse) {
    examCourse = await prisma.course.create({
      data: {
        tenantId: TENANT_ID,
        code: EXAM_COURSE_CODE,
        name: EXAM_COURSE_CODE,
        scope: "EXAM",
        isActive: true
      }
    });
  }

  // 2) Exam course level 1 only (2/6 intentionally missing to test per-level messages)
  let courseLevel1 = await prisma.courseLevel.findFirst({ where: { courseId: examCourse.id, levelNumber: 1 } });
  if (!courseLevel1) {
    courseLevel1 = await prisma.courseLevel.create({
      data: {
        tenantId: TENANT_ID,
        courseId: examCourse.id,
        levelNumber: 1,
        title: "EXAM Level 1",
        sortOrder: 1,
        isActive: true
      }
    });
  }

  // 3) Level 1 question bank scoped to exam course
  const qbIds = [];
  for (let i = 1; i <= QB_SAMPLE_COUNT; i += 1) {
    const prompt = `SEED-JULY-QB-${i}: ${i} + ${i + 1}`;
    const key = promptScopeKey({ courseId: examCourse.id, courseLevelId: courseLevel1.id, prompt });
    let row = await prisma.questionBank.findFirst({
      where: { tenantId: TENANT_ID, levelId: level1.id, promptScopeKey: key },
      select: { id: true }
    });
    if (!row) {
      row = await prisma.questionBank.create({
        data: {
          tenantId: TENANT_ID,
          levelId: level1.id,
          courseId: examCourse.id,
          courseLevelId: courseLevel1.id,
          templateId: null,
          difficulty: i % 3 === 0 ? "EASY" : "MEDIUM",
          prompt,
          promptScopeKey: key,
          operands: { terms: [i, i + 1], operators: ["", "ADD"] },
          operation: "ADD",
          correctAnswer: i + (i + 1),
          isActive: true
        },
        select: { id: true }
      });
    }
    qbIds.push(row.id);
  }

  // 4) Published Level 1 worksheet with questions
  let worksheet = await prisma.worksheet.findFirst({
    where: { tenantId: TENANT_ID, title: WORKSHEET_TITLE, courseId: examCourse.id }
  });
  if (!worksheet) {
    worksheet = await prisma.worksheet.create({
      data: {
        tenantId: TENANT_ID,
        title: WORKSHEET_TITLE,
        description: "Seeded exam worksheet for pending scope testing",
        difficulty: "MEDIUM",
        levelId: level1.id,
        courseId: examCourse.id,
        courseLevelId: courseLevel1.id,
        createdByUserId: superadmin.id,
        isPublished: false
      }
    });
  }
  const existingQuestionCount = await prisma.worksheetQuestion.count({ where: { worksheetId: worksheet.id } });
  if (existingQuestionCount === 0) {
    let qNo = 1;
    for (const qbId of qbIds.slice(0, 10)) {
      const qb = await prisma.questionBank.findUnique({ where: { id: qbId } });
      await prisma.worksheetQuestion.create({
        data: {
          tenantId: TENANT_ID,
          worksheetId: worksheet.id,
          questionBankId: qb.id,
          questionNumber: qNo,
          operands: qb.operands,
          operation: qb.operation,
          correctAnswer: qb.correctAnswer
        }
      });
      qNo += 1;
    }
  }
  if (!worksheet.isPublished) {
    worksheet = await prisma.worksheet.update({ where: { id: worksheet.id }, data: { isPublished: true } });
  }

  // 5) Exam cycle
  let examCycle = await prisma.examCycle.findFirst({ where: { tenantId: TENANT_ID, code: EXAM_CYCLE_CODE } });
  if (!examCycle) {
    const now = new Date();
    const plusDays = (d) => new Date(now.getTime() + d * 86400000);
    examCycle = await prisma.examCycle.create({
      data: {
        tenantId: TENANT_ID,
        businessPartnerId: businessPartner.id,
        name: "Pending Scope Test Cycle (JULY)",
        code: EXAM_CYCLE_CODE,
        enrollmentStartAt: now,
        enrollmentEndAt: plusDays(7),
        practiceStartAt: plusDays(8),
        examStartsAt: plusDays(14),
        examEndsAt: plusDays(15),
        examDurationMinutes: 60,
        createdByUserId: superadmin.id
      }
    });
  }

  // 6) Students across levels 1, 2, 6
  const students = [];
  students.push(await ensureStudent({ admissionNo: "SEED-JULY-L1-1", firstName: "SeedL1", lastName: "One", levelId: level1.id, hierarchyNodeId: centerNode.id }));
  students.push(await ensureStudent({ admissionNo: "SEED-JULY-L1-2", firstName: "SeedL1", lastName: "Two", levelId: level1.id, hierarchyNodeId: centerNode.id }));
  students.push(await ensureStudent({ admissionNo: "SEED-JULY-L2-1", firstName: "SeedL2", lastName: "One", levelId: level2.id, hierarchyNodeId: centerNode.id }));
  students.push(await ensureStudent({ admissionNo: "SEED-JULY-L6-1", firstName: "SeedL6", lastName: "One", levelId: level6.id, hierarchyNodeId: centerNode.id }));

  // 7) Enrollment entries + pending combined list
  const entryIds = [];
  for (const student of students) {
    let entry = await prisma.examEnrollmentEntry.findFirst({
      where: { tenantId: TENANT_ID, examCycleId: examCycle.id, studentId: student.id }
    });
    if (!entry) {
      entry = await prisma.examEnrollmentEntry.create({
        data: {
          tenantId: TENANT_ID,
          examCycleId: examCycle.id,
          studentId: student.id,
          enrolledLevelId: student.levelId,
          createdByUserId: superadmin.id
        }
      });
    }
    entryIds.push(entry.id);
  }

  const scopeKey = `CENTER:${centerNode.id}`;
  let list = await prisma.examEnrollmentList.findFirst({
    where: { tenantId: TENANT_ID, examCycleId: examCycle.id, scopeKey }
  });
  if (!list) {
    list = await prisma.examEnrollmentList.create({
      data: {
        tenantId: TENANT_ID,
        examCycleId: examCycle.id,
        type: "CENTER_COMBINED",
        scopeKey,
        hierarchyNodeId: centerNode.id,
        status: "SUBMITTED_TO_SUPERADMIN",
        forwardedAt: new Date(),
        createdByUserId: superadmin.id
      }
    });
  } else if (list.status !== "SUBMITTED_TO_SUPERADMIN") {
    list = await prisma.examEnrollmentList.update({
      where: { id: list.id },
      data: { status: "SUBMITTED_TO_SUPERADMIN", forwardedAt: new Date() }
    });
  }

  for (const entryId of entryIds) {
    const item = await prisma.examEnrollmentListItem.findFirst({ where: { listId: list.id, entryId } });
    if (!item) {
      await prisma.examEnrollmentListItem.create({
        data: { tenantId: TENANT_ID, listId: list.id, entryId, included: true }
      });
    }
  }

  console.log("=== Seed complete (idempotent) ===");
  console.log("examCourseId:      ", examCourse.id, `(${EXAM_COURSE_CODE})`);
  console.log("examCourseLevel1Id:", courseLevel1.id);
  console.log("level1Id:          ", level1.id);
  console.log("level2Id:          ", level2.id);
  console.log("level6Id:          ", level6.id);
  console.log("worksheetId:       ", worksheet.id, `(${WORKSHEET_TITLE}, published=${worksheet.isPublished})`);
  console.log("questionBankRows:  ", qbIds.length);
  console.log("examCycleId:       ", examCycle.id, `(${EXAM_CYCLE_CODE})`);
  console.log("pendingListId:     ", list.id, `(status=SUBMITTED_TO_SUPERADMIN)`);
  console.log("");
  console.log("Test URLs:");
  console.log(`  /superadmin/exam-cycles?tab=worksheets&examCourseId=${examCourse.id}&examLevelNumber=1`);
  console.log(`  /superadmin/exam-cycles?tab=question-bank&examCourseId=${examCourse.id}&examLevelNumber=1`);
  console.log(`  /superadmin/exam-cycles/${examCycle.id}/pending?examCourseId=${examCourse.id}&examLevelNumber=1`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
