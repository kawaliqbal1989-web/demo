import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

function toSafe(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  if (v === null || v === undefined) return 0;
  return Math.round(Number(v) * 100) / 100;
}

function studentName(row) {
  const f = row?.firstName ? String(row.firstName).trim() : "";
  const l = row?.lastName ? String(row.lastName).trim() : "";
  return `${f} ${l}`.trim();
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// â”€â”€ 1. Attendance Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getAttendanceAnalytics({ tenantId, centerId, batchId, teacherUserId, studentId, from, to, limit, offset }) {
  const conditions = [
    Prisma.sql`s.tenantId = ${tenantId}`,
    Prisma.sql`s.hierarchyNodeId = ${centerId}`
  ];
  if (batchId) conditions.push(Prisma.sql`ses.batchId = ${batchId}`);
  { const d = parseDate(from); if (d) conditions.push(Prisma.sql`ses.date >= ${d}`); }
  { const d = parseDate(to); if (d) conditions.push(Prisma.sql`ses.date <= ${d}`); }
  if (studentId) conditions.push(Prisma.sql`e.studentId = ${studentId}`);

  let teacherJoin = Prisma.sql``;
  if (teacherUserId) {
    teacherJoin = Prisma.sql`JOIN enrollment enr ON enr.studentId = e.studentId AND enr.tenantId = ${tenantId} AND enr.hierarchyNodeId = ${centerId} AND enr.status = 'ACTIVE' AND enr.assignedTeacherUserId = ${teacherUserId}`;
  }

  const where = Prisma.join(conditions, " AND ");

  const totalRows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(DISTINCT e.studentId) AS total
    FROM attendanceentry e
    JOIN attendancesession ses ON ses.id = e.sessionId AND ses.tenantId = e.tenantId
    JOIN student s ON s.id = e.studentId AND s.tenantId = e.tenantId
    ${teacherJoin}
    WHERE ${where}
  `);
  const total = toSafe(totalRows?.[0]?.total);

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      e.studentId,
      s.admissionNo,
      s.firstName,
      s.lastName,
      COUNT(DISTINCT ses.id) AS totalSessions,
      SUM(CASE WHEN e.status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS presentCount,
      SUM(CASE WHEN e.status = 'ABSENT' THEN 1 ELSE 0 END) AS absentCount,
      SUM(CASE WHEN e.status = 'LATE' THEN 1 ELSE 0 END) AS lateCount,
      SUM(CASE WHEN e.status = 'EXCUSED' THEN 1 ELSE 0 END) AS excusedCount,
      b.name AS batchName
    FROM attendanceentry e
    JOIN attendancesession ses ON ses.id = e.sessionId AND ses.tenantId = e.tenantId
    JOIN student s ON s.id = e.studentId AND s.tenantId = e.tenantId
    JOIN batch b ON b.id = ses.batchId
    ${teacherJoin}
    WHERE ${where}
    GROUP BY e.studentId, s.admissionNo, s.firstName, s.lastName, b.name
    ORDER BY presentCount DESC, s.admissionNo ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Summary
  const summaryRows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      COUNT(DISTINCT ses.id) AS totalSessions,
      SUM(CASE WHEN e.status IN ('PRESENT', 'LATE') THEN 1 ELSE 0 END) AS totalPresent,
      COUNT(*) AS totalEntries
    FROM attendanceentry e
    JOIN attendancesession ses ON ses.id = e.sessionId AND ses.tenantId = e.tenantId
    JOIN student s ON s.id = e.studentId AND s.tenantId = e.tenantId
    ${teacherJoin}
    WHERE ${where}
  `);

  const totalSessions = toSafe(summaryRows?.[0]?.totalSessions);
  const totalPresent = toSafe(summaryRows?.[0]?.totalPresent);
  const totalEntries = toSafe(summaryRows?.[0]?.totalEntries);
  const avgRate = totalEntries > 0 ? round2((totalPresent / totalEntries) * 100) : 0;

  // Per-student rates for 100% and below 75% counts
  let perfect100 = 0;
  let below75 = 0;
  const items = (Array.isArray(rows) ? rows : []).map((row) => {
    const ts = toSafe(row.totalSessions);
    const pc = toSafe(row.presentCount);
    const rate = ts > 0 ? round2((pc / ts) * 100) : 0;
    if (rate >= 100) perfect100++;
    if (rate < 75) below75++;
    return {
      studentId: String(row.studentId),
      admissionNo: row.admissionNo ? String(row.admissionNo) : null,
      studentName: studentName(row),
      batchName: row.batchName ? String(row.batchName) : null,
      totalSessions: ts,
      presentCount: pc,
      absentCount: toSafe(row.absentCount),
      lateCount: toSafe(row.lateCount),
      excusedCount: toSafe(row.excusedCount),
      attendanceRate: rate
    };
  });

  return {
    summary: { totalSessions, avgAttendanceRate: avgRate, perfect100Count: perfect100, below75Count: below75 },
    items,
    total,
    limit,
    offset
  };
}

// â”€â”€ 2. Worksheet Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getWorksheetAnalytics({ tenantId, centerId, batchId, teacherUserId, studentId, levelId, from, to, limit, offset }) {
  const conditions = [
    Prisma.sql`s.tenantId = ${tenantId}`,
    Prisma.sql`s.hierarchyNodeId = ${centerId}`,
    Prisma.sql`s.isActive = 1`
  ];
  if (levelId) conditions.push(Prisma.sql`s.levelId = ${levelId}`);
  if (studentId) conditions.push(Prisma.sql`s.id = ${studentId}`);

  let teacherFilter = Prisma.sql``;
  if (teacherUserId) {
    teacherFilter = Prisma.sql`AND s.currentTeacherUserId = ${teacherUserId}`;
  }

  let batchFilter = Prisma.sql``;
  if (batchId) {
    batchFilter = Prisma.sql`AND EXISTS (SELECT 1 FROM enrollment en WHERE en.studentId = s.id AND en.tenantId = ${tenantId} AND en.batchId = ${batchId} AND en.status = 'ACTIVE')`;
  }

  let dateFilter = Prisma.sql``;
  { const d = parseDate(from); if (d) dateFilter = Prisma.sql`${dateFilter} AND wa.assignedAt >= ${d}`; }
  { const d = parseDate(to); if (d) dateFilter = Prisma.sql`${dateFilter} AND wa.assignedAt <= ${d}`; }

  const where = Prisma.sql`${Prisma.join(conditions, " AND ")} ${teacherFilter} ${batchFilter}`;

  const totalRows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(DISTINCT s.id) AS total
    FROM student s
    LEFT JOIN worksheetassignment wa ON wa.studentId = s.id AND wa.tenantId = ${tenantId} AND wa.isActive = 1 ${dateFilter}
    WHERE ${where}
    AND wa.worksheetId IS NOT NULL
  `);
  const total = toSafe(totalRows?.[0]?.total);

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      s.id AS studentId,
      s.admissionNo,
      s.firstName,
      s.lastName,
      l.name AS levelName,
      COUNT(DISTINCT wa.worksheetId) AS assignedCount,
      COUNT(DISTINCT ws.worksheetId) AS completedCount,
      COALESCE(AVG(ws.score), 0) AS avgScore,
      COALESCE(MAX(ws.score), 0) AS bestScore,
      COALESCE(AVG(ws.completionTimeSeconds), 0) AS avgTime
    FROM student s
    LEFT JOIN level l ON l.id = s.levelId
    LEFT JOIN worksheetassignment wa ON wa.studentId = s.id AND wa.tenantId = ${tenantId} AND wa.isActive = 1 ${dateFilter}
    LEFT JOIN worksheetsubmission ws ON ws.studentId = s.id AND ws.worksheetId = wa.worksheetId AND ws.tenantId = ${tenantId}
    WHERE ${where}
    AND wa.worksheetId IS NOT NULL
    GROUP BY s.id, s.admissionNo, s.firstName, s.lastName, l.name
    ORDER BY avgScore DESC, s.admissionNo ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Summary
  const summaryRows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      COUNT(DISTINCT wa.worksheetId) AS totalAssigned,
      COUNT(DISTINCT CASE WHEN ws.id IS NOT NULL THEN CONCAT(wa.studentId, '-', wa.worksheetId) END) AS totalCompleted,
      COALESCE(AVG(ws.score), 0) AS avgAccuracy,
      COALESCE(AVG(ws.completionTimeSeconds), 0) AS avgTime
    FROM student s
    LEFT JOIN worksheetassignment wa ON wa.studentId = s.id AND wa.tenantId = ${tenantId} AND wa.isActive = 1 ${dateFilter}
    LEFT JOIN worksheetsubmission ws ON ws.studentId = s.id AND ws.worksheetId = wa.worksheetId AND ws.tenantId = ${tenantId}
    WHERE ${where}
    AND wa.worksheetId IS NOT NULL
  `);

  const items = (Array.isArray(rows) ? rows : []).map((row) => ({
    studentId: String(row.studentId),
    admissionNo: row.admissionNo ? String(row.admissionNo) : null,
    studentName: studentName(row),
    levelName: row.levelName ? String(row.levelName) : null,
    assignedCount: toSafe(row.assignedCount),
    completedCount: toSafe(row.completedCount),
    pendingCount: Math.max(0, toSafe(row.assignedCount) - toSafe(row.completedCount)),
    avgScore: round2(row.avgScore),
    bestScore: round2(row.bestScore),
    avgTimeSeconds: toSafe(row.avgTime)
  }));

  return {
    summary: {
      totalAssigned: toSafe(summaryRows?.[0]?.totalAssigned),
      totalCompleted: toSafe(summaryRows?.[0]?.totalCompleted),
      avgAccuracy: round2(summaryRows?.[0]?.avgAccuracy),
      avgTimeSeconds: toSafe(summaryRows?.[0]?.avgTime)
    },
    items,
    total,
    limit,
    offset
  };
}

// â”€â”€ 3. Mock Test Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getMockTestAnalytics({ tenantId, centerId, batchId, from, to, limit, offset }) {
  const conditions = [
    Prisma.sql`mt.tenantId = ${tenantId}`,
    Prisma.sql`mt.hierarchyNodeId = ${centerId}`
  ];
  if (batchId) conditions.push(Prisma.sql`mt.batchId = ${batchId}`);
  { const d = parseDate(from); if (d) conditions.push(Prisma.sql`mt.date >= ${d}`); }
  { const d = parseDate(to); if (d) conditions.push(Prisma.sql`mt.date <= ${d}`); }

  const where = Prisma.join(conditions, " AND ");

  const totalRows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(DISTINCT mt.id) AS total
    FROM MockTest mt
    WHERE ${where}
  `);
  const total = toSafe(totalRows?.[0]?.total);

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      mt.id AS mockTestId,
      mt.title,
      mt.date,
      mt.maxMarks,
      mt.status,
      b.name AS batchName,
      COUNT(DISTINCT mtr.studentId) AS studentsCount,
      COALESCE(AVG(mtr.marks), 0) AS avgMarks,
      COALESCE(MAX(mtr.marks), 0) AS maxObtainedMarks,
      SUM(CASE WHEN mtr.marks >= (mt.maxMarks * 0.5) THEN 1 ELSE 0 END) AS passCount
    FROM MockTest mt
    LEFT JOIN MockTestResult mtr ON mtr.mockTestId = mt.id AND mtr.tenantId = mt.tenantId
    LEFT JOIN Batch b ON b.id = mt.batchId
    WHERE ${where}
    GROUP BY mt.id, mt.title, mt.date, mt.maxMarks, mt.status, b.name
    ORDER BY mt.date DESC, mt.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Summary
  const summaryRows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      COUNT(DISTINCT mt.id) AS totalTests,
      COALESCE(AVG(mtr.marks), 0) AS avgScore,
      COUNT(DISTINCT mtr.studentId) AS totalStudentsTested,
      SUM(CASE WHEN mtr.marks >= (mt.maxMarks * 0.5) THEN 1 ELSE 0 END) AS totalPassed,
      COUNT(mtr.studentId) AS totalResults
    FROM MockTest mt
    LEFT JOIN MockTestResult mtr ON mtr.mockTestId = mt.id AND mtr.tenantId = mt.tenantId
    WHERE ${where}
  `);

  const totalPassed = toSafe(summaryRows?.[0]?.totalPassed);
  const totalResults = toSafe(summaryRows?.[0]?.totalResults);

  const items = (Array.isArray(rows) ? rows : []).map((row) => {
    const sc = toSafe(row.studentsCount);
    const pc = toSafe(row.passCount);
    return {
      mockTestId: String(row.mockTestId),
      title: row.title ? String(row.title) : null,
      date: row.date,
      maxMarks: toSafe(row.maxMarks),
      status: row.status ? String(row.status) : null,
      batchName: row.batchName ? String(row.batchName) : null,
      studentsCount: sc,
      avgMarks: round2(row.avgMarks),
      maxObtainedMarks: toSafe(row.maxObtainedMarks),
      passRate: sc > 0 ? round2((pc / sc) * 100) : 0
    };
  });

  return {
    summary: {
      totalTests: toSafe(summaryRows?.[0]?.totalTests),
      avgScore: round2(summaryRows?.[0]?.avgScore),
      overallPassRate: totalResults > 0 ? round2((totalPassed / totalResults) * 100) : 0,
      totalStudentsTested: toSafe(summaryRows?.[0]?.totalStudentsTested)
    },
    items,
    total,
    limit,
    offset
  };
}

// â”€â”€ 4. Exam Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getExamAnalytics({ tenantId, centerId, examCycleId, levelId, from, to, limit, offset }) {
  const conditions = [
    Prisma.sql`s.tenantId = ${tenantId}`,
    Prisma.sql`s.hierarchyNodeId = ${centerId}`
  ];
  if (examCycleId) conditions.push(Prisma.sql`ee.examCycleId = ${examCycleId}`);
  if (levelId) conditions.push(Prisma.sql`ee.enrolledLevelId = ${levelId}`);
  { const d = parseDate(from); if (d) conditions.push(Prisma.sql`ee.createdAt >= ${d}`); }
  { const d = parseDate(to); if (d) conditions.push(Prisma.sql`ee.createdAt <= ${d}`); }

  const where = Prisma.join(conditions, " AND ");

  const totalRows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(DISTINCT ee.id) AS total
    FROM ExamEnrollmentEntry ee
    JOIN Student s ON s.id = ee.studentId AND s.tenantId = ee.tenantId
    WHERE ${where}
  `);
  const total = toSafe(totalRows?.[0]?.total);

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      ee.id AS entryId,
      ee.studentId,
      s.admissionNo,
      s.firstName,
      s.lastName,
      l.name AS levelName,
      ec.name AS examCycleName,
      ec.code AS examCycleCode,
      ec.resultStatus,
      COALESCE(sub.avgScore, 0) AS avgScore,
      COALESCE(sub.totalAttempts, 0) AS totalAttempts
    FROM ExamEnrollmentEntry ee
    JOIN Student s ON s.id = ee.studentId AND s.tenantId = ee.tenantId
    JOIN ExamCycle ec ON ec.id = ee.examCycleId
    LEFT JOIN Level l ON l.id = ee.enrolledLevelId
    LEFT JOIN (
      SELECT
        ws2.studentId,
        w.examCycleId,
        AVG(ws2.score) AS avgScore,
        COUNT(ws2.id) AS totalAttempts
      FROM WorksheetSubmission ws2
      JOIN Worksheet w ON w.id = ws2.worksheetId AND w.tenantId = ws2.tenantId
      WHERE w.examCycleId IS NOT NULL AND ws2.tenantId = ${tenantId}
      GROUP BY ws2.studentId, w.examCycleId
    ) sub ON sub.studentId = ee.studentId AND sub.examCycleId = ee.examCycleId
    WHERE ${where}
    ORDER BY avgScore DESC, s.admissionNo ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Summary
  const summaryRows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      COUNT(DISTINCT ee.id) AS totalEnrolled,
      SUM(CASE WHEN ec.resultStatus = 'PUBLISHED' THEN 1 ELSE 0 END) AS resultsPublished,
      COALESCE(AVG(sub.avgScore), 0) AS avgScore
    FROM ExamEnrollmentEntry ee
    JOIN Student s ON s.id = ee.studentId AND s.tenantId = ee.tenantId
    JOIN ExamCycle ec ON ec.id = ee.examCycleId
    LEFT JOIN (
      SELECT ws2.studentId, w.examCycleId, AVG(ws2.score) AS avgScore
      FROM WorksheetSubmission ws2
      JOIN Worksheet w ON w.id = ws2.worksheetId AND w.tenantId = ws2.tenantId
      WHERE w.examCycleId IS NOT NULL AND ws2.tenantId = ${tenantId}
      GROUP BY ws2.studentId, w.examCycleId
    ) sub ON sub.studentId = ee.studentId AND sub.examCycleId = ee.examCycleId
    WHERE ${where}
  `);

  const items = (Array.isArray(rows) ? rows : []).map((row) => ({
    entryId: String(row.entryId),
    studentId: String(row.studentId),
    admissionNo: row.admissionNo ? String(row.admissionNo) : null,
    studentName: studentName(row),
    levelName: row.levelName ? String(row.levelName) : null,
    examCycleName: row.examCycleName ? String(row.examCycleName) : null,
    examCycleCode: row.examCycleCode ? String(row.examCycleCode) : null,
    resultStatus: row.resultStatus ? String(row.resultStatus) : null,
    avgScore: round2(row.avgScore),
    totalAttempts: toSafe(row.totalAttempts)
  }));

  return {
    summary: {
      totalEnrolled: toSafe(summaryRows?.[0]?.totalEnrolled),
      resultsPublished: toSafe(summaryRows?.[0]?.resultsPublished),
      avgScore: round2(summaryRows?.[0]?.avgScore)
    },
    items,
    total,
    limit,
    offset
  };
}

// â”€â”€ 5. Competition Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getCompetitionAnalytics({ tenantId, centerId, competitionId, levelId, from, to, limit, offset }) {
  const conditions = [
    Prisma.sql`s.tenantId = ${tenantId}`,
    Prisma.sql`s.hierarchyNodeId = ${centerId}`
  ];
  if (competitionId) conditions.push(Prisma.sql`ce.competitionId = ${competitionId}`);
  if (levelId) conditions.push(Prisma.sql`c.levelId = ${levelId}`);
  { const d = parseDate(from); if (d) conditions.push(Prisma.sql`c.startsAt >= ${d}`); }
  { const d = parseDate(to); if (d) conditions.push(Prisma.sql`c.endsAt <= ${d}`); }

  const where = Prisma.join(conditions, " AND ");

  const totalRows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM CompetitionEnrollment ce
    JOIN Student s ON s.id = ce.studentId AND s.tenantId = ce.tenantId
    JOIN Competition c ON c.id = ce.competitionId AND c.tenantId = ce.tenantId
    WHERE ${where}
  `);
  const total = toSafe(totalRows?.[0]?.total);

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      ce.competitionId,
      ce.studentId,
      s.admissionNo,
      s.firstName,
      s.lastName,
      c.title AS competitionTitle,
      l.name AS levelName,
      COALESCE(ce.totalScore, 0) AS totalScore,
      ce.\`rank\`,
      c.startsAt,
      c.endsAt
    FROM CompetitionEnrollment ce
    JOIN Student s ON s.id = ce.studentId AND s.tenantId = ce.tenantId
    JOIN Competition c ON c.id = ce.competitionId AND c.tenantId = ce.tenantId
    LEFT JOIN Level l ON l.id = c.levelId
    WHERE ${where}
    ORDER BY ce.totalScore DESC, ce.\`rank\` ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Summary
  const summaryRows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      COUNT(DISTINCT c.id) AS totalCompetitions,
      COUNT(*) AS totalEnrolled,
      COALESCE(AVG(ce.totalScore), 0) AS avgScore
    FROM CompetitionEnrollment ce
    JOIN Student s ON s.id = ce.studentId AND s.tenantId = ce.tenantId
    JOIN Competition c ON c.id = ce.competitionId AND c.tenantId = ce.tenantId
    WHERE ${where}
  `);

  const items = (Array.isArray(rows) ? rows : []).map((row) => ({
    competitionId: String(row.competitionId),
    studentId: String(row.studentId),
    admissionNo: row.admissionNo ? String(row.admissionNo) : null,
    studentName: studentName(row),
    competitionTitle: row.competitionTitle ? String(row.competitionTitle) : null,
    levelName: row.levelName ? String(row.levelName) : null,
    totalScore: round2(row.totalScore),
    rank: row.rank !== null && row.rank !== undefined ? toSafe(row.rank) : null,
    startsAt: row.startsAt,
    endsAt: row.endsAt
  }));

  return {
    summary: {
      totalCompetitions: toSafe(summaryRows?.[0]?.totalCompetitions),
      totalEnrolled: toSafe(summaryRows?.[0]?.totalEnrolled),
      avgScore: round2(summaryRows?.[0]?.avgScore)
    },
    items,
    total,
    limit,
    offset
  };
}

// â”€â”€ 6. Student Progress Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getStudentProgressAnalytics({ tenantId, centerId, batchId, teacherUserId, studentId, levelId, limit, offset }) {
  const conditions = [
    Prisma.sql`s.tenantId = ${tenantId}`,
    Prisma.sql`s.hierarchyNodeId = ${centerId}`,
    Prisma.sql`s.isActive = 1`
  ];
  if (levelId) conditions.push(Prisma.sql`s.levelId = ${levelId}`);
  if (studentId) conditions.push(Prisma.sql`s.id = ${studentId}`);
  if (teacherUserId) conditions.push(Prisma.sql`s.currentTeacherUserId = ${teacherUserId}`);

  let batchFilter = Prisma.sql``;
  if (batchId) {
    batchFilter = Prisma.sql`AND EXISTS (SELECT 1 FROM Enrollment en WHERE en.studentId = s.id AND en.tenantId = ${tenantId} AND en.batchId = ${batchId} AND en.status = 'ACTIVE')`;
  }

  const where = Prisma.sql`${Prisma.join(conditions, " AND ")} ${batchFilter}`;

  const totalRows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*) AS total FROM Student s WHERE ${where}
  `);
  const total = toSafe(totalRows?.[0]?.total);

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      s.id AS studentId,
      s.admissionNo,
      s.firstName,
      s.lastName,
      s.createdAt AS admissionDate,
      l.name AS levelName,
      l.rank AS levelRank,
      DATEDIFF(NOW(), COALESCE(
        (SELECT MAX(slph.createdAt) FROM StudentLevelProgressionHistory slph WHERE slph.studentId = s.id AND slph.tenantId = ${tenantId}),
        s.createdAt
      )) AS daysAtCurrentLevel,
      (SELECT COUNT(*) FROM WorksheetSubmission ws WHERE ws.studentId = s.id AND ws.tenantId = ${tenantId}) AS worksheetsDone,
      (SELECT COALESCE(AVG(ws.score), 0) FROM WorksheetSubmission ws WHERE ws.studentId = s.id AND ws.tenantId = ${tenantId}) AS avgScore,
      (SELECT COUNT(*) FROM StudentLevelProgressionHistory slph WHERE slph.studentId = s.id AND slph.tenantId = ${tenantId}) AS totalPromotions
    FROM Student s
    LEFT JOIN Level l ON l.id = s.levelId
    WHERE ${where}
    ORDER BY l.rank ASC, s.admissionNo ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  // Summary
  const summaryRows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      COUNT(*) AS totalStudents,
      COALESCE(AVG(l.rank), 0) AS avgLevel
    FROM Student s
    LEFT JOIN Level l ON l.id = s.levelId
    WHERE ${where}
  `);

  const now30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const promotedRows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(DISTINCT slph.studentId) AS cnt
    FROM StudentLevelProgressionHistory slph
    JOIN Student s ON s.id = slph.studentId AND s.tenantId = slph.tenantId
    WHERE slph.tenantId = ${tenantId}
      AND s.hierarchyNodeId = ${centerId}
      AND slph.createdAt >= ${now30}
  `);

  const items = (Array.isArray(rows) ? rows : []).map((row) => ({
    studentId: String(row.studentId),
    admissionNo: row.admissionNo ? String(row.admissionNo) : null,
    studentName: studentName(row),
    levelName: row.levelName ? String(row.levelName) : null,
    levelRank: toSafe(row.levelRank),
    daysAtCurrentLevel: toSafe(row.daysAtCurrentLevel),
    worksheetsDone: toSafe(row.worksheetsDone),
    avgScore: round2(row.avgScore),
    totalPromotions: toSafe(row.totalPromotions)
  }));

  return {
    summary: {
      totalStudents: toSafe(summaryRows?.[0]?.totalStudents),
      promotedLast30d: toSafe(promotedRows?.[0]?.cnt),
      avgLevel: round2(summaryRows?.[0]?.avgLevel)
    },
    items,
    total,
    limit,
    offset
  };
}

export {
  getAttendanceAnalytics,
  getWorksheetAnalytics,
  getMockTestAnalytics,
  getExamAnalytics,
  getCompetitionAnalytics,
  getStudentProgressAnalytics
};
