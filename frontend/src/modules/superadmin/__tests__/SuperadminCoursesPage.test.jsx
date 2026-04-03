import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SuperadminCoursesPage } from "../SuperadminCoursesPage";

const serviceMocks = vi.hoisted(() => ({
  listCourses: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  archiveCourse: vi.fn(),
  deleteCourse: vi.fn()
}));

vi.mock("../../../services/coursesService", () => ({
  listCourses: serviceMocks.listCourses,
  createCourse: serviceMocks.createCourse,
  updateCourse: serviceMocks.updateCourse,
  archiveCourse: serviceMocks.archiveCourse,
  deleteCourse: serviceMocks.deleteCourse
}));

describe("SuperadminCoursesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.listCourses.mockResolvedValue({
      data: {
        items: [
          {
            id: "course-1",
            code: "ABACUS_ONLINE",
            name: "Abacus Online",
            description: "Main catalog course",
            isActive: true
          }
        ],
        limit: 20,
        offset: 0
      }
    });
    serviceMocks.deleteCourse.mockResolvedValue({
      data: {
        id: "course-1"
      }
    });
  });

  it("deletes a course from the list after confirmation", async () => {
    render(
      <MemoryRouter>
        <SuperadminCoursesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Abacus Online")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Delete course "Abacus Online" permanently/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Course" }));

    await waitFor(() => {
      expect(serviceMocks.deleteCourse).toHaveBeenCalledWith("course-1");
    });
    await waitFor(() => {
      expect(serviceMocks.listCourses).toHaveBeenCalledTimes(2);
    });
  });
});