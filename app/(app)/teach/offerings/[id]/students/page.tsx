import * as React from "react";
import { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { assertRosterAccess } from "@/lib/auth/guards";
import { getRosterAction } from "@/actions/enrollment";
import { PageHeader } from "@/components/shared/page-header";
import { OfferingRosterManager } from "@/components/enrollment/offering-roster-manager";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const metadata: Metadata = {
  title: "Course Students Roster | RUET ELMS",
  description: "View and manage enrolled students for this course offering.",
};

export default async function TeacherOfferingStudentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const { id } = await params;

  // Object-level authorization check: throws ForbiddenError if teacher is not assigned to this offering!
  const access = await assertRosterAccess(caller, id);

  const [offering, roster] = await Promise.all([
    prisma.courseOffering.findUniqueOrThrow({
      where: { id },
      include: {
        course: {
          include: {
            department: { select: { code: true, name: true } },
          },
        },
      },
    }),
    getRosterAction(id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/teach/offerings"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to My Offerings</span>
        </Link>
      </div>

      <PageHeader
        title={`${offering.course.code}: ${offering.course.title}`}
        subtitle={`Student Enrollment Roster • ${offering.term} ${offering.academicYear} • Dept. of ${offering.course.department.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "My Offerings", href: "/teach/offerings" },
          { label: offering.course.code, href: `/teach/offerings/${offering.id}/students` },
          { label: "Students" },
        ]}
      />

      {access.status === "ARCHIVED" && (
        <div className="p-4 rounded-xl border border-warning/30 bg-warning/10 text-foreground flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <div className="text-xs">
            <span className="font-bold block">Course Offering Archived</span>
            <span>
              This offering is archived. Enrollment modifications are permanently locked.
            </span>
          </div>
        </div>
      )}

      {!access.canManage && access.status !== "ARCHIVED" && (
        <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 text-foreground text-xs flex items-center gap-2.5">
          <span className="font-semibold text-primary">Teaching Assistant Access:</span>
          <span className="text-muted">
            You have read-only access to the student roster. Only course instructors may modify enrollments.
          </span>
        </div>
      )}

      <OfferingRosterManager
        offeringId={offering.id}
        initialData={roster}
        canManage={roster.canManage}
      />
    </div>
  );
}
