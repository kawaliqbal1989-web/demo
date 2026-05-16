import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ParentDashboardPage } from "../ParentDashboardPage";

const parentServiceMocks = vi.hoisted(() => {
  const students = {
    "student-a": {
      studentId: "student-a",
      studentName: "Alice Student",
      relationship: "Mother",
      levelName: "Level 1",
      hierarchyNodeName: "North Center",
      engagementBand: "STEADY",
      engagementScore: 76,
      weakTopic: "Division",
      reminder: "Attendance dipped this week.",
      attendanceRate: 92,
      pendingAssignments: 1,
      practiceCurrent: 5,
      attendanceCurrent: 7,
      achievements: [
        {
          key: "attendance_consistency_90",
          title: "Attendance Anchor",
          description: "Maintained at least 90% attendance consistency.",
          icon: "📗",
          earnedAt: "2026-02-20T00:00:00.000Z"
        }
      ]
    },
    "student-b": {
      studentId: "student-b",
      studentName: "Bob Student",
      relationship: "Father",
      levelName: "Level 2",
      hierarchyNodeName: "South Center",
      engagementBand: "WATCH",
      engagementScore: 58,
      weakTopic: "Fractions",
      reminder: "Two worksheets are pending completion.",
      attendanceRate: 81,
      pendingAssignments: 2,
      practiceCurrent: 2,
      attendanceCurrent: 4,
      achievements: []
    }
  };

  function resolveStudent(params = {}) {
    return students[params.studentId] || students["student-a"];
  }

  function wrap(data) {
    return Promise.resolve({
      data: {
        data: {
          data
        }
      }
    });
  }

  return {
    getParentDashboardOverview: vi.fn((params = {}) => {
      const current = resolveStudent(params);
      return wrap({
        parent: { displayName: "Parent User" },
        linkedStudents: [
          { studentId: "student-a", studentName: "Alice Student", relationship: "Mother", levelName: "Level 1" },
          { studentId: "student-b", studentName: "Bob Student", relationship: "Father", levelName: "Level 2" }
        ],
        selectedStudent: {
          studentId: current.studentId,
          studentName: current.studentName,
          relationship: current.relationship,
          levelName: current.levelName,
          hierarchyNodeName: current.hierarchyNodeName
        },
        householdSummary: {
          studentCount: 2,
          averageEngagementScore: 67,
          atRiskStudents: 1,
          totalUnreadReminders: 2
        },
        studentOverview: {
          engagementBand: current.engagementBand,
          engagementScore: current.engagementScore,
          inactiveDays: current.studentId === "student-b" ? 4 : 1
        },
        studentStreaks: {
          practice: { current: current.practiceCurrent, best: 8, weeklyCurrent: 1, target: 14 },
          attendance: { current: current.attendanceCurrent, best: 9, weeklyCurrent: 2, target: 30 }
        }
      });
    }),
    getParentDashboardAttendance: vi.fn((params = {}) => {
      const current = resolveStudent(params);
      return wrap({
        selectedStudent: { studentId: current.studentId, studentName: current.studentName },
        summary: {
          attendanceRate: current.attendanceRate,
          presentCount: current.studentId === "student-b" ? 17 : 23,
          lateCount: 1,
          absentCount: current.studentId === "student-b" ? 3 : 1
        },
        trends: [
          { key: "1", label: "W1", attendanceRate: current.attendanceRate - 2 },
          { key: "2", label: "W2", attendanceRate: current.attendanceRate }
        ],
        recentAttendance: [
          { sessionId: "s1", sessionDate: "2026-02-24T00:00:00.000Z", status: "PRESENT", sessionStatus: "PUBLISHED" }
        ]
      });
    }),
    getParentDashboardWorksheetProgress: vi.fn((params = {}) => {
      const current = resolveStudent(params);
      return wrap({
        summary: {
          totalCompleted: current.studentId === "student-b" ? 6 : 10,
          pendingAssignments: current.pendingAssignments,
          practiceActiveDays: current.studentId === "student-b" ? 4 : 8,
          averageScore: current.studentId === "student-b" ? 73 : 88
        },
        trends: [
          { key: "1", label: "W1", completedCount: current.studentId === "student-b" ? 1 : 2 },
          { key: "2", label: "W2", completedCount: current.studentId === "student-b" ? 2 : 3 }
        ],
        assignments: [
          {
            worksheetId: "ws-1",
            worksheetTitle: current.studentId === "student-b" ? "Fractions Practice" : "Division Practice",
            status: current.pendingAssignments > 1 ? "PENDING" : "COMPLETED",
            assignedAt: "2026-02-20T00:00:00.000Z"
          }
        ],
        recentSubmissions: []
      });
    }),
    getParentDashboardEngagement: vi.fn((params = {}) => {
      const current = resolveStudent(params);
      return wrap({
        overview: {
          engagementBand: current.engagementBand,
          engagementScore: current.engagementScore,
          inactiveDays: current.studentId === "student-b" ? 4 : 1
        },
        streaks: {
          practice: { current: current.practiceCurrent, best: 8, weeklyCurrent: 1, target: 14 },
          attendance: { current: current.attendanceCurrent, best: 9, weeklyCurrent: 2, target: 30 }
        },
        weakTopics: {
          items: [{ topic: current.weakTopic }],
          summary: {
            weakTopicCount: 1,
            weakestTopic: current.weakTopic
          }
        },
        examParticipation: {
          summary: {
            totalEnrollments: current.studentId === "student-b" ? 1 : 2,
            latestEnrollmentAt: "2026-02-18T00:00:00.000Z"
          }
        }
      });
    }),
    getParentDashboardAchievements: vi.fn((params = {}) => {
      const current = resolveStudent(params);
      return wrap({
        achievements: {
          items: current.achievements,
          summary: {
            total: current.achievements.length
          }
        }
      });
    }),
    getParentDashboardReminders: vi.fn((params = {}) => {
      const current = resolveStudent(params);
      return wrap({
        linkedStudents: [
          { studentId: "student-a", studentName: "Alice Student", relationship: "Mother", levelName: "Level 1" },
          { studentId: "student-b", studentName: "Bob Student", relationship: "Father", levelName: "Level 2" }
        ],
        items: [
          {
            id: `${current.studentId}-reminder`,
            type: "STUDENT_ENGAGEMENT_ATTENDANCE_DECLINE",
            isUnread: true,
            message: current.reminder,
            createdAt: "2026-02-24T00:00:00.000Z"
          }
        ],
        total: 1,
        unreadCount: 1
      });
    })
  };
});

vi.mock("../../../services/parentDashboardService", () => parentServiceMocks);

describe("ParentDashboardPage", () => {
  it("renders parent visibility panels and switches linked student scope", async () => {
    render(
      <MemoryRouter>
        <ParentDashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Parent Dashboard" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Attendance visibility" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Worksheet completion visibility" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Engagement trend visibility" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Streak visibility" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Achievement visibility" })).toBeInTheDocument();
    expect(await screen.findByText(/Attendance dipped this week/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Bob Student/i }));

    expect((await screen.findAllByText("Fractions")).length).toBeGreaterThan(0);
    expect(await screen.findByText(/Two worksheets are pending completion/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(parentServiceMocks.getParentDashboardOverview).toHaveBeenCalledWith({ studentId: "student-b" });
    });
  });
});