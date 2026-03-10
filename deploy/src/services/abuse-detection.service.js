function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function detectAndFlagAbuse({
  tx,
  tenantId,
  studentId,
  worksheetId,
  submissionTime,
  completionTimeSeconds,
  score,
  totalQuestions
}) {
  const now = submissionTime || new Date();
  const rapidWindowStart = new Date(now.getTime() - 60 * 1000);
  const competitionWindowStart = new Date(now.getTime() - 2 * 60 * 1000);

  const [rapidCount, recentFiveScores, competitionSubmissionCount] = await Promise.all([
    tx.worksheetSubmission.count({
      where: {
        tenantId,
        studentId,
        submittedAt: {
          gte: rapidWindowStart,
          lte: now
        }
      }
    }),
    tx.worksheetSubmission.findMany({
      where: {
        tenantId,
        studentId,
        score: { not: null }
      },
      orderBy: {
        submittedAt: "desc"
      },
      take: 5,
      select: {
        score: true
      }
    }),
    tx.worksheetSubmission.count({
      where: {
        tenantId,
        studentId,
        submittedAt: {
          gte: competitionWindowStart,
          lte: now
        },
        worksheet: {
          competitionWorksheets: {
            some: {}
          }
        }
      }
    })
  ]);

  const flagsToCreate = [];

  if (rapidCount > 5) {
    flagsToCreate.push({
      tenantId,
      studentId,
      flagType: "RAPID_SUBMISSION",
      metadata: {
        submissionCountIn60s: rapidCount,
        windowSeconds: 60,
        worksheetId
      }
    });
  }

  if (recentFiveScores.length === 5 && recentFiveScores.every((entry) => Number(entry.score) >= 100)) {
    flagsToCreate.push({
      tenantId,
      studentId,
      flagType: "PERFECT_STREAK",
      metadata: {
        streakLength: 5,
        worksheetId
      }
    });
  }

  if (completionTimeSeconds !== null && completionTimeSeconds !== undefined && totalQuestions) {
    const theoreticalMinimumSeconds = totalQuestions * 2;
    if (completionTimeSeconds < theoreticalMinimumSeconds) {
      flagsToCreate.push({
        tenantId,
        studentId,
        flagType: "TIME_ANOMALY",
        metadata: {
          worksheetId,
          completionTimeSeconds,
          theoreticalMinimumSeconds,
          totalQuestions
        }
      });
    }
  }

  if (competitionSubmissionCount >= 3) {
    flagsToCreate.push({
      tenantId,
      studentId,
      flagType: "COMPETITION_SPIKE",
      metadata: {
        submissionCount: competitionSubmissionCount,
        windowSeconds: 120,
        worksheetId
      }
    });
  }

  if (flagsToCreate.length) {
    const createdFlags = await Promise.all(
      flagsToCreate.map((flag) =>
        tx.abuseFlag.create({
          data: flag,
          select: {
            id: true,
            flagType: true,
            createdAt: true,
            metadata: true
          }
        })
      )
    );

    return {
      flagsCreated: createdFlags.length,
      createdFlags,
      score: toNumber(score)
    };
  }

  return {
    flagsCreated: flagsToCreate.length,
    createdFlags: [],
    score: toNumber(score)
  };
}

export { detectAndFlagAbuse };
