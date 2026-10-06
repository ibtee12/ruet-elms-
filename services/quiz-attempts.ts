import { prisma } from "@/lib/prisma";
import {
  Role,
  QuestionType,
  QuestionDifficulty,
  CourseOfferingStatus,
  QuizGradingMethod,
  Prisma,
} from "@prisma/client";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/auth/errors";
import { assertEnrolled, assertOfferingTeacher } from "@/lib/auth/guards";
import {
  scoreAttempt,
  createPrng,
  hashStringToSeed,
  shuffleArray,
  calcQuizGrade,
  AttemptScoreResult,
} from "@/lib/quiz-scoring";
import { notifyQuizResultsAvailable } from "@/lib/notifications";
import { sanitizeCsvCell } from "@/lib/gradebook";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StudentQuizCategory = "OPEN" | "UPCOMING" | "ATTEMPTED" | "CLOSED";

export interface StudentQuizListItem {
  id: string;
  offeringId: string;
  title: string;
  description: string | null;
  durationMin: number;
  startAt: Date;
  endAt: Date;
  maxAttempts: number;
  negativeMarkPerWrong: number;
  questionsCount: number;
  totalMarks: number;
  category: StudentQuizCategory;
  attemptsUsed: number;
  bestScore: number | null;
  hasInProgressAttempt: boolean;
  inProgressAttemptId?: string;
}

export interface StudentQuizInfo {
  id: string;
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  title: string;
  description: string | null;
  durationMin: number;
  startAt: Date;
  endAt: Date;
  maxAttempts: number;
  negativeMarkPerWrong: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showAnswersAfterClose: boolean;
  questionsCount: number;
  totalMarks: number;
  isWithinWindow: boolean;
  isUpcoming: boolean;
  isClosed: boolean;
  attemptsUsed: number;
  canStartNewAttempt: boolean;
  hasInProgressAttempt: boolean;
  inProgressAttemptId?: string;
  completedAttempts: {
    id: string;
    startedAt: Date;
    submittedAt: Date;
    score: number;
    durationMinutes: number;
  }[];
}

export interface QuizAttemptQuestionView {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  topicName: string | null;
  difficulty: QuestionDifficulty | null;
  order: number;
  options: {
    id: string;
    text: string;
    order: number;
    // CRITICAL: isCorrect is NEVER present!
  }[];
}

export interface QuizAttemptSessionData {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  courseCode: string;
  startedAt: Date;
  serverDeadline: Date;
  serverNow: Date;
  durationMin: number;
  negativeMarkPerWrong: number;
  questions: QuizAttemptQuestionView[];
  savedAnswers: {
    questionId: string;
    selectedOptionIds: string[];
  }[];
}

export interface AttemptResultView {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  courseCode: string;
  offeringId: string;
  startedAt: Date;
  submittedAt: Date;
  durationTakenMinutes: number;
  score: number;
  maxPossibleMarks: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  penaltyDeducted: number;
  canViewAnswers: boolean;
  closeDate: Date;
  reviewQuestions?: {
    id: string;
    text: string;
    type: QuestionType;
    marks: number;
    isCorrect: boolean;
    marksAwarded: number;
    selectedOptionIds: string[];
    options: {
      id: string;
      text: string;
      isCorrect: boolean;
    }[];
  }[];
}

// ---------------------------------------------------------------------------
// Service Functions
// ---------------------------------------------------------------------------

/**
 * Returns student's quizzes list categorized into Open, Upcoming, Attempted, Closed.
 */
export async function getStudentQuizzesList(
  offeringId: string,
  studentId: string
): Promise<{
  open: StudentQuizListItem[];
  upcoming: StudentQuizListItem[];
  attempted: StudentQuizListItem[];
  closed: StudentQuizListItem[];
  all: StudentQuizListItem[];
}> {
  await assertEnrolled(studentId, offeringId);

  const quizzes = await prisma.quiz.findMany({
    where: {
      offeringId,
      published: true,
    },
    include: {
      questions: { select: { marks: true } },
      attempts: {
        where: { studentId },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { startAt: "asc" },
  });

  const now = new Date();
  const open: StudentQuizListItem[] = [];
  const upcoming: StudentQuizListItem[] = [];
  const attempted: StudentQuizListItem[] = [];
  const closed: StudentQuizListItem[] = [];
  const all: StudentQuizListItem[] = [];

  for (const q of quizzes) {
    const totalMarks = q.questions.reduce((sum, qu) => sum + Number(qu.marks), 0);
    const completedAttempts = q.attempts.filter((a) => a.submittedAt !== null);
    const inProgress = q.attempts.find((a) => a.submittedAt === null);

    let bestScore: number | null = null;
    if (completedAttempts.length > 0) {
      bestScore = Math.max(...completedAttempts.map((a) => Number(a.score) || 0));
    }

    const isWindowOpen = now >= q.startAt && now <= q.endAt;
    const isUpcomingWindow = now < q.startAt;
    const isClosedWindow = now > q.endAt;

    let category: StudentQuizCategory = "OPEN";
    if (isUpcomingWindow) {
      category = "UPCOMING";
    } else if (isClosedWindow) {
      category = "CLOSED";
    } else if (completedAttempts.length >= q.maxAttempts && !inProgress) {
      category = "ATTEMPTED";
    } else {
      category = "OPEN";
    }

    const item: StudentQuizListItem = {
      id: q.id,
      offeringId: q.offeringId,
      title: q.title,
      description: q.description,
      durationMin: q.durationMin,
      startAt: q.startAt,
      endAt: q.endAt,
      maxAttempts: q.maxAttempts,
      negativeMarkPerWrong: Number(q.negativeMarkPerWrong),
      questionsCount: q.questions.length,
      totalMarks,
      category,
      attemptsUsed: completedAttempts.length,
      bestScore,
      hasInProgressAttempt: !!inProgress,
      inProgressAttemptId: inProgress?.id,
    };

    all.push(item);
    if (category === "OPEN") open.push(item);
    else if (category === "UPCOMING") upcoming.push(item);
    else if (category === "ATTEMPTED") attempted.push(item);
    else if (category === "CLOSED") closed.push(item);
  }

  return { open, upcoming, attempted, closed, all };
}

/**
 * Returns quiz info and student attempt status for the quiz details view.
 */
export async function getStudentQuizInfo(
  quizId: string,
  offeringId: string,
  studentId: string
): Promise<StudentQuizInfo> {
  await assertEnrolled(studentId, offeringId);

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      offering: {
        select: {
          course: { select: { code: true, title: true } },
        },
      },
      questions: { select: { marks: true } },
      attempts: {
        where: { studentId },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!quiz || quiz.offeringId !== offeringId || !quiz.published) {
    throw new NotFoundError("Quiz not found or not published.");
  }

  const now = new Date();
  const totalMarks = quiz.questions.reduce((sum, qu) => sum + Number(qu.marks), 0);
  const completedAttempts = quiz.attempts.filter((a) => a.submittedAt !== null);
  const inProgressAttempt = quiz.attempts.find((a) => a.submittedAt === null);

  const isWithinWindow = now >= quiz.startAt && now <= quiz.endAt;
  const isUpcoming = now < quiz.startAt;
  const isClosed = now > quiz.endAt;

  const canStartNewAttempt =
    isWithinWindow &&
    completedAttempts.length < quiz.maxAttempts &&
    !inProgressAttempt;

  return {
    id: quiz.id,
    offeringId: quiz.offeringId,
    courseCode: quiz.offering.course.code,
    courseTitle: quiz.offering.course.title,
    title: quiz.title,
    description: quiz.description,
    durationMin: quiz.durationMin,
    startAt: quiz.startAt,
    endAt: quiz.endAt,
    maxAttempts: quiz.maxAttempts,
    negativeMarkPerWrong: Number(quiz.negativeMarkPerWrong),
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleOptions: quiz.shuffleOptions,
    showAnswersAfterClose: quiz.showAnswersAfterClose,
    questionsCount: quiz.questions.length,
    totalMarks,
    isWithinWindow,
    isUpcoming,
    isClosed,
    attemptsUsed: completedAttempts.length,
    canStartNewAttempt,
    hasInProgressAttempt: !!inProgressAttempt,
    inProgressAttemptId: inProgressAttempt?.id,
    completedAttempts: completedAttempts.map((a) => {
      const dur = a.submittedAt
        ? Math.max(1, Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / (60 * 1000)))
        : quiz.durationMin;
      return {
        id: a.id,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt!,
        score: Number(a.score) || 0,
        durationMinutes: dur,
      };
    }),
  };
}

/**
 * Starts a new attempt or resumes an unfinished attempt.
 * Delivers stable seeded shuffled questions and options WITHOUT isCorrect.
 */
export async function startOrResumeAttempt(
  quizId: string,
  offeringId: string,
  studentId: string
): Promise<QuizAttemptSessionData> {
  // 1. Verify active enrollment
  await assertEnrolled(studentId, offeringId);

  // 2. Fetch quiz
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      offering: {
        select: {
          status: true,
          course: { select: { code: true } },
        },
      },
      questions: {
        orderBy: { order: "asc" },
        include: {
          topic: { select: { name: true } },
          options: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  if (!quiz || quiz.offeringId !== offeringId || !quiz.published) {
    throw new NotFoundError("Quiz not found or not published.");
  }

  if (quiz.offering.status === CourseOfferingStatus.ARCHIVED) {
    throw new ForbiddenError("Course offering is archived and read-only.");
  }

  const now = new Date();

  // 3. Time window check
  if (now < quiz.startAt) {
    throw new ValidationError("Quiz availability window has not opened yet.");
  }
  if (now > quiz.endAt) {
    throw new ValidationError("Quiz availability window has ended.");
  }

  // 4. Check for existing unfinished attempt
  const unfinishedAttempt = await prisma.quizAttempt.findFirst({
    where: {
      quizId,
      studentId,
      submittedAt: null,
    },
    include: {
      answers: true,
    },
  });

  let activeAttempt = unfinishedAttempt;

  if (activeAttempt) {
    // Calculate server deadline for existing attempt: min(startedAt + duration, endAt)
    const deadlineMs = Math.min(
      activeAttempt.startedAt.getTime() + quiz.durationMin * 60 * 1000,
      quiz.endAt.getTime()
    );

    // If existing attempt has expired, auto-submit it!
    if (now.getTime() > deadlineMs) {
      await submitAttempt(activeAttempt.id, studentId);
      activeAttempt = null;
    }
  }

  // If no active in-progress attempt, check max attempts and create a new one
  if (!activeAttempt) {
    const completedAttemptsCount = await prisma.quizAttempt.count({
      where: {
        quizId,
        studentId,
        submittedAt: { not: null },
      },
    });

    if (completedAttemptsCount >= quiz.maxAttempts) {
      throw new ValidationError(
        `You have used all ${quiz.maxAttempts} allowed attempts for this quiz.`
      );
    }

    // Create new attempt
    const newAttempt = await prisma.quizAttempt.create({
      data: {
        quizId,
        studentId,
        startedAt: new Date(),
      },
      include: {
        answers: true,
      },
    });

    // Log ActivityEvent: QUIZ_STARTED
    await prisma.activityEvent.create({
      data: {
        userId: studentId,
        offeringId,
        type: "QUIZ_STARTED",
      },
    });

    activeAttempt = newAttempt;
  }

  // Calculate official server deadline
  const serverDeadline = new Date(
    Math.min(
      activeAttempt.startedAt.getTime() + quiz.durationMin * 60 * 1000,
      quiz.endAt.getTime()
    )
  );

  // 5. Seeded shuffle for stable questions and options
  const seed = hashStringToSeed(activeAttempt.id);
  const prng = createPrng(seed);

  // Shuffle questions if quiz.shuffleQuestions is true
  let orderedQuestions = quiz.questions;
  if (quiz.shuffleQuestions) {
    orderedQuestions = shuffleArray(orderedQuestions, prng);
  }

  // Prepare questions payload WITHOUT isCorrect
  const sanitizedQuestions: QuizAttemptQuestionView[] = orderedQuestions.map((q, qIndex) => {
    // Use PRNG or derived seed for options
    let orderedOptions = q.options;
    if (quiz.shuffleOptions) {
      const optPrng = createPrng(hashStringToSeed(`${activeAttempt.id}_${q.id}`));
      orderedOptions = shuffleArray(orderedOptions, optPrng);
    }

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      marks: Number(q.marks),
      topicName: q.topic?.name || null,
      difficulty: q.difficulty,
      order: qIndex,
      options: orderedOptions.map((opt, oIndex) => ({
        id: opt.id,
        text: opt.text,
        order: oIndex,
      })),
    };
  });

  return {
    attemptId: activeAttempt.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    courseCode: quiz.offering.course.code,
    startedAt: activeAttempt.startedAt,
    serverDeadline,
    serverNow: new Date(),
    durationMin: quiz.durationMin,
    negativeMarkPerWrong: Number(quiz.negativeMarkPerWrong),
    questions: sanitizedQuestions,
    savedAnswers: activeAttempt.answers.map((a) => ({
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
    })),
  };
}

/**
 * Retrieves session data for an existing attempt by ID.
 * Resynthesizes the same seeded shuffle order and strips isCorrect.
 */
export async function getQuizAttemptSession(
  attemptId: string,
  studentId: string
): Promise<QuizAttemptSessionData> {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      quiz: {
        include: {
          offering: {
            select: {
              status: true,
              course: { select: { code: true } },
            },
          },
          questions: {
            orderBy: { order: "asc" },
            include: {
              topic: { select: { name: true } },
              options: { orderBy: { order: "asc" } },
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt || attempt.studentId !== studentId) {
    throw new NotFoundError("Quiz attempt not found.");
  }

  if (attempt.submittedAt !== null) {
    throw new ValidationError("Quiz attempt has already been submitted.");
  }

  const now = new Date();
  const serverDeadline = new Date(
    Math.min(
      attempt.startedAt.getTime() + attempt.quiz.durationMin * 60 * 1000,
      attempt.quiz.endAt.getTime()
    )
  );

  // If expired, auto-submit
  if (now > serverDeadline) {
    await submitAttempt(attemptId, studentId);
    throw new ValidationError("Attempt time has expired and has been submitted.");
  }

  // Seeded shuffle for stable questions and options
  const seed = hashStringToSeed(attempt.id);
  const prng = createPrng(seed);

  let orderedQuestions = attempt.quiz.questions;
  if (attempt.quiz.shuffleQuestions) {
    orderedQuestions = shuffleArray(orderedQuestions, prng);
  }

  const sanitizedQuestions: QuizAttemptQuestionView[] = orderedQuestions.map((q, qIndex) => {
    let orderedOptions = q.options;
    if (attempt.quiz.shuffleOptions) {
      const optPrng = createPrng(hashStringToSeed(`${attempt.id}_${q.id}`));
      orderedOptions = shuffleArray(orderedOptions, optPrng);
    }

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      marks: Number(q.marks),
      topicName: q.topic?.name || null,
      difficulty: q.difficulty,
      order: qIndex,
      options: orderedOptions.map((opt, oIndex) => ({
        id: opt.id,
        text: opt.text,
        order: oIndex,
      })),
    };
  });

  return {
    attemptId: attempt.id,
    quizId: attempt.quiz.id,
    quizTitle: attempt.quiz.title,
    courseCode: attempt.quiz.offering.course.code,
    startedAt: attempt.startedAt,
    serverDeadline,
    serverNow: new Date(),
    durationMin: attempt.quiz.durationMin,
    negativeMarkPerWrong: Number(attempt.quiz.negativeMarkPerWrong),
    questions: sanitizedQuestions,
    savedAnswers: attempt.answers.map((a) => ({
      questionId: a.questionId,
      selectedOptionIds: a.selectedOptionIds,
    })),
  };
}

/**
 * Autosaves an answer for an attempt question.
 * ENFORCES SERVER DEADLINE:
 * "Answers saved after the server deadline are ignored."
 */
export async function saveAttemptAnswer(
  attemptId: string,
  questionId: string,
  selectedOptionIds: string[],
  studentId: string
): Promise<{ success: boolean; saved: boolean; message?: string }> {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: true },
  });

  if (!attempt || attempt.studentId !== studentId) {
    throw new NotFoundError("Quiz attempt not found.");
  }

  if (attempt.submittedAt !== null) {
    throw new ValidationError("Quiz attempt is already submitted.");
  }

  const now = new Date();
  const serverDeadline = Math.min(
    attempt.startedAt.getTime() + attempt.quiz.durationMin * 60 * 1000,
    attempt.quiz.endAt.getTime()
  );

  // ACCEPTANCE: Answers saved after server deadline are ignored
  if (now.getTime() > serverDeadline) {
    // Auto-submit expired attempt
    await submitAttempt(attemptId, studentId).catch(() => {});
    return {
      success: false,
      saved: false,
      message: "Time limit has expired. Answers after the deadline are not saved.",
    };
  }

  // Upsert the answer
  await prisma.answer.upsert({
    where: {
      attemptId_questionId: {
        attemptId,
        questionId,
      },
    },
    create: {
      attemptId,
      questionId,
      selectedOptionIds,
      isCorrect: false, // computed on final submission
      marksAwarded: new Prisma.Decimal(0),
    },
    update: {
      selectedOptionIds,
      updatedAt: new Date(),
    },
  });

  return { success: true, saved: true };
}

/**
 * Submits and grades a quiz attempt entirely on the server.
 * Uses scoreAttempt pure function inside a database transaction.
 */
export async function submitAttempt(
  attemptId: string,
  studentId: string
): Promise<{ success: boolean; score: number; maxPossibleMarks: number }> {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      quiz: {
        include: {
          questions: {
            include: {
              options: true,
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt || attempt.studentId !== studentId) {
    throw new NotFoundError("Quiz attempt not found.");
  }

  // Idempotency: if already submitted, return recorded score
  if (attempt.submittedAt !== null) {
    return {
      success: true,
      score: Number(attempt.score) || 0,
      maxPossibleMarks: attempt.quiz.questions.reduce((sum, q) => sum + Number(q.marks), 0),
    };
  }

  const serverDeadline = Math.min(
    attempt.startedAt.getTime() + attempt.quiz.durationMin * 60 * 1000,
    attempt.quiz.endAt.getTime()
  );

  // Filter answers saved before or at deadline (with 5 second network grace)
  const graceMs = 5000;
  const validAnswers = attempt.answers.filter(
    (a) => a.updatedAt.getTime() <= serverDeadline + graceMs
  );

  // Grade using scoreAttempt pure function
  const questionsForScoring = attempt.quiz.questions.map((q) => ({
    id: q.id,
    type: q.type,
    marks: Number(q.marks),
    options: q.options.map((o) => ({
      id: o.id,
      isCorrect: o.isCorrect,
    })),
  }));

  const answersForScoring = validAnswers.map((a) => ({
    questionId: a.questionId,
    selectedOptionIds: a.selectedOptionIds,
  }));

  const scoreResult = scoreAttempt(
    questionsForScoring,
    answersForScoring,
    Number(attempt.quiz.negativeMarkPerWrong)
  );

  // Run in a transaction
  await prisma.$transaction(async (tx) => {
    // Update individual answer records with marks and correctness
    for (const detail of scoreResult.details) {
      if (!detail.isEmpty) {
        await tx.answer.upsert({
          where: {
            attemptId_questionId: {
              attemptId,
              questionId: detail.questionId,
            },
          },
          create: {
            attemptId,
            questionId: detail.questionId,
            selectedOptionIds: detail.selectedOptionIds,
            isCorrect: detail.isCorrect,
            marksAwarded: new Prisma.Decimal(detail.marksAwarded),
          },
          update: {
            isCorrect: detail.isCorrect,
            marksAwarded: new Prisma.Decimal(detail.marksAwarded),
          },
        });
      }
    }

    // Finalize attempt
    await tx.quizAttempt.update({
      where: { id: attemptId },
      data: {
        submittedAt: new Date(),
        score: new Prisma.Decimal(scoreResult.totalScore),
      },
    });

    // Log ActivityEvent: QUIZ_SUBMITTED
    await tx.activityEvent.create({
      data: {
        userId: studentId,
        offeringId: attempt.quiz.offeringId,
        type: "QUIZ_SUBMITTED",
      },
    });
  });

  return {
    success: true,
    score: scoreResult.totalScore,
    maxPossibleMarks: scoreResult.maxPossibleMarks,
  };
}

/**
 * Returns quiz attempt results.
 * If quiz.showAnswersAfterClose is enabled AND the window is closed,
 * includes question review and correct options.
 */
export async function getAttemptResult(
  attemptId: string,
  studentId: string
): Promise<AttemptResultView> {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      quiz: {
        include: {
          offering: {
            select: {
              course: { select: { code: true } },
            },
          },
          questions: {
            orderBy: { order: "asc" },
            include: {
              options: { orderBy: { order: "asc" } },
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt) {
    throw new NotFoundError("Quiz attempt not found.");
  }

  if (attempt.studentId !== studentId) {
    throw new ForbiddenError("You cannot view this attempt.");
  }

  if (attempt.submittedAt === null) {
    throw new ValidationError("Attempt has not been submitted yet.");
  }

  const now = new Date();
  const isClosed = now > attempt.quiz.endAt;
  const canViewAnswers = attempt.quiz.showAnswersAfterClose && isClosed;

  const durationMs = attempt.submittedAt.getTime() - attempt.startedAt.getTime();
  const durationTakenMinutes = Math.max(1, Math.round(durationMs / (60 * 1000)));

  // Compute question statistics
  const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));
  const questionsForScoring = attempt.quiz.questions.map((q) => ({
    id: q.id,
    type: q.type,
    marks: Number(q.marks),
    options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
  }));
  const answersForScoring = attempt.answers.map((a) => ({
    questionId: a.questionId,
    selectedOptionIds: a.selectedOptionIds,
  }));

  const scoreResult = scoreAttempt(
    questionsForScoring,
    answersForScoring,
    Number(attempt.quiz.negativeMarkPerWrong)
  );

  let reviewQuestions = undefined;
  if (canViewAnswers) {
    const detailMap = new Map(scoreResult.details.map((d) => [d.questionId, d]));

    reviewQuestions = attempt.quiz.questions.map((q) => {
      const detail = detailMap.get(q.id);
      const studentAns = answerMap.get(q.id);

      return {
        id: q.id,
        text: q.text,
        type: q.type,
        marks: Number(q.marks),
        isCorrect: detail?.isCorrect || false,
        marksAwarded: detail?.marksAwarded || 0,
        selectedOptionIds: studentAns?.selectedOptionIds || [],
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
        })),
      };
    });
  }

  return {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    quizTitle: attempt.quiz.title,
    courseCode: attempt.quiz.offering.course.code,
    offeringId: attempt.quiz.offeringId,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    durationTakenMinutes,
    score: Number(attempt.score) || 0,
    maxPossibleMarks: scoreResult.maxPossibleMarks,
    correctCount: scoreResult.correctCount,
    incorrectCount: scoreResult.incorrectCount,
    unansweredCount: scoreResult.unansweredCount,
    penaltyDeducted: scoreResult.penaltyDeducted,
    canViewAnswers,
    closeDate: attempt.quiz.endAt,
    reviewQuestions,
  };
}

// ---------------------------------------------------------------------------
// Teacher Quiz Results & Analysis
// ---------------------------------------------------------------------------

export interface QuizStudentResultRow {
  studentId: string;
  name: string;
  email: string;
  roll: string | null;
  sectionName: string;
  attemptsUsed: number;
  score: number | null; // Effective score according to configured gradingMethod
  percentage: number | null;
  durationTakenMinutes: number | null;
  latestSubmittedAt: Date | null;
  attempts: {
    id: string;
    startedAt: Date;
    submittedAt: Date | null;
    score: number;
    durationMinutes: number;
  }[];
}

export interface QuizQuestionStat {
  id: string;
  order: number;
  text: string;
  type: QuestionType;
  marks: number;
  topicName: string | null;
  difficulty: QuestionDifficulty | null;
  totalAttempts: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  correctnessRate: number; // percentage 0 - 100
  isHard: boolean; // correctnessRate < 50
}

export interface ScoreDistributionBucket {
  range: string;
  count: number;
  percentage: number;
}

export interface TeacherQuizResultsData {
  quizId: string;
  quizTitle: string;
  courseCode: string;
  courseTitle: string;
  offeringId: string;
  durationMin: number;
  startAt: Date;
  endAt: Date;
  isClosed: boolean;
  maxAttempts: number;
  negativeMarkPerWrong: number;
  totalMarks: number;
  gradingMethod: QuizGradingMethod;
  resultsNotified: boolean;
  totalEnrolled: number;
  totalAttempts: number;
  attemptedCount: number;
  averageScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  distribution: ScoreDistributionBucket[];
  questionStats: QuizQuestionStat[];
  students: QuizStudentResultRow[];
}

export interface TeacherAttemptDetailView {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  courseCode: string;
  offeringId: string;
  student: {
    id: string;
    name: string;
    email: string;
    roll: string | null;
    section: string;
  };
  startedAt: Date;
  submittedAt: Date | null;
  durationTakenMinutes: number;
  score: number;
  maxPossibleMarks: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  penaltyDeducted: number;
  questions: {
    id: string;
    text: string;
    type: QuestionType;
    marks: number;
    topicName: string | null;
    difficulty: QuestionDifficulty | null;
    isCorrect: boolean;
    marksAwarded: number;
    selectedOptionIds: string[];
    options: {
      id: string;
      text: string;
      isCorrect: boolean;
    }[];
  }[];
}

/**
 * Loads comprehensive quiz results, stats, distribution, and student rows for teachers.
 */
export async function getTeacherQuizResults(
  quizId: string,
  offeringId: string,
  callerId: string,
  callerRole: Role
): Promise<TeacherQuizResultsData> {
  if (callerRole !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(callerId, offeringId, { allowTA: true });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      offering: {
        include: {
          course: { select: { code: true, title: true } },
        },
      },
      questions: {
        orderBy: { order: "asc" },
        include: {
          topic: { select: { name: true } },
          options: { orderBy: { order: "asc" } },
        },
      },
    },
  });

  if (!quiz || quiz.offeringId !== offeringId) {
    throw new NotFoundError("Quiz not found.");
  }

  const totalMarks = quiz.questions.reduce((sum, q) => sum + Number(q.marks), 0);
  const now = new Date();
  const isClosed = now > quiz.endAt;

  // Fetch all active enrollments for this offering
  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      section: { offeringId },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: {
            select: { studentId: true },
          },
        },
      },
      section: { select: { name: true } },
    },
    orderBy: [
      { section: { name: "asc" } },
      { student: { name: "asc" } },
    ],
  });

  // Fetch all submitted attempts for this quiz
  const allAttempts = await prisma.quizAttempt.findMany({
    where: {
      quizId,
      submittedAt: { not: null },
    },
    include: {
      answers: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  // Group attempts by student
  const studentAttemptsMap = new Map<string, typeof allAttempts>();
  for (const att of allAttempts) {
    const list = studentAttemptsMap.get(att.studentId) || [];
    list.push(att);
    studentAttemptsMap.set(att.studentId, list);
  }

  // Build student rows
  const students: QuizStudentResultRow[] = enrollments.map((enr) => {
    const student = enr.student;
    const attempts = studentAttemptsMap.get(student.id) || [];
    const attemptsUsed = attempts.length;

    const effectiveScore = calcQuizGrade(
      attempts.map((a) => ({ score: Number(a.score) || 0, submittedAt: a.submittedAt! })),
      quiz.gradingMethod
    );

    const percentage =
      effectiveScore !== null && totalMarks > 0
        ? Math.round((effectiveScore / totalMarks) * 10000) / 100
        : null;

    const latestAttempt = attempts[0] || null;
    let durationTakenMinutes: number | null = null;
    if (latestAttempt && latestAttempt.submittedAt) {
      durationTakenMinutes = Math.max(
        1,
        Math.round(
          (latestAttempt.submittedAt.getTime() - latestAttempt.startedAt.getTime()) /
            (60 * 1000)
        )
      );
    }

    return {
      studentId: student.id,
      name: student.name,
      email: student.email,
      roll: student.studentProfile?.studentId || null,
      sectionName: enr.section.name,
      attemptsUsed,
      score: effectiveScore,
      percentage,
      durationTakenMinutes,
      latestSubmittedAt: latestAttempt?.submittedAt || null,
      attempts: attempts.map((a) => ({
        id: a.id,
        startedAt: a.startedAt,
        submittedAt: a.submittedAt,
        score: Number(a.score) || 0,
        durationMinutes: a.submittedAt
          ? Math.max(
              1,
              Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / (60 * 1000))
            )
          : 0,
      })),
    };
  });

  // Summary statistics
  const scoredStudents = students.filter((s) => s.score !== null);
  const attemptedCount = scoredStudents.length;
  const scores = scoredStudents.map((s) => s.score as number);

  const averageScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
      : null;
  const highestScore = scores.length > 0 ? Math.max(...scores) : null;
  const lowestScore = scores.length > 0 ? Math.min(...scores) : null;

  // Distribution chart buckets (5 buckets): 0-20%, 21-40%, 41-60%, 61-80%, 81-100%
  const buckets = [
    { range: "0–20%", min: 0, max: 20, count: 0 },
    { range: "21–40%", min: 20.001, max: 40, count: 0 },
    { range: "41–60%", min: 40.001, max: 60, count: 0 },
    { range: "61–80%", min: 60.001, max: 80, count: 0 },
    { range: "81–100%", min: 80.001, max: 100, count: 0 },
  ];

  for (const s of scoredStudents) {
    const pct = s.percentage ?? 0;
    for (const b of buckets) {
      if (pct >= b.min && pct <= b.max) {
        b.count++;
        break;
      }
    }
  }

  const distribution: ScoreDistributionBucket[] = buckets.map((b) => ({
    range: b.range,
    count: b.count,
    percentage: attemptedCount > 0 ? Math.round((b.count / attemptedCount) * 100) : 0,
  }));

  // Per-question stats:
  // "per-question correctness rate (percent correct) to find hard questions."
  const totalSubmittedAttempts = allAttempts.length;
  const questionStats: QuizQuestionStat[] = quiz.questions.map((q) => {
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    for (const att of allAttempts) {
      const ans = att.answers.find((a) => a.questionId === q.id);
      if (!ans || !ans.selectedOptionIds || ans.selectedOptionIds.length === 0) {
        unansweredCount++;
      } else if (ans.isCorrect) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    }

    const correctnessRate =
      totalSubmittedAttempts > 0
        ? Math.round((correctCount / totalSubmittedAttempts) * 100)
        : 0;

    return {
      id: q.id,
      order: q.order,
      text: q.text,
      type: q.type,
      marks: Number(q.marks),
      topicName: q.topic?.name || null,
      difficulty: q.difficulty,
      totalAttempts: totalSubmittedAttempts,
      correctCount,
      incorrectCount,
      unansweredCount,
      correctnessRate,
      isHard: correctnessRate < 50,
    };
  });

  return {
    quizId: quiz.id,
    quizTitle: quiz.title,
    courseCode: quiz.offering.course.code,
    courseTitle: quiz.offering.course.title,
    offeringId: quiz.offeringId,
    durationMin: quiz.durationMin,
    startAt: quiz.startAt,
    endAt: quiz.endAt,
    isClosed,
    maxAttempts: quiz.maxAttempts,
    negativeMarkPerWrong: Number(quiz.negativeMarkPerWrong),
    totalMarks,
    gradingMethod: quiz.gradingMethod,
    resultsNotified: quiz.resultsNotified,
    totalEnrolled: enrollments.length,
    totalAttempts: totalSubmittedAttempts,
    attemptedCount,
    averageScore,
    highestScore,
    lowestScore,
    distribution,
    questionStats,
    students,
  };
}

/**
 * Loads an individual student attempt for teacher review.
 */
export async function getTeacherAttemptDetail(
  attemptId: string,
  offeringId: string,
  callerId: string,
  callerRole: Role
): Promise<TeacherAttemptDetailView> {
  if (callerRole !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(callerId, offeringId, { allowTA: true });
  }

  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    include: {
      student: {
        include: {
          studentProfile: { select: { studentId: true } },
          enrollments: {
            where: { section: { offeringId } },
            include: { section: { select: { name: true } } },
          },
        },
      },
      quiz: {
        include: {
          offering: {
            include: { course: { select: { code: true } } },
          },
          questions: {
            orderBy: { order: "asc" },
            include: {
              topic: { select: { name: true } },
              options: { orderBy: { order: "asc" } },
            },
          },
        },
      },
      answers: true,
    },
  });

  if (!attempt || attempt.quiz.offeringId !== offeringId) {
    throw new NotFoundError("Quiz attempt not found.");
  }

  const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));
  const durationMs = attempt.submittedAt
    ? attempt.submittedAt.getTime() - attempt.startedAt.getTime()
    : 0;
  const durationTakenMinutes = Math.max(1, Math.round(durationMs / (60 * 1000)));

  // Score stats using scoreAttempt
  const questionsForScoring = attempt.quiz.questions.map((q) => ({
    id: q.id,
    type: q.type,
    marks: Number(q.marks),
    options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
  }));
  const answersForScoring = attempt.answers.map((a) => ({
    questionId: a.questionId,
    selectedOptionIds: a.selectedOptionIds,
  }));

  const scoreResult = scoreAttempt(
    questionsForScoring,
    answersForScoring,
    Number(attempt.quiz.negativeMarkPerWrong)
  );

  const detailMap = new Map(scoreResult.details.map((d) => [d.questionId, d]));

  const questions = attempt.quiz.questions.map((q) => {
    const detail = detailMap.get(q.id);
    const ans = answerMap.get(q.id);

    return {
      id: q.id,
      text: q.text,
      type: q.type,
      marks: Number(q.marks),
      topicName: q.topic?.name || null,
      difficulty: q.difficulty,
      isCorrect: detail?.isCorrect || false,
      marksAwarded: detail?.marksAwarded || 0,
      selectedOptionIds: ans?.selectedOptionIds || [],
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
      })),
    };
  });

  return {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    quizTitle: attempt.quiz.title,
    courseCode: attempt.quiz.offering.course.code,
    offeringId: attempt.quiz.offeringId,
    student: {
      id: attempt.student.id,
      name: attempt.student.name,
      email: attempt.student.email,
      roll: attempt.student.studentProfile?.studentId || null,
      section: attempt.student.enrollments[0]?.section?.name || "General",
    },
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    durationTakenMinutes,
    score: Number(attempt.score) || 0,
    maxPossibleMarks: scoreResult.maxPossibleMarks,
    correctCount: scoreResult.correctCount,
    incorrectCount: scoreResult.incorrectCount,
    unansweredCount: scoreResult.unansweredCount,
    penaltyDeducted: scoreResult.penaltyDeducted,
    questions,
  };
}

/**
 * Updates the configured grading method (BEST, LATEST, AVERAGE) for a quiz.
 */
export async function updateQuizGradingMethod(
  quizId: string,
  offeringId: string,
  gradingMethod: QuizGradingMethod,
  callerId: string,
  callerRole: Role
) {
  if (callerRole !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(callerId, offeringId, { allowTA: false });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
  });

  if (!quiz || quiz.offeringId !== offeringId) {
    throw new NotFoundError("Quiz not found.");
  }

  return prisma.quiz.update({
    where: { id: quizId },
    data: { gradingMethod },
  });
}

/**
 * Dispatches RESULT notifications to enrolled students when a quiz closes.
 */
export async function notifyQuizResults(
  quizId: string,
  offeringId: string,
  callerId: string,
  callerRole: Role
) {
  if (callerRole !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(callerId, offeringId, { allowTA: true });
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      offering: {
        include: {
          course: { select: { code: true } },
          sections: {
            include: {
              enrollments: {
                where: { status: "ACTIVE" },
                select: { studentId: true },
              },
            },
          },
        },
      },
    },
  });

  if (!quiz || quiz.offeringId !== offeringId) {
    throw new NotFoundError("Quiz not found.");
  }

  const recipientUserIds = Array.from(
    new Set(
      quiz.offering.sections.flatMap((s) => s.enrollments.map((e) => e.studentId))
    )
  );

  if (recipientUserIds.length > 0) {
    await notifyQuizResultsAvailable({
      quizId: quiz.id,
      offeringId,
      courseCode: quiz.offering.course.code,
      quizTitle: quiz.title,
      recipientUserIds,
    });
  }

  await prisma.quiz.update({
    where: { id: quizId },
    data: { resultsNotified: true },
  });

  return { success: true, count: recipientUserIds.length };
}

/**
 * Generates formula-injection safe CSV content for teacher quiz results.
 */
export function generateQuizResultsCsv(data: TeacherQuizResultsData): string {
  const headers = [
    "Roll / ID",
    "Student Name",
    "Email",
    "Section",
    "Attempts Used",
    `Score (${data.gradingMethod})`,
    "Max Possible Marks",
    "Percentage (%)",
    "Time Taken (mins)",
    "Status",
  ];

  const lines = [headers.map(sanitizeCsvCell).join(",")];

  for (const s of data.students) {
    const row = [
      sanitizeCsvCell(s.roll || "N/A"),
      sanitizeCsvCell(s.name),
      sanitizeCsvCell(s.email),
      sanitizeCsvCell(s.sectionName),
      sanitizeCsvCell(s.attemptsUsed),
      sanitizeCsvCell(s.score !== null ? s.score : "-"),
      sanitizeCsvCell(data.totalMarks),
      sanitizeCsvCell(s.percentage !== null ? `${s.percentage}%` : "-"),
      sanitizeCsvCell(s.durationTakenMinutes !== null ? s.durationTakenMinutes : "-"),
      sanitizeCsvCell(s.score !== null ? "Evaluated" : "Not Attempted"),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\r\n");
}
