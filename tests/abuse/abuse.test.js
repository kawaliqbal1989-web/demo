import {
  authHeader,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

async function createStudent(tenantId, hierarchyNodeId, levelId, suffix) {
  return prisma.student.create({
    data: {
      tenantId,
      admissionNo: `AB-${suffix}`,
      firstName: "Abuse",
      lastName: suffix,
      email: `abuse.${suffix}@example.com`,
      hierarchyNodeId,
      levelId
    }
  });
}

describe("ABUSE", () => {
  let token;
  let tenant;
  let level1;
  let school;

  beforeAll(async () => {
    const login = await loginAs({ email: "center.manager@abacusweb.local" });
    token = login.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });
    school = await prisma.hierarchyNode.findUniqueOrThrow({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: "SCH-001"
        }
      }
    });
  });

  test("Rapid submission triggers RAPID_SUBMISSION", async () => {
    const student = await createStudent(tenant.id, school.id, level1.id, randomId("rapid"));

    for (let index = 0; index < 6; index += 1) {
      const generated = await http
        .post(`/api/levels/${level1.id}/generate-worksheet?mode=practice`)
        .set(authHeader(token));

      const worksheetId = generated.body.data.worksheetId;
      const question = await prisma.worksheetQuestion.findFirstOrThrow({
        where: { worksheetId },
        orderBy: { questionNumber: "asc" }
      });

      await http
        .post(`/api/worksheets/${worksheetId}/submit`)
        .set(authHeader(token))
        .send({
          studentId: student.id,
          answers: [
            {
              questionNumber: question.questionNumber,
              answer: question.correctAnswer
            }
          ]
        });
    }

    const rapidFlag = await prisma.abuseFlag.findFirst({
      where: {
        tenantId: tenant.id,
        studentId: student.id,
        flagType: "RAPID_SUBMISSION"
      },
      orderBy: { createdAt: "desc" }
    });

    expect(rapidFlag).toBeTruthy();
  }, 20000);

  test("Perfect streak triggers PERFECT_STREAK", async () => {
    const student = await createStudent(tenant.id, school.id, level1.id, randomId("streak"));

    for (let index = 0; index < 5; index += 1) {
      const generated = await http
        .post(`/api/levels/${level1.id}/generate-worksheet?mode=practice`)
        .set(authHeader(token));

      const worksheetId = generated.body.data.worksheetId;
      const questions = await prisma.worksheetQuestion.findMany({
        where: { worksheetId },
        orderBy: { questionNumber: "asc" }
      });

      const answers = questions.map((question) => ({
        questionNumber: question.questionNumber,
        answer: question.correctAnswer
      }));

      const submitResponse = await http
        .post(`/api/worksheets/${worksheetId}/submit`)
        .set(authHeader(token))
        .send({
          studentId: student.id,
          answers
        });

      expect(submitResponse.status).toBe(200);
      expect(submitResponse.body.data.accuracy).toBe(100);
    }

    const streakFlag = await prisma.abuseFlag.findFirst({
      where: {
        tenantId: tenant.id,
        studentId: student.id,
        flagType: "PERFECT_STREAK"
      },
      orderBy: { createdAt: "desc" }
    });

    expect(streakFlag).toBeTruthy();
  });
});
