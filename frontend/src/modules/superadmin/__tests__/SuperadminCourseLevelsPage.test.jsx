import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SuperadminCourseLevelsPage } from "../SuperadminCourseLevelsPage";

const serviceMocks = vi.hoisted(() => ({
  getCourse: vi.fn(),
  listCourseLevels: vi.fn(),
  createCourseLevel: vi.fn(),
  updateCourseLevel: vi.fn(),
  deleteCourseLevel: vi.fn()
}));

vi.mock("../../../services/coursesService", () => ({
  getCourse: serviceMocks.getCourse
}));

vi.mock("../../../services/courseLevelsService", () => ({
  listCourseLevels: serviceMocks.listCourseLevels,
  createCourseLevel: serviceMocks.createCourseLevel,
  updateCourseLevel: serviceMocks.updateCourseLevel,
  deleteCourseLevel: serviceMocks.deleteCourseLevel
}));

describe("SuperadminCourseLevelsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    serviceMocks.getCourse.mockResolvedValue({
      data: {
        id: "course-1",
        name: "Abacus Online"
      }
    });

    serviceMocks.listCourseLevels.mockResolvedValue({
      data: {
        items: [
          {
            id: "level-row-1",
            levelNumber: 1,
            title: "Level 1",
            sortOrder: 1,
            isActive: true
          }
        ],
        limit: 20,
        offset: 0
      }
    });

    serviceMocks.deleteCourseLevel.mockResolvedValue({
      data: {
        id: "level-row-1"
      }
    });
  });

  it("shows extended actions and deletes a level after confirmation", async () => {
    render(
      <MemoryRouter initialEntries={["/superadmin/courses/course-1/levels"]}>
        <Routes>
          <Route path="/superadmin/courses/:id/levels" element={<SuperadminCourseLevelsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Level 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Question Bank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Worksheets" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/Delete Level 1 \(Level 1\)/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Level" }));

    await waitFor(() => {
      expect(serviceMocks.deleteCourseLevel).toHaveBeenCalledWith({
        courseId: "course-1",
        id: "level-row-1"
      });
    });

    await waitFor(() => {
      expect(serviceMocks.listCourseLevels).toHaveBeenCalledTimes(2);
    });
  });
});