import { describe, it, expect } from "vitest";
import { scoreAttempt, QuestionForScoring, StudentAnswerInput } from "@/lib/quiz-scoring";
import { QuestionType } from "@prisma/client";

describe("Quiz Scoring Engine (scoreAttempt)", () => {
  const sampleQuestions: QuestionForScoring[] = [
    {
      id: "q1",
      type: QuestionType.SINGLE,
      marks: 2,
      options: [
        { id: "opt1", isCorrect: true },
        { id: "opt2", isCorrect: false },
        { id: "opt3", isCorrect: false },
      ],
    },
    {
      id: "q2",
      type: QuestionType.MULTIPLE,
      marks: 3,
      options: [
        { id: "optA", isCorrect: true },
        { id: "optB", isCorrect: true },
        { id: "optC", isCorrect: false },
        { id: "optD", isCorrect: false },
      ],
    },
    {
      id: "q3",
      type: QuestionType.TRUE_FALSE,
      marks: 1,
      options: [
        { id: "optTrue", isCorrect: false },
        { id: "optFalse", isCorrect: true },
      ],
    },
  ];

  it("awards full marks when all questions are answered correctly", () => {
    const answers: StudentAnswerInput[] = [
      { questionId: "q1", selectedOptionIds: ["opt1"] },
      { questionId: "q2", selectedOptionIds: ["optA", "optB"] },
      { questionId: "q3", selectedOptionIds: ["optFalse"] },
    ];

    const result = scoreAttempt(sampleQuestions, answers, 0.5);

    expect(result.totalScore).toBe(6); // 2 + 3 + 1
    expect(result.maxPossibleMarks).toBe(6);
    expect(result.correctCount).toBe(3);
    expect(result.incorrectCount).toBe(0);
    expect(result.unansweredCount).toBe(0);
    expect(result.penaltyDeducted).toBe(0);
  });

  it("empty answers score 0 without subtracting negative penalty", () => {
    const answers: StudentAnswerInput[] = [];

    const result = scoreAttempt(sampleQuestions, answers, 0.5);

    expect(result.totalScore).toBe(0);
    expect(result.unansweredCount).toBe(3);
    expect(result.correctCount).toBe(0);
    expect(result.incorrectCount).toBe(0);
    expect(result.penaltyDeducted).toBe(0);

    for (const d of result.details) {
      expect(d.isEmpty).toBe(true);
      expect(d.marksAwarded).toBe(0);
    }
  });

  it("deducts negative marking penalty for wrong single and true/false answers", () => {
    const answers: StudentAnswerInput[] = [
      { questionId: "q1", selectedOptionIds: ["opt2"] }, // wrong (-0.5)
      { questionId: "q3", selectedOptionIds: ["optTrue"] }, // wrong (-0.5)
    ];

    const result = scoreAttempt(sampleQuestions, answers, 0.5);

    // q1: -0.5, q2: 0 (empty), q3: -0.5 => raw -1.0 => floored at 0
    expect(result.totalScore).toBe(0);
    expect(result.incorrectCount).toBe(2);
    expect(result.unansweredCount).toBe(1);
    expect(result.penaltyDeducted).toBe(1.0);
  });

  it("ACCEPTANCE: MULTIPLE only awards full marks if selected set equals correct set", () => {
    // 1. Partial selection (optA only instead of optA + optB) is wrong
    const partialAnswers: StudentAnswerInput[] = [
      { questionId: "q2", selectedOptionIds: ["optA"] },
    ];
    const partialResult = scoreAttempt(sampleQuestions, partialAnswers, 0.25);
    const q2Partial = partialResult.details.find((d) => d.questionId === "q2");
    expect(q2Partial?.isCorrect).toBe(false);
    expect(q2Partial?.marksAwarded).toBe(-0.25);

    // 2. Extra incorrect option selected (optA, optB, optC) is wrong
    const extraAnswers: StudentAnswerInput[] = [
      { questionId: "q2", selectedOptionIds: ["optA", "optB", "optC"] },
    ];
    const extraResult = scoreAttempt(sampleQuestions, extraAnswers, 0.25);
    const q2Extra = extraResult.details.find((d) => d.questionId === "q2");
    expect(q2Extra?.isCorrect).toBe(false);
    expect(q2Extra?.marksAwarded).toBe(-0.25);

    // 3. Exact match (optA, optB in any order) awards full marks
    const exactAnswers: StudentAnswerInput[] = [
      { questionId: "q2", selectedOptionIds: ["optB", "optA"] },
    ];
    const exactResult = scoreAttempt(sampleQuestions, exactAnswers, 0.25);
    const q2Exact = exactResult.details.find((d) => d.questionId === "q2");
    expect(q2Exact?.isCorrect).toBe(true);
    expect(q2Exact?.marksAwarded).toBe(3);
  });

  it("ACCEPTANCE: Total score is floored at 0 and never returns negative", () => {
    // All answers wrong with 1.0 penalty per question
    const answers: StudentAnswerInput[] = [
      { questionId: "q1", selectedOptionIds: ["opt3"] }, // -1.0
      { questionId: "q2", selectedOptionIds: ["optC"] }, // -1.0
      { questionId: "q3", selectedOptionIds: ["optTrue"] }, // -1.0
    ];

    const result = scoreAttempt(sampleQuestions, answers, 1.0);

    // Raw total is -3.0, but final score must be floored at 0
    expect(result.totalScore).toBe(0);
    expect(result.penaltyDeducted).toBe(3.0);
    expect(result.incorrectCount).toBe(3);
  });

  it("correctly computes mixed scores with negative marking deduction", () => {
    const answers: StudentAnswerInput[] = [
      { questionId: "q1", selectedOptionIds: ["opt1"] }, // Correct: +2.0
      { questionId: "q2", selectedOptionIds: ["optA"] }, // Wrong multiple: -0.5
      { questionId: "q3", selectedOptionIds: [] }, // Empty: 0
    ];

    const result = scoreAttempt(sampleQuestions, answers, 0.5);

    // 2.0 - 0.5 + 0 = 1.5
    expect(result.totalScore).toBe(1.5);
    expect(result.correctCount).toBe(1);
    expect(result.incorrectCount).toBe(1);
    expect(result.unansweredCount).toBe(1);
    expect(result.penaltyDeducted).toBe(0.5);
  });
});
