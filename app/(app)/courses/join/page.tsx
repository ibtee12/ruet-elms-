import * as React from "react";
import { Metadata } from "next";
import { Role } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/shared/page-header";
import { JoinCourseForm } from "./join-course-form";

export const metadata: Metadata = {
  title: "Join Course by Code | RUET ELMS",
  description: "Enroll in a published course offering using an invitation or join code.",
};

export default async function JoinCoursePage() {
  await requireRole(Role.STUDENT);

  return (
    <div className="max-w-xl mx-auto space-y-6 py-6">
      <PageHeader
        title="Join Course Offering"
        subtitle="Enter the 8-character code provided by your course instructor"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "My Courses", href: "/courses" },
          { label: "Join by Code" },
        ]}
      />

      <JoinCourseForm />
    </div>
  );
}
