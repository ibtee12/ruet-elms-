import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus } from "@prisma/client";
import { canViewOffering, assertCanViewOffering } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/auth/errors";

export interface OverviewTeacherItem {
  id: string;
  name: string;
  role: string;
  designation: string;
  email: string;
}

export interface OverviewAnnouncementItem {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  authorName: string;
  authorRole: string;
  isDepartmentLevel: boolean;
  departmentCode?: string;
  offeringId?: string | null;
}

export interface CourseOverviewData {
  offeringId: string;
  courseId: string;
  code: string;
  title: string;
  credits: string;
  description: string | null;
  syllabus: string | null;
  term: string;
  academicYear: string;
  status: CourseOfferingStatus;
  isArchived: boolean;
  canEdit: boolean;
  departmentCode: string;
  departmentName: string;
  teachers: OverviewTeacherItem[];
  counts: {
    sections: number;
    students: number;
    materials: number;
    assignments: number;
    quizzes: number;
  };
  announcements: OverviewAnnouncementItem[];
}

/**
 * Loads rich overview data for a course workspace.
 */
export async function getOfferingOverviewData(
  offeringId: string,
  caller: { id: string; role: Role }
): Promise<CourseOverviewData> {
  await assertCanViewOffering(caller, offeringId);

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: {
      course: {
        include: {
          department: { select: { id: true, code: true, name: true } },
        },
      },
      sections: {
        select: {
          id: true,
          _count: {
            select: {
              enrollments: { where: { status: "ACTIVE" } },
            },
          },
        },
      },
      offeringTeachers: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              teacherProfile: {
                select: { designation: true },
              },
            },
          },
        },
        orderBy: { role: "asc" },
      },
      _count: {
        select: {
          assignments: true,
          quizzes: true,
        },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  // Count materials across all modules in offering
  const materialsCount = await prisma.material.count({
    where: {
      module: { offeringId },
    },
  });

  // Latest 5 announcements: offering-level OR department-level
  const announcements = await prisma.announcement.findMany({
    where: {
      OR: [
        { offeringId },
        { departmentId: offering.course.department.id },
      ],
    },
    include: {
      author: { select: { name: true, role: true } },
      department: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const totalStudents = offering.sections.reduce(
    (sum, s) => sum + s._count.enrollments,
    0
  );

  const isAssignedTeacher = offering.offeringTeachers.some(
    (ot) => ot.user.id === caller.id
  );
  const canEdit =
    offering.status !== CourseOfferingStatus.ARCHIVED &&
    (caller.role === Role.SUPER_ADMIN ||
      (caller.role === Role.TEACHER && isAssignedTeacher));

  return {
    offeringId: offering.id,
    courseId: offering.course.id,
    code: offering.course.code,
    title: offering.course.title,
    credits: offering.course.credits.toString(),
    description: offering.course.description,
    syllabus: offering.syllabus,
    term: offering.term,
    academicYear: offering.academicYear,
    status: offering.status,
    isArchived: offering.status === CourseOfferingStatus.ARCHIVED,
    canEdit,
    departmentCode: offering.course.department.code,
    departmentName: offering.course.department.name,
    teachers: offering.offeringTeachers.map((ot) => ({
      id: ot.user.id,
      name: ot.user.name,
      role: ot.role,
      designation: ot.user.teacherProfile?.designation || "Faculty Member",
      email: ot.user.email,
    })),
    counts: {
      sections: offering.sections.length,
      students: totalStudents,
      materials: materialsCount,
      assignments: offering._count.assignments,
      quizzes: offering._count.quizzes,
    },
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      createdAt: a.createdAt,
      authorName: a.author.name,
      authorRole: a.author.role,
      isDepartmentLevel: a.departmentId !== null,
      departmentCode: a.department?.code,
      offeringId: a.offeringId,
    })),
  };
}

/**
 * Loads offering announcements with access control.
 */
export async function getOfferingAnnouncements(
  offeringId: string,
  caller: { id: string; role: Role }
) {
  await assertCanViewOffering(caller, offeringId);

  const offering = await prisma.courseOffering.findUniqueOrThrow({
    where: { id: offeringId },
    select: {
      id: true,
      course: { select: { departmentId: true } },
    },
  });

  return prisma.announcement.findMany({
    where: {
      OR: [
        { offeringId },
        { departmentId: offering.course.departmentId },
      ],
    },
    include: {
      author: { select: { name: true, role: true } },
      department: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Fetches latest announcements for student dashboard.
 */
export async function getStudentDashboardAnnouncements(studentId: string, limit: number = 5) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      studentProfile: { select: { departmentId: true } },
      enrollments: {
        where: { status: "ACTIVE" },
        select: { section: { select: { offeringId: true } } },
      },
    },
  });

  if (!student) return [];

  const deptId = student.studentProfile?.departmentId;
  const offeringIds = student.enrollments.map((e) => e.section.offeringId);

  return prisma.announcement.findMany({
    where: {
      OR: [
        ...(deptId ? [{ departmentId: deptId }] : []),
        ...(offeringIds.length > 0 ? [{ offeringId: { in: offeringIds } }] : []),
      ],
    },
    include: {
      author: { select: { name: true, role: true } },
      offering: {
        select: {
          id: true,
          course: { select: { code: true, title: true } },
        },
      },
      department: { select: { code: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
