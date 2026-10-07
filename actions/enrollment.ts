"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Prisma, Role, EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/lib/auth/errors";
import { assertOfferingWritable, assertRosterAccess } from "@/lib/auth/guards";
import { getClientIp } from "@/lib/utils/ip";
import {
  joinCodeIpRateLimiter,
  joinCodeUserRateLimiter,
} from "@/lib/rate-limiter";
import {
  classifyEnrollEntries,
  isWellFormedJoinCode,
  normalizeJoinCode,
  parseEnrollInput,
  summarizeClassified,
  type ClassifiedEnrollRow,
  type ExistingEnrollmentLookup,
  type StudentLookup,
} from "@/lib/enrollment/roster-import";
import {
  bulkEnrollInputSchema,
  enrollmentIdParamSchema,
  joinCodeSchema,
  moveEnrollmentsSchema,
  offeringIdParamSchema,
  singleEnrollSchema,
} from "@/lib/validations/enrollment";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

export type ActionFailure = { success: false; error: string; code?: string };

/** Generic, deliberately vague message for any bad/unknown/unpublished join code. */
const GENERIC_JOIN_ERROR = "That join code is not valid. Check the code and try again.";

const DUPLICATE_ENROLL_MESSAGE =
  "This student is already enrolled in this offering. Refresh the roster and try again.";

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Maps thrown errors to a friendly action result; unknown errors are logged, not leaked. */
function toFailure(e: unknown): ActionFailure {
  if (isUniqueViolation(e)) {
    return { success: false, error: DUPLICATE_ENROLL_MESSAGE, code: "DUPLICATE" };
  }
  if (e instanceof z.ZodError) {
    return {
      success: false,
      error: e.issues[0]?.message || "Validation failed.",
      code: "VALIDATION_ERROR",
    };
  }
  if (e instanceof AppError) {
    return { success: false, error: e.message, code: e.code };
  }
  console.error("[enrollment] unexpected error:", e);
  return { success: false, error: "Something went wrong. Please try again." };
}

async function clientIp() {
  return getClientIp(await headers());
}

function revalidateRoster(offeringId: string) {
  revalidatePath(`/dept/offerings/${offeringId}`);
  revalidatePath(`/teach/offerings/${offeringId}/students`);
  revalidatePath("/teach/offerings");
}

/* -------------------------------------------------------------------------- */
/* Roster (read)                                                              */
/* -------------------------------------------------------------------------- */

export interface RosterStudentRow {
  enrollmentId: string;
  userId: string;
  name: string;
  email: string;
  studentId: string | null;
  batch: string | null;
  sectionId: string;
  sectionName: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  lastActiveAt: string | null;
}

export interface RosterData {
  offeringId: string;
  offeringStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  /** Caller may add/drop/move (false for TAs and for ARCHIVED offerings). */
  canManage: boolean;
  sections: Array<{ id: string; name: string; activeCount: number }>;
  students: RosterStudentRow[];
}

/**
 * Returns the roster for an offering. Throws Forbidden/NotFound for unauthorized callers
 * (pages render the error boundary / forbidden state).
 *
 * A student may have several Enrollment rows in one offering over time (e.g. dropped from
 * Section A, later enrolled in Section B). The roster shows one row per student: the ACTIVE
 * one if any, otherwise the most recent DROPPED one.
 */
export async function getRosterAction(offeringId: string): Promise<RosterData> {
  const validOfferingId = offeringIdParamSchema.parse(offeringId);
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN, Role.TEACHER);
  const access = await assertRosterAccess(caller, validOfferingId);

  const sections = await prisma.section.findMany({
    where: { offeringId: validOfferingId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      enrollments: {
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          updatedAt: true,
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              lastActiveAt: true,
              studentProfile: { select: { studentId: true, batch: true } },
            },
          },
        },
      },
    },
  });

  type Candidate = RosterStudentRow & { _updatedAt: number };
  const byStudent = new Map<string, Candidate>();

  for (const section of sections) {
    for (const e of section.enrollments) {
      const candidate: Candidate = {
        enrollmentId: e.id,
        userId: e.student.id,
        name: e.student.name,
        email: e.student.email,
        studentId: e.student.studentProfile?.studentId ?? null,
        batch: e.student.studentProfile?.batch ?? null,
        sectionId: section.id,
        sectionName: section.name,
        status: e.status,
        enrolledAt: e.enrolledAt.toISOString(),
        lastActiveAt: e.student.lastActiveAt?.toISOString() ?? null,
        _updatedAt: e.updatedAt.getTime(),
      };
      const current = byStudent.get(e.student.id);
      const better =
        !current ||
        (candidate.status === "ACTIVE" && current.status !== "ACTIVE") ||
        (candidate.status === current.status && candidate._updatedAt > current._updatedAt);
      if (better) byStudent.set(e.student.id, candidate);
    }
  }

  const students = [...byStudent.values()]
    .map((c): RosterStudentRow => {
      const row: Partial<Candidate> = { ...c };
      delete row._updatedAt;
      return row as RosterStudentRow;
    })
    .sort((a, b) =>
      (a.studentId ?? a.name).localeCompare(b.studentId ?? b.name, undefined, {
        numeric: true,
      })
    );

  return {
    offeringId,
    offeringStatus: access.status,
    canManage: access.canManage && access.status !== "ARCHIVED",
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      activeCount: students.filter((st) => st.sectionId === s.id && st.status === "ACTIVE")
        .length,
    })),
    students,
  };
}

/* -------------------------------------------------------------------------- */
/* Bulk add: preview + confirm                                                */
/* -------------------------------------------------------------------------- */

export interface EnrollPreviewResult {
  success: true;
  rows: ClassifiedEnrollRow[];
  summary: ReturnType<typeof summarizeClassified>;
}

/** Builds the classified preview from DB state. Shared by preview and confirm. */
async function buildEnrollPreview(
  offeringId: string,
  rawInput: string,
  defaultSectionId: string
): Promise<{ rows: ClassifiedEnrollRow[] }> {
  const parsed = parseEnrollInput(rawInput);
  if (parsed.errors.length > 0) {
    throw new ValidationError(parsed.errors.join(" "));
  }

  const sections = await prisma.section.findMany({
    where: { offeringId },
    select: { id: true, name: true },
  });
  const defaultSection = sections.find((s) => s.id === defaultSectionId);
  if (!defaultSection) {
    throw new ValidationError("Choose a section that belongs to this offering.");
  }

  const ids = [...new Set(parsed.entries.map((e) => e.studentId.trim()).filter(Boolean))];

  const profiles = await prisma.studentProfile.findMany({
    where: { studentId: { in: ids }, user: { role: Role.STUDENT } },
    select: {
      studentId: true,
      user: { select: { id: true, name: true, isActive: true } },
    },
  });

  const studentsById = new Map<string, StudentLookup>(
    profiles.map((p) => [
      p.studentId,
      { userId: p.user.id, name: p.user.name, studentId: p.studentId, isActive: p.user.isActive },
    ])
  );

  const userIds = profiles.map((p) => p.user.id);
  const existing = await prisma.enrollment.findMany({
    where: { studentId: { in: userIds }, section: { offeringId } },
    select: {
      id: true,
      studentId: true,
      status: true,
      sectionId: true,
      section: { select: { name: true } },
    },
  });

  const enrollmentsByUserId = new Map<string, ExistingEnrollmentLookup>();
  for (const e of existing) {
    const prev = enrollmentsByUserId.get(e.studentId);
    if (!prev || (e.status === "ACTIVE" && prev.status !== "ACTIVE")) {
      enrollmentsByUserId.set(e.studentId, {
        enrollmentId: e.id,
        sectionId: e.sectionId,
        sectionName: e.section.name,
        status: e.status,
      });
    }
  }

  const rows = classifyEnrollEntries(parsed.entries, {
    studentsById,
    enrollmentsByUserId,
    sectionsByName: new Map(sections.map((s) => [s.name.toLowerCase(), s])),
    defaultSection,
  });

  return { rows };
}

/** Step 1 of bulk add: classify pasted IDs / CSV rows without writing anything. */
export async function previewEnrollmentAction(
  offeringId: string,
  rawInput: string,
  defaultSectionId: string
): Promise<EnrollPreviewResult | ActionFailure> {
  try {
    const validated = bulkEnrollInputSchema.parse({
      offeringId,
      rawInput,
      defaultSectionId,
    });
    const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN, Role.TEACHER);
    await assertRosterAccess(caller, validated.offeringId, { manage: true });
    await assertOfferingWritable(validated.offeringId);

    const { rows } = await buildEnrollPreview(
      validated.offeringId,
      validated.rawInput,
      validated.defaultSectionId
    );
    return { success: true, rows, summary: summarizeClassified(rows) };
  } catch (e) {
    return toFailure(e);
  }
}

/**
 * Step 2 of bulk add: re-runs classification server-side (never trusts the client preview)
 * and enrolls every READY / REENROLL row in a single transaction. Rows that are not found,
 * invalid, or already enrolled are skipped and reported.
 */
export async function confirmEnrollmentAction(
  offeringId: string,
  rawInput: string,
  defaultSectionId: string
): Promise<
  | {
      success: true;
      enrolled: number;
      reenrolled: number;
      skipped: number;
      summary: ReturnType<typeof summarizeClassified>;
    }
  | ActionFailure
> {
  try {
    const validated = bulkEnrollInputSchema.parse({
      offeringId,
      rawInput,
      defaultSectionId,
    });
    const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN, Role.TEACHER);
    await assertRosterAccess(caller, validated.offeringId, { manage: true });
    await assertOfferingWritable(validated.offeringId);

    const { rows } = await buildEnrollPreview(
      validated.offeringId,
      validated.rawInput,
      validated.defaultSectionId
    );
    const summary = summarizeClassified(rows);
    const actionable = rows.filter(
      (r) => (r.status === "READY" || r.status === "REENROLL") && r.userId && r.sectionId
    );

    if (actionable.length === 0) {
      return {
        success: false,
        error: "There are no students to enroll. Every row is not found, invalid, or already enrolled.",
        code: "NOTHING_TO_ENROLL",
      };
    }

    const ip = await clientIp();
    const now = new Date();

    const result = await prisma.$transaction(
      async (tx) => {
        const userIds = actionable.map((r) => r.userId!);
        const current = await tx.enrollment.findMany({
          where: { studentId: { in: userIds }, section: { offeringId } },
          select: { id: true, studentId: true, sectionId: true, status: true },
        });

        // Race guard: someone enrolled one of these students since the preview was built.
        if (current.some((c) => c.status === "ACTIVE")) {
          throw new ConflictError(
            "Some of these students were enrolled by someone else in the meantime. Run the preview again."
          );
        }

        const reactivateIds: string[] = [];
        const toCreate: Array<{ studentId: string; sectionId: string }> = [];
        for (const row of actionable) {
          const existingInTarget = current.find(
            (c) => c.studentId === row.userId && c.sectionId === row.sectionId
          );
          if (existingInTarget) reactivateIds.push(existingInTarget.id);
          else toCreate.push({ studentId: row.userId!, sectionId: row.sectionId! });
        }

        if (reactivateIds.length) {
          await tx.enrollment.updateMany({
            where: { id: { in: reactivateIds } },
            data: { status: EnrollmentStatus.ACTIVE, enrolledAt: now },
          });
        }
        if (toCreate.length) {
          // No skipDuplicates: a concurrent duplicate must fail on the (studentId, sectionId)
          // unique constraint and roll the whole batch back.
          await tx.enrollment.createMany({ data: toCreate });
        }

        const enrolled = actionable.filter((r) => r.status === "READY").length;
        const reenrolled = actionable.length - enrolled;
        const skipped = rows.length - actionable.length;

        await tx.auditLog.create({
          data: {
            action: actionable.length === 1 ? "ENROLLED" : "BULK_ENROLL",
            objectType: "CourseOffering",
            objectId: offeringId,
            userId: caller.id,
            description:
              actionable.length === 1
                ? `Enrolled student ${actionable[0].studentId} in ${actionable[0].sectionName}`
                : `Bulk enroll: ${enrolled} enrolled, ${reenrolled} re-enrolled, ${skipped} skipped (${rows.length} rows)`,
            ip,
          },
        });

        return { enrolled, reenrolled, skipped };
      },
      { timeout: 30_000 }
    );

    revalidateRoster(offeringId);
    return { success: true, ...result, summary };
  } catch (e) {
    return toFailure(e);
  }
}

/* -------------------------------------------------------------------------- */
/* Single enroll / drop / re-enroll                                           */
/* -------------------------------------------------------------------------- */

/**
 * Enrolls one student (by user id) into a section. Relies on the DB unique constraint
 * (studentId, sectionId) as the final guard against duplicates; violations are mapped to a
 * friendly message.
 */
export async function enrollStudentAction(
  offeringId: string,
  studentUserId: string,
  sectionId: string
): Promise<{ success: true; enrollmentId: string } | ActionFailure> {
  try {
    const validated = singleEnrollSchema.parse({
      offeringId,
      studentUserId,
      sectionId,
    });
    const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN, Role.TEACHER);
    await assertRosterAccess(caller, validated.offeringId, { manage: true });
    await assertOfferingWritable(validated.offeringId);

    const section = await prisma.section.findFirst({
      where: { id: validated.sectionId, offeringId: validated.offeringId },
    });
    if (!section) throw new ValidationError("Choose a section that belongs to this offering.");

    const student = await prisma.user.findFirst({
      where: { id: validated.studentUserId, role: Role.STUDENT },
      select: { id: true, isActive: true },
    });
    if (!student) throw new NotFoundError("Student not found.");
    if (!student.isActive) throw new ValidationError("Student account is deactivated.");

    const active = await prisma.enrollment.findFirst({
      where: { studentId: validated.studentUserId, status: "ACTIVE", section: { offeringId: validated.offeringId } },
      select: { section: { select: { name: true } } },
    });
    if (active) {
      return {
        success: false,
        error: `This student is already enrolled in ${active.section.name}.`,
        code: "DUPLICATE",
      };
    }

    const ip = await clientIp();
    const enrollment = await prisma.$transaction(async (tx) => {
      const dropped = await tx.enrollment.findUnique({
        where: { studentId_sectionId: { studentId: validated.studentUserId, sectionId: validated.sectionId } },
      });
      const row = dropped
        ? await tx.enrollment.update({
            where: { id: dropped.id },
            data: { status: EnrollmentStatus.ACTIVE, enrolledAt: new Date() },
          })
        : await tx.enrollment.create({ data: { studentId: validated.studentUserId, sectionId: validated.sectionId } });

      await tx.auditLog.create({
        data: {
          action: "ENROLLED",
          objectType: "Enrollment",
          objectId: row.id,
          userId: caller.id,
          description: `${dropped ? "Re-enrolled" : "Enrolled"} student in ${section.name}`,
          ip,
        },
      });
      return row;
    });

    revalidateRoster(validated.offeringId);
    return { success: true, enrollmentId: enrollment.id };
  } catch (e) {
    return toFailure(e);
  }
}

async function loadEnrollmentForWrite(enrollmentId: string) {
  const validId = enrollmentIdParamSchema.parse(enrollmentId);
  const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN, Role.TEACHER);
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: validId },
    select: {
      id: true,
      status: true,
      studentId: true,
      sectionId: true,
      section: { select: { name: true, offeringId: true } },
    },
  });
  if (!enrollment) throw new NotFoundError("Enrollment not found.");

  const offeringId = enrollment.section.offeringId;
  await assertRosterAccess(caller, offeringId, { manage: true });
  await assertOfferingWritable(offeringId);
  return { caller, enrollment, offeringId };
}

/**
 * Drops a student: status -> DROPPED. The row is never deleted, so submissions, grades,
 * and quiz attempts (all keyed by student, not by enrollment) survive. Access is lost
 * immediately because every student guard requires an ACTIVE enrollment.
 */
export async function dropEnrollmentAction(
  enrollmentId: string
): Promise<{ success: true } | ActionFailure> {
  try {
    const { caller, enrollment, offeringId } = await loadEnrollmentForWrite(enrollmentId);
    if (enrollment.status === "DROPPED") {
      return { success: false, error: "This student has already been dropped.", code: "NOOP" };
    }

    const ip = await clientIp();
    await prisma.$transaction([
      prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: EnrollmentStatus.DROPPED },
      }),
      prisma.auditLog.create({
        data: {
          action: "DROPPED",
          objectType: "Enrollment",
          objectId: enrollment.id,
          userId: caller.id,
          description: `Dropped student from ${enrollment.section.name}`,
          ip,
        },
      }),
    ]);

    revalidateRoster(offeringId);
    return { success: true };
  } catch (e) {
    return toFailure(e);
  }
}

/** Re-activates a DROPPED enrollment (same section). */
export async function reenrollAction(
  enrollmentId: string
): Promise<{ success: true } | ActionFailure> {
  try {
    const { caller, enrollment, offeringId } = await loadEnrollmentForWrite(enrollmentId);
    if (enrollment.status === "ACTIVE") {
      return { success: false, error: "This student is already enrolled.", code: "NOOP" };
    }

    const activeElsewhere = await prisma.enrollment.findFirst({
      where: {
        studentId: enrollment.studentId,
        status: "ACTIVE",
        section: { offeringId },
      },
      select: { section: { select: { name: true } } },
    });
    if (activeElsewhere) {
      return {
        success: false,
        error: `This student is already enrolled in ${activeElsewhere.section.name}.`,
        code: "DUPLICATE",
      };
    }

    const ip = await clientIp();
    await prisma.$transaction([
      prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: EnrollmentStatus.ACTIVE, enrolledAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          action: "ENROLLED",
          objectType: "Enrollment",
          objectId: enrollment.id,
          userId: caller.id,
          description: `Re-enrolled student in ${enrollment.section.name}`,
          ip,
        },
      }),
    ]);

    revalidateRoster(offeringId);
    return { success: true };
  } catch (e) {
    return toFailure(e);
  }
}

/* -------------------------------------------------------------------------- */
/* Bulk move between sections                                                 */
/* -------------------------------------------------------------------------- */

export async function moveEnrollmentsAction(
  offeringId: string,
  enrollmentIds: string[],
  targetSectionId: string
): Promise<{ success: true; moved: number; unchanged: number } | ActionFailure> {
  try {
    const validated = moveEnrollmentsSchema.parse({
      offeringId,
      enrollmentIds,
      targetSectionId,
    });
    const caller = await requireRole(Role.SUPER_ADMIN, Role.DEPT_ADMIN, Role.TEACHER);
    await assertRosterAccess(caller, validated.offeringId, { manage: true });
    await assertOfferingWritable(validated.offeringId);

    const ids = [...new Set(validated.enrollmentIds)];
    if (ids.length === 0) throw new ValidationError("Select at least one student to move.");

    const target = await prisma.section.findFirst({
      where: { id: validated.targetSectionId, offeringId: validated.offeringId },
      select: { id: true, name: true },
    });
    if (!target) throw new ValidationError("Choose a section that belongs to this offering.");

    const enrollments = await prisma.enrollment.findMany({
      where: { id: { in: ids } },
      select: { id: true, studentId: true, sectionId: true, status: true, section: { select: { offeringId: true } } },
    });

    // Every id must belong to THIS offering (prevents cross-offering tampering via crafted ids).
    if (
      enrollments.length !== ids.length ||
      enrollments.some((e) => e.section.offeringId !== validated.offeringId)
    ) {
      throw new ForbiddenError("One or more selected enrollments do not belong to this offering.");
    }
    if (enrollments.some((e) => e.status !== "ACTIVE")) {
      throw new ValidationError("Only active students can be moved. Re-enroll dropped students first.");
    }

    const toMove = enrollments.filter((e) => e.sectionId !== target.id);
    const unchanged = enrollments.length - toMove.length;
    const ip = await clientIp();

    await prisma.$transaction(
      async (tx) => {
        // Old DROPPED rows of the same students in the target section would collide with
        // the (studentId, sectionId) unique key. Reuse them instead: reactivate the target
        // row and retire the source row as DROPPED, so no enrollment row is ever deleted.
        const stale = await tx.enrollment.findMany({
          where: {
            sectionId: target.id,
            studentId: { in: toMove.map((e) => e.studentId) },
          },
          select: { id: true, studentId: true },
        });
        const staleByStudent = new Map(stale.map((s) => [s.studentId, s.id]));

        const simpleMoves = toMove.filter((e) => !staleByStudent.has(e.studentId));
        const mergeMoves = toMove.filter((e) => staleByStudent.has(e.studentId));

        if (simpleMoves.length) {
          await tx.enrollment.updateMany({
            where: { id: { in: simpleMoves.map((e) => e.id) } },
            data: { sectionId: target.id },
          });
        }
        if (mergeMoves.length) {
          await tx.enrollment.updateMany({
            where: { id: { in: mergeMoves.map((e) => staleByStudent.get(e.studentId)!) } },
            data: { status: EnrollmentStatus.ACTIVE },
          });
          await tx.enrollment.updateMany({
            where: { id: { in: mergeMoves.map((e) => e.id) } },
            data: { status: EnrollmentStatus.DROPPED },
          });
        }

        await tx.auditLog.create({
          data: {
            action: "ENROLLMENT_MOVED",
            objectType: "CourseOffering",
            objectId: validated.offeringId,
            userId: caller.id,
            description: `Moved ${toMove.length} student(s) to ${target.name} (${unchanged} already there)`,
            ip,
          },
        });
      },
      { timeout: 30_000 }
    );

    revalidateRoster(validated.offeringId);
    return { success: true, moved: toMove.length, unchanged };
  } catch (e) {
    return toFailure(e);
  }
}

/* -------------------------------------------------------------------------- */
/* Student join-by-code                                                       */
/* -------------------------------------------------------------------------- */

export async function joinByCodeAction(
  rawCode: string
): Promise<
  | { success: true; offeringId: string; courseCode: string; courseTitle: string; sectionName: string }
  | ActionFailure
> {
  try {
    const caller = await requireRole(Role.STUDENT);
    const ip = await clientIp();
    const userKey = `join:user:${caller.id}`;
    const ipKey = `join:ip:${ip}`;

    const [userStatus, ipStatus] = await Promise.all([
      joinCodeUserRateLimiter.check(userKey),
      joinCodeIpRateLimiter.check(ipKey),
    ]);
    if (!userStatus.allowed || !ipStatus.allowed) {
      const wait = Math.max(userStatus.retryAfterSeconds, ipStatus.retryAfterSeconds);
      const minutes = Math.max(1, Math.ceil(wait / 60));
      return {
        success: false,
        error: `Too many incorrect join codes. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        code: "RATE_LIMITED",
      };
    }

    const fail = async (): Promise<ActionFailure> => {
      await Promise.all([
        joinCodeUserRateLimiter.recordFailure(userKey),
        joinCodeIpRateLimiter.recordFailure(ipKey),
      ]);
      return { success: false, error: GENERIC_JOIN_ERROR, code: "INVALID_CODE" };
    };

    const parsed = joinCodeSchema.safeParse(rawCode);
    if (!parsed.success) return fail();
    const code = normalizeJoinCode(parsed.data);
    if (!isWellFormedJoinCode(code)) return fail();

    const offering = await prisma.courseOffering.findUnique({
      where: { joinCode: code },
      select: {
        id: true,
        status: true,
        joinRequiresDeptMatch: true,
        course: {
          select: {
            code: true,
            title: true,
            departmentId: true,
            department: { select: { code: true } },
          },
        },
        sections: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    });

    // Unknown code, unpublished/archived offering, or no sections: all look identical.
    if (!offering || offering.status !== "PUBLISHED" || offering.sections.length === 0) {
      return fail();
    }

    if (offering.joinRequiresDeptMatch) {
      const profile = await prisma.studentProfile.findUnique({
        where: { userId: caller.id },
        select: { departmentId: true },
      });
      if (profile?.departmentId !== offering.course.departmentId) {
        await Promise.all([
          joinCodeUserRateLimiter.recordFailure(userKey),
          joinCodeIpRateLimiter.recordFailure(ipKey),
        ]);
        return {
          success: false,
          error: `This course only accepts ${offering.course.department.code} students through its join code. Ask your instructor to add you.`,
          code: "DEPT_MISMATCH",
        };
      }
    }

    const existing = await prisma.enrollment.findMany({
      where: { studentId: caller.id, section: { offeringId: offering.id } },
      select: { status: true },
    });
    if (existing.some((e) => e.status === "ACTIVE")) {
      return { success: false, error: "You are already enrolled in this course.", code: "DUPLICATE" };
    }
    if (existing.some((e) => e.status === "DROPPED")) {
      // A drop is a teacher/admin decision; a join code must not silently undo it.
      return {
        success: false,
        error: "You were dropped from this course. Please contact the instructor to be re-enrolled.",
        code: "DROPPED",
      };
    }

    const section = offering.sections[0];
    await prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.create({
        data: { studentId: caller.id, sectionId: section.id },
      });
      await tx.auditLog.create({
        data: {
          action: "JOINED_BY_CODE",
          objectType: "Enrollment",
          objectId: enrollment.id,
          userId: caller.id,
          description: `Joined ${offering.course.code} (${section.name}) by code`,
          ip,
        },
      });
    });

    await joinCodeUserRateLimiter.reset(userKey);

    revalidateRoster(offering.id);
    revalidatePath("/courses");
    return {
      success: true,
      offeringId: offering.id,
      courseCode: offering.course.code,
      courseTitle: offering.course.title,
      sectionName: section.name,
    };
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { success: false, error: "You are already enrolled in this course.", code: "DUPLICATE" };
    }
    return toFailure(e);
  }
}
