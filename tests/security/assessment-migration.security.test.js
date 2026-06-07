import {
  authHeader,
  http,
  loginAs
} from "../helpers/test-helpers.js";

describe("assessment migration internal routes", () => {
  let superadminToken;
  let centerToken;

  beforeAll(async () => {
    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });

    superadminToken = superadminLogin.body.data.access_token;
    centerToken = centerLogin.body.data.access_token;
  });

  test("blocks non-superadmin user", async () => {
    const response = await http
      .post("/api/internal/assessment-migrations/backfill")
      .set(authHeader(centerToken))
      .send({
        limit: 1
      });

    expect(response.status).toBe(403);
  });

  test("allows superadmin to trigger backfill", async () => {
    const response = await http
      .post("/api/internal/assessment-migrations/backfill")
      .set(authHeader(superadminToken))
      .send({
        limit: 1
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.summary).toBeDefined();
    expect(typeof response.body.data.summary.processed).toBe("number");
  });

  test("allows superadmin to trigger parity", async () => {
    const response = await http
      .post("/api/internal/assessment-migrations/parity")
      .set(authHeader(superadminToken))
      .send({
        limit: 1
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.summary).toBeDefined();
    expect(typeof response.body.data.summary.processed).toBe("number");
  });

  test("allows superadmin to fetch migration status", async () => {
    const response = await http
      .get("/api/internal/assessment-migrations/status")
      .set(authHeader(superadminToken))
      .query({
        take: 5
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.logs)).toBe(true);
  });

  test("allows superadmin to run parity over GET", async () => {
    const response = await http
      .get("/api/internal/assessment-migrations/parity")
      .set(authHeader(superadminToken))
      .query({
        limit: 1
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.summary).toBeDefined();
    expect(typeof response.body.data.summary.processed).toBe("number");
  });
});
