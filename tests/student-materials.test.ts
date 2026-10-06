/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, MaterialType } from "@prisma/client";
import { getStudentOfferingMaterialsData } from "@/services/materials";
import { toggleMaterialProgressAction } from "@/actions/materials";
import { getStudentEnrolledCourses } from "@/services/course-workspace";
import { clearMaterialViewThrottle } from "@/lib/activity";
import * as sessionModule from "@/lib/auth/session";
import { NextRequest } from "next/server";
import { GET as downloadRouteHandler } from "@/app/api/materials/[materialId]/download/route";
import * as storageModule from "@/lib/storage";
import * as nextAuth from "next-auth/next";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.1" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 19: Materials, Student Side", () => {
  let studentA: any;
  let studentB: any;
  let teacherA: any;
  let offeringA: any;
  let moduleA: any;
  let materialPublished1: any;
  let materialPublished2: any;
  let materialUnpublished: any;

  beforeEach(async () => {
    clearMaterialViewThrottle();

    vi.spyOn(storageModule, "getSignedDownloadUrl").mockResolvedValue(
      "https://storage.supabase.co/signed/file.pdf"
    );

    studentA = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    studentB = await prisma.user.findFirstOrThrow({
      where: { email: "2203002@student.ruet.ac.bd" },
    });

    teacherA = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    // Find offering where studentA is actively enrolled
    const enrollment = await prisma.enrollment.findFirstOrThrow({
      where: {
        studentId: studentA.id,
        status: "ACTIVE",
        section: {
          offering: {
            status: CourseOfferingStatus.PUBLISHED,
          },
        },
      },
      include: {
        section: {
          include: {
            offering: true,
          },
        },
      },
    });

    offeringA = enrollment.section.offering;

    // Create a dedicated module for this test run
    moduleA = await prisma.module.create({
      data: {
        offeringId: offeringA.id,
        title: `Test Module Student ${Date.now()}`,
        order: 99,
      },
    });

    // Material 1: Published file
    materialPublished1 = await prisma.material.create({
      data: {
        moduleId: moduleA.id,
        title: "Published Lecture 1 Slides",
        type: MaterialType.FILE,
        fileKey: `${offeringA.id}/test-lecture-1.pdf`,
        originalName: "lecture-1.pdf",
        mime: "application/pdf",
        sizeBytes: 1048576,
        published: true,
        order: 0,
        uploadedById: teacherA.id,
      },
    });

    // Material 2: Published video link
    materialPublished2 = await prisma.material.create({
      data: {
        moduleId: moduleA.id,
        title: "Published Video Recording",
        type: MaterialType.VIDEO,
        url: "https://example.com/recording-01",
        published: true,
        order: 1,
        uploadedById: teacherA.id,
      },
    });

    // Material 3: Unpublished draft material
    materialUnpublished = await prisma.material.create({
      data: {
        moduleId: moduleA.id,
        title: "Draft Upcoming Quiz Prep (Hidden)",
        type: MaterialType.FILE,
        fileKey: `${offeringA.id}/draft-quiz-prep.pdf`,
        originalName: "draft-quiz.pdf",
        mime: "application/pdf",
        sizeBytes: 2048576,
        published: false,
        order: 2,
        uploadedById: teacherA.id,
      },
    });
  });

  afterEach(async () => {
    // Clean up created test module & materials
    if (moduleA?.id) {
      await prisma.materialProgress.deleteMany({
        where: {
          material: {
            moduleId: moduleA.id,
          },
        },
      });
      await prisma.material.deleteMany({
        where: { moduleId: moduleA.id },
      });
      await prisma.module.delete({
        where: { id: moduleA.id },
      });
    }
  });

  describe("Published Filtering & Access Protection", () => {
    it("ACCEPTANCE: Unpublished materials never appear in student materials query", async () => {
      const data = await getStudentOfferingMaterialsData(offeringA.id, studentA.id);

      const targetMod = data.modules.find((m) => m.id === moduleA.id);
      expect(targetMod).toBeDefined();

      const returnedMaterialIds = targetMod!.materials.map((m) => m.id);
      expect(returnedMaterialIds).toContain(materialPublished1.id);
      expect(returnedMaterialIds).toContain(materialPublished2.id);
      expect(returnedMaterialIds).not.toContain(materialUnpublished.id);

      // Verify that publishedCount does not include unpublished items
      expect(targetMod!.publishedCount).toBe(2);
    });

    it("ACCEPTANCE: Unpublished materials are rejected with 403 on download route for students", async () => {
      vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
        user: {
          id: studentA.id,
          email: studentA.email,
          name: studentA.name,
          role: Role.STUDENT,
        },
      });

      const req = new NextRequest(
        `http://localhost:3000/api/materials/${materialUnpublished.id}/download`
      );
      const res = await downloadRouteHandler(req, {
        params: Promise.resolve({ materialId: materialUnpublished.id }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/not published yet/);
    });

    it("rejects students who are not enrolled in the offering on download route with 403", async () => {
      // Create a temporary unenrolled student
      const unenrolledStudent = await prisma.user.create({
        data: {
          email: `unenrolled-${Date.now()}@student.ruet.ac.bd`,
          name: "Unenrolled Student",
          passwordHash: "dummy",
          role: Role.STUDENT,
        },
      });

      vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
        user: {
          id: unenrolledStudent.id,
          email: unenrolledStudent.email,
          name: unenrolledStudent.name,
          role: Role.STUDENT,
        },
      });

      const req = new NextRequest(
        `http://localhost:3000/api/materials/${materialPublished1.id}/download`
      );
      const res = await downloadRouteHandler(req, {
        params: Promise.resolve({ materialId: materialPublished1.id }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/not authorized to download/);

      await prisma.user.delete({ where: { id: unenrolledStudent.id } });
    });
  });

  describe("Completion Tracking & Per-Student Isolation", () => {
    it("ACCEPTANCE: Completion is per student and survives refresh", async () => {
      // Mock session for Student A
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      // Student A marks material 1 as completed
      const markRes = await toggleMaterialProgressAction(materialPublished1.id, true);
      expect(markRes.success).toBe(true);
      expect(markRes.completed).toBe(true);

      // Verify Student A's progress survives refresh (re-querying DB)
      const dataA = await getStudentOfferingMaterialsData(offeringA.id, studentA.id);
      const modA = dataA.modules.find((m) => m.id === moduleA.id)!;
      const mat1A = modA.materials.find((m) => m.id === materialPublished1.id)!;
      const mat2A = modA.materials.find((m) => m.id === materialPublished2.id)!;

      expect(mat1A.isCompleted).toBe(true);
      expect(mat2A.isCompleted).toBe(false);
      expect(modA.completedCount).toBe(1);
      expect(modA.progressPercentage).toBe(50); // 1 out of 2

      // Verify Student B's progress remains untouched (per-student isolation)
      const dataB = await getStudentOfferingMaterialsData(offeringA.id, studentB.id);
      const modB = dataB.modules.find((m) => m.id === moduleA.id)!;
      const mat1B = modB.materials.find((m) => m.id === materialPublished1.id)!;

      expect(mat1B.isCompleted).toBe(false);
      expect(modB.completedCount).toBe(0);
      expect(modB.progressPercentage).toBe(0);

      // Student A toggles material 1 back to incomplete
      const unmarkRes = await toggleMaterialProgressAction(materialPublished1.id, false);
      expect(unmarkRes.success).toBe(true);
      expect(unmarkRes.completed).toBe(false);

      const dataAAfter = await getStudentOfferingMaterialsData(offeringA.id, studentA.id);
      const modAAfter = dataAAfter.modules.find((m) => m.id === moduleA.id)!;
      expect(modAAfter.completedCount).toBe(0);
      expect(modAAfter.progressPercentage).toBe(0);
    });

    it("prevents marking unpublished materials as completed", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: studentA.id,
        email: studentA.email,
        name: studentA.name,
        role: Role.STUDENT,
        mustChangePassword: false,
      });

      await expect(
        toggleMaterialProgressAction(materialUnpublished.id, true)
      ).rejects.toThrow(/unpublished materials/);
    });
  });

  describe("Dynamic Progress Denominator Updates", () => {
    it("ACCEPTANCE: Progress updates when teacher publishes or unpublishes materials", async () => {
      // Student A marks material 1 as completed (1 of 2 published => 50%)
      await prisma.materialProgress.create({
        data: {
          materialId: materialPublished1.id,
          studentId: studentA.id,
        },
      });

      const initialData = await getStudentOfferingMaterialsData(offeringA.id, studentA.id);
      const modInitial = initialData.modules.find((m) => m.id === moduleA.id)!;
      expect(modInitial.publishedCount).toBe(2);
      expect(modInitial.completedCount).toBe(1);
      expect(modInitial.progressPercentage).toBe(50);

      // Teacher unpublishes material 2 (denominator changes to 1, progress becomes 100%)
      await prisma.material.update({
        where: { id: materialPublished2.id },
        data: { published: false },
      });

      const afterUnpublish = await getStudentOfferingMaterialsData(offeringA.id, studentA.id);
      const modAfterUnpublish = afterUnpublish.modules.find((m) => m.id === moduleA.id)!;
      expect(modAfterUnpublish.publishedCount).toBe(1);
      expect(modAfterUnpublish.completedCount).toBe(1);
      expect(modAfterUnpublish.progressPercentage).toBe(100);

      // Teacher publishes material 3 (denominator changes to 2, progress becomes 50%)
      await prisma.material.update({
        where: { id: materialUnpublished.id },
        data: { published: true },
      });

      const afterPublish = await getStudentOfferingMaterialsData(offeringA.id, studentA.id);
      const modAfterPublish = afterPublish.modules.find((m) => m.id === moduleA.id)!;
      expect(modAfterPublish.publishedCount).toBe(2);
      expect(modAfterPublish.completedCount).toBe(1);
      expect(modAfterPublish.progressPercentage).toBe(50);
    });
  });

  describe("ActivityEvent Logging & Throttling", () => {
    it("logs MATERIAL_VIEWED ActivityEvent on open, throttled to once per material per hour", async () => {
      vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
        user: {
          id: studentA.id,
          email: studentA.email,
          name: studentA.name,
          role: Role.STUDENT,
        },
      });

      const countBefore = await prisma.activityEvent.count({
        where: {
          userId: studentA.id,
          offeringId: offeringA.id,
          type: "MATERIAL_VIEWED",
        },
      });

      // 1. Open material 2 (URL link redirects)
      const req1 = new NextRequest(
        `http://localhost:3000/api/materials/${materialPublished2.id}/download`
      );
      const res1 = await downloadRouteHandler(req1, {
        params: Promise.resolve({ materialId: materialPublished2.id }),
      });

      expect(res1.status).toBe(307); // Temporary redirect to URL

      const countAfterFirst = await prisma.activityEvent.count({
        where: {
          userId: studentA.id,
          offeringId: offeringA.id,
          type: "MATERIAL_VIEWED",
        },
      });
      expect(countAfterFirst).toBe(countBefore + 1);

      // 2. Open material 2 again immediately (should be throttled, count unchanged)
      const req2 = new NextRequest(
        `http://localhost:3000/api/materials/${materialPublished2.id}/download`
      );
      const res2 = await downloadRouteHandler(req2, {
        params: Promise.resolve({ materialId: materialPublished2.id }),
      });
      expect(res2.status).toBe(307);

      const countAfterSecond = await prisma.activityEvent.count({
        where: {
          userId: studentA.id,
          offeringId: offeringA.id,
          type: "MATERIAL_VIEWED",
        },
      });
      expect(countAfterSecond).toBe(countAfterFirst); // No duplicate event logged!

      // 3. Open material 1 (a different material, should log 1 event)
      const req3 = new NextRequest(
        `http://localhost:3000/api/materials/${materialPublished1.id}/download`
      );
      const res3 = await downloadRouteHandler(req3, {
        params: Promise.resolve({ materialId: materialPublished1.id }),
      });
      expect(res3.status).toBe(307);

      const countAfterThird = await prisma.activityEvent.count({
        where: {
          userId: studentA.id,
          offeringId: offeringA.id,
          type: "MATERIAL_VIEWED",
        },
      });
      expect(countAfterThird).toBe(countAfterFirst + 1); // Logged for different material
    });
  });

  describe("Student Course List Progress Bar Integration", () => {
    it("reports real material progress metrics in getStudentEnrolledCourses", async () => {
      // Ensure Student A has 1 completed material
      await prisma.materialProgress.upsert({
        where: {
          materialId_studentId: {
            materialId: materialPublished1.id,
            studentId: studentA.id,
          },
        },
        create: {
          materialId: materialPublished1.id,
          studentId: studentA.id,
        },
        update: {},
      });

      const courses = await getStudentEnrolledCourses(studentA.id);
      const targetCourse = courses.find((c) => c.id === offeringA.id);

      expect(targetCourse).toBeDefined();
      expect(targetCourse?.materialProgress).toBeDefined();
      expect(targetCourse?.materialProgress.total).toBeGreaterThanOrEqual(2);
      expect(targetCourse?.materialProgress.completed).toBeGreaterThanOrEqual(1);
      expect(targetCourse?.materialProgress.percentage).toBeGreaterThanOrEqual(0);
      expect(targetCourse?.materialProgress.percentage).toBeLessThanOrEqual(100);
    });
  });
});
