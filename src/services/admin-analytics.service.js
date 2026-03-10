import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round2(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function parseDateRange(from, to) {
  const createdAt = {};

  if (from) {
    const text = String(from).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const d = new Date(`${text}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) createdAt.gte = d;
    }
  }

  if (to) {
    const text = String(to).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const d = new Date(`${text}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) createdAt.lte = d;
    }
  }

  return Object.keys(createdAt).length ? createdAt : null;
}

function resolveTenantId(authTenantId, queryTenantId) {
  if (!queryTenantId) {
    return authTenantId;
  }

  return String(queryTenantId);
}

async function getLevelDistribution({ authTenantId, queryTenantId, from, to }) {
  const tenantId = resolveTenantId(authTenantId, queryTenantId);
  const createdAt = parseDateRange(from, to);

  const where = {
    tenantId,
    ...(createdAt ? { createdAt } : {})
  };

  const [grouped, totalStudents, levels] = await Promise.all([
    prisma.student.groupBy({
      by: ["levelId"],
      where,
      _count: {
        _all: true
      }
    }),
    prisma.student.count({ where }),
    prisma.level.findMany({
      where: {
        tenantId
      },
      select: {
        id: true,
        name: true,
        rank: true
      },
      take: 500
    })
  ]);

  const levelMap = new Map(levels.map((level) => [level.id, level]));

  return {
    totalStudents,
    byLevel: grouped.map((entry) => ({
      levelId: entry.levelId,
      levelName: levelMap.get(entry.levelId)?.name || null,
      levelRank: levelMap.get(entry.levelId)?.rank || null,
      studentCount: entry._count._all
    }))
  };
}

function evaluateEligibilityFromSnapshot(rule, snapshot) {
  if (!rule) {
    return false;
  }

  const minPracticeAverage = toNumber(rule.minPracticeAverage);
  const minExamScore = toNumber(rule.minExamScore);
  const minAccuracy = toNumber(rule.minAccuracy);
  const minConsistencyScore = toNumber(rule.minConsistencyScore);

  if (
    minPracticeAverage !== null &&
    (snapshot.practiceAverage === null || snapshot.practiceAverage < minPracticeAverage)
  ) {
    return false;
  }

  if (minExamScore !== null && (snapshot.examScore === null || snapshot.examScore < minExamScore)) {
    return false;
  }

  if (minAccuracy !== null && (snapshot.accuracy === null || snapshot.accuracy < minAccuracy)) {
    return false;
  }

  if (
    minConsistencyScore !== null &&
    (snapshot.consistency === null || snapshot.consistency < minConsistencyScore)
  ) {
    return false;
  }

  if (rule.maxAttemptsAllowed !== null && snapshot.attempts > rule.maxAttemptsAllowed) {
    return false;
  }

  return true;
}

function calculateConsistencyScore(scores) {
  if (!scores.length) {
    return null;
  }

  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance =
    scores.reduce((sum, score) => sum + (score - mean) * (score - mean), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  return round2(Math.max(0, Math.min(100, 100 - stdDev * 2)));
}

async function getPromotionRate({ authTenantId, queryTenantId, from, to }) {
  const tenantId = resolveTenantId(authTenantId, queryTenantId);
  const createdAt = parseDateRange(from, to);

  const studentWhere = {
    tenantId,
    ...(createdAt ? { createdAt } : {})
  };

  const students = await prisma.student.findMany({
    where: studentWhere,
    select: {
      id: true,
      levelId: true
    },
    take: 50000
  });

  const studentIds = students.map((student) => student.id);

  if (!studentIds.length) {
    return {
      totalStudents: 0,
      eligiblePercentage: 0,
      promotedLast30DaysPercentage: 0
    };
  }

  const [rules, submissions, exams, recentPromotions] = await Promise.all([
    prisma.levelRule.findMany({
      where: { tenantId },
      take: 500
    }),
    prisma.worksheetSubmission.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        score: { not: null }
      },
      orderBy: {
        submittedAt: "desc"
      },
      select: {
        studentId: true,
        score: true,
        worksheet: {
          select: {
            levelId: true
          }
        }
      },
      take: 100000
    }),
    prisma.competitionEnrollment.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        totalScore: { not: null }
      },
      orderBy: {
        enrolledAt: "desc"
      },
      select: {
        studentId: true,
        totalScore: true,
        competition: {
          select: {
            levelId: true
          }
        }
      },
      take: 50000
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        action: "COURSE_ASSIGNMENT",
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        entityId: true
      },
      take: 50000
    })
  ]);

  const ruleByLevel = new Map(rules.map((rule) => [rule.levelId, rule]));

  const scoresByStudentLevel = new Map();
  for (const row of submissions) {
    const key = `${row.studentId}:${row.worksheet.levelId}`;
    if (!scoresByStudentLevel.has(key)) {
      scoresByStudentLevel.set(key, []);
    }
    scoresByStudentLevel.get(key).push(Number(row.score));
  }

  const examByStudentLevel = new Map();
  for (const row of exams) {
    const key = `${row.studentId}:${row.competition.levelId}`;
    if (!examByStudentLevel.has(key)) {
      examByStudentLevel.set(key, Number(row.totalScore));
    }
  }

  let eligibleCount = 0;

  for (const student of students) {
    const key = `${student.id}:${student.levelId}`;
    const scores = scoresByStudentLevel.get(key) || [];
    const lastFive = scores.slice(0, 5);
    const practiceAverage = lastFive.length
      ? round2(lastFive.reduce((sum, score) => sum + score, 0) / lastFive.length)
      : null;
    const snapshot = {
      attempts: scores.length,
      practiceAverage,
      examScore: examByStudentLevel.get(key) ?? null,
      accuracy: practiceAverage,
      consistency: calculateConsistencyScore(lastFive)
    };

    if (evaluateEligibilityFromSnapshot(ruleByLevel.get(student.levelId), snapshot)) {
      eligibleCount += 1;
    }
  }

  const promotedIds = new Set(
    recentPromotions.map((event) => event.entityId).filter((entityId) => Boolean(entityId))
  );

  const promotedCount = students.filter((student) => promotedIds.has(student.id)).length;
  const totalStudents = students.length;

  return {
    totalStudents,
    eligiblePercentage: round2((eligibleCount / totalStudents) * 100),
    promotedLast30DaysPercentage: round2((promotedCount / totalStudents) * 100)
  };
}

async function getCompetitionStats({ authTenantId, queryTenantId, from, to }) {
  const tenantId = resolveTenantId(authTenantId, queryTenantId);
  const createdAt = parseDateRange(from, to);

  const competitionWhere = {
    tenantId,
    ...(createdAt ? { createdAt } : {})
  };

  const [totalCompetitions, groupedByWorkflowStage, avgRows] = await Promise.all([
    prisma.competition.count({
      where: competitionWhere
    }),
    prisma.competition.groupBy({
      by: ["workflowStage"],
      where: competitionWhere,
      _count: {
        _all: true
      }
    }),
    (async () => {
      const conditions = [
        Prisma.sql`tenantId = ${tenantId}`,
        Prisma.sql`workflowStage = 'APPROVED'`
      ];

      if (createdAt?.gte) {
        conditions.push(Prisma.sql`createdAt >= ${createdAt.gte}`);
      }

      if (createdAt?.lte) {
        conditions.push(Prisma.sql`createdAt <= ${createdAt.lte}`);
      }

      const whereSql = Prisma.sql`${Prisma.join(conditions, Prisma.sql` AND `)}`;

      return prisma.$queryRaw(
        Prisma.sql`SELECT AVG(TIMESTAMPDIFF(SECOND, createdAt, updatedAt)) / 3600 AS avgHours FROM Competition WHERE ${whereSql}`
      );
    })()
  ]);

  const approvedCount =
    groupedByWorkflowStage.find((entry) => entry.workflowStage === "APPROVED")?._count._all || 0;
  const rejectedCount =
    groupedByWorkflowStage.find((entry) => entry.workflowStage === "REJECTED")?._count._all || 0;

  const avgValue = avgRows?.[0]?.avgHours;
  const averageApprovalTimeHours = avgValue === null || avgValue === undefined ? null : round2(Number(avgValue));

  return {
    totalCompetitions,
    approvedCount,
    rejectedCount,
    averageApprovalTimeHours
  };
}

async function getCenterPerformance({ authTenantId, queryTenantId, from, to }) {
  const tenantId = resolveTenantId(authTenantId, queryTenantId);
  const createdAt = parseDateRange(from, to);

  const centers = await prisma.hierarchyNode.findMany({
    where: {
      tenantId,
      type: {
        in: ["SCHOOL", "BRANCH"]
      }
    },
    select: {
      id: true,
      name: true,
      type: true
    },
    take: 5000
  });

  const centerIds = centers.map((center) => center.id);

  if (!centerIds.length) {
    return [];
  }

  const students = await prisma.student.findMany({
    where: {
      tenantId,
      hierarchyNodeId: {
        in: centerIds
      },
      ...(createdAt ? { createdAt } : {})
    },
    select: {
      id: true,
      hierarchyNodeId: true,
      levelId: true
    },
    take: 50000
  });

  const studentIds = students.map((student) => student.id);

  if (!studentIds.length) {
    return centers.map((center) => ({
      centerId: center.id,
      centerName: center.name,
      centerType: center.type,
      averageAccuracy: null,
      averagePromotionRate: 0,
      studentCount: 0
    }));
  }

  const [scores, promotions, rules] = await Promise.all([
    prisma.worksheetSubmission.findMany({
      where: {
        tenantId,
        studentId: {
          in: studentIds
        },
        score: { not: null }
      },
      select: {
        studentId: true,
        score: true
      },
      take: 100000
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId,
        action: "COURSE_ASSIGNMENT",
        entityId: {
          in: studentIds
        },
        ...(createdAt ? { createdAt } : {})
      },
      select: {
        entityId: true
      },
      take: 50000
    }),
    prisma.levelRule.findMany({
      where: {
        tenantId
      },
      select: {
        levelId: true,
        minPracticeAverage: true
      },
      take: 500
    })
  ]);

  const scoreByStudent = new Map();
  for (const row of scores) {
    if (!scoreByStudent.has(row.studentId)) {
      scoreByStudent.set(row.studentId, []);
    }
    scoreByStudent.get(row.studentId).push(Number(row.score));
  }

  const promotedStudentIds = new Set(
    promotions.map((row) => row.entityId).filter((entityId) => Boolean(entityId))
  );

  const minPracticeByLevel = new Map(
    rules.map((rule) => [rule.levelId, toNumber(rule.minPracticeAverage)])
  );

  const studentsByCenter = new Map();
  for (const student of students) {
    if (!studentsByCenter.has(student.hierarchyNodeId)) {
      studentsByCenter.set(student.hierarchyNodeId, []);
    }
    studentsByCenter.get(student.hierarchyNodeId).push(student);
  }

  return centers.map((center) => {
    const centerStudents = studentsByCenter.get(center.id) || [];
    const centerStudentIds = centerStudents.map((student) => student.id);

    const allScores = centerStudentIds.flatMap((studentId) => scoreByStudent.get(studentId) || []);
    const averageAccuracy = allScores.length
      ? round2(allScores.reduce((sum, score) => sum + score, 0) / allScores.length)
      : null;

    const promotedCount = centerStudentIds.filter((studentId) => promotedStudentIds.has(studentId)).length;

    const eligibleApproxCount = centerStudents.filter((student) => {
      const studentScores = scoreByStudent.get(student.id) || [];
      if (!studentScores.length) {
        return false;
      }

      const avg = studentScores.reduce((sum, score) => sum + score, 0) / studentScores.length;
      const minPractice = minPracticeByLevel.get(student.levelId);

      if (minPractice === null || minPractice === undefined) {
        return false;
      }

      return avg >= minPractice;
    }).length;

    const studentCount = centerStudents.length;
    const averagePromotionRate = studentCount
      ? round2((Math.max(promotedCount, eligibleApproxCount) / studentCount) * 100)
      : 0;

    return {
      centerId: center.id,
      centerName: center.name,
      centerType: center.type,
      averageAccuracy,
      averagePromotionRate,
      studentCount
    };
  });
}

export {
  getLevelDistribution,
  getPromotionRate,
  getCompetitionStats,
  getCenterPerformance
};
