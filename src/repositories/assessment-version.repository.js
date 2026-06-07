import { prisma } from "../lib/prisma.js";

const ASSESSMENT_VERSION_SELECT = {
  id: true,
  tenantId: true,
  assessmentId: true,
  versionNumber: true,
  parentVersionId: true,
  sourceEntityId: true,
  sourceRevisionHash: true,
  versionStatus: true,
  enrollmentStartAt: true,
  enrollmentEndAt: true,
  practiceStartAt: true,
  startsAt: true,
  endsAt: true,
  durationMinutes: true,
  attemptLimit: true,
  slotCode: true,
  slotStartAt: true,
  slotEndAt: true,
  resultStatusMirror: true,
  resultPublishedAtMirror: true,
  legacyWorkflowStage: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true
};

function getDb(dbClient) {
  return dbClient || prisma;
}

async function findAssessmentVersionById({ tenantId, assessmentVersionId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentVersion.findFirst({
    where: {
      id: assessmentVersionId,
      tenantId
    },
    select: ASSESSMENT_VERSION_SELECT
  });
}

async function findLatestAssessmentVersion({ tenantId, assessmentId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentVersion.findFirst({
    where: {
      tenantId,
      assessmentId
    },
    orderBy: [{ versionNumber: "desc" }],
    select: ASSESSMENT_VERSION_SELECT
  });
}

async function createAssessmentVersion(data, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentVersion.create({
    data,
    select: ASSESSMENT_VERSION_SELECT
  });
}

async function updateAssessmentVersion({ assessmentVersionId, data }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentVersion.update({
    where: {
      id: assessmentVersionId
    },
    data,
    select: ASSESSMENT_VERSION_SELECT
  });
}

async function supersedeCurrentVersions({ tenantId, assessmentId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentVersion.updateMany({
    where: {
      tenantId,
      assessmentId,
      versionStatus: "CURRENT"
    },
    data: {
      versionStatus: "SUPERSEDED"
    }
  });
}

export {
  ASSESSMENT_VERSION_SELECT,
  findAssessmentVersionById,
  findLatestAssessmentVersion,
  createAssessmentVersion,
  updateAssessmentVersion,
  supersedeCurrentVersions
};
