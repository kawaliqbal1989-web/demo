import { prisma } from "../lib/prisma.js";

const ASSESSMENT_MIGRATION_LOG_SELECT = {
  id: true,
  tenantId: true,
  logType: true,
  status: true,
  sourceSystem: true,
  sourceEntityId: true,
  assessmentId: true,
  assessmentVersionId: true,
  actorUserId: true,
  jobKey: true,
  message: true,
  details: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true
};

function getDb(dbClient) {
  return dbClient || prisma;
}

async function createAssessmentMigrationLog(data, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentMigrationLog.create({
    data,
    select: ASSESSMENT_MIGRATION_LOG_SELECT
  });
}

async function updateAssessmentMigrationLog({ id, data }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentMigrationLog.update({
    where: {
      id
    },
    data,
    select: ASSESSMENT_MIGRATION_LOG_SELECT
  });
}

async function listAssessmentMigrationLogs({ tenantId, logType, status, sourceSystem, sourceEntityId, take = 50 }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentMigrationLog.findMany({
    where: {
      tenantId,
      ...(logType ? { logType } : {}),
      ...(status ? { status } : {}),
      ...(sourceSystem ? { sourceSystem } : {}),
      ...(sourceEntityId ? { sourceEntityId } : {})
    },
    select: ASSESSMENT_MIGRATION_LOG_SELECT,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take
  });
}

export {
  ASSESSMENT_MIGRATION_LOG_SELECT,
  createAssessmentMigrationLog,
  updateAssessmentMigrationLog,
  listAssessmentMigrationLogs
};
