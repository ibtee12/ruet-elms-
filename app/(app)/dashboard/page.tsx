import * as React from "react";
import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { StudentDashboardView } from "@/components/dashboard/student-dashboard-view";
import { TeacherDashboardView } from "@/components/dashboard/teacher-dashboard-view";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: {
      studentProfile: {
        include: { department: true },
      },
      teacherProfile: {
        include: { department: true },
      },
    },
  });

  if (user.role === Role.STUDENT) {
    return (
      <StudentDashboardView
        studentId={user.id}
        studentName={user.name}
        departmentName={user.studentProfile?.department.name || "Engineering"}
        batch={user.studentProfile?.batch || null}
        level={user.studentProfile?.level || null}
        term={user.studentProfile?.term || null}
      />
    );
  }

  if (user.role === Role.TEACHER) {
    return (
      <TeacherDashboardView
        teacherId={user.id}
        teacherName={user.name}
        designation={user.teacherProfile?.designation || "Faculty Member"}
        departmentName={user.teacherProfile?.department.name || "Engineering"}
      />
    );
  }

  if (user.role === Role.DEPT_ADMIN) {
    redirect("/dept");
  }

  if (user.role === Role.SUPER_ADMIN) {
    redirect("/admin");
  }

  return null;
}
