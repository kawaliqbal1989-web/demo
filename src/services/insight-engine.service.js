import { prisma } from "../lib/prisma.js";
import { computeStudentRisk } from "./student-risk.service.js";
import { evaluatePromotionEligibility } from "./promotion-eligibility.service.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";

function isInsightStoreUnavailable(error) {
  return isSchemaMismatchError(error, ["insight"]);
}

function buildTransientInsights(freshInsights, auth, now = new Date()) {
  return freshInsights.map((insight, index) => ({
    id: `virtual-${insight.ruleId || index}`,
    tenantId: auth.tenantId,
    targetRole: auth.role,
    targetUserId: auth.userId,
    category: insight.category,
    severity: insight.severity,
    title: insight.title,
    message: insight.message,
    actionLabel: insight.actionLabel || null,
    actionUrl: insight.actionUrl || null,
    entityType: insight.entityType || null,
    entityId: insight.entityId || null,
    metadata: insight.metadata || null,
    isDismissed: false,
    isActioned: false,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    createdAt: now,
  }));
}

// ─── Role-specific rule definitions ────────────────────────

const STUDENT_RULES = [
  {
    id: "student_low_attendance",
    category: "ATTENDANCE",
    check: async (ctx) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const counts = await prisma.attendanceEntry.groupBy({
        by: ["status"],
        where: {
          tenantId: ctx.tenantId,
          studentId: ctx.studentId,
          session: { status: { in: ["PUBLISHED", "LOCKED"] }, date: { gte: thirtyDaysAgo } },
        },
        _count: { _all: true },
      });
      const map = {};
      for (const r of counts) map[r.status] = r._count._all;
      const total = (map.PRESENT || 0) + (map.ABSENT || 0) + (map.LATE || 0) + (map.EXCUSED || 0);
      const present = (map.PRESENT || 0) + (map.LATE || 0);
      const rate = total > 0 ? Math.round((present / total) * 100) : null;
      if (rate !== null && rate < 70) {
        return { severity: "WARNING", title: "Low Attendance", message: `Your attendance is ${rate}% over the last 30 days. Try to attend more regularly to stay on track.`, metadata: { rate, total } };
      }
      return null;
    },
  },
  {
    id: "student_inactive",
    category: "ENGAGEMENT",
    check: async (ctx) => {
      const last = await prisma.worksheetSubmission.findFirst({
        where: { tenantId: ctx.tenantId, studentId: ctx.studentId },
        orderBy: { submittedAt: "desc" },
        select: { submittedAt: true },
      });
      if (!last) {
        return { severity: "WARNING", title: "No Activity", message: "You haven't submitted any worksheets yet. Start practicing to build your skills!", actionLabel: "Go to Worksheets", actionUrl: "/student/worksheets" };
      }
      const days = Math.floor((Date.now() - new Date(last.submittedAt).getTime()) / 86400000);
      if (days >= 7) {
        return { severity: "WARNING", title: "Inactive for " + days + " Days", message: `It's been ${days} days since your last worksheet. Keep your streak going!`, actionLabel: "Practice Now", actionUrl: "/student/worksheets", metadata: { daysSince: days } };
      }
      return null;
    },
  },
  {
    id: "student_fee_overdue",
    category: "FINANCIAL",
    check: async (ctx) => {
      const installments = await prisma.studentFeeInstallment.findMany({
        where: { tenantId: ctx.tenantId, studentId: ctx.studentId, dueDate: { lt: new Date() } },
        select: { amount: true, payments: { select: { grossAmount: true } } },
      });
      let overdueAmt = 0;
      let overdueCount = 0;
      for (const inst of installments) {
        const paid = inst.payments.reduce((s, p) => s + Number(p.grossAmount || 0), 0);
        const due = Number(inst.amount || 0);
        if (paid < due) { overdueCount++; overdueAmt += due - paid; }
      }
      if (overdueCount > 0) {
        return { severity: "CRITICAL", title: "Fee Overdue", message: `You have ₹${Math.round(overdueAmt)} overdue across ${overdueCount} installment(s). Please clear pending fees.`, metadata: { overdueAmt, overdueCount } };
      }
      return null;
    },
  },
  {
    id: "student_promotion_ready",
    category: "PROMOTION",
    check: async (ctx) => {
      if (!ctx.student?.currentLevelId) return null;
      try {
        const result = await evaluatePromotionEligibility(ctx.studentId, ctx.student.currentLevelId, ctx.tenantId);
        if (result.eligible) {
          return { severity: "SUCCESS", title: "Promotion Ready!", message: "You meet all criteria for the next level. Ask your teacher about promotion.", metadata: result.metrics };
        }
        if (result.metrics?.practiceAverage < 75 && result.metrics?.practiceAverage >= 50) {
          return { severity: "INFO", title: "Almost Promotion Ready", message: `Your practice average is ${Math.round(result.metrics.practiceAverage)}%. Reach 75% to become eligible for promotion.`, metadata: result.metrics };
        }
      } catch { /* skip if evaluation fails */ }
      return null;
    },
  },
  {
    id: "student_strong_performance",
    category: "PERFORMANCE",
    check: async (ctx) => {
      const stats = await prisma.worksheetSubmission.aggregate({
        where: { tenantId: ctx.tenantId, studentId: ctx.studentId, score: { not: null } },
        _avg: { score: true },
        _count: { _all: true },
      });
      const avg = stats._avg?.score != null ? Math.round(Number(stats._avg.score)) : null;
      if (avg !== null && avg >= 90 && stats._count._all >= 5) {
        return { severity: "SUCCESS", title: "Excellent Performance!", message: `Your average score is ${avg}% across ${stats._count._all} worksheets. Outstanding work!`, metadata: { avg, total: stats._count._all } };
      }
      return null;
    },
  },
];

const TEACHER_RULES = [
  {
    id: "teacher_at_risk_students",
    category: "RISK",
    check: async (ctx) => {
      const enrollments = await prisma.enrollment.findMany({
        where: { tenantId: ctx.tenantId, assignedTeacherUserId: ctx.userId, status: "ACTIVE" },
        select: { studentId: true, student: { select: { currentLevelId: true } } },
      });
      let atRisk = 0;
      for (const enr of enrollments) {
        try {
          const risk = await computeStudentRisk(enr.studentId, ctx.tenantId, enr.student?.currentLevelId);
          if (risk.level === "AT_RISK") atRisk++;
        } catch { /* skip */ }
      }
      if (atRisk > 0) {
        return { severity: "CRITICAL", title: `${atRisk} At-Risk Student${atRisk > 1 ? "s" : ""}`, message: `${atRisk} of your students need attention. Review their progress and consider intervention.`, actionLabel: "View Students", actionUrl: "/teacher/students", metadata: { atRiskCount: atRisk, totalStudents: enrollments.length } };
      }
      return null;
    },
  },
  {
    id: "teacher_pending_worksheets",
    category: "OPERATIONAL",
    check: async (ctx) => {
      const count = await prisma.worksheetSubmission.count({
        where: {
          tenantId: ctx.tenantId,
          worksheet: { assignedTeacherUserId: ctx.userId },
          score: null,
        },
      });
      if (count >= 5) {
        return { severity: "WARNING", title: `${count} Ungraded Worksheets`, message: `You have ${count} worksheets awaiting grading. Timely feedback helps students improve faster.`, actionLabel: "Grade Now", actionUrl: "/teacher/students", metadata: { count } };
      }
      return null;
    },
  },
  {
    id: "teacher_low_attendance_batch",
    category: "ATTENDANCE",
    check: async (ctx) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sessions = await prisma.attendanceSession.findMany({
        where: { tenantId: ctx.tenantId, createdByUserId: ctx.userId, date: { gte: thirtyDaysAgo }, status: { in: ["PUBLISHED", "LOCKED"] } },
        select: { id: true, batch: { select: { name: true } }, entries: { select: { status: true } } },
      });
      const batchRates = {};
      for (const s of sessions) {
        const name = s.batch?.name || "Unknown";
        if (!batchRates[name]) batchRates[name] = { present: 0, total: 0 };
        for (const e of s.entries) {
          batchRates[name].total++;
          if (e.status === "PRESENT" || e.status === "LATE") batchRates[name].present++;
        }
      }
      const lowBatches = Object.entries(batchRates).filter(([, v]) => v.total > 0 && (v.present / v.total) < 0.7);
      if (lowBatches.length > 0) {
        const names = lowBatches.map(([n]) => n).join(", ");
        return { severity: "WARNING", title: "Low Batch Attendance", message: `Batches with below 70% attendance: ${names}. Consider reaching out to absent students.`, actionLabel: "View Batches", actionUrl: "/teacher/batches", metadata: { batches: lowBatches.map(([n, v]) => ({ name: n, rate: Math.round((v.present / v.total) * 100) })) } };
      }
      return null;
    },
  },
];

const CENTER_RULES = [
  {
    id: "center_fee_collection_low",
    category: "FINANCIAL",
    check: async (ctx) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const [due, collected] = await Promise.all([
        prisma.studentFeeInstallment.aggregate({
          where: { tenantId: ctx.tenantId, student: { hierarchyNodeId: ctx.hierarchyNodeId }, dueDate: { lte: new Date(), gte: thirtyDaysAgo } },
          _sum: { amount: true },
        }),
        prisma.financialTransaction.aggregate({
          where: { tenantId: ctx.tenantId, centerId: ctx.hierarchyNodeId, createdAt: { gte: thirtyDaysAgo } },
          _sum: { grossAmount: true },
        }),
      ]);
      const totalDue = Number(due._sum?.amount || 0);
      const totalCollected = Number(collected._sum?.grossAmount || 0);
      const rate = totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : null;
      if (rate !== null && rate < 60) {
        return { severity: "CRITICAL", title: "Low Fee Collection", message: `Only ${rate}% of fees collected this month (₹${Math.round(totalCollected)} of ₹${Math.round(totalDue)}). Follow up on pending payments.`, actionLabel: "View Students", actionUrl: "/center/students", metadata: { rate, totalDue, totalCollected } };
      }
      return null;
    },
  },
  {
    id: "center_at_risk_students",
    category: "RISK",
    check: async (ctx) => {
      const students = await prisma.student.findMany({
        where: { tenantId: ctx.tenantId, hierarchyNodeId: ctx.hierarchyNodeId, isActive: true },
        select: { id: true, currentLevelId: true },
        take: 200,
      });
      let atRisk = 0;
      for (const s of students) {
        try {
          const risk = await computeStudentRisk(s.id, ctx.tenantId, s.currentLevelId);
          if (risk.level === "AT_RISK") atRisk++;
        } catch { /* skip */ }
      }
      if (atRisk >= 3) {
        return { severity: "WARNING", title: `${atRisk} At-Risk Students`, message: `${atRisk} students in your center need attention. Coordinate with teachers to address performance and attendance gaps.`, metadata: { atRiskCount: atRisk, totalStudents: students.length } };
      }
      return null;
    },
  },
  {
    id: "center_enrollment_growth",
    category: "OPERATIONAL",
    check: async (ctx) => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const newStudents = await prisma.student.count({
        where: { tenantId: ctx.tenantId, hierarchyNodeId: ctx.hierarchyNodeId, createdAt: { gte: thirtyDaysAgo } },
      });
      if (newStudents >= 5) {
        return { severity: "SUCCESS", title: `${newStudents} New Admissions`, message: `${newStudents} students admitted in the last 30 days. Great enrollment momentum!`, metadata: { newStudents } };
      }
      return null;
    },
  },
];

const SUPERADMIN_RULES = [
  {
    id: "superadmin_network_health",
    category: "OPERATIONAL",
    check: async (ctx) => {
      const [totalStudents, activeStudents] = await Promise.all([
        prisma.student.count({ where: { tenantId: ctx.tenantId } }),
        prisma.student.count({ where: { tenantId: ctx.tenantId, isActive: true } }),
      ]);
      const inactive = totalStudents - activeStudents;
      const inactiveRate = totalStudents > 0 ? Math.round((inactive / totalStudents) * 100) : 0;
      if (inactiveRate > 20) {
        return { severity: "WARNING", title: "High Inactive Rate", message: `${inactiveRate}% of students (${inactive} of ${totalStudents}) are inactive. Review center-level engagement.`, metadata: { totalStudents, activeStudents, inactive, inactiveRate } };
      }
      return null;
    },
  },
  {
    id: "superadmin_revenue_trend",
    category: "FINANCIAL",
    check: async (ctx) => {
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const [current, previous] = await Promise.all([
        prisma.financialTransaction.aggregate({ where: { tenantId: ctx.tenantId, createdAt: { gte: thisMonth } }, _sum: { grossAmount: true } }),
        prisma.financialTransaction.aggregate({ where: { tenantId: ctx.tenantId, createdAt: { gte: lastMonth, lt: thisMonth } }, _sum: { grossAmount: true } }),
      ]);
      const curr = Number(current._sum?.grossAmount || 0);
      const prev = Number(previous._sum?.grossAmount || 0);
      if (prev > 0) {
        const change = Math.round(((curr - prev) / prev) * 100);
        if (change < -15) {
          return { severity: "CRITICAL", title: "Revenue Decline", message: `Revenue is down ${Math.abs(change)}% compared to last month (₹${Math.round(curr)} vs ₹${Math.round(prev)}).`, metadata: { current: curr, previous: prev, change } };
        }
        if (change > 20) {
          return { severity: "SUCCESS", title: "Revenue Growth", message: `Revenue is up ${change}% this month (₹${Math.round(curr)} vs ₹${Math.round(prev)} last month). Great momentum!`, metadata: { current: curr, previous: prev, change } };
        }
      }
      return null;
    },
  },
  {
    id: "superadmin_pending_approvals",
    category: "COMPLIANCE",
    check: async (ctx) => {
      const competitionStage = ctx.role === "BP" ? "BP_REVIEW" : "SUPERADMIN_APPROVAL";
      const examStatus = ctx.role === "BP" ? "SUBMITTED_TO_BUSINESS_PARTNER" : "SUBMITTED_TO_SUPERADMIN";
      const [pendingComps, pendingExamLists] = await Promise.all([
        prisma.competition.count({ where: { tenantId: ctx.tenantId, workflowStage: competitionStage } }),
        prisma.examEnrollmentList.count({ where: { tenantId: ctx.tenantId, status: examStatus } }),
      ]);
      const total = pendingComps + pendingExamLists;
      if (total > 0) {
        const parts = [];
        if (pendingComps) parts.push(`${pendingComps} competition(s)`);
        if (pendingExamLists) parts.push(`${pendingExamLists} exam list(s)`);
        return { severity: "INFO", title: `${total} Pending Approval${total > 1 ? "s" : ""}`, message: `Awaiting your review: ${parts.join(" and ")}. Timely approvals keep workflows moving.`, actionLabel: "Review", actionUrl: "/superadmin/competitions", metadata: { pendingComps, pendingExamLists } };
      }
      return null;
    },
  },
];

const ROLE_RULES = {
  STUDENT: STUDENT_RULES,
  TEACHER: TEACHER_RULES,
  CENTER: CENTER_RULES,
  FRANCHISE: CENTER_RULES, // Same operational insights apply
  BP: SUPERADMIN_RULES,     // Business partners see network-level
  SUPERADMIN: SUPERADMIN_RULES,
};

// ─── Core engine ───────────────────────────────────────────

/**
 * Generate fresh insights for a user based on their role.
 * Returns array of insight objects (not persisted until explicitly saved).
 */
async function generateRoleInsights(auth) {
  const { userId, role, tenantId, hierarchyNodeId, studentId } = auth;
  const rules = ROLE_RULES[role] || [];
  if (!rules.length) return [];

  // Build context
  let student = null;
  if (role === "STUDENT" && studentId) {
    student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, currentLevelId: true },
    });
  }

  const ctx = { userId, role, tenantId, hierarchyNodeId, studentId, student };

  const results = await Promise.allSettled(
    rules.map((rule) =>
      rule.check(ctx).then((result) => (result ? { ...result, ruleId: rule.id, category: rule.category } : null))
    )
  );

  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);
}

/**
 * Get insights for a user. Computes fresh insights from rules, stores them,
 * and returns combined active insights.
 */
async function getInsightsForUser(auth) {
  const { userId, role, tenantId } = auth;

  let fresh = [];
  try {
    fresh = await generateRoleInsights(auth);
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    return [];
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    // Expire old insights
    await prisma.insight.updateMany({
      where: { tenantId, targetUserId: userId, expiresAt: { lt: now }, isDismissed: false },
      data: { isDismissed: true },
    });

    // Upsert: avoid duplicating insights that still match the same rule
    for (const insight of fresh) {
      const existing = await prisma.insight.findFirst({
        where: {
          tenantId,
          targetUserId: userId,
          category: insight.category,
          title: insight.title,
          isDismissed: false,
          createdAt: { gte: twentyFourHoursAgo },
        },
      });
      if (!existing) {
        await prisma.insight.create({
          data: {
            tenantId,
            targetRole: role,
            targetUserId: userId,
            category: insight.category,
            severity: insight.severity,
            title: insight.title,
            message: insight.message,
            actionLabel: insight.actionLabel || null,
            actionUrl: insight.actionUrl || null,
            metadata: insight.metadata || undefined,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    return await prisma.insight.findMany({
      where: { tenantId, targetUserId: userId, isDismissed: false },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 20,
    });
  } catch (error) {
    if (!isInsightStoreUnavailable(error)) {
      throw error;
    }

    return buildTransientInsights(fresh, auth, now);
  }
}

/**
 * Dismiss an insight (user acknowledged it).
 */
async function dismissInsight(insightId, userId, tenantId) {
  try {
    return await prisma.insight.updateMany({
      where: { id: insightId, targetUserId: userId, tenantId },
      data: { isDismissed: true },
    });
  } catch (error) {
    if (!isInsightStoreUnavailable(error)) {
      throw error;
    }

    return { count: 0 };
  }
}

/**
 * Mark an insight as actioned (user clicked the action).
 */
async function actionInsight(insightId, userId, tenantId) {
  try {
    return await prisma.insight.updateMany({
      where: { id: insightId, targetUserId: userId, tenantId },
      data: { isActioned: true },
    });
  } catch (error) {
    if (!isInsightStoreUnavailable(error)) {
      throw error;
    }

    return { count: 0 };
  }
}

/**
 * Get insight summary counts for a user (for badge display).
 */
async function getInsightSummary(userId, tenantId) {
  try {
    const [total, critical, warnings] = await Promise.all([
      prisma.insight.count({ where: { tenantId, targetUserId: userId, isDismissed: false } }),
      prisma.insight.count({ where: { tenantId, targetUserId: userId, isDismissed: false, severity: "CRITICAL" } }),
      prisma.insight.count({ where: { tenantId, targetUserId: userId, isDismissed: false, severity: "WARNING" } }),
    ]);
    return { total, critical, warnings };
  } catch (error) {
    if (!isInsightStoreUnavailable(error)) {
      throw error;
    }

    return { total: 0, critical: 0, warnings: 0 };
  }
}

export { getInsightsForUser, dismissInsight, actionInsight, getInsightSummary, generateRoleInsights };
