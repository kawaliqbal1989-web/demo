import { prisma } from "../lib/prisma.js";

const ASSESSMENT_PARTICIPANT_SELECT = {
  id: true,
  tenantId: true,
  assessmentVersionId: true,
  studentId: true,
  participantType: true,
  sourceEntityType: true,
  sourceEntityId: true,
  sourceContainerType: true,
  sourceContainerId: true,
  levelId: true,
  hierarchyNodeId: true,
  teacherUserId: true,
  includedInAssessment: true,
  participantStatus: true,
  legacyStatusMirror: true,
  enrolledAt: true,
  createdAt: true,
  updatedAt: true
};

function getDb(dbClient) {
  return dbClient || prisma;
}

async function listAssessmentParticipantsByVersion({ tenantId, assessmentVersionId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentParticipant.findMany({
    where: {
      tenantId,
      assessmentVersionId
    },
    select: ASSESSMENT_PARTICIPANT_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
}

async function createAssessmentParticipant(data, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentParticipant.create({
    data,
    select: ASSESSMENT_PARTICIPANT_SELECT
  });
}

async function createAssessmentParticipants(records, dbClient) {
  if (!Array.isArray(records) || !records.length) {
    return { count: 0 };
  }

  const db = getDb(dbClient);
  return db.assessmentParticipant.createMany({
    data: records,
    skipDuplicates: true
  });
}

async function deleteAssessmentParticipantsByVersion({ tenantId, assessmentVersionId }, dbClient) {
  const db = getDb(dbClient);
  return db.assessmentParticipant.deleteMany({
    where: {
      tenantId,
      assessmentVersionId
    }
  });
}

export {
  ASSESSMENT_PARTICIPANT_SELECT,
  listAssessmentParticipantsByVersion,
  createAssessmentParticipant,
  createAssessmentParticipants,
  deleteAssessmentParticipantsByVersion
};
