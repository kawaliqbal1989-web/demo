import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudentDashboardPage } from "../StudentDashboardPage";

vi.mock("../../../services/studentPortalService", () => {
  return {
    getStudentMe: vi.fn(async () => ({
      data: {
        data: {
          fullName: "Test Student",
          studentCode: "ST-001",
          username: "ST-001",
          activeEnrollmentsCount: 2,
          assignedWorksheetsCount: 5,
          status: "ACTIVE",
          dateOfBirth: "2015-01-01T00:00:00.000Z",
          guardianName: "Test Guardian",
          guardianPhone: "9999999999",
          email: "test@student.local",
          centerName: "Test Center",
          centerCode: "CE101"
        }
      }
    })),
    getStudentPracticeReport: vi.fn(async () => ({
      data: {
        data: {
          totalAttempts: 3,
          avgScore: 80,
          recent: [
            {
              worksheetId: "w1",
              worksheetTitle: "Worksheet 1",
              score: 90,
              total: 10,
              submittedAt: "2026-02-21T00:00:00.000Z"
            }
          ]
        }
      }
    })),
    listStudentEnrollments: vi.fn(async () => ({
      data: {
        data: [
          {
            enrollmentId: "e1",
            courseCode: "AB-L1",
            level: 1,
            levelTitle: "Level 1",
            status: "ACTIVE",
            assignedTeacherName: "Test Teacher",
            centerName: "Test Center",
            centerCode: "CE101",
            batchName: null,
            startedAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      }
    })),
    listStudentExamEnrollments: vi.fn(async () => ({
      data: {
        data: []
      }
    })),
    listStudentWorksheets: vi.fn(async () => ({
      data: {
        data: {
          total: 1,
          page: 1,
          pageSize: 20,
          items: [
            {
              worksheetId: "w1",
              title: "Worksheet 1",
              status: "NOT_STARTED"
            }
          ]
        }
      }
    })),
    listStudentAttendance: vi.fn(async () => ({
      data: {
        data: []
      }
    })),
    getStudentWeakTopics: vi.fn(async () => ({
      data: {
        data: []
      }
    })),
    getStudentFees: vi.fn(async () => ({
      data: {
        data: {
          message: "Fee not configured for your enrollment.",
          summary: { totalFee: null, paid: null, pending: null, status: null },
          payments: []
        }
      }
    }))
  };
});

describe("StudentDashboardPage", () => {
  it("renders KPIs from API", async () => {
    render(
      <MemoryRouter>
        <StudentDashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Student Dashboard" })).toBeInTheDocument();
    expect(await screen.findByText(/Test Student/)).toBeInTheDocument();

    expect(await screen.findByText("Current Enrollment")).toBeInTheDocument();
    expect(await screen.findByText(/AB-L1/)).toBeInTheDocument();
    expect(await screen.findByText(/Test Teacher/)).toBeInTheDocument();

    expect(await screen.findByText("Practice Weak Topics")).toBeInTheDocument();
    expect(await screen.findByText("No weak topics yet.")).toBeInTheDocument();

    expect(await screen.findByText("Attendance")).toBeInTheDocument();
    expect(await screen.findByText("No attendance records yet.")).toBeInTheDocument();

    expect(await screen.findByText("Fees")).toBeInTheDocument();
    expect(await screen.findByText("Fee not configured for your enrollment.")).toBeInTheDocument();

    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(await screen.findByText("5")).toBeInTheDocument();
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(await screen.findByText("80%")).toBeInTheDocument();
  });
});
