import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus } from "@prisma/client";
import { assertCanViewOffering } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/auth/errors";

export interface StudentCourseItem {
  id: string; // offeringId
  enrollmentId: string;
  code: string;
  title: string;
  credits: string;
  term: string;
  academicYear: string;
  sectionName: string;
  departmentCode: string;
  departmentName: string;
  teachers: {
    id: string;
    name: string;
    role: string;
  }[];
  materialProgress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

export interface TeacherCourseItem {
  id: string; // offeringId
  code: string;
  title: string;
  credits: string;
  term: string;
  academicYear: string;
  status: CourseOfferingStatus;
  departmentCode: string;
  departmentName: string;
  myRole: string;
  sectionCount: number;
  totalStudents: number;
  teachers: {
    id: string;
    name: string;
    role: string;
  }[];
}

export interface WorkspaceHeaderData {
  id: string;
  code: string;
  title: string;
  credits: string;
  term: string;
  academicYear: string;
  status: CourseOfferingStatus;
  departmentCode: string;
  departmentName: string;
  teachers: {
    id: string;
    name: string;
    role: string;
  }[];
  myRole?: string;
  sectionName?: string;
}

/**
 * Returns active enrollments in published course offerings for a student.
 */
export async function getStudentEnrolledCourses(
  studentId: string
): Promise<StudentCourseItem[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
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
          offering: {
            include: {
              course: {
                include: {
                  department: { select: { code: true, name: true } },
                },
              },
              offeringTeachers: {
                include: {
                  user: { select: { id: true, name: true } },
                },
                orderBy: { role: "asc" }, // INSTRUCTOR first, then TA
              },
            },
          },
        },
      },
    },
    orderBy: { enrolledAt: "desc" },
  });

  const offeringIds = enrollments.map((e) => e.section.offering.id);

  // Efficiently fetch published materials and student progress across these offerings
  const publishedMaterials = await prisma.material.findMany({
    where: {
      published: true,
      module: {
        offeringId: { in: offeringIds },
      },
    },
    select: {
      id: true,
      module: {
        select: { offeringId: true },
      },
      progress: {
        where: { studentId },
        select: { id: true },
      },
    },
  });

  const offeringProgressMap = new Map<string, { total: number; completed: number }>();
  for (const mat of publishedMaterials) {
    const offId = mat.module.offeringId;
    const current = offeringProgressMap.get(offId) || { total: 0, completed: 0 };
    current.total += 1;
    if (mat.progress.length > 0) {
      current.completed += 1;
    }
    offeringProgressMap.set(offId, current);
  }

  return enrollments.map((e) => {
    const offering = e.section.offering;
    const course = offering.course;
    const prog = offeringProgressMap.get(offering.id) || { total: 0, completed: 0 };
    const percentage = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;

    return {
      id: offering.id,
      enrollmentId: e.id,
      code: course.code,
      title: course.title,
      credits: course.credits.toString(),
      term: offering.term,
      academicYear: offering.academicYear,
      sectionName: e.section.name,
      departmentCode: course.department.code,
      departmentName: course.department.name,
      teachers: offering.offeringTeachers.map((ot) => ({
        id: ot.user.id,
        name: ot.user.name,
        role: ot.role,
      })),
      materialProgress: {
        completed: prog.completed,
        total: prog.total,
        percentage,
      },
    };
  });
}

/**
 * Returns offerings where the user is an instructor or TA (status DRAFT or PUBLISHED).
 */
export async function getTeacherOfferings(
  userId: string,
  isSuperAdmin: boolean = false
): Promise<TeacherCourseItem[]> {
  const offerings = await prisma.courseOffering.findMany({
    where: {
      status: {
        in: [CourseOfferingStatus.DRAFT, CourseOfferingStatus.PUBLISHED],
      },
      ...(isSuperAdmin
        ? {}
        : {
            offeringTeachers: {
              some: { userId },
            },
          }),
    },
    include: {
      course: {
        include: {
          department: { select: { code: true, name: true } },
        },
      },
      sections: {
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              enrollments: { where: { status: "ACTIVE" } },
            },
          },
        },
      },
      offeringTeachers: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { role: "asc" },
      },
    },
    orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }],
  });

  return offerings.map((off) => {
    const assignedTeacher = off.offeringTeachers.find((t) => t.user.id === userId);
    const myRole = assignedTeacher?.role || (isSuperAdmin ? "INSTRUCTOR" : "INSTRUCTOR");
    const totalStudents = off.sections.reduce(
      (sum, s) => sum + s._count.enrollments,
      0
    );

    return {
      id: off.id,
      code: off.course.code,
      title: off.course.title,
      credits: off.course.credits.toString(),
      term: off.term,
      academicYear: off.academicYear,
      status: off.status,
      departmentCode: off.course.department.code,
      departmentName: off.course.department.name,
      myRole,
      sectionCount: off.sections.length,
      totalStudents,
      teachers: off.offeringTeachers.map((ot) => ({
        id: ot.user.id,
        name: ot.user.name,
        role: ot.role,
      })),
    };
  });
}

/**
 * Loads offering header information for student course workspace after verifying canViewOffering.
 * The query is scoped strictly to published offerings where the student has an active enrollment.
 */
export async function getStudentWorkspaceData(
  userId: string,
  role: Role,
  offeringId: string
): Promise<WorkspaceHeaderData> {
  // First assert object-level access
  await assertCanViewOffering({ id: userId, role }, offeringId);

  // Scoped database query: enforces publication and active enrollment
  const offering = await prisma.courseOffering.findFirst({
    where: {
      id: offeringId,
      ...(role === Role.SUPER_ADMIN
        ? {}
        : {
            status: CourseOfferingStatus.PUBLISHED,
            sections: {
              some: {
                enrollments: {
                  some: {
                    studentId: userId,
                    status: "ACTIVE",
                  },
                },
              },
            },
          }),
    },
    include: {
      course: {
        include: {
          department: { select: { code: true, name: true } },
        },
      },
      offeringTeachers: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { role: "asc" },
      },
      sections: {
        where: {
          enrollments: {
            some: {
              studentId: userId,
              status: "ACTIVE",
            },
          },
        },
        select: { name: true },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found or access denied.");
  }

  const sectionName = offering.sections[0]?.name;

  return {
    id: offering.id,
    code: offering.course.code,
    title: offering.course.title,
    credits: offering.course.credits.toString(),
    term: offering.term,
    academicYear: offering.academicYear,
    status: offering.status,
    departmentCode: offering.course.department.code,
    departmentName: offering.course.department.name,
    sectionName,
    teachers: offering.offeringTeachers.map((ot) => ({
      id: ot.user.id,
      name: ot.user.name,
      role: ot.role,
    })),
  };
}

/**
 * Loads offering header information for teacher course workspace after verifying canViewOffering.
 * The query is scoped strictly to offerings where the teacher is assigned (unless SUPER_ADMIN).
 */
export async function getTeacherWorkspaceData(
  userId: string,
  role: Role,
  offeringId: string
): Promise<WorkspaceHeaderData> {
  // First assert object-level access
  await assertCanViewOffering({ id: userId, role }, offeringId);

  // Scoped database query: enforces offering assignment
  const offering = await prisma.courseOffering.findFirst({
    where: {
      id: offeringId,
      ...(role === Role.SUPER_ADMIN
        ? {}
        : role === Role.DEPT_ADMIN
        ? {
            course: {
              department: {
                teacherProfiles: {
                  some: { userId },
                },
              },
            },
          }
        : {
            offeringTeachers: {
              some: { userId },
            },
          }),
    },
    include: {
      course: {
        include: {
          department: { select: { code: true, name: true } },
        },
      },
      offeringTeachers: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { role: "asc" },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found or assignment missing.");
  }

  const assigned = offering.offeringTeachers.find((t) => t.user.id === userId);
  const myRole =
    assigned?.role ||
    (role === Role.DEPT_ADMIN ? "DEPT_ADMIN" : role === Role.SUPER_ADMIN ? "INSTRUCTOR" : undefined);

  return {
    id: offering.id,
    code: offering.course.code,
    title: offering.course.title,
    credits: offering.course.credits.toString(),
    term: offering.term,
    academicYear: offering.academicYear,
    status: offering.status,
    departmentCode: offering.course.department.code,
    departmentName: offering.course.department.name,
    myRole,
    teachers: offering.offeringTeachers.map((ot) => ({
      id: ot.user.id,
      name: ot.user.name,
      role: ot.role,
    })),
  };
}
