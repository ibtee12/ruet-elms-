/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import {
  getStudentEnrolledCourses,
  getTeacherOfferings,
  getStudentWorkspaceData,
  getTeacherWorkspaceData,
} from "@/services/course-workspace";
import { ForbiddenError } from "@/lib/auth/errors";

describe("Step 16: Course Lists and Workspace Shell Authorization", () => {
  let studentUser: any;
  let otherStudentUser: any;
  let teacherA: any;
  let teacherB: any;
  let publishedOfferingA: any;
  let draftOffering: any;
  let teacherBOffering: any;

  beforeEach(async () => {
    studentUser = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    otherStudentUser = await prisma.user.findFirstOrThrow({
      where: { email: "2203002@student.ruet.ac.bd" },
    });

    teacherA = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    teacherB = await prisma.user.findFirstOrThrow({
      where: { email: "bkarim@cse.ruet.ac.bd" },
    });

    // Published offering where teacherA is assigned and studentUser is actively enrolled
    publishedOfferingA = await prisma.courseOffering.findFirstOrThrow({
      where: {
        status: "PUBLISHED",
        offeringTeachers: { some: { userId: teacherA.id } },
        sections: {
          some: {
            enrollments: { some: { studentId: studentUser.id, status: "ACTIVE" } },
          },
        },
      },
      include: {
        course: true,
      },
    });

    // Draft offering
    draftOffering = await prisma.courseOffering.findFirstOrThrow({
      where: { status: "DRAFT" },
      include: { course: true },
    });

    // Offering where teacherB is assigned, but teacherA is NOT assigned
    teacherBOffering = await prisma.courseOffering.findFirstOrThrow({
      where: {
        offeringTeachers: { some: { userId: teacherB.id } },
        NOT: {
          offeringTeachers: { some: { userId: teacherA.id } },
        },
      },
      include: { course: true },
    });
  });

  describe("Student /courses List", () => {
    it("returns active enrollments in PUBLISHED offerings with course code, title, teachers, and term", async () => {
      const courses = await getStudentEnrolledCourses(studentUser.id);
      expect(courses.length).toBeGreaterThan(0);

      const found = courses.find((c) => c.id === publishedOfferingA.id);
      expect(found).toBeDefined();
      expect(found?.code).toBe(publishedOfferingA.course.code);
      expect(found?.title).toBe(publishedOfferingA.course.title);
      expect(found?.term).toBe(publishedOfferingA.term);
      expect(found?.teachers).toBeInstanceOf(Array);
      expect(found?.teachers.some((t) => t.id === teacherA.id)).toBe(true);
    });

    it("excludes DRAFT offerings even if an enrollment record exists", async () => {
      // Create a temporary student user to avoid mutating seeded users in concurrent tests
      const tempUser = await prisma.user.create({
        data: {
          email: `temp-draft-${Date.now()}@student.ruet.ac.bd`,
          name: "Temp Draft Student",
          passwordHash: "dummy",
          role: Role.STUDENT,
        },
      });

      let draftSection = await prisma.section.findFirst({
        where: { offeringId: draftOffering.id },
      });
      if (!draftSection) {
        draftSection = await prisma.section.create({
          data: {
            offeringId: draftOffering.id,
            name: "Section Draft-Test",
          },
        });
      }

      await prisma.enrollment.create({
        data: {
          studentId: tempUser.id,
          sectionId: draftSection.id,
          status: "ACTIVE",
        },
      });

      try {
        const courses = await getStudentEnrolledCourses(tempUser.id);
        const draftMatch = courses.find((c) => c.id === draftOffering.id);
        expect(draftMatch).toBeUndefined();
      } finally {
        await prisma.enrollment.deleteMany({
          where: { studentId: tempUser.id },
        });
        await prisma.user.delete({
          where: { id: tempUser.id },
        });
      }
    });
  });

  describe("Teacher /teach List", () => {
    it("returns offerings where user is INSTRUCTOR/TA including DRAFT and PUBLISHED with status", async () => {
      const offerings = await getTeacherOfferings(teacherA.id);
      expect(offerings.length).toBeGreaterThan(0);

      // Verify that every offering returned includes teacherA in offeringTeachers
      for (const off of offerings) {
        expect(["DRAFT", "PUBLISHED"]).toContain(off.status);
        expect(off.teachers.some((t) => t.id === teacherA.id)).toBe(true);
      }

      // Teacher A must NOT see teacherBOffering if not assigned
      const bMatch = offerings.find((o) => o.id === teacherBOffering.id);
      expect(bMatch).toBeUndefined();
    });
  });

  describe("Acceptance: Student Workspace Authorization", () => {
    it("allows student to load workspace data for active enrolled published course", async () => {
      const data = await getStudentWorkspaceData(
        studentUser.id,
        Role.STUDENT,
        publishedOfferingA.id
      );

      expect(data).toBeDefined();
      expect(data.id).toBe(publishedOfferingA.id);
      expect(data.code).toBe(publishedOfferingA.course.code);
      expect(data.teachers.length).toBeGreaterThan(0);
    });

    it("ACCEPTANCE: Student cannot open a course they are not enrolled in by changing the URL", async () => {
      // Find an offering where otherStudentUser is NOT enrolled
      const notEnrolledOffering = await prisma.courseOffering.findFirstOrThrow({
        where: {
          status: "PUBLISHED",
          NOT: {
            sections: {
              some: {
                enrollments: {
                  some: { studentId: otherStudentUser.id, status: "ACTIVE" },
                },
              },
            },
          },
        },
      });

      await expect(
        getStudentWorkspaceData(
          otherStudentUser.id,
          Role.STUDENT,
          notEnrolledOffering.id
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it("ACCEPTANCE: Student cannot open a DRAFT offering by changing the URL", async () => {
      await expect(
        getStudentWorkspaceData(
          studentUser.id,
          Role.STUDENT,
          draftOffering.id
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe("Acceptance: Teacher Workspace Authorization", () => {
    it("allows teacher to load workspace data for their assigned offering", async () => {
      const data = await getTeacherWorkspaceData(
        teacherA.id,
        Role.TEACHER,
        publishedOfferingA.id
      );

      expect(data).toBeDefined();
      expect(data.id).toBe(publishedOfferingA.id);
      expect(data.code).toBe(publishedOfferingA.course.code);
      expect(data.myRole).toBeDefined();
    });

    it("ACCEPTANCE: Teacher cannot open another teacher's /teach/[offeringId]", async () => {
      // Teacher A attempts to access Teacher B's offering
      await expect(
        getTeacherWorkspaceData(
          teacherA.id,
          Role.TEACHER,
          teacherBOffering.id
        )
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
