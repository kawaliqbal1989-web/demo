import { expect, request, type APIRequestContext } from "@playwright/test";
import { createE2EFixture } from "./db";

const apiBaseURL = process.env.E2E_API_BASE_URL || "http://localhost:4000";

export async function apiLogin(username: string, password = "Pass@123") {
  const ctx = await request.newContext({ baseURL: apiBaseURL });
  const res = await ctx.post("/api/auth/login", {
    data: { tenantCode: "DEFAULT", username, password }
  });
  const body = await res.json();
  expect(body.success).toBeTruthy();
  const token = body.data?.access_token as string;
  expect(token).toBeTruthy();
  return { ctx, token };
}

export async function apiJson<T>(ctx: APIRequestContext, token: string, method: "GET" | "POST" | "PATCH" | "PUT", path: string, data?: unknown) {
  const res = await ctx.fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(data ? { "Content-Type": "application/json" } : {})
    },
    ...(data ? { data } : {})
  });

  const body = await res.json();
  if (!body?.success) {
    throw new Error(`${method} ${path} failed: ${res.status()} ${body?.error_code || ""} ${body?.message || ""}`);
  }
  return body as T;
}

export async function ensurePendingListForSuperadmin() {
  const fixture = await createE2EFixture();

  const { ctx: saCtx, token: saToken } = await apiLogin(fixture.users.superadmin.username, fixture.password);
  const { ctx: bpCtx, token: bpToken } = await apiLogin(fixture.users.bp.username, fixture.password);
  const { ctx: frCtx, token: frToken } = await apiLogin(fixture.users.franchise.username, fixture.password);
  const { ctx: ceCtx, token: ceToken } = await apiLogin(fixture.users.center.username, fixture.password);

  const examCycleId = fixture.examCycle.id;

  // Create a temporary student so the combined list isn't empty.
  const createdTemp = await apiJson<any>(
    ceCtx,
    ceToken,
    "POST",
    `/api/exam-cycles/${examCycleId}/temporary-students`,
    {
      students: [
        {
          firstName: "Temp",
          lastName: "E2E",
          levelId: fixture.level1.id,
          password: fixture.password
        }
      ]
    }
  );

  const tempUsers = Array.isArray(createdTemp?.data) ? createdTemp.data : [];
  const studentUsername = tempUsers?.[0]?.user?.username || null;
  if (!studentUsername) {
    throw new Error("Temporary student user not created");
  }

  await apiJson<any>(ceCtx, ceToken, "POST", `/api/exam-cycles/${examCycleId}/center-list/prepare`, {});
  const submitted = await apiJson<any>(ceCtx, ceToken, "POST", `/api/exam-cycles/${examCycleId}/center-list/submit`, {});
  expect(submitted?.data?.status).toBe("SUBMITTED_TO_FRANCHISE");

  const pendingFr = await apiJson<any>(frCtx, frToken, "GET", `/api/exam-cycles/${examCycleId}/enrollment-lists/pending`);
  const listId = (pendingFr?.data || [])[0]?.id as string;
  if (!listId) throw new Error("No franchise pending list");

  await apiJson<any>(frCtx, frToken, "POST", `/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`, {});
  await apiJson<any>(bpCtx, bpToken, "POST", `/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`, {});

  return {
    fixture,
    saCtx,
    saToken,
    examCycleId,
    listId,
    studentUsername,
    studentPassword: fixture.password
  };
}

export async function ensurePendingListForFranchise() {
  const fixture = await createE2EFixture();

  const { ctx: frCtx, token: frToken } = await apiLogin(fixture.users.franchise.username, fixture.password);
  const { ctx: ceCtx, token: ceToken } = await apiLogin(fixture.users.center.username, fixture.password);

  const examCycleId = fixture.examCycle.id;

  const createdTemp = await apiJson<any>(
    ceCtx,
    ceToken,
    "POST",
    `/api/exam-cycles/${examCycleId}/temporary-students`,
    {
      students: [
        {
          firstName: "Temp",
          lastName: "E2E",
          levelId: fixture.level1.id,
          password: fixture.password
        }
      ]
    }
  );

  const tempUsers = Array.isArray(createdTemp?.data) ? createdTemp.data : [];
  const studentUsername = tempUsers?.[0]?.user?.username || null;
  if (!studentUsername) {
    throw new Error("Temporary student user not created");
  }

  await apiJson<any>(ceCtx, ceToken, "POST", `/api/exam-cycles/${examCycleId}/center-list/prepare`, {});
  const submitted = await apiJson<any>(ceCtx, ceToken, "POST", `/api/exam-cycles/${examCycleId}/center-list/submit`, {});
  expect(submitted?.data?.status).toBe("SUBMITTED_TO_FRANCHISE");

  const pendingFr = await apiJson<any>(frCtx, frToken, "GET", `/api/exam-cycles/${examCycleId}/enrollment-lists/pending`);
  const listId = (pendingFr?.data || [])[0]?.id as string;
  if (!listId) throw new Error("No franchise pending list");

  return {
    fixture,
    examCycleId,
    listId,
    franchiseUsername: fixture.users.franchise.username,
    franchisePassword: fixture.password,
    studentUsername,
    studentPassword: fixture.password
  };
}

export async function ensurePendingListForBP() {
  const fixture = await createE2EFixture();

  const { ctx: bpCtx, token: bpToken } = await apiLogin(fixture.users.bp.username, fixture.password);
  const { ctx: frCtx, token: frToken } = await apiLogin(fixture.users.franchise.username, fixture.password);
  const { ctx: ceCtx, token: ceToken } = await apiLogin(fixture.users.center.username, fixture.password);

  const examCycleId = fixture.examCycle.id;

  await apiJson<any>(
    ceCtx,
    ceToken,
    "POST",
    `/api/exam-cycles/${examCycleId}/temporary-students`,
    {
      students: [
        {
          firstName: "Temp",
          lastName: "E2E",
          levelId: fixture.level1.id,
          password: fixture.password
        }
      ]
    }
  );

  await apiJson<any>(ceCtx, ceToken, "POST", `/api/exam-cycles/${examCycleId}/center-list/prepare`, {});
  await apiJson<any>(ceCtx, ceToken, "POST", `/api/exam-cycles/${examCycleId}/center-list/submit`, {});

  const pendingFr = await apiJson<any>(frCtx, frToken, "GET", `/api/exam-cycles/${examCycleId}/enrollment-lists/pending`);
  const listId = (pendingFr?.data || [])[0]?.id as string;
  if (!listId) throw new Error("No franchise pending list");

  const fwd = await apiJson<any>(frCtx, frToken, "POST", `/api/exam-cycles/${examCycleId}/enrollment-lists/${listId}/forward`, {});
  expect(fwd?.data?.status).toBe("SUBMITTED_TO_BUSINESS_PARTNER");

  const pendingBp = await apiJson<any>(bpCtx, bpToken, "GET", `/api/exam-cycles/${examCycleId}/enrollment-lists/pending`);
  const listId2 = (pendingBp?.data || [])[0]?.id as string;
  if (!listId2) throw new Error("No BP pending list");

  return {
    fixture,
    examCycleId,
    listId: listId2,
    bpUsername: fixture.users.bp.username,
    bpPassword: fixture.password
  };
}
