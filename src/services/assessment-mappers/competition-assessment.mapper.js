import { buildAssessmentSourceRevisionHash } from "./assessment-hash.service.js";

function asDate(value) {
  return value ? new Date(value) : null;
}

function mapCompetitionToAssessment({ tenantId, competition, actorUserId }) {
  return {
    tenantId,
    assessmentType: "COMPETITION",
    sourceSystem: "COMPETITION",
    sourceEntityId: competition.id,
    title: competition.title,
    description: competition.description || null,
    levelId: competition.levelId || null,
    hierarchyNodeId: competition.hierarchyNodeId || null,
    businessPartnerId: null,
    courseId: null,
    status: competition.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
    createdByUserId: actorUserId || competition.createdByUserId
  };
}

function mapCompetitionToAssessmentVersion({ tenantId, assessmentId, competition, actorUserId, versionNumber = 1, parentVersionId = null }) {
  const revisionPayload = {
    competition: {
      id: competition.id,
      startsAt: competition.startsAt,
      endsAt: competition.endsAt,
      resultStatus: competition.resultStatus,
      resultPublishedAt: competition.resultPublishedAt,
      workflowStage: competition.workflowStage,
      status: competition.status
    }
  };

  return {
    tenantId,
    assessmentId,
    versionNumber,
    parentVersionId,
    sourceEntityId: competition.id,
    sourceRevisionHash: buildAssessmentSourceRevisionHash(revisionPayload),
    versionStatus: "CURRENT",
    enrollmentStartAt: null,
    enrollmentEndAt: null,
    practiceStartAt: null,
    startsAt: asDate(competition.startsAt),
    endsAt: asDate(competition.endsAt),
    durationMinutes: null,
    attemptLimit: null,
    slotCode: null,
    slotStartAt: null,
    slotEndAt: null,
    resultStatusMirror: competition.resultStatus || null,
    resultPublishedAtMirror: asDate(competition.resultPublishedAt),
    legacyWorkflowStage: competition.workflowStage || null,
    createdByUserId: actorUserId || competition.createdByUserId
  };
}

function mapCompetitionWorksheetsToAssessmentPapers({
  tenantId,
  assessmentVersionId,
  worksheets = []
}) {
  return worksheets.map((worksheet) => ({
    tenantId,
    assessmentVersionId,
    worksheetId: worksheet.id,
    paperType: "COMMON",
    sourceMode: "COMPETITION_ASSIGNED",
    levelId: worksheet.levelId || null,
    sourceListId: null,
    sourceLevelId: worksheet.levelId || null,
    sourceStudentId: null,
    sourceWorksheetId: worksheet.id,
    generationSeedMirror: worksheet.generationSeed || null,
    isPrimaryPaper: true
  }));
}

function mapCompetitionEnrollmentsToAssessmentParticipants({ tenantId, assessmentVersionId, competitionId, competition = null, enrollments = [] }) {
  return enrollments.map((enrollment) => ({
    tenantId,
    assessmentVersionId,
    studentId: enrollment.studentId,
    participantType: "STUDENT",
    sourceEntityType: "COMPETITION",
    sourceEntityId: competitionId,
    sourceContainerType: null,
    sourceContainerId: null,
    levelId: competition?.levelId || null,
    hierarchyNodeId: competition?.hierarchyNodeId || null,
    teacherUserId: null,
    includedInAssessment: Boolean(enrollment.isActive),
    participantStatus: enrollment.isActive ? "ACTIVE" : "EXCLUDED",
    legacyStatusMirror: enrollment.isActive ? "ACTIVE" : "INACTIVE",
    enrolledAt: asDate(enrollment.enrolledAt)
  }));
}

export {
  mapCompetitionToAssessment,
  mapCompetitionToAssessmentVersion,
  mapCompetitionWorksheetsToAssessmentPapers,
  mapCompetitionEnrollmentsToAssessmentParticipants
};
