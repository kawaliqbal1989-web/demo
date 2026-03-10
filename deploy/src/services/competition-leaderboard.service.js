import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLimit(limit) {
  const parsed = Number(limit || 50);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.trunc(parsed), 500);
}

async function getCompetitionLeaderboard({ competitionId, tenantId, limit, skipApprovalCheck = false }) {
  const safeLimit = normalizeLimit(limit);

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

  const baseLeaderboardQuery = Prisma.sql`
    FROM CompetitionEnrollment ce
    INNER JOIN Student s
      ON s.id = ce.studentId
      AND s.tenantId = ce.tenantId
    INNER JOIN CompetitionWorksheet cw
      ON cw.competitionId = ce.competitionId
      AND cw.tenantId = ce.tenantId
    INNER JOIN WorksheetSubmission ws
      ON ws.worksheetId = cw.worksheetId
      AND ws.studentId = ce.studentId
      AND ws.tenantId = ce.tenantId
    WHERE ce.competitionId = ${competitionId}
      AND ce.tenantId = ${tenantId}
    GROUP BY ce.studentId, s.firstName, s.lastName
  `;

  // Index recommendation:
  // Add composite index on WorksheetSubmission(tenantId, studentId, worksheetId, submittedAt, score)
  // to optimize leaderboard joins and ORDER BY sort path.
  const leaderboardRows = await prisma.$queryRaw`
    SELECT
      ce.studentId AS studentId,
      CONCAT(s.firstName, ' ', s.lastName) AS studentName,
      ROUND(AVG(ws.score), 2) AS accuracy,
      TIMESTAMPDIFF(SECOND, MIN(ws.submittedAt), MAX(ws.submittedAt)) AS completionTime,
      MIN(ws.submittedAt) AS submittedAt
    ${baseLeaderboardQuery}
    ORDER BY accuracy DESC, completionTime ASC, submittedAt ASC
    LIMIT ${safeLimit}
  `;

  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(*) AS totalParticipants
    FROM (
      SELECT ce.studentId
      ${baseLeaderboardQuery}
    ) ranked
  `;

  const totalParticipants = toNumber(totalRows?.[0]?.totalParticipants) || 0;

  return {
    competitionId,
    totalParticipants,
    leaderboard: leaderboardRows.map((row, index) => ({
      rank: index + 1,
      studentId: row.studentId,
      studentName: row.studentName,
      accuracy: toNumber(row.accuracy),
      completionTime: toNumber(row.completionTime),
      submittedAt: row.submittedAt
    }))
  };
}

export { getCompetitionLeaderboard };
