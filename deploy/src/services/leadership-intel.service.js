import { prisma } from "../lib/prisma.js";

function getOutstandingAmount(installment) {
  const amount = Number(installment?.amount || 0);
  const paid = Array.isArray(installment?.payments)
    ? installment.payments.reduce((sum, payment) => sum + Number(payment.grossAmount || 0), 0)
    : 0;

  return Math.max(0, amount - paid);
}

function summarizeInstallments(installments) {
  return installments.reduce(
    (summary, installment) => {
      const outstanding = getOutstandingAmount(installment);
      if (outstanding > 0) {
        summary.amount += outstanding;
        summary.count += 1;
      }
      return summary;
    },
    { amount: 0, count: 0 }
  );
}

function buildEmptyNetworkPulse(centerIds = []) {
  return {
    summary: {
      centers: centerIds.length,
      students: 0,
      teachers: 0,
      attendanceRate: null,
      avgScore: null,
      overdueAmount: 0,
      overdueCount: 0,
      recentAdmissions: 0,
      networkHealthScore: null,
    },
    aggregate: {
      centerIds,
      totalCenters: centerIds.length,
      totalStudents: 0,
      totalTeachers: 0,
      avgAttendance: null,
      avgScore: null,
      totalOverdue: 0,
      overdueCount: 0,
      totalCollected: 0,
      revenueTrend: null,
    },
    topCenters: [],
    bottomCenters: [],
    centerScores: [],
  };
}

// ─── Center Health Score ────────────────────────────────────────────
// Composite 0-100 score broken into 4 pillars: attendance, academic, finance, operations
async function getCenterHealthScore(tenantId, centerId) {
  const now = new Date();
  const since30 = new Date(now);
  since30.setDate(since30.getDate() - 30);

  const [students, attEntries, wsStats, overdueInstallments, teacherCount, batchCount] = await Promise.all([
    prisma.student.count({ where: { tenantId, hierarchyNodeId: centerId, isActive: true } }),
    prisma.attendanceEntry.groupBy({
      by: ["status"],
      where: {
        tenantId,
        student: { hierarchyNodeId: centerId },
        session: { date: { gte: since30 }, status: { in: ["PUBLISHED", "LOCKED"] } },
      },
      _count: { _all: true },
    }),
    prisma.worksheetSubmission.aggregate({
      where: { tenantId, student: { hierarchyNodeId: centerId }, submittedAt: { gte: since30 }, score: { not: null } },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.studentFeeInstallment.findMany({
      where: { tenantId, dueDate: { lt: now }, student: { hierarchyNodeId: centerId } },
      select: { amount: true, payments: { select: { grossAmount: true } } },
    }),
    prisma.authUser.count({ where: { tenantId, hierarchyNodeId: centerId, role: "TEACHER", isActive: true } }),
    prisma.batch.count({ where: { tenantId, hierarchyNodeId: centerId, status: "ACTIVE", isActive: true } }),
  ]);

  const overdueCount = summarizeInstallments(overdueInstallments).count;

  // Attendance pillar (0-25)
  const attMap = {};
  for (const row of attEntries) attMap[row.status] = row._count._all;
  const attTotal = (attMap.PRESENT || 0) + (attMap.ABSENT || 0) + (attMap.LATE || 0) + (attMap.EXCUSED || 0);
  const attPresent = (attMap.PRESENT || 0) + (attMap.LATE || 0);
  const attRate = attTotal > 0 ? attPresent / attTotal : 0;
  const attendancePillar = Math.round(attRate * 25);

  // Academic pillar (0-25)
  const avgScore = wsStats._avg?.score != null ? Number(wsStats._avg.score) : 0;
  const submissionVolume = Math.min(wsStats._count._all / Math.max(students, 1), 10) / 10;
  const academicPillar = Math.round(((avgScore / 100) * 0.6 + submissionVolume * 0.4) * 25);

  // Finance pillar (0-25)
  const overdueRatio = students > 0 ? overdueCount / students : 0;
  const financePillar = Math.round(Math.max(0, 1 - overdueRatio * 2) * 25);

  // Operations pillar (0-25)
  const hasTeachers = teacherCount > 0 ? 1 : 0;
  const hasBatches = batchCount > 0 ? 1 : 0;
  const teacherStudentRatio = teacherCount > 0 && students > 0 ? Math.min(students / teacherCount / 30, 1) : 0;
  const opsPillar = Math.round(((hasTeachers * 0.3 + hasBatches * 0.3 + (1 - teacherStudentRatio) * 0.4)) * 25);

  const total = attendancePillar + academicPillar + financePillar + opsPillar;
  const grade = total >= 80 ? "A" : total >= 65 ? "B" : total >= 50 ? "C" : total >= 35 ? "D" : "F";

  return {
    total,
    grade,
    pillars: {
      attendance: { score: attendancePillar, max: 25, rate: Math.round(attRate * 100) },
      academic: { score: academicPillar, max: 25, avgScore: Math.round(avgScore), submissions: wsStats._count._all },
      finance: { score: financePillar, max: 25, overdueCount },
      operations: { score: opsPillar, max: 25, teachers: teacherCount, batches: batchCount },
    },
    studentCount: students,
  };
}

// ─── Teacher Workload Analysis ──────────────────────────────────────
async function getTeacherWorkload(tenantId, centerId) {
  const teachers = await prisma.authUser.findMany({
    where: { tenantId, hierarchyNodeId: centerId, role: "TEACHER", isActive: true },
    select: {
      id: true,
      username: true,
      teacherProfile: { select: { fullName: true } },
    },
  });

  if (!teachers.length) return [];

  const teacherIds = teachers.map((t) => t.id);
  const since30 = new Date(Date.now() - 30 * 86400000);

  const [studentCounts, assignments, recentSessions] = await Promise.all([
    prisma.student.groupBy({
      by: ["currentTeacherUserId"],
      where: { tenantId, currentTeacherUserId: { in: teacherIds }, isActive: true },
      _count: { _all: true },
    }),
    prisma.batchTeacherAssignment.findMany({
      where: { tenantId, teacherUserId: { in: teacherIds }, batch: { isActive: true, hierarchyNodeId: centerId } },
      select: { teacherUserId: true, batchId: true },
    }),
    prisma.attendanceSession.findMany({
      where: {
        tenantId,
        batch: {
          isActive: true,
          hierarchyNodeId: centerId,
          teacherAssignments: { some: { teacherUserId: { in: teacherIds } } },
        },
        date: { gte: since30 },
      },
      select: { batchId: true },
    }),
  ]);

  const studentMap = new Map(studentCounts.map((r) => [r.currentTeacherUserId, r._count._all]));
  const batchMap = new Map();
  const sessionMap = new Map();

  for (const assignment of assignments) {
    batchMap.set(assignment.teacherUserId, (batchMap.get(assignment.teacherUserId) || 0) + 1);
  }

  const teacherIdsByBatch = new Map();
  for (const assignment of assignments) {
    if (!teacherIdsByBatch.has(assignment.batchId)) {
      teacherIdsByBatch.set(assignment.batchId, []);
    }
    teacherIdsByBatch.get(assignment.batchId).push(assignment.teacherUserId);
  }

  for (const session of recentSessions) {
    const teachersForBatch = teacherIdsByBatch.get(session.batchId) || [];
    for (const teacherUserId of teachersForBatch) {
      sessionMap.set(teacherUserId, (sessionMap.get(teacherUserId) || 0) + 1);
    }
  }

  const avgStudents = studentCounts.reduce((s, r) => s + r._count._all, 0) / teachers.length;

  return teachers
    .map((t) => {
      const studs = studentMap.get(t.id) || 0;
      const batches = batchMap.get(t.id) || 0;
      const sessions = sessionMap.get(t.id) || 0;
      const loadRatio = avgStudents > 0 ? studs / avgStudents : 0;
      const load = loadRatio > 1.4 ? "OVERLOADED" : loadRatio > 1.1 ? "HIGH" : loadRatio < 0.5 && studs === 0 ? "IDLE" : "BALANCED";

      return {
        teacherId: t.id,
        name: t.teacherProfile?.fullName || t.username,
        students: studs,
        batches,
        sessions30d: sessions,
        load,
        loadRatio: Math.round(loadRatio * 100) / 100,
      };
    })
    .sort((a, b) => b.students - a.students);
}

// ─── Attendance Anomaly Detection ───────────────────────────────────
async function getAttendanceAnomalies(tenantId, centerId) {
  const now = new Date();
  const since7 = new Date(now); since7.setDate(since7.getDate() - 7);
  const since30 = new Date(now); since30.setDate(since30.getDate() - 30);

  // Get per-batch attendance for last 7 days vs last 30 days
  const batches = await prisma.batch.findMany({
    where: { tenantId, hierarchyNodeId: centerId, isActive: true },
    select: { id: true, name: true },
  });

  if (!batches.length) return [];

  const batchIds = batches.map((b) => b.id);
  const batchNameMap = new Map(batches.map((b) => [b.id, b.name]));

  const [recent, baseline] = await Promise.all([
    prisma.attendanceEntry.groupBy({
      by: ["status"],
      where: {
        tenantId,
        session: { batchId: { in: batchIds }, date: { gte: since7 }, status: { in: ["PUBLISHED", "LOCKED"] } },
      },
      _count: { _all: true },
    }),
    prisma.attendanceEntry.groupBy({
      by: ["status"],
      where: {
        tenantId,
        session: { batchId: { in: batchIds }, date: { gte: since30, lt: since7 }, status: { in: ["PUBLISHED", "LOCKED"] } },
      },
      _count: { _all: true },
    }),
  ]);

  function calcRate(entries) {
    const map = {};
    for (const e of entries) map[e.status] = e._count._all;
    const total = (map.PRESENT || 0) + (map.ABSENT || 0) + (map.LATE || 0) + (map.EXCUSED || 0);
    const present = (map.PRESENT || 0) + (map.LATE || 0);
    return total > 0 ? Math.round((present / total) * 100) : null;
  }

  const recentRate = calcRate(recent);
  const baselineRate = calcRate(baseline);

  const anomalies = [];

  if (recentRate !== null && baselineRate !== null) {
    const drop = baselineRate - recentRate;
    if (drop >= 15) {
      anomalies.push({
        type: "ATTENDANCE_DROP",
        severity: drop >= 25 ? "CRITICAL" : "WARNING",
        title: `Attendance dropped ${drop}% this week`,
        detail: `Current week: ${recentRate}% vs previous 30-day avg: ${baselineRate}%`,
        icon: "📉",
        recentRate,
        baselineRate,
      });
    }
  }

  // Check for batches with no sessions in 7 days
  const recentSessions = await prisma.attendanceSession.findMany({
    where: { tenantId, batchId: { in: batchIds }, date: { gte: since7 } },
    select: { batchId: true },
  });
  const activeBatchIds = new Set(recentSessions.map((s) => s.batchId));
  const stale = batchIds.filter((id) => !activeBatchIds.has(id));
  if (stale.length > 0) {
    anomalies.push({
      type: "STALE_BATCHES",
      severity: stale.length >= 3 ? "WARNING" : "INFO",
      title: `${stale.length} batch${stale.length > 1 ? "es" : ""} with no attendance this week`,
      detail: stale.slice(0, 3).map((id) => batchNameMap.get(id) || id).join(", "),
      icon: "🕐",
      count: stale.length,
    });
  }

  // Students with 0% attendance in last 7 days
  const absentStudents = await prisma.attendanceEntry.groupBy({
    by: ["studentId"],
    where: {
      tenantId,
      student: { hierarchyNodeId: centerId, isActive: true },
      session: { date: { gte: since7 }, status: { in: ["PUBLISHED", "LOCKED"] } },
      status: "ABSENT",
    },
    _count: { _all: true },
    having: { _all: { _count: { gte: 3 } } },
  }).catch(() => []);

  if (absentStudents.length > 0) {
    anomalies.push({
      type: "CHRONIC_ABSENCE",
      severity: absentStudents.length >= 5 ? "CRITICAL" : "WARNING",
      title: `${absentStudents.length} student${absentStudents.length > 1 ? "s" : ""} absent 3+ times this week`,
      detail: "These students may need a parent call or home visit.",
      icon: "🚨",
      count: absentStudents.length,
    });
  }

  return anomalies;
}

// ─── Fee Collection Pulse ───────────────────────────────────────────
async function getFeeCollectionPulse(tenantId, centerId) {
  const now = new Date();
  const since30 = new Date(now); since30.setDate(since30.getDate() - 30);
  const since60 = new Date(now); since60.setDate(since60.getDate() - 60);
  const dueSoon = new Date(now.getTime() + 14 * 86400000);

  const [thisMonth, lastMonth, overdueInstallments, upcomingInstallments] = await Promise.all([
    prisma.financialTransaction.aggregate({
      where: {
        tenantId,
        centerId,
        createdAt: { gte: since30 },
      },
      _sum: { grossAmount: true },
      _count: { _all: true },
    }),
    prisma.financialTransaction.aggregate({
      where: {
        tenantId,
        centerId,
        createdAt: { gte: since60, lt: since30 },
      },
      _sum: { grossAmount: true },
      _count: { _all: true },
    }),
    prisma.studentFeeInstallment.findMany({
      where: {
        tenantId,
        dueDate: { lt: now },
        student: { hierarchyNodeId: centerId },
      },
      select: { amount: true, payments: { select: { grossAmount: true } } },
    }),
    prisma.studentFeeInstallment.findMany({
      where: {
        tenantId,
        dueDate: { gte: now, lte: dueSoon },
        student: { hierarchyNodeId: centerId },
      },
      select: { amount: true, payments: { select: { grossAmount: true } } },
    }),
  ]);

  const overdueSummary = summarizeInstallments(overdueInstallments);
  const upcomingSummary = summarizeInstallments(upcomingInstallments);
  const thisAmt = Number(thisMonth._sum?.grossAmount || 0);
  const lastAmt = Number(lastMonth._sum?.grossAmount || 0);
  const trend = lastAmt > 0 ? Math.round(((thisAmt - lastAmt) / lastAmt) * 100) : null;

  return {
    collected30d: Math.round(thisAmt * 100) / 100,
    collected30dCount: thisMonth._count._all,
    previousPeriod: Math.round(lastAmt * 100) / 100,
    trend,
    trendLabel: trend === null ? "N/A" : trend >= 0 ? `+${trend}%` : `${trend}%`,
    overdueAmount: Math.round(overdueSummary.amount * 100) / 100,
    overdueCount: overdueSummary.count,
    upcomingDueAmount: Math.round(upcomingSummary.amount * 100) / 100,
    upcomingDueCount: upcomingSummary.count,
  };
}

// ─── Network Pulse (Franchise / BP / Superadmin) ────────────────────
async function getNetworkPulse(tenantId, nodeIds) {
  const uniqueNodeIds = [...new Set((nodeIds || []).filter(Boolean))];
  if (!uniqueNodeIds.length) {
    return buildEmptyNetworkPulse();
  }

  const now = new Date();
  const since30 = new Date(now); since30.setDate(since30.getDate() - 30);
  const since60 = new Date(now); since60.setDate(since60.getDate() - 60);

  const [
    centerProfiles,
    studentCount,
    teacherCount,
    attEntries,
    wsStats,
    overdueInstallments,
    recentAdmissions,
    currentRevenue,
    previousRevenue,
  ] = await Promise.all([
    prisma.centerProfile.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        isActive: true,
        authUser: {
          hierarchyNodeId: { in: uniqueNodeIds },
          isActive: true,
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        authUser: { select: { hierarchyNodeId: true } },
      },
    }),
    prisma.student.count({ where: { tenantId, hierarchyNodeId: { in: uniqueNodeIds }, isActive: true } }),
    prisma.authUser.count({ where: { tenantId, hierarchyNodeId: { in: uniqueNodeIds }, role: "TEACHER", isActive: true } }),
    prisma.attendanceEntry.groupBy({
      by: ["status"],
      where: {
        tenantId,
        student: { hierarchyNodeId: { in: uniqueNodeIds } },
        session: { date: { gte: since30 }, status: { in: ["PUBLISHED", "LOCKED"] } },
      },
      _count: { _all: true },
    }),
    prisma.worksheetSubmission.aggregate({
      where: {
        tenantId,
        student: { hierarchyNodeId: { in: uniqueNodeIds } },
        submittedAt: { gte: since30 },
        score: { not: null },
      },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.studentFeeInstallment.findMany({
      where: {
        tenantId,
        dueDate: { lt: now },
        student: { hierarchyNodeId: { in: uniqueNodeIds } },
      },
      select: { amount: true, payments: { select: { grossAmount: true } } },
    }),
    prisma.student.count({
      where: { tenantId, hierarchyNodeId: { in: uniqueNodeIds }, createdAt: { gte: since30 } },
    }),
    prisma.financialTransaction.aggregate({
      where: { tenantId, centerId: { in: uniqueNodeIds }, createdAt: { gte: since30 } },
      _sum: { grossAmount: true },
      _count: { _all: true },
    }),
    prisma.financialTransaction.aggregate({
      where: { tenantId, centerId: { in: uniqueNodeIds }, createdAt: { gte: since60, lt: since30 } },
      _sum: { grossAmount: true },
      _count: { _all: true },
    }),
  ]);

  const centerCount = uniqueNodeIds.length;
  const attMap = {};
  for (const row of attEntries) attMap[row.status] = row._count._all;
  const attTotal = (attMap.PRESENT || 0) + (attMap.ABSENT || 0) + (attMap.LATE || 0) + (attMap.EXCUSED || 0);
  const attPresent = (attMap.PRESENT || 0) + (attMap.LATE || 0);
  const attRate = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : null;
  const avgScore = wsStats._avg?.score != null ? Math.round(Number(wsStats._avg.score)) : null;
  const overdueSummary = summarizeInstallments(overdueInstallments);
  const totalCollected = Number(currentRevenue._sum?.grossAmount || 0);
  const previousCollected = Number(previousRevenue._sum?.grossAmount || 0);
  const revenueTrend = previousCollected > 0 ? Math.round(((totalCollected - previousCollected) / previousCollected) * 100) : null;

  // Per-center health scores
  const centerScores = await Promise.allSettled(
    centerProfiles
      .filter((center) => center.authUser?.hierarchyNodeId)
      .map(async (center) => {
        const health = await getCenterHealthScore(tenantId, center.authUser.hierarchyNodeId);
        return { centerId: center.id, name: center.name, code: center.code, ...health };
      })
  );

  const scored = centerScores
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value)
    .sort((a, b) => b.total - a.total);

  const topCenters = scored.slice(0, 5);
  const bottomCenters = [...scored].sort((a, b) => a.total - b.total).slice(0, 5);

  const networkAvgHealth = scored.length > 0
    ? Math.round(scored.reduce((s, c) => s + c.total, 0) / scored.length)
    : null;

  return {
    summary: {
      centers: centerCount,
      students: studentCount,
      teachers: teacherCount,
      attendanceRate: attRate,
      avgScore,
      overdueAmount: Math.round(overdueSummary.amount * 100) / 100,
      overdueCount: overdueSummary.count,
      recentAdmissions,
      networkHealthScore: networkAvgHealth,
    },
    aggregate: {
      centerIds: uniqueNodeIds,
      totalCenters: centerCount,
      totalStudents: studentCount,
      totalTeachers: teacherCount,
      avgAttendance: attRate,
      avgScore,
      totalOverdue: Math.round(overdueSummary.amount * 100) / 100,
      overdueCount: overdueSummary.count,
      totalCollected: Math.round(totalCollected * 100) / 100,
      revenueTrend,
    },
    topCenters,
    bottomCenters,
    centerScores: scored,
  };
}

// ─── Combined Center Intelligence ───────────────────────────────────
async function getCenterIntelligence(tenantId, centerId) {
  const [healthScore, teacherWorkload, anomalies, feePulse] = await Promise.all([
    getCenterHealthScore(tenantId, centerId),
    getTeacherWorkload(tenantId, centerId),
    getAttendanceAnomalies(tenantId, centerId),
    getFeeCollectionPulse(tenantId, centerId),
  ]);

  return { healthScore, teacherWorkload, anomalies, feePulse };
}

export {
  getCenterHealthScore,
  getTeacherWorkload,
  getAttendanceAnomalies,
  getFeeCollectionPulse,
  getNetworkPulse,
  getCenterIntelligence,
};
