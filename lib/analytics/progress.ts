/**
 * Pure, unit-tested progress calculation and weight renormalization engine.
 */

export interface ComponentWeights {
  lecture: number; // default: 0.30
  assignment: number; // default: 0.30
  quiz: number; // default: 0.40
}

export const DEFAULT_PROGRESS_WEIGHTS: ComponentWeights = {
  lecture: 0.30,
  assignment: 0.30,
  quiz: 0.40,
};

/**
 * Parses ComponentWeights from a Setting JSON object or returns defaults.
 * Accepts keys like "lecture", "assignment", "quiz" or "lectureWeight", "assignmentWeight", "quizWeight".
 */
export function parseProgressWeights(raw: unknown): ComponentWeights {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_PROGRESS_WEIGHTS };
  }

  const obj = raw as Record<string, unknown>;

  const getWeight = (val1: unknown, val2: unknown, fallback: number): number => {
    const n = Number(val1 ?? val2);
    return isNaN(n) || n < 0 ? fallback : n;
  };

  const lecture = getWeight(obj.lecture, obj.materialsWeight ?? obj.lectureWeight, DEFAULT_PROGRESS_WEIGHTS.lecture);
  const assignment = getWeight(obj.assignment, obj.assignmentWeight, DEFAULT_PROGRESS_WEIGHTS.assignment);
  const quiz = getWeight(obj.quiz, obj.quizWeight, DEFAULT_PROGRESS_WEIGHTS.quiz);

  return { lecture, assignment, quiz };
}

export interface ActiveComponents {
  lecture: boolean;
  assignment: boolean;
  quiz: boolean;
}

export interface RenormalizedWeights {
  lecture: number;
  assignment: number;
  quiz: number;
  hasAnyComponent: boolean;
}

/**
 * Renormalizes weights based on components that exist for the course.
 * If a component does not exist (for example no quizzes yet), exclude it
 * and renormalize remaining weights so their sum equals 1.0 (or 0 if none exist).
 */
export function renormalizeWeights(
  weights: ComponentWeights = DEFAULT_PROGRESS_WEIGHTS,
  active: ActiveComponents
): RenormalizedWeights {
  let activeWeightSum = 0;

  if (active.lecture) activeWeightSum += weights.lecture;
  if (active.assignment) activeWeightSum += weights.assignment;
  if (active.quiz) activeWeightSum += weights.quiz;

  if (activeWeightSum <= 0) {
    return {
      lecture: 0,
      assignment: 0,
      quiz: 0,
      hasAnyComponent: false,
    };
  }

  return {
    lecture: active.lecture ? weights.lecture / activeWeightSum : 0,
    assignment: active.assignment ? weights.assignment / activeWeightSum : 0,
    quiz: active.quiz ? weights.quiz / activeWeightSum : 0,
    hasAnyComponent: true,
  };
}

/**
 * 1. lectureCompletion = completed published materials / published materials.
 */
export function calculateLectureCompletion(
  completedCount: number,
  totalPublishedMaterials: number
): { ratio: number; percentage: number; exists: boolean } {
  if (totalPublishedMaterials <= 0) {
    return { ratio: 0, percentage: 0, exists: false };
  }

  const ratio = Math.min(1, Math.max(0, completedCount / totalPublishedMaterials));
  const percentage = Math.round(ratio * 10000) / 100;

  return { ratio, percentage, exists: true };
}

/**
 * 2a. assignmentCompletion = submitted (or graded) published assignments due so far / published assignments due so far.
 */
export function calculateAssignmentCompletion(
  submittedDueCount: number,
  publishedAssignmentsDueSoFar: number
): { ratio: number; percentage: number; exists: boolean } {
  if (publishedAssignmentsDueSoFar <= 0) {
    return { ratio: 0, percentage: 0, exists: false };
  }

  const ratio = Math.min(1, Math.max(0, submittedDueCount / publishedAssignmentsDueSoFar));
  const percentage = Math.round(ratio * 10000) / 100;

  return { ratio, percentage, exists: true };
}

export interface GradedAssignmentItem {
  finalMarks: number;
  maxMarks: number;
}

/**
 * 2b. assignmentAverage = mean of final marks / max over graded ones.
 * Returns null if no assignments have been graded for the student.
 */
export function calculateAssignmentAverage(
  gradedItems: GradedAssignmentItem[]
): { averagePercentage: number | null; hasGraded: boolean } {
  const validItems = gradedItems.filter((item) => Number(item.maxMarks) > 0);

  if (validItems.length === 0) {
    return { averagePercentage: null, hasGraded: false };
  }

  const percentages = validItems.map((item) => {
    const rawRatio = Number(item.finalMarks) / Number(item.maxMarks);
    return Math.max(0, rawRatio) * 100;
  });

  const sum = percentages.reduce((acc, p) => acc + p, 0);
  const mean = sum / percentages.length;
  const averagePercentage = Math.round(mean * 100) / 100;

  return { averagePercentage, hasGraded: true };
}

export interface QuizAttemptScoreItem {
  maxScore: number;
  maxMarks: number;
}

/**
 * 3. quizAverage = mean of the best attempt percent per quiz.
 * Returns null if student has not attempted any quizzes or no quizzes with maxMarks > 0 exist.
 */
export function calculateQuizAverage(
  bestAttemptsPerQuiz: QuizAttemptScoreItem[]
): { averagePercentage: number | null; hasAttempts: boolean } {
  const validQuizzes = bestAttemptsPerQuiz.filter((q) => Number(q.maxMarks) > 0);

  if (validQuizzes.length === 0) {
    return { averagePercentage: null, hasAttempts: false };
  }

  const percentages = validQuizzes.map((q) => {
    const ratio = Number(q.maxScore) / Number(q.maxMarks);
    return Math.max(0, ratio) * 100;
  });

  const sum = percentages.reduce((acc, p) => acc + p, 0);
  const mean = sum / percentages.length;
  const averagePercentage = Math.round(mean * 100) / 100;

  return { averagePercentage, hasAttempts: true };
}

export interface ProgressCalculationInput {
  // Lecture
  completedMaterials: number;
  totalPublishedMaterials: number;

  // Assignment
  submittedDueAssignments: number;
  publishedAssignmentsDueSoFar: number;

  // Quiz
  totalPublishedQuizzes: number;
  quizAverage: number | null; // null if student has no attempts

  // Optional manual existence overrides
  hasLectureComponent?: boolean;
  hasAssignmentComponent?: boolean;
  hasQuizComponent?: boolean;
}

export interface ProgressResult {
  progress: number; // 0 to 100, rounded to 2 decimal places
  lectureCompletion: number; // percentage 0-100
  assignmentCompletion: number; // percentage 0-100
  quizScore: number; // percentage 0-100 (0 if unattempted in course with quizzes)
  activeComponents: ActiveComponents;
  renormalizedWeights: RenormalizedWeights;
}

/**
 * 4. progress = weighted sum using weights from Setting (default 0.30 lecture, 0.30 assignment, 0.40 quiz).
 * If a component does not exist for the course (for example no quizzes yet), exclude it and renormalize remaining weights.
 */
export function calculateProgress(
  input: ProgressCalculationInput,
  rawWeights: ComponentWeights = DEFAULT_PROGRESS_WEIGHTS
): ProgressResult {
  const lectureExists =
    input.hasLectureComponent ?? input.totalPublishedMaterials > 0;
  const assignmentExists =
    input.hasAssignmentComponent ?? input.publishedAssignmentsDueSoFar > 0;
  const quizExists =
    input.hasQuizComponent ?? input.totalPublishedQuizzes > 0;

  const activeComponents: ActiveComponents = {
    lecture: lectureExists,
    assignment: assignmentExists,
    quiz: quizExists,
  };

  const renormalized = renormalizeWeights(rawWeights, activeComponents);

  const lectureComp = calculateLectureCompletion(
    input.completedMaterials,
    input.totalPublishedMaterials
  );
  const assignmentComp = calculateAssignmentCompletion(
    input.submittedDueAssignments,
    input.publishedAssignmentsDueSoFar
  );

  // If quizzes exist for the course, student score is quizAverage (or 0 if not attempted yet).
  // If no quizzes exist for the course, quiz component is excluded and has 0 weight.
  const quizScore = quizExists ? input.quizAverage ?? 0 : 0;

  if (!renormalized.hasAnyComponent) {
    return {
      progress: 0,
      lectureCompletion: lectureComp.percentage,
      assignmentCompletion: assignmentComp.percentage,
      quizScore,
      activeComponents,
      renormalizedWeights: renormalized,
    };
  }

  const weightedSum =
    renormalized.lecture * lectureComp.percentage +
    renormalized.assignment * assignmentComp.percentage +
    renormalized.quiz * quizScore;

  const progress = Math.min(100, Math.max(0, Math.round(weightedSum * 100) / 100));

  return {
    progress,
    lectureCompletion: lectureComp.percentage,
    assignmentCompletion: assignmentComp.percentage,
    quizScore,
    activeComponents,
    renormalizedWeights: renormalized,
  };
}
