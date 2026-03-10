import {
  authHeader,
  http,
  loginAs,
  prisma
} from "../helpers/test-helpers.js";

describe("WORKSHEET", () => {
  let generationToken;
  let submissionToken;
  let tenant;
  let level1;
  let student;

  beforeAll(async () => {
    const superadminLogin = await loginAs({ email: "superadmin@abacusweb.local" });
    generationToken = superadminLogin.body.data.access_token;

    const centerLogin = await loginAs({ email: "center.manager@abacusweb.local" });
    submissionToken = centerLogin.body.data.access_token;

    tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: "DEFAULT" } });
    level1 = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });
    student = await prisma.student.findFirstOrThrow({ where: { tenantId: tenant.id } });
  });

  test("Generation returns correct question count", async () => {
    const response = await http
      .post(`/api/levels/${level1.id}/generate-worksheet?mode=practice`)
      .set(authHeader(generationToken));

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.questions)).toBe(true);

    const worksheetId = response.body.data.worksheetId;
    const dbQuestionCount = await prisma.worksheetQuestion.count({
      where: { worksheetId }
    });

    expect(response.body.data.questions.length).toBe(dbQuestionCount);
  });

  test("Submission calculates accuracy correctly", async () => {
    const generated = await http
      .post(`/api/levels/${level1.id}/generate-worksheet?mode=practice`)
      .set(authHeader(generationToken));

    const worksheetId = generated.body.data.worksheetId;

    const questions = await prisma.worksheetQuestion.findMany({
      where: { worksheetId },
      orderBy: { questionNumber: "asc" }
    });

    const answers = questions.map((question, index) => ({
      questionNumber: question.questionNumber,
      answer: index % 2 === 0 ? question.correctAnswer : question.correctAnswer + 1
    }));

    const response = await http
      .post(`/api/worksheets/${worksheetId}/submit`)
      .set(authHeader(submissionToken))
      .send({
        studentId: student.id,
        answers
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const expectedCorrect = Math.ceil(questions.length / 2);
    const expectedAccuracy = Number(((expectedCorrect / questions.length) * 100).toFixed(2));

    expect(response.body.data.correctCount).toBe(expectedCorrect);
    expect(response.body.data.totalQuestions).toBe(questions.length);
    expect(response.body.data.accuracy).toBe(expectedAccuracy);

    const submission = await prisma.worksheetSubmission.findUniqueOrThrow({
      where: {
        worksheetId_studentId: {
          worksheetId,
          studentId: student.id
        }
      }
    });

    expect(Number(submission.score)).toBe(expectedAccuracy);

    const secondAttempt = await http
      .post(`/api/worksheets/${worksheetId}/submit`)
      .set(authHeader(submissionToken))
      .send({
        studentId: student.id,
        answers
      });

    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error_code).toBe("SUBMISSION_ALREADY_FINALIZED");
  });

  test("Time limit violation rejected", async () => {
    const generated = await http
      .post(`/api/levels/${level1.id}/generate-worksheet?mode=practice`)
      .set(authHeader(generationToken));

    const worksheetId = generated.body.data.worksheetId;

    await prisma.worksheet.update({
      where: { id: worksheetId },
      data: {
        timeLimitSeconds: 1,
        generatedAt: new Date(Date.now() - 30 * 1000)
      }
    });

    const firstQuestion = await prisma.worksheetQuestion.findFirstOrThrow({
      where: { worksheetId },
      orderBy: { questionNumber: "asc" }
    });

    const response = await http
      .post(`/api/worksheets/${worksheetId}/submit`)
      .set(authHeader(submissionToken))
      .send({
        studentId: student.id,
        answers: [
          {
            questionNumber: firstQuestion.questionNumber,
            answer: firstQuestion.correctAnswer
          }
        ]
      });

    expect(response.status).toBe(409);
    expect(response.body.error_code).toBe("TIME_LIMIT_EXCEEDED");
  });
});
