import * as React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { KeyRound, AlertTriangle } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LogoutButton } from "@/components/shared/logout-button";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/change-password");
  }

  // Fetch fresh user profile details from DB
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      mustChangePassword: true,
      studentProfile: {
        select: { studentId: true },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const isForced = user.mustChangePassword;

  return (
    <main className="min-h-screen flex flex-col justify-between p-6 sm:p-10 bg-background text-foreground">
      {/* Top Header */}
      <header className="flex items-center justify-between w-full max-w-xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-10 shrink-0">
            <Image
              src="/images/ruet-logo.webp"
              alt="RUET Logo"
              fill
              className="object-contain"
            />
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-primary font-semibold block leading-tight">
              Rajshahi University of Eng. & Tech.
            </span>
            <span className="text-base font-bold text-foreground block">
              RUET ELMS
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      {/* Main card */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div className="p-8 rounded-2xl border border-border bg-surface shadow-sm text-left">
          {/* Header */}
          <div className="mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <KeyRound className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
              {isForced ? "Password Change Required" : "Change Your Password"}
            </h1>
            <p className="text-xs text-muted">
              {isForced
                ? "Your account was provisioned with a temporary password. You must set a new personal password before accessing the system."
                : "Update your password to keep your academic account secure."}
            </p>
          </div>

          {/* Forced Warning Callout */}
          {isForced && (
            <div
              role="alert"
              className="mb-6 p-3.5 rounded-xl border border-warning/40 bg-warning/10 text-foreground flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                <strong>Mandatory Security Policy:</strong> Access to course modules, submissions, and departmental pages is locked until you complete this step.
              </p>
            </div>
          )}

          <ChangePasswordForm
            isForced={isForced}
            context={{
              email: user.email,
              studentId: user.studentProfile?.studentId || null,
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-md mx-auto text-center text-xs text-muted pt-6">
        <p>© {new Date().getFullYear()} Rajshahi University of Engineering &amp; Technology</p>
      </footer>
    </main>
  );
}
