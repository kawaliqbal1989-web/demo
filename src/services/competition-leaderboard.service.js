import { prisma } from "../lib/prisma.js";

function normalizeLimit(limit) {
  const parsed = Number(limit || 50);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.trunc(parsed), 500);
}

function toComparableNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toComparableDate(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function compareLeaderboardRows(left, right) {
  const leftEarned = toComparableNumber(left.earnedMarks, -Infinity);
  const rightEarned = toComparableNumber(right.earnedMarks, -Infinity);
  if (leftEarned !== rightEarned) return rightEarned - leftEarned;

  const leftPercentage = toComparableNumber(left.percentage, -Infinity);
  const rightPercentage = toComparableNumber(right.percentage, -Infinity);
  if (leftPercentage !== rightPercentage) return rightPercentage - leftPercentage;

  const leftCorrect = toComparableNumber(left.correctCount, -Infinity);
  const rightCorrect = toComparableNumber(right.correctCount, -Infinity);
  if (leftCorrect !== rightCorrect) return rightCorrect - leftCorrect;

  const leftWrong = toComparableNumber(left.wrongCount, Infinity);
  const rightWrong = toComparableNumber(right.wrongCount, Infinity);
  if (leftWrong !== rightWrong) return leftWrong - rightWrong;

  const leftDuration = toComparableNumber(left.durationSeconds, Infinity);
  const rightDuration = toComparableNumber(right.durationSeconds, Infinity);
  if (leftDuration !== rightDuration) return leftDuration - rightDuration;

  const leftSubmittedAt = toComparableDate(left.submittedAt, null);
  const rightSubmittedAt = toComparableDate(right.submittedAt, null);
  if (leftSubmittedAt && rightSubmittedAt) {
    if (leftSubmittedAt.getTime() !== rightSubmittedAt.getTime()) {
      return leftSubmittedAt.getTime() - rightSubmittedAt.getTime();
    }
  } else if (leftSubmittedAt || rightSubmittedAt) {
    return leftSubmittedAt ? -1 : 1;
  }

  return String(left.studentId || "").localeCompare(String(right.studentId || ""));
}

function assignRanks(rows) {
  let currentRank = 0;
  let previousKey = null;

  return rows.map((row, index) => {
    const rowKey = [
      row.earnedMarks ?? null,
      row.percentage ?? null,
      row.correctCount ?? null,
      row.wrongCount ?? null,
      row.durationSeconds ?? null,
      row.submittedAt ? new Date(row.submittedAt).toISOString() : null
    ].join("|");

    if (rowKey !== previousKey) {
      currentRank = index + 1;
      previousKey = rowKey;
    }

    return {
      ...row,
      rank: currentRank
    };
  });
}

function getAwardTypeForRank(rank) {
  if (rank === 1) return "GOLD";
  if (rank === 2) return "SILVER";
  if (rank === 3) return "BRONZE";
  return "PARTICIPATION";
}

async function getCompetitionLeaderboard({ competitionId, tenantId, limit, skipApprovalCheck = false, includeAll = false }) {
  const safeLimit = includeAll ? Number.MAX_SAFE_INTEGER : normalizeLimit(limit);

  const competitionWhere = { id: competitionId, tenantId };
  if (!skipApprovalCheck) {
    competitionWhere.workflowStage = "APPROVED";
  }

  const competition = await prisma.competition.findFirst({
    where: competitionWhere,
    select: { id: true }
  });

  if (!competition) {
    const error = new Error("Competition not found or not approved");
    error.statusCode = 404;
    error.errorCode = "COMPETITION_NOT_APPROVED";
    throw error;
  }

  const [enrollments, assignments] = await Promise.all([
    prisma.competitionEnrollment.findMany({
      where: {
        competitionId,
        tenantId,
        isActive: true
      },
      select: {
        studentId: true,
        levelId: true,
        level: {
          select: {
            id: true,
            name: true,
            rank: true
          }
        },
        awardType: true,
        awardFinalizedAt: true,
        awardFinalizedByUserId: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            hierarchyNodeId: true,
            hierarchyNode: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          }
        }
      }
    }),
    prisma.competitionWorksheetAssignment.findMany({
      where: {
        competitionId,
        tenantId,
        status: "SUBMITTED"
      },
      select: {
        worksheetId: true,
        studentId: true,
        startedAt: true,
        submittedAt: true,
        worksheet: {
          select: {
            id: true,
            title: true,
            levelId: true
          }
        }
      }
    })
  ]);

  const enrollmentByStudentId = new Map(
    enrollments.map((row) => [row.studentId, row])
  );
  const publishedAssignments = assignments.filter((row) => enrollmentByStudentId.has(row.studentId));
  const worksheetIds = [...new Set(publishedAssignments.map((row) => row.worksheetId).filter(Boolean))];
  const studentIds = [...new Set(publishedAssignments.map((row) => row.studentId).filter(Boolean))];

  const submissions = worksheetIds.length && studentIds.length
    ? await prisma.worksheetSubmission.findMany({
        where: {
          tenantId,
          worksheetId: { in: worksheetIds },
          studentId: { in: studentIds },
          status: "PUBLISHED",
          publishedAt: { not: null },
          finalSubmittedAt: { not: null }
        },
        select: {
          worksheetId: true,
          studentId: true,
          score: true,
          totalMarks: true,
          earnedMarks: true,
          percentage: true,
          correctCount: true,
          wrongCount: true,
          unansweredCount: true,
          totalQuestions: true,
          submittedAt: true,
          finalSubmittedAt: true,
          publishedAt: true,
          completionTimeSeconds: true
        }
      })
    : [];

  const submissionByKey = new Map(
    submissions.map((submission) => [`${submission.worksheetId}:${submission.studentId}`, submission])
  );

  const aggregatedByStudentLevel = new Map();
  for (const assignment of publishedAssignments) {
    const enrollment = enrollmentByStudentId.get(assignment.studentId);
    const submission = submissionByKey.get(`${assignment.worksheetId}:${assignment.studentId}`);

    if (!enrollment || !submission) {
      continue;
    }

    const levelId = enrollment.levelId || assignment.worksheet?.levelId || null;
    if (!levelId) {
      continue;
    }

    const key = `${assignment.studentId}:${levelId}`;
    const current = aggregatedByStudentLevel.get(key) || {
      studentId: assignment.studentId,
      levelId,
      studentName: `${enrollment.student?.firstName || ""} ${enrollment.student?.lastName || ""}`.trim() || assignment.studentId,
      admissionNo: enrollment.student?.admissionNo || null,
      centerId: enrollment.student?.hierarchyNodeId || null,
      centerName: enrollment.student?.hierarchyNode?.name || null,
      centerCode: enrollment.student?.hierarchyNode?.code || null,
      level: enrollment.level || (assignment.worksheet?.levelId ? { id: assignment.worksheet.levelId, name: assignment.worksheet.levelId, rank: null } : null),
      earnedMarks: 0,
      totalMarks: 0,
      percentage: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 0,
      durationSeconds: 0,
      submittedAt: null,
      worksheetCount: 0,
      awardType: enrollment.awardType || null,
      awardFinalizedAt: enrollment.awardFinalizedAt || null,
      awardFinalizedByUserId: enrollment.awardFinalizedByUserId || null
    };

    const earnedMarks = toComparableNumber(submission.earnedMarks, 0) ?? 0;
    const totalMarks = toComparableNumber(submission.totalMarks, 0) ?? 0;
    const correctCount = toComparableNumber(submission.correctCount, 0) ?? 0;
    const wrongCount = toComparableNumber(submission.wrongCount, 0) ?? 0;
    const unansweredCount = toComparableNumber(submission.unansweredCount, 0) ?? 0;
    const submittedAt = assignment.submittedAt || submission.finalSubmittedAt || submission.submittedAt || null;
    const startedAt = assignment.startedAt || null;
    const durationFromTimestamps = startedAt && submittedAt
      ? Math.max(0, Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000))
      : toComparableNumber(submission.completionTimeSeconds, null);

    current.earnedMarks += earnedMarks;
    current.totalMarks += totalMarks;
    current.correctCount += correctCount;
    current.wrongCount += wrongCount;
    current.unansweredCount += unansweredCount;
    current.durationSeconds += durationFromTimestamps === null ? 0 : durationFromTimestamps;
    current.worksheetCount += 1;
    current.submittedAt = current.submittedAt
      ? (submittedAt && new Date(submittedAt) < new Date(current.submittedAt) ? submittedAt : current.submittedAt)
      : submittedAt;
    current.percentage = current.totalMarks > 0 ? Number(((current.earnedMarks / current.totalMarks) * 100).toFixed(2)) : 0;

    aggregatedByStudentLevel.set(key, current);
  }

  const overallRows = assignRanks(
    [...aggregatedByStudentLevel.values()]
      .sort(compareLeaderboardRows)
      .slice(0, safeLimit)
  ).map((row) => ({
    ...row,
    score: row.earnedMarks,
    completionTime: row.durationSeconds,
    previewAwardType: getAwardTypeForRank(row.rank),
    awardIsFinalized: Boolean(row.awardFinalizedAt)
  }));

  const levelGroups = new Map();
  for (const row of aggregatedByStudentLevel.values()) {
    const levelKey = row.levelId;
    const bucket = levelGroups.get(levelKey) || [];
    bucket.push(row);
    levelGroups.set(levelKey, bucket);
  }

  const levelLeaderboards = [...levelGroups.entries()].map(([levelId, rows]) => {
    const levelMeta = rows[0]?.level || null;
    const ranked = assignRanks(rows.sort(compareLeaderboardRows)).map((row) => ({
      ...row,
      score: row.earnedMarks,
      completionTime: row.durationSeconds,
      previewAwardType: getAwardTypeForRank(row.rank),
      awardIsFinalized: Boolean(row.awardFinalizedAt)
    }));

    return {
      levelId,
      levelName: levelMeta?.name || levelId,
      levelRank: levelMeta?.rank ?? null,
      totalParticipants: ranked.length,
      leaderboard: ranked.slice(0, safeLimit)
    };
  }).sort((left, right) => {
    const leftRank = toComparableNumber(left.levelRank, Infinity);
    const rightRank = toComparableNumber(right.levelRank, Infinity);
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return String(left.levelName || "").localeCompare(String(right.levelName || ""));
  });

  const totalParticipants = aggregatedByStudentLevel.size;

  return {
    competitionId,
    totalParticipants,
    leaderboard: overallRows,
    levelLeaderboards
  };
}

export { getAwardTypeForRank, getCompetitionLeaderboard };
