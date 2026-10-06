import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { GraduationCap, LogIn, CheckCircle2, ShieldCheck, User } from "lucide-react";
import { LogoutButton } from "@/components/shared/logout-button";
import { ThemeToggle } from "@/components/shared/theme-toggle";

import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground">
      <div className="absolute top-6 right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg p-8 rounded-2xl border border-border bg-surface shadow-sm flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
          <GraduationCap className="w-9 h-9" />
        </div>

        <span className="text-xs uppercase tracking-widest text-primary font-semibold block mb-1">
          Rajshahi University of Eng. & Tech.
        </span>
        <h1 className="text-2xl font-bold tracking-tight mb-2">RUET ELMS</h1>
        <p className="text-sm text-muted mb-6">
          Centralized Learning Management System • Even Term 2026
        </p>

        {session?.user ? (
          <div className="w-full rounded-xl border border-border bg-surface-muted p-5 text-left mb-6 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {session.user.name}
                  </p>
                  <p className="text-xs text-muted font-mono">
                    {session.user.email}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                {session.user.role}
              </span>
            </div>

            <div className="text-xs space-y-1.5 font-mono text-muted">
              <div className="flex justify-between">
                <span>User ID:</span>
                <span className="text-foreground">{session.user.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Must Change Password:</span>
                <span
                  className={
                    session.user.mustChangePassword
                      ? "text-warning font-semibold"
                      : "text-success font-semibold"
                  }
                >
                  {session.user.mustChangePassword ? "YES" : "NO"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Session Duration:</span>
                <span className="text-foreground">8 Hours (JWT)</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <LogoutButton />
            </div>
          </div>
        ) : (
          <div className="w-full space-y-4 mb-6">
            <div className="p-4 rounded-xl border border-border bg-surface-muted/50 text-xs text-muted text-left space-y-1">
              <div className="flex items-center gap-1.5 text-foreground font-medium mb-1">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <span>NextAuth Credentials Provider Ready</span>
              </div>
              <p>• 8h JWT session tokens with httpOnly, secure cookies</p>
              <p>• Rate limited (max 5 failed attempts per 15-minute window)</p>
              <p>• AuditLog records LOGIN_SUCCESS, LOGIN_FAILED, and LOGOUT</p>
            </div>

            <Link
              href="/login"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-xs transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Go to Sign In Page</span>
            </Link>
          </div>
        )}

        <div className="flex items-center gap-4 pt-4 border-t border-border w-full text-xs text-muted justify-between">
          <div className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Step 7 Active</span>
          </div>
          <Link
            href="/dev/components"
            className="hover:text-primary transition-colors font-medium"
          >
            Design Showcase →
          </Link>
        </div>
      </div>
    </main>
  );
}
