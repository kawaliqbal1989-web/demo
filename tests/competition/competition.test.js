import { jest } from "@jest/globals";
import {
  getCompetitionLeaderboard,
  rankLevelRows
} from "../../src/services/competition-leaderboard.service.js";

function resultRow(overrides = {}) {
  return {
    participationId: "participation-1",
    studentId: "student-1",
    competitionCourseLevelId: "competition-level-1",
    totalScore: 90,
    completionTimeSeconds: 50,
    submissionId: "submission-1",
    submittedAt: new Date("2026-08-15T10:00:00.000Z"),
    ...overrides
  };
}

describe("Competition level ranking", () => {
  test("score desc, completion time asc and deterministic participation ID order are applied", () => {
    const ranked = rankLevelRows([
      resultRow({
        participationId: "participation-c",
        totalScore: 80,
        completionTimeSeconds: 20
      }),
      resultRow({
        participationId: "participation-b",
        totalScore: 95,
        completionTimeSeconds: 40
      }),
      resultRow({
        participationId: "participation-a",
        totalScore: 95,
        completionTimeSeconds: 40
      }),
      resultRow({
        participationId: "participation-d",
        totalScore: null,
        completionTimeSeconds: null,
        submissionId: null
      })
    ]);

    expect(ranked.map((row) => row.participationId)).toEqual([
      "participation-a",
      "participation-b",
      "participation-c",
      "participation-d"
    ]);
    expect(ranked.map((row) => row.rank)).toEqual([1, 1, 3, null]);
    expect(ranked.map((row) => row.status)).toEqual([
      "COMPLETED",
      "COMPLETED",
      "COMPLETED",
      "NOT_SUBMITTED"
    ]);
  });
});

function publishedEnrollment(overrides = {}) {
  return {
    id: "participation-1",
    studentId: "student-1",
    isTemporary: false,
    competitionCourseLevelId: "competition-level-1",
    enrolledLevelId: "level-1",
    enrolledAt: new Date("2026-08-14T10:00:00.000Z"),
    rank: 7,
    totalScore: 88,
    resultCompletionTimeSeconds: 45,
    resultSubmissionId: "submission-1",
    resultCalculatedAt: new Date("2026-08-15T10:00:00.000Z"),
    student: {
      admissionNo: "ST0001",
      firstName: "Scoped",
      lastName: "Student"
    },
    hierarchyNode: { id: "center-node-1", code: "CE001", name: "Center 1" },
    sourceTeacherUser: {
      id: "teacher-1",
      username: "TE001",
      teacherProfile: { fullName: "Teacher One" }
    },
    competitionCourseLevel: {
      levelNumber: 1,
      level: { id: "level-1", name: "Level 1", rank: 1 },
      competitionCourse: { id: "course-1", code: "AB8", name: "Abacus 8-12" }
    },
    ...overrides
  };
}

describe("Competition leaderboard snapshots", () => {
  test("published results preserve the global published rank while applying the role enrollment filter", async () => {
    const tx = {
      competition: {
        findFirst: jest.fn().mockResolvedValue({
          id: "competition-1",
          resultStatus: "PUBLISHED"
        })
      },
      competitionEnrollment: {
        findMany: jest.fn().mockResolvedValue([publishedEnrollment()])
      }
    };

    const payload = await getCompetitionLeaderboard({
      competitionId: "competition-1",
      tenantId: "tenant-1",
      enrollmentWhere: { hierarchyNodeId: "center-node-1" },
      tx
    });

    expect(tx.competitionEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          competitionId: "competition-1",
          isActive: true,
          approvedAt: { not: null },
          hierarchyNodeId: "center-node-1"
        }
      })
    );
    expect(payload.totalParticipants).toBe(1);
    expect(payload.completedParticipants).toBe(1);
    expect(payload.leaderboard[0]).toMatchObject({
      participationId: "participation-1",
      rank: 7,
      centerId: "center-node-1",
      sourceTeacherUserId: "teacher-1",
      status: "COMPLETED"
    });
  });

  test("an empty scoped result remains empty and never falls back to tenant-wide rows", async () => {
    const tx = {
      competition: {
        findFirst: jest.fn().mockResolvedValue({
          id: "competition-1",
          resultStatus: "PUBLISHED"
        })
      },
      competitionEnrollment: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };

    const payload = await getCompetitionLeaderboard({
      competitionId: "competition-1",
      tenantId: "tenant-1",
      enrollmentWhere: { id: { in: ["__NO_COMPETITION_RESULT_ROW__"] } },
      tx
    });

    expect(payload).toMatchObject({
      totalParticipants: 0,
      completedParticipants: 0,
      levels: [],
      leaderboard: []
    });
    expect(tx.competitionEnrollment.findMany.mock.calls[0][0].where.id).toEqual({
      in: ["__NO_COMPETITION_RESULT_ROW__"]
    });
  });
});
