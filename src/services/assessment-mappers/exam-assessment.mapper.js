import { buildAssessmentSourceRevisionHash } from "./assessment-hash.service.js";

function asDate(value) {
  return value ? new Date(value) : null;
}

function mapExamCycleToAssessment({ tenantId, examCycle, actorUserId }) {
  return {
    tenantId,
    assessmentType: "EXAM",
    sourceSystem: "EXAM_CYCLE",
    sourceEntityId: examCycle.id,
    title: examCycle.name,
    description: null,
    levelId: null,
    hierarchyNodeId: null,
    businessPartnerId: examCycle.businessPartnerId || null,
    courseId: null,
    status: "ACTIVE",
    createdByUserId: actorUserId || examCycle.createdByUserId
  };
}

function mapExamCycleToAssessmentVersion({ tenantId, assessmentId, examCycle, actorUserId, versionNumber = 1, parentVersionId = null }) {
  const revisionPayload = {
    examCycle: {
      id: examCycle.id,
      enrollmentStartAt: examCycle.enrollmentStartAt,
      enrollmentEndAt: examCycle.enrollmentEndAt,
      practiceStartAt: examCycle.practiceStartAt,
      examStartsAt: examCycle.examStartsAt,
      examEndsAt: examCycle.examEndsAt,
      examDurationMinutes: examCycle.examDurationMinutes,
      attemptLimit: examCycle.attemptLimit,
      resultStatus: examCycle.resultStatus,
      resultPublishedAt: examCycle.resultPublishedAt
    }
  };

  return {
    tenantId,
    assessmentId,
    versionNumber,
    parentVersionId,
    sourceEntityId: examCycle.id,
    sourceRevisionHash: buildAssessmentSourceRevisionHash(revisionPayload),
    versionStatus: "CURRENT",
    enrollmentStartAt: asDate(examCycle.enrollmentStartAt),
    enrollmentEndAt: asDate(examCycle.enrollmentEndAt),
    practiceStartAt: asDate(examCycle.practiceStartAt),
    startsAt: asDate(examCycle.examStartsAt),
    endsAt: asDate(examCycle.examEndsAt),
    durationMinutes: examCycle.examDurationMinutes ?? null,
    attemptLimit: examCycle.attemptLimit ?? null,
    slotCode: null,
    slotStartAt: null,
    slotEndAt: null,
    resultStatusMirror: examCycle.resultStatus || null,
    resultPublishedAtMirror: asDate(examCycle.resultPublishedAt),
    legacyWorkflowStage: null,
    createdByUserId: actorUserId || examCycle.createdByUserId
  };
}

function mapExamWorksheetsToAssessmentPapers({
  tenantId,
  assessmentVersionId,
  worksheets = []
}) {
  return worksheets.map((worksheet) => ({
    tenantId,
    assessmentVersionId,
    worksheetId: worksheet.id,
    paperType: "COMMON",
    sourceMode: worksheet.generationMode ? "EXAM_GENERATED" : "EXAM_SELECTED_BASE",
    levelId: worksheet.levelId || null,
    sourceListId: null,
    sourceLevelId: worksheet.levelId || null,
    sourceStudentId: null,
    sourceWorksheetId: worksheet.id,
    generationSeedMirror: worksheet.generationSeed || null,
    isPrimaryPaper: true
  }));
}

function mapExamEntriesToAssessmentParticipants({ tenantId, assessmentVersionId, examCycleId, entries = [] }) {
  return entries.map((entry) => ({
    tenantId,
    assessmentVersionId,
    studentId: entry.studentId,
    participantType: "STUDENT",
    sourceEntityType: "EXAM_CYCLE",
    sourceEntityId: examCycleId,
    sourceContainerType: entry.listId ? "EXAM_ENROLLMENT_LIST" : null,
    sourceContainerId: entry.listId || null,
    levelId: entry.enrolledLevelId || null,
    hierarchyNodeId: null,
    teacherUserId: entry.sourceTeacherUserId || null,
    includedInAssessment: true,
    participantStatus: "ACTIVE",
    legacyStatusMirror: entry.isTemporary ? "TEMP" : "REGULAR",
    enrolledAt: asDate(entry.createdAt)
  }));
}

export {
  mapExamCycleToAssessment,
  mapExamCycleToAssessmentVersion,
  mapExamWorksheetsToAssessmentPapers,
  mapExamEntriesToAssessmentParticipants
};
