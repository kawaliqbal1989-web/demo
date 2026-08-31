import { prisma } from "../lib/prisma.js";

const XP_PER_ARENA_LEVEL = 100;

function normalizeTotalXp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function deriveArenaXpProgress(totalXpInput) {
  const totalXp = normalizeTotalXp(totalXpInput);
  const arenaLevel = Math.floor(totalXp / XP_PER_ARENA_LEVEL) + 1;
  const xpIntoLevel = totalXp % XP_PER_ARENA_LEVEL;

  return {
    totalXp,
    arenaLevel,
    xpIntoLevel,
    xpPerLevel: XP_PER_ARENA_LEVEL,
    xpToNextLevel: XP_PER_ARENA_LEVEL - xpIntoLevel,
    nextLevelAtXp: arenaLevel * XP_PER_ARENA_LEVEL
  };
}

function formatDailyEventDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("earnedAt must be a valid date");
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function awardDailyPrimaryArenaXp({
  tx,
  tenantId,
  studentId,
  worksheet,
  submissionId,
  earnedAt = new Date()
} = {}) {
  if (!tx || !tenantId || !studentId || !submissionId || !worksheet) {
    throw new Error("XP award requires tx, tenantId, studentId, worksheet and submissionId");
  }

  const generationMode = String(worksheet.generationMode || "").trim().toUpperCase();

  if (generationMode === "EXAM" || worksheet.competitionMockAttempt?.id) {
    return {
      awarded: false,
      xp: 0,
      reason: generationMode === "EXAM" ? "EXAM_EXCLUDED" : "COMPETITION_MOCK_EXCLUDED"
    };
  }

  const xp = generationMode === "PRACTICE" ? 15 : 20;
  const sourceType =
    generationMode === "PRACTICE"
      ? "PRACTICE_WORKSHEET_SUBMISSION"
      : "WORKSHEET_SUBMISSION";
  const eventKey = `DAILY_PRIMARY:${formatDailyEventDate(earnedAt)}`;

  const created = await tx.studentArenaXpEvent.createMany({
    data: [
      {
        tenantId,
        studentId,
        eventKey,
        sourceType,
        sourceId: submissionId,
        xp,
        earnedAt
      }
    ],
    skipDuplicates: true
  });

  return {
    awarded: created.count === 1,
    xp: created.count === 1 ? xp : 0,
    configuredXp: xp,
    eventKey,
    sourceType,
    sourceId: submissionId
  };
}

async function getStudentArenaXpSummary({ tenantId, studentId, db = prisma } = {}) {
  if (!tenantId || !studentId) {
    throw new Error("XP summary requires tenantId and studentId");
  }

  const aggregate = await db.studentArenaXpEvent.aggregate({
    where: { tenantId, studentId },
    _sum: { xp: true },
    _count: { _all: true }
  });

  return {
    ...deriveArenaXpProgress(aggregate?._sum?.xp || 0),
    rewardEventCount: Number(aggregate?._count?._all || 0)
  };
}

export {
  XP_PER_ARENA_LEVEL,
  awardDailyPrimaryArenaXp,
  deriveArenaXpProgress,
  getStudentArenaXpSummary
};
