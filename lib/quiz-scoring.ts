import { QuestionType } from "@prisma/client";

export interface QuestionForScoring {
  id: string;
  type: QuestionType;
  marks: number;
  options: {
    id: string;
    isCorrect: boolean;
  }[];
}

export interface StudentAnswerInput {
  questionId: string;
  selectedOptionIds: string[];
}

export interface QuestionScoreDetail {
  questionId: string;
  type: QuestionType;
  selectedOptionIds: string[];
  isCorrect: boolean;
  isEmpty: boolean;
  marksAwarded: number;
  maxMarks: number;
}

export interface AttemptScoreResult {
  totalScore: number;
  maxPossibleMarks: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  penaltyDeducted: number;
  details: QuestionScoreDetail[];
}

/**
 * Pure function to score a quiz attempt per RUET ELMS rules:
 * - SINGLE and TRUE_FALSE: full marks if correct;
 * - MULTIPLE: full marks only if the selected set equals the correct set;
 * - wrong non-empty answers subtract the penalty (negativePerWrong);
 * - empty answers score 0 (no penalty);
 * - total floored at 0 (never negative).
 */
export function scoreAttempt(
  questions: QuestionForScoring[],
  answers: StudentAnswerInput[],
  negativePerWrong: number = 0
): AttemptScoreResult {
  const penalty = Math.max(0, Number(negativePerWrong) || 0);

  // Map answers by questionId
  const answerMap = new Map<string, string[]>();
  for (const a of answers) {
    if (a.questionId && Array.isArray(a.selectedOptionIds)) {
      answerMap.set(a.questionId, a.selectedOptionIds);
    }
  }

  let rawTotal = 0;
  let maxPossibleMarks = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  let totalPenalty = 0;
  const details: QuestionScoreDetail[] = [];

  for (const q of questions) {
    const qMarks = Number(q.marks) || 0;
    maxPossibleMarks += qMarks;

    const selectedIds = answerMap.get(q.id) || [];
    const isEmpty = selectedIds.length === 0;

    let isCorrect = false;
    let marksAwarded = 0;

    if (isEmpty) {
      unansweredCount++;
      marksAwarded = 0;
    } else {
      if (q.type === QuestionType.SINGLE || q.type === QuestionType.TRUE_FALSE) {
        const correctOpt = q.options.find((o) => o.isCorrect);
        // SINGLE/TRUE_FALSE expects exactly one option selected
        isCorrect = correctOpt ? selectedIds.length === 1 && selectedIds[0] === correctOpt.id : false;

        if (isCorrect) {
          marksAwarded = qMarks;
          correctCount++;
        } else {
          marksAwarded = -penalty;
          incorrectCount++;
          totalPenalty += penalty;
        }
      } else if (q.type === QuestionType.MULTIPLE) {
        const correctSet = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
        const selectedSet = new Set(selectedIds);

        // Multiple full marks ONLY if the selected set equals the correct set
        const isSetEqual =
          correctSet.size === selectedSet.size &&
          [...selectedSet].every((id) => correctSet.has(id));

        if (isSetEqual) {
          isCorrect = true;
          marksAwarded = qMarks;
          correctCount++;
        } else {
          isCorrect = false;
          marksAwarded = -penalty;
          incorrectCount++;
          totalPenalty += penalty;
        }
      }
    }

    rawTotal += marksAwarded;

    details.push({
      questionId: q.id,
      type: q.type,
      selectedOptionIds: selectedIds,
      isCorrect,
      isEmpty,
      marksAwarded,
      maxMarks: qMarks,
    });
  }

  // Total is floored at 0
  const finalScore = Math.max(0, Math.round(rawTotal * 100) / 100);

  return {
    totalScore: finalScore,
    maxPossibleMarks: Math.round(maxPossibleMarks * 100) / 100,
    correctCount,
    incorrectCount,
    unansweredCount,
    penaltyDeducted: Math.round(totalPenalty * 100) / 100,
    details,
  };
}

/**
 * Creates a deterministic 32-bit PRNG (Mulberry32) from an integer seed.
 */
export function createPrng(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computes a stable 32-bit hash integer from a string (e.g. attemptId).
 */
export function hashStringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Returns a new array shuffled using Fisher-Yates with the provided PRNG.
 */
export function shuffleArray<T>(array: T[], prng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Calculates a student's effective quiz score from submitted attempts
 * based on the configured grading method (BEST, LATEST, or AVERAGE).
 */
export function calcQuizGrade(
  attempts: { score: number; submittedAt: Date | string }[],
  method: "BEST" | "LATEST" | "AVERAGE" = "BEST"
): number | null {
  if (!attempts || attempts.length === 0) return null;

  const validAttempts = attempts.filter(
    (a) => a.score !== null && a.score !== undefined && !isNaN(Number(a.score))
  );
  if (validAttempts.length === 0) return null;

  if (method === "BEST") {
    const maxScore = Math.max(...validAttempts.map((a) => Number(a.score)));
    return Math.round(maxScore * 100) / 100;
  }

  if (method === "LATEST") {
    const sorted = [...validAttempts].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
    return Math.round(Number(sorted[0].score) * 100) / 100;
  }

  if (method === "AVERAGE") {
    const sum = validAttempts.reduce((acc, a) => acc + Number(a.score), 0);
    return Math.round((sum / validAttempts.length) * 100) / 100;
  }

  return null;
}

