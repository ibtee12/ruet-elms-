import { prisma } from "@/lib/prisma";
import { Role, Prisma } from "@prisma/client";
import { ForbiddenError } from "@/lib/auth/errors";

/**
 * All known audit actions across RUET ELMS.
 */
export const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_BY_ADMIN",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_REACTIVATED",
  "USER_DEACTIVATED",
  "CSV_IMPORT",
  "DEPARTMENT_CREATED",
  "DEPARTMENT_UPDATED",
  "DEPARTMENT_DEACTIVATED",
  "DEPARTMENT_DELETED",
  "COURSE_CREATED",
  "COURSE_UPDATED",
  "COURSE_DELETED",
  "OFFERING_CREATED",
  "OFFERING_UPDATED",
  "OFFERING_PUBLISHED",
  "OFFERING_ARCHIVED",
  "OFFERING_DELETED",
  "SECTION_CHANGED",
  "TEACHER_ASSIGNED",
  "TEACHER_REMOVED",
  "JOIN_CODE_GENERATED",
  "JOIN_CODE_DISABLED",
  "MATERIAL_UPLOADED",
  "MATERIAL_DELETED",
  "MATERIAL_PUBLISHED_CHANGED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_UPDATED",
  "ASSIGNMENT_PUBLISHED",
  "ASSIGNMENT_DELETED",
  "DEADLINE_CHANGED",
  "FILE_UPLOADED",
  "FILE_DELETED",
  "SUBMISSION_UPLOADED",
  "SUBMISSION_REOPENED",
  "GRADE_ASSIGNED",
  "GRADE_CHANGED",
  "ENROLLED",
  "DROPPED",
  "BULK_ENROLL",
  "ENROLLMENT_MOVED",
  "JOINED_BY_CODE",
  "ANNOUNCEMENT_CREATED",
  "ANNOUNCEMENT_UPDATED",
  "ANNOUNCEMENT_DELETED",
  "QUIZ_CREATED",
  "QUIZ_PUBLISHED",
  "QUIZ_UPDATED",
  "QUIZ_DELETED",
  "THREAD_LOCKED",
  "THREAD_UNLOCKED",
  "THREAD_PINNED",
  "THREAD_UNPINNED",
  "THREAD_DELETED",
  "POST_DELETED",
] as const;

export const AUDIT_OBJECT_TYPES = [
  "User",
  "Department",
  "Course",
  "CourseOffering",
  "Assignment",
  "AssignmentAttachment",
  "Material",
  "Submission",
  "Grade",
  "Enrollment",
  "Announcement",
  "Quiz",
  "Thread",
  "Post",
  "Setting",
] as const;

/**
 * Formats a given Date object into Asia/Dhaka standard representation (UTC+6).
 */
export function formatDhakaTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Formula Injection sanitizer for CSV export.
 * Neutralizes values beginning with =, +, -, @, \t, \r by prepending a single quote.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // If cell value starts with an executable formula trigger character, prepend a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape any existing double quotes by doubling them
  str = str.replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Resolves the department ID for a user with DEPT_ADMIN or TEACHER role.
 */
export async function getCallerDeptId(userId: string): Promise<string> {
  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId },
    select: { departmentId: true },
  });
  if (teacher?.departmentId) return teacher.departmentId;

  const student = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { departmentId: true },
  });
  if (student?.departmentId) return student.departmentId;

  throw new ForbiddenError("User is not associated with any department.");
}

/**
 * Constructs the department-scoped Prisma WHERE clause.
 * Ensures a DEPT_ADMIN only views logs for users and objects in their department.
 */
export async function buildDeptScopedWhereConditions(
  departmentId: string
): Promise<Prisma.AuditLogWhereInput[]> {
  // 1. Gather all users belonging to this department (students & teachers)
  const deptUsers = await prisma.user.findMany({
    where: {
      OR: [
        { studentProfile: { departmentId } },
        { teacherProfile: { departmentId } },
      ],
    },
    select: { id: true },
  });
  const deptUserIds = deptUsers.map((u) => u.id);

  // 2. Gather all catalog courses in this department
  const deptCourses = await prisma.course.findMany({
    where: { departmentId },
    select: { id: true },
  });
  const deptCourseIds = deptCourses.map((c) => c.id);

  // 3. Gather offerings belonging to these courses
  const deptOfferings = deptCourseIds.length
    ? await prisma.courseOffering.findMany({
        where: { courseId: { in: deptCourseIds } },
        select: { id: true },
      })
    : [];
  const deptOfferingIds = deptOfferings.map((o) => o.id);

  // 4. Gather child objects inside these offerings
  let deptAssignmentIds: string[] = [];
  let deptQuizIds: string[] = [];
  let deptMaterialIds: string[] = [];
  let deptEnrollmentIds: string[] = [];
  let deptThreadIds: string[] = [];
  let deptAnnouncementIds: string[] = [];

  if (deptOfferingIds.length > 0) {
    const [assignments, quizzes, materials, enrollments, threads, announcements] =
      await Promise.all([
        prisma.assignment.findMany({
          where: { offeringId: { in: deptOfferingIds } },
          select: { id: true },
        }),
        prisma.quiz.findMany({
          where: { offeringId: { in: deptOfferingIds } },
          select: { id: true },
        }),
        prisma.material.findMany({
          where: { module: { offeringId: { in: deptOfferingIds } } },
          select: { id: true },
        }),
        prisma.enrollment.findMany({
          where: { section: { offeringId: { in: deptOfferingIds } } },
          select: { id: true },
        }),
        prisma.thread.findMany({
          where: { offeringId: { in: deptOfferingIds } },
          select: { id: true },
        }),
        prisma.announcement.findMany({
          where: {
            OR: [
              { departmentId },
              { offeringId: { in: deptOfferingIds } },
            ],
          },
          select: { id: true },
        }),
      ]);

    deptAssignmentIds = assignments.map((a) => a.id);
    deptQuizIds = quizzes.map((q) => q.id);
    deptMaterialIds = materials.map((m) => m.id);
    deptEnrollmentIds = enrollments.map((e) => e.id);
    deptThreadIds = threads.map((t) => t.id);
    deptAnnouncementIds = announcements.map((an) => an.id);
  } else {
    // Only department-level announcements if no offerings exist yet
    const announcements = await prisma.announcement.findMany({
      where: { departmentId },
      select: { id: true },
    });
    deptAnnouncementIds = announcements.map((a) => a.id);
  }

  // 5. Gather submissions and grades for department assignments
  let deptSubmissionIds: string[] = [];
  let deptGradeIds: string[] = [];
  if (deptAssignmentIds.length > 0) {
    const submissions = await prisma.submission.findMany({
      where: { assignmentId: { in: deptAssignmentIds } },
      select: { id: true },
    });
    deptSubmissionIds = submissions.map((s) => s.id);

    if (deptSubmissionIds.length > 0) {
      const grades = await prisma.grade.findMany({
        where: { submissionId: { in: deptSubmissionIds } },
        select: { id: true },
      });
      deptGradeIds = grades.map((g) => g.id);
    }
  }

  const deptOrConditions: Prisma.AuditLogWhereInput[] = [
    // Condition A: Action performed by a user in the department
    {
      user: {
        OR: [
          { studentProfile: { departmentId } },
          { teacherProfile: { departmentId } },
        ],
      },
    },
    // Condition B: Action targeting the Department object
    { objectType: "Department", objectId: departmentId },
    // Condition C: Target object is a User in the department
    ...(deptUserIds.length ? [{ objectType: "User", objectId: { in: deptUserIds } }] : []),
    // Condition D: Target object is a Course in the department
    ...(deptCourseIds.length ? [{ objectType: "Course", objectId: { in: deptCourseIds } }] : []),
    // Condition E: Target object is an Offering in the department
    ...(deptOfferingIds.length ? [{ objectType: "CourseOffering", objectId: { in: deptOfferingIds } }] : []),
    // Condition F: Target object is an Assignment in the department
    ...(deptAssignmentIds.length ? [{ objectType: "Assignment", objectId: { in: deptAssignmentIds } }] : []),
    // Condition G: Target object is a Quiz in the department
    ...(deptQuizIds.length ? [{ objectType: "Quiz", objectId: { in: deptQuizIds } }] : []),
    // Condition H: Target object is a Material in the department
    ...(deptMaterialIds.length ? [{ objectType: "Material", objectId: { in: deptMaterialIds } }] : []),
    // Condition I: Target object is an Enrollment in the department
    ...(deptEnrollmentIds.length ? [{ objectType: "Enrollment", objectId: { in: deptEnrollmentIds } }] : []),
    // Condition J: Target object is an Announcement in the department
    ...(deptAnnouncementIds.length ? [{ objectType: "Announcement", objectId: { in: deptAnnouncementIds } }] : []),
    // Condition K: Target object is a Thread in the department
    ...(deptThreadIds.length ? [{ objectType: "Thread", objectId: { in: deptThreadIds } }] : []),
    // Condition L: Target object is a Submission in the department
    ...(deptSubmissionIds.length ? [{ objectType: "Submission", objectId: { in: deptSubmissionIds } }] : []),
    // Condition M: Target object is a Grade in the department
    ...(deptGradeIds.length ? [{ objectType: "Grade", objectId: { in: deptGradeIds } }] : []),
  ];

  return deptOrConditions;
}

export interface GetAuditLogsParams {
  caller: { id: string; role: Role };
  departmentId?: string; // SUPER_ADMIN can optionally filter by dept; DEPT_ADMIN is locked to theirs
  userId?: string;
  actions?: string[];
  objectType?: string;
  objectIdSearch?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogRow {
  id: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  userRole: string;
  action: string;
  objectType: string;
  objectId: string;
  description: string | null;
  ip: string | null;
  createdAt: Date;
  formattedTimeDhaka: string;
}

export interface GetAuditLogsResult {
  logs: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  departmentScope?: {
    id: string;
    code: string;
    name: string;
  };
}

/**
 * Query audit logs with role scoping, server-side pagination, and comprehensive filters.
 */
export async function getAuditLogs(
  params: GetAuditLogsParams
): Promise<GetAuditLogsResult> {
  const { caller } = params;
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 50));
  const skip = (page - 1) * pageSize;

  let activeDepartmentId: string | undefined = undefined;
  let departmentScopeInfo: { id: string; code: string; name: string } | undefined = undefined;

  // Authorization and department scoping
  if (caller.role === Role.DEPT_ADMIN) {
    activeDepartmentId = await getCallerDeptId(caller.id);
  } else if (caller.role === Role.SUPER_ADMIN) {
    if (params.departmentId && params.departmentId !== "ALL") {
      activeDepartmentId = params.departmentId;
    }
  } else {
    throw new ForbiddenError("Only Administrators can view audit logs.");
  }

  if (activeDepartmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: activeDepartmentId },
      select: { id: true, code: true, name: true },
    });
    if (dept) {
      departmentScopeInfo = dept;
    }
  }

  const andConditions: Prisma.AuditLogWhereInput[] = [];

  // Apply department scoping if active
  if (activeDepartmentId) {
    const deptOrConditions = await buildDeptScopedWhereConditions(activeDepartmentId);
    andConditions.push({ OR: deptOrConditions });
  }

  // Filter: user
  if (params.userId && params.userId !== "ALL") {
    andConditions.push({ userId: params.userId });
  }

  // Filter: action (multi-select)
  if (params.actions && params.actions.length > 0) {
    andConditions.push({ action: { in: params.actions } });
  }

  // Filter: objectType
  if (params.objectType && params.objectType !== "ALL") {
    andConditions.push({ objectType: params.objectType });
  }

  // Filter: search by objectId
  if (params.objectIdSearch && params.objectIdSearch.trim() !== "") {
    andConditions.push({
      objectId: {
        contains: params.objectIdSearch.trim(),
        mode: "insensitive",
      },
    });
  }

  // Filter: date range
  if (params.startDate || params.endDate) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (params.startDate) {
      const start = new Date(params.startDate);
      if (!isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        dateFilter.gte = start;
      }
    }
    if (params.endDate) {
      const end = new Date(params.endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
    }
    andConditions.push({ createdAt: dateFilter });
  }

  const where: Prisma.AuditLogWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  // Execute count and paginated query in a transaction
  const [total, rawLogs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),
  ]);

  const logs: AuditLogRow[] = rawLogs.map((log) => ({
    id: log.id,
    userId: log.userId,
    userName: log.user?.name || "System / Unauthenticated",
    userEmail: log.user?.email || "N/A",
    userRole: log.user?.role || "SYSTEM",
    action: log.action,
    objectType: log.objectType,
    objectId: log.objectId,
    description: log.description,
    ip: log.ip,
    createdAt: log.createdAt,
    formattedTimeDhaka: formatDhakaTime(log.createdAt),
  }));

  return {
    logs,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    departmentScope: departmentScopeInfo,
  };
}

export interface ExportAuditLogsCsvParams extends Omit<GetAuditLogsParams, "page" | "pageSize"> {
  maxRows?: number; // Capped max rows for export
}

/**
 * Exports audit logs matching filters into a CSV string safe from formula injection.
 */
export async function exportAuditLogsCsv(
  params: ExportAuditLogsCsvParams
): Promise<{ csvContent: string; rowCount: number }> {
  const maxRows = Math.min(5000, Math.max(1, params.maxRows || 2000));

  // Retrieve up to maxRows records
  const result = await getAuditLogs({
    ...params,
    page: 1,
    pageSize: maxRows,
  });

  const headers = [
    "Log ID",
    "Time (Asia/Dhaka)",
    "Time (UTC ISO)",
    "User Name",
    "User Email",
    "User Role",
    "Action",
    "Object Type",
    "Object ID",
    "Description",
    "IP Address",
  ];

  const rows: string[] = [];
  rows.push(headers.map(sanitizeCsvCell).join(","));

  for (const log of result.logs) {
    const row = [
      log.id,
      log.formattedTimeDhaka,
      log.createdAt.toISOString(),
      log.userName,
      log.userEmail,
      log.userRole,
      log.action,
      log.objectType,
      log.objectId,
      log.description || "",
      log.ip || "",
    ];
    rows.push(row.map(sanitizeCsvCell).join(","));
  }

  // Prepend UTF-8 BOM (\uFEFF) so Excel opens UTF-8 properly
  const csvContent = "\uFEFF" + rows.join("\r\n");

  return {
    csvContent,
    rowCount: result.logs.length,
  };
}
