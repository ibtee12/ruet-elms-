import { prisma } from "@/lib/prisma";
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors";
import { Role } from "@prisma/client";

export interface TeacherGuardOptions {
  allowTA?: boolean;
}

/**
 * Asserts that the specified user is an assigned instructor or TA for the offering.
 * Throws ForbiddenError if the user is not assigned or fails TA policy limits.
 */
export async function assertOfferingTeacher(
  userId: string,
  offeringId: string,
  opts: TeacherGuardOptions = { allowTA: true }
) {
  const allowTA = opts.allowTA ?? true;

  const offeringTeacher = await prisma.offeringTeacher.findUnique({
    where: {
      offeringId_userId: {
        offeringId,
        userId,
      },
    },
    include: {
      offering: true,
    },
  });

  if (!offeringTeacher) {
    throw new ForbiddenError(
      "You are not assigned as an instructor or TA for this course offering."
    );
  }

  if (!allowTA && offeringTeacher.role === "TA") {
    throw new ForbiddenError(
      "Teaching Assistants are not permitted to perform this administrative or grading action."
    );
  }

  return offeringTeacher;
}

/**
 * Asserts that the caller is authorized to grade submissions for the given offering:
 * - SUPER_ADMIN: always authorized
 * - INSTRUCTOR: assigned to offering -> authorized
 * - TA: assigned to offering -> authorized ONLY IF offeringTeacher.canGrade === true OR offering.allowTaGrading === true
 * - Others: throws ForbiddenError
 */
export async function assertCanGradeOffering(
  userId: string,
  userRole: Role,
  offeringId: string
) {
  if (userRole === Role.SUPER_ADMIN) {
    return;
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      status: true,
      allowTaGrading: true,
      offeringTeachers: {
        where: { userId },
        select: {
          role: true,
          canGrade: true,
        },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  if (offering.status === "ARCHIVED") {
    throw new ForbiddenError(
      "Course offering is archived and grades cannot be modified."
    );
  }

  const assignment = offering.offeringTeachers[0];
  if (!assignment) {
    throw new ForbiddenError("You are not assigned to this course offering.");
  }

  if (assignment.role === "INSTRUCTOR") {
    return;
  }

  if (assignment.role === "TA") {
    const isAllowed = assignment.canGrade || offering.allowTaGrading;
    if (!isAllowed) {
      throw new ForbiddenError(
        "Teaching Assistants are not permitted to grade submissions for this offering unless allowed by the instructor."
      );
    }
    return;
  }

  throw new ForbiddenError(
    "You are not authorized to grade submissions for this course offering."
  );
}

/**
 * Asserts that the student has an ACTIVE enrollment in a section of that offering
 * AND that the offering is currently PUBLISHED.
 */
export async function assertEnrolled(userId: string, offeringId: string) {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: { status: true },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  if (offering.status !== "PUBLISHED") {
    throw new ForbiddenError(
      "This course offering is not published and is not accessible to students."
    );
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: userId,
      status: "ACTIVE",
      section: {
        offeringId,
      },
    },
    include: {
      section: true,
    },
  });

  if (!enrollment) {
    throw new ForbiddenError(
      "You do not have an active enrollment in this course offering."
    );
  }

  return enrollment;
}

/**
 * Asserts departmental administrative access:
 * - SUPER_ADMIN always has access.
 * - DEPT_ADMIN only has access if they are assigned to that specific department.
 */
export async function assertDeptAccess(userId: string, departmentId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      teacherProfile: {
        select: { departmentId: true },
      },
    },
  });

  if (!user) {
    throw new ForbiddenError("User not found.");
  }

  if (user.role === Role.SUPER_ADMIN) {
    return { authorized: true, role: Role.SUPER_ADMIN };
  }

  if (user.role === Role.DEPT_ADMIN) {
    if (user.teacherProfile?.departmentId === departmentId) {
      return { authorized: true, role: Role.DEPT_ADMIN };
    }
    throw new ForbiddenError(
      "Department Administrators are only authorized to manage their own department."
    );
  }

  throw new ForbiddenError(
    "Administrative authorization required to access departmental management."
  );
}

/**
 * Returns true if the user is authorized to view the given offering:
 * 1. SUPER_ADMIN: always true
 * 2. DEPT_ADMIN: true if the offering's course belongs to their department
 * 3. TEACHER: true if assigned to the offering as instructor or TA
 * 4. STUDENT: true if actively enrolled in a section AND offering is PUBLISHED
 */
export async function canViewOffering(
  user: { id: string; role: Role },
  offeringId: string
): Promise<boolean> {
  if (user.role === Role.SUPER_ADMIN) {
    return true;
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      status: true,
      course: {
        select: { departmentId: true },
      },
      offeringTeachers: {
        where: { userId: user.id },
        select: { role: true },
      },
      sections: {
        where: {
          enrollments: {
            some: {
              studentId: user.id,
              status: "ACTIVE",
            },
          },
        },
        select: { id: true },
      },
    },
  });

  if (!offering) {
    return false;
  }

  // DEPT_ADMIN check
  if (user.role === Role.DEPT_ADMIN) {
    const adminProfile = await prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { departmentId: true },
    });
    return adminProfile?.departmentId === offering.course.departmentId;
  }

  // TEACHER check (Instructor or TA)
  if (user.role === Role.TEACHER) {
    return offering.offeringTeachers.length > 0;
  }

  // STUDENT check
  if (user.role === Role.STUDENT) {
    return (
      offering.status === "PUBLISHED" && offering.sections.length > 0
    );
  }

  return false;
}

/**
 * Asserts that the caller is authorized to view the given offering (per canViewOffering).
 * Throws ForbiddenError if unauthorized.
 */
export async function assertCanViewOffering(
  user: { id: string; role: Role },
  offeringId: string
): Promise<void> {
  const allowed = await canViewOffering(user, offeringId);
  if (!allowed) {
    throw new ForbiddenError(
      "You do not have authorization to view this course offering."
    );
  }
}

/**
 * Asserts that an offering is currently writable (i.e. not ARCHIVED).
 * Throws ForbiddenError if the offering is ARCHIVED.
 * Later steps reuse this to guard sections, assignments, materials, quizzes, and gradebooks.
 */
export async function assertOfferingWritable(offeringId: string) {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      status: true,
      term: true,
      academicYear: true,
      courseId: true,
      course: {
        select: {
          id: true,
          code: true,
          title: true,
          departmentId: true,
        },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  if (offering.status === "ARCHIVED") {
    throw new ForbiddenError(
      `Course offering '${offering.course.code}' is ARCHIVED and read-only. No further modifications are permitted.`
    );
  }

  return offering;
}

export interface RosterAccess {
  offeringId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  departmentId: string;
  /** True if the caller may modify the roster (ignores ARCHIVED; combine with assertOfferingWritable). */
  canManage: boolean;
}

/**
 * Roster (enrollment list) access for an offering:
 * - SUPER_ADMIN: read + manage
 * - DEPT_ADMIN: read + manage only for offerings in their own department
 * - TEACHER: INSTRUCTOR of this offering -> read + manage; TA of this offering -> read only
 * - Everyone else (incl. teachers of other offerings and students): Forbidden
 *
 * Pass { manage: true } for write operations; TAs are then rejected.
 */
export async function assertRosterAccess(
  user: { id: string; role: Role },
  offeringId: string,
  opts: { manage?: boolean } = {}
): Promise<RosterAccess> {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      status: true,
      course: { select: { departmentId: true } },
      offeringTeachers: {
        where: { userId: user.id },
        select: { role: true },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  const base = {
    offeringId: offering.id,
    status: offering.status,
    departmentId: offering.course.departmentId,
  };

  if (user.role === Role.SUPER_ADMIN) {
    return { ...base, canManage: true };
  }

  if (user.role === Role.DEPT_ADMIN) {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { departmentId: true },
    });
    if (profile?.departmentId !== offering.course.departmentId) {
      throw new ForbiddenError(
        "Department Administrators can only manage rosters in their own department."
      );
    }
    return { ...base, canManage: true };
  }

  if (user.role === Role.TEACHER) {
    const assignment = offering.offeringTeachers[0];
    if (!assignment) {
      throw new ForbiddenError("You are not assigned to this course offering.");
    }
    const canManage = assignment.role === "INSTRUCTOR";
    if (opts.manage && !canManage) {
      throw new ForbiddenError(
        "Only instructors of this offering can change its roster."
      );
    }
    return { ...base, canManage };
  }

  throw new ForbiddenError("You do not have permission to view this roster.");
}

/**
 * Asserts that the caller is authorized to view course analytics:
 * - SUPER_ADMIN: always authorized
 * - DEPT_ADMIN: authorized ONLY if offering belongs to their department
 * - TEACHER: authorized ONLY if assigned as INSTRUCTOR or TA for the offering
 * - STUDENT or unauthorized teacher: throws ForbiddenError (403)
 */
export async function assertAnalyticsAccess(
  user: { id: string; role: Role },
  offeringId: string
) {
  if (user.role === Role.SUPER_ADMIN) {
    return;
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      course: { select: { departmentId: true } },
      offeringTeachers: {
        where: { userId: user.id },
        select: { role: true },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  if (user.role === Role.DEPT_ADMIN) {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { departmentId: true },
    });
    if (profile?.departmentId !== offering.course.departmentId) {
      throw new ForbiddenError(
        "Department Administrators can only view analytics for courses in their own department."
      );
    }
    return;
  }

  if (user.role === Role.TEACHER) {
    if (offering.offeringTeachers.length === 0) {
      throw new ForbiddenError(
        "You are not assigned as an instructor or TA for this course offering."
      );
    }
    return;
  }

  throw new ForbiddenError(
    "You do not have permission to view teacher analytics for this course offering."
  );
}

