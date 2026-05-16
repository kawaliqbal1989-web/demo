import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudentDashboardPage } from "../StudentDashboardPage";

vi.mock("../../../services/studentDashboardService", () => ({
  getStudentDashboardOverview: vi.fn(async () => ({
    data: {
      data: {
        data: {
          student: {
            studentId: "student-1",
            studentCode: "ST-001",
            studentName: "Test Student",
            levelName: "Level 1",
            hierarchyNodeName: "North Center"
          },
          overview: {
            engagementScore: 92,
            momentumScore: 61,
            engagementBand: "THRIVING",
            practiceActiveDays: 9,
            examParticipationCount: 2,
            pendingWorksheetCount: 1,
            lastActivityAt: "2026-02-24T00:00:00.000Z"
          },
          streaks: {
            practice: { current: 6, best: 11, weeklyCurrent: 2, target: 14 },
            attendance: { current: 8, best: 12, weeklyCurrent: 3, target: 30 }
          }
        },
        meta: {
          source: {
            mode: "snapshot-first"
          }
        }
      }
    }
  })),
  getStudentDashboardStreaks: vi.fn(async () => ({
    data: {
      data: {
        data: {
          practice: { current: 6, best: 11, weeklyCurrent: 2, target: 14 },
          attendance: { current: 8, best: 12, weeklyCurrent: 3, target: 30 }
        }
      }
    }
  })),
  getStudentDashboardAchievements: vi.fn(async () => ({
    data: {
      data: {
        data: {
          items: [
            {
              key: "practice_consistency_7",
              title: "Practice Rhythm",
              description: "Reached 7 active practice days in the last two weeks.",
              icon: "🎵",
              earnedAt: "2026-02-22T00:00:00.000Z"
            }
          ],
          newlyEarned: [{ title: "Practice Rhythm" }],
          nextHints: [{ description: "Reach your next weekly streak target." }],
          summary: { total: 1 }
        }
      }
    }
  })),
  getStudentDashboardPracticeTrends: vi.fn(async () => ({
    data: {
      data: {
        data: {
          items: [
            { key: "2026-02-18", label: "02-18", completedCount: 1, averageScore: 80 },
            { key: "2026-02-19", label: "02-19", completedCount: 2, averageScore: 86 },
            { key: "2026-02-20", label: "02-20", completedCount: 3, averageScore: 88 }
          ],
          summary: {
            totalCompleted: 12,
            averageScore: 84,
            pendingAssignments: 1,
            lastSubmissionAt: "2026-02-23T00:00:00.000Z"
          }
        }
      }
    }
  })),
  getStudentDashboardAttendanceTrends: vi.fn(async () => ({
    data: {
      data: {
        data: {
          items: [
            { key: "2026-02-18", label: "02-18", sessionCount: 1, attendanceRate: 100 },
            { key: "2026-02-19", label: "02-19", sessionCount: 1, attendanceRate: 100 },
            { key: "2026-02-20", label: "02-20", sessionCount: 1, attendanceRate: 80 }
          ],
          summary: {
            attendanceRate: 96,
            presentCount: 24,
            totalSessions: 25,
            lateCount: 1,
            absentCount: 0
          }
        }
      }
    }
  })),
  getStudentDashboardWeakTopics: vi.fn(async () => ({
    data: {
      data: {
        data: {
          items: [
            { topic: "Division", accuracy: 54.5, correct: 6, attempted: 11 }
          ],
          summary: {
            weakTopicCount: 1,
            weakestTopic: "Division"
          }
        }
      }
    }
  })),
  getStudentDashboardReminders: vi.fn(async () => ({
    data: {
      data: {
        data: {
          items: [
            {
              id: "rem-1",
              type: "STUDENT_ENGAGEMENT_PENDING_WORKSHEETS",
              isUnread: true,
              message: "You still have one worksheet pending review.",
              createdAt: "2026-02-24T00:00:00.000Z"
            }
          ],
          total: 1,
          unreadCount: 1
        }
      }
    }
  }))
}));

describe("StudentDashboardPage", () => {
  it("renders the engagement-focused student dashboard", async () => {
    render(
      <MemoryRouter>
        <StudentDashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Student Dashboard" })).toBeInTheDocument();
    expect(await screen.findByText("Engagement overview")).toBeInTheDocument();
    expect(await screen.findByText("Test Student")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Daily streak card" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Weekly streak summary" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Achievement gallery" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Practice trends" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Attendance consistency" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Weak-topic insights" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Operational reminders" })).toBeInTheDocument();
    expect(await screen.findByText(/Reached 7 active practice days/i)).toBeInTheDocument();
    expect((await screen.findAllByText("Division")).length).toBeGreaterThan(0);
    expect(await screen.findByText(/one worksheet pending review/i)).toBeInTheDocument();
    expect(await screen.findByText("92")).toBeInTheDocument();
  });
});