import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("COMPETITION WORKFLOW HARDENING", () => {
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

  async function createCompetitionAsCenter() {
    const title = `Comp ${randomId("wf")}`;

    const createResponse = await http
      .post("/api/competitions")
      .set(authHeader(centerToken))
      .send({
        title,
        description: "workflow hardening test",
        startsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 7200 * 1000).toISOString(),
        hierarchyNodeId: school.id,
        levelId: level1.id
      });

    expect(createResponse.status).toBe(201);
    return createResponse.body.data.id;
  }

  test("reject requires reason (no partial writes)", async () => {
    const competitionId = await createCompetitionAsCenter();

    const rejectResponse = await http
      .post(`/api/competitions/${competitionId}/reject`)
      .set(authHeader(centerToken))
      .send({});

    expect(rejectResponse.status).toBe(400);
    expect(rejectResponse.body.error_code).toBe("REJECT_REASON_REQUIRED");

    const dbCompetition = await prisma.competition.findUniqueOrThrow({ where: { id: competitionId } });
    expect(dbCompetition.workflowStage).toBe("CENTER_REVIEW");
    expect(dbCompetition.rejectedAt).toBeNull();
    expect(dbCompetition.rejectedByUserId).toBeNull();

    const transitions = await prisma.competitionStageTransition.findMany({
      where: {
        tenantId: tenant.id,
        competitionId
      }
    });

    expect(transitions.length).toBe(0);
  });

  test("reject prevents further transitions", async () => {
    const competitionId = await createCompetitionAsCenter();

    const rejectResponse = await http
      .post(`/api/competitions/${competitionId}/reject`)
      .set(authHeader(centerToken))
      .send({ reason: "Insufficient details" });

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.data.workflowStage).toBe("REJECTED");
    expect(rejectResponse.body.data.rejectedAt).toBeTruthy();

    const forwardAfterReject = await http
      .post(`/api/competitions/${competitionId}/forward-request`)
      .set(authHeader(centerToken));

    expect(forwardAfterReject.status).toBe(409);
    expect(forwardAfterReject.body.error_code).toBe("WORKFLOW_REJECTED");

    const superadminForwardAfterReject = await http
      .post(`/api/competitions/${competitionId}/forward-request`)
      .set(authHeader(superadminToken));

    expect(superadminForwardAfterReject.status).toBe(409);
    expect(superadminForwardAfterReject.body.error_code).toBe("WORKFLOW_REJECTED");

    const transitions = await prisma.competitionStageTransition.findMany({
      where: {
        tenantId: tenant.id,
        competitionId
      }
    });

    expect(transitions.length).toBe(1);
    expect(transitions[0].action).toBe("REJECT");
    expect(transitions[0].toStage).toBe("REJECTED");
  });

  test("backward/skip role transitions are denied", async () => {
    const competitionId = await createCompetitionAsCenter();

    const bpForward = await http
      .post(`/api/competitions/${competitionId}/forward-request`)
      .set(authHeader(bpToken));

    expect(bpForward.status).toBe(409);
    expect(bpForward.body.error_code).toBe("WORKFLOW_STAGE_CONFLICT");

    const bpReject = await http
      .post(`/api/competitions/${competitionId}/reject`)
      .set(authHeader(bpToken))
      .send({ reason: "Not my stage" });

    expect(bpReject.status).toBe(409);
    expect(bpReject.body.error_code).toBe("WORKFLOW_STAGE_CONFLICT");

    const transitions = await prisma.competitionStageTransition.findMany({
      where: {
        tenantId: tenant.id,
        competitionId
      }
    });

    expect(transitions.length).toBe(0);
  });

  test("immutable transition log records forward + reject in order", async () => {
    const competitionId = await createCompetitionAsCenter();

    const forwardResponse = await http
      .post(`/api/competitions/${competitionId}/forward-request`)
      .set(authHeader(centerToken));

    expect(forwardResponse.status).toBe(200);
    expect(forwardResponse.body.data.workflowStage).toBe("FRANCHISE_REVIEW");

    const rejectResponse = await http
      .post(`/api/competitions/${competitionId}/reject`)
      .set(authHeader(franchiseToken))
      .send({ reason: "Missing paperwork" });

    expect(rejectResponse.status).toBe(200);
    expect(rejectResponse.body.data.workflowStage).toBe("REJECTED");

    const transitions = await prisma.competitionStageTransition.findMany({
      where: {
        tenantId: tenant.id,
        competitionId
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    expect(transitions.length).toBe(2);

    expect(transitions[0]).toMatchObject({
      tenantId: tenant.id,
      competitionId,
      fromStage: "CENTER_REVIEW",
      toStage: "FRANCHISE_REVIEW",
      action: "FORWARD"
    });

    expect(transitions[1]).toMatchObject({
      tenantId: tenant.id,
      competitionId,
      fromStage: "FRANCHISE_REVIEW",
      toStage: "REJECTED",
      action: "REJECT",
      reason: "Missing paperwork"
    });
  });
});
