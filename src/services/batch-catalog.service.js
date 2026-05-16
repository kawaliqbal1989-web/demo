import { Prisma } from "../lib/prisma-compat.js";
import { prisma } from "../lib/prisma.js";
import { calculateOccupancy } from "../utils/batch-catalog-query.js";

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSortExpression(sortBy) {
  switch (sortBy) {
    case "name":
      return Prisma.sql`b.name`;
    case "status":
      return Prisma.sql`b.status`;
    case "studentCount":
      return Prisma.sql`currentStudents`;
    case "teacherName":
      return Prisma.sql`primaryTeacherName`;
    case "levelRank":
      return Prisma.sql`levelRank`;
    case "modality":
      return Prisma.sql`b.modality`;
    case "occupancyPercentage":
      return Prisma.sql`occupancyPercentage`;
    case "maxStudents":
      return Prisma.sql`b.maxStudents`;
    case "createdAt":
    default:
      return Prisma.sql`b.createdAt`;
  }
}

async function fetchTeacherAssignments(tenantId, batchIds) {
  if (!batchIds.length) {
    return new Map();
  }

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      bta.batchId,
      au.id AS teacherId,
      au.username,
      au.email,
      au.isActive,
      tp.fullName
    FROM batchteacherassignment bta
    JOIN authuser au ON au.id = bta.teacherUserId
    LEFT JOIN teacherprofile tp ON tp.authUserId = au.id
    WHERE bta.tenantId = ${tenantId}
      AND bta.batchId IN (${Prisma.join(batchIds)})
    ORDER BY COALESCE(tp.fullName, au.username, au.email) ASC
  `);

  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const batchId = String(row.batchId);
    const current = map.get(batchId) || [];
    current.push({
      teacher: {
        id: String(row.teacherId),
        username: row.username ? String(row.username) : null,
        email: row.email ? String(row.email) : null,
        isActive: Boolean(row.isActive),
        teacherProfile: row.fullName ? { fullName: String(row.fullName) } : null
      }
    });
    map.set(batchId, current);
  }

  return map;
}

async function listBatchCatalog({ tenantId, actor, query }) {
  const centerId = actor.role !== "SUPERADMIN" ? actor.hierarchyNodeId : (query.centerId || null);

  const joins = Prisma.sql`
    LEFT JOIN level l ON l.id = b.levelId
    LEFT JOIN authuser ptu ON ptu.id = b.primaryTeacherUserId
    LEFT JOIN teacherprofile ptp ON ptp.authUserId = ptu.id
    LEFT JOIN (
      SELECT e.batchId, COUNT(*) AS currentStudents
      FROM enrollment e
      WHERE e.tenantId = ${tenantId}
        AND e.status = 'ACTIVE'
      GROUP BY e.batchId
    ) stats ON stats.batchId = b.id
    LEFT JOIN (
      SELECT
        s.batchId,
        GROUP_CONCAT(
          CONCAT(
            CASE s.dayOfWeek
              WHEN 0 THEN 'Sun'
              WHEN 1 THEN 'Mon'
              WHEN 2 THEN 'Tue'
              WHEN 3 THEN 'Wed'
              WHEN 4 THEN 'Thu'
              WHEN 5 THEN 'Fri'
              ELSE 'Sat'
            END,
            ' ',
            LPAD(FLOOR(s.startTime / 60), 2, '0'), ':', LPAD(MOD(s.startTime, 60), 2, '0'),
            '-',
            LPAD(FLOOR(s.endTime / 60), 2, '0'), ':', LPAD(MOD(s.endTime, 60), 2, '0')
          )
          ORDER BY s.dayOfWeek, s.startTime SEPARATOR ' | '
        ) AS scheduleSummary,
        MAX(CASE WHEN s.dayOfWeek IN (0, 6) THEN 1 ELSE 0 END) AS hasWeekend,
        MAX(CASE WHEN s.dayOfWeek BETWEEN 1 AND 5 THEN 1 ELSE 0 END) AS hasWeekday
      FROM batchscheduleslot s
      WHERE s.tenantId = ${tenantId}
      GROUP BY s.batchId
    ) sched ON sched.batchId = b.id
  `;

  const conditions = [
    Prisma.sql`b.tenantId = ${tenantId}`,
    Prisma.sql`b.deletedAt IS NULL`
  ];

  if (centerId) {
    conditions.push(Prisma.sql`b.hierarchyNodeId = ${centerId}`);
  }

  if (query.statuses.length) {
    conditions.push(Prisma.sql`b.status IN (${Prisma.join(query.statuses)})`);
  } else if (!query.includeArchived) {
    conditions.push(Prisma.sql`b.status <> 'ARCHIVED'`);
  }

  if (query.modality) {
    conditions.push(Prisma.sql`b.modality = ${query.modality}`);
  }

  if (query.levelId) {
    conditions.push(Prisma.sql`b.levelId = ${query.levelId}`);
  }

  if (query.teacherId) {
    conditions.push(Prisma.sql`(
      b.primaryTeacherUserId = ${query.teacherId}
      OR EXISTS (
        SELECT 1
        FROM batchteacherassignment teacher_filter
        WHERE teacher_filter.tenantId = ${tenantId}
          AND teacher_filter.batchId = b.id
          AND teacher_filter.teacherUserId = ${query.teacherId}
      )
    )`);
  }

  if (query.assignedOnly === true && actor.role === "TEACHER") {
    conditions.push(Prisma.sql`(
      b.primaryTeacherUserId = ${actor.userId}
      OR EXISTS (
        SELECT 1
        FROM batchteacherassignment assigned
        WHERE assigned.tenantId = ${tenantId}
          AND assigned.batchId = b.id
          AND assigned.teacherUserId = ${actor.userId}
      )
    )`);
  }

  if (query.hasTeacher === true) {
    conditions.push(Prisma.sql`(
      b.primaryTeacherUserId IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM batchteacherassignment teacher_exists
        WHERE teacher_exists.tenantId = ${tenantId}
          AND teacher_exists.batchId = b.id
      )
    )`);
  }

  if (query.hasTeacher === false) {
    conditions.push(Prisma.sql`(
      b.primaryTeacherUserId IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM batchteacherassignment teacher_exists
        WHERE teacher_exists.tenantId = ${tenantId}
          AND teacher_exists.batchId = b.id
      )
    )`);
  }

  if (query.dayType === "WEEKEND") {
    conditions.push(Prisma.sql`COALESCE(sched.hasWeekend, 0) = 1`);
  }

  if (query.dayType === "WEEKDAY") {
    conditions.push(Prisma.sql`COALESCE(sched.hasWeekday, 0) = 1`);
  }

  if (query.fullOnly) {
    conditions.push(Prisma.sql`b.maxStudents IS NOT NULL AND b.maxStudents > 0 AND COALESCE(stats.currentStudents, 0) >= b.maxStudents`);
  }

  if (query.q) {
    const like = `%${query.q}%`;
    conditions.push(Prisma.sql`(
      b.name LIKE ${like}
      OR COALESCE(ptp.fullName, ptu.username, ptu.email, '') LIKE ${like}
      OR COALESCE(l.name, '') LIKE ${like}
      OR COALESCE(b.modality, '') LIKE ${like}
      OR EXISTS (
        SELECT 1
        FROM batchteacherassignment search_bta
        JOIN authuser search_au ON search_au.id = search_bta.teacherUserId
        LEFT JOIN teacherprofile search_tp ON search_tp.authUserId = search_au.id
        WHERE search_bta.tenantId = ${tenantId}
          AND search_bta.batchId = b.id
          AND COALESCE(search_tp.fullName, search_au.username, search_au.email, '') LIKE ${like}
      )
    )`);
  }

  const whereSql = Prisma.join(conditions, " AND ");
  const orderBy = buildSortExpression(query.sortBy);
  const direction = query.sortDir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const totalRows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM batch b
    ${joins}
    WHERE ${whereSql}
  `);

  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT
      b.id,
      b.tenantId,
      b.hierarchyNodeId,
      b.name,
      b.modality,
      b.levelId,
      l.name AS levelName,
      l.rank AS levelRank,
      b.primaryTeacherUserId,
      COALESCE(ptp.fullName, ptu.username, ptu.email) AS primaryTeacherName,
      b.maxStudents,
      b.durationMinutes,
      b.status,
      b.isActive,
      b.createdAt,
      b.updatedAt,
      b.archivedAt,
      b.deletedAt,
      COALESCE(stats.currentStudents, 0) AS currentStudents,
      CASE
        WHEN b.maxStudents IS NULL OR b.maxStudents = 0 THEN NULL
        ELSE ROUND((COALESCE(stats.currentStudents, 0) / b.maxStudents) * 100, 0)
      END AS occupancyPercentage,
      COALESCE(sched.scheduleSummary, '') AS scheduleSummary,
      COALESCE(sched.hasWeekend, 0) AS hasWeekend,
      COALESCE(sched.hasWeekday, 0) AS hasWeekday,
      CASE
        WHEN (
          b.primaryTeacherUserId IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM batchteacherassignment teacher_exists
            WHERE teacher_exists.tenantId = ${tenantId}
              AND teacher_exists.batchId = b.id
          )
        ) THEN 1
        ELSE 0
      END AS hasTeacher
    FROM batch b
    ${joins}
    WHERE ${whereSql}
    ORDER BY ${orderBy} ${direction}, b.id DESC
    LIMIT ${query.limit} OFFSET ${query.offset}
  `);

  const batchIds = (Array.isArray(rows) ? rows : []).map((row) => String(row.id));
  const teacherAssignmentsByBatchId = await fetchTeacherAssignments(tenantId, batchIds);

  const items = (Array.isArray(rows) ? rows : []).map((row) => {
    const id = String(row.id);
    const currentStudents = toNumber(row.currentStudents);
    const maxStudents = toNullableNumber(row.maxStudents);
    const occupancyPercentage = row.occupancyPercentage === null || row.occupancyPercentage === undefined
      ? calculateOccupancy(maxStudents, currentStudents)
      : toNullableNumber(row.occupancyPercentage);
    const teacherAssignments = teacherAssignmentsByBatchId.get(id) || [];
    const hasTeacher = Boolean(toNumber(row.hasTeacher));
    const hasSchedule = Boolean(String(row.scheduleSummary || "").trim());

    let health = "HEALTHY";
    if (!hasTeacher || !hasSchedule) {
      health = "WARNING";
    }
    if (maxStudents && currentStudents >= maxStudents) {
      health = "FULL";
    }

    return {
      id,
      tenantId: String(row.tenantId),
      hierarchyNodeId: String(row.hierarchyNodeId),
      name: String(row.name),
      modality: row.modality ? String(row.modality) : null,
      levelId: row.levelId ? String(row.levelId) : null,
      level: row.levelId
        ? {
            id: String(row.levelId),
            name: row.levelName ? String(row.levelName) : null,
            rank: toNullableNumber(row.levelRank)
          }
        : null,
      primaryTeacherUserId: row.primaryTeacherUserId ? String(row.primaryTeacherUserId) : null,
      primaryTeacherName: row.primaryTeacherName ? String(row.primaryTeacherName) : null,
      maxStudents,
      currentStudents,
      occupancyPercentage,
      durationMinutes: toNullableNumber(row.durationMinutes),
      status: String(row.status),
      isActive: Boolean(row.isActive),
      scheduleSummary: String(row.scheduleSummary || ""),
      hasWeekend: Boolean(toNumber(row.hasWeekend)),
      hasWeekday: Boolean(toNumber(row.hasWeekday)),
      hasTeacher,
      teacherAssignments,
      capacityDisplay: maxStudents ? `${currentStudents} / ${maxStudents}` : `${currentStudents}`,
      health,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      archivedAt: row.archivedAt,
      deletedAt: row.deletedAt
    };
  });

  return {
    items,
    total: toNumber(totalRows?.[0]?.total),
    limit: query.limit,
    offset: query.offset,
    page: query.page,
    pageSize: query.pageSize
  };
}

export { listBatchCatalog };