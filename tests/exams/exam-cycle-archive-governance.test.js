import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";
import { signAccessToken } from "../../src/utils/token.js";

describe("EXAM CYCLE ARCHIVE + RESTORE GOVERNANCE", () => {
  let saToken;
  let tenant;
  let partner;

  async function createExamCycle() {
    const now = Date.now();
    const response = await http
      .post("/api/exam-cycles")
      .set(authHeader(saToken))
      .send({
        businessPartnerId: partner.id,
        name: `Archive ${randomId("cycle")}`,
        enrollmentStartAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        enrollmentEndAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
        practiceStartAt: new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString(),
        examStartsAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        examEndsAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
        examDurationMinutes: 40,
        attemptLimit: 1
      });

    expect(response.status).toBe(201);
    return response.body?.data;
  }

  beforeAll(async () => {
    const saLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    saToken = saLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });

    partner = await prisma.businessPartner.findFirstOrThrow({
      where: { tenantId: tenant.id, contactEmail: "bp.manager@abacusweb.local" },
      select: { id: true }
    });
  });

  test("archive impact returns expected keys and counts", async () => {
    const cycle = await createExamCycle();

    const impact = await http
      .get(`/api/exam-cycles/${cycle.id}/archive-impact`)
      .set(authHeader(saToken));

    expect(impact.status).toBe(200);
    expect(impact.body?.data?.summary).toEqual(
      expect.objectContaining({
        enrollmentCount: expect.any(Number),
        approvedEnrollmentCount: expect.any(Number),
        resultCount: expect.any(Number),
        worksheetCount: expect.any(Number),
        certificateCount: expect.any(Number)
      })
    );
    expect(impact.body?.data?.activeDependencies).toBeDefined();
    expect(Array.isArray(impact.body?.data?.warnings)).toBe(true);
  });

  test("archive fails with wrong password", async () => {
    const cycle = await createExamCycle();

    const archive = await http
      .post(`/api/exam-cycles/${cycle.id}/archive`)
      .set(authHeader(saToken))
      .send({
        password: "WrongPass@123",
        confirmCode: cycle.code,
        archiveReason: "Archiving this cycle after completion for lifecycle governance."
      });

    expect(archive.status).toBe(401);
  });

  test("archive fails with wrong cycle code", async () => {
    const cycle = await createExamCycle();

    const archive = await http
      .post(`/api/exam-cycles/${cycle.id}/archive`)
      .set(authHeader(saToken))
      .send({
        password: "Pass@123",
        confirmCode: "WRONG-CODE",
        archiveReason: "Archiving this cycle after completion for lifecycle governance."
      });

    expect(archive.status).toBe(400);
  });

  test("archive success + audit creation + hidden from default list", async () => {
    const cycle = await createExamCycle();

    const archive = await http
      .post(`/api/exam-cycles/${cycle.id}/archive`)
      .set(authHeader(saToken))
      .send({
        password: "Pass@123",
        confirmCode: cycle.code,
        archiveReason: "Archiving this cycle after completion for lifecycle governance."
      });

    expect(archive.status).toBe(200);
    expect(archive.body?.data?.isArchived).toBe(true);

    const listedDefault = await http
      .get("/api/exam-cycles?limit=200&offset=0")
      .set(authHeader(saToken));

    expect(listedDefault.status).toBe(200);
    const defaultItems = listedDefault.body?.data?.items || [];
    expect(defaultItems.some((item) => item.id === cycle.id)).toBe(false);

    const listedArchived = await http
      .get("/api/exam-cycles?filter=ARCHIVED&limit=200&offset=0")
      .set(authHeader(saToken));

    expect(listedArchived.status).toBe(200);
    const archivedItems = listedArchived.body?.data?.items || [];
    expect(archivedItems.some((item) => item.id === cycle.id)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: {
        tenantId: tenant.id,
        entityType: "EXAM_CYCLE",
        entityId: cycle.id,
        action: "EXAM_CYCLE_ARCHIVED"
      },
      orderBy: { createdAt: "desc" }
    });

    expect(audit).toBeTruthy();
  });

  test("restore success + audit creation + visible in active list", async () => {
    const cycle = await createExamCycle();

    const archive = await http
      .post(`/api/exam-cycles/${cycle.id}/archive`)
      .set(authHeader(saToken))
      .send({
        password: "Pass@123",
        confirmCode: cycle.code,
        archiveReason: "Archiving this cycle after completion for lifecycle governance."
      });

    expect(archive.status).toBe(200);

    const restore = await http
      .post(`/api/exam-cycles/${cycle.id}/restore`)
      .set(authHeader(saToken))
      .send({ password: "Pass@123" });

    expect(restore.status).toBe(200);
    expect(restore.body?.data?.isArchived).toBe(false);

    const listedDefault = await http
      .get("/api/exam-cycles?limit=200&offset=0")
      .set(authHeader(saToken));

    expect(listedDefault.status).toBe(200);
    const defaultItems = listedDefault.body?.data?.items || [];
    expect(defaultItems.some((item) => item.id === cycle.id)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: {
        tenantId: tenant.id,
        entityType: "EXAM_CYCLE",
        entityId: cycle.id,
        action: "EXAM_CYCLE_RESTORED"
      },
      orderBy: { createdAt: "desc" }
    });

    expect(audit).toBeTruthy();
  });

  test("tenant isolation blocks archive from another tenant token", async () => {
    const cycle = await createExamCycle();

    const otherTenant = await prisma.tenant.create({
      data: {
        code: `TEN_${randomId("iso")}`,
        name: `Isolation ${randomId("tenant")}`,
        isActive: true
      },
      select: { id: true, code: true }
    });

    const outsider = await prisma.authUser.create({
      data: {
        tenantId: otherTenant.id,
        username: `outsider_${randomId("sa")}`,
        email: `outsider_${randomId("sa")}@mail.test`,
        passwordHash: "$2a$10$4fL8V5h2nY7Nq8vL7GxD2e5C7xR8ZkO2u1X3LqS8W9fY0mN4pQe8m",
        role: "SUPERADMIN",
        isActive: true
      },
      select: { id: true, tenantId: true, role: true, hierarchyNodeId: true, username: true }
    });

    const outsiderToken = signAccessToken({
      userId: outsider.id,
      tenantId: outsider.tenantId,
      role: outsider.role,
      hierarchyNodeId: outsider.hierarchyNodeId,
      username: outsider.username
    });

    const archive = await http
      .post(`/api/exam-cycles/${cycle.id}/archive`)
      .set(authHeader(outsiderToken))
      .send({
        password: "Pass@123",
        confirmCode: cycle.code,
        archiveReason: "Cross-tenant archive attempt should always be denied by tenant scope."
      });

    expect(archive.status).toBe(404);
  });
});
