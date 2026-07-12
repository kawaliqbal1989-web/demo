import { __examResultsInternals } from "../../src/controllers/exam-cycles.controller.js";

describe("exam results fallback metrics", () => {
  test("saved answers with 5 correct and 1 wrong are derived correctly", () => {
    const submission = {
      worksheet: {
        questions: [
          { id: "q1", questionNumber: 1, correctAnswer: "1,200" },
          { id: "q2", questionNumber: 2, correctAnswer: 7 },
          { id: "q3", questionNumber: 3, correctAnswer: "9" },
          { id: "q4", questionNumber: 4, correctAnswer: 10 },
          { id: "q5", questionNumber: 5, correctAnswer: 11 },
          { id: "q6", questionNumber: 6, correctAnswer: 12 }
        ]
      },
      submittedAnswers: {
        answersByQuestionId: {
          q1: { value: " 1200 " },
          q2: { answer: "7" },
          q3: { enteredAnswer: 9 },
          q4: { value: "10" },
          q5: { value: "11" },
          q6: { value: "13" }
        }
      }
    };

    const metrics = __examResultsInternals.deriveSavedAnswerMetrics(submission);

    expect(metrics).toMatchObject({
      totalQuestions: 6,
      answeredCount: 6,
      correctCount: 5,
      wrongCount: 1,
      unansweredCount: 0
    });
  });

  test("blank answers are counted as unanswered, not wrong", () => {
    const submission = {
      worksheet: {
        questions: [
          { id: "q1", questionNumber: 1, correctAnswer: 4 },
          { id: "q2", questionNumber: 2, correctAnswer: 8 },
          { id: "q3", questionNumber: 3, correctAnswer: 5 }
        ]
      },
      submittedAnswers: {
        answersByQuestionId: {
          q1: { value: "   " },
          q2: { value: null },
          q3: { value: "5" }
        }
      }
    };

    const metrics = __examResultsInternals.deriveSavedAnswerMetrics(submission);

    expect(metrics).toMatchObject({
      totalQuestions: 3,
      answeredCount: 1,
      correctCount: 1,
      wrongCount: 0,
      unansweredCount: 2
    });
  });

  test("timed out with zero answers returns 0 even when stored completion exists", () => {
    const start = "2026-07-12T10:00:00.000Z";

    const completion = __examResultsInternals.resolveCompletionTimeSecondsFromSubmission({
      submission: {
        submittedAt: start,
        completionTimeSeconds: 600,
        worksheet: { timeLimitSeconds: 600 },
        submittedAnswers: { answersByQuestionId: {}, savedAt: "2026-07-12T10:09:59.000Z" }
      },
      candidateStatus: "TIMED_OUT",
      answeredCount: 0
    });

    expect(completion).toBe(0);
  });

  test("timed out with answers prefers savedAt-start duration over stored full limit", () => {
    const start = "2026-07-12T10:00:00.000Z";

    const completion = __examResultsInternals.resolveCompletionTimeSecondsFromSubmission({
      submission: {
        submittedAt: start,
        completionTimeSeconds: 600,
        updatedAt: "2026-07-12T10:12:30.000Z",
        worksheet: { timeLimitSeconds: 600 },
        submittedAnswers: {
          savedAt: "2026-07-12T10:07:30.000Z",
          answersByQuestionId: {
            q1: { value: "12" }
          }
        }
      },
      candidateStatus: "TIMED_OUT",
      answeredCount: 1
    });

    expect(completion).toBe(450);
  });

  test("submitted with finalSubmittedAt uses final submit duration", () => {
    const start = "2026-07-12T10:00:00.000Z";

    const completion = __examResultsInternals.resolveCompletionTimeSecondsFromSubmission({
      submission: {
        submittedAt: start,
        finalSubmittedAt: "2026-07-12T10:04:20.000Z",
        completionTimeSeconds: 600,
        worksheet: { timeLimitSeconds: 600 }
      },
      candidateStatus: "SUBMITTED",
      answeredCount: 5
    });

    expect(completion).toBe(260);
  });
});
