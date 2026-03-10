import { prisma } from "../lib/prisma.js";
import { getLevelPerformance } from "./student-performance.service.js";
import { calculateConsistencyScore, evaluatePromotionEligibility } from "./promotion-eligibility.service.js";
import { computeStudentRisk, generateInsights } from "./student-risk.service.js";

/**
 * Fetch complete 360° data for a single student in one call.
 * Uses Promise.all to parallelise independent queries.
 */
async function getStudent360Data(studentId, tenantId, scopeNodeId) {
  // ── Step 1: Load student with relationships ──
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId, hierarchyNodeId: scopeNodeId },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      email: true,
      phonePrimary: true,
      guardianName: true,
      guardianPhone: true,
      guardianEmail: true,
      photoUrl: true,
      dateOfBirth: true,
      gender: true,
      isActive: true,
      createdAt: true,
      levelId: true,
      courseId: true,
      level: { select: { id: true, name: true, rank: true } },
      course: { select: { id: true, code: true, name: true } },
      currentTeacher: {
        select: {
          id: true,
          username: true,
          teacherProfile: { select: { fullName: true } },
        },
      },
      batchEnrollments: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          batch: { select: { id: true, name: true } },
          assignedTeacher: {
            select: {
              id: true,
              username: true,
              teacherProfile: { select: { fullName: true } },
            },
          },
        },
      },
      practiceAssignments: {
        where: { isActive: true },
        select: { featureKey: true, assignedAt: true },
      },
    },
  });

  if (!student) return null;

  const levelId = student.levelId;

  // ── Step 2: Parallel data fetch ──
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    performance,
    consistency,
    promotion,
    attendanceCounts,
    attendanceStreak,
    feeInstallments,
    totalPaid,
    lastSubmission,
    practiceStats,
    recentWorksheets,
    recentAttendance,
    recentPayments,
    recentNotes,
    recentMockTests,
    risk,
  ] = await Promise.all([
    // Performance
    levelId ? getLevelPerformance(studentId, levelId, tenantId) : null,

    // Consistency
    levelId ? calculateConsistencyScore(studentId, levelId, tenantId) : null,

    // Promotion eligibility
    levelId ? evaluatePromotionEligibility(studentId, levelId, tenantId) : { eligible: false, reasons: ["No level assigned"], metrics: {} },

    // Attendance last 30 days
    prisma.attendanceEntry.groupBy({
      by: ["status"],
      where: {
        tenantId,
        studentId,
        session: {
          status: { in: ["PUBLISHED", "LOCKED"] },
          date: { gte: thirtyDaysAgo },
        },
      },
      _count: { _all: true },
    }),

    // Attendance streak (consecutive present days, most recent first)
    prisma.attendanceEntry.findMany({
      where: {
        tenantId,
        studentId,
        session: { status: { in: ["PUBLISHED", "LOCKED"] } },
      },
      orderBy: { session: { date: "desc" } },
      take: 60,
      select: { status: true },
    }),

    // Fee installments
    prisma.studentFeeInstallment.findMany({
      where: { tenantId, studentId },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        payments: { select: { grossAmount: true } },
      },
    }),

    // Total payments
    prisma.financialTransaction.aggregate({
      where: { tenantId, studentId },
      _sum: { grossAmount: true },
    }),

    // Last submission
    prisma.worksheetSubmission.findFirst({
      where: { tenantId, studentId },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true },
    }),

    // Practice stats
    prisma.worksheetSubmission.aggregate({
      where: { tenantId, studentId, score: { not: null } },
      _count: { _all: true },
      _avg: { score: true },
    }),

    // Recent worksheets (for activity timeline)
    prisma.worksheetSubmission.findMany({
      where: { tenantId, studentId },
      orderBy: { submittedAt: "desc" },
      take: 5,
      select: {
        id: true,
        score: true,
        submittedAt: true,
        worksheet: { select: { title: true } },
      },
    }),

    // Recent attendance entries
    prisma.attendanceEntry.findMany({
      where: {
        tenantId,
        studentId,
        session: { status: { in: ["PUBLISHED", "LOCKED"] } },
      },
      orderBy: { session: { date: "desc" } },
      take: 5,
      select: {
        status: true,
        session: { select: { date: true } },
      },
    }),

    // Recent fee payments
    prisma.financialTransaction.findMany({
      where: { tenantId, studentId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        grossAmount: true,
        type: true,
        createdAt: true,
      },
    }),

    // Recent notes
    prisma.teacherNote.findMany({
      where: { tenantId, studentId, isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        note: true,
        tags: true,
        createdAt: true,
        teacher: { select: { username: true, teacherProfile: { select: { fullName: true } } } },
      },
    }),

    // Recent mock test results
    prisma.mockTestResult.findMany({
      where: { tenantId, studentId },
      orderBy: { recordedAt: "desc" },
      take: 3,
      select: {
        marks: true,
        recordedAt: true,
        mockTest: { select: { title: true } },
      },
    }),

    // Risk score
    computeStudentRisk(studentId, tenantId, levelId),
  ]);

  // ── Step 3: Build attendance summary ──
  const attMap = {};
  for (const row of attendanceCounts) {
    attMap[row.status] = row._count._all;
  }
  const attTotal =
    (attMap.PRESENT || 0) + (attMap.ABSENT || 0) + (attMap.LATE || 0) + (attMap.EXCUSED || 0);
  const attPresent = (attMap.PRESENT || 0) + (attMap.LATE || 0);
  const attRate = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : null;

  // Streak: count consecutive PRESENT/LATE from most recent
  let streakDays = 0;
  for (const entry of attendanceStreak) {
    if (entry.status === "PRESENT" || entry.status === "LATE") {
      streakDays += 1;
    } else {
      break;
    }
  }

  // ── Step 4: Build fee summary ──
  let totalDue = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  let nextInstallment = null;
  for (const inst of feeInstallments) {
    const due = Number(inst.amount || 0);
    const paid = inst.payments.reduce((s, p) => s + Number(p.grossAmount || 0), 0);
    totalDue += due;
    if (paid < due && new Date(inst.dueDate) < now) {
      overdueCount += 1;
      overdueAmount += due - paid;
    }
    if (!nextInstallment && paid < due && new Date(inst.dueDate) >= now) {
      nextInstallment = { dueDate: inst.dueDate, amount: due - paid };
    }
  }
  const totalPaidAmount = Number(totalPaid._sum?.grossAmount || 0);

  // ── Step 5: Build engagement ──
  const lastDate = lastSubmission?.submittedAt || null;
  const daysSinceLastActivity = lastDate
    ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // ── Step 6: Build activity timeline ──
  const recentActivity = [];
  for (const ws of recentWorksheets) {
    recentActivity.push({
      type: "WORKSHEET",
      title: ws.worksheet?.title || "Worksheet",
      detail: ws.score !== null ? `Score: ${Number(ws.score)}%` : "Submitted",
      date: ws.submittedAt,
    });
  }
  for (const ae of recentAttendance) {
    recentActivity.push({
      type: "ATTENDANCE",
      title: "Attendance",
      detail: ae.status,
      date: ae.session?.date || null,
    });
  }
  for (const fp of recentPayments) {
    recentActivity.push({
      type: "PAYMENT",
      title: `Payment (${fp.type})`,
      detail: `₹${Number(fp.grossAmount)}`,
      date: fp.createdAt,
    });
  }
  for (const tn of recentNotes) {
    recentActivity.push({
      type: "NOTE",
      title: "Teacher Note",
      detail: String(tn.note || "").substring(0, 80),
      date: tn.createdAt,
    });
  }
  for (const mt of recentMockTests) {
    recentActivity.push({
      type: "MOCK_TEST",
      title: mt.mockTest?.title || "Mock Test",
      detail: `Marks: ${mt.marks}`,
      date: mt.recordedAt,
    });
  }
  recentActivity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const topActivity = recentActivity.slice(0, 10);

  // ── Step 7: Build insights ──
  const engagement = {
    lastWorksheetDate: lastDate,
    daysSinceLastActivity,
    totalPracticeAttempts: practiceStats._count._all || 0,
    practiceAvgScore:
      practiceStats._avg?.score !== null
        ? Math.round(Number(practiceStats._avg.score) * 100) / 100
        : null,
    practiceFeatures: (student.practiceAssignments || []).map((pa) => ({
      featureKey: pa.featureKey,
      assignedAt: pa.assignedAt,
    })),
  };

  const attendanceData = {
    last30: {
      present: attMap.PRESENT || 0,
      absent: attMap.ABSENT || 0,
      late: attMap.LATE || 0,
      excused: attMap.EXCUSED || 0,
      total: attTotal,
      rate: attRate,
    },
    streakDays,
  };

  const feeSummary = {
    totalDue: Math.round(totalDue * 100) / 100,
    totalPaid: Math.round(totalPaidAmount * 100) / 100,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
    overdueCount,
    nextInstallment,
  };

  const insights = generateInsights(risk, engagement, attendanceData, feeSummary, promotion);

  // ── Step 8: Assemble response ──
  const enrollment = student.batchEnrollments?.[0] || null;

  return {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      email: student.email,
      phone: student.phonePrimary,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      guardianEmail: student.guardianEmail,
      photoUrl: student.photoUrl,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      isActive: student.isActive,
      createdAt: student.createdAt,
      level: student.level,
      course: student.course,
      batch: enrollment?.batch || null,
      teacher: enrollment?.assignedTeacher
        ? {
            id: enrollment.assignedTeacher.id,
            username: enrollment.assignedTeacher.username,
            fullName: enrollment.assignedTeacher.teacherProfile?.fullName || null,
          }
        : student.currentTeacher
          ? {
              id: student.currentTeacher.id,
              username: student.currentTeacher.username,
              fullName: student.currentTeacher.teacherProfile?.fullName || null,
            }
          : null,
    },
    performance: performance
      ? {
          accuracyLast5: performance.averageAccuracyLast5,
          bestScore: performance.bestScore,
          totalAttempts: performance.totalAttempts,
          improvementTrend: performance.improvementTrendPercentage,
          avgTime: performance.averageTimePerWorksheet,
          consistencyScore: consistency,
        }
      : { accuracyLast5: null, bestScore: null, totalAttempts: 0, improvementTrend: null, avgTime: null, consistencyScore: null },
    promotion,
    attendance: attendanceData,
    fees: feeSummary,
    engagement,
    risk,
    recentActivity: topActivity,
    insights,
  };
}

export { getStudent360Data };
