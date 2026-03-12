import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { computeStudentRisk } from "./student-risk.service.js";
import { evaluatePromotionEligibility } from "./promotion-eligibility.service.js";

// ─── At-Risk Student Queue ──────────────────────────────────────────
async function getAtRiskQueue(teacherUserId, tenantId, centerId) {
  const students = await prisma.student.findMany({
    where: { tenantId, hierarchyNodeId: centerId, currentTeacherUserId: teacherUserId, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      levelId: true,
      level: { select: { name: true, rank: true } },
    },
  });

  if (students.length === 0) return { items: [], summary: { total: 0, atRisk: 0, attention: 0, healthy: 0 } };

  const results = await Promise.allSettled(
    students.map(async (s) => {
      const risk = await computeStudentRisk(s.id, tenantId, s.levelId);
      return { student: s, risk };
    })
  );

  const items = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => r.risk.level !== "HEALTHY")
    .sort((a, b) => b.risk.score - a.risk.score)
    .map((r) => ({
      studentId: r.student.id,
      name: `${r.student.firstName} ${r.student.lastName}`,
      admissionNo: r.student.admissionNo,
      level: r.student.level?.name || "—",
      riskLevel: r.risk.level,
      riskScore: r.risk.score,
      indicators: r.risk.indicators || [],
      topAction: getTopAction(r.risk.indicators),
    }));

  const allResults = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const summary = {
    total: allResults.length,
    atRisk: allResults.filter((r) => r.risk.level === "AT_RISK").length,
    attention: allResults.filter((r) => r.risk.level === "ATTENTION").length,
    healthy: allResults.filter((r) => r.risk.level === "HEALTHY").length,
  };

  return { items, summary };
}

function getTopAction(indicators) {
  if (!indicators?.length) return null;
  const priority = [
    { ind: "INACTIVE", label: "Send a reminder", action: "nudge", icon: "📩" },
    { ind: "LOW_ATTENDANCE", label: "Follow up on attendance", action: "attendance", icon: "📅" },
    { ind: "DECLINING_SCORES", label: "Review weak topics", action: "review", icon: "📉" },
    { ind: "FEE_OVERDUE", label: "Notify about fees", action: "fees", icon: "💰" },
    { ind: "PROMOTION_BLOCKED", label: "Assign practice worksheets", action: "assign", icon: "📝" },
    { ind: "LOW_PRACTICE", label: "Encourage more practice", action: "practice", icon: "🎯" },
  ];
  for (const p of priority) {
    if (indicators.includes(p.ind)) return p;
  }
  return null;
}

function getAssignmentKey(worksheetId, studentId) {
  return `${worksheetId}:${studentId}`;
}

async function countPendingWorksheetAssignments(tenantId, studentIds) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) return 0;

  const assignments = await prisma.worksheetAssignment.findMany({
    where: {
      tenantId,
      studentId: { in: studentIds },
      isActive: true,
      unassignedAt: null,
    },
    select: {
      worksheetId: true,
      studentId: true,
    },
  });

  if (assignments.length === 0) return 0;

  const worksheetIds = [...new Set(assignments.map((assignment) => assignment.worksheetId))];
  const submissions = await prisma.worksheetSubmission.findMany({
    where: {
      tenantId,
      studentId: { in: studentIds },
      worksheetId: { in: worksheetIds },
    },
    select: {
      worksheetId: true,
      studentId: true,
    },
  });

  const submittedAssignments = new Set(
    submissions.map((submission) => getAssignmentKey(submission.worksheetId, submission.studentId))
  );

  return assignments.reduce((count, assignment) => {
    return count + (submittedAssignments.has(getAssignmentKey(assignment.worksheetId, assignment.studentId)) ? 0 : 1);
  }, 0);
}

async function getTeacherStudentIds(teacherUserId, tenantId, centerId) {
  const students = await prisma.student.findMany({
    where: {
      tenantId,
      hierarchyNodeId: centerId,
      currentTeacherUserId: teacherUserId,
      isActive: true,
    },
    select: { id: true },
  });

  return students.map((student) => student.id);
}

// ─── Batch Heatmap ──────────────────────────────────────────────────
async function getBatchHeatmap(teacherUserId, tenantId, centerId) {
  const batches = await prisma.batch.findMany({
    where: {
      tenantId,
      hierarchyNodeId: centerId,
      teacherAssignments: { some: { teacherUserId } },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      enrollments: {
        where: { status: "ACTIVE" },
        select: { studentId: true },
      },
    },
  });

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const batchData = await Promise.all(
    batches.map(async (batch) => {
      const studentIds = batch.enrollments.map((e) => e.studentId);
      if (studentIds.length === 0) {
        return {
          batchId: batch.id,
          batchName: batch.name,
          studentCount: 0,
          avgAttendance: 0,
          avgScore: 0,
          pendingWorksheets: 0,
          atRiskCount: 0,
          health: "EMPTY",
        };
      }

      const [attStats, scoreStats, pendingCount] = await Promise.all([
        // Attendance rate in last 30 days
        prisma.attendanceEntry.groupBy({
          by: ["status"],
          where: {
            tenantId,
            studentId: { in: studentIds },
            session: { date: { gte: thirtyDaysAgo }, status: { in: ["PUBLISHED", "LOCKED"] } },
          },
          _count: { _all: true },
        }),
        // Average worksheet score
        prisma.worksheetSubmission.aggregate({
          where: { tenantId, studentId: { in: studentIds }, score: { not: null } },
          _avg: { score: true },
          _count: { _all: true },
        }),
        countPendingWorksheetAssignments(tenantId, studentIds),
      ]);

      const attMap = {};
      for (const row of attStats) attMap[row.status] = row._count._all;
      const attTotal = (attMap.PRESENT || 0) + (attMap.ABSENT || 0) + (attMap.LATE || 0) + (attMap.EXCUSED || 0);
      const attPresent = (attMap.PRESENT || 0) + (attMap.LATE || 0);
      const avgAttendance = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0;
      const avgScore = scoreStats._avg?.score != null ? Math.round(Number(scoreStats._avg.score)) : 0;

      // Quick risk estimate: count students that look at-risk based on simple heuristic
      const atRiskCount = studentIds.length > 0
        ? Math.round(studentIds.length * (avgAttendance < 60 ? 0.4 : avgAttendance < 75 ? 0.2 : 0.05))
        : 0;

      const health =
        avgAttendance >= 80 && avgScore >= 70
          ? "GOOD"
          : avgAttendance >= 60 && avgScore >= 50
            ? "FAIR"
            : "POOR";

      return {
        batchId: batch.id,
        batchName: batch.name,
        studentCount: studentIds.length,
        avgAttendance,
        avgScore,
        pendingWorksheets: pendingCount,
        atRiskCount,
        health,
      };
    })
  );

  return batchData;
}

// ─── Worksheet Recommendations ──────────────────────────────────────
async function getWorksheetRecommendations(teacherUserId, tenantId, centerId) {
  // Find students with low scores / no recent activity
  const students = await prisma.student.findMany({
    where: { tenantId, hierarchyNodeId: centerId, currentTeacherUserId: teacherUserId, isActive: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      levelId: true,
      level: { select: { name: true } },
    },
  });

  if (students.length === 0) return [];

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recommendations = [];

  // Batch check: who has no recent activity?
  const recentSubmissions = await prisma.worksheetSubmission.groupBy({
    by: ["studentId"],
    where: {
      tenantId,
      studentId: { in: students.map((s) => s.id) },
      submittedAt: { gte: sevenDaysAgo },
    },
    _count: { _all: true },
  });
  const recentMap = new Map(recentSubmissions.map((r) => [r.studentId, r._count._all]));

  // Weak topic analysis per student
  const studentIds = students.map((s) => s.id);
  const weakTopics = studentIds.length > 0
    ? await prisma.$queryRaw`
        SELECT ws.studentId, ws.topic, ROUND(AVG(ws.score), 1) as accuracy
        FROM worksheet_submissions ws
        WHERE ws.tenantId = ${tenantId}
          AND ws.studentId IN (${Prisma.join(studentIds)})
          AND ws.score IS NOT NULL
        GROUP BY ws.studentId, ws.topic
        HAVING accuracy < 60
        ORDER BY accuracy ASC
      `.catch(() => [])
    : [];

  const weakMap = new Map();
  for (const wt of weakTopics) {
    if (!weakMap.has(wt.studentId)) weakMap.set(wt.studentId, []);
    weakMap.get(wt.studentId).push({ topic: wt.topic, accuracy: Number(wt.accuracy) });
  }

  for (const student of students) {
    const recentCount = recentMap.get(student.id) || 0;
    const weakList = weakMap.get(student.id) || [];

    if (recentCount === 0) {
      recommendations.push({
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        level: student.level?.name || "—",
        type: "INACTIVE",
        reason: "No submissions in the last 7 days",
        suggestion: "Assign a worksheet to re-engage this student",
        icon: "⏰",
        priority: "HIGH",
      });
    }

    if (weakList.length > 0) {
      const topWeak = weakList[0];
      recommendations.push({
        studentId: student.id,
        name: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        level: student.level?.name || "—",
        type: "WEAK_TOPIC",
        reason: `Weak in "${topWeak.topic}" (${topWeak.accuracy}% accuracy)`,
        suggestion: `Assign focused practice on ${topWeak.topic}`,
        icon: "📉",
        priority: recentCount === 0 ? "HIGH" : "MEDIUM",
      });
    }
  }

  // Sort: HIGH first, then MEDIUM
  recommendations.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
  });

  return recommendations.slice(0, 20);
}

// ─── Intervention Suggestions ───────────────────────────────────────
async function getInterventionSuggestions(teacherUserId, tenantId, centerId) {
  const [riskQueue, teacherStudentIds, pendingReassignments] = await Promise.all([
    getAtRiskQueue(teacherUserId, tenantId, centerId),
    getTeacherStudentIds(teacherUserId, tenantId, centerId),
    prisma.worksheetReassignmentRequest.count({
      where: { tenantId, status: "PENDING", student: { currentTeacherUserId: teacherUserId } },
    }).catch(() => 0),
  ]);

  const pendingWorksheets = await countPendingWorksheetAssignments(tenantId, teacherStudentIds).catch(() => 0);

  const suggestions = [];

  // At-risk students intervention
  if (riskQueue.summary.atRisk > 0) {
    suggestions.push({
      id: "at_risk_students",
      type: "CRITICAL",
      title: `${riskQueue.summary.atRisk} Student${riskQueue.summary.atRisk > 1 ? "s" : ""} At Risk`,
      description: "These students need immediate attention — follow up on attendance, scores, or engagement.",
      actionLabel: "View At-Risk Queue",
      actionUrl: "/teacher/students",
      icon: "🚨",
    });
  }

  if (riskQueue.summary.attention > 0) {
    suggestions.push({
      id: "attention_students",
      type: "WARNING",
      title: `${riskQueue.summary.attention} Student${riskQueue.summary.attention > 1 ? "s" : ""} Need Attention`,
      description: "These students are showing early warning signs. Proactive support can prevent them from slipping.",
      actionLabel: "Review Students",
      actionUrl: "/teacher/students",
      icon: "⚠️",
    });
  }

  // Pending reassignments
  if (pendingReassignments > 0) {
    suggestions.push({
      id: "pending_reassignments",
      type: "ACTION",
      title: `${pendingReassignments} Reassignment Request${pendingReassignments > 1 ? "s" : ""} Pending`,
      description: "Students have requested worksheet reassignments. Review and approve or reject them.",
      actionLabel: "Review Requests",
      actionUrl: "/teacher/reassignment-queue",
      icon: "🔄",
    });
  }

  // Ungraded worksheets
  if (pendingWorksheets >= 5) {
    suggestions.push({
      id: "pending_worksheets",
      type: "ACTION",
      title: `${pendingWorksheets} Worksheets Pending Submission`,
      description: "Students have assigned worksheets that haven't been submitted yet. Consider following up.",
      icon: "📝",
    });
  }

  return suggestions;
}

// ─── Teacher Cockpit Dashboard ──────────────────────────────────────
async function getTeacherCockpit(teacherUserId, tenantId, centerId) {
  const [atRiskQueue, batchHeatmap, worksheetRecs, interventions] = await Promise.all([
    getAtRiskQueue(teacherUserId, tenantId, centerId),
    getBatchHeatmap(teacherUserId, tenantId, centerId),
    getWorksheetRecommendations(teacherUserId, tenantId, centerId),
    getInterventionSuggestions(teacherUserId, tenantId, centerId),
  ]);

  return {
    atRiskQueue,
    batchHeatmap,
    worksheetRecommendations: worksheetRecs,
    interventions,
  };
}

export {
  getTeacherCockpit,
  getAtRiskQueue,
  getBatchHeatmap,
  getWorksheetRecommendations,
  getInterventionSuggestions,
};
