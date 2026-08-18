import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  createAssessmentMigrationLog,
  updateAssessmentMigrationLog
} from "../repositories/assessment-migration-log.repository.js";
import { findAssessmentBySource } from "../repositories/assessment.repository.js";

async function computeExamCycleParity({ tenantId, examCycleId }) {
  const assessment = await findAssessmentBySource({
    tenantId,
    sourceSystem: "EXAM_CYCLE",
    sourceEntityId: examCycleId
  });

  const legacyEnrollmentCount = await prisma.examEnrollmentEntry.count({
    where: {
      tenantId,
      examCycleId
    }
  });

  const legacyWorksheetCount = await prisma.worksheet.count({
    where: {
      tenantId,
      examCycleId
    }
  });

  const assessmentVersionId = assessment?.activeVersionId || null;

  const mappedParticipantCount = assessmentVersionId
    ? await prisma.assessmentParticipant.count({
        where: {
          tenantId,
          assessmentVersionId
        }
      })
    : 0;

  const mappedPaperCount = assessmentVersionId
    ? await prisma.assessmentPaper.count({
        where: {
          tenantId,
          assessmentVersionId
        }
      })
    : 0;

  return {
    sourceSystem: "EXAM_CYCLE",
    sourceEntityId: examCycleId,
    assessmentId: assessment?.id || null,
    assessmentVersionId,
    counts: {
      legacyEnrollmentCount,
      mappedParticipantCount,
      legacyWorksheetCount,
      mappedPaperCount
    },
    isParticipantParity: legacyEnrollmentCount === mappedParticipantCount,
    isPaperParity: legacyWorksheetCount === mappedPaperCount
  };
}

async function computeCompetitionParity({ tenantId, competitionId }) {
  const assessment = await findAssessmentBySource({
    tenantId,
    sourceSystem: "COMPETITION",
    sourceEntityId: competitionId
  });

  const legacyEnrollmentCount = await prisma.competitionEnrollment.count({
    where: {
      tenantId,
      competitionId
    }
  });

  const legacyWorksheetCount = await prisma.legacyCompetitionWorksheetLink.count({
    where: {
      tenantId,
      competitionId
    }
  });

  const assessmentVersionId = assessment?.activeVersionId || null;

  const mappedParticipantCount = assessmentVersionId
    ? await prisma.assessmentParticipant.count({
        where: {
          tenantId,
          assessmentVersionId
        }
      })
    : 0;

  const mappedPaperCount = assessmentVersionId
    ? await prisma.assessmentPaper.count({
        where: {
          tenantId,
          assessmentVersionId
        }
      })
    : 0;

  return {
    sourceSystem: "COMPETITION",
    sourceEntityId: competitionId,
    assessmentId: assessment?.id || null,
    assessmentVersionId,
    counts: {
      legacyEnrollmentCount,
      mappedParticipantCount,
      legacyWorksheetCount,
      mappedPaperCount
    },
    isParticipantParity: legacyEnrollmentCount === mappedParticipantCount,
    isPaperParity: legacyWorksheetCount === mappedPaperCount
  };
}

async function runSingleParity({ tenantId, sourceSystem, sourceEntityId, actorUserId = null }) {
  const startedAt = new Date();
  const migrationLog = await createAssessmentMigrationLog({
    tenantId,
    logType: "PARITY",
    status: "STARTED",
    sourceSystem,
    sourceEntityId,
    actorUserId,
    startedAt
  });

  try {
    const parity = sourceSystem === "EXAM_CYCLE"
      ? await computeExamCycleParity({ tenantId, examCycleId: sourceEntityId })
      : await computeCompetitionParity({ tenantId, competitionId: sourceEntityId });

    const isParityOk = parity.isParticipantParity && parity.isPaperParity;

    await updateAssessmentMigrationLog({
      id: migrationLog.id,
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        message: isParityOk ? "parity matched" : "parity mismatch",
        assessmentId: parity.assessmentId,
        assessmentVersionId: parity.assessmentVersionId,
        details: parity
      }
    });

    return {
      logId: migrationLog.id,
      ...parity,
      isParityOk
    };
  } catch (error) {
    await updateAssessmentMigrationLog({
      id: migrationLog.id,
      data: {
        status: "FAILED",
        completedAt: new Date(),
        message: error.message,
        details: {
          error: error.message
        }
      }
    });
    throw error;
  }
}

async function runAssessmentParity({ tenantId, sourceSystem = null, sourceEntityId = null, limit = 100, actorUserId = null } = {}) {
  if (!tenantId) {
    throw new Error("tenantId is required");
  }

  const runList = [];

  if (!sourceSystem || sourceSystem === "EXAM_CYCLE") {
    const examCycles = sourceEntityId
      ? [{ id: sourceEntityId }]
      : await prisma.examCycle.findMany({
          where: { tenantId },
          select: { id: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: limit
        });

    examCycles.forEach((row) => {
      runList.push({
        sourceSystem: "EXAM_CYCLE",
        sourceEntityId: row.id
      });
    });
  }

  if (!sourceSystem || sourceSystem === "COMPETITION") {
    const competitions = sourceEntityId
      ? [{ id: sourceEntityId }]
      : await prisma.competition.findMany({
          where: { tenantId },
          select: { id: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: limit
        });

    competitions.forEach((row) => {
      runList.push({
        sourceSystem: "COMPETITION",
        sourceEntityId: row.id
      });
    });
  }

  const rows = [];
  for (const runItem of runList) {
    rows.push(
      await runSingleParity({
        tenantId,
        sourceSystem: runItem.sourceSystem,
        sourceEntityId: runItem.sourceEntityId,
        actorUserId
      })
    );
  }

  const summary = {
    tenantId,
    processed: rows.length,
    passed: rows.filter((row) => row.isParityOk).length,
    failed: rows.filter((row) => !row.isParityOk).length,
    logIds: rows.map((row) => row.logId)
  };

  logger.info("assessment_parity_completed", summary);
  return {
    summary,
    rows
  };
}

export {
  computeExamCycleParity,
  computeCompetitionParity,
  runSingleParity,
  runAssessmentParity
};
