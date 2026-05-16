import { Prisma } from "../lib/prisma-compat.js";
import { prisma } from "../lib/prisma.js";
import { DAY_LABELS, normalizeScheduleSlots } from "./batch-schedule.service.js";

function minuteToLabel(totalMinutes) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function buildSlotConditions(scheduleSlots) {
  return scheduleSlots.map((slot) => Prisma.sql`(
    s.dayOfWeek = ${slot.dayOfWeek}
    AND GREATEST(s.startTime, ${slot.startTime}) < LEAST(s.endTime, ${slot.endTime})
  )`);
}

function formatSlotLabel(row) {
  return `${DAY_LABELS[Number(row.dayOfWeek)]} ${minuteToLabel(Number(row.startTime))}-${minuteToLabel(Number(row.endTime))}`;
}

async function findTeacherScheduleConflicts({ tenantId, hierarchyNodeId, teacherUserIds = [], scheduleSlots = [], excludeBatchId = null }) {
  const normalizedTeacherUserIds = Array.from(new Set((teacherUserIds || []).map((value) => String(value || "").trim()).filter(Boolean)));
  const normalizedScheduleSlots = normalizeScheduleSlots(scheduleSlots);

  if (!normalizedTeacherUserIds.length || !normalizedScheduleSlots.length) {
    return [];
  }

  const slotConditions = buildSlotConditions(normalizedScheduleSlots);
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT DISTINCT
      b.id AS batchId,
      b.name AS batchName,
      bta.teacherUserId,
      COALESCE(tp.fullName, au.username, au.email) AS teacherName,
      s.dayOfWeek,
      s.startTime,
      s.endTime,
      s.roomId
    FROM batchscheduleslot s
    JOIN batch b ON b.id = s.batchId AND b.tenantId = s.tenantId
    JOIN batchteacherassignment bta ON bta.batchId = b.id AND bta.tenantId = b.tenantId
    JOIN authuser au ON au.id = bta.teacherUserId
    LEFT JOIN teacherprofile tp ON tp.authUserId = au.id
    WHERE b.tenantId = ${tenantId}
      ${hierarchyNodeId ? Prisma.sql`AND b.hierarchyNodeId = ${hierarchyNodeId}` : Prisma.sql``}
      AND b.deletedAt IS NULL
      AND b.status IN ('ACTIVE', 'UPCOMING', 'PAUSED', 'TRIAL')
      ${excludeBatchId ? Prisma.sql`AND b.id <> ${excludeBatchId}` : Prisma.sql``}
      AND bta.teacherUserId IN (${Prisma.join(normalizedTeacherUserIds)})
      AND (${Prisma.join(slotConditions, " OR ")})
    ORDER BY teacherName ASC, b.name ASC, s.dayOfWeek ASC, s.startTime ASC
  `);

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    type: "TEACHER_SCHEDULE_CONFLICT",
    batchId: String(row.batchId),
    batchName: String(row.batchName),
    teacherUserId: String(row.teacherUserId),
    teacherName: String(row.teacherName || ""),
    slotLabel: formatSlotLabel(row),
    roomId: row.roomId ? String(row.roomId) : null
  }));
}

async function findRoomScheduleConflicts({ tenantId, hierarchyNodeId, scheduleSlots = [], excludeBatchId = null }) {
  const normalizedScheduleSlots = normalizeScheduleSlots(scheduleSlots).filter((slot) => slot.roomId);
  if (!normalizedScheduleSlots.length) {
    return [];
  }

  const slotConditions = buildSlotConditions(normalizedScheduleSlots).map((condition, index) => Prisma.sql`(
    ${condition}
    AND s.roomId = ${normalizedScheduleSlots[index].roomId}
  )`);

  const roomIds = Array.from(new Set(normalizedScheduleSlots.map((slot) => slot.roomId)));
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT DISTINCT
      b.id AS batchId,
      b.name AS batchName,
      s.dayOfWeek,
      s.startTime,
      s.endTime,
      s.roomId
    FROM batchscheduleslot s
    JOIN batch b ON b.id = s.batchId AND b.tenantId = s.tenantId
    WHERE b.tenantId = ${tenantId}
      ${hierarchyNodeId ? Prisma.sql`AND b.hierarchyNodeId = ${hierarchyNodeId}` : Prisma.sql``}
      AND b.deletedAt IS NULL
      AND b.status IN ('ACTIVE', 'UPCOMING', 'PAUSED', 'TRIAL')
      ${excludeBatchId ? Prisma.sql`AND b.id <> ${excludeBatchId}` : Prisma.sql``}
      AND s.roomId IN (${Prisma.join(roomIds)})
      AND (${Prisma.join(slotConditions, " OR ")})
    ORDER BY s.roomId ASC, b.name ASC, s.dayOfWeek ASC, s.startTime ASC
  `);

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    type: "ROOM_SCHEDULE_CONFLICT",
    batchId: String(row.batchId),
    batchName: String(row.batchName),
    roomId: row.roomId ? String(row.roomId) : null,
    slotLabel: formatSlotLabel(row)
  }));
}

async function getBatchConflictWarnings({ tenantId, hierarchyNodeId, teacherUserIds = [], scheduleSlots = [], excludeBatchId = null }) {
  const [teacherConflicts, roomConflicts] = await Promise.all([
    findTeacherScheduleConflicts({ tenantId, hierarchyNodeId, teacherUserIds, scheduleSlots, excludeBatchId }),
    findRoomScheduleConflicts({ tenantId, hierarchyNodeId, scheduleSlots, excludeBatchId })
  ]);

  return [...teacherConflicts, ...roomConflicts];
}

export {
  findRoomScheduleConflicts,
  findTeacherScheduleConflicts,
  getBatchConflictWarnings
};