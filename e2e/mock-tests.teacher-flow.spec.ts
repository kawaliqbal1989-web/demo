import { test, expect } from "@playwright/test";
import { apiLogin, apiJson } from "./helpers";

function randomSuffix() {
  return `${Date.now().toString(36)}_${Math.floor(Math.random() * 100000)}`;
}

test("Center status transitions and teacher save-results archive lock", async () => {
  const suffix = randomSuffix();

  let centerCtx: any = null;
  let teacherCtx: any = null;

  try {
    const centerLogin = await apiLogin("CE001");
    const teacherLogin = await apiLogin("TE001");
    centerCtx = centerLogin.ctx;
    teacherCtx = teacherLogin.ctx;

    const teachersRes = await apiJson<any>(
      centerCtx,
      centerLogin.token,
      "GET",
      "/api/teachers?limit=200&offset=0&q=TE001"
    );
    const teacherItems = teachersRes?.data?.items || teachersRes?.data || [];
    const teacher = Array.isArray(teacherItems)
      ? teacherItems.find((t: any) => t?.username === "TE001")
      : null;
    expect(teacher?.id).toBeTruthy();
    const teacherId = String(teacher.id);

    const batchRes = await apiJson<any>(
      centerCtx,
      centerLogin.token,
      "POST",
      "/api/batches",
      {
        name: `E2E MOCK BATCH ${suffix}`
      }
    );
    const batchId = String(batchRes?.data?.id || "");
    expect(batchId).toBeTruthy();

    await apiJson<any>(
      centerCtx,
      centerLogin.token,
      "PUT",
      `/api/batches/${batchId}/teachers`,
      {
        teacherUserIds: [teacherId]
      }
    );

    const studentRes = await apiJson<any>(
      centerCtx,
      centerLogin.token,
      "POST",
      "/api/students",
      {
        firstName: "E2E",
        lastName: `Mock${suffix}`
      }
    );
    const studentId = String(studentRes?.data?.id || "");
    expect(studentId).toBeTruthy();

    await apiJson<any>(
      centerCtx,
      centerLogin.token,
      "POST",
      "/api/enrollments",
      {
        studentId,
        batchId,
        assignedTeacherUserId: teacherId,
        levelId: studentRes?.data?.levelId || undefined,
        status: "ACTIVE"
      }
    );

    const createMockRes = await apiJson<any>(
      centerCtx,
      centerLogin.token,
      "POST",
      "/api/center/mock-tests",
      {
        batchId,
        title: `E2E Mock Test ${suffix}`,
        date: "2026-03-01",
        maxMarks: 100
      }
    );
    const mockTestId = String(createMockRes?.data?.id || "");
    expect(mockTestId).toBeTruthy();

    const list = await apiJson<any>(
      teacherCtx,
      teacherLogin.token,
      "GET",
      `/api/teacher/batches/${batchId}/mock-tests?limit=20&offset=0`
    );

    const listed = (list?.data?.items || []).find((item: any) => item.id === mockTestId);
    expect(listed).toBeTruthy();
    expect(listed.status).toBe("DRAFT");

    const published = await apiJson<any>(
      centerCtx,
      centerLogin.token,
      "PATCH",
      `/api/center/mock-tests/${mockTestId}/status`,
      { status: "PUBLISHED" }
    );
    expect(published?.data?.status).toBe("PUBLISHED");

    const saveRes = await teacherCtx.fetch(`/api/teacher/mock-tests/${mockTestId}/results`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${teacherLogin.token}`,
        "Content-Type": "application/json"
      },
      data: {
        results: [{ studentId, marks: 84 }]
      }
    });
    const saveBody = await saveRes.json();
    expect(saveRes.status()).toBe(200);
    expect(saveBody?.data?.updatedCount).toBe(1);

    const archived = await apiJson<any>(
      centerCtx,
      centerLogin.token,
      "PATCH",
      `/api/center/mock-tests/${mockTestId}/status`,
      { status: "ARCHIVED" }
    );
    expect(archived?.data?.status).toBe("ARCHIVED");

    const blockedSave = await teacherCtx.fetch(`/api/teacher/mock-tests/${mockTestId}/results`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${teacherLogin.token}`,
        "Content-Type": "application/json"
      },
      data: {
        results: [{ studentId, marks: 91 }]
      }
    });
    const blockedBody = await blockedSave.json();
    expect(blockedSave.status()).toBe(409);
    expect(blockedBody?.error_code).toBe("MOCK_TEST_ARCHIVED");
  } finally {
    if (teacherCtx) {
      await teacherCtx.dispose();
    }
    if (centerCtx) {
      await centerCtx.dispose();
    }
  }
});
