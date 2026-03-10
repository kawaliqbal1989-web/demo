import { prisma } from "../lib/prisma.js";
import { getLevelPerformance } from "./student-performance.service.js";

/**
 * Compute a composite risk score for a single student.
 * Returns { score: 0-6, level, indicators[] }
 * Each indicator: { key, label, triggered, value, threshold }
 */
async function computeStudentRisk(studentId, tenantId, levelId) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    attendanceCounts,
    lastSubmission,
    overdueInstallments,
    practiceStats,
    performance,
  ] = await Promise.all([
    // 1. Attendance last 30 days
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

    // 2. Last worksheet submission date
    prisma.worksheetSubmission.findFirst({
      where: { tenantId, studentId },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true },
    }),

    // 3. Overdue fee installments
    prisma.studentFeeInstallment.findMany({
      where: {
        tenantId,
        studentId,
        dueDate: { lt: now },
      },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        payments: {
          select: { grossAmount: true },
        },
      },
    }),

    // 4. Practice submissions (all-time)
    prisma.worksheetSubmission.aggregate({
      where: {
        tenantId,
        studentId,
        score: { not: null },
      },
      _count: { _all: true },
      _avg: { score: true },
    }),

    // 5. Performance (reuse existing service if levelId known)
    levelId
      ? getLevelPerformance(studentId, levelId, tenantId)
      : Promise.resolve(null),
  ]);

  const indicators = [];

  // --- Indicator 1: Low Attendance ---
  const attendanceMap = {};
  for (const row of attendanceCounts) {
    attendanceMap[row.status] = row._count._all;
  }
  const totalSessions =
    (attendanceMap.PRESENT || 0) +
    (attendanceMap.ABSENT || 0) +
    (attendanceMap.LATE || 0) +
    (attendanceMap.EXCUSED || 0);
  const presentCount = (attendanceMap.PRESENT || 0) + (attendanceMap.LATE || 0);
  const attendanceRate = totalSessions > 0 ? Math.round((presentCount / totalSessions) * 100) : null;

  indicators.push({
    key: "LOW_ATTENDANCE",
    label: "Low Attendance",
    triggered: attendanceRate !== null && attendanceRate < 70,
    value: attendanceRate !== null ? `${attendanceRate}%` : "No data",
    threshold: "< 70%",
  });

  // --- Indicator 2: Declining Scores ---
  const trend = performance?.improvementTrendPercentage ?? null;
  indicators.push({
    key: "DECLINING_SCORES",
    label: "Declining Scores",
    triggered: trend !== null && trend < -10,
    value: trend !== null ? `${trend}%` : "No data",
    threshold: "< -10%",
  });

  // --- Indicator 3: Fee Overdue ---
  let overdueAmount = 0;
  let overdueCount = 0;
  for (const inst of overdueInstallments) {
    const paid = inst.payments.reduce(
      (sum, p) => sum + Number(p.grossAmount || 0),
      0
    );
    const due = Number(inst.amount || 0);
    if (paid < due) {
      overdueCount += 1;
      overdueAmount += due - paid;
    }
  }
  indicators.push({
    key: "FEE_OVERDUE",
    label: "Fee Overdue",
    triggered: overdueCount > 0,
    value: overdueCount > 0 ? `₹${Math.round(overdueAmount)} (${overdueCount} installments)` : "All clear",
    threshold: "Any unpaid past due",
  });

  // --- Indicator 4: Inactive (no submission in 7 days) ---
  const lastDate = lastSubmission?.submittedAt || null;
  const daysSinceActivity = lastDate
    ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  indicators.push({
    key: "INACTIVE",
    label: "Inactive",
    triggered: lastDate === null || daysSinceActivity >= 7,
    value: daysSinceActivity !== null ? `${daysSinceActivity} days` : "Never submitted",
    threshold: "> 7 days",
  });

  // --- Indicator 5: Promotion Blocked ---
  // We skip full evaluatePromotionEligibility here (too expensive in batch)
  // Instead use a lightweight proxy: practiceAvg < 75 OR consistency low
  const practiceAvg = practiceStats._avg?.score !== null
    ? Math.round(Number(practiceStats._avg.score) * 100) / 100
    : null;
  const totalAttempts = practiceStats._count._all || 0;
  const promotionBlocked =
    totalAttempts >= 3 && practiceAvg !== null && practiceAvg < 75;

  indicators.push({
    key: "PROMOTION_BLOCKED",
    label: "Promotion At Risk",
    triggered: promotionBlocked,
    value: practiceAvg !== null ? `Avg: ${practiceAvg}%` : "No data",
    threshold: "Practice avg < 75%",
  });

  // --- Indicator 6: Low Practice ---
  indicators.push({
    key: "LOW_PRACTICE",
    label: "Low Practice",
    triggered: totalAttempts < 3 || (practiceAvg !== null && practiceAvg < 50),
    value: `${totalAttempts} attempts, avg ${practiceAvg ?? "N/A"}%`,
    threshold: "< 3 attempts or avg < 50%",
  });

  // --- Composite ---
  const score = indicators.filter((i) => i.triggered).length;
  const level = score === 0 ? "HEALTHY" : score <= 2 ? "ATTENTION" : "AT_RISK";

  return { score, level, indicators };
}

/**
 * Generate rule-based text insights from risk data + student context.
 */
function generateInsights(risk, engagement, attendance, fees, promotion) {
  const insights = [];

  for (const ind of risk.indicators) {
    if (!ind.triggered) continue;
    switch (ind.key) {
      case "LOW_ATTENDANCE":
        insights.push({
          type: "warning",
          text: `Attendance rate is ${ind.value} in the last 30 days. Consider contacting the guardian to discuss regular attendance.`,
        });
        break;
      case "DECLINING_SCORES":
        insights.push({
          type: "warning",
          text: `Performance is declining (${ind.value} trend). Review recent worksheets and consider assigning easier practice sets.`,
        });
        break;
      case "FEE_OVERDUE":
        insights.push({
          type: "alert",
          text: `${ind.value} overdue. Follow up on pending fee collection to avoid further delays.`,
        });
        break;
      case "INACTIVE":
        insights.push({
          type: "warning",
          text: `No worksheet activity for ${ind.value}. Reach out to re-engage the student before the gap widens.`,
        });
        break;
      case "PROMOTION_BLOCKED":
        insights.push({
          type: "info",
          text: `Current practice average (${ind.value}) is below promotion threshold. Assign targeted worksheets to improve scores.`,
        });
        break;
      case "LOW_PRACTICE":
        insights.push({
          type: "info",
          text: `Low practice engagement (${ind.value}). Encourage more frequent practice to build consistency.`,
        });
        break;
    }
  }

  if (risk.level === "HEALTHY") {
    insights.push({
      type: "success",
      text: "Student is performing well across all indicators. Keep up the good work!",
    });
  }

  if (promotion?.eligible) {
    insights.push({
      type: "success",
      text: "Student meets all promotion criteria and is ready for the next level.",
    });
  }

  return insights;
}

export { computeStudentRisk, generateInsights };
