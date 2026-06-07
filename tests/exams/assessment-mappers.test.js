import {
  mapExamCycleToAssessment,
  mapExamCycleToAssessmentVersion,
  mapCompetitionToAssessment,
  mapCompetitionToAssessmentVersion
} from "../../src/services/assessment-mappers/index.js";
import { isFeatureEnabled } from "../../src/services/feature-flags.service.js";

describe("assessment mappers", () => {
  test("maps exam cycle to assessment payload", () => {
    const examCycle = {
      id: "ec_1",
      name: "Quarterly Exam",
      businessPartnerId: "bp_1",
      createdByUserId: "usr_1"
    };

    const mapped = mapExamCycleToAssessment({
      tenantId: "tn_1",
      examCycle,
      actorUserId: "usr_2"
    });

    expect(mapped).toMatchObject({
      tenantId: "tn_1",
      assessmentType: "EXAM",
      sourceSystem: "EXAM_CYCLE",
      sourceEntityId: "ec_1",
      title: "Quarterly Exam",
      businessPartnerId: "bp_1",
      createdByUserId: "usr_2"
    });
  });

  test("maps competition to assessment payload", () => {
    const competition = {
      id: "cp_1",
      title: "District Challenge",
      description: "desc",
      status: "SCHEDULED",
      levelId: "lvl_1",
      hierarchyNodeId: "hn_1",
      createdByUserId: "usr_1"
    };

    const mapped = mapCompetitionToAssessment({
      tenantId: "tn_1",
      competition,
      actorUserId: null
    });

    expect(mapped).toMatchObject({
      tenantId: "tn_1",
      assessmentType: "COMPETITION",
      sourceSystem: "COMPETITION",
      sourceEntityId: "cp_1",
      title: "District Challenge",
      levelId: "lvl_1",
      hierarchyNodeId: "hn_1",
      createdByUserId: "usr_1"
    });
  });

  test("builds stable version hash for exam and competition", () => {
    const examVersion = mapExamCycleToAssessmentVersion({
      tenantId: "tn_1",
      assessmentId: "ass_1",
      examCycle: {
        id: "ec_1",
        enrollmentStartAt: "2026-01-01T00:00:00.000Z",
        enrollmentEndAt: "2026-01-10T00:00:00.000Z",
        practiceStartAt: "2026-01-11T00:00:00.000Z",
        examStartsAt: "2026-01-20T00:00:00.000Z",
        examEndsAt: "2026-01-20T01:00:00.000Z",
        examDurationMinutes: 60,
        attemptLimit: 1,
        resultStatus: "DRAFT",
        resultPublishedAt: null,
        createdByUserId: "usr_1"
      },
      actorUserId: null,
      versionNumber: 1
    });

    const competitionVersion = mapCompetitionToAssessmentVersion({
      tenantId: "tn_1",
      assessmentId: "ass_2",
      competition: {
        id: "cp_1",
        startsAt: "2026-02-01T00:00:00.000Z",
        endsAt: "2026-02-01T01:00:00.000Z",
        resultStatus: "DRAFT",
        resultPublishedAt: null,
        workflowStage: "CENTER_REVIEW",
        status: "DRAFT",
        createdByUserId: "usr_2"
      },
      actorUserId: null,
      versionNumber: 1
    });

    expect(examVersion.sourceRevisionHash).toHaveLength(64);
    expect(competitionVersion.sourceRevisionHash).toHaveLength(64);
  });

  test("keeps assessment cutover feature flags disabled by default", () => {
    expect(isFeatureEnabled("assessment.dualWrite")).toBe(false);
    expect(isFeatureEnabled("assessment.readCutover")).toBe(false);
  });
});
