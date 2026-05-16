import { prisma } from "../lib/prisma.js";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function coerceMinuteOfDay(value, fieldName) {
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value < 0 || value > 1439) {
      throw new Error(`${fieldName} must be between 0 and 1439`);
    }
    return value;
  }

  const normalized = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(normalized)) {
    throw new Error(`${fieldName} must be an integer minute-of-day or HH:MM`);
  }

  const [hoursText, minutesText] = normalized.split(":");
  const hours = Number.parseInt(hoursText, 10);
  const minutes = Number.parseInt(minutesText, 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`${fieldName} must be a valid HH:MM time`);
  }

  return hours * 60 + minutes;
}

function minuteToLabel(totalMinutes) {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function hasScheduleOverlap(left, right) {
  return left.dayOfWeek === right.dayOfWeek
    && Math.max(left.startTime, right.startTime) < Math.min(left.endTime, right.endTime);
}

function normalizeScheduleSlots(scheduleSlots = []) {
  if (scheduleSlots === undefined) {
    return [];
  }

  if (!Array.isArray(scheduleSlots)) {
    throw new Error("scheduleSlots must be an array");
  }

  return scheduleSlots
    .map((slot) => {
      const dayOfWeek = Number.parseInt(String(slot?.dayOfWeek), 10);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        throw new Error("dayOfWeek must be between 0 and 6");
      }

      const startTime = coerceMinuteOfDay(slot?.startTime, "startTime");
      const endTime = coerceMinuteOfDay(slot?.endTime, "endTime");
      if (endTime <= startTime) {
        throw new Error("endTime must be greater than startTime");
      }

      return {
        dayOfWeek,
        startTime,
        endTime,
        roomId: slot?.roomId ? String(slot.roomId).trim() : null
      };
    })
    .sort((left, right) => (
      left.dayOfWeek - right.dayOfWeek
      || left.startTime - right.startTime
      || left.endTime - right.endTime
      || String(left.roomId || "").localeCompare(String(right.roomId || ""))
    ));
}

function summarizeScheduleSlots(scheduleSlots = []) {
  const normalized = normalizeScheduleSlots(scheduleSlots);
  if (!normalized.length) {
    return "";
  }

  return normalized
    .map((slot) => `${DAY_LABELS[slot.dayOfWeek]} ${minuteToLabel(slot.startTime)}-${minuteToLabel(slot.endTime)}`)
    .join(" | ");
}

function serializeLegacySchedule(scheduleSlots = []) {
  const normalized = normalizeScheduleSlots(scheduleSlots);
  if (!normalized.length) {
    return null;
  }

  return {
    summary: summarizeScheduleSlots(normalized),
    slots: normalized
  };
}

async function createBatchScheduleSlots({ db = prisma, tenantId, batchId, scheduleSlots }) {
  const normalized = normalizeScheduleSlots(scheduleSlots);
  if (!normalized.length) {
    return [];
  }

  await db.batchScheduleSlot.createMany({
    data: normalized.map((slot) => ({
      tenantId,
      batchId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomId: slot.roomId
    }))
  });

  return normalized;
}

async function updateBatchScheduleSlots({ db = prisma, tenantId, batchId, scheduleSlots }) {
  const normalized = normalizeScheduleSlots(scheduleSlots);

  await db.batchScheduleSlot.deleteMany({
    where: {
      tenantId,
      batchId
    }
  });

  if (!normalized.length) {
    return [];
  }

  await db.batchScheduleSlot.createMany({
    data: normalized.map((slot) => ({
      tenantId,
      batchId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      roomId: slot.roomId
    }))
  });

  return normalized;
}

export {
  DAY_LABELS,
  createBatchScheduleSlots,
  hasScheduleOverlap,
  normalizeScheduleSlots,
  serializeLegacySchedule,
  summarizeScheduleSlots,
  updateBatchScheduleSlots
};