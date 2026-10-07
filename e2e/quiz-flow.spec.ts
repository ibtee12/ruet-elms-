import { test, expect } from "@playwright/test";
import { prisma } from "../lib/prisma";
import { QuestionType, QuestionDifficulty } from "@prisma/client";
import { loginAs } from "./helpers";

const OFFERING_ID = "cmux0c4hd006l765790ef9wi9"; // CSE 3205
let testQuizId: string;

test.describe("Student Quiz Flow", () => {
  test.beforeAll(async () => {
    // 1. Resolve student and teacher
    const student = await prisma.user.findFirst({
      where: { studentProfile: { studentId: "2203001" } },
    });
    const teacher = await prisma.user.findUnique({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });
    if (!student || !teacher) throw new Error("Seed users not found");

    // 2. Find or create active test quiz
    let quiz = await prisma.quiz.findFirst({
      where: {
        offeringId: OFFERING_ID,
        title: "E2E Playwright Quiz Flow Test",
      },
      include: { questions: { include: { options: true } } },
    });

    if (!quiz) {
      quiz = await prisma.quiz.create({
        data: {
          offering: { connect: { id: OFFERING_ID } },
          createdBy: { connect: { id: teacher.id } },
          title: "E2E Playwright Quiz Flow Test",
          description: "End-to-end automated quiz taking verification test.",
          durationMin: 15,
          startAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
          endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
          maxAttempts: 3,
          published: true,
          questions: {
            create: [
              {
                text: "What type of dependency does Third Normal Form (3NF) strictly eliminate?",
                type: QuestionType.SINGLE,
                difficulty: QuestionDifficulty.MEDIUM,
                marks: 5,
                order: 1,
                options: {
                  create: [
                    { text: "Partial functional dependency", isCorrect: false, order: 1 },
                    { text: "Transitive dependency", isCorrect: true, order: 2 },
                    { text: "Join dependency", isCorrect: false, order: 3 },
                  ],
                },
              },
              {
                text: "A primary key column in relational databases may contain NULL values.",
                type: QuestionType.TRUE_FALSE,
                difficulty: QuestionDifficulty.EASY,
                marks: 5,
                order: 2,
                options: {
                  create: [
                    { text: "True", isCorrect: false, order: 1 },
                    { text: "False", isCorrect: true, order: 2 },
                  ],
                },
              },
            ],
          },
        },
        include: { questions: { include: { options: true } } },
      });
    } else {
      // Ensure quiz window is open and published
      await prisma.quiz.update({
        where: { id: quiz.id },
        data: {
          startAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          published: true,
        },
      });
    }
    testQuizId = quiz.id;

    // 3. Clean up any existing attempts by this student on this quiz
    await prisma.answer.deleteMany({
      where: {
        attempt: {
          studentId: student.id,
          quizId: testQuizId,
        },
      },
    });
    await prisma.quizAttempt.deleteMany({
      where: {
        studentId: student.id,
        quizId: testQuizId,
      },
    });
  });

  test("student can open quiz, answer questions, submit, and view score", async ({
    page,
  }) => {
    // 1. Student login
    await loginAs(page, "2203001", "Password123!");

    // 2. Navigate to quiz info page
    await page.goto(`/courses/${OFFERING_ID}/quizzes/${testQuizId}`);
    await expect(
      page.getByRole("heading", { name: "E2E Playwright Quiz Flow Test" })
    ).toBeVisible();

    // 3. Click Start Attempt
    const startBtn = page.getByRole("button", { name: /start attempt|resume/i });
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Confirm dialog
    const confirmStartBtn = page.getByRole("button", { name: "Begin Now" });
    await expect(confirmStartBtn).toBeVisible();
    await confirmStartBtn.click();

    // 4. Wait for attempt runner page
    await page.waitForURL((url) => url.pathname.includes("/attempt/"), {
      timeout: 15000,
    });

    // 5. Answer Question 1: select "Transitive dependency"
    const option1 = page.getByText("Transitive dependency");
    await expect(option1).toBeVisible();
    await option1.click();

    // Navigate to Question 2 via Next
    const nextBtn = page.getByRole("button", { name: "Next", exact: true });
    if (await nextBtn.isEnabled()) {
      await nextBtn.click();
    }

    // Answer Question 2: select "False"
    const option2 = page.getByText("False").first();
    await expect(option2).toBeVisible();
    await option2.click();

    // 6. Submit Attempt
    const finishBtn = page.getByRole("button", { name: /finish & submit/i });
    await expect(finishBtn).toBeVisible();
    await finishBtn.click();

    // Confirm Submit Dialog
    const confirmSubmitBtn = page.getByRole("button", { name: /submit & grade/i });
    await expect(confirmSubmitBtn).toBeVisible();
    await confirmSubmitBtn.click();

    // 7. Redirect to results page
    await page.waitForURL((url) => url.pathname.includes("/results/"), {
      timeout: 15000,
    });

    // 8. Verify results header and score display
    await expect(
      page.getByText("Attempt Graded & Recorded")
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Assessment Result")).toBeVisible();
  });
});
