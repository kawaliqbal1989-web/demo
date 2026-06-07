import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { isFeatureEnabled } from "./feature-flags.service.js";
import {
  createAssessment,
  findAssessmentBySource,
  setAssessmentActiveVersion
} from "../repositories/assessment.repository.js";
import {
  createAssessmentVersion,
  findLatestAssessmentVersion,
  supersedeCurrentVersions
} from "../repositories/assessment-version.repository.js";
import {
  createAssessmentPapers,
  deleteAssessmentPapersByVersion
} from "../repositories/assessment-paper.repository.js";
import {
  createAssessmentParticipants,
  deleteAssessmentParticipantsByVersion
} from "../repositories/assessment-participant.repository.js";
import {
  createAssessmentMigrationLog,
  updateAssessmentMigrationLog
} from "../repositories/assessment-migration-log.repository.js";
import {
  mapExamCycleToAssessment,
  mapExamCycleToAssessmentVersion,
  mapExamWorksheetsToAssessmentPapers,
  mapExamEntriesToAssessmentParticipants,
  mapCompetitionToAssessment,
  mapCompetitionToAssessmentVersion,
  mapCompetitionWorksheetsToAssessmentPapers,
  mapCompetitionEnrollmentsToAssessmentParticipants
} from "./assessment-mappers/index.js";

function assertAssessmentCutoverFlagsDisabled() {
  if (isFeatureEnabled("assessment.dualWrite") || isFeatureEnabled("assessment.readCutover")) {
    throw new Error("Assessment cutover flags must stay disabled during Sprint 1 backfill");
  }
}

async function loadExamCycleSnapshot({ tenantId, examCycleId }) {
  const examCycle = await prisma.examCycle.findFirst({
    where: {
      tenantId,
      id: examCycleId
    }
  });

  if (!examCycle) {
    return null;
  }

  const worksheets = await prisma.worksheet.findMany({
    where: {
      tenantId,
      examCycleId
    },
    select: {
      id: true,
      levelId: true,
      generationMode: true,
      generationSeed: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const entries = await prisma.examEnrollmentEntry.findMany({
    where: {
      tenantId,
      examCycleId
    },
    select: {
      id: true,
      studentId: true,
      enrolledLevelId: true,
      sourceTeacherUserId: true,
      isTemporary: true,
      createdAt: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const listItems = await prisma.examEnrollmentListItem.findMany({
    where: {
      tenantId,
      entryId: {
        in: entries.map((entry) => entry.id)
      }
    },
    select: {
      entryId: true,
      listId: true
    }
  });

  const listByEntryId = new Map(listItems.map((item) => [item.entryId, item.listId]));
  const enrichedEntries = entries.map((entry) => ({
    ...entry,
    listId: listByEntryId.get(entry.id) || null
  }));

  return {
    examCycle,
    worksheets,
    entries: enrichedEntries
  };
}

async function loadCompetitionSnapshot({ tenantId, competitionId }) {
  const competition = await prisma.competition.findFirst({
    where: {
      tenantId,
      id: competitionId
    }
  });

  if (!competition) {
    return null;
  }

  const worksheetLinks = await prisma.competitionWorksheet.findMany({
    where: {
      tenantId,
      competitionId
    },
    select: {
      worksheet: {
        select: {
          id: true,
          levelId: true,
          generationSeed: true
        }
      }
    },
    orderBy: [{ assignedAt: "asc" }, { worksheetId: "asc" }]
  });

  const enrollments = await prisma.competitionEnrollment.findMany({
    where: {
      tenantId,
      competitionId
    },
    select: {
      studentId: true,
      isActive: true,
      enrolledAt: true
    },
    orderBy: [{ enrolledAt: "asc" }, { studentId: "asc" }]
  });

  return {
    competition,
    worksheets: worksheetLinks.map((link) => link.worksheet),
    enrollments
  };
}

async function upsertExamCycleAssessment({ tenantId, examCycleId, actorUserId }, dbClient) {
  const db = dbClient || prisma;
  const snapshot = await loadExamCycleSnapshot({ tenantId, examCycleId });
  if (!snapshot) {
    return null;
  }

  const { examCycle, worksheets, entries } = snapshot;

  let assessment = await findAssessmentBySource(
    {
      tenantId,
      sourceSystem: "EXAM_CYCLE",
      sourceEntityId: examCycle.id
    },
    db
  );

  if (!assessment) {
    assessment = await createAssessment(
      mapExamCycleToAssessment({ tenantId, examCycle, actorUserId }),
      db
    );
  }

  const latestVersion = await findLatestAssessmentVersion(
    {
      tenantId,
      assessmentId: assessment.id
    },
    db
  );

  await supersedeCurrentVersions(
    {
      tenantId,
      assessmentId: assessment.id
    },
    db
  );

  const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;
  const version = await createAssessmentVersion(
    mapExamCycleToAssessmentVersion({
      tenantId,
      assessmentId: assessment.id,
      examCycle,
      actorUserId,
      versionNumber: nextVersionNumber,
      parentVersionId: latestVersion?.id || null
    }),
    db
  );

  await setAssessmentActiveVersion(
    {
      assessmentId: assessment.id,
      activeVersionId: version.id
    },
    db
  );

  await deleteAssessmentPapersByVersion({ tenantId, assessmentVersionId: version.id }, db);
  await deleteAssessmentParticipantsByVersion({ tenantId, assessmentVersionId: version.id }, db);

  await createAssessmentPapers(
    mapExamWorksheetsToAssessmentPapers({
      tenantId,
      assessmentVersionId: version.id,
      worksheets
    }),
    db
  );

  await createAssessmentParticipants(
    mapExamEntriesToAssessmentParticipants({
      tenantId,
      assessmentVersionId: version.id,
      examCycleId,
      entries
    }),
    db
  );

  return {
    sourceSystem: "EXAM_CYCLE",
    sourceEntityId: examCycleId,
    assessmentId: assessment.id,
    assessmentVersionId: version.id,
    paperCount: worksheets.length,
    participantCount: entries.length
  };
}

async function upsertCompetitionAssessment({ tenantId, competitionId, actorUserId }, dbClient) {
  const db = dbClient || prisma;
  const snapshot = await loadCompetitionSnapshot({ tenantId, competitionId });
  if (!snapshot) {
    return null;
  }

  const { competition, worksheets, enrollments } = snapshot;

  let assessment = await findAssessmentBySource(
    {
      tenantId,
      sourceSystem: "COMPETITION",
      sourceEntityId: competition.id
    },
    db
  );

  if (!assessment) {
    assessment = await createAssessment(
      mapCompetitionToAssessment({ tenantId, competition, actorUserId }),
      db
    );
  }

  const latestVersion = await findLatestAssessmentVersion(
    {
      tenantId,
      assessmentId: assessment.id
    },
    db
  );

  await supersedeCurrentVersions(
    {
      tenantId,
      assessmentId: assessment.id
    },
    db
  );

  const nextVersionNumber = (latestVersion?.versionNumber || 0) + 1;
  const version = await createAssessmentVersion(
    mapCompetitionToAssessmentVersion({
      tenantId,
      assessmentId: assessment.id,
      competition,
      actorUserId,
      versionNumber: nextVersionNumber,
      parentVersionId: latestVersion?.id || null
    }),
    db
  );

  await setAssessmentActiveVersion(
    {
      assessmentId: assessment.id,
      activeVersionId: version.id
    },
    db
  );

  await deleteAssessmentPapersByVersion({ tenantId, assessmentVersionId: version.id }, db);
  await deleteAssessmentParticipantsByVersion({ tenantId, assessmentVersionId: version.id }, db);

  await createAssessmentPapers(
    mapCompetitionWorksheetsToAssessmentPapers({
      tenantId,
      assessmentVersionId: version.id,
      worksheets
    }),
    db
  );

  await createAssessmentParticipants(
    mapCompetitionEnrollmentsToAssessmentParticipants({
      tenantId,
      assessmentVersionId: version.id,
      competitionId,
      competition,
      enrollments
    }),
    db
  );

  return {
    sourceSystem: "COMPETITION",
    sourceEntityId: competitionId,
    assessmentId: assessment.id,
    assessmentVersionId: version.id,
    paperCount: worksheets.length,
    participantCount: enrollments.length
  };
}

async function runSingleBackfill({ tenantId, sourceSystem, sourceEntityId, actorUserId }, dbClient) {
  const db = dbClient || prisma;
  const startedAt = new Date();

  const migrationLog = await createAssessmentMigrationLog(
    {
      tenantId,
      logType: "BACKFILL",
      status: "STARTED",
      sourceSystem,
      sourceEntityId,
      actorUserId: actorUserId || null,
      startedAt
    },
    db
  );

  try {
    const result = sourceSystem === "EXAM_CYCLE"
      ? await upsertExamCycleAssessment({ tenantId, examCycleId: sourceEntityId, actorUserId }, db)
      : await upsertCompetitionAssessment({ tenantId, competitionId: sourceEntityId, actorUserId }, db);

    await updateAssessmentMigrationLog(
      {
        id: migrationLog.id,
        data: {
          status: result ? "COMPLETED" : "SKIPPED",
          message: result ? "backfill completed" : "source entity not found",
          completedAt: new Date(),
          assessmentId: result?.assessmentId || null,
          assessmentVersionId: result?.assessmentVersionId || null,
          details: result || null
        }
      },
      db
    );

    return {
      logId: migrationLog.id,
      skipped: !result,
      result
    };
  } catch (error) {
    await updateAssessmentMigrationLog(
      {
        id: migrationLog.id,
        data: {
          status: "FAILED",
          message: error.message,
          completedAt: new Date(),
          details: {
            error: error.message
          }
        }
      },
      db
    );
    throw error;
  }
}

async function runAssessmentBackfill({ tenantId, sourceSystem = null, sourceEntityId = null, limit = 100, actorUserId = null } = {}) {
  assertAssessmentCutoverFlagsDisabled();

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

    examCycles.forEach((cycle) => {
      runList.push({
        sourceSystem: "EXAM_CYCLE",
        sourceEntityId: cycle.id
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

    competitions.forEach((competition) => {
      runList.push({
        sourceSystem: "COMPETITION",
        sourceEntityId: competition.id
      });
    });
  }

  const results = [];
  for (const runItem of runList) {
    const row = await runSingleBackfill(
      {
        tenantId,
        sourceSystem: runItem.sourceSystem,
        sourceEntityId: runItem.sourceEntityId,
        actorUserId
      },
      prisma
    );
    results.push(row);
  }

  const summary = {
    tenantId,
    requestedSourceSystem: sourceSystem,
    processed: results.length,
    completed: results.filter((row) => !row.skipped).length,
    skipped: results.filter((row) => row.skipped).length,
    logIds: results.map((row) => row.logId)
  };

  logger.info("assessment_backfill_completed", summary);
  return {
    summary,
    results
  };
}

export {
  runAssessmentBackfill,
  runSingleBackfill,
  upsertExamCycleAssessment,
  upsertCompetitionAssessment,
  assertAssessmentCutoverFlagsDisabled
};
