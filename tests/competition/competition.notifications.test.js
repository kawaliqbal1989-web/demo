import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("COMPETITION NOTIFICATIONS", () => {
  let tenant;
  let school;
  let level1;
  let centerToken;
  let franchiseToken;
  let bpToken;
  let superadminToken;

  beforeAll(async () => {
    const [centerLogin, franchiseLogin, bpLogin, superadminLogin] = await Promise.all([
      loginAs({ email: "center.manager@abacusweb.local" }),
      loginAs({ email: "franchise.manager@abacusweb.local" }),
      loginAs({ email: "bp.manager@abacusweb.local" }),
      loginAs({ email: "superadmin@abacusweb.local" })
    ]);

    centerToken = centerLogin.body.data.access_token;
    franchiseToken = franchiseLogin.body.data.access_token;
    bpToken = bpLogin.body.data.access_token;
    superadminToken = superadminLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    school = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });
    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });
  });

  async function createCompetition(token, title) {
    const response = await http
      .post("/api/competitions")
      .set(authHeader(token))
      .send({
        title,
        description: "competition notification workflow test",
        registrationStartsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        registrationEndsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        hierarchyNodeId: school.id,
        levelId: level1.id
      });

    expect(response.status).toBe(201);
    return response.body.data;
  }

  async function findNotifications(competitionId, title) {
    return prisma.notification.findMany({
      where: {
        tenantId: tenant.id,
        entityType: "COMPETITION",
        entityId: competitionId,
        title
      },
      include: {
        recipientUser: {
          select: {
            role: true
          }
        }
      }
    });
  }

  test("competition creation announces to BP, franchise, center, and teacher roles", async () => {
    const competition = await createCompetition(superadminToken, `Notify Create ${randomId("cmp")}`);

    const notifications = await findNotifications(competition.id, "New Competition Announced");
    const roles = new Set(notifications.map((item) => item.recipientUser.role));

    expect(roles.has("BP")).toBe(true);
    expect(roles.has("FRANCHISE")).toBe(true);
    expect(roles.has("CENTER")).toBe(true);
    expect(roles.has("TEACHER")).toBe(true);
    expect(notifications.every((item) => item.actionUrl?.includes(competition.id))).toBe(true);
    expect(notifications[0]?.message).toContain(`"${competition.title}"`);
  });

  test("submission, unlock, approval, and rejection workflow notifications are emitted", async () => {
    const competition = await createCompetition(centerToken, `Notify Flow ${randomId("cmp")}`);

    const centerForward = await http
      .post(`/api/competitions/${competition.id}/forward-request`)
      .set(authHeader(centerToken));

    expect(centerForward.status).toBe(200);
    expect(await findNotifications(competition.id, "Center Submitted Competition Registration")).toHaveLength(1);

    const unlock = await http
      .post(`/api/competitions/${competition.id}/unlock-requests`)
      .set(authHeader(centerToken))
      .send({ reason: "Need a correction" });

    expect(unlock.status).toBe(201);
    expect(await findNotifications(competition.id, "Center Requested Unlock")).toHaveLength(1);

    const franchiseForward = await http
      .post(`/api/competitions/${competition.id}/forward-request`)
      .set(authHeader(franchiseToken));

    expect(franchiseForward.status).toBe(200);
    expect(await findNotifications(competition.id, "Franchise Submitted Competition Registration")).toHaveLength(1);

    const bpForward = await http
      .post(`/api/competitions/${competition.id}/forward-request`)
      .set(authHeader(bpToken));

    expect(bpForward.status).toBe(200);
    expect(await findNotifications(competition.id, "Business Partner Submitted Competition Registration")).toHaveLength(1);

    const approve = await http
      .post(`/api/competitions/${competition.id}/forward-request`)
      .set(authHeader(superadminToken));

    expect(approve.status).toBe(200);
    const approvalNotifications = await findNotifications(competition.id, "Competition Registrations Approved");
    const approvalRoles = new Set(approvalNotifications.map((item) => item.recipientUser.role));
    expect(approvalRoles.has("BP")).toBe(true);
    expect(approvalRoles.has("FRANCHISE")).toBe(true);
    expect(approvalRoles.has("CENTER")).toBe(true);
    expect(approvalRoles.has("TEACHER")).toBe(true);
    expect(approvalNotifications[0]?.message).toContain("Question Paper Mapping will begin");

    const rejectionCompetition = await createCompetition(centerToken, `Notify Reject ${randomId("cmp")}`);
    await http.post(`/api/competitions/${rejectionCompetition.id}/forward-request`).set(authHeader(centerToken));
    await http.post(`/api/competitions/${rejectionCompetition.id}/forward-request`).set(authHeader(franchiseToken));
    await http.post(`/api/competitions/${rejectionCompetition.id}/forward-request`).set(authHeader(bpToken));

    const reject = await http
      .post(`/api/competitions/${rejectionCompetition.id}/reject`)
      .set(authHeader(superadminToken))
      .send({ reason: "Missing approval documents" });

    expect(reject.status).toBe(200);
    const rejectionNotifications = await findNotifications(rejectionCompetition.id, "Competition Registrations Rejected");
    const rejectionRoles = new Set(rejectionNotifications.map((item) => item.recipientUser.role));
    expect(rejectionRoles.has("BP")).toBe(true);
    expect(rejectionRoles.has("FRANCHISE")).toBe(true);
    expect(rejectionRoles.has("CENTER")).toBe(true);
    expect(rejectionRoles.has("TEACHER")).toBe(false);
    expect(rejectionNotifications[0]?.message).toContain("Missing approval documents");
  });
});
