import { prisma } from "@/lib/prisma";
import {
  Role,
  QuestionType,
  QuestionDifficulty,
  Prisma,
} from "@prisma/client";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/auth/errors";
import {
  assertOfferingTeacher,
  assertOfferingWritable,
} from "@/lib/auth/guards";
import { notifyQuizPublished } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Types & Enums
// ---------------------------------------------------------------------------

export type QuizStatus = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED";

export function computeQuizStatus(
  published: boolean,
  startAt: Date,
  endAt: Date,
  now: Date = new Date()
): QuizStatus {
  if (!published) return "DRAFT";
  if (now < startAt) return "SCHEDULED";
  if (now > endAt) return "CLOSED";
  return "OPEN";
}

export interface QuizOptionInput {
  id?: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface QuizQuestionInput {
  id?: string;
  text: string;
  type: QuestionType;
  marks: number;
  topicId?: string | null;
  newTopicName?: string | null;
  difficulty?: QuestionDifficulty | null;
  order: number;
  options: QuizOptionInput[];
}

export interface CreateQuizInput {
  title: string;
  description?: string | null;
  durationMin: number;
  startAt: Date;
  endAt: Date;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  negativeMarkPerWrong?: number;
  showAnswersAfterClose?: boolean;
  published?: boolean;
  questions?: QuizQuestionInput[];
}

export interface UpdateQuizInput {
  title?: string;
  description?: string | null;
  durationMin?: number;
  startAt?: Date;
  endAt?: Date;
  maxAttempts?: number;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  negativeMarkPerWrong?: number;
  showAnswersAfterClose?: boolean;
  published?: boolean;
  questions?: QuizQuestionInput[];
}

export interface QuizListItem {
  id: string;
  offeringId: string;
  title: string;
  description: string | null;
  durationMin: number;
  startAt: Date;
  endAt: Date;
  status: QuizStatus;
  published: boolean;
  maxAttempts: number;
  questionsCount: number;
  totalMarks: number;
  attemptsCount: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarkPerWrong: number;
  showAnswersAfterClose: boolean;
  createdAt: Date;
}

export interface QuizDetail {
  id: string;
  offeringId: string;
  title: string;
  description: string | null;
  durationMin: number;
  startAt: Date;
  endAt: Date;
  status: QuizStatus;
  published: boolean;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarkPerWrong: number;
  showAnswersAfterClose: boolean;
  questionsCount: number;
  totalMarks: number;
  attemptsCount: number;
  hasAttempts: boolean;
  createdAt: Date;
  updatedAt: Date;
  questions: {
    id: string;
    text: string;
    type: QuestionType;
    marks: number;
    topicId: string | null;
    topicName: string | null;
    difficulty: QuestionDifficulty | null;
    order: number;
    options: {
      id: string;
      text: string;
      isCorrect: boolean;
      order: number;
    }[];
  }[];
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

export function validateQuestion(q: QuizQuestionInput, index: number) {
  if (!q.text || q.text.trim().length === 0) {
    throw new ValidationError(`Question #${index + 1}: Question text cannot be empty.`);
  }

  if (typeof q.marks !== "number" || q.marks <= 0 || isNaN(q.marks)) {
    throw new ValidationError(`Question #${index + 1}: Marks must be a positive number greater than 0.`);
  }

  if (!q.options || q.options.length === 0) {
    throw new ValidationError(`Question #${index + 1}: Question must have options.`);
  }

  // Check each option text
  for (let i = 0; i < q.options.length; i++) {
    const opt = q.options[i];
    if (!opt.text || opt.text.trim().length === 0) {
      throw new ValidationError(
        `Question #${index + 1}, Option #${i + 1}: Option text cannot be empty.`
      );
    }
  }

  const correctCount = q.options.filter((o) => o.isCorrect).length;

  if (correctCount === 0) {
    throw new ValidationError(
      `Question #${index + 1}: At least one option must be marked as correct.`
    );
  }

  if (q.type === QuestionType.SINGLE) {
    if (q.options.length < 2 || q.options.length > 6) {
      throw new ValidationError(
        `Question #${index + 1} (Single Choice): Must have between 2 and 6 options (received ${q.options.length}).`
      );
    }
    if (correctCount !== 1) {
      throw new ValidationError(
        `Question #${index + 1} (Single Choice): Must have exactly one correct option (found ${correctCount}).`
      );
    }
  } else if (q.type === QuestionType.MULTIPLE) {
    if (q.options.length < 2 || q.options.length > 6) {
      throw new ValidationError(
        `Question #${index + 1} (Multiple Choice): Must have between 2 and 6 options (received ${q.options.length}).`
      );
    }
    // MULTIPLE has at least one correct option, which was already checked above
  } else if (q.type === QuestionType.TRUE_FALSE) {
    if (q.options.length !== 2) {
      throw new ValidationError(
        `Question #${index + 1} (True/False): Must have exactly 2 options (True and False).`
      );
    }
    if (correctCount !== 1) {
      throw new ValidationError(
        `Question #${index + 1} (True/False): Must have exactly one correct option.`
      );
    }
  }
}

export function validateQuizSettings(params: {
  title: string;
  durationMin: number;
  startAt: Date;
  endAt: Date;
  negativeMarkPerWrong?: number;
  maxAttempts?: number;
  published?: boolean;
  questionsCount?: number;
}) {
  if (!params.title || params.title.trim().length === 0) {
    throw new ValidationError("Quiz title is required.");
  }

  if (params.title.trim().length > 200) {
    throw new ValidationError("Quiz title cannot exceed 200 characters.");
  }

  if (
    typeof params.durationMin !== "number" ||
    params.durationMin <= 0 ||
    isNaN(params.durationMin)
  ) {
    throw new ValidationError("Duration must be a positive integer in minutes.");
  }

  if (isNaN(params.startAt.getTime()) || isNaN(params.endAt.getTime())) {
    throw new ValidationError("Start and end times must be valid dates.");
  }

  if (params.endAt <= params.startAt) {
    throw new ValidationError("Quiz end time must be strictly after the start time.");
  }

  const windowMinutes = (params.endAt.getTime() - params.startAt.getTime()) / (60 * 1000);
  if (windowMinutes < params.durationMin) {
    throw new ValidationError(
      `Quiz availability window (${Math.round(windowMinutes)} min) cannot be shorter than the quiz duration (${params.durationMin} min).`
    );
  }

  if (
    params.negativeMarkPerWrong !== undefined &&
    params.negativeMarkPerWrong !== null &&
    (params.negativeMarkPerWrong < 0 || isNaN(params.negativeMarkPerWrong))
  ) {
    throw new ValidationError("Negative marking penalty cannot be negative.");
  }

  if (
    params.maxAttempts !== undefined &&
    params.maxAttempts !== null &&
    (params.maxAttempts < 1 || isNaN(params.maxAttempts))
  ) {
    throw new ValidationError("Maximum attempts must be at least 1.");
  }

  if (params.published) {
    if (params.questionsCount !== undefined && params.questionsCount === 0) {
      throw new ValidationError("Cannot publish a quiz with zero questions.");
    }
  }
}

// ---------------------------------------------------------------------------
// Service Functions: Teacher
// ---------------------------------------------------------------------------

/**
 * Returns quizzes for an offering with calculated status, attempts count, and marks.
 */
export async function getTeacherQuizzesList(
  offeringId: string,
  userId: string,
  role: Role
): Promise<QuizListItem[]> {
  if (role !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(userId, offeringId);
  }

  const quizzes = await prisma.quiz.findMany({
    where: { offeringId },
    include: {
      _count: {
        select: {
          questions: true,
          attempts: true,
        },
      },
      questions: {
        select: { marks: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();

  return quizzes.map((q) => {
    const totalMarks = q.questions.reduce((sum, qu) => sum + Number(qu.marks), 0);
    const status = computeQuizStatus(q.published, q.startAt, q.endAt, now);

    return {
      id: q.id,
      offeringId: q.offeringId,
      title: q.title,
      description: q.description,
      durationMin: q.durationMin,
      startAt: q.startAt,
      endAt: q.endAt,
      status,
      published: q.published,
      maxAttempts: q.maxAttempts,
      questionsCount: q._count.questions,
      totalMarks,
      attemptsCount: q._count.attempts,
      shuffleQuestions: q.shuffleQuestions,
      shuffleOptions: q.shuffleOptions,
      negativeMarkPerWrong: Number(q.negativeMarkPerWrong),
      showAnswersAfterClose: q.showAnswersAfterClose,
      createdAt: q.createdAt,
    };
  });
}

/**
 * Returns full quiz details with questions and options for teacher editing.
 */
export async function getTeacherQuizDetail(
  quizId: string,
  offeringId: string,
  userId: string,
  role: Role
): Promise<QuizDetail> {
  if (role !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(userId, offeringId);
  }

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      _count: {
        select: { attempts: true, questions: true },
      },
      questions: {
        orderBy: { order: "asc" },
        include: {
          topic: { select: { id: true, name: true } },
          options: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!quiz || quiz.offeringId !== offeringId) {
    throw new NotFoundError("Quiz not found in this course offering.");
  }

  const now = new Date();
  const totalMarks = quiz.questions.reduce((sum, qu) => sum + Number(qu.marks), 0);
  const status = computeQuizStatus(quiz.published, quiz.startAt, quiz.endAt, now);

  return {
    id: quiz.id,
    offeringId: quiz.offeringId,
    title: quiz.title,
    description: quiz.description,
    durationMin: quiz.durationMin,
    startAt: quiz.startAt,
    endAt: quiz.endAt,
    status,
    published: quiz.published,
    maxAttempts: quiz.maxAttempts,
    shuffleQuestions: quiz.shuffleQuestions,
    shuffleOptions: quiz.shuffleOptions,
    negativeMarkPerWrong: Number(quiz.negativeMarkPerWrong),
    showAnswersAfterClose: quiz.showAnswersAfterClose,
    questionsCount: quiz._count.questions,
    totalMarks,
    attemptsCount: quiz._count.attempts,
    hasAttempts: quiz._count.attempts > 0,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    questions: quiz.questions.map((qu) => ({
      id: qu.id,
      text: qu.text,
      type: qu.type,
      marks: Number(qu.marks),
      topicId: qu.topicId,
      topicName: qu.topic?.name || null,
      difficulty: qu.difficulty,
      order: qu.order,
      options: qu.options.map((opt) => ({
        id: opt.id,
        text: opt.text,
        isCorrect: opt.isCorrect,
        order: opt.order,
      })),
    })),
  };
}

/**
 * Creates a new quiz with optional questions.
 */
export async function createQuiz(
  offeringId: string,
  userId: string,
  role: Role,
  input: CreateQuizInput,
  clientIp?: string | null
): Promise<QuizDetail> {
  // 1. Guard offering write access (rejects ARCHIVED offerings)
  const offering = await assertOfferingWritable(offeringId);

  // 2. Teacher assignment guard
  if (role !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(userId, offeringId);
  }

  const questions = input.questions || [];

  // 3. Validate quiz settings
  validateQuizSettings({
    title: input.title,
    durationMin: input.durationMin,
    startAt: input.startAt,
    endAt: input.endAt,
    negativeMarkPerWrong: input.negativeMarkPerWrong,
    maxAttempts: input.maxAttempts,
    published: input.published,
    questionsCount: questions.length,
  });

  // 4. Validate questions
  for (let i = 0; i < questions.length; i++) {
    validateQuestion(questions[i], i);
  }

  // 5. Database transaction to create quiz, questions, and options
  const createdQuiz = await prisma.$transaction(async (tx) => {
    const quiz = await tx.quiz.create({
      data: {
        offeringId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        durationMin: input.durationMin,
        startAt: input.startAt,
        endAt: input.endAt,
        maxAttempts: input.maxAttempts || 1,
        shuffleQuestions: input.shuffleQuestions || false,
        shuffleOptions: input.shuffleOptions || false,
        negativeMarkPerWrong: new Prisma.Decimal(input.negativeMarkPerWrong || 0),
        showAnswersAfterClose: input.showAnswersAfterClose || false,
        published: input.published || false,
        createdById: userId,
      },
    });

    // Create questions and options sequentially
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      // Handle inline topic creation if requested
      let topicId = q.topicId || null;
      if (q.newTopicName && q.newTopicName.trim().length > 0) {
        const topic = await tx.topic.upsert({
          where: {
            offeringId_name: {
              offeringId,
              name: q.newTopicName.trim(),
            },
          },
          update: {},
          create: {
            offeringId,
            name: q.newTopicName.trim(),
          },
        });
        topicId = topic.id;
      }

      const questionRecord = await tx.question.create({
        data: {
          quizId: quiz.id,
          text: q.text.trim(),
          type: q.type,
          marks: new Prisma.Decimal(q.marks),
          topicId,
          difficulty: q.difficulty || null,
          order: q.order ?? i,
        },
      });

      // Insert options
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        await tx.option.create({
          data: {
            questionId: questionRecord.id,
            text: opt.text.trim(),
            isCorrect: opt.isCorrect,
            order: opt.order ?? j,
          },
        });
      }
    }

    // Write AuditLog: QUIZ_CREATED
    await tx.auditLog.create({
      data: {
        userId,
        action: "QUIZ_CREATED",
        objectType: "Quiz",
        objectId: quiz.id,
        description: `Created quiz '${quiz.title}' (${quiz.durationMin} mins, ${questions.length} questions) for offering ${offering.course.code}.`,
        ip: clientIp || null,
      },
    });

    if (quiz.published) {
      await tx.auditLog.create({
        data: {
          userId,
          action: "QUIZ_PUBLISHED",
          objectType: "Quiz",
          objectId: quiz.id,
          description: `Published quiz '${quiz.title}' for offering ${offering.course.code}.`,
          ip: clientIp || null,
        },
      });
    }

    return quiz;
  });

  // 6. Notify enrolled students if published
  if (createdQuiz.published) {
    try {
      const enrollments = await prisma.enrollment.findMany({
        where: {
          section: { offeringId },
          status: "ACTIVE",
        },
        select: { studentId: true },
      });

      if (enrollments.length > 0) {
        await notifyQuizPublished({
          quizId: createdQuiz.id,
          offeringId,
          courseCode: offering.course.code,
          quizTitle: createdQuiz.title,
          startAt: createdQuiz.startAt,
          endAt: createdQuiz.endAt,
          durationMin: createdQuiz.durationMin,
          recipientUserIds: enrollments.map((e) => e.studentId),
        });
      }
    } catch (err) {
      console.error("[Quizzes] Non-blocking notification dispatch failed:", err);
    }
  }

  return getTeacherQuizDetail(createdQuiz.id, offeringId, userId, role);
}

/**
 * Updates a quiz and its questions.
 * Enforces attempt lock rules: if attempts exist, questions cannot be modified.
 */
export async function updateQuiz(
  quizId: string,
  offeringId: string,
  userId: string,
  role: Role,
  input: UpdateQuizInput,
  clientIp?: string | null
): Promise<QuizDetail> {
  // 1. Guard offering write access (rejects ARCHIVED offerings)
  const offering = await assertOfferingWritable(offeringId);

  // 2. Teacher assignment guard
  if (role !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(userId, offeringId);
  }

  const existing = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      _count: {
        select: { attempts: true, questions: true },
      },
    },
  });

  if (!existing || existing.offeringId !== offeringId) {
    throw new NotFoundError("Quiz not found in this course offering.");
  }

  const hasAttempts = existing._count.attempts > 0;

  // 3. Attempt lock rule:
  // "Cannot edit questions once any attempt exists (show a warning and allow only title/window changes)."
  if (hasAttempts && input.questions !== undefined) {
    throw new ValidationError(
      "Questions cannot be modified because students have already attempted this quiz. Only title and availability window can be updated."
    );
  }

  const newStartAt = input.startAt || existing.startAt;
  const newEndAt = input.endAt || existing.endAt;
  const newDuration = input.durationMin ?? existing.durationMin;
  const newTitle = input.title ? input.title.trim() : existing.title;
  const targetPublished = input.published !== undefined ? input.published : existing.published;
  const questionsCount =
    input.questions !== undefined ? input.questions.length : existing._count.questions;

  // 4. Validate settings
  validateQuizSettings({
    title: newTitle,
    durationMin: newDuration,
    startAt: newStartAt,
    endAt: newEndAt,
    negativeMarkPerWrong: input.negativeMarkPerWrong ?? Number(existing.negativeMarkPerWrong),
    maxAttempts: input.maxAttempts ?? existing.maxAttempts,
    published: targetPublished,
    questionsCount,
  });

  // 5. If questions provided, validate them
  if (input.questions) {
    for (let i = 0; i < input.questions.length; i++) {
      validateQuestion(input.questions[i], i);
    }
  }

  const isPublishTransition = !existing.published && targetPublished;

  // 6. Database transaction
  await prisma.$transaction(async (tx) => {
    // Update quiz metadata
    await tx.quiz.update({
      where: { id: quizId },
      data: {
        title: newTitle,
        description: input.description !== undefined ? input.description?.trim() || null : undefined,
        durationMin: newDuration,
        startAt: newStartAt,
        endAt: newEndAt,
        maxAttempts: input.maxAttempts !== undefined ? input.maxAttempts : undefined,
        shuffleQuestions: input.shuffleQuestions !== undefined ? input.shuffleQuestions : undefined,
        shuffleOptions: input.shuffleOptions !== undefined ? input.shuffleOptions : undefined,
        negativeMarkPerWrong:
          input.negativeMarkPerWrong !== undefined
            ? new Prisma.Decimal(input.negativeMarkPerWrong)
            : undefined,
        showAnswersAfterClose:
          input.showAnswersAfterClose !== undefined ? input.showAnswersAfterClose : undefined,
        published: targetPublished,
      },
    });

    // If questions are provided and no attempts exist, replace/sync questions
    if (!hasAttempts && input.questions !== undefined) {
      // Delete existing questions (which cascades options)
      await tx.option.deleteMany({
        where: { question: { quizId } },
      });
      await tx.question.deleteMany({
        where: { quizId },
      });

      // Insert new questions
      for (let i = 0; i < input.questions.length; i++) {
        const q = input.questions[i];

        let topicId = q.topicId || null;
        if (q.newTopicName && q.newTopicName.trim().length > 0) {
          const topic = await tx.topic.upsert({
            where: {
              offeringId_name: {
                offeringId,
                name: q.newTopicName.trim(),
              },
            },
            update: {},
            create: {
              offeringId,
              name: q.newTopicName.trim(),
            },
          });
          topicId = topic.id;
        }

        const questionRecord = await tx.question.create({
          data: {
            quizId,
            text: q.text.trim(),
            type: q.type,
            marks: new Prisma.Decimal(q.marks),
            topicId,
            difficulty: q.difficulty || null,
            order: q.order ?? i,
          },
        });

        for (let j = 0; j < q.options.length; j++) {
          const opt = q.options[j];
          await tx.option.create({
            data: {
              questionId: questionRecord.id,
              text: opt.text.trim(),
              isCorrect: opt.isCorrect,
              order: opt.order ?? j,
            },
          });
        }
      }
    }

    // Write AuditLog
    await tx.auditLog.create({
      data: {
        userId,
        action: "QUIZ_UPDATED",
        objectType: "Quiz",
        objectId: quizId,
        description: `Updated quiz '${newTitle}' for offering ${offering.course.code}.`,
        ip: clientIp || null,
      },
    });

    if (isPublishTransition) {
      await tx.auditLog.create({
        data: {
          userId,
          action: "QUIZ_PUBLISHED",
          objectType: "Quiz",
          objectId: quizId,
          description: `Published quiz '${newTitle}' for offering ${offering.course.code}.`,
          ip: clientIp || null,
        },
      });
    }
  });

  // 7. Notify if transitioned to published
  if (isPublishTransition) {
    try {
      const enrollments = await prisma.enrollment.findMany({
        where: {
          section: { offeringId },
          status: "ACTIVE",
        },
        select: { studentId: true },
      });

      if (enrollments.length > 0) {
        await notifyQuizPublished({
          quizId,
          offeringId,
          courseCode: offering.course.code,
          quizTitle: newTitle,
          startAt: newStartAt,
          endAt: newEndAt,
          durationMin: newDuration,
          recipientUserIds: enrollments.map((e) => e.studentId),
        });
      }
    } catch (err) {
      console.error("[Quizzes] Non-blocking notification dispatch failed:", err);
    }
  }

  return getTeacherQuizDetail(quizId, offeringId, userId, role);
}

/**
 * Deletes a quiz.
 * Blocked if any student attempts exist.
 */
export async function deleteQuiz(
  quizId: string,
  offeringId: string,
  userId: string,
  role: Role,
  clientIp?: string | null
): Promise<void> {
  // 1. Guard offering write access (rejects ARCHIVED offerings)
  const offering = await assertOfferingWritable(offeringId);

  // 2. Teacher assignment guard
  if (role !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(userId, offeringId);
  }

  const existing = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      _count: { select: { attempts: true } },
    },
  });

  if (!existing || existing.offeringId !== offeringId) {
    throw new NotFoundError("Quiz not found in this course offering.");
  }

  if (existing._count.attempts > 0) {
    throw new ValidationError(
      "Cannot delete a quiz with existing student attempts. Unpublish the quiz instead."
    );
  }

  await prisma.$transaction(async (tx) => {
    // Delete options, questions, and quiz
    await tx.option.deleteMany({
      where: { question: { quizId } },
    });
    await tx.question.deleteMany({
      where: { quizId },
    });
    await tx.quiz.delete({
      where: { id: quizId },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "QUIZ_DELETED",
        objectType: "Quiz",
        objectId: quizId,
        description: `Deleted quiz '${existing.title}' from offering ${offering.course.code}.`,
        ip: clientIp || null,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Student Safe View & API Protection
// ---------------------------------------------------------------------------

export interface StudentSafeQuestionView {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  order: number;
  options: {
    id: string;
    text: string;
    order: number;
    // isCorrect is NEVER present unless quiz is closed AND showAnswersAfterClose is true!
    isCorrect?: boolean;
  }[];
}

/**
 * Returns quiz questions for students.
 * CRITICAL ACCEPTANCE REQUIREMENT:
 * "A student can never receive isCorrect flags in any API response for an unfinished quiz."
 */
export async function getStudentQuizQuestions(
  quizId: string,
  offeringId: string,
  studentId: string
): Promise<StudentSafeQuestionView[]> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: {
          options: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!quiz || quiz.offeringId !== offeringId || !quiz.published) {
    throw new NotFoundError("Quiz not found or not published.");
  }

  const now = new Date();
  const isClosed = now > quiz.endAt;
  const canShowAnswers = isClosed && quiz.showAnswersAfterClose;

  return quiz.questions.map((q) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    marks: Number(q.marks),
    order: q.order,
    options: q.options.map((opt) => {
      const baseOpt: { id: string; text: string; order: number; isCorrect?: boolean } = {
        id: opt.id,
        text: opt.text,
        order: opt.order,
      };

      if (canShowAnswers) {
        baseOpt.isCorrect = opt.isCorrect;
      }
      // Note: isCorrect is NOT defined on baseOpt if not closed/not allowed!

      return baseOpt;
    }),
  }));
}
