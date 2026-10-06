/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  Role,
  CourseOfferingStatus,
  QuestionType,
  QuizGradingMethod,
  NotificationType,
} from "@prisma/client";
import {
  startOrResumeAttempt,
  saveAttemptAnswer,
  submitAttempt,
  getAttemptResult,
  getTeacherQuizResults,
  getTeacherAttemptDetail,
  updateQuizGradingMethod,
  notifyQuizResults,
  generateQuizResultsCsv,
} from "@/services/quiz-attempts";
import { createQuiz } from "@/services/quizzes";
import {
  getTeacherGradebookData,
  getStudentGradebookData,
} from "@/services/gradebook";
import { ForbiddenError } from "@/lib/auth/errors";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.1" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 28: Quiz Results for Teachers and Gradebook Integration", () => {
  let teacherUser: any;
  let student1: any;
  let student2: any;
  let studentUnenrolled: any;
  let testOffering: any;
  let createdQuizIds: string[] = [];

  beforeEach(async () => {
    // 1. Fetch teacher
    teacherUser = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    // 2. Fetch enrolled students
    student1 = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    student2 = await prisma.user.findFirstOrThrow({
      where: { email: "2203002@student.ruet.ac.bd" },
    });

    // 3. Fetch unenrolled user
    studentUnenrolled = await prisma.user.findFirstOrThrow({
      where: { email: "bkarim@cse.ruet.ac.bd" },
    });

    // 4. Offering with active enrollment
    testOffering = await prisma.courseOffering.findFirstOrThrow({
      where: {
        status: CourseOfferingStatus.PUBLISHED,
        offeringTeachers: { some: { userId: teacherUser.id } },
        sections: {
          some: {
            enrollments: {
              some: { studentId: student1.id, status: "ACTIVE" },
            },
          },
        },
      },
      include: {
        course: true,
        sections: {
          include: {
            enrollments: true,
          },
        },
      },
    });

    // Ensure student2 is also enrolled in one of the sections of this offering
    const existingEnrollment2 = await prisma.enrollment.findFirst({
      where: {
        studentId: student2.id,
        section: { offeringId: testOffering.id },
      },
    });

    if (!existingEnrollment2) {
      const section = testOffering.sections[0];
      await prisma.enrollment.create({
        data: {
          studentId: student2.id,
          sectionId: section.id,
          status: "ACTIVE",
        },
      });
    }
  });

  afterEach(async () => {
    // Cleanup created quizzes and their attempts
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

  // Helper to create a test quiz
  async function createQuizWithQuestions(overrides: Partial<any> = {}) {
    const now = Date.now();
    const quiz = await createQuiz(
      testOffering.id,
      teacherUser.id,
      teacherUser.role,
      {
        title: overrides.title || "Step 28 Integration Quiz",
        description: "Testing quiz results and gradebook",
        durationMin: overrides.durationMin ?? 15,
        startAt: overrides.startAt || new Date(now - 10 * 60 * 1000), // 10 mins ago
        endAt: overrides.endAt || new Date(now + 60 * 60 * 1000), // 1 hour ahead
        maxAttempts: overrides.maxAttempts ?? 3,
        negativeMarkPerWrong: overrides.negativeMarkPerWrong ?? 0,
        shuffleQuestions: false,
        shuffleOptions: false,
        showAnswersAfterClose: true,
        published: true,
        questions: overrides.questions || [
          {
            text: "Question 1: What is the capital of Bangladesh?",
            type: QuestionType.SINGLE,
            marks: 5,
            options: [
              { text: "Chittagong", isCorrect: false },
              { text: "Dhaka", isCorrect: true },
              { text: "Rajshahi", isCorrect: false },
            ],
          },
          {
            text: "Question 2: Select primes less than 10",
            type: QuestionType.MULTIPLE,
            marks: 5,
            options: [
              { text: "2", isCorrect: true },
              { text: "3", isCorrect: true },
              { text: "4", isCorrect: false },
              { text: "9", isCorrect: false },
            ],
          },
        ],
      }
    );

    createdQuizIds.push(quiz.id);
    return quiz;
  }

  it("1. Calculates per-question statistics matching manual calculations exactly", async () => {
    const quiz = await createQuizWithQuestions();

    const questions = await prisma.question.findMany({
      where: { quizId: quiz.id },
      include: { options: true },
      orderBy: { order: "asc" },
    });
    const q1 = questions[0];
    const q2 = questions[1];

    const q1DhakaOpt = q1.options.find((o) => o.text === "Dhaka")!;
    const q1ChittagongOpt = q1.options.find((o) => o.text === "Chittagong")!;

    const q2Prime2Opt = q2.options.find((o) => o.text === "2")!;
    const q2Prime3Opt = q2.options.find((o) => o.text === "3")!;
    const q2Prime4Opt = q2.options.find((o) => o.text === "4")!;

    // Student 1 attempt: Answers Q1 correctly, Q2 incorrectly (selects 4)
    const att1 = await startOrResumeAttempt(quiz.id, testOffering.id, student1.id);
    await saveAttemptAnswer(att1.attemptId, q1.id, [q1DhakaOpt.id], student1.id);
    await saveAttemptAnswer(att1.attemptId, q2.id, [q2Prime4Opt.id], student1.id);
    await submitAttempt(att1.attemptId, student1.id);

    // Student 2 attempt: Answers Q1 correctly, Q2 correctly (selects 2 and 3)
    const att2 = await startOrResumeAttempt(quiz.id, testOffering.id, student2.id);
    await saveAttemptAnswer(att2.attemptId, q1.id, [q1DhakaOpt.id], student2.id);
    await saveAttemptAnswer(att2.attemptId, q2.id, [q2Prime2Opt.id, q2Prime3Opt.id], student2.id);
    await submitAttempt(att2.attemptId, student2.id);

    // Fetch teacher quiz results
    const results = await getTeacherQuizResults(
      quiz.id,
      testOffering.id,
      teacherUser.id,
      teacherUser.role
    );

    // Verification of summary statistics
    expect(results.totalAttempts).toBe(2);
    expect(results.attemptedCount).toBe(2);
    expect(results.highestScore).toBe(10); // Student 2 got 10/10
    expect(results.lowestScore).toBe(5);   // Student 1 got 5/10
    expect(results.averageScore).toBe(7.5); // (10 + 5) / 2 = 7.5

    // Manual per-question check:
    // Q1: Both student 1 and student 2 answered correctly -> 2/2 = 100%, isHard = false
    const q1Stat = results.questionStats.find((s) => s.id === q1.id);
    expect(q1Stat).toBeDefined();
    expect(q1Stat?.correctCount).toBe(2);
    expect(q1Stat?.correctnessRate).toBe(100);
    expect(q1Stat?.isHard).toBe(false);

    // Q2: Only student 2 answered correctly (1 out of 2) -> 1/2 = 50%, isHard = false (>= 50%)
    const q2Stat = results.questionStats.find((s) => s.id === q2.id);
    expect(q2Stat).toBeDefined();
    expect(q2Stat?.correctCount).toBe(1);
    expect(q2Stat?.correctnessRate).toBe(50);
    expect(q2Stat?.isHard).toBe(false);
  });

  it("identifies hard questions (< 50% correctness) correctly", async () => {
    // Create a 1-question quiz
    const quiz = await createQuizWithQuestions({
      questions: [
        {
          text: "Difficult Question",
          type: QuestionType.SINGLE,
          marks: 4,
          options: [
            { text: "Correct A", isCorrect: true },
            { text: "Wrong B", isCorrect: false },
          ],
        },
      ],
    });

    const questions = await prisma.question.findMany({
      where: { quizId: quiz.id },
      include: { options: true },
    });
    const q = questions[0];
    const correctOpt = q.options.find((o) => o.isCorrect)!;
    const wrongOpt = q.options.find((o) => !o.isCorrect)!;

    // Student 1: answers wrong
    const att1 = await startOrResumeAttempt(quiz.id, testOffering.id, student1.id);
    await saveAttemptAnswer(att1.attemptId, q.id, [wrongOpt.id], student1.id);
    await submitAttempt(att1.attemptId, student1.id);

    // Student 2: answers wrong
    const att2 = await startOrResumeAttempt(quiz.id, testOffering.id, student2.id);
    await saveAttemptAnswer(att2.attemptId, q.id, [wrongOpt.id], student2.id);
    await submitAttempt(att2.attemptId, student2.id);

    const results = await getTeacherQuizResults(
      quiz.id,
      testOffering.id,
      teacherUser.id,
      teacherUser.role
    );

    const qStat = results.questionStats[0];
    expect(qStat.correctCount).toBe(0);
    expect(qStat.correctnessRate).toBe(0);
    expect(qStat.isHard).toBe(true); // < 50% flagged as hard!
  });

  it("2. Strictly prevents students from seeing other students' attempts", async () => {
    const quiz = await createQuizWithQuestions();
    const questions = await prisma.question.findMany({
      where: { quizId: quiz.id },
      include: { options: true },
    });
    const correctOpt = questions[0].options.find((o) => o.isCorrect)!;

    // Student 1 submits an attempt
    const att1 = await startOrResumeAttempt(quiz.id, testOffering.id, student1.id);
    await saveAttemptAnswer(att1.attemptId, questions[0].id, [correctOpt.id], student1.id);
    await submitAttempt(att1.attemptId, student1.id);

    // Student 1 can view their own attempt result
    const ownResult = await getAttemptResult(att1.attemptId, student1.id);
    expect(ownResult.attemptId).toBe(att1.attemptId);

    // Student 2 attempts to view Student 1's attempt result -> MUST BE FORBIDDEN
    await expect(
      getAttemptResult(att1.attemptId, student2.id)
    ).rejects.toThrow(ForbiddenError);

    // Student 1 attempts to call teacher-only getTeacherAttemptDetail -> MUST BE FORBIDDEN
    await expect(
      getTeacherAttemptDetail(
        att1.attemptId,
        testOffering.id,
        student1.id,
        Role.STUDENT
      )
    ).rejects.toThrow(ForbiddenError);

    // Student 1 attempts to call getTeacherQuizResults -> MUST BE FORBIDDEN
    await expect(
      getTeacherQuizResults(
        quiz.id,
        testOffering.id,
        student1.id,
        Role.STUDENT
      )
    ).rejects.toThrow(ForbiddenError);
  });

  it("3. Verifies Gradebook totals include quizzes and match the sum of cells", async () => {
    const quiz = await createQuizWithQuestions();
    const questions = await prisma.question.findMany({
      where: { quizId: quiz.id },
      include: { options: true },
      orderBy: { order: "asc" },
    });
    const q1 = questions[0];
    const q2 = questions[1];

    const q1Correct = q1.options.find((o) => o.isCorrect)!;
    const q2Correct = q2.options.filter((o) => o.isCorrect).map((o) => o.id);

    // Student 1 gets full marks (5 + 5 = 10)
    const att1 = await startOrResumeAttempt(quiz.id, testOffering.id, student1.id);
    await saveAttemptAnswer(att1.attemptId, q1.id, [q1Correct.id], student1.id);
    await saveAttemptAnswer(att1.attemptId, q2.id, q2Correct, student1.id);
    await submitAttempt(att1.attemptId, student1.id);

    // Check teacher gradebook
    const teacherGradebook = await getTeacherGradebookData(testOffering.id, {
      id: teacherUser.id,
      role: teacherUser.role,
    });

    // Verify quiz is present in gradebook assignment columns
    const quizColumn = teacherGradebook.assignments.find((col) => col.id === quiz.id);
    expect(quizColumn).toBeDefined();
    expect(quizColumn?.type).toBe("QUIZ");
    expect(quizColumn?.maxMarks).toBe(10);

    // Verify Student 1's row
    const student1Row = teacherGradebook.students.find((s) => s.studentId === student1.id);
    expect(student1Row).toBeDefined();
    const cell = student1Row?.cells[quiz.id];
    expect(cell).toBeDefined();
    expect(cell?.finalMarks).toBe(10);
    expect(cell?.rawMarks).toBe(10);
    expect(cell?.isMissing).toBe(false);

    // ACCEPTANCE CRITERIA: Gradebook totals include quizzes and match the sum of cells
    let calculatedSumOfCells = 0;
    for (const col of teacherGradebook.assignments) {
      const studentCell = student1Row!.cells[col.id];
      if (studentCell && !studentCell.isMissing) {
        calculatedSumOfCells += studentCell.finalMarks;
      }
    }
    expect(student1Row?.totalFinalMarks).toBe(calculatedSumOfCells);

    // Check student gradebook view
    const studentGradebook = await getStudentGradebookData(testOffering.id, student1.id);
    const studentQuizItem = studentGradebook.assignments.find((a) => a.assignmentId === quiz.id);
    expect(studentQuizItem).toBeDefined();
    expect(studentQuizItem?.type).toBe("QUIZ");
    expect(studentQuizItem?.finalMarks).toBe(10);
    expect(studentQuizItem?.maxMarks).toBe(10);

    // Sum of items matches totalFinalMarks
    let studentSum = 0;
    for (const item of studentGradebook.assignments) {
      if (item.finalMarks !== null) {
        studentSum += item.finalMarks;
      }
    }
    expect(studentGradebook.totalFinalMarks).toBe(studentSum);
  });

  it("4. Supports configurable grading method (BEST, LATEST, AVERAGE) per quiz", async () => {
    const quiz = await createQuizWithQuestions({
      maxAttempts: 3,
    });
    const questions = await prisma.question.findMany({
      where: { quizId: quiz.id },
      include: { options: true },
      orderBy: { order: "asc" },
    });
    const q1 = questions[0];
    const q2 = questions[1];

    const q1Correct = q1.options.find((o) => o.isCorrect)!;
    const q1Wrong = q1.options.find((o) => !o.isCorrect)!;
    const q2Correct = q2.options.filter((o) => o.isCorrect).map((o) => o.id);

    // Attempt 1: Score = 5 (Q1 correct, Q2 unanswered)
    const att1 = await startOrResumeAttempt(quiz.id, testOffering.id, student1.id);
    await saveAttemptAnswer(att1.attemptId, q1.id, [q1Correct.id], student1.id);
    await submitAttempt(att1.attemptId, student1.id);

    // Attempt 2: Score = 10 (Both correct)
    const att2 = await startOrResumeAttempt(quiz.id, testOffering.id, student1.id);
    await saveAttemptAnswer(att2.attemptId, q1.id, [q1Correct.id], student1.id);
    await saveAttemptAnswer(att2.attemptId, q2.id, q2Correct, student1.id);
    await submitAttempt(att2.attemptId, student1.id);

    // Attempt 3: Score = 0 (Q1 wrong, Q2 unanswered)
    const att3 = await startOrResumeAttempt(quiz.id, testOffering.id, student1.id);
    await saveAttemptAnswer(att3.attemptId, q1.id, [q1Wrong.id], student1.id);
    await submitAttempt(att3.attemptId, student1.id);

    // Attempts scores: 5, 10, 0
    // Test 1: BEST -> 10
    await updateQuizGradingMethod(quiz.id, testOffering.id, QuizGradingMethod.BEST, teacherUser.id, teacherUser.role);
    let gradebook = await getTeacherGradebookData(testOffering.id, { id: teacherUser.id, role: teacherUser.role });
    let row = gradebook.students.find((s) => s.studentId === student1.id)!;
    expect(row.cells[quiz.id].finalMarks).toBe(10);

    // Test 2: LATEST -> 0
    await updateQuizGradingMethod(quiz.id, testOffering.id, QuizGradingMethod.LATEST, teacherUser.id, teacherUser.role);
    gradebook = await getTeacherGradebookData(testOffering.id, { id: teacherUser.id, role: teacherUser.role });
    row = gradebook.students.find((s) => s.studentId === student1.id)!;
    expect(row.cells[quiz.id].finalMarks).toBe(0);

    // Test 3: AVERAGE -> (5 + 10 + 0) / 3 = 5
    await updateQuizGradingMethod(quiz.id, testOffering.id, QuizGradingMethod.AVERAGE, teacherUser.id, teacherUser.role);
    gradebook = await getTeacherGradebookData(testOffering.id, { id: teacherUser.id, role: teacherUser.role });
    row = gradebook.students.find((s) => s.studentId === student1.id)!;
    expect(row.cells[quiz.id].finalMarks).toBe(5);
  });

  it("5. Exports CSV with formula injection protection", async () => {
    const quiz = await createQuizWithQuestions();
    const results = await getTeacherQuizResults(
      quiz.id,
      testOffering.id,
      teacherUser.id,
      teacherUser.role
    );

    // Mock student with formula injection attack in name or roll
    results.students.push({
      studentId: "malicious-user-id",
      roll: "=CMD|' /C calc'!A0",
      name: "+Exploit Student",
      email: "@attacker@evil.com",
      sectionName: "Section A",
      attemptsUsed: 1,
      score: 10,
      percentage: 100,
      durationTakenMinutes: 5,
      latestSubmittedAt: new Date(),
      attempts: [],
    });

    const csv = generateQuizResultsCsv(results);

    // Ensure dangerous characters are sanitized (prepended with single quote ')
    expect(csv).toContain("\"'=CMD|' /C calc'!A0\"");
    expect(csv).toContain("\"'+Exploit Student\"");
    expect(csv).toContain("\"'@attacker@evil.com\"");
  });

  it("6. Dispatches RESULT notifications when results are notified", async () => {
    const quiz = await createQuizWithQuestions();

    const notifyRes = await notifyQuizResults(
      quiz.id,
      testOffering.id,
      teacherUser.id,
      teacherUser.role
    );

    expect(notifyRes.success).toBe(true);
    expect(notifyRes.count).toBeGreaterThan(0);

    // Check notification in database
    const notification = await prisma.notification.findFirst({
      where: {
        userId: student1.id,
        type: NotificationType.RESULT,
        link: `/courses/${testOffering.id}/quizzes/${quiz.id}`,
      },
    });

    expect(notification).toBeDefined();
    expect(notification?.title).toContain("Quiz Results Available");

    // Clean up created notification
    if (notification) {
      await prisma.notification.delete({ where: { id: notification.id } });
    }
  });

  it("7. Allows teacher to view individual attempt details", async () => {
    const quiz = await createQuizWithQuestions();
    const questions = await prisma.question.findMany({
      where: { quizId: quiz.id },
      include: { options: true },
      orderBy: { order: "asc" },
    });
    const q1 = questions[0];
    const q1Correct = q1.options.find((o) => o.isCorrect)!;

    const att = await startOrResumeAttempt(quiz.id, testOffering.id, student1.id);
    await saveAttemptAnswer(att.attemptId, q1.id, [q1Correct.id], student1.id);
    await submitAttempt(att.attemptId, student1.id);

    const detail = await getTeacherAttemptDetail(
      att.attemptId,
      testOffering.id,
      teacherUser.id,
      teacherUser.role
    );

    expect(detail.attemptId).toBe(att.attemptId);
    expect(detail.student.id).toBe(student1.id);
    expect(detail.questions.length).toBe(2);
    expect(detail.questions[0].isCorrect).toBe(true);
    expect(detail.questions[0].marksAwarded).toBe(5);
    expect(detail.questions[0].options.some((o) => o.isCorrect)).toBe(true);
  });
});
