/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { CourseOfferingStatus, QuestionType } from "@prisma/client";
import {
  startOrResumeAttempt,
  saveAttemptAnswer,
  submitAttempt,
  getQuizAttemptSession,
  getAttemptResult,
  getStudentQuizzesList,
  getStudentQuizInfo,
} from "@/services/quiz-attempts";
import { createQuiz } from "@/services/quizzes";
import { ValidationError, ForbiddenError } from "@/lib/auth/errors";

describe("Step 27: Quiz Attempts and Assessment Engine", () => {
  let teacherUser: any;
  let studentUserEnrolled: any;
  let studentUserUnenrolled: any;
  let testOffering: any;
  let createdQuizIds: string[] = [];

  beforeEach(async () => {
    // 1. Fetch teacher
    teacherUser = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    // 2. Fetch enrolled student
    studentUserEnrolled = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    // 3. Fetch unenrolled student or teacher acting as non-enrolled
    studentUserUnenrolled = await prisma.user.findFirstOrThrow({
      where: { email: "bkarim@cse.ruet.ac.bd" },
    });

    // 4. Offering with active enrollment
    testOffering = await prisma.courseOffering.findFirstOrThrow({
      where: {
        status: CourseOfferingStatus.PUBLISHED,
        offeringTeachers: { some: { userId: teacherUser.id } },
        sections: {
          some: {
            enrollments: { some: { studentId: studentUserEnrolled.id, status: "ACTIVE" } },
          },
        },
      },
      include: { course: true },
    });
  });

  afterEach(async () => {
    // Clean up created quizzes and their attempts
    for (const qid of createdQuizIds) {
      await prisma.answer.deleteMany({
        where: { attempt: { quizId: qid } },
      });
      await prisma.quizAttempt.deleteMany({
        where: { quizId: qid },
      });
      await prisma.option.deleteMany({
        where: { question: { quizId: qid } },
      });
      await prisma.question.deleteMany({
        where: { quizId: qid },
      });
      await prisma.quiz.deleteMany({
        where: { id: qid },
      });
    }
    createdQuizIds = [];
  });

  // Helper to create a published quiz
  async function createTestQuiz(overrides: Partial<any> = {}) {
    const now = Date.now();
    const quiz = await createQuiz(
      testOffering.id,
      teacherUser.id,
      teacherUser.role,
      {
        title: overrides.title || "Unit Test Quiz",
        description: "Test description",
        durationMin: overrides.durationMin ?? 15,
        startAt: overrides.startAt || new Date(now - 10 * 60 * 1000), // opened 10 mins ago
        endAt: overrides.endAt || new Date(now + 60 * 60 * 1000), // closes in 1 hour
        maxAttempts: overrides.maxAttempts ?? 1,
        negativeMarkPerWrong: overrides.negativeMarkPerWrong ?? 0.25,
        shuffleQuestions: overrides.shuffleQuestions ?? true,
        shuffleOptions: overrides.shuffleOptions ?? true,
        showAnswersAfterClose: overrides.showAnswersAfterClose ?? true,
        published: true,
        questions: overrides.questions || [
          {
            text: "What is 2 + 2?",
            type: QuestionType.SINGLE,
            marks: 2,
            options: [
              { text: "3", isCorrect: false },
              { text: "4", isCorrect: true },
              { text: "5", isCorrect: false },
            ],
          },
          {
            text: "Select even numbers",
            type: QuestionType.MULTIPLE,
            marks: 3,
            options: [
              { text: "2", isCorrect: true },
              { text: "3", isCorrect: false },
              { text: "4", isCorrect: true },
            ],
          },
        ],
      }
    );

    createdQuizIds.push(quiz.id);
    return quiz;
  }

  it("verifies enrollment before allowing student to start attempt", async () => {
    const quiz = await createTestQuiz();

    await expect(
      startOrResumeAttempt(quiz.id, testOffering.id, studentUserUnenrolled.id)
    ).rejects.toThrow(ForbiddenError);
  });

  it("ACCEPTANCE: Cannot start an attempt outside the window (before startAt or after endAt)", async () => {
    const now = Date.now();

    // 1. Future quiz
    const futureQuiz = await createTestQuiz({
      title: "Future Quiz",
      startAt: new Date(now + 10 * 60 * 1000),
      endAt: new Date(now + 30 * 60 * 1000),
    });

    await expect(
      startOrResumeAttempt(futureQuiz.id, testOffering.id, studentUserEnrolled.id)
    ).rejects.toThrow(ValidationError);

    // 2. Expired quiz
    const pastQuiz = await createTestQuiz({
      title: "Past Quiz",
      startAt: new Date(now - 30 * 60 * 1000),
      endAt: new Date(now - 5 * 60 * 1000),
    });

    await expect(
      startOrResumeAttempt(pastQuiz.id, testOffering.id, studentUserEnrolled.id)
    ).rejects.toThrow(ValidationError);
  });

  it("ACCEPTANCE: Cannot start an attempt beyond max attempts", async () => {
    const quiz = await createTestQuiz({ maxAttempts: 1 });

    // First attempt: start and submit
    const session1 = await startOrResumeAttempt(
      quiz.id,
      testOffering.id,
      studentUserEnrolled.id
    );
    expect(session1.attemptId).toBeDefined();

    // Submit attempt 1
    await submitAttempt(session1.attemptId, studentUserEnrolled.id);

    // Attempting to start attempt 2 should fail
    await expect(
      startOrResumeAttempt(quiz.id, testOffering.id, studentUserEnrolled.id)
    ).rejects.toThrow(/used all 1 allowed attempts/i);
  });

  it("resumes an unfinished attempt if one exists and logs QUIZ_STARTED", async () => {
    const quiz = await createTestQuiz({ maxAttempts: 2 });

    const session1 = await startOrResumeAttempt(
      quiz.id,
      testOffering.id,
      studentUserEnrolled.id
    );

    // Verify ActivityEvent: QUIZ_STARTED was logged
    const event = await prisma.activityEvent.findFirst({
      where: {
        userId: studentUserEnrolled.id,
        offeringId: testOffering.id,
        type: "QUIZ_STARTED",
      },
    });
    expect(event).not.toBeNull();

    // Starting again should return the exact same attemptId
    const session2 = await startOrResumeAttempt(
      quiz.id,
      testOffering.id,
      studentUserEnrolled.id
    );
    expect(session2.attemptId).toBe(session1.attemptId);
  });

  it("ACCEPTANCE: Network response for the quiz never contains isCorrect", async () => {
    const quiz = await createTestQuiz();

    const session = await startOrResumeAttempt(
      quiz.id,
      testOffering.id,
      studentUserEnrolled.id
    );

    expect(session.questions.length).toBeGreaterThan(0);
    for (const question of session.questions) {
      expect((question as any).isCorrect).toBeUndefined();
      for (const option of question.options) {
        expect((option as any).isCorrect).toBeUndefined();
      }
    }

    // Also check getQuizAttemptSession directly
    const sessionFromId = await getQuizAttemptSession(
      session.attemptId,
      studentUserEnrolled.id
    );
    for (const question of sessionFromId.questions) {
      expect((question as any).isCorrect).toBeUndefined();
      for (const option of question.options) {
        expect((option as any).isCorrect).toBeUndefined();
      }
    }
  });

  it("ACCEPTANCE: Opening dev tools and changing timer does not extend time; answers saved after server deadline are ignored", async () => {
    // Create a quiz with a very short window/duration
    const quiz = await createTestQuiz({
      durationMin: 1, // 1 minute
      startAt: new Date(Date.now() - 5 * 60 * 1000), // started 5 minutes ago
      endAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const session = await startOrResumeAttempt(
      quiz.id,
      testOffering.id,
      studentUserEnrolled.id
    );

    const question1 = session.questions[0];
    const option1 = question1.options[0];

    // 1. Manually update attempt startedAt to 10 minutes ago in the DB
    // (simulating that time has expired according to server now)
    await prisma.quizAttempt.update({
      where: { id: session.attemptId },
      data: {
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    // 2. Even if the client devtools claimed remaining time was 9999 seconds,
    // saving an answer now MUST be rejected by the server!
    const saveResult = await saveAttemptAnswer(
      session.attemptId,
      question1.id,
      [option1.id],
      studentUserEnrolled.id
    );

    expect(saveResult.saved).toBe(false);
    expect(saveResult.message).toMatch(/expired/i);

    // Verify answer was not saved in DB
    const savedAns = await prisma.answer.findUnique({
      where: {
        attemptId_questionId: {
          attemptId: session.attemptId,
          questionId: question1.id,
        },
      },
    });
    expect(savedAns).toBeNull();
  });

  it("saves answers before deadline and grades attempt in transaction on submit", async () => {
    const quiz = await createTestQuiz({
      durationMin: 30,
      negativeMarkPerWrong: 0.5,
    });

    const session = await startOrResumeAttempt(
      quiz.id,
      testOffering.id,
      studentUserEnrolled.id
    );

    // Find questions
    const fullQuiz = await prisma.quiz.findUniqueOrThrow({
      where: { id: quiz.id },
      include: {
        questions: {
          include: { options: true },
        },
      },
    });

    const singleQ = fullQuiz.questions.find((q) => q.type === QuestionType.SINGLE)!;
    const correctSingleOpt = singleQ.options.find((o) => o.isCorrect)!;

    const multQ = fullQuiz.questions.find((q) => q.type === QuestionType.MULTIPLE)!;
    const correctMultOpts = multQ.options.filter((o) => o.isCorrect).map((o) => o.id);

    // Save answer 1: correct
    const save1 = await saveAttemptAnswer(
      session.attemptId,
      singleQ.id,
      [correctSingleOpt.id],
      studentUserEnrolled.id
    );
    expect(save1.saved).toBe(true);

    // Save answer 2: correct
    const save2 = await saveAttemptAnswer(
      session.attemptId,
      multQ.id,
      correctMultOpts,
      studentUserEnrolled.id
    );
    expect(save2.saved).toBe(true);

    // Submit attempt
    const submitRes = await submitAttempt(session.attemptId, studentUserEnrolled.id);
    expect(submitRes.success).toBe(true);
    expect(submitRes.score).toBe(5); // 2 + 3

    // Verify ActivityEvent: QUIZ_SUBMITTED was logged
    const submitEvent = await prisma.activityEvent.findFirst({
      where: {
        userId: studentUserEnrolled.id,
        offeringId: testOffering.id,
        type: "QUIZ_SUBMITTED",
      },
    });
    expect(submitEvent).not.toBeNull();
  });

  it("handles result visibility: hides answers while window open, reveals when closed", async () => {
    // 1. Quiz with window currently open
    const openQuiz = await createTestQuiz({
      showAnswersAfterClose: true,
      startAt: new Date(Date.now() - 5 * 60 * 1000),
      endAt: new Date(Date.now() + 60 * 60 * 1000), // open for another hour
    });

    const openSession = await startOrResumeAttempt(
      openQuiz.id,
      testOffering.id,
      studentUserEnrolled.id
    );
    await submitAttempt(openSession.attemptId, studentUserEnrolled.id);

    // Result should NOT reveal answers yet
    const resultWhileOpen = await getAttemptResult(
      openSession.attemptId,
      studentUserEnrolled.id
    );
    expect(resultWhileOpen.canViewAnswers).toBe(false);
    expect(resultWhileOpen.reviewQuestions).toBeUndefined();

    // 2. Now simulate quiz closing in past
    await prisma.quiz.update({
      where: { id: openQuiz.id },
      data: {
        endAt: new Date(Date.now() - 1000),
      },
    });

    const resultAfterClose = await getAttemptResult(
      openSession.attemptId,
      studentUserEnrolled.id
    );
    expect(resultAfterClose.canViewAnswers).toBe(true);
    expect(resultAfterClose.reviewQuestions).toBeDefined();
    expect(resultAfterClose.reviewQuestions?.length).toBeGreaterThan(0);
    expect(resultAfterClose.reviewQuestions![0].options[0].isCorrect).toBeDefined();
  });

  it("categorizes student quizzes properly in getStudentQuizzesList", async () => {
    const list = await getStudentQuizzesList(testOffering.id, studentUserEnrolled.id);
    expect(list).toHaveProperty("open");
    expect(list).toHaveProperty("upcoming");
    expect(list).toHaveProperty("attempted");
    expect(list).toHaveProperty("closed");
    expect(list).toHaveProperty("all");
  });

  it("provides complete info and rules in getStudentQuizInfo", async () => {
    const quiz = await createTestQuiz();
    const info = await getStudentQuizInfo(quiz.id, testOffering.id, studentUserEnrolled.id);
    expect(info.id).toBe(quiz.id);
    expect(info.courseCode).toBeDefined();
    expect(info.maxAttempts).toBe(1);
    expect(info.canStartNewAttempt).toBe(true);
  });
});
