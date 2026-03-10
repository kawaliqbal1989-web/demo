import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

/**
 * GET /student/leaderboard
 * Returns top students in the same center, ranked by avg worksheet score.
 * Scope: same tenantId + centerId as the requesting student.
 */
const getStudentLeaderboard = asyncHandler(async (req, res) => {
  const { tenantId, hierarchyNodeId, id: studentId } = req.student;

  if (!hierarchyNodeId) {
    return res.apiSuccess("Leaderboard", { leaderboard: [], myRank: null });
  }

  // Top 50 students in the same center by average worksheet score
  const rows = await prisma.$queryRaw`
    SELECT
      s.id            AS studentId,
      TRIM(CONCAT(COALESCE(s.firstName,''), ' ', COALESCE(s.lastName,''))) AS studentName,
      s.photoUrl      AS photoUrl,
      ROUND(AVG(ws.score), 1)     AS avgScore,
      COUNT(ws.id)                AS totalSubmissions,
      MAX(ws.finalSubmittedAt)    AS lastSubmittedAt
    FROM Student s
    INNER JOIN WorksheetSubmission ws
      ON ws.studentId = s.id
      AND ws.tenantId = s.tenantId
      AND ws.finalSubmittedAt IS NOT NULL
      AND ws.score IS NOT NULL
    WHERE s.tenantId = ${tenantId}
      AND s.hierarchyNodeId = ${hierarchyNodeId}
      AND s.isActive = true
    GROUP BY s.id, s.firstName, s.lastName, s.photoUrl
    HAVING COUNT(ws.id) >= 1
    ORDER BY avgScore DESC, totalSubmissions DESC
    LIMIT 50
  `;

  const leaderboard = (rows || []).map((row, i) => ({
    rank: i + 1,
    studentId: row.studentId,
    studentName: row.studentName?.trim() || "Unknown",
    photoUrl: row.photoUrl || null,
    avgScore: Number(row.avgScore) || 0,
    totalSubmissions: Number(row.totalSubmissions) || 0,
    isMe: row.studentId === studentId
  }));

  const myEntry = leaderboard.find((e) => e.isMe);

  return res.apiSuccess("Leaderboard", {
    leaderboard,
    myRank: myEntry?.rank || null,
    myScore: myEntry?.avgScore || null,
    totalStudents: leaderboard.length
  });
});

export { getStudentLeaderboard };
