import {
  buildFranchiseOperationalOverview,
  buildTeacherOperationalItem,
  computeCenterOperationalProfile,
  detectFranchiseOperationalAnomalies
} from "../../src/services/franchise-analytics.service.js";

describe("franchise-analytics.service", () => {
  test("computeCenterOperationalProfile produces deterministic center health scoring", () => {
    const center = {
      id: "center-1",
      code: "C001",
      name: "North Center",
      displayName: "North Center",
      status: "ACTIVE",
      authUser: {
        hierarchyNodeId: "node-1"
      }
    };

    const result = computeCenterOperationalProfile({
      center,
      row: {
        activeStudents: 35,
        attendancePercent: 92,
        monthlyRevenue: 1000,
        pendingFees: 100,
        teacherCount: 2,
        studentGrowthPercent: 10,
        retentionPercent: 88,
        worksheetAssignedCount: 20,
        worksheetCompletedCount: 18,
        examParticipationCount: 12,
        lastActivityAt: new Date("2026-05-10T08:00:00.000Z")
      },
      previousRow: {
        attendancePercent: 89,
        healthScore: 80
      },
      referenceDate: new Date("2026-05-11T00:00:00.000Z")
    });

    expect(result.healthScore).toBeCloseTo(88.88, 2);
    expect(result.teacherAvailabilityPercent).toBe(100);
    expect(result.attendanceStabilityPercent).toBe(97);
    expect(result.operationalTrendScore).toBeCloseTo(58.88, 2);
    expect(result.isWeakCenter).toBe(false);
    expect(result.isInactive).toBe(false);
  });

  test("buildTeacherOperationalItem flags inactive teachers deterministically", () => {
    const result = buildTeacherOperationalItem({
      teacher: {
        id: "teacher-profile-1",
        authUserId: "teacher-1",
        fullName: "Teacher One",
        hierarchyNodeId: "node-1",
        authUser: {
          username: "teacher.one",
          email: "teacher.one@example.com"
        }
      },
      metrics: {
        activeStudents: 22,
        activeBatches: 3,
        attendanceEntries: 10,
        presentEntries: 7,
        assignedWorksheets: 12,
        reviewedSubmissions: 4,
        examParticipationCount: 6,
        lastActivityAt: new Date("2026-04-20T10:00:00.000Z")
      },
      centerByNodeId: new Map([
        ["node-1", { id: "center-1", code: "C001", name: "North Center", displayName: "North Center" }]
      ]),
      referenceDate: new Date("2026-05-11T00:00:00.000Z")
    });

    expect(result.centerId).toBe("center-1");
    expect(result.attendanceCompliancePercent).toBe(70);
    expect(result.worksheetReviewRate).toBe(33.33);
    expect(result.inactiveDays).toBe(20);
    expect(result.isInactive).toBe(true);
    expect(result.status).toBe("INACTIVE");
  });

  test("detectFranchiseOperationalAnomalies includes center and teacher operational risks with stable fingerprints", () => {
    const anomalies = detectFranchiseOperationalAnomalies({
      franchiseId: "fr-1",
      centerRows: [
        {
          centerId: "center-1",
          centerName: "North Center",
          isInactive: true,
          inactiveDays: 30,
          lastActivityAt: new Date("2026-04-10T00:00:00.000Z"),
          attendancePercent: 48,
          worksheetAssignedCount: 12,
          worksheetCompletionRate: 25,
          studentGrowthPercent: -12,
          healthScore: 39,
          operationalTrendScore: 28
        }
      ],
      teacherRows: [
        {
          teacherUserId: "teacher-1",
          teacherName: "Teacher One",
          centerId: "center-1",
          centerName: "North Center",
          inactiveDays: 18,
          lastActivityAt: new Date("2026-04-22T00:00:00.000Z"),
          isInactive: true
        }
      ]
    });

    expect(anomalies.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        "INACTIVE_CENTER",
        "ATTENDANCE_COLLAPSE",
        "WORKSHEET_BACKLOG",
        "CENTER_GROWTH_DECLINE",
        "CENTER_OPERATIONAL_RISK",
        "TEACHER_INACTIVITY"
      ])
    );

    expect(anomalies.find((item) => item.type === "INACTIVE_CENTER")?.fingerprint).toBe(
      "franchise:fr-1:center:center-1:teacher:none:rule:INACTIVE_CENTER"
    );
    expect(anomalies.find((item) => item.type === "TEACHER_INACTIVITY")?.fingerprint).toBe(
      "franchise:fr-1:center:center-1:teacher:teacher-1:rule:TEACHER_INACTIVITY"
    );
  });

  test("buildFranchiseOperationalOverview preserves snapshot fallback metadata", () => {
    const result = buildFranchiseOperationalOverview({
      franchise: {
        id: "fr-1",
        businessPartnerId: "bp-1"
      },
      franchiseScope: {
        franchise: {
          id: "fr-1",
          businessPartnerId: "bp-1"
        },
        hierarchyNodeIds: ["node-1"]
      },
      asOfDate: new Date("2026-05-11T00:00:00.000Z"),
      source: {
        mode: "snapshot",
        snapshotDate: "2026-05-10T00:00:00.000Z",
        liveFallback: true
      },
      centerRows: [
        {
          centerId: "center-1",
          centerStatus: "ACTIVE",
          activeStudents: 40,
          teacherCount: 2,
          attendancePercent: 80,
          worksheetAssignedCount: 10,
          worksheetCompletedCount: 7,
          examParticipationCount: 8,
          isWeakCenter: true,
          isInactive: false,
          healthScore: 58,
          operationalTrendScore: 42,
          centerName: "North Center"
        }
      ],
      teacherRows: [
        {
          teacherUserId: "teacher-1",
          isInactive: true
        }
      ],
      currentFranchiseSnapshot: {
        activeStudents: 40,
        studentCount: 44,
        attendancePercent: 80,
        studentGrowthPercent: -4,
        healthScore: 58
      }
    });

    expect(result.operationalOverview.activeCenters).toBe(1);
    expect(result.operationalOverview.weakCenters).toBe(1);
    expect(result.operationalOverview.inactiveCenters).toBe(0);
    expect(result.operationalOverview.operationalAnomalyCount).toBeGreaterThanOrEqual(2);
    expect(result.highlights.inactiveTeacherUserIds).toEqual(["teacher-1"]);
    expect(result.meta.source.liveFallback).toBe(true);
  });
});