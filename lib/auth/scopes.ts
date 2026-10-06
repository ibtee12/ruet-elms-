import { prisma } from "@/lib/prisma";
import { Role, Prisma } from "@prisma/client";

/**
 * Reusable query scope generator for CourseOfferings.
 * Guarantees that query lists only return offerings the user is authorized to see:
 * - SUPER_ADMIN: sees all offerings
 * - DEPT_ADMIN: sees offerings in their department
 * - TEACHER: sees offerings they are assigned to teach or assist
 * - STUDENT: sees only PUBLISHED offerings in which they hold an ACTIVE enrollment
 */
export async function offeringsVisibleTo(user: {
  id: string;
  role: Role;
}): Promise<Prisma.CourseOfferingWhereInput> {
  if (user.role === Role.SUPER_ADMIN) {
    return {};
  }

  if (user.role === Role.DEPT_ADMIN) {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { departmentId: true },
    });

    if (!profile?.departmentId) {
      return { id: "__none__" };
    }

    return {
      course: {
        departmentId: profile.departmentId,
      },
    };
  }

  if (user.role === Role.TEACHER) {
    return {
      offeringTeachers: {
        some: {
          userId: user.id,
        },
      },
    };
  }

  if (user.role === Role.STUDENT) {
    return {
      status: "PUBLISHED",
      sections: {
        some: {
          enrollments: {
            some: {
              studentId: user.id,
              status: "ACTIVE",
            },
          },
        },
      },
    };
  }

  return { id: "__none__" };
}
