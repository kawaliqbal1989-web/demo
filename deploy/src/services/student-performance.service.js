import { prisma } from "../lib/prisma.js";

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values) {
  if (!values.length) {
    return null;
  }

  const sum = values.reduce((total, value) => total + value, 0);
  return sum / values.length;
}

function round2(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

function calculateAverageMinutesBetweenSubmissions(submissions) {
  if (submissions.length < 2) {
    return null;
  }

  const sortedAsc = [...submissions].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
  );

  const gapsInMinutes = [];

  for (let index = 1; index < sortedAsc.length; index += 1) {
    const current = new Date(sortedAsc[index].submittedAt).getTime();
    const previous = new Date(sortedAsc[index - 1].submittedAt).getTime();
    const gapMinutes = (current - previous) / (1000 * 60);

    if (gapMinutes >= 0) {
      gapsInMinutes.push(gapMinutes);
    }
  }

  return round2(average(gapsInMinutes));
}

async function getLevelPerformance(studentId, levelId, tenantId) {
  const [aggregateStats, recentAttempts] = await Promise.all([
    prisma.worksheetSubmission.aggregate({
      where: {
        tenantId,
        studentId,
        worksheet: {
          levelId
        }
      },
      _count: {
        _all: true
      },
      _max: {
        score: true
      }
    }),
    prisma.worksheetSubmission.findMany({
      where: {
        tenantId,
        studentId,
        worksheet: {
          levelId
        }
      },
      orderBy: {
        submittedAt: "desc"
      },
      take: 10,
      select: {
        score: true,
        submittedAt: true
      }
    })
  ]);

  const scoredRecent = recentAttempts
    .map((attempt) => toNumber(attempt.score))
    .filter((score) => score !== null);

  const lastFiveScores = scoredRecent.slice(0, 5);
  const previousFiveScores = scoredRecent.slice(5, 10);

  const averageAccuracyLast5 = round2(average(lastFiveScores));
  const previousFiveAverage = average(previousFiveScores);

  let improvementTrendPercentage = null;

  if (averageAccuracyLast5 !== null && previousFiveAverage !== null && previousFiveAverage !== 0) {
    improvementTrendPercentage = round2(
      ((averageAccuracyLast5 - previousFiveAverage) / previousFiveAverage) * 100
    );
  } else if (averageAccuracyLast5 !== null && previousFiveAverage === null) {
    improvementTrendPercentage = 0;
  }

  return {
    levelId,
    averageAccuracyLast5,
    averageTimePerWorksheet: calculateAverageMinutesBetweenSubmissions(recentAttempts.slice(0, 5)),
    totalAttempts: aggregateStats._count._all,
    bestScore: toNumber(aggregateStats._max.score),
    improvementTrendPercentage
  };
}

async function getImprovementTrend(studentId, tenantId) {
  const attempts = await prisma.worksheetSubmission.findMany({
    where: {
      tenantId,
      studentId
    },
    orderBy: {
      submittedAt: "desc"
    },
    select: {
      score: true,
      submittedAt: true,
      worksheet: {
        select: {
          levelId: true
        }
      }
    }
  });

  const groupedByLevel = new Map();

  for (const attempt of attempts) {
    const levelId = attempt.worksheet.levelId;

    if (!groupedByLevel.has(levelId)) {
      groupedByLevel.set(levelId, []);
    }

    groupedByLevel.get(levelId).push(attempt);
  }

  const trends = [];

  for (const [levelId, entries] of groupedByLevel.entries()) {
    const scoredEntries = entries
      .map((entry) => ({
        score: toNumber(entry.score),
        submittedAt: entry.submittedAt
      }))
      .filter((entry) => entry.score !== null);

    const lastFiveScores = scoredEntries.slice(0, 5).map((entry) => entry.score);
    const previousFiveScores = scoredEntries.slice(5, 10).map((entry) => entry.score);

    const accuracyLast = average(lastFiveScores);
    const accuracyPrev = average(previousFiveScores);

    let accuracyTrendPercentage = null;

    if (accuracyLast !== null && accuracyPrev !== null && accuracyPrev !== 0) {
      accuracyTrendPercentage = round2(((accuracyLast - accuracyPrev) / accuracyPrev) * 100);
    } else if (accuracyLast !== null && accuracyPrev === null) {
      accuracyTrendPercentage = 0;
    }

    const lastFiveEntries = entries.slice(0, 5);
    const previousFiveEntries = entries.slice(5, 10);

    const timeLast = calculateAverageMinutesBetweenSubmissions(lastFiveEntries);
    const timePrev = calculateAverageMinutesBetweenSubmissions(previousFiveEntries);

    let timeTrendPercentage = null;

    if (timeLast !== null && timePrev !== null && timePrev !== 0) {
      timeTrendPercentage = round2(((timePrev - timeLast) / timePrev) * 100);
    } else if (timeLast !== null && timePrev === null) {
      timeTrendPercentage = 0;
    }

    trends.push({
      levelId,
      accuracyTrendPercentage,
      timeTrendPercentage
    });
  }

  return trends;
}

export { getLevelPerformance, getImprovementTrend };
