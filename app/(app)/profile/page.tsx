import * as React from "react";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { formatDhaka } from "@/lib/datetime";
import {
  Building2,
  GraduationCap,
  KeyRound,
  Award,
} from "lucide-react";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      studentProfile: {
        include: { department: true },
      },
      teacherProfile: {
        include: { department: true },
      },
    },
  });

  const department =
    user.studentProfile?.department || user.teacherProfile?.department;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Institutional Profile"
        subtitle="View your institutional account details and academic credentials"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Profile" }]}
        actions={
          <Link
            href="/change-password"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface hover:bg-surface-muted border border-border text-foreground text-xs font-semibold shadow-xs transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-primary" />
            <span>Change Password</span>
          </Link>
        }
      />

      {/* Main Profile Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Identity Card */}
        <div className="md:col-span-1 p-6 rounded-2xl border border-border bg-surface shadow-xs text-center flex flex-col items-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-2xl mb-4 shadow-inner">
            {user.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>

          <h2 className="text-lg font-bold text-foreground">{user.name}</h2>
          <p className="text-xs text-muted font-mono mb-3">{user.email}</p>

          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20 uppercase tracking-wider">
            {user.role.replace("_", " ")}
          </span>

          <div className="w-full mt-6 pt-6 border-t border-border text-left space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-muted">
              <span>Account Status:</span>
              <span className="text-success font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-success" />
                Active
              </span>
            </div>
            <div className="flex items-center justify-between text-muted">
              <span>Last Active:</span>
              <span className="text-foreground font-mono">
                {user.lastActiveAt
                  ? formatDhaka(user.lastActiveAt)
                  : "Just now"}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Academic & Administrative Details */}
        <div className="md:col-span-2 p-6 rounded-2xl border border-border bg-surface shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-bold text-foreground mb-4 pb-2 border-b border-border flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <span>Departmental Information</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-1">
                <span className="text-muted font-medium block">Department:</span>
                <span className="text-foreground font-semibold text-sm block">
                  {department?.name || "All Departments (Super Admin)"}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-1">
                <span className="text-muted font-medium block">Department Code:</span>
                <span className="text-foreground font-mono font-semibold text-sm block">
                  {department?.code || "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Student Profile Details */}
          {user.studentProfile && (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-4 pb-2 border-b border-border flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" />
                <span>Student Academic Details</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-1">
                  <span className="text-muted font-medium block">Student ID:</span>
                  <span className="text-foreground font-mono font-bold text-sm block">
                    {user.studentProfile.studentId}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-1">
                  <span className="text-muted font-medium block">Batch:</span>
                  <span className="text-foreground font-semibold text-sm block">
                    {user.studentProfile.batch}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-1">
                  <span className="text-muted font-medium block">Level &amp; Term:</span>
                  <span className="text-foreground font-semibold text-sm block">
                    Level {user.studentProfile.level}, Term {user.studentProfile.term}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Teacher Profile Details */}
          {user.teacherProfile && (
            <div>
              <h3 className="text-sm font-bold text-foreground mb-4 pb-2 border-b border-border flex items-center gap-2">
                <Award className="w-4 h-4 text-primary" />
                <span>Faculty Credentials</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-1">
                  <span className="text-muted font-medium block">Employee ID:</span>
                  <span className="text-foreground font-mono font-bold text-sm block">
                    {user.teacherProfile.employeeId}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-surface-muted/60 border border-border space-y-1">
                  <span className="text-muted font-medium block">Designation:</span>
                  <span className="text-foreground font-semibold text-sm block">
                    {user.teacherProfile.designation}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
