import {
  authHeader,
  ensureAuthUser,
  http,
  loginAs
} from "../helpers/test-helpers.js";

describe("exam platform api", () => {
  let token;

  beforeAll(async () => {
    await ensureAuthUser({
      tenantCode: "DEFAULT",
      email: "superadmin.exam.platform@test.local",
      username: "sa_exam_platform",
      role: "SUPERADMIN"
    });

    const login = await loginAs({
      tenantCode: "DEFAULT",
      username: "sa_exam_platform",
      password: "Pass@123"
    });

    token = login.body?.data?.accessToken;
    expect(token).toBeTruthy();
  });

  test("creates subject, question, and exam", async () => {
    const subjectRes = await http
      .post("/api/exam-platform/subjects")
      .set(authHeader(token))
      .send({
        name: "Mental Math",
        code: `MM_${Date.now()}`,
        description: "Exam platform test subject"
      });

    expect(subjectRes.statusCode).toBe(201);
    expect(subjectRes.body?.success).toBe(true);
    const subjectId = subjectRes.body?.data?.id;
    expect(subjectId).toBeTruthy();

    const questionRes = await http
      .post("/api/exam-platform/question-bank")
      .set(authHeader(token))
      .send({
        subjectId,
        levelId: "LEVEL_TEST",
        topic: "Addition",
        questionType: "MCQ",
        questionText: "2 + 2 = ?",
        answerText: "4",
        options: [
          { optionLabel: "A", optionText: "3", isCorrect: false },
          { optionLabel: "B", optionText: "4", isCorrect: true }
        ]
      });

    expect(questionRes.statusCode).toBe(201);
    expect(questionRes.body?.success).toBe(true);

    const examRes = await http
      .post("/api/exam-platform/exams")
      .set(authHeader(token))
      .send({
        name: "Weekly Exam",
        code: `EX_${Date.now()}`,
        subjectId,
        levelId: "LEVEL_TEST",
        durationMinutes: 60,
        totalMarks: 100,
        passingMarks: 35,
        selectionMode: "MIXED"
      });

    expect(examRes.statusCode).toBe(201);
    expect(examRes.body?.success).toBe(true);

    const listRes = await http
      .get("/api/exam-platform/exams")
      .set(authHeader(token));

    expect(listRes.statusCode).toBe(200);
    expect(Array.isArray(listRes.body?.data?.items)).toBe(true);
  });
});
