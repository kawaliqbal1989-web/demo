import { jest } from "@jest/globals";
import {
  getCenterBatchHealthAnalytics,
  getCenterOperationalOverviewAnalytics
} from "../../src/services/center-operational-analytics.service.js";

function createMockTx({ asOfDate, centerScope } = {}) {
  const currentSnapshot = {
    snapshotDate: new Date("2026-05-10T00:00:00.000Z"),
    activeStudents: 3,
    attendancePercent: 82,
    monthlyRevenue: 10000,
    pendingFees: 1200,
    teacherCount: 1,
    studentGrowthPercent: 5,
    retentionPercent: 90,
    healthScore: 78
  };

  const previousSnapshot = {
    snapshotDate: new Date("2026-05-09T00:00:00.000Z"),
    activeStudents: 3,
    attendancePercent: 90,
    monthlyRevenue: 9800,
    pendingFees: 900,
    teacherCount: 1,
    studentGrowthPercent: 4,
    retentionPercent: 91,
    healthScore: 80
  };

  const batch = {
    id: "batch-1",
    name: "Batch Alpha",
    levelId: "level-1",
    primaryTeacherUserId: "teacher-1",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: asOfDate,
    level: {
      id: "level-1",
      name: "Level 1"
    }
  };

  const enrollments = [
    {
      studentId: "student-1",
      batchId: "batch-1",
      assignedTeacherUserId: "teacher-1",
      student: {
        id: "student-1",
        admissionNo: "A-001",
        firstName: "Asha",
        lastName: "One",
        isActive: true,
        createdAt: new Date("2026-04-15T00:00:00.000Z"),
        currentTeacherUserId: "teacher-1",
        levelId: "level-1"
      },
      batch
    },
    {
      studentId: "student-2",
      batchId: "batch-1",
      assignedTeacherUserId: "teacher-1",
      student: {
        id: "student-2",
        admissionNo: "A-002",
        firstName: "Bina",
        lastName: "Two",
        isActive: true,
        createdAt: new Date("2026-04-15T00:00:00.000Z"),
        currentTeacherUserId: "teacher-1",
        levelId: "level-1"
      },
      batch
    },
    {
      studentId: "student-3",
      batchId: "batch-1",
      assignedTeacherUserId: "teacher-1",
      student: {
        id: "student-3",
        admissionNo: "A-003",
        firstName: "Chirag",
        lastName: "Three",
        isActive: true,
        createdAt: new Date("2026-04-15T00:00:00.000Z"),
        currentTeacherUserId: "teacher-1",
        levelId: "level-1"
      },
      batch
    }
  ];

  const attendanceEntries = [
    ...[
      "2026-05-09T00:00:00.000Z",
      "2026-05-08T00:00:00.000Z",
      "2026-05-07T00:00:00.000Z",
      "2026-05-06T00:00:00.000Z"
    ].flatMap((dateValue, index) => ([
      {
        studentId: "student-1",
        status: "PRESENT",
        session: {
          id: `s1-${index}`,
          date: new Date(dateValue),
          batchId: "batch-1",
          batch: { name: "Batch Alpha" }
        }
      },
      {
        studentId: "student-2",
        status: index === 0 ? "PRESENT" : "ABSENT",
        session: {
          id: `s2-${index}`,
          date: new Date(dateValue),
          batchId: "batch-1",
          batch: { name: "Batch Alpha" }
        }
      }
    ])),
    ...[
      "2026-04-25T00:00:00.000Z",
      "2026-04-24T00:00:00.000Z",
      "2026-04-23T00:00:00.000Z",
      "2026-04-22T00:00:00.000Z"
    ].flatMap((dateValue, index) => ([
      {
        studentId: "student-1",
        status: "PRESENT",
        session: {
          id: `p1-${index}`,
          date: new Date(dateValue),
          batchId: "batch-1",
          batch: { name: "Batch Alpha" }
        }
      },
      {
        studentId: "student-2",
        status: "PRESENT",
        session: {
          id: `p2-${index}`,
          date: new Date(dateValue),
          batchId: "batch-1",
          batch: { name: "Batch Alpha" }
        }
      }
    ]))
  ];

  const worksheetAssignments = [
    {
      worksheetId: "worksheet-1",
      studentId: "student-1",
      assignedAt: new Date("2026-05-01T00:00:00.000Z"),
      dueDate: new Date("2026-05-05T00:00:00.000Z"),
      worksheet: {
        id: "worksheet-1",
        title: "Worksheet 1",
        examCycleId: null
      }
    },
    {
      worksheetId: "worksheet-2",
      studentId: "student-2",
      assignedAt: new Date("2026-05-01T00:00:00.000Z"),
      dueDate: new Date("2026-05-05T00:00:00.000Z"),
      worksheet: {
        id: "worksheet-2",
        title: "Worksheet 2",
        examCycleId: null
      }
    },
    {
      worksheetId: "worksheet-3",
      studentId: "student-3",
      assignedAt: new Date("2026-04-20T00:00:00.000Z"),
      dueDate: new Date("2026-04-25T00:00:00.000Z"),
      worksheet: {
        id: "worksheet-3",
        title: "Worksheet 3",
        examCycleId: null
      }
    },
    {
      worksheetId: "worksheet-4",
      studentId: "student-3",
      assignedAt: new Date("2026-04-18T00:00:00.000Z"),
      dueDate: new Date("2026-04-22T00:00:00.000Z"),
      worksheet: {
        id: "worksheet-4",
        title: "Worksheet 4",
        examCycleId: null
      }
    },
    {
      worksheetId: "worksheet-5",
      studentId: "student-2",
      assignedAt: new Date("2026-04-17T00:00:00.000Z"),
      dueDate: new Date("2026-04-21T00:00:00.000Z"),
      worksheet: {
        id: "worksheet-5",
        title: "Worksheet 5",
        examCycleId: null
      }
    }
  ];

  const worksheetSubmissions = [
    {
      worksheetId: "worksheet-1",
      studentId: "student-1",
      score: 92,
      status: "REVIEWED",
      submittedAt: new Date("2026-05-03T00:00:00.000Z"),
      finalSubmittedAt: new Date("2026-05-03T00:00:00.000Z"),
      completionTimeSeconds: 900
    },
    {
      worksheetId: "worksheet-2",
      studentId: "student-2",
      score: null,
      status: "PENDING",
      submittedAt: new Date("2026-05-02T00:00:00.000Z"),
      finalSubmittedAt: new Date("2026-05-02T00:00:00.000Z"),
      completionTimeSeconds: 1200
    }
  ];

  return {
    centerProfile: {
      findFirst: jest.fn().mockResolvedValue({
        id: centerScope.center.id,
        code: centerScope.center.code,
        name: centerScope.center.name,
        displayName: centerScope.center.name,
        authUserId: centerScope.center.authUserId,
        franchiseProfileId: centerScope.center.franchiseId,
        authUser: {
          hierarchyNodeId: centerScope.center.hierarchyNodeId,
          username: "center.user",
          email: "center.user@example.com"
        },
        franchiseProfile: {
          id: centerScope.center.franchiseId,
          businessPartnerId: centerScope.center.businessPartnerId
        }
      })
    },
    centerAnalyticsSnapshot: {
      findFirst: jest.fn()
        .mockResolvedValueOnce(currentSnapshot)
        .mockResolvedValueOnce(previousSnapshot)
    },
    batch: {
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        expect(where.hierarchyNodeId).toBe(centerScope.center.hierarchyNodeId);
        return [batch];
      })
    },
    enrollment: {
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        expect(where.hierarchyNodeId).toBe(centerScope.center.hierarchyNodeId);
        return enrollments;
      })
    },
    teacherProfile: {
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        expect(where.hierarchyNodeId).toBe(centerScope.center.hierarchyNodeId);
        return [
          {
            authUserId: "teacher-1",
            fullName: "Teacher One",
            createdAt: new Date("2026-04-01T00:00:00.000Z"),
            updatedAt: asOfDate,
            authUser: {
              username: "teacher.one",
              email: "teacher.one@example.com"
            }
          }
        ];
      })
    },
    student: {
      count: jest.fn().mockImplementation(async ({ where }) => {
        if (where?.createdAt) {
          return 1;
        }

        return 3;
      })
    },
    batchTeacherAssignment: {
      findMany: jest.fn().mockResolvedValue([
        {
          batchId: "batch-1",
          teacherUserId: "teacher-1"
        }
      ])
    },
    attendanceEntry: {
      findMany: jest.fn().mockImplementation(async ({ where }) => {
        expect(where.session.is.hierarchyNodeId).toBe(centerScope.center.hierarchyNodeId);
        return attendanceEntries;
      })
    },
    attendanceSession: {
      groupBy: jest.fn().mockResolvedValue([
        {
          batchId: "batch-1",
          _max: {
            date: asOfDate,
            updatedAt: asOfDate
          }
        }
      ])
    },
    worksheetAssignment: {
      findMany: jest.fn().mockResolvedValue(worksheetAssignments)
    },
    worksheetSubmission: {
      findMany: jest.fn().mockResolvedValue(worksheetSubmissions)
    },
    examEnrollmentEntry: {
      findMany: jest.fn().mockResolvedValue([])
    }
  };
}

describe("center-operational-analytics.service", () => {
  const asOfDate = new Date("2026-05-10T00:00:00.000Z");
  const centerScope = {
    center: {
      id: "center-1",
      code: "CE-001",
      name: "North Center",
      authUserId: "center-user-1",
      franchiseId: "fr-1",
      businessPartnerId: "bp-1",
      hierarchyNodeId: "node-center-1"
    }
  };

  test("computes deterministic center operational scoring, teacher coordination, and anomaly output", async () => {
    const tx = createMockTx({ asOfDate, centerScope });

    const result = await getCenterOperationalOverviewAnalytics({
      tenantId: "tenant-1",
      authUserId: "center-user-1",
      hierarchyNodeId: centerScope.center.hierarchyNodeId,
      query: {
        asOf: asOfDate.toISOString()
      },
      tx
    });

    expect(result.activeStudents).toBe(3);
    expect(result.activeTeachers).toBe(1);
    expect(result.newAdmissions7d).toBe(1);
    expect(result.activeEnrollments).toBe(3);
    expect(result.overview.operationalHealthScore).toBeGreaterThan(0);
    expect(result.kpis.attendanceHealth.value).toBeLessThan(70);
    expect(result.kpis.worksheetOperations.value).toBeLessThan(80);
    expect(result.kpis.teacherCoordination.value).toBeGreaterThan(0);
    expect(result.alerts.total).toBeGreaterThanOrEqual(2);
    expect(result.alerts.preview.map((item) => item.type)).toEqual(
      expect.arrayContaining(["ATTENDANCE_COLLAPSE", "WORKSHEET_BACKLOG"])
    );
    expect(result.meta.scope.centerId).toBe("center-1");
  });

  test("enforces center scope on batch and attendance queries", async () => {
    const tx = createMockTx({ asOfDate, centerScope });

    const result = await getCenterBatchHealthAnalytics({
      tenantId: "tenant-1",
      authUserId: "center-user-1",
      hierarchyNodeId: centerScope.center.hierarchyNodeId,
      query: {
        asOf: asOfDate.toISOString(),
        riskOnly: "true"
      },
      tx
    });

    expect(tx.batch.findMany).toHaveBeenCalledTimes(1);
    expect(tx.attendanceEntry.findMany).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      batchId: "batch-1",
      batchName: "Batch Alpha"
    });
    expect(result.meta.scope.hierarchyNodeId).toBe("node-center-1");
  });
});