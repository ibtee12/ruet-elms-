import { test, expect } from "@playwright/test";
import { prisma } from "../lib/prisma";
import { loginAs } from "./helpers";

const OFFERING_ID = "cmux0c4hd006l765790ef9wi9"; // CSE 3205
let testAssignmentId: string;
let studentUserId: string;

test.describe("Student Assignment Submission Flow", () => {
  test.beforeAll(async () => {
    // 1. Resolve student user
    const student = await prisma.user.findFirst({
      where: { studentProfile: { studentId: "2203001" } },
    });
    if (!student) throw new Error("Student 2203001 not found");
    studentUserId = student.id;

    // 2. Find or create a dedicated E2E test assignment
    let assignment = await prisma.assignment.findFirst({
      where: {
        offeringId: OFFERING_ID,
        title: "E2E Playwright Submission Test",
      },
    });

    const teacher = await prisma.user.findUnique({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });
    if (!teacher) throw new Error("Teacher arahman@cse.ruet.ac.bd not found");

    if (!assignment) {
      assignment = await prisma.assignment.create({
        data: {
          offering: { connect: { id: OFFERING_ID } },
          createdBy: { connect: { id: teacher.id } },
          title: "E2E Playwright Submission Test",
          description: "This assignment is for automated end-to-end multi-version testing.",
          maxMarks: 25,
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
          lateAllowed: true,
          latePenaltyPercent: 10,
          maxSizeMb: 15,
          allowedTypes: ["pdf", "txt", "docx"],
          published: true,
        },
      });
    } else {
      // Ensure deadline is in future and published
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: {
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          published: true,
        },
      });
    }
    testAssignmentId = assignment.id;

    // 3. Clean up any existing submission for this student on this test assignment
    const existingSub = await prisma.submission.findUnique({
      where: {
        assignmentId_studentId: {
          assignmentId: testAssignmentId,
          studentId: studentUserId,
        },
      },
    });

    if (existingSub) {
      await prisma.gradeHistory.deleteMany({
        where: { submissionId: existingSub.id },
      });
      await prisma.grade.deleteMany({
        where: { submissionId: existingSub.id },
      });
      await prisma.submission.update({
        where: { id: existingSub.id },
        data: { currentVersionId: null },
      });
      await prisma.submissionVersion.deleteMany({
        where: { submissionId: existingSub.id },
      });
      await prisma.submission.delete({
        where: { id: existingSub.id },
      });
    }
  });

  test("student can submit version 1, resubmit version 2, and inspect history", async ({
    page,
  }) => {
    // 1. Student login
    await loginAs(page, "2203001", "Password123!");

    // 2. Navigate directly to test assignment detail page
    await page.goto(`/courses/${OFFERING_ID}/assignments/${testAssignmentId}`);
    await expect(
      page.getByRole("heading", { name: "E2E Playwright Submission Test" })
    ).toBeVisible();

    // 3. Submit Version 1
    const file1Buffer = Buffer.from("%PDF-1.4 Mock Assignment Solution V1 Content");
    await page.setInputFiles('input[type="file"]', {
      name: "solution_v1.pdf",
      mimeType: "application/pdf",
      buffer: file1Buffer,
    });

    // Verify file name preview is displayed
    await expect(page.getByText("solution_v1.pdf")).toBeVisible();

    // Click submit
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Verify success toast or version 1 indication
    await expect(
      page.getByText(/successfully submitted|Version 1/i).first()
    ).toBeVisible({ timeout: 15000 });

    // Verify Version 1 shows up in submission history
    await expect(page.getByText(/Version 1/i).first()).toBeVisible();

    // Wait for Next.js router.refresh() to update state to Version 2 of 10
    await expect(page.getByText("Version 2 of 10")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("RESUBMIT ASSIGNMENT")).toBeVisible();

    // 4. Submit Version 2
    const file2Buffer = Buffer.from("%PDF-1.4 Mock Assignment Solution V2 Updated Content");
    await page.setInputFiles('input[type="file"]', {
      name: "solution_v2.pdf",
      mimeType: "application/pdf",
      buffer: file2Buffer,
    });

    await expect(page.getByText("solution_v2.pdf")).toBeVisible();

    // Click resubmit
    const resubmitBtn = page.locator('button[type="submit"]');
    await expect(resubmitBtn).toBeEnabled({ timeout: 10000 });
    await resubmitBtn.click();

    // Verify version 2 confirmation
    await expect(
      page.getByText(/successfully submitted.*Version 2|Version 2/i).first()
    ).toBeVisible({ timeout: 15000 });

    // Verify both versions exist in the page history list
    await expect(page.getByText("Version 2").first()).toBeVisible();
    await expect(page.getByText("Version 1").first()).toBeVisible();
  });
});
