import bcrypt from "bcryptjs";
import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("COMPETITION", () => {
  let centerToken;
  let superadminToken;
  let tenant;
  let school;
  let level1;
  let level2;

  beforeAll(async () => {
    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
    centerToken = centerLogin.body.data.access_token;

    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
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
    level2 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 2 } });
  });

  test("Stage forward works", async () => {
    const title = `Comp ${randomId("forward")}`;
    const createResponse = await http
      .post("/api/competitions")
      .set(authHeader(centerToken))
      .send({
        title,
        description: "forward test",
        status: "DRAFT",
        startsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 7200 * 1000).toISOString(),
        hierarchyNodeId: school.id,
        levelId: level1.id
      });

    expect(createResponse.status).toBe(201);
    const competitionId = createResponse.body.data.id;

    const forwardResponse = await http
      .post(`/api/competitions/${competitionId}/forward-request`)
      .set(authHeader(centerToken));

    expect(forwardResponse.status).toBe(200);
    expect(forwardResponse.body.data.workflowStage).toBe("FRANCHISE_REVIEW");

    const dbCompetition = await prisma.competition.findUniqueOrThrow({ where: { id: competitionId } });
    expect(dbCompetition.workflowStage).toBe("FRANCHISE_REVIEW");
  });

  test("Invalid stage forward blocked", async () => {
    const title = `Comp ${randomId("invalid")}`;
    const createResponse = await http
      .post("/api/competitions")
      .set(authHeader(centerToken))
      .send({
        title,
        description: "invalid forward test",
        status: "DRAFT",
        startsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 7200 * 1000).toISOString(),
        hierarchyNodeId: school.id,
        levelId: level1.id
      });

    const competitionId = createResponse.body.data.id;

    await http
      .post(`/api/competitions/${competitionId}/forward-request`)
      .set(authHeader(centerToken));

    const secondForward = await http
      .post(`/api/competitions/${competitionId}/forward-request`)
      .set(authHeader(centerToken));

    expect(secondForward.status).toBe(409);
    expect(secondForward.body.error_code).toBe("WORKFLOW_STAGE_CONFLICT");
  });

  test("BP sees only competitions mapped to its business partner", async () => {
    const bpUser = await prisma.authUser.create({
      data: {
        tenantId: tenant.id,
        username: `bp${randomId("scope")}`,
        email: `bp${randomId("scope")}@abacusweb.local`,
        passwordHash: await bcrypt.hash("Pass@123", 10),
        role: "BP",
        isActive: true,
        hierarchyNodeId: school.id
      }
    });

    const otherBpUser = await prisma.authUser.create({
      data: {
        tenantId: tenant.id,
        username: `bp2${randomId("scope")}`,
        email: `bp2${randomId("scope")}@abacusweb.local`,
        passwordHash: await bcrypt.hash("Pass@123", 10),
        role: "BP",
        isActive: true,
        hierarchyNodeId: school.id
      }
    });

    const bpPartner = await prisma.businessPartner.create({
      data: {
        tenantId: tenant.id,
        name: `BP Scope ${randomId("bp")}`,
        code: bpUser.username,
        displayName: `BP Scope ${randomId("bp")}`,
        status: "ACTIVE",
        isActive: true,
        contactEmail: bpUser.email,
        hierarchyNodeId: school.id,
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
        gracePeriodUntil: null,
        createdByUserId: bpUser.id
      }
    });

    const otherBpPartner = await prisma.businessPartner.create({
      data: {
        tenantId: tenant.id,
        name: `BP Scope ${randomId("bp")}`,
        code: otherBpUser.username,
        displayName: `BP Scope ${randomId("bp")}`,
        status: "ACTIVE",
        isActive: true,
        contactEmail: otherBpUser.email,
        hierarchyNodeId: school.id,
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
        gracePeriodUntil: null,
        createdByUserId: otherBpUser.id
      }
    });

    const bpTokenResponse = await http.post("/api/auth/login").send({
      tenantCode: tenant.code,
      username: bpUser.username,
      password: "Pass@123"
    });

    const otherBpTokenResponse = await http.post("/api/auth/login").send({
      tenantCode: tenant.code,
      username: otherBpUser.username,
      password: "Pass@123"
    });

    const bpToken = bpTokenResponse.body.data.access_token;
    const otherBpToken = otherBpTokenResponse.body.data.access_token;

    const firstCompetition = await http
      .post("/api/competitions")
      .set(authHeader(bpToken))
      .send({
        title: `Comp ${randomId("bpvisible")}`,
        description: "bp visibility test",
        startsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 7200 * 1000).toISOString(),
        hierarchyNodeId: school.id,
        levelId: level1.id
      });

    expect(firstCompetition.status).toBe(201);

    const secondCompetition = await http
      .post("/api/competitions")
      .set(authHeader(otherBpToken))
      .send({
        title: `Comp ${randomId("bpvisible")}`,
        description: "bp visibility test",
        startsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 7200 * 1000).toISOString(),
        hierarchyNodeId: school.id,
        levelId: level1.id
      });

    expect(secondCompetition.status).toBe(201);

    const listResponse = await http
      .get("/api/competitions")
      .set(authHeader(bpToken));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.some((item) => item.id === firstCompetition.body.data.id)).toBe(true);
    expect(listResponse.body.data.some((item) => item.id === secondCompetition.body.data.id)).toBe(false);

    await prisma.businessPartner.delete({ where: { id: bpPartner.id } });
    await prisma.businessPartner.delete({ where: { id: otherBpPartner.id } });

    await prisma.competition.deleteMany({ where: { createdByUserId: { in: [bpUser.id, otherBpUser.id] } } });
    await prisma.authUser.deleteMany({ where: { id: { in: [bpUser.id, otherBpUser.id] } } });
  });

  test("BP competition registration validates eligibility and registration windows", async () => {
    const bpUser = await prisma.authUser.create({
      data: {
        tenantId: tenant.id,
        username: `bpreg${randomId("scope")}`,
        email: `bpreg${randomId("scope")}@abacusweb.local`,
        passwordHash: await bcrypt.hash("Pass@123", 10),
        role: "BP",
        isActive: true,
        hierarchyNodeId: school.id
      }
    });

    const bpPartner = await prisma.businessPartner.create({
      data: {
        tenantId: tenant.id,
        name: `BP Reg ${randomId("bp")}`,
        code: bpUser.username,
        displayName: `BP Reg ${randomId("bp")}`,
        status: "ACTIVE",
        isActive: true,
        contactEmail: bpUser.email,
        hierarchyNodeId: school.id,
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
        gracePeriodUntil: null,
        createdByUserId: bpUser.id
      }
    });

    const bpTokenResponse = await http.post("/api/auth/login").send({
      tenantCode: tenant.code,
      username: bpUser.username,
      password: "Pass@123"
    });
    const bpToken = bpTokenResponse.body.data.access_token;

    const createCompetitionResponse = await http
      .post("/api/competitions")
      .set(authHeader(bpToken))
      .send({
        title: `BP Reg ${randomId("comp")}`,
        code: `REG-${randomId("comp")}`,
        description: "bp registration test",
        status: "SCHEDULED",
        workflowStage: "APPROVED",
        registrationStartsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        registrationEndsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        hierarchyNodeId: school.id,
        publish: true
      });

    expect(createCompetitionResponse.status).toBe(201);
    const competition = createCompetitionResponse.body.data;

    const eligibleStudent = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo: `BPREG-${randomId("stu")}`,
        firstName: "Eligible",
        lastName: "Student",
        email: `eligible-${randomId("stu")}@abacusweb.local`,
        hierarchyNodeId: school.id,
        levelId: level1.id,
        isActive: true
      }
    });

    const eligibleResponse = await http
      .post(`/api/competitions/${competition.id}/enrollments`)
      .set(authHeader(bpToken))
      .send({ studentId: eligibleStudent.id, levelId: level2.id });

    expect(eligibleResponse.status).toBe(201);

    const dbEnrollment = await prisma.competitionEnrollment.findUniqueOrThrow({
      where: {
        competitionId_studentId: {
          competitionId: competition.id,
          studentId: eligibleStudent.id
        }
      }
    });

    expect(dbEnrollment.levelId).toBe(level2.id);

    const duplicateResponse = await http
      .post(`/api/competitions/${competition.id}/enrollments`)
      .set(authHeader(bpToken))
      .send({ studentId: eligibleStudent.id, levelId: level2.id });

    expect(duplicateResponse.status).toBe(409);

    await prisma.competitionBusinessPartner.delete({ where: { competitionId_businessPartnerId: { competitionId: competition.id, businessPartnerId: bpPartner.id } } });
    await prisma.competition.delete({ where: { id: competition.id } });
    await prisma.student.deleteMany({ where: { id: { in: [eligibleStudent.id] } } });
    await prisma.businessPartner.delete({ where: { id: bpPartner.id } });
    await prisma.authUser.update({ where: { id: bpUser.id }, data: { isActive: false } });
  });

  test("Superadmin can assign and remove business partners for a competition", async () => {
    const competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: `Comp ${randomId("bpassign")}`,
        description: "bp assign test",
        status: "DRAFT",
        workflowStage: "SUPERADMIN_APPROVAL",
        startsAt: new Date(Date.now() + 3600 * 1000),
        endsAt: new Date(Date.now() + 7200 * 1000),
        hierarchyNodeId: school.id,
        levelId: level1.id,
        createdByUserId: (await prisma.authUser.findFirstOrThrow({ where: { tenantId: tenant.id, role: "SUPERADMIN" } })).id
      }
    });

    const partnerA = await prisma.businessPartner.create({
      data: {
        tenantId: tenant.id,
        name: `Assign BP A ${randomId("bp")}`,
        code: `ABPA${randomId("bp")}`,
        displayName: `Assign BP A ${randomId("bp")}`,
        status: "ACTIVE",
        isActive: true,
        contactEmail: `bpA${randomId("bp")}@abacusweb.local`,
        hierarchyNodeId: school.id,
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
        gracePeriodUntil: null,
        createdByUserId: (await prisma.authUser.findFirstOrThrow({ where: { tenantId: tenant.id, role: "SUPERADMIN" } })).id
      }
    });

    const partnerB = await prisma.businessPartner.create({
      data: {
        tenantId: tenant.id,
        name: `Assign BP B ${randomId("bp")}`,
        code: `ABPB${randomId("bp")}`,
        displayName: `Assign BP B ${randomId("bp")}`,
        status: "ACTIVE",
        isActive: true,
        contactEmail: `bpB${randomId("bp")}@abacusweb.local`,
        hierarchyNodeId: school.id,
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
        gracePeriodUntil: null,
        createdByUserId: (await prisma.authUser.findFirstOrThrow({ where: { tenantId: tenant.id, role: "SUPERADMIN" } })).id
      }
    });

    const assignResponse = await http
      .post(`/api/competitions/${competition.id}/business-partners`)
      .set(authHeader(superadminToken))
      .send({ businessPartnerIds: [partnerA.id, partnerB.id] });

    expect(assignResponse.status).toBe(200);

    const mappings = await prisma.competitionBusinessPartner.findMany({ where: { competitionId: competition.id } });
    expect(mappings).toHaveLength(2);
    expect(mappings.some((item) => item.businessPartnerId === partnerA.id)).toBe(true);
    expect(mappings.some((item) => item.businessPartnerId === partnerB.id)).toBe(true);

    const removeResponse = await http
      .delete(`/api/competitions/${competition.id}/business-partners/${partnerA.id}`)
      .set(authHeader(superadminToken));

    expect(removeResponse.status).toBe(200);

    const remainingMappings = await prisma.competitionBusinessPartner.findMany({ where: { competitionId: competition.id } });
    expect(remainingMappings).toHaveLength(1);
    expect(remainingMappings[0].businessPartnerId).toBe(partnerB.id);

    await prisma.competitionBusinessPartner.deleteMany({ where: { competitionId: competition.id } });
    await prisma.competition.delete({ where: { id: competition.id } });
    await prisma.businessPartner.deleteMany({ where: { id: { in: [partnerA.id, partnerB.id] } } });
  });

  test("Competition foundation templates are creatable and listable", async () => {
    const createResponse = await http
      .post("/api/competitions/foundation/templates")
      .set(authHeader(superadminToken))
      .send({
        name: `Foundation Template ${randomId("tmpl")}`,
        slug: `foundation-template-${randomId("tmpl")}`,
        description: "Phase 1 foundation template",
        isActive: true
      });

    expect(createResponse.status).toBe(201);

    const listResponse = await http
      .get("/api/competitions/foundation/templates")
      .set(authHeader(superadminToken));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.some((item) => item.id === createResponse.body.data.id)).toBe(true);

    await prisma.competitionTemplate.delete({ where: { id: createResponse.body.data.id } });
  });

  test("Competition creation can use a foundation template and selected business partners", async () => {
    const template = await prisma.competitionTemplate.create({
      data: {
        tenantId: tenant.id,
        name: `Template ${randomId("tpl")}`,
        slug: `template-${randomId("tpl")}`,
        description: "Template for workflow test",
        isActive: true
      }
    });

    const partnerA = await prisma.businessPartner.create({
      data: {
        tenantId: tenant.id,
        name: `Template BP A ${randomId("bp")}`,
        code: `TBPA${randomId("bp")}`,
        displayName: `Template BP A ${randomId("bp")}`,
        status: "ACTIVE",
        isActive: true,
        contactEmail: `bpA${randomId("bp")}@abacusweb.local`,
        hierarchyNodeId: school.id,
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
        gracePeriodUntil: null,
        createdByUserId: (await prisma.authUser.findFirstOrThrow({ where: { tenantId: tenant.id, role: "SUPERADMIN" } })).id
      }
    });

    const partnerB = await prisma.businessPartner.create({
      data: {
        tenantId: tenant.id,
        name: `Template BP B ${randomId("bp")}`,
        code: `TBPB${randomId("bp")}`,
        displayName: `Template BP B ${randomId("bp")}`,
        status: "ACTIVE",
        isActive: true,
        contactEmail: `bpB${randomId("bp")}@abacusweb.local`,
        hierarchyNodeId: school.id,
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
        gracePeriodUntil: null,
        createdByUserId: (await prisma.authUser.findFirstOrThrow({ where: { tenantId: tenant.id, role: "SUPERADMIN" } })).id
      }
    });

    const createResponse = await http
      .post("/api/competitions")
      .set(authHeader(superadminToken))
      .send({
        title: `Template Competition ${randomId("cmp")}`,
        description: "Created from a template",
        code: `CMP-${randomId("code")}`,
        templateId: template.id,
        businessPartnerIds: [partnerA.id, partnerB.id],
        registrationStartsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        registrationEndsAt: new Date(Date.now() + 7200 * 1000).toISOString(),
        startsAt: new Date(Date.now() + 10800 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 14400 * 1000).toISOString(),
        levelId: level1.id,
        publish: true
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.templateId).toBe(template.id);

    const dbCompetition = await prisma.competition.findUniqueOrThrow({ where: { id: createResponse.body.data.id } });
    expect(dbCompetition.code).toBeDefined();
    expect(dbCompetition.registrationStartsAt).toBeInstanceOf(Date);
    expect(dbCompetition.registrationEndsAt).toBeInstanceOf(Date);

    const mappings = await prisma.competitionBusinessPartner.findMany({ where: { competitionId: dbCompetition.id } });
    expect(mappings).toHaveLength(2);
    expect(mappings.some((item) => item.businessPartnerId === partnerA.id)).toBe(true);
    expect(mappings.some((item) => item.businessPartnerId === partnerB.id)).toBe(true);

    await prisma.competitionBusinessPartner.deleteMany({ where: { competitionId: dbCompetition.id } });
    await prisma.competition.delete({ where: { id: dbCompetition.id } });
    await prisma.competitionTemplate.delete({ where: { id: template.id } });
    await prisma.businessPartner.deleteMany({ where: { id: { in: [partnerA.id, partnerB.id] } } });
  });

  test("Competition foundation seasons are creatable and listable", async () => {
    const createResponse = await http
      .post("/api/competitions/foundation/seasons")
      .set(authHeader(superadminToken))
      .send({
        name: `Foundation Season ${randomId("season")}`,
        slug: `foundation-season-${randomId("season")}`,
        startDate: new Date(Date.now()).toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
        isActive: true
      });

    expect(createResponse.status).toBe(201);

    const listResponse = await http
      .get("/api/competitions/foundation/seasons")
      .set(authHeader(superadminToken));

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.some((item) => item.id === createResponse.body.data.id)).toBe(true);

    await prisma.competitionSeason.delete({ where: { id: createResponse.body.data.id } });
  });

  test("Leaderboard sorted correctly", async () => {
    const superadmin = await prisma.authUser.findFirstOrThrow({
      where: { tenantId: tenant.id, email: "superadmin@abacusweb.local" }
    });

    const competition = await prisma.competition.create({
      data: {
        tenantId: tenant.id,
        title: `Comp ${randomId("leaderboard")}`,
        description: "leaderboard test",
        status: "SCHEDULED",
        workflowStage: "APPROVED",
        startsAt: new Date(Date.now() - 3600 * 1000),
        endsAt: new Date(Date.now() + 3600 * 1000),
        hierarchyNodeId: school.id,
        levelId: level1.id,
        createdByUserId: superadmin.id
      }
    });

    const [studentA, studentB] = await prisma.student.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      take: 2
    });

    const worksheet1 = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `LB-W1-${randomId("lb")}`,
        levelId: level1.id,
        difficulty: "EASY",
        createdByUserId: superadmin.id,
        isPublished: true
      }
    });

    const worksheet2 = await prisma.worksheet.create({
      data: {
        tenantId: tenant.id,
        title: `LB-W2-${randomId("lb")}`,
        levelId: level1.id,
        difficulty: "EASY",
        createdByUserId: superadmin.id,
        isPublished: true
      }
    });

    await prisma.competitionWorksheet.createMany({
      data: [
        {
          competitionId: competition.id,
          worksheetId: worksheet1.id,
          tenantId: tenant.id
        },
        {
          competitionId: competition.id,
          worksheetId: worksheet2.id,
          tenantId: tenant.id
        }
      ]
    });

    await prisma.competitionEnrollment.createMany({
      data: [
        { competitionId: competition.id, studentId: studentA.id, tenantId: tenant.id },
        { competitionId: competition.id, studentId: studentB.id, tenantId: tenant.id }
      ]
    });

    const baseTime = Date.now() - 120000;

    await prisma.worksheetSubmission.createMany({
      data: [
        {
          tenantId: tenant.id,
          worksheetId: worksheet1.id,
          studentId: studentA.id,
          score: 95,
          submittedAt: new Date(baseTime + 1000),
          status: "REVIEWED"
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheet2.id,
          studentId: studentA.id,
          score: 95,
          submittedAt: new Date(baseTime + 5000),
          status: "REVIEWED"
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheet1.id,
          studentId: studentB.id,
          score: 88,
          submittedAt: new Date(baseTime + 2000),
          status: "REVIEWED"
        },
        {
          tenantId: tenant.id,
          worksheetId: worksheet2.id,
          studentId: studentB.id,
          score: 88,
          submittedAt: new Date(baseTime + 3000),
          status: "REVIEWED"
        }
      ]
    });

    const response = await http
      .get(`/api/competitions/${competition.id}/leaderboard`)
      .set(authHeader(superadminToken));

    expect(response.status).toBe(200);
    expect(response.body.data.leaderboard.length).toBeGreaterThanOrEqual(2);
    expect(response.body.data.leaderboard[0].studentId).toBe(studentA.id);
    expect(response.body.data.leaderboard[1].studentId).toBe(studentB.id);
  });
});
