import { prisma } from "../lib/prisma.js";

const ASSESSMENT_SELECT = {
  id: true,
  tenantId: true,
  assessmentType: true,
  sourceSystem: true,
  sourceEntityId: true,
  title: true,
  description: true,
  levelId: true,
  hierarchyNodeId: true,
  businessPartnerId: true,
  courseId: true,
  status: true,
  activeVersionId: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true
};

function getDb(dbClient) {
  return dbClient || prisma;
}

async function findAssessmentBySource({ tenantId, sourceSystem, sourceEntityId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessment.findFirst({
    where: {
      tenantId,
      sourceSystem,
      sourceEntityId
    },
    select: ASSESSMENT_SELECT
  });
}

async function findAssessmentById({ tenantId, assessmentId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessment.findFirst({
    where: {
      id: assessmentId,
      tenantId
    },
    select: ASSESSMENT_SELECT
  });
}

async function createAssessment(data, dbClient) {
  const db = getDb(dbClient);
  return db.assessment.create({
    data,
    select: ASSESSMENT_SELECT
  });
}

async function updateAssessment({ assessmentId, data }, dbClient) {
  const db = getDb(dbClient);
  return db.assessment.update({
    where: {
      id: assessmentId
    },
    data,
    select: ASSESSMENT_SELECT
  });
}

async function setAssessmentActiveVersion({ assessmentId, activeVersionId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessment.update({
    where: {
      id: assessmentId
    },
    data: {
      activeVersionId
    },
    select: ASSESSMENT_SELECT
  });
}

export {
  ASSESSMENT_SELECT,
  findAssessmentBySource,
  findAssessmentById,
  createAssessment,
  updateAssessment,
  setAssessmentActiveVersion
};
