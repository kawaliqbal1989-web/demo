import {
  authHeader,
  ensureAuthUser,
  getTenantByCode,
  http,
  loginAs,
  prisma,
  randomId
} from "../helpers/test-helpers.js";

describe("question bank decimal correctAnswer", () => {
  let token;
  let tenant;
  let levelId;

  beforeAll(async () => {
    await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: "superadmin.question.bank.decimal@test.local",
      username: "sa_qb_decimal",
      role: "SUPERADMIN"
    });

    const login = await loginAs({
      tenantCode: "DEFAULT",
      username: "sa_qb_decimal",
      password: "Pass@123"
    });

    token = login.body?.data?.accessToken;
    expect(token).toBeTruthy();

    tenant = await getTenantByCode("DEFAULT");
    expect(tenant?.id).toBeTruthy();

    const existingLevel = await prisma.level.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { rank: "asc" },
      select: { id: true }
    });

    if (existingLevel?.id) {
      levelId = existingLevel.id;
      return;
    }

    const suffix = randomId("qb_decimal_level");
    const createdLevel = await prisma.level.create({
      data: {
        tenantId: tenant.id,
        name: `Question Bank Decimal Level ${suffix}`,
        rank: Number(String(Date.now()).slice(-6)),
        description: "Temporary level for question bank decimal tests"
      },
      select: { id: true }
    });
    levelId = createdLevel.id;
  });

  test.each([
    ["22", 22],
    ["22.20", 22.2],
    ["20.00", 20],
    ["30.3", 30.3],
    ["0.5", 0.5],
    ["12.75", 12.75],
    ["-4.5", -4.5]
  ])("accepts correctAnswer=%s", async (input, expected) => {
    const response = await http
      .post("/api/question-bank")
      .set(authHeader(token))
      .send({
        levelId,
        difficulty: "EASY",
        prompt: `Decimal test ${input} ${randomId("qb")}`,
        operation: "ADD",
        correctAnswer: input,
        operands: {
          terms: [1, 2],
          operators: ["", "+"]
        }
      });

    expect(response.statusCode).toBe(201);
    expect(response.body?.success).toBe(true);
    expect(Number(response.body?.data?.correctAnswer)).toBeCloseTo(expected, 8);
  });

  test.each(["abc", "12a", ""])("rejects invalid correctAnswer=%s", async (input) => {
    const response = await http
      .post("/api/question-bank")
      .set(authHeader(token))
      .send({
        levelId,
        difficulty: "EASY",
        prompt: `Invalid decimal test ${randomId("qb_invalid")}`,
        operation: "ADD",
        correctAnswer: input,
        operands: {
          terms: [1, 2],
          operators: ["", "+"]
        }
      });

    expect(response.statusCode).toBe(400);
    expect(response.body?.success).toBe(false);
    expect(response.body?.error?.code).toBe("VALIDATION_ERROR");
  });
});
