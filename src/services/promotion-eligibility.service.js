import { prisma } from "../lib/prisma.js";

function getDbClient(dbClient) {
  return dbClient || prisma;
}

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function calculatePracticeAverage(studentId, levelId, tenantId, dbClient) {
  const db = getDbClient(dbClient);
  const submissions = await db.worksheetSubmission.findMany({
    where: {
      tenantId,
      studentId,
      score: { not: null },
      worksheet: {
        levelId
      }
    },
    select: {
      score: true
    }
  });

  if (!submissions.length) {
    return null;
  }

  const total = submissions.reduce((sum, item) => sum + Number(item.score), 0);
  return round2(total / submissions.length);
}

async function calculateConsistencyScore(studentId, levelId, tenantId, dbClient) {
  const db = getDbClient(dbClient);
  const submissions = await db.worksheetSubmission.findMany({
    where: {
      tenantId,
      studentId,
      score: { not: null },
      worksheet: {
        levelId
      }
    },
    orderBy: {
      submittedAt: "desc"
    },
    take: 10,
    select: {
      score: true
    }
  });

  if (!submissions.length) {
    return null;
  }

  const scores = submissions.map((item) => Number(item.score));
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance =
    scores.reduce((sum, score) => sum + (score - mean) * (score - mean), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  const consistency = clamp(100 - stdDev * 2, 0, 100);
  return round2(consistency);
}

async function calculateExamScore(studentId, levelId, tenantId, dbClient) {
  const db = getDbClient(dbClient);
  const enrollment = await db.competitionEnrollment.findFirst({
    where: {
      tenantId,
      studentId,
      totalScore: { not: null },
      competition: {
        levelId
      }
    },
    orderBy: {
      enrolledAt: "desc"
    },
    select: {
      totalScore: true
    }
  });

  return enrollment ? round2(Number(enrollment.totalScore)) : null;
}

async function calculateAccuracy(studentId, levelId, tenantId, dbClient) {
  const practiceAverage = await calculatePracticeAverage(studentId, levelId, tenantId, dbClient);

  if (practiceAverage === null) {
    return null;
  }

  return round2(clamp(practiceAverage, 0, 100));
}

async function evaluatePromotionEligibility(studentId, levelId, tenantId, dbClient) {
  const db = getDbClient(dbClient);
  const [rule, practiceAverage, consistency, examScore, accuracy, attempts] = await Promise.all([
    db.levelRule.findUnique({
      where: {
        tenantId_levelId: {
          tenantId,
          levelId
        }
      }
    }),
    calculatePracticeAverage(studentId, levelId, tenantId, db),
    calculateConsistencyScore(studentId, levelId, tenantId, db),
    calculateExamScore(studentId, levelId, tenantId, db),
    calculateAccuracy(studentId, levelId, tenantId, db),
    db.worksheetSubmission.count({
      where: {
        tenantId,
        studentId,
        worksheet: {
          levelId
        }
      }
    })
  ]);

  const reasons = [];

  if (!rule) {
    reasons.push("No level rule configured for this level");

    return {
      eligible: false,
      reasons,
      metrics: {
        practiceAverage,
        consistency,
        examScore,
        accuracy
      }
    };
  }

  const minPracticeAverage = toNumber(rule.minPracticeAverage);
  const minExamScore = toNumber(rule.minExamScore);
  const minAccuracy = toNumber(rule.minAccuracy);
  const minConsistencyScore = toNumber(rule.minConsistencyScore);

  if (minPracticeAverage !== null && (practiceAverage === null || practiceAverage < minPracticeAverage)) {
    reasons.push(`Practice average below threshold (${minPracticeAverage})`);
  }

  if (minExamScore !== null && (examScore === null || examScore < minExamScore)) {
    reasons.push(`Exam score below threshold (${minExamScore})`);
  }

  if (minAccuracy !== null && (accuracy === null || accuracy < minAccuracy)) {
    reasons.push(`Accuracy below threshold (${minAccuracy})`);
  }

  if (
    minConsistencyScore !== null &&
    (consistency === null || consistency < minConsistencyScore)
  ) {
    reasons.push(`Consistency score below threshold (${minConsistencyScore})`);
  }

  if (rule.maxAttemptsAllowed !== null && attempts > rule.maxAttemptsAllowed) {
    reasons.push(`Attempts exceeded allowed maximum (${rule.maxAttemptsAllowed})`);
  }

  if (reasons.length && rule.allowTeacherOverride) {
    reasons.push("Teacher override is allowed by level rule");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    metrics: {
      practiceAverage,
      consistency,
      examScore,
      accuracy
    }
  };
}

export {
  calculatePracticeAverage,
  calculateConsistencyScore,
  calculateExamScore,
  evaluatePromotionEligibility
};
