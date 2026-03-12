import { prisma } from "../lib/prisma.js";
import { computeStudentRisk } from "./student-risk.service.js";
import { evaluatePromotionEligibility } from "./promotion-eligibility.service.js";
import { getLevelPerformance } from "./student-performance.service.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";

// ─── Milestone Definitions ──────────────────────────────────────────
const MILESTONE_DEFS = [
  { key: "first_worksheet", title: "First Steps", description: "Completed your first worksheet", icon: "🎯" },
  { key: "worksheets_5", title: "Getting Started", description: "Completed 5 worksheets", icon: "📝", threshold: 5 },
  { key: "worksheets_10", title: "Consistent Learner", description: "Completed 10 worksheets", icon: "📚", threshold: 10 },
  { key: "worksheets_25", title: "Practice Pro", description: "Completed 25 worksheets", icon: "🏅", threshold: 25 },
  { key: "worksheets_50", title: "Worksheet Warrior", description: "Completed 50 worksheets", icon: "⚔️", threshold: 50 },
  { key: "worksheets_100", title: "Century Champion", description: "Completed 100 worksheets", icon: "🏆", threshold: 100 },
  { key: "streak_3", title: "On a Roll", description: "3-day attendance streak", icon: "🔥", streakThreshold: 3 },
  { key: "streak_7", title: "Week Warrior", description: "7-day attendance streak", icon: "🔥", streakThreshold: 7 },
  { key: "streak_14", title: "Fortnight Focus", description: "14-day attendance streak", icon: "💪", streakThreshold: 14 },
  { key: "streak_30", title: "Monthly Master", description: "30-day attendance streak", icon: "👑", streakThreshold: 30 },
  { key: "perfect_score", title: "Perfect Score", description: "Scored 100% on a worksheet", icon: "💯" },
  { key: "no_weak_topics", title: "Well-Rounded", description: "All topics above 60% accuracy", icon: "🌟" },
  { key: "promotion_ready", title: "Level Up Ready", description: "Met all promotion criteria", icon: "🚀" },
  { key: "first_practice", title: "Self-Starter", description: "Created your first practice worksheet", icon: "✨" },
];

function buildEmptyCoachDashboard() {
  return {
    dailyMission: [],
    weeklyPlan: {
      goals: [],
      progress: 0,
      weekStart: new Date().toISOString()
    },
    streaks: {
      attendance: { current: 0, best: 0 },
      practice: { current: 0 }
    },
    readiness: {
      mockTest: null,
      competition: null,
      promotion: null
    },
    milestones: {
      earned: [],
      newlyEarned: [],
      nextHints: []
    },
    performanceExplainer: {
      summary: ["Advanced coaching insights are temporarily unavailable."],
      strengths: [],
      improvements: [],
      tips: []
    }
  };
}

// ─── Compute Streaks ────────────────────────────────────────────────
async function computeStreaks(studentId, tenantId) {
  // Attendance streak
  const attendanceEntries = await prisma.attendanceEntry.findMany({
    where: {
      tenantId,
      studentId,
      session: { status: { in: ["PUBLISHED", "LOCKED"] } },
    },
    orderBy: { session: { date: "desc" } },
    take: 90,
    select: { status: true, session: { select: { date: true } } },
  });

  let attendanceStreak = 0;
  for (const entry of attendanceEntries) {
    if (entry.status === "PRESENT" || entry.status === "LATE") {
      attendanceStreak++;
    } else {
      break;
    }
  }

  // Practice streak: consecutive days with at least one submission
  const submissions = await prisma.worksheetSubmission.findMany({
    where: { tenantId, studentId, submittedAt: { not: null } },
    orderBy: { submittedAt: "desc" },
    take: 200,
    select: { submittedAt: true },
  });

  let practiceStreak = 0;
  if (submissions.length > 0) {
    const uniqueDays = new Set();
    for (const s of submissions) {
      if (s.submittedAt) {
        uniqueDays.add(new Date(s.submittedAt).toISOString().slice(0, 10));
      }
    }
    const sortedDays = [...uniqueDays].sort((a, b) => b.localeCompare(a));
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (sortedDays[0] === today || sortedDays[0] === yesterday) {
      practiceStreak = 1;
      for (let i = 1; i < sortedDays.length; i++) {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        const diffDays = (prev.getTime() - curr.getTime()) / 86400000;
        if (diffDays <= 1.5) {
          practiceStreak++;
        } else {
          break;
        }
      }
    }
  }

  // Best streaks (historical max from attendance)
  let bestAttendanceStreak = 0;
  let current = 0;
  for (const entry of attendanceEntries) {
    if (entry.status === "PRESENT" || entry.status === "LATE") {
      current++;
      bestAttendanceStreak = Math.max(bestAttendanceStreak, current);
    } else {
      current = 0;
    }
  }

  return {
    attendance: { current: attendanceStreak, best: bestAttendanceStreak },
    practice: { current: practiceStreak },
  };
}

// ─── Daily Mission ──────────────────────────────────────────────────
async function generateDailyMission(studentId, tenantId, levelId) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [todaySubmissions, pendingWorksheets, weakTopics, practiceCount] = await Promise.all([
    prisma.worksheetSubmission.count({
      where: { tenantId, studentId, submittedAt: { gte: todayStart } },
    }),
    prisma.worksheetAssignment.findMany({
      where: {
        tenantId,
        studentId,
        worksheet: { status: "PUBLISHED" },
        submissions: { none: { studentId } },
      },
      take: 3,
      select: {
        worksheet: { select: { id: true, title: true } },
      },
    }),
    levelId
      ? prisma.$queryRaw`
          SELECT ws.topic, 
                 ROUND(AVG(ws.score), 1) as accuracy,
                 COUNT(*) as attempts
          FROM worksheet_submissions ws
          JOIN worksheets w ON ws.worksheetId = w.id
          WHERE ws.tenantId = ${tenantId}
            AND ws.studentId = ${studentId}
            AND w.levelId = ${levelId}
            AND ws.score IS NOT NULL
          GROUP BY ws.topic
          HAVING accuracy < 60
          ORDER BY accuracy ASC
          LIMIT 3
        `.catch(() => [])
      : [],
    prisma.worksheetSubmission.count({
      where: { tenantId, studentId },
    }),
  ]);

  const missions = [];

  // Primary mission: complete a worksheet if none done today
  if (todaySubmissions === 0) {
    if (pendingWorksheets.length > 0) {
      const ws = pendingWorksheets[0].worksheet;
      missions.push({
        id: "complete_worksheet",
        type: "PRIMARY",
        title: "Complete Today's Worksheet",
        description: `Finish "${ws.title}" to keep your streak going!`,
        actionLabel: "Start Now",
        actionUrl: `/student/worksheets/${ws.id}`,
        icon: "📝",
        completed: false,
        xp: 20,
      });
    } else {
      missions.push({
        id: "practice_session",
        type: "PRIMARY",
        title: "Practice Session",
        description: "Create and complete a practice worksheet today!",
        actionLabel: "Create Practice",
        actionUrl: "/student/practice",
        icon: "🎯",
        completed: false,
        xp: 15,
      });
    }
  } else {
    missions.push({
      id: "complete_worksheet",
      type: "PRIMARY",
      title: "Complete Today's Worksheet",
      description: `You've completed ${todaySubmissions} worksheet${todaySubmissions > 1 ? "s" : ""} today — great work!`,
      icon: "✅",
      completed: true,
      xp: 20,
    });
  }

  // Secondary: weak topic practice
  if (weakTopics.length > 0) {
    const topic = weakTopics[0];
    missions.push({
      id: "improve_weak_topic",
      type: "SECONDARY",
      title: `Improve: ${topic.topic}`,
      description: `Your accuracy is ${topic.accuracy}%. Practice to reach 60%+`,
      actionLabel: "Practice Now",
      actionUrl: "/student/practice",
      icon: "💡",
      completed: false,
      xp: 10,
    });
  }

  // Tertiary: milestone chase
  if (practiceCount > 0 && practiceCount < 100) {
    const nextThreshold = [5, 10, 25, 50, 100].find((t) => t > practiceCount) || 100;
    missions.push({
      id: "milestone_chase",
      type: "BONUS",
      title: `Reach ${nextThreshold} Worksheets`,
      description: `You're at ${practiceCount}/${nextThreshold}. ${nextThreshold - practiceCount} more to go!`,
      icon: "🏅",
      completed: false,
      xp: 5,
    });
  }

  return missions;
}

// ─── Weekly Learning Plan ───────────────────────────────────────────
async function generateWeeklyPlan(studentId, tenantId, levelId) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Sunday
  weekStart.setHours(0, 0, 0, 0);

  const [weekSubmissions, weekAttendance, weekPerfect, totalSubmissions] = await Promise.all([
    prisma.worksheetSubmission.count({
      where: { tenantId, studentId, submittedAt: { gte: weekStart } },
    }),
    prisma.attendanceEntry.count({
      where: {
        tenantId,
        studentId,
        status: { in: ["PRESENT", "LATE"] },
        session: { date: { gte: weekStart }, status: { in: ["PUBLISHED", "LOCKED"] } },
      },
    }),
    prisma.worksheetSubmission.count({
      where: { tenantId, studentId, submittedAt: { gte: weekStart }, score: { gte: 90 } },
    }),
    prisma.worksheetSubmission.count({
      where: { tenantId, studentId },
    }),
  ]);

  // Adaptive targets based on current performance
  const worksheetTarget = Math.max(3, Math.min(7, Math.ceil(totalSubmissions / 10)));
  const attendanceTarget = 5; // 5 days a week
  const excellenceTarget = Math.max(1, Math.floor(worksheetTarget / 3));

  const goals = [
    {
      id: "weekly_worksheets",
      title: "Complete Worksheets",
      description: `Finish ${worksheetTarget} worksheets this week`,
      current: weekSubmissions,
      target: worksheetTarget,
      icon: "📝",
      completed: weekSubmissions >= worksheetTarget,
    },
    {
      id: "weekly_attendance",
      title: "Attend Classes",
      description: `Attend ${attendanceTarget} classes this week`,
      current: weekAttendance,
      target: attendanceTarget,
      icon: "📅",
      completed: weekAttendance >= attendanceTarget,
    },
    {
      id: "weekly_excellence",
      title: "Score 90%+",
      description: `Score 90% or above on ${excellenceTarget} worksheet${excellenceTarget > 1 ? "s" : ""}`,
      current: weekPerfect,
      target: excellenceTarget,
      icon: "⭐",
      completed: weekPerfect >= excellenceTarget,
    },
  ];

  const completedCount = goals.filter((g) => g.completed).length;
  const progress = Math.round((completedCount / goals.length) * 100);

  return { goals, progress, weekStart: weekStart.toISOString() };
}

// ─── Readiness Scores ───────────────────────────────────────────────
async function computeReadiness(studentId, tenantId, levelId) {
  if (!levelId) {
    return { mockTest: null, competition: null, promotion: null };
  }

  const [promotion, performance, recentScores, mockResults] = await Promise.all([
    evaluatePromotionEligibility(studentId, levelId, tenantId).catch(() => ({
      eligible: false,
      reasons: [],
      metrics: {},
    })),
    getLevelPerformance(studentId, levelId, tenantId).catch(() => null),
    prisma.worksheetSubmission.findMany({
      where: { tenantId, studentId, score: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: 10,
      select: { score: true },
    }),
    prisma.mockTestResult.findMany({
      where: { tenantId, studentId },
      orderBy: { recordedAt: "desc" },
      take: 5,
      select: { marks: true, total: true },
    }),
  ]);

  // Mock test readiness: based on recent worksheet performance + mock test history
  const recentAvg =
    recentScores.length > 0
      ? recentScores.reduce((s, r) => s + Number(r.score || 0), 0) / recentScores.length
      : 0;

  const mockAvg =
    mockResults.length > 0
      ? mockResults.reduce((s, r) => s + (Number(r.marks || 0) / Math.max(Number(r.total || 1), 1)) * 100, 0) /
        mockResults.length
      : null;

  const mockTestReadiness = Math.round(
    mockAvg != null ? mockAvg * 0.6 + recentAvg * 0.4 : recentAvg
  );

  // Competition readiness: combines performance, consistency, attendance proxy
  const competitionReadiness = Math.round(
    (performance?.accuracy || 0) * 0.4 +
      recentAvg * 0.4 +
      (promotion.metrics?.consistencyScore || 0) * 0.2
  );

  // Promotion readiness
  const promotionMetrics = promotion.metrics || {};
  const promotionReadiness = promotion.eligible
    ? 100
    : Math.round(
        ((promotionMetrics.practiceAverage || 0) / Math.max(promotionMetrics.minPracticeAverage || 75, 1)) * 50 +
          ((promotionMetrics.accuracy || 0) / 100) * 30 +
          ((promotionMetrics.consistencyScore || 0) / 100) * 20
      );

  return {
    mockTest: {
      score: Math.min(100, Math.max(0, mockTestReadiness)),
      label: mockTestReadiness >= 80 ? "Ready" : mockTestReadiness >= 50 ? "Almost There" : "Needs Practice",
      tip:
        mockTestReadiness >= 80
          ? "You're well prepared!"
          : mockTestReadiness >= 50
            ? "Focus on weak areas to boost your score."
            : "Practice more worksheets to build confidence.",
    },
    competition: {
      score: Math.min(100, Math.max(0, competitionReadiness)),
      label:
        competitionReadiness >= 80
          ? "Competition Ready"
          : competitionReadiness >= 50
            ? "Getting There"
            : "Keep Practicing",
      tip:
        competitionReadiness >= 80
          ? "Strong performance across all areas!"
          : "Improve your accuracy and consistency.",
    },
    promotion: {
      score: Math.min(100, Math.max(0, promotionReadiness)),
      eligible: promotion.eligible,
      reasons: promotion.reasons || [],
      label: promotion.eligible ? "Eligible" : "Not Yet",
    },
  };
}

// ─── Performance Explainer ──────────────────────────────────────────
async function explainPerformance(studentId, tenantId, levelId) {
  const [risk, streaks, performance, promotionData] = await Promise.all([
    computeStudentRisk(studentId, tenantId, levelId),
    computeStreaks(studentId, tenantId),
    levelId ? getLevelPerformance(studentId, levelId, tenantId).catch(() => null) : null,
    levelId
      ? evaluatePromotionEligibility(studentId, levelId, tenantId).catch(() => null)
      : null,
  ]);

  const summary = [];
  const strengths = [];
  const improvements = [];
  const tips = [];

  // Overall health
  if (risk.level === "HEALTHY") {
    summary.push("You're doing great! Your overall performance is strong and consistent.");
  } else if (risk.level === "ATTENTION") {
    summary.push("You're making progress, but there are a few areas that need attention.");
  } else {
    summary.push("Let's work together to get you back on track. Here's what needs focus:");
  }

  // Analyze indicators
  for (const indicator of risk.indicators || []) {
    switch (indicator) {
      case "LOW_ATTENDANCE":
        improvements.push("Your attendance has dropped below 70%. Regular attendance helps you stay on pace.");
        tips.push("Try to attend every class this week — even one extra day makes a difference.");
        break;
      case "DECLINING_SCORES":
        improvements.push("Your recent scores show a declining trend.");
        tips.push("Review your weak topics and do targeted practice before attempting full worksheets.");
        break;
      case "FEE_OVERDUE":
        improvements.push("You have overdue fee payments. Please ask your guardian to check with the center.");
        break;
      case "INACTIVE":
        improvements.push("You haven't submitted any work recently. Staying active keeps your skills sharp.");
        tips.push("Start with a short practice session today — even 10 minutes helps!");
        break;
      case "LOW_PRACTICE":
        improvements.push("You need more practice attempts to build consistency.");
        tips.push("Aim for at least 3 practice sessions per week.");
        break;
    }
  }

  // Strengths
  if (performance?.accuracy >= 80) {
    strengths.push(`Your accuracy is ${performance.accuracy}% — excellent work!`);
  }
  if (streaks.attendance.current >= 5) {
    strengths.push(`You have a ${streaks.attendance.current}-day attendance streak. Keep it going!`);
  }
  if (streaks.practice.current >= 3) {
    strengths.push(`${streaks.practice.current}-day practice streak — you're building great habits!`);
  }
  if (performance?.improvementTrend > 5) {
    strengths.push("Your scores are trending upward — your hard work is paying off!");
  }
  if (promotionData?.eligible) {
    strengths.push("You've met all the criteria for promotion to the next level! 🎉");
  }

  if (strengths.length === 0 && improvements.length === 0) {
    summary.push("Keep working on your worksheets regularly to build a clear performance picture.");
  }

  return { summary, strengths, improvements, tips };
}

// ─── Check & Award Milestones ───────────────────────────────────────
async function checkAndAwardMilestones(studentId, tenantId, levelId) {
  const [existingMilestones, totalSubmissions, streaks, hasPerf100, practiceWsCount, weakTopicCount, promotionData] =
    await Promise.all([
      prisma.studentMilestone.findMany({
        where: { tenantId, studentId },
        select: { key: true },
      }),
      prisma.worksheetSubmission.count({
        where: { tenantId, studentId },
      }),
      computeStreaks(studentId, tenantId),
      prisma.worksheetSubmission.count({
        where: { tenantId, studentId, score: { gte: 100 } },
      }),
      prisma.worksheetSubmission.count({
        where: {
          tenantId,
          studentId,
          worksheet: { isPractice: true },
        },
      }).catch(() => 0),
      prisma.$queryRaw`
        SELECT COUNT(*) as cnt FROM (
          SELECT ws.topic
          FROM worksheet_submissions ws
          JOIN worksheets w ON ws.worksheetId = w.id
          WHERE ws.tenantId = ${tenantId}
            AND ws.studentId = ${studentId}
            AND ws.score IS NOT NULL
          GROUP BY ws.topic
          HAVING AVG(ws.score) < 60
        ) t
      `.then((r) => Number(r?.[0]?.cnt || 0)).catch(() => 1),
      levelId
        ? evaluatePromotionEligibility(studentId, levelId, tenantId).catch(() => ({ eligible: false }))
        : { eligible: false },
    ]);

  const earned = new Set(existingMilestones.map((m) => m.key));
  const newMilestones = [];

  // Worksheet count milestones
  if (totalSubmissions >= 1 && !earned.has("first_worksheet")) {
    newMilestones.push("first_worksheet");
  }
  for (const def of MILESTONE_DEFS.filter((d) => d.threshold)) {
    if (totalSubmissions >= def.threshold && !earned.has(def.key)) {
      newMilestones.push(def.key);
    }
  }

  // Streak milestones
  const maxStreak = Math.max(streaks.attendance.current, streaks.attendance.best);
  for (const def of MILESTONE_DEFS.filter((d) => d.streakThreshold)) {
    if (maxStreak >= def.streakThreshold && !earned.has(def.key)) {
      newMilestones.push(def.key);
    }
  }

  // Special milestones
  if (hasPerf100 > 0 && !earned.has("perfect_score")) {
    newMilestones.push("perfect_score");
  }
  if (weakTopicCount === 0 && totalSubmissions >= 5 && !earned.has("no_weak_topics")) {
    newMilestones.push("no_weak_topics");
  }
  if (promotionData.eligible && !earned.has("promotion_ready")) {
    newMilestones.push("promotion_ready");
  }
  if (practiceWsCount >= 1 && !earned.has("first_practice")) {
    newMilestones.push("first_practice");
  }

  // Award new milestones
  if (newMilestones.length > 0) {
    const creates = newMilestones.map((key) => {
      const def = MILESTONE_DEFS.find((d) => d.key === key);
      return prisma.studentMilestone.create({
        data: {
          tenantId,
          studentId,
          key,
          title: def?.title || key,
          description: def?.description || null,
          icon: def?.icon || "🏅",
        },
      });
    });
    await Promise.allSettled(creates);
  }

  // Return all milestones (earned + newly awarded)
  const allMilestones = await prisma.studentMilestone.findMany({
    where: { tenantId, studentId },
    orderBy: { earnedAt: "desc" },
    select: { key: true, title: true, description: true, icon: true, earnedAt: true },
  });

  // Compute next milestone hints
  const allEarned = new Set(allMilestones.map((m) => m.key));
  const nextHints = [];
  for (const def of MILESTONE_DEFS) {
    if (allEarned.has(def.key)) continue;
    if (def.threshold && totalSubmissions < def.threshold) {
      nextHints.push({
        key: def.key,
        title: def.title,
        icon: def.icon,
        hint: `${def.threshold - totalSubmissions} more worksheet${def.threshold - totalSubmissions > 1 ? "s" : ""} to go`,
        progress: Math.round((totalSubmissions / def.threshold) * 100),
      });
      break; // only show next worksheet milestone
    }
    if (def.streakThreshold && maxStreak < def.streakThreshold) {
      nextHints.push({
        key: def.key,
        title: def.title,
        icon: def.icon,
        hint: `${def.streakThreshold - maxStreak} more day${def.streakThreshold - maxStreak > 1 ? "s" : ""} to go`,
        progress: Math.round((maxStreak / def.streakThreshold) * 100),
      });
      break; // only show next streak milestone
    }
  }

  return {
    earned: allMilestones,
    newlyEarned: newMilestones.map((key) => MILESTONE_DEFS.find((d) => d.key === key)).filter(Boolean),
    nextHints,
  };
}

// ─── Full Coach Dashboard ───────────────────────────────────────────
async function getCoachDashboard(studentId, tenantId, levelId) {
  try {
    const [dailyMission, weeklyPlan, streaks, readiness, milestones, performanceExplainer] =
      await Promise.all([
        generateDailyMission(studentId, tenantId, levelId),
        generateWeeklyPlan(studentId, tenantId, levelId),
        computeStreaks(studentId, tenantId),
        computeReadiness(studentId, tenantId, levelId),
        checkAndAwardMilestones(studentId, tenantId, levelId),
        explainPerformance(studentId, tenantId, levelId),
      ]);

    return {
      dailyMission,
      weeklyPlan,
      streaks,
      readiness,
      milestones,
      performanceExplainer,
    };
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    return buildEmptyCoachDashboard();
  }
}

export {
  getCoachDashboard,
  generateDailyMission,
  generateWeeklyPlan,
  computeStreaks,
  computeReadiness,
  checkAndAwardMilestones,
  explainPerformance,
};
