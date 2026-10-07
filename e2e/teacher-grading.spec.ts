import { test, expect } from "@playwright/test";
import { prisma } from "../lib/prisma";
import { loginAs } from "./helpers";

const OFFERING_ID = "cmux0c4hd006l765790ef9wi9"; // CSE 3205
let gradingAssignmentId: string;
let submissionId: string;

test.describe("Teacher Grading & Grade Modification Flow", () => {
  test.beforeAll(async () => {
    // 1. Resolve teacher and student
    const teacher = await prisma.user.findUnique({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });
    const student = await prisma.user.findFirst({
      where: { studentProfile: { studentId: "2203001" } },
    });
    if (!teacher || !student) throw new Error("Seed users not found");

    // 2. Find or create grading test assignment
    let assignment = await prisma.assignment.findFirst({
      where: {
        offeringId: OFFERING_ID,
        title: "E2E Playwright Teacher Grading Test",
      },
    });

    if (!assignment) {
      assignment = await prisma.assignment.create({
        data: {
          offering: { connect: { id: OFFERING_ID } },
          createdBy: { connect: { id: teacher.id } },
          title: "E2E Playwright Teacher Grading Test",
          description: "Assignment used to test teacher grading and grade alteration audit logs.",
          maxMarks: 25,
          deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          lateAllowed: true,
          latePenaltyPercent: 10,
          maxSizeMb: 15,
          allowedTypes: ["pdf"],
          published: true,
        },
      });
    }
    gradingAssignmentId = assignment.id;

    // 3. Ensure a clean submission with 1 version exists for student 2203001
    let sub = await prisma.submission.findUnique({
      where: {
        assignmentId_studentId: {
          assignmentId: gradingAssignmentId,
          studentId: student.id,
        },
      },
    });

    if (sub) {
      await prisma.gradeHistory.deleteMany({
        where: { submissionId: sub.id },
      });
      await prisma.grade.deleteMany({
        where: { submissionId: sub.id },
      });
      await prisma.submission.update({
        where: { id: sub.id },
        data: { currentVersionId: null, status: "SUBMITTED" },
      });
      await prisma.submissionVersion.deleteMany({
        where: { submissionId: sub.id },
      });
    } else {
      sub = await prisma.submission.create({
        data: {
          assignmentId: gradingAssignmentId,
          studentId: student.id,
          status: "SUBMITTED",
        },
      });
    }

    const version = await prisma.submissionVersion.create({
      data: {
        submissionId: sub.id,
        versionNo: 1,
        fileKey: "mock/e2e-grading.pdf",
        originalName: "e2e-grading.pdf",
        mime: "application/pdf",
        sizeBytes: 1024,
        isLate: false,
      },
    });

    await prisma.submission.update({
      where: { id: sub.id },
      data: { currentVersionId: version.id },
    });

    submissionId = sub.id;
  });

  test("teacher grades submission and then modifies grade with required reason", async ({
    page,
  }) => {
    // 1. Teacher login
    await loginAs(page, "arahman@cse.ruet.ac.bd", "Password123!");

    // 2. Navigate to assignment submissions list
    await page.goto(
      `/teach/${OFFERING_ID}/assignments/${gradingAssignmentId}/submissions`
    );

    // Verify page title
    await expect(
      page.getByText("E2E Playwright Teacher Grading Test").first()
    ).toBeVisible();

    // 3. Click Grade on the student row
    const gradeLink = page.locator(`a[href*="/submissions/${submissionId}"]`);
    await expect(gradeLink).toBeVisible();
    await gradeLink.click();

    await page.waitForURL((url) => url.pathname.includes(`/submissions/${submissionId}`), {
      timeout: 10000,
    });

    // 4. Initial Grading
    await page.fill("#marks-input", "21.5");
    await page.fill("#feedback-input", "Great schema diagram and complete cardinality.");

    const saveBtn = page.getByRole("button", { name: /save grade/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify confirmation and button text change to "Update Grade"
    await expect(
      page.getByRole("button", { name: /update grade/i })
    ).toBeVisible({ timeout: 15000 });

    // 5. Modify the grade (requires reason)
    await page.fill("#marks-input", "23.5");
    const reasonInput = page.locator("#reason-input");
    await expect(reasonInput).toBeVisible();
    await reasonInput.fill("Rechecked ER diagram composite key handling");

    const updateBtn = page.getByRole("button", { name: /update grade/i });
    await updateBtn.click();

    // Verify Grade History displays the change and audit log
    await expect(
      page.getByText(/Grade History & Audit Log/i)
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText(/21.5 → 23.5 Marks/i).first()
    ).toBeVisible();
    await expect(
      page.getByText(/Rechecked ER diagram composite key handling/i).first()
    ).toBeVisible();
  });
});
