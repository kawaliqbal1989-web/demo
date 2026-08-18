import { prisma } from "../lib/prisma.js";

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLimit(limit) {
  const parsed = Number(limit || 500);
  if (!Number.isFinite(parsed) || parsed <= 0) return 500;
  return Math.min(Math.trunc(parsed), 10000);
}

function participantName(student) {
  return [student?.firstName, student?.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function compareAttempts(left, right) {
  const leftScore = toNumber(left?.score) ?? 0;
  const rightScore = toNumber(right?.score) ?? 0;
  if (leftScore !== rightScore) return rightScore - leftScore;
  const leftTime = toNumber(left?.completionTimeSeconds) ?? Number.MAX_SAFE_INTEGER;
  const rightTime = toNumber(right?.completionTimeSeconds) ?? Number.MAX_SAFE_INTEGER;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return new Date(left?.finalSubmittedAt || left?.submittedAt || 0).getTime() -
    new Date(right?.finalSubmittedAt || right?.submittedAt || 0).getTime();
}

function rankLevelRows(rows) {
  const completed = rows.filter((row) => row.submissionId);
  const incomplete = rows.filter((row) => !row.submissionId);
  completed.sort((left, right) => {
    if (left.totalScore !== right.totalScore) return right.totalScore - left.totalScore;
    const leftTime = left.completionTimeSeconds ?? Number.MAX_SAFE_INTEGER;
    const rightTime = right.completionTimeSeconds ?? Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) return leftTime - rightTime;
    const timeDifference = new Date(left.submittedAt || 0).getTime() - new Date(right.submittedAt || 0).getTime();
    return timeDifference || String(left.participationId).localeCompare(String(right.participationId));
  });

  let previousTieKey = null;
  let previousRank = null;
  const ranked = completed.map((row, index) => {
    const tieKey = `${row.totalScore}:${row.completionTimeSeconds ?? "NULL"}`;
    const rank = tieKey === previousTieKey ? previousRank : index + 1;
    previousTieKey = tieKey;
    previousRank = rank;
    return { ...row, rank, status: "COMPLETED" };
  });
  return [
    ...ranked,
    ...incomplete
      .sort((left, right) => String(left.participationId).localeCompare(String(right.participationId)))
      .map((row) => ({ ...row, rank: null, status: "NOT_SUBMITTED" }))
  ];
}

async function loadCalculatedRows({
  tx,
  competitionId,
  tenantId,
  enrollmentWhere = {}
}) {
  const enrollments = await tx.competitionEnrollment.findMany({
    where: {
      tenantId,
      competitionId,
      isActive: true,
      approvedAt: { not: null },
      ...enrollmentWhere
    },
    orderBy: [{ competitionCourseLevelId: "asc" }, { enrolledAt: "asc" }],
    select: {
      id: true,
      studentId: true,
      isTemporary: true,
      competitionCourseLevelId: true,
      enrolledLevelId: true,
      enrolledAt: true,
      student: { select: { admissionNo: true, firstName: true, lastName: true } },
      hierarchyNode: { select: { id: true, code: true, name: true } },
      sourceTeacherUser: {
        select: {
          id: true,
          username: true,
          teacherProfile: { select: { fullName: true } }
        }
      },
      competitionCourseLevel: {
        select: {
          id: true,
          levelNumber: true,
          level: { select: { id: true, name: true, rank: true } },
          competitionCourse: { select: { id: true, code: true, name: true } }
        }
      }
    }
  });
  if (!enrollments.length) return [];

  const enrollmentById = new Map(enrollments.map((entry) => [entry.id, entry]));
  const participants = await tx.assessmentParticipant.findMany({
    where: {
      tenantId,
      sourceEntityType: "COMPETITION",
      sourceEntityId: { in: enrollments.map((entry) => entry.id) },
      includedInAssessment: true,
      participantStatus: "ACTIVE",
      assessmentVersion: {
        is: {
          versionStatus: "CURRENT",
          assessment: { is: { sourceSystem: "COMPETITION", sourceEntityId: competitionId } }
        }
      }
    },
    select: {
      sourceEntityId: true,
      sourceContainerId: true,
      studentId: true,
      levelId: true,
      assessmentVersion: {
        select: {
          id: true,
          assessment: { select: { activeVersionId: true } },
          papers: { select: { worksheetId: true, levelId: true, sourceListId: true, sourceStudentId: true } }
        }
      }
    }
  });

  const worksheetIds = new Set();
  const worksheetByEnrollmentId = new Map();
  for (const participant of participants) {
    const enrollment = enrollmentById.get(participant.sourceEntityId);
    if (!enrollment || participant.assessmentVersion?.assessment?.activeVersionId !== participant.assessmentVersion?.id) continue;
    const paper = (participant.assessmentVersion?.papers || []).find((candidate) =>
      candidate.levelId === participant.levelId &&
      (!candidate.sourceListId || candidate.sourceListId === participant.sourceContainerId) &&
      (!candidate.sourceStudentId || candidate.sourceStudentId === participant.studentId)
    );
    if (!paper?.worksheetId) continue;
    worksheetIds.add(paper.worksheetId);
    worksheetByEnrollmentId.set(enrollment.id, paper.worksheetId);
  }

  const submissions = worksheetIds.size
    ? await tx.worksheetSubmission.findMany({
        where: {
          tenantId,
          worksheetId: { in: [...worksheetIds] },
          studentId: { in: [...new Set(enrollments.map((entry) => entry.studentId))] },
          finalSubmittedAt: { not: null }
        },
        select: {
          id: true,
          worksheetId: true,
          studentId: true,
          attemptNo: true,
          score: true,
          completionTimeSeconds: true,
          submittedAt: true,
          finalSubmittedAt: true
        }
      })
    : [];

  const submissionsByStudentWorksheet = new Map();
  for (const submission of submissions) {
    const key = `${submission.studentId}:${submission.worksheetId}`;
    const list = submissionsByStudentWorksheet.get(key) || [];
    list.push(submission);
    submissionsByStudentWorksheet.set(key, list);
  }

  return enrollments.map((enrollment) => {
    const worksheetId = worksheetByEnrollmentId.get(enrollment.id) || null;
    const attempts = worksheetId
      ? submissionsByStudentWorksheet.get(`${enrollment.studentId}:${worksheetId}`) || []
      : [];
    const bestAttempt = attempts.sort(compareAttempts)[0] || null;
    const courseLevel = enrollment.competitionCourseLevel;
    return {
      participationId: enrollment.id,
      studentId: enrollment.studentId,
      admissionNo: enrollment.student?.admissionNo || null,
      studentName: participantName(enrollment.student),
      isTemporary: Boolean(enrollment.isTemporary),
      centerId: enrollment.hierarchyNode?.id || null,
      centerCode: enrollment.hierarchyNode?.code || null,
      centerName: enrollment.hierarchyNode?.name || null,
      sourceTeacherUserId: enrollment.sourceTeacherUser?.id || null,
      teacherName:
        enrollment.sourceTeacherUser?.teacherProfile?.fullName ||
        enrollment.sourceTeacherUser?.username ||
        null,
      competitionCourseLevelId: enrollment.competitionCourseLevelId,
      courseId: courseLevel?.competitionCourse?.id || null,
      courseCode: courseLevel?.competitionCourse?.code || null,
      courseName: courseLevel?.competitionCourse?.name || null,
      levelId: courseLevel?.level?.id || enrollment.enrolledLevelId,
      levelName: courseLevel?.level?.name || null,
      levelRank: courseLevel?.level?.rank ?? courseLevel?.levelNumber ?? null,
      worksheetId,
      submissionId: bestAttempt?.id || null,
      attemptNo: bestAttempt?.attemptNo ?? null,
      totalScore: bestAttempt ? toNumber(bestAttempt.score) ?? 0 : null,
      accuracy: bestAttempt ? toNumber(bestAttempt.score) ?? 0 : null,
      completionTimeSeconds: bestAttempt ? toNumber(bestAttempt.completionTimeSeconds) : null,
      completionTime: bestAttempt ? toNumber(bestAttempt.completionTimeSeconds) : null,
      submittedAt: bestAttempt?.finalSubmittedAt || null,
      enrolledAt: enrollment.enrolledAt
    };
  });
}

async function loadPublishedRows({
  tx,
  competitionId,
  tenantId,
  enrollmentWhere = {}
}) {
  const enrollments = await tx.competitionEnrollment.findMany({
    where: {
      tenantId,
      competitionId,
      isActive: true,
      approvedAt: { not: null },
      ...enrollmentWhere
    },
    orderBy: [{ competitionCourseLevelId: "asc" }, { rank: "asc" }, { enrolledAt: "asc" }],
    select: {
      id: true,
      studentId: true,
      isTemporary: true,
      competitionCourseLevelId: true,
      enrolledLevelId: true,
      enrolledAt: true,
      rank: true,
      totalScore: true,
      resultCompletionTimeSeconds: true,
      resultSubmissionId: true,
      resultCalculatedAt: true,
      student: { select: { admissionNo: true, firstName: true, lastName: true } },
      hierarchyNode: { select: { id: true, code: true, name: true } },
      sourceTeacherUser: {
        select: {
          id: true,
          username: true,
          teacherProfile: { select: { fullName: true } }
        }
      },
      competitionCourseLevel: {
        select: {
          levelNumber: true,
          level: { select: { id: true, name: true, rank: true } },
          competitionCourse: { select: { id: true, code: true, name: true } }
        }
      }
    }
  });
  return enrollments.map((enrollment) => ({
    participationId: enrollment.id,
    studentId: enrollment.studentId,
    admissionNo: enrollment.student?.admissionNo || null,
    studentName: participantName(enrollment.student),
    isTemporary: Boolean(enrollment.isTemporary),
    centerId: enrollment.hierarchyNode?.id || null,
    centerCode: enrollment.hierarchyNode?.code || null,
    centerName: enrollment.hierarchyNode?.name || null,
    sourceTeacherUserId: enrollment.sourceTeacherUser?.id || null,
    teacherName:
      enrollment.sourceTeacherUser?.teacherProfile?.fullName ||
      enrollment.sourceTeacherUser?.username ||
      null,
    competitionCourseLevelId: enrollment.competitionCourseLevelId,
    courseId: enrollment.competitionCourseLevel?.competitionCourse?.id || null,
    courseCode: enrollment.competitionCourseLevel?.competitionCourse?.code || null,
    courseName: enrollment.competitionCourseLevel?.competitionCourse?.name || null,
    levelId: enrollment.competitionCourseLevel?.level?.id || enrollment.enrolledLevelId,
    levelName: enrollment.competitionCourseLevel?.level?.name || null,
    levelRank: enrollment.competitionCourseLevel?.level?.rank ?? enrollment.competitionCourseLevel?.levelNumber ?? null,
    submissionId: enrollment.resultSubmissionId,
    totalScore: toNumber(enrollment.totalScore),
    accuracy: toNumber(enrollment.totalScore),
    completionTimeSeconds: enrollment.resultCompletionTimeSeconds,
    completionTime: enrollment.resultCompletionTimeSeconds,
    rank: enrollment.rank,
    status: enrollment.resultSubmissionId ? "COMPLETED" : "NOT_SUBMITTED",
    enrolledAt: enrollment.enrolledAt,
    resultCalculatedAt: enrollment.resultCalculatedAt
  }));
}

function buildLeaderboardPayload({ competitionId, rows, limit }) {
  const grouped = new Map();
  for (const row of rows) {
    const groupRows = grouped.get(row.competitionCourseLevelId) || [];
    groupRows.push(row);
    grouped.set(row.competitionCourseLevelId, groupRows);
  }
  const levels = [...grouped.values()].map((levelRows) => {
    const rankedRows = levelRows.some((row) => row.rank !== undefined)
      ? levelRows
      : rankLevelRows(levelRows);
    const first = rankedRows[0] || {};
    return {
      competitionCourseLevelId: first.competitionCourseLevelId,
      courseId: first.courseId,
      courseCode: first.courseCode,
      courseName: first.courseName,
      levelId: first.levelId,
      levelName: first.levelName,
      levelRank: first.levelRank,
      totalParticipants: rankedRows.length,
      completedParticipants: rankedRows.filter((row) => row.submissionId).length,
      leaderboard: rankedRows
    };
  }).sort((left, right) =>
    (Number(left.levelRank) || 0) - (Number(right.levelRank) || 0) ||
    String(left.courseName || "").localeCompare(String(right.courseName || ""))
  );
  const allRows = levels.flatMap((level) => level.leaderboard);
  return {
    competitionId,
    totalParticipants: allRows.length,
    completedParticipants: allRows.filter((row) => row.submissionId).length,
    levels,
    leaderboard: allRows.slice(0, normalizeLimit(limit))
  };
}

async function getCompetitionLeaderboard({
  competitionId,
  tenantId,
  limit,
  skipApprovalCheck = false,
  enrollmentWhere = {},
  tx = prisma
}) {
  const competition = await tx.competition.findFirst({
    where: { id: competitionId, tenantId, ...(skipApprovalCheck ? {} : { workflowStage: "APPROVED" }) },
    select: { id: true, resultStatus: true }
  });
  if (!competition) {
    const error = new Error("Competition not found or not approved");
    error.statusCode = 404;
    error.errorCode = "COMPETITION_NOT_APPROVED";
    throw error;
  }
  const rows = competition.resultStatus === "PUBLISHED"
    ? await loadPublishedRows({
        tx,
        competitionId,
        tenantId,
        enrollmentWhere
      })
    : await loadCalculatedRows({
        tx,
        competitionId,
        tenantId,
        enrollmentWhere
      });
  return buildLeaderboardPayload({ competitionId, rows, limit });
}

async function calculateAndPersistCompetitionResults({ competitionId, tenantId, tx = prisma }) {
  const rows = await loadCalculatedRows({ tx, competitionId, tenantId });
  const payload = buildLeaderboardPayload({ competitionId, rows, limit: 10000 });
  const calculatedAt = new Date();
  for (const row of payload.leaderboard) {
    await tx.competitionEnrollment.update({
      where: { id: row.participationId },
      data: {
        rank: row.rank,
        totalScore: row.totalScore,
        resultCompletionTimeSeconds: row.completionTimeSeconds,
        resultSubmissionId: row.submissionId,
        resultCalculatedAt: calculatedAt
      }
    });
  }
  return { ...payload, calculatedAt };
}

export { calculateAndPersistCompetitionResults, getCompetitionLeaderboard, rankLevelRows };
