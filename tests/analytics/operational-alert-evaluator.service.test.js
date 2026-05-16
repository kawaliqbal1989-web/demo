import { jest } from "@jest/globals";
import {
  evaluateBusinessPartnerOperationalAlerts,
  evaluateCenterOperationalAlerts,
  evaluateFranchiseOperationalAlerts,
  evaluateStudentEngagementAlerts,
  evaluateTeacherOperationalAlerts
} from "../../src/services/operational-alert-evaluator.service.js";

describe("operational-alert-evaluator.service", () => {
  test("evaluateBusinessPartnerOperationalAlerts normalizes passive franchise alerts into operational events", async () => {
    const resolveBusinessPartnerScope = jest.fn().mockResolvedValue({
      tenantId: "tenant-1",
      businessPartner: {
        id: "bp-1",
        code: "BP001",
        hierarchyNodeId: "node-bp-1"
      },
      franchiseIds: ["fr-1"],
      hierarchyNodeIds: ["node-bp-1", "node-fr-1"]
    });

    const getFranchiseAlertsAnalytics = jest.fn().mockResolvedValue({
      meta: {
        source: {
          mode: "snapshot",
          snapshotDate: "2026-05-09T00:00:00.000Z",
          liveFallback: false
        }
      },
      items: [
        {
          type: "LOW_ATTENDANCE",
          severity: "CRITICAL",
          centerId: "center-1",
          centerName: "Center One",
          metric: "attendancePercent",
          threshold: 75,
          observedValue: 52,
          message: "Center One attendance dropped below the operational threshold."
        },
        {
          type: "DECLINING_GROWTH",
          severity: "WARNING",
          centerId: "center-2",
          centerName: "Center Two",
          metric: "studentGrowthPercent",
          threshold: -5,
          observedValue: -8,
          message: "Center Two student growth is trending downward."
        }
      ]
    });

    const findRecipientUsers = jest.fn().mockResolvedValue([
      { id: "user-1", role: "BP" }
    ]);

    const result = await evaluateBusinessPartnerOperationalAlerts({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      snapshotDate: "2026-05-09T00:00:00.000Z",
      sourceWindowKey: "2026-05-10:1:15",
      dependencies: {
        resolveBusinessPartnerScope,
        getFranchiseAlertsAnalytics,
        findRecipientUsers
      }
    });

    expect(result.skipped).toBe(false);
    expect(result.franchiseCount).toBe(1);
    expect(result.alertCount).toBe(2);
    expect(result.targets).toEqual([
      {
        recipientUserId: "user-1",
        recipientRole: "BP",
        businessPartnerId: "bp-1",
        targetKey: "user:user-1"
      }
    ]);

    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      franchiseId: "fr-1",
      centerId: "center-1",
      type: "CRITICAL_ATTENDANCE",
      category: "ACADEMIC",
      severity: "CRITICAL",
      sourceKind: "SNAPSHOT",
      sourceWindowKey: "2026-05-10:1:15",
      deepLinkPath: "/bp/franchises/fr-1"
    });
    expect(result.events[0].activeFingerprint).toContain("rule:ATTENDANCE");
    expect(result.events[0].targets).toHaveLength(1);

    expect(result.events[1]).toMatchObject({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      franchiseId: "fr-1",
      centerId: "center-2",
      type: "WEAK_GROWTH",
      category: "RISK",
      severity: "WARNING"
    });
    expect(result.events[1].activeFingerprint).toContain("rule:WEAK_GROWTH");
  });

  test("evaluateFranchiseOperationalAlerts emits cooldown-safe franchise operational events", async () => {
    const getFranchiseOperationalAnomaliesAnalytics = jest.fn().mockResolvedValue({
      meta: {
        source: {
          mode: "snapshot",
          snapshotDate: "2026-05-10T00:00:00.000Z",
          liveFallback: false
        }
      },
      items: [
        {
          type: "INACTIVE_CENTER",
          severity: "HIGH",
          title: "North Center is inactive",
          message: "North Center has not produced recent operational activity.",
          centerId: "center-1",
          centerName: "North Center",
          metricKey: "inactiveDays",
          threshold: 21,
          observedValue: 28
        },
        {
          type: "TEACHER_INACTIVITY",
          severity: "WARNING",
          title: "Teacher One is inactive",
          message: "Teacher One has not recorded recent activity.",
          centerId: "center-1",
          centerName: "North Center",
          teacherUserId: "teacher-1",
          teacherName: "Teacher One",
          metricKey: "inactiveDays",
          threshold: 14,
          observedValue: 16
        }
      ]
    });

    const findRecipientUsers = jest.fn().mockResolvedValue([
      { id: "fr-user-1", role: "FRANCHISE" }
    ]);

    const result = await evaluateFranchiseOperationalAlerts({
      tenantId: "tenant-1",
      franchiseScope: {
        franchise: {
          id: "fr-1",
          businessPartnerId: "bp-1",
          authUserId: "fr-user-1"
        },
        hierarchyNodeIds: ["node-1"]
      },
      snapshotDate: "2026-05-10T00:00:00.000Z",
      sourceWindowKey: "2026-05-11:1:15",
      dependencies: {
        getFranchiseOperationalAnomaliesAnalytics,
        findRecipientUsers
      }
    });

    expect(result.skipped).toBe(false);
    expect(result.alertCount).toBe(2);
    expect(result.targets).toEqual([
      {
        recipientUserId: "fr-user-1",
        recipientRole: "FRANCHISE",
        businessPartnerId: "bp-1",
        franchiseId: "fr-1",
        targetKey: "user:fr-user-1"
      }
    ]);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      franchiseId: "fr-1",
      centerId: "center-1",
      type: "INACTIVE_CENTER",
      severity: "HIGH",
      deepLinkPath: "/franchise/dashboard"
    });
    expect(result.events[0].activeFingerprint).toContain("rule:INACTIVE_CENTER");
    expect(result.events[1].activeFingerprint).toContain("rule:TEACHER_INACTIVITY");
  });

  test("evaluateCenterOperationalAlerts maps center anomalies into supported operational notification events", async () => {
    const getCenterOperationalAnomaliesAnalytics = jest.fn().mockResolvedValue({
      meta: {
        source: {
          mode: "live-fallback",
          snapshotDate: "2026-05-10T00:00:00.000Z",
          liveFallback: true
        }
      },
      items: [
        {
          type: "ATTENDANCE_COLLAPSE",
          severity: "CRITICAL",
          title: "Attendance collapsed",
          message: "North Center attendance dropped sharply.",
          centerId: "center-1",
          centerName: "North Center",
          metricKey: "attendancePercent",
          threshold: 65,
          observedValue: 49
        },
        {
          type: "WORKSHEET_BACKLOG",
          severity: "HIGH",
          title: "Worksheet backlog exceeded",
          message: "North Center has overdue worksheet assignments.",
          centerId: "center-1",
          centerName: "North Center",
          metricKey: "worksheetBacklogRate",
          threshold: 25,
          observedValue: 41
        },
        {
          type: "TEACHER_INACTIVITY",
          severity: "WARNING",
          title: "Teacher inactivity detected",
          message: "Teacher One has no recent operational activity.",
          centerId: "center-1",
          centerName: "North Center",
          teacherUserId: "teacher-1",
          teacherName: "Teacher One",
          metricKey: "inactiveDays",
          threshold: 14,
          observedValue: 16
        }
      ]
    });

    const findRecipientUsers = jest.fn().mockResolvedValue([
      { id: "center-user-1", role: "CENTER" }
    ]);

    const result = await evaluateCenterOperationalAlerts({
      tenantId: "tenant-1",
      centerScope: {
        center: {
          id: "center-1",
          name: "North Center",
          authUserId: "center-user-1",
          franchiseId: "fr-1",
          businessPartnerId: "bp-1"
        }
      },
      snapshotDate: "2026-05-10T00:00:00.000Z",
      sourceWindowKey: "2026-05-11:1:15",
      dependencies: {
        getCenterOperationalAnomaliesAnalytics,
        findRecipientUsers
      }
    });

    expect(result.skipped).toBe(false);
    expect(result.alertCount).toBe(3);
    expect(result.targets).toEqual([
      {
        recipientUserId: "center-user-1",
        recipientRole: "CENTER",
        businessPartnerId: "bp-1",
        franchiseId: "fr-1",
        centerId: "center-1",
        targetKey: "user:center-user-1"
      }
    ]);
    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toMatchObject({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      franchiseId: "fr-1",
      centerId: "center-1",
      type: "CRITICAL_ATTENDANCE",
      category: "ACADEMIC",
      severity: "CRITICAL",
      sourceKind: "LIVE_FALLBACK",
      deepLinkPath: "/center/dashboard"
    });
    expect(result.events[0].activeFingerprint).toContain("rule:ATTENDANCE_COLLAPSE");
    expect(result.events[1]).toMatchObject({
      type: "UNHEALTHY_CENTER",
      category: "ACADEMIC",
      severity: "HIGH"
    });
    expect(result.events[2].activeFingerprint).toContain("rule:TEACHER_INACTIVITY");
  });

  test("evaluateStudentEngagementAlerts builds student and parent reminder events from engagement analytics", async () => {
    const listStudentEngagementCandidates = jest.fn().mockResolvedValue([
      {
        id: "student-1",
        admissionNo: "ST-1",
        firstName: "Aarav",
        lastName: "Sharma",
        hierarchyNodeId: "node-center-1",
        authUsers: [{ id: "student-user-1", email: "student-1@example.com" }],
        parentLinks: [{ parentUserId: "parent-user-1" }]
      }
    ]);

    const getStudentEngagementAnalyticsBundle = jest.fn().mockResolvedValue({
      meta: {
        source: {
          mode: "snapshot",
          snapshotDate: "2026-05-10T00:00:00.000Z",
          liveFallback: false
        }
      },
      overview: {
        engagementScore: 42,
        inactiveDays: 9,
        attendanceRate: 61,
        totalCompletedWorksheets: 7,
        pendingWorksheetCount: 3,
        examParticipationCount: 0,
        practiceActiveDays: 1,
        weakTopicCount: 3
      },
      streaks: {
        practice: {
          current: 4
        },
        attendance: {
          current: 2
        }
      },
      practiceTrends: {
        items: [
          { key: "2026-05-10", completedCount: 0 },
          { key: "2026-05-09", completedCount: 0 },
          { key: "2026-05-08", completedCount: 1 }
        ]
      }
    });

    const resolveStudentOperationalContext = jest.fn().mockResolvedValue({
      businessPartnerId: "bp-1",
      franchiseId: "fr-1",
      centerId: "center-1"
    });

    const findRecipientUsers = jest.fn().mockResolvedValue([
      { id: "parent-user-1", role: "PARENT" }
    ]);

    const result = await evaluateStudentEngagementAlerts({
      tenantId: "tenant-1",
      snapshotDate: "2026-05-10T00:00:00.000Z",
      sourceWindowKey: "2026-05-10:student:15",
      dependencies: {
        listStudentEngagementCandidates,
        getStudentEngagementAnalyticsBundle,
        resolveStudentOperationalContext,
        findRecipientUsers
      }
    });

    expect(result.skipped).toBe(false);
    expect(result.studentCount).toBe(1);
    expect(result.alertCount).toBeGreaterThanOrEqual(4);
    expect(result.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipientUserId: "student-user-1", recipientRole: "STUDENT" }),
      expect.objectContaining({ recipientUserId: "parent-user-1", recipientRole: "PARENT" })
    ]));
    expect(result.events.map((item) => item.type)).toEqual(expect.arrayContaining([
      "STUDENT_ENGAGEMENT_INACTIVE",
      "STUDENT_ENGAGEMENT_PENDING_WORKSHEETS",
      "STUDENT_ENGAGEMENT_EXAM_GAP",
      "STUDENT_ENGAGEMENT_ATTENDANCE_DECLINE"
    ]));
    expect(result.events[0]).toMatchObject({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      franchiseId: "fr-1",
      centerId: "center-1",
      sourceKind: "SNAPSHOT"
    });
    expect(result.events[0].metadata).toMatchObject({
      reminderScope: "STUDENT_ENGAGEMENT",
      studentId: "student-1"
    });
  });

  test("evaluateTeacherOperationalAlerts emits teacher-scoped productivity reminders", async () => {
    const resolveTeacherOperationalScope = jest.fn().mockResolvedValue({
      tenantId: "tenant-1",
      teacherUserId: "teacher-1",
      teacherProfileId: "teacher-profile-1",
      hierarchyNodeId: "node-center-1",
      centerId: "center-1",
      centerName: "North Center",
      franchiseId: "fr-1",
      businessPartnerId: "bp-1"
    });

    const getTeacherOperationalAnomaliesAnalytics = jest.fn().mockResolvedValue({
      meta: {
        source: {
          mode: "live-fallback",
          snapshotDate: "2026-05-10T00:00:00.000Z",
          liveFallback: true
        }
      },
      items: [
        {
          itemType: "DELAYED_ATTENDANCE_SUBMISSION",
          queueType: "ATTENDANCE",
          title: "Attendance pending for Batch A",
          summary: "Attendance for Batch A is still pending.",
          severity: "HIGH",
          priorityScore: 88,
          delayedDays: 4,
          batchId: "batch-1"
        },
        {
          itemType: "GRADING_BACKLOG",
          queueType: "GRADING",
          title: "Grading backlog requires recovery",
          summary: "Nine submissions are still pending review.",
          severity: "WARNING",
          priorityScore: 74
        }
      ]
    });

    const findRecipientUsers = jest.fn().mockResolvedValue([
      { id: "teacher-1", role: "TEACHER" }
    ]);

    const result = await evaluateTeacherOperationalAlerts({
      tenantId: "tenant-1",
      teacherScope: {
        teacherUserId: "teacher-1",
        hierarchyNodeId: "node-center-1"
      },
      snapshotDate: "2026-05-10T00:00:00.000Z",
      sourceWindowKey: "2026-05-11:1:15",
      dependencies: {
        resolveTeacherOperationalScope,
        getTeacherOperationalAnomaliesAnalytics,
        findRecipientUsers
      }
    });

    expect(result.skipped).toBe(false);
    expect(result.alertCount).toBe(2);
    expect(result.targets).toEqual([
      {
        recipientUserId: "teacher-1",
        recipientRole: "TEACHER",
        businessPartnerId: "bp-1",
        franchiseId: "fr-1",
        centerId: "center-1",
        targetKey: "user:teacher-1"
      }
    ]);
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      franchiseId: "fr-1",
      centerId: "center-1",
      type: "DELAYED_ATTENDANCE_SUBMISSION",
      category: "ACADEMIC",
      severity: "HIGH",
      deepLinkPath: "/teacher/dashboard"
    });
    expect(result.events[0].activeFingerprint).toContain("teacher:teacher-1:center:center-1");
    expect(result.events[0].activeFingerprint).toContain("rule:DELAYED_ATTENDANCE_SUBMISSION");
    expect(result.events[1].activeFingerprint).toContain("rule:GRADING_BACKLOG");
  });
});