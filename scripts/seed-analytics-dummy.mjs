/**
 * Seed script: Dummy data for Center Analytics feature verification.
 * Populates: AttendanceSession, AttendanceEntry, Worksheet, WorksheetAssignment,
 *            WorksheetSubmission, MockTest, MockTestResult, Competition,
 *            CompetitionEnrollment for center T1100 (cmmemji7x0005hru0z06mltos).
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ─── Known IDs from the existing DB ──────────────────────────────────
const TENANT  = "tenant_default";
const CENTER  = "cmmemji7x0005hru0z06mltos"; // T1100-CENTER
const BATCH   = "cmmemp23a000nhr1obfvi3d86"; // BATCH-T1100
const TEACHER = "cmmemjicq000dhru0bkfkbqrs"; // teacher-t1100
const LEVEL1  = "cmmein2i20007hrpki12iw2kz"; // Level 1
const LEVEL2  = "cmmein2jv0009hrpkxz777mgt"; // Level 2
const BP      = "cmmemjidv000fhru0egpnds3i"; // BP1100

// Students ST0001–ST0025
const STUDENTS = [
  "cmmemqghs000phr4wns8xs7tn", "cmmemqgiu000rhr4w52r3f07f", "cmmemqgjr000thr4wye9zumb2",
  "cmmemqgkq000vhr4wf7ktpgle", "cmmemqglk000xhr4w7pqc2akn", "cmmemqgmf000zhr4wtsds4a20",
  "cmmemqgnc0011hr4wimrrsmaa", "cmmemqgo90013hr4wvlch63os", "cmmemqgp40015hr4wlxhje344",
  "cmmemqgpy0017hr4wvvpax2no", "cmmemqgqu0019hr4w201tqvfd", "cmmemqgro001bhr4watj51da2",
  "cmmemqgsl001dhr4wc9l2viog", "cmmemqgte001fhr4w4pd26bd5", "cmmemqgua001hhr4w26sa9fd3",
  "cmmemqgv8001jhr4w2tt50jgr", "cmmemqgw5001lhr4wfjc1ztd3", "cmmemqgx1001nhr4wwwgoxp5e",
  "cmmemqgxx001phr4wjcwp8qi8", "cmmemqgyu001rhr4wt3oo9ucb", "cmmemqgzn001thr4w4j53ynmr",
  "cmmemqh0k001vhr4wqq5fhcz0", "cmmemqh1k001xhr4wak95ggr1", "cmmemqh2m001zhr4w7fpfhlyt",
  "cmmemqh3l0021hr4w7l6832g0"
];

function cuid() {
  return "seed" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(10, 0, 0, 0); return d; }

const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];
function weightedStatus() {
  const r = Math.random();
  if (r < 0.65) return "PRESENT";
  if (r < 0.80) return "ABSENT";
  if (r < 0.92) return "LATE";
  return "EXCUSED";
}

async function main() {
  console.log("Seeding analytics dummy data for center T1100...");

  // ── 1. Attendance: Sessions + Entries ──────────────────────────────
  console.log("  → Attendance sessions & entries...");
  const sessionIds = [];
  for (let day = 1; day <= 30; day++) {
    const sessionId = cuid();
    sessionIds.push(sessionId);
    await prisma.attendanceSession.create({
      data: {
        id: sessionId,
        tenantId: TENANT,
        hierarchyNodeId: CENTER,
        batchId: BATCH,
        date: daysAgo(day),
        status: "PUBLISHED",
        createdByUserId: TEACHER,
      },
    });

    // Each student gets an entry for each session
    const entries = STUDENTS.map((sid) => ({
      sessionId,
      studentId: sid,
      tenantId: TENANT,
      status: weightedStatus(),
      markedAt: daysAgo(day),
      markedByUserId: TEACHER,
    }));
    await prisma.attendanceEntry.createMany({ data: entries });
  }
  console.log(`    ✓ ${sessionIds.length} sessions, ${sessionIds.length * STUDENTS.length} entries`);

  // ── 2. Worksheets + Assignments + Submissions ──────────────────────
  console.log("  → Worksheets, assignments & submissions...");
  const worksheetIds = [];
  for (let i = 1; i <= 12; i++) {
    const wId = cuid();
    worksheetIds.push(wId);
    await prisma.worksheet.create({
      data: {
        id: wId,
        tenantId: TENANT,
        title: `Practice Worksheet ${i}`,
        difficulty: ["EASY", "MEDIUM", "HARD"][i % 3],
        levelId: i <= 8 ? LEVEL1 : LEVEL2,
        createdByUserId: TEACHER,
        isPublished: true,
        timeLimitSeconds: randomInt(300, 900),
      },
    });
  }

  let assignCount = 0, submitCount = 0;
  for (const wId of worksheetIds) {
    // Assign to 15–25 students  
    const assignStudents = STUDENTS.slice(0, randomInt(15, 25));
    const assignments = assignStudents.map((sid) => ({
      tenantId: TENANT,
      worksheetId: wId,
      studentId: sid,
      createdByUserId: TEACHER,
      assignedAt: daysAgo(randomInt(1, 28)),
      isActive: true,
    }));
    await prisma.worksheetAssignment.createMany({ data: assignments, skipDuplicates: true });
    assignCount += assignments.length;

    // ~70% of assigned students submit
    for (const sid of assignStudents) {
      if (Math.random() < 0.7) {
        const score = parseFloat((Math.random() * 100).toFixed(2));
        await prisma.worksheetSubmission.create({
          data: {
            id: cuid(),
            tenantId: TENANT,
            worksheetId: wId,
            studentId: sid,
            score,
            status: "REVIEWED",
            correctCount: Math.round(score / 5),
            totalQuestions: 20,
            completionTimeSeconds: randomInt(120, 600),
            submittedAt: daysAgo(randomInt(1, 25)),
            passed: score >= 50,
          },
        });
        submitCount++;
      }
    }
  }
  console.log(`    ✓ ${worksheetIds.length} worksheets, ${assignCount} assignments, ${submitCount} submissions`);

  // ── 3. Mock Tests + Results ────────────────────────────────────────
  console.log("  → Mock tests & results...");
  let mtCount = 0, mtrCount = 0;
  for (let i = 1; i <= 8; i++) {
    const mtId = cuid();
    const maxMarks = [50, 100, 100, 50, 100, 50, 100, 50][i - 1];
    await prisma.mockTest.create({
      data: {
        id: mtId,
        tenantId: TENANT,
        hierarchyNodeId: CENTER,
        batchId: BATCH,
        title: `Mock Test ${i} - Level 1`,
        date: daysAgo(i * 3),
        maxMarks,
        status: i <= 6 ? "PUBLISHED" : "DRAFT",
        createdByUserId: TEACHER,
      },
    });
    mtCount++;

    // Results for 15–25 students
    if (i <= 6) {
      const testStudents = STUDENTS.slice(0, randomInt(15, 25));
      const results = testStudents.map((sid) => ({
        mockTestId: mtId,
        studentId: sid,
        tenantId: TENANT,
        marks: randomInt(Math.floor(maxMarks * 0.2), maxMarks),
        recordedByUserId: TEACHER,
      }));
      await prisma.mockTestResult.createMany({ data: results });
      mtrCount += results.length;
    }
  }
  console.log(`    ✓ ${mtCount} mock tests, ${mtrCount} results`);

  // ── 4. Competitions + Enrollments ──────────────────────────────────
  console.log("  → Competitions & enrollments...");
  let compCount = 0, ceCount = 0;
  const compTitles = [
    "Abacus Speed Challenge 2026",
    "Mental Math Championship", 
    "Inter-Center Calculation Derby",
    "Junior Abacus Olympiad",
  ];
  for (let i = 0; i < compTitles.length; i++) {
    const compId = cuid();
    const startsAt = daysAgo(30 - i * 7);
    const endsAt = daysAgo(25 - i * 7);
    await prisma.competition.create({
      data: {
        id: compId,
        tenantId: TENANT,
        title: compTitles[i],
        status: i < 2 ? "COMPLETED" : (i === 2 ? "ACTIVE" : "SCHEDULED"),
        workflowStage: i < 2 ? "APPROVED" : "CENTER_REVIEW",
        startsAt,
        endsAt,
        hierarchyNodeId: CENTER,
        levelId: LEVEL1,
        createdByUserId: TEACHER,
      },
    });
    compCount++;

    // Enroll 10–20 students
    const enrollStudents = STUDENTS.slice(0, randomInt(10, 20));
    const enrollments = enrollStudents.map((sid, idx) => ({
      competitionId: compId,
      studentId: sid,
      tenantId: TENANT,
      isActive: true,
      totalScore: i < 2 ? parseFloat((Math.random() * 100).toFixed(2)) : null,
      rank: i < 2 ? idx + 1 : null,
    }));
    await prisma.competitionEnrollment.createMany({ data: enrollments });
    ceCount += enrollments.length;
  }
  console.log(`    ✓ ${compCount} competitions, ${ceCount} enrollments`);

  // ── 5. ExamCycle + ExamEnrollmentEntry (if table exists) ───────────
  console.log("  → Exam cycles & enrollment entries...");
  try {
    const ecId = cuid();
    await prisma.examCycle.create({
      data: {
        id: ecId,
        tenantId: TENANT,
        businessPartnerId: BP,
        name: "Term 1 Exam 2026",
        code: "T1-2026",
        enrollmentStartAt: daysAgo(60),
        enrollmentEndAt: daysAgo(30),
        practiceStartAt: daysAgo(25),
        examStartsAt: daysAgo(15),
        examEndsAt: daysAgo(10),
        examDurationMinutes: 60,
        attemptLimit: 2,
        resultStatus: "PUBLISHED",
        resultPublishedAt: daysAgo(5),
        createdByUserId: TEACHER,
      },
    });

    // Create an exam worksheet linked to the cycle
    const examWsId = cuid();
    await prisma.worksheet.create({
      data: {
        id: examWsId,
        tenantId: TENANT,
        title: "Term 1 Exam Worksheet",
        difficulty: "HARD",
        levelId: LEVEL1,
        createdByUserId: TEACHER,
        isPublished: true,
        examCycleId: ecId,
      },
    });

    // Enroll 20 students in the exam
    let eeCount = 0;
    for (const sid of STUDENTS.slice(0, 20)) {
      await prisma.examEnrollmentEntry.create({
        data: {
          id: cuid(),
          tenantId: TENANT,
          examCycleId: ecId,
          studentId: sid,
          enrolledLevelId: LEVEL1,
          createdByUserId: TEACHER,
        },
      });
      eeCount++;

      // ~80% submit the exam worksheet
      if (Math.random() < 0.8) {
        await prisma.worksheetSubmission.create({
          data: {
            id: cuid(),
            tenantId: TENANT,
            worksheetId: examWsId,
            studentId: sid,
            score: parseFloat((Math.random() * 100).toFixed(2)),
            status: "REVIEWED",
            correctCount: randomInt(5, 20),
            totalQuestions: 20,
            completionTimeSeconds: randomInt(1200, 3600),
            submittedAt: daysAgo(randomInt(10, 15)),
            passed: Math.random() > 0.3,
          },
        });
      }
    }
    console.log(`    ✓ 1 exam cycle, ${eeCount} enrollment entries, exam worksheet seeded`);
  } catch (e) {
    console.log(`    ⚠ ExamCycle seeding failed: ${e.message.slice(0, 100)}`);
  }

  console.log("\n✅ Analytics seed data complete!");
}

main()
  .catch((e) => { console.error("Seed failed:", e.message); process.exit(1); })
  .finally(() => prisma["$disconnect"]());
