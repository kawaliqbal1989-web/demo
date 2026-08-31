import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { tokenHash } from "../utils/token.js";

const ARENA_MOBILE_TASK_TTL_MS = 15 * 60 * 1000;
const ARENA_MOBILE_ACTIVE_TTL_MS = 30 * 60 * 1000;
const TOKEN_MIN_LENGTH = 32;
const TOKEN_MAX_LENGTH = 256;

function mobileTaskError(statusCode, errorCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function normalizeToken(value, label) {
  const token = String(value || "").trim();
  if (token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) {
    throw mobileTaskError(404, "ARENA_MOBILE_TASK_NOT_FOUND", `${label} is invalid`);
  }
  return token;
}

function deriveArenaMobileTaskStatus(task, now = new Date()) {
  if (task?.cancelledAt) return "CANCELLED";
  if (task?.submittedAt) return "SUBMITTED";
  if (task?.expiresAt && new Date(task.expiresAt).getTime() <= now.getTime()) return "EXPIRED";
  if (task?.startedAt) return "IN_PROGRESS";
  if (task?.claimedAt) return "CONNECTED";
  return "READY";
}

function arenaMobileTaskSelect() {
  return {
    id: true,
    tenantId: true,
    studentId: true,
    activityKey: true,
    mode: true,
    config: true,
    handoffTokenHash: true,
    claimTokenHash: true,
    expiresAt: true,
    claimedAt: true,
    startedAt: true,
    submittedAt: true,
    cancelledAt: true,
    arenaActivitySessionId: true,
    createdAt: true,
    updatedAt: true
  };
}

function toPublicTask(task, { claimToken, status } = {}) {
  const payload = {
    activityKey: task.activityKey,
    mode: task.mode,
    config: task.config,
    expiresAt: task.expiresAt,
    status: status || deriveArenaMobileTaskStatus(task)
  };
  if (claimToken) payload.claimToken = claimToken;
  return payload;
}

function assertTaskUsable(task, now = new Date()) {
  if (!task) {
    throw mobileTaskError(404, "ARENA_MOBILE_TASK_NOT_FOUND", "Arena mobile task not found");
  }
  if (task.cancelledAt) {
    throw mobileTaskError(409, "ARENA_MOBILE_TASK_CANCELLED", "Arena mobile task was cancelled");
  }
  if (task.submittedAt || task.arenaActivitySessionId) {
    throw mobileTaskError(409, "ARENA_MOBILE_TASK_SUBMITTED", "Arena mobile task was already submitted");
  }
  if (task.expiresAt && new Date(task.expiresAt).getTime() <= now.getTime()) {
    throw mobileTaskError(410, "ARENA_MOBILE_TASK_EXPIRED", "Arena mobile task expired");
  }
}

function normalizeInteger(value, field, { min, max }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw mobileTaskError(400, "VALIDATION_ERROR", `${field} must be an integer between ${min} and ${max}`);
  }
  return number;
}

function normalizeMetrics(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw mobileTaskError(400, "VALIDATION_ERROR", "metrics must be a JSON object");
  }
  let serialized;
  try { serialized = JSON.stringify(value); }
  catch { throw mobileTaskError(400, "VALIDATION_ERROR", "metrics must be valid JSON"); }
  if (serialized.length > 8192) {
    throw mobileTaskError(400, "VALIDATION_ERROR", "metrics payload is too large");
  }
  return value;
}

async function createArenaMobileTask({ tenantId, studentId, activityKey, mode = null, config, now = new Date() }) {
  const handoffToken = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + ARENA_MOBILE_TASK_TTL_MS);
  const task = await prisma.arenaMobileTask.create({
    data: {
      tenantId,
      studentId,
      activityKey,
      mode,
      config,
      handoffTokenHash: tokenHash(handoffToken),
      expiresAt
    },
    select: arenaMobileTaskSelect()
  });
  return {
    id: task.id,
    activityKey: task.activityKey,
    mode: task.mode,
    config: task.config,
    expiresAt: task.expiresAt,
    status: deriveArenaMobileTaskStatus(task, now),
    handoffToken,
    mobilePath: `/m/arena#${handoffToken}`
  };
}

async function getArenaMobileTaskStatus({ tenantId, studentId, taskId, now = new Date() }) {
  const task = await prisma.arenaMobileTask.findFirst({
    where: { id: taskId, tenantId, studentId },
    select: arenaMobileTaskSelect()
  });
  if (!task) return null;
  return {
    id: task.id,
    activityKey: task.activityKey,
    mode: task.mode,
    config: task.config,
    expiresAt: task.expiresAt,
    claimedAt: task.claimedAt,
    startedAt: task.startedAt,
    submittedAt: task.submittedAt,
    cancelledAt: task.cancelledAt,
    arenaActivitySessionId: task.arenaActivitySessionId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    status: deriveArenaMobileTaskStatus(task, now)
  };
}

async function claimArenaMobileTask({ handoffToken, now = new Date() }) {
  const raw = normalizeToken(handoffToken, "handoffToken");
  const hash = tokenHash(raw);
  const task = await prisma.arenaMobileTask.findUnique({
    where: { handoffTokenHash: hash },
    select: arenaMobileTaskSelect()
  });
  assertTaskUsable(task, now);
  if (task.claimedAt || task.claimTokenHash) {
    throw mobileTaskError(409, "ARENA_MOBILE_TASK_ALREADY_CLAIMED", "Arena mobile task is already connected to a phone");
  }

  const claimToken = crypto.randomBytes(32).toString("base64url");
  const claimHash = tokenHash(claimToken);
  const claimed = await prisma.arenaMobileTask.updateMany({
    where: {
      id: task.id,
      handoffTokenHash: hash,
      claimTokenHash: null,
      claimedAt: null,
      submittedAt: null,
      cancelledAt: null,
      expiresAt: { gt: now }
    },
    data: { claimTokenHash: claimHash, claimedAt: now }
  });
  if (claimed.count !== 1) {
    throw mobileTaskError(409, "ARENA_MOBILE_TASK_ALREADY_CLAIMED", "Arena mobile task is already connected to a phone");
  }
  const updated = await prisma.arenaMobileTask.findUnique({ where: { id: task.id }, select: arenaMobileTaskSelect() });
  return toPublicTask(updated, { claimToken, status: "CONNECTED" });
}

async function startArenaMobileTask({ claimToken, now = new Date() }) {
  const raw = normalizeToken(claimToken, "claimToken");
  const hash = tokenHash(raw);
  let task = await prisma.arenaMobileTask.findUnique({ where: { claimTokenHash: hash }, select: arenaMobileTaskSelect() });
  assertTaskUsable(task, now);
  if (!task.claimedAt) {
    throw mobileTaskError(409, "ARENA_MOBILE_TASK_NOT_CLAIMED", "Arena mobile task is not connected");
  }
  if (!task.startedAt) {
    const activeExpiresAt = new Date(now.getTime() + ARENA_MOBILE_ACTIVE_TTL_MS);
    const started = await prisma.arenaMobileTask.updateMany({
      where: {
        id: task.id,
        claimTokenHash: hash,
        startedAt: null,
        submittedAt: null,
        cancelledAt: null,
        expiresAt: { gt: now }
      },
      data: { startedAt: now, expiresAt: activeExpiresAt }
    });
    task = await prisma.arenaMobileTask.findUnique({ where: { id: task.id }, select: arenaMobileTaskSelect() });
    assertTaskUsable(task, now);
    if (started.count !== 1 && !task.startedAt) {
      throw mobileTaskError(409, "ARENA_MOBILE_TASK_START_CONFLICT", "Arena mobile task could not be started");
    }
  }
  return toPublicTask(task, { status: "IN_PROGRESS" });
}

async function submitArenaMobileTask({ claimToken, attemptCount, correctCount, durationMs = null, metrics = null, now = new Date() }) {
  const raw = normalizeToken(claimToken, "claimToken");
  const hash = tokenHash(raw);
  const attempts = normalizeInteger(attemptCount, "attemptCount", { min: 1, max: 10000 });
  const correct = normalizeInteger(correctCount, "correctCount", { min: 0, max: attempts });
  const duration = durationMs === undefined || durationMs === null
    ? null
    : normalizeInteger(durationMs, "durationMs", { min: 0, max: 86400000 });
  const normalizedMetrics = normalizeMetrics(metrics);

  return prisma.$transaction(async (tx) => {
    const task = await tx.arenaMobileTask.findUnique({ where: { claimTokenHash: hash }, select: arenaMobileTaskSelect() });
    assertTaskUsable(task, now);
    if (!task.claimedAt) {
      throw mobileTaskError(409, "ARENA_MOBILE_TASK_NOT_CLAIMED", "Arena mobile task is not connected");
    }
    if (!task.startedAt) {
      throw mobileTaskError(409, "ARENA_MOBILE_TASK_NOT_STARTED", "Arena mobile task has not started");
    }
    const configuredAttemptCount =
      task.activityKey === "flash-cards"
        ? Number(task.config?.cardCount)
        : Number(task.config?.roundCount);

    if (
      Number.isInteger(configuredAttemptCount) &&
      configuredAttemptCount > 0 &&
      attempts !== configuredAttemptCount
    ) {
      const preparedCountField =
        task.activityKey === "flash-cards"
          ? "cardCount"
          : "roundCount";

      throw mobileTaskError(
        400,
        "VALIDATION_ERROR",
        `attemptCount must equal the prepared ${preparedCountField} (${configuredAttemptCount})`
      );
    }

    const locked = await tx.arenaMobileTask.updateMany({
      where: {
        id: task.id,
        claimTokenHash: hash,
        submittedAt: null,
        arenaActivitySessionId: null,
        cancelledAt: null,
        expiresAt: { gt: now }
      },
      data: { submittedAt: now }
    });
    if (locked.count !== 1) {
      throw mobileTaskError(409, "ARENA_MOBILE_TASK_SUBMITTED", "Arena mobile task was already submitted");
    }

    const accuracy = Math.round((correct / attempts) * 10000) / 100;
    const session = await tx.arenaActivitySession.create({
      data: {
        tenantId: task.tenantId,
        studentId: task.studentId,
        activityKey: task.activityKey,
        mode: task.mode,
        attemptCount: attempts,
        correctCount: correct,
        accuracy,
        durationMs: duration,
        metrics: normalizedMetrics,
        startedAt: task.startedAt
      },
      select: {
        id: true,
        activityKey: true,
        mode: true,
        attemptCount: true,
        correctCount: true,
        accuracy: true,
        durationMs: true,
        metrics: true,
        startedAt: true,
        completedAt: true
      }
    });

    await tx.arenaMobileTask.update({
      where: { id: task.id },
      data: { arenaActivitySessionId: session.id }
    });

    return {
      status: "SUBMITTED",
      activityKey: session.activityKey,
      mode: session.mode,
      attemptCount: session.attemptCount,
      correctCount: session.correctCount,
      accuracy: session.accuracy === null ? null : Number(session.accuracy),
      durationMs: session.durationMs,
      metrics: session.metrics,
      startedAt: session.startedAt,
      completedAt: session.completedAt
    };
  });
}

export {
  ARENA_MOBILE_ACTIVE_TTL_MS,
  ARENA_MOBILE_TASK_TTL_MS,
  claimArenaMobileTask,
  createArenaMobileTask,
  deriveArenaMobileTaskStatus,
  getArenaMobileTaskStatus,
  startArenaMobileTask,
  submitArenaMobileTask
};
