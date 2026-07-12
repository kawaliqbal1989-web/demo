import { __examResultsInternals } from "../../src/controllers/exam-cycles.controller.js";

describe("exam results fallback metrics", () => {
  test("stored completionTimeSeconds=37 is preserved for finalized rows even when derived elapsed is zero", () => {
    const completion = __examResultsInternals.resolveCompletionTimeSecondsFromSubmission({
      submission: {
        createdAt: "2026-07-12T10:00:00.000Z",
        // Legacy rows may have submittedAt rewritten to final submit time.
        submittedAt: "2026-07-12T10:00:37.000Z",
        finalSubmittedAt: "2026-07-12T10:00:37.000Z",
        completionTimeSeconds: 37,
        worksheet: { timeLimitSeconds: 600 }
      },
      candidateStatus: "SUBMITTED",
      answeredCount: 6
    });

    expect(completion).toBe(37);
  });

  test("average completion uses resolved completion seconds from scored rows", () => {
    const avg = __examResultsInternals.computeAverageCompletionTimeSeconds([
      { percentage: 100, completionTimeSeconds: 37 },
      { percentage: 83.33, completionTimeSeconds: 29 },
      { percentage: null, completionTimeSeconds: 999 }
    ]);

    expect(avg).toBe(33);
  });

  test("completion resolver keeps no-answer timed-out row at 0 when no reliable duration evidence exists", () => {
    const completion = __examResultsInternals.resolveCompletionTimeSecondsFromSubmission({
      submission: {
        createdAt: "2026-07-12T10:00:00.000Z",
        submittedAt: "2026-07-12T10:00:00.000Z",
        worksheet: { timeLimitSeconds: 600 },
        submittedAnswers: []
      },
      candidateStatus: "TIMED_OUT",
      answeredCount: 0
    });

    expect(completion).toBe(0);
  });

  test("resolved metrics prefer recomputed values over stale stored score/correctCount for finalized rows", () => {
    const submission = {
      status: "REVIEWED",
      score: 0,
      correctCount: 0,
      totalQuestions: 6,
      worksheet: {
        questions: [
          { id: "wq1", questionNumber: 1, operation: "ADD", operands: { terms: [4, 5, 15], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq2", questionNumber: 2, operation: "ADD", operands: { terms: [4, 5, 16], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq3", questionNumber: 3, operation: "ADD", operands: { terms: [4, 5, 13], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq4", questionNumber: 4, operation: "ADD", operands: { terms: [4, 5, 17], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq5", questionNumber: 5, operation: "ADD", operands: { terms: [4, 5, 12], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq6", questionNumber: 6, operation: "ADD", operands: { terms: [4, 5, 14], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 }
        ]
      },
      submittedAnswers: [
        { questionNumber: 1, answer: 24 },
        { questionNumber: 2, answer: 25 },
        { questionNumber: 3, answer: 22 },
        { questionNumber: 4, answer: 26 },
        { questionNumber: 5, answer: 21 },
        { questionNumber: 6, answer: 23 }
      ]
    };

    const resolved = __examResultsInternals.resolveExamResultMetricsForSubmission({
      submission,
      candidateStatus: "SUBMITTED"
    });

    expect(resolved).toMatchObject({
      resolvedCorrectCount: 6,
      resolvedWrongCount: 0,
      resolvedUnansweredCount: 0,
      resolvedTotalQuestions: 6,
      resolvedPercentage: 100,
      resolvedScore: 100,
      preferDerivedMetrics: true
    });
  });

  test("resolved metrics derive 5 correct and 1 wrong for one-wrong array answer case", () => {
    const submission = {
      status: "REVIEWED",
      score: 0,
      correctCount: 0,
      totalQuestions: 6,
      worksheet: {
        questions: [
          { id: "wq1", questionNumber: 1, operation: "ADD", operands: { terms: [4, 5, 15], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq2", questionNumber: 2, operation: "ADD", operands: { terms: [4, 5, 16], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq3", questionNumber: 3, operation: "ADD", operands: { terms: [4, 5, 13], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq4", questionNumber: 4, operation: "ADD", operands: { terms: [4, 5, 17], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq5", questionNumber: 5, operation: "ADD", operands: { terms: [4, 5, 12], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq6", questionNumber: 6, operation: "ADD", operands: { terms: [4, 5, 14], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 }
        ]
      },
      submittedAnswers: [
        { questionNumber: 1, answer: 24 },
        { questionNumber: 2, answer: 25 },
        { questionNumber: 3, answer: 22 },
        { questionNumber: 4, answer: 26 },
        { questionNumber: 5, answer: 21 },
        { questionNumber: 6, answer: 2 }
      ]
    };

    const resolved = __examResultsInternals.resolveExamResultMetricsForSubmission({
      submission,
      candidateStatus: "SUBMITTED"
    });

    expect(resolved).toMatchObject({
      resolvedCorrectCount: 5,
      resolvedWrongCount: 1,
      resolvedUnansweredCount: 0,
      resolvedTotalQuestions: 6,
      resolvedPercentage: 83.33,
      resolvedScore: 83.33,
      preferDerivedMetrics: true
    });
  });

  test("resolved metrics remain safe when submittedAnswers payload is empty", () => {
    const submission = {
      status: "REVIEWED",
      score: 0,
      correctCount: 0,
      totalQuestions: 6,
      worksheet: {
        questions: [
          { id: "wq1", questionNumber: 1, operation: "ADD", operands: { terms: [4, 5, 15] }, correctAnswer: 7 },
          { id: "wq2", questionNumber: 2, operation: "ADD", operands: { terms: [4, 5, 16] }, correctAnswer: 7 },
          { id: "wq3", questionNumber: 3, operation: "ADD", operands: { terms: [4, 5, 13] }, correctAnswer: 7 },
          { id: "wq4", questionNumber: 4, operation: "ADD", operands: { terms: [4, 5, 17] }, correctAnswer: 7 },
          { id: "wq5", questionNumber: 5, operation: "ADD", operands: { terms: [4, 5, 12] }, correctAnswer: 7 },
          { id: "wq6", questionNumber: 6, operation: "ADD", operands: { terms: [4, 5, 14] }, correctAnswer: 7 }
        ]
      },
      submittedAnswers: []
    };

    const resolved = __examResultsInternals.resolveExamResultMetricsForSubmission({
      submission,
      candidateStatus: "SUBMITTED"
    });

    expect(resolved).toMatchObject({
      resolvedCorrectCount: 0,
      resolvedWrongCount: 0,
      resolvedUnansweredCount: 6,
      resolvedTotalQuestions: 6,
      resolvedPercentage: 0,
      resolvedScore: 0,
      preferDerivedMetrics: true
    });
  });

  test("array submittedAnswers with terms fixture derives 6 correct using displayed-term expected answers", () => {
    const submission = {
      worksheet: {
        questions: [
          { id: "wq1", questionNumber: 1, operation: "ADD", operands: { terms: [4, 5, 15], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq2", questionNumber: 2, operation: "ADD", operands: { terms: [4, 5, 16], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq3", questionNumber: 3, operation: "ADD", operands: { terms: [4, 5, 13], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq4", questionNumber: 4, operation: "ADD", operands: { terms: [4, 5, 17], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq5", questionNumber: 5, operation: "ADD", operands: { terms: [4, 5, 12], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq6", questionNumber: 6, operation: "ADD", operands: { terms: [4, 5, 14], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 }
        ]
      },
      submittedAnswers: [
        { questionNumber: 1, answer: 24 },
        { questionNumber: 2, answer: 25 },
        { questionNumber: 3, answer: 22 },
        { questionNumber: 4, answer: 26 },
        { questionNumber: 5, answer: 21 },
        { questionNumber: 6, answer: 23 }
      ]
    };

    const metrics = __examResultsInternals.deriveSavedAnswerMetrics(submission);

    expect(metrics).toMatchObject({
      totalQuestions: 6,
      answeredCount: 6,
      correctCount: 6,
      wrongCount: 0,
      unansweredCount: 0,
      percentage: 100
    });
  });

  test("array submittedAnswers with last answer wrong derives 5 correct and 1 wrong", () => {
    const submission = {
      worksheet: {
        questions: [
          { id: "wq1", questionNumber: 1, operation: "ADD", operands: { terms: [4, 5, 15], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq2", questionNumber: 2, operation: "ADD", operands: { terms: [4, 5, 16], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq3", questionNumber: 3, operation: "ADD", operands: { terms: [4, 5, 13], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq4", questionNumber: 4, operation: "ADD", operands: { terms: [4, 5, 17], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq5", questionNumber: 5, operation: "ADD", operands: { terms: [4, 5, 12], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 },
          { id: "wq6", questionNumber: 6, operation: "ADD", operands: { terms: [4, 5, 14], operators: ["", "ADD", "SUB"] }, correctAnswer: 7 }
        ]
      },
      submittedAnswers: [
        { questionNumber: 1, answer: 24 },
        { questionNumber: 2, answer: 25 },
        { questionNumber: 3, answer: 22 },
        { questionNumber: 4, answer: 26 },
        { questionNumber: 5, answer: 21 },
        { questionNumber: 6, answer: 2 }
      ]
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

  test("empty submitted answers remain safe with unanswered counts", () => {
    const submission = {
      worksheet: {
        questions: [
          { id: "wq1", questionNumber: 1, operation: "ADD", operands: { terms: [4, 5, 15] }, correctAnswer: 7 },
          { id: "wq2", questionNumber: 2, operation: "ADD", operands: { terms: [4, 5, 16] }, correctAnswer: 7 }
        ]
      },
      submittedAnswers: []
    };

    const metrics = __examResultsInternals.deriveSavedAnswerMetrics(submission);

    expect(metrics).toMatchObject({
      totalQuestions: 2,
      answeredCount: 0,
      correctCount: 0,
      wrongCount: 0,
      unansweredCount: 2,
      percentage: 0
    });
  });

  test("operands fixture keyed by questionBankId scores 6 correct, 0 wrong, 0 unanswered", () => {
    const submission = {
      worksheet: {
        questions: [
          { id: "wq1", questionBankId: "qb1", questionNumber: 1, operands: { nums: [4, 5, 15] }, operation: "COLUMN_SUM", correctAnswer: 24 },
          { id: "wq2", questionBankId: "qb2", questionNumber: 2, operands: { nums: [4, 5, 16] }, operation: "COLUMN_SUM", correctAnswer: 25 },
          { id: "wq3", questionBankId: "qb3", questionNumber: 3, operands: { nums: [4, 5, 13] }, operation: "COLUMN_SUM", correctAnswer: 22 },
          { id: "wq4", questionBankId: "qb4", questionNumber: 4, operands: { nums: [4, 5, 17] }, operation: "COLUMN_SUM", correctAnswer: 26 },
          { id: "wq5", questionBankId: "qb5", questionNumber: 5, operands: { nums: [4, 5, 12] }, operation: "COLUMN_SUM", correctAnswer: 21 },
          { id: "wq6", questionBankId: "qb6", questionNumber: 6, operands: { nums: [4, 5, 14] }, operation: "COLUMN_SUM", correctAnswer: 23 }
        ]
      },
      submittedAnswers: {
        answersByQuestionId: {
          qb1: { value: "24" },
          qb2: { value: "25" },
          qb3: { value: "22" },
          qb4: { value: "26" },
          qb5: { value: "21" },
          qb6: { value: "23" }
        }
      }
    };

    const metrics = __examResultsInternals.deriveSavedAnswerMetrics(submission);

    expect(metrics).toMatchObject({
      totalQuestions: 6,
      answeredCount: 6,
      correctCount: 6,
      wrongCount: 0,
      unansweredCount: 0,
      percentage: 100
    });
  });

  test("operands fixture with one wrong answer returns 5 correct and 1 wrong", () => {
    const submission = {
      worksheet: {
        questions: [
          { id: "wq1", questionBankId: "qb1", questionNumber: 1, operands: { nums: [4, 5, 15] }, operation: "COLUMN_SUM", correctAnswer: 24 },
          { id: "wq2", questionBankId: "qb2", questionNumber: 2, operands: { nums: [4, 5, 16] }, operation: "COLUMN_SUM", correctAnswer: 25 },
          { id: "wq3", questionBankId: "qb3", questionNumber: 3, operands: { nums: [4, 5, 13] }, operation: "COLUMN_SUM", correctAnswer: 22 },
          { id: "wq4", questionBankId: "qb4", questionNumber: 4, operands: { nums: [4, 5, 17] }, operation: "COLUMN_SUM", correctAnswer: 26 },
          { id: "wq5", questionBankId: "qb5", questionNumber: 5, operands: { nums: [4, 5, 12] }, operation: "COLUMN_SUM", correctAnswer: 21 },
          { id: "wq6", questionBankId: "qb6", questionNumber: 6, operands: { nums: [4, 5, 14] }, operation: "COLUMN_SUM", correctAnswer: 23 }
        ]
      },
      submittedAnswers: {
        answersByQuestionId: {
          qb1: { value: "24" },
          qb2: { value: "25" },
          qb3: { value: "22" },
          qb4: { value: "26" },
          qb5: { value: "20" },
          qb6: { value: "23" }
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

  test("operands fixture with one blank answer counts blank as unanswered", () => {
    const submission = {
      worksheet: {
        questions: [
          { id: "wq1", questionBankId: "qb1", questionNumber: 1, operands: { nums: [4, 5, 15] }, operation: "COLUMN_SUM", correctAnswer: 24 },
          { id: "wq2", questionBankId: "qb2", questionNumber: 2, operands: { nums: [4, 5, 16] }, operation: "COLUMN_SUM", correctAnswer: 25 },
          { id: "wq3", questionBankId: "qb3", questionNumber: 3, operands: { nums: [4, 5, 13] }, operation: "COLUMN_SUM", correctAnswer: 22 },
          { id: "wq4", questionBankId: "qb4", questionNumber: 4, operands: { nums: [4, 5, 17] }, operation: "COLUMN_SUM", correctAnswer: 26 },
          { id: "wq5", questionBankId: "qb5", questionNumber: 5, operands: { nums: [4, 5, 12] }, operation: "COLUMN_SUM", correctAnswer: 21 },
          { id: "wq6", questionBankId: "qb6", questionNumber: 6, operands: { nums: [4, 5, 14] }, operation: "COLUMN_SUM", correctAnswer: 23 }
        ]
      },
      submittedAnswers: {
        answersByQuestionId: {
          qb1: { value: "24" },
          qb2: { value: "25" },
          qb3: { value: "22" },
          qb4: { value: "26" },
          qb5: { value: " " },
          qb6: { value: "23" }
        }
      }
    };

    const metrics = __examResultsInternals.deriveSavedAnswerMetrics(submission);

    expect(metrics).toMatchObject({
      totalQuestions: 6,
      answeredCount: 5,
      correctCount: 5,
      wrongCount: 0,
      unansweredCount: 1
    });
  });

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
