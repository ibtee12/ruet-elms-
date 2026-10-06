/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, OfferingTeacherRole } from "@prisma/client";
import * as nextAuth from "next-auth/next";
import {
  createOfferingAction,
  updateOfferingStatusAction,
  addSectionAction,
  renameSectionAction,
  removeSectionAction,
  assignOfferingTeacherAction,
  removeOfferingTeacherAction,
  generateJoinCodeAction,
} from "@/actions/offerings";
import { assertOfferingWritable } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/auth/errors";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.9" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 14: Course Offerings & Status Transitions", () => {
  let superAdminUser: any;
  let cseDeptAdminUser: any;
  let cseTeacherUser: any;
  let cseCourse: any;
  let eeeOffering: any;
  let createdOfferingIds: string[] = [];

  beforeEach(async () => {
    superAdminUser = await prisma.user.findFirstOrThrow({
      where: { email: "admin@ruet.ac.bd" },
    });
    cseDeptAdminUser = await prisma.user.findFirstOrThrow({
      where: { email: "deptadmin.cse@ruet.ac.bd" },
    });
    cseTeacherUser = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });
    cseCourse = await prisma.course.findFirstOrThrow({
      where: { code: "CSE 3200" },
    });
    eeeOffering = await prisma.courseOffering.findFirstOrThrow({
      where: { course: { department: { code: "EEE" } } },
    });

    vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
      user: {
        id: superAdminUser.id,
        email: superAdminUser.email,
        name: superAdminUser.name,
        role: Role.SUPER_ADMIN,
        mustChangePassword: false,
      },
      expires: "2099-01-01",
    });
  });

  afterEach(async () => {
    if (createdOfferingIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { objectId: { in: createdOfferingIds } },
      });
      await prisma.offeringTeacher.deleteMany({
        where: { offeringId: { in: createdOfferingIds } },
      });
      await prisma.section.deleteMany({
        where: { offeringId: { in: createdOfferingIds } },
      });
      await prisma.courseOffering.deleteMany({
        where: { id: { in: createdOfferingIds } },
      });
      createdOfferingIds = [];
    }
  });

  it("Scenario 1: Cannot publish without at least one instructor and one section", async () => {
    // 1. Create a fresh draft offering (has Section A by default, 0 instructors)
    const createRes = await createOfferingAction({
      courseId: cseCourse.id,
      term: "Even Term",
      academicYear: "2026",
    });
    expect(createRes.success).toBe(true);
    const offeringId = createRes.offering!.id;
    createdOfferingIds.push(offeringId);

    // Attempting to publish without an instructor
    const publishWithoutInstructor = await updateOfferingStatusAction(
      offeringId,
      CourseOfferingStatus.PUBLISHED
    );
    expect(publishWithoutInstructor.success).toBe(false);
    expect(publishWithoutInstructor.error).toContain(
      "At least one INSTRUCTOR must be assigned before publishing"
    );

    // 2. Remove all sections and assign an instructor -> publish should fail on missing section
    await prisma.section.deleteMany({ where: { offeringId } });
    await assignOfferingTeacherAction(
      offeringId,
      cseTeacherUser.id,
      OfferingTeacherRole.INSTRUCTOR
    );

    const publishWithoutSection = await updateOfferingStatusAction(
      offeringId,
      CourseOfferingStatus.PUBLISHED
    );
    expect(publishWithoutSection.success).toBe(false);
    expect(publishWithoutSection.error).toContain(
      "At least one section is required before publishing"
    );
  });

  it("Scenario 2: Valid transition from DRAFT to PUBLISHED with section and instructor", async () => {
    const createRes = await createOfferingAction({
      courseId: cseCourse.id,
      term: "Even Term",
      academicYear: "2026",
    });
    const offeringId = createRes.offering!.id;
    createdOfferingIds.push(offeringId);

    // Assign instructor
    await assignOfferingTeacherAction(
      offeringId,
      cseTeacherUser.id,
      OfferingTeacherRole.INSTRUCTOR
    );

    // Publish offering
    const publishRes = await updateOfferingStatusAction(
      offeringId,
      CourseOfferingStatus.PUBLISHED
    );
    expect(publishRes.success).toBe(true);
    expect(publishRes.offering?.status).toBe(CourseOfferingStatus.PUBLISHED);

    // Verify AuditLog OFFERING_PUBLISHED
    const log = await prisma.auditLog.findFirst({
      where: { objectId: offeringId, action: "OFFERING_PUBLISHED" },
    });
    expect(log).toBeDefined();
    expect(log?.userId).toBe(superAdminUser.id);
  });

  it("Scenario 3: Archived offering rejects edits at the server action level (assertOfferingWritable)", async () => {
    const createRes = await createOfferingAction({
      courseId: cseCourse.id,
      term: "Even Term",
      academicYear: "2026",
    });
    const offeringId = createRes.offering!.id;
    createdOfferingIds.push(offeringId);

    // Transition directly to ARCHIVED
    const archiveRes = await updateOfferingStatusAction(
      offeringId,
      CourseOfferingStatus.ARCHIVED
    );
    expect(archiveRes.success).toBe(true);

    // Verify assertOfferingWritable rejects
    await expect(assertOfferingWritable(offeringId)).rejects.toThrow(
      ForbiddenError
    );
    await expect(assertOfferingWritable(offeringId)).rejects.toThrow(
      /is ARCHIVED and read-only/
    );

    // Verify server action rejects adding sections
    await expect(addSectionAction(offeringId, "Section B")).rejects.toThrow(
      ForbiddenError
    );

    // Verify server action rejects assigning teachers
    await expect(
      assignOfferingTeacherAction(
        offeringId,
        cseTeacherUser.id,
        OfferingTeacherRole.INSTRUCTOR
      )
    ).rejects.toThrow(ForbiddenError);

    // Verify server action rejects join code generation
    await expect(generateJoinCodeAction(offeringId)).rejects.toThrow(
      ForbiddenError
    );
  });

  it("Scenario 4: Dept admin cannot touch another department's offerings", async () => {
    vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
      user: {
        id: cseDeptAdminUser.id,
        email: cseDeptAdminUser.email,
        name: cseDeptAdminUser.name,
        role: Role.DEPT_ADMIN,
        mustChangePassword: false,
      },
      expires: "2099-01-01",
    });

    // CSE Dept Admin attempting to modify EEE offering status
    await expect(
      updateOfferingStatusAction(eeeOffering.id, CourseOfferingStatus.PUBLISHED)
    ).rejects.toThrow(ForbiddenError);

    // CSE Dept Admin attempting to create offering for EEE course
    const eeeCourse = await prisma.course.findFirstOrThrow({
      where: { department: { code: "EEE" } },
    });
    await expect(
      createOfferingAction({
        courseId: eeeCourse.id,
        term: "Even Term",
        academicYear: "2026",
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it("Scenario 5: Section and teacher operations adhere to integrity constraints", async () => {
    const createRes = await createOfferingAction({
      courseId: cseCourse.id,
      term: "Even Term",
      academicYear: "2026",
    });
    const offeringId = createRes.offering!.id;
    createdOfferingIds.push(offeringId);

    // 1. Add section
    const addSectionRes = await addSectionAction(offeringId, "Section B");
    expect(addSectionRes.success).toBe(true);
    expect(addSectionRes.section?.name).toBe("Section B");

    // 2. Rename section
    const renameRes = await renameSectionAction(
      addSectionRes.section!.id,
      "Section Lab-1"
    );
    expect(renameRes.success).toBe(true);
    expect(renameRes.section?.name).toBe("Section Lab-1");

    // 3. Remove section (no enrollments)
    const removeRes = await removeSectionAction(addSectionRes.section!.id);
    expect(removeRes.success).toBe(true);

    // 4. Assign and remove teacher
    const assignRes = await assignOfferingTeacherAction(
      offeringId,
      cseTeacherUser.id,
      OfferingTeacherRole.TA
    );
    expect(assignRes.success).toBe(true);
    expect(assignRes.teacher?.role).toBe(OfferingTeacherRole.TA);

    const removeTeacherRes = await removeOfferingTeacherAction(
      offeringId,
      cseTeacherUser.id
    );
    expect(removeTeacherRes.success).toBe(true);
  });
});
