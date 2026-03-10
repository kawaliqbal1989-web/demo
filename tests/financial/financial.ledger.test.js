import { authHeader, http, loginAs, prisma, randomId } from "../helpers/test-helpers.js";

describe("FINANCIAL LEDGER", () => {
  let centerToken;
  let superadminToken;
  let tenant;
  let school;
  let level1;

  beforeAll(async () => {
    const [centerLogin, superadminLogin] = await Promise.all([
      loginAs({ email: "center.manager@abacusweb.local" }),
      loginAs({ email: "superadmin@abacusweb.local" })
    ]);

    centerToken = centerLogin.body.data.access_token;
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

  test("transaction inserted on student enrollment (createStudent)", async () => {
    const admissionNo = `ADM-${randomId("ledger_enroll")}`;

    const createResponse = await http
      .post("/api/students")
      .set(authHeader(centerToken))
      .send({
        admissionNo,
        firstName: "Ledger",
        lastName: "Student",
        email: null,
        hierarchyNodeId: school.id,
        levelId: level1.id,
        enrollmentFeeAmount: 250
      });

    expect(createResponse.status).toBe(201);

    const studentId = createResponse.body.data.id;

    const txRows = await prisma.financialTransaction.findMany({
      where: {
        tenantId: tenant.id,
        studentId,
        type: "ENROLLMENT"
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    expect(txRows.length).toBe(1);
    expect(Number(txRows[0].grossAmount)).toBe(250);
  });

  test("transaction inserted on competition enrollment", async () => {
    const admissionNo = `ADM-${randomId("ledger_comp_student")}`;

    const student = await prisma.student.create({
      data: {
        tenantId: tenant.id,
        admissionNo,
        firstName: "Ledger",
        lastName: "Competitor",
        email: null,
        hierarchyNodeId: school.id,
        levelId: level1.id
      }
    });

    const createCompetitionResponse = await http
      .post("/api/competitions")
      .set(authHeader(centerToken))
      .send({
        title: `Comp ${randomId("ledger_comp")}`,
        description: "ledger competition",
        startsAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        endsAt: new Date(Date.now() + 7200 * 1000).toISOString(),
        hierarchyNodeId: school.id,
        levelId: level1.id
      });

    expect(createCompetitionResponse.status).toBe(201);
    const competitionId = createCompetitionResponse.body.data.id;

    const enrollResponse = await http
      .post(`/api/competitions/${competitionId}/enrollments`)
      .set(authHeader(centerToken))
      .send({
        studentId: student.id,
        competitionFeeAmount: 99
      });

    expect(enrollResponse.status).toBe(201);

    const txRows = await prisma.financialTransaction.findMany({
      where: {
        tenantId: tenant.id,
        studentId: student.id,
        type: "COMPETITION"
      }
    });

    expect(txRows.length).toBe(1);
    expect(Number(txRows[0].grossAmount)).toBe(99);
  });

  test("no update/delete endpoints allowed", async () => {
    const anyTx = await prisma.financialTransaction.findFirst({
      where: { tenantId: tenant.id }
    });

    if (!anyTx) {
      return;
    }

    const patchResponse = await http
      .patch(`/api/financial-transactions/${anyTx.id}`)
      .set(authHeader(superadminToken))
      .send({ grossAmount: 1 });

    expect([404, 405]).toContain(patchResponse.status);

    const deleteResponse = await http
      .delete(`/api/financial-transactions/${anyTx.id}`)
      .set(authHeader(superadminToken));

    expect([404, 405]).toContain(deleteResponse.status);
  });

  test("transactional rollback safety on invalid (negative) fee", async () => {
    const admissionNo = `ADM-${randomId("ledger_rollback")}`;

    const createResponse = await http
      .post("/api/students")
      .set(authHeader(centerToken))
      .send({
        admissionNo,
        firstName: "Rollback",
        lastName: "Test",
        email: null,
        hierarchyNodeId: school.id,
        levelId: level1.id,
        enrollmentFeeAmount: -10
      });

    expect(createResponse.status).toBe(400);

    const dbStudent = await prisma.student.findFirst({
      where: {
        tenantId: tenant.id,
        admissionNo
      },
      select: { id: true }
    });

    expect(dbStudent).toBeNull();

    // Assert no ENROLLMENT transactions were created with a negative amount.
    const negativeEnrollments = await prisma.financialTransaction.count({
      where: {
        tenantId: tenant.id,
        type: "ENROLLMENT",
        grossAmount: {
          lt: 0
        }
      }
    });

    expect(negativeEnrollments).toBe(0);
  });
});
