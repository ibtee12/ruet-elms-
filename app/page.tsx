import Link from "next/link";
import Image from "next/image";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  BookOpen,
  FileCheck2,
  TrendingUp,
  Clock,
  ArrowRight,
  LogIn,
  CheckCircle2,
  Sparkles,
  Layers,
} from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const CSE_BUILDING_BLUR =
  "data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAADwAQCdASoQAAsAA4BaJZQC7AYwxdOXlgAA/u+FXnI+B7Gn5PqyfBtvXRYGK4VLyEhuzPcwBVpupMPcVSpQK5uC5ih5giLJ3W5idlGkBs9SFUu4ZOEAXFjAAAA=";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#071322] text-[#0F172A] dark:text-[#F8FAFC] transition-colors selection:bg-[#0B7D7C]/20 selection:text-[#0B7D7C]">
      {/* 1. NAVIGATION BAR */}
      <header className="sticky top-0 z-40 w-full border-b border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#0A1B33]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          {/* Brand Wordmark & Logo */}
          <Link
            href="/"
            className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7D7C] rounded-lg p-1"
            aria-label="RUET ELMS Home"
          >
            <div className="relative w-9 h-11 sm:w-10 sm:h-12 shrink-0 transition-transform duration-200 group-hover:scale-105">
              <Image
                src="/images/ruet-logo.webp"
                alt="RUET Logo"
                fill
                priority
                className="object-contain drop-shadow-xs"
              />
            </div>
            <div>
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold text-[#0B7D7C] dark:text-[#2DD4BF] block leading-none">
                Rajshahi University of Eng. &amp; Tech.
              </span>
              <span className="text-lg sm:text-xl font-extrabold tracking-tight text-[#0F2A4A] dark:text-white block mt-0.5">
                RUET ELMS
              </span>
            </div>
          </Link>

          {/* Right Controls: Theme Toggle & Sign in Button */}
          <div className="flex items-center gap-3 sm:gap-4">
            <ThemeToggle />
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl bg-[#0F2A4A] hover:bg-[#163B66] dark:bg-[#2DD4BF] dark:hover:bg-[#14B8A6] text-white dark:text-[#09223D] text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0B7D7C]"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>Sign in</span>
            </Link>
          </div>
        </div>
      </header>

      {/* 2. MAIN HERO SECTION */}
      <main className="flex-1 flex flex-col justify-center">
        <section className="relative overflow-hidden py-12 sm:py-16 lg:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
              {/* Left Column: Headline, Description, CTA */}
              <div className="lg:col-span-6 flex flex-col items-start text-left space-y-6 sm:space-y-7">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#0B7D7C]/10 text-[#0B7D7C] dark:bg-[#2DD4BF]/15 dark:text-[#2DD4BF] border border-[#0B7D7C]/20 dark:border-[#2DD4BF]/25">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Centralized Academic Portal • 2026</span>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#0F2A4A] dark:text-white leading-[1.12]">
                    Learn. Submit. <br className="hidden sm:inline" />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#0B7D7C] via-[#0E7490] to-[#2563EB] dark:from-[#2DD4BF] dark:via-[#38BDF8] dark:to-[#60A5FA]">
                      Track your progress.
                    </span>
                  </h1>
                  <p className="text-base sm:text-lg text-[#475569] dark:text-[#94A3B8] max-w-xl font-normal leading-relaxed">
                    The centralized academic portal for course materials, assignments, and real-time grades at RUET.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto pt-1">
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#0F2A4A] hover:bg-[#163B66] dark:bg-[#2DD4BF] dark:hover:bg-[#14B8A6] text-white dark:text-[#09223D] text-sm sm:text-base font-bold shadow-lg shadow-black/10 hover:shadow-xl transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0B7D7C]"
                  >
                    <span>Sign in to ELMS</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </Link>

                  <a
                    href="#features"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-white dark:bg-[#0F2A4A]/60 hover:bg-slate-100 dark:hover:bg-[#0F2A4A] text-[#334155] dark:text-[#E2E8F0] text-sm sm:text-base font-semibold border border-slate-200 dark:border-white/10 shadow-xs transition-colors"
                  >
                    <Layers className="w-4 h-4 shrink-0 text-[#0B7D7C] dark:text-[#2DD4BF]" />
                    <span>Explore Features</span>
                  </a>
                </div>

                {/* RUET institutional reassurance indicator */}
                <div className="pt-2 flex items-center gap-4 text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Secure University Auth</span>
                  </div>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Instant Grade Sync</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Sharp CSE Building Photo with Navy Duotone & Floating Cards */}
              <div className="lg:col-span-6 w-full">
                <div className="relative mx-auto max-w-lg lg:max-w-none">
                  {/* Photo Card Container */}
                  <div className="relative rounded-[20px] sm:rounded-[24px] overflow-hidden border border-slate-200/80 dark:border-white/10 shadow-2xl bg-[#0F2A4A] aspect-[16/9] w-full group">
                    <Image
                      src="/images/ruet-cse-building.webp"
                      alt="RUET CSE building"
                      fill
                      priority
                      placeholder="blur"
                      blurDataURL={CSE_BUILDING_BLUR}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover object-center group-hover:scale-[1.02] transition-transform duration-700 ease-out"
                    />

                    {/* Subtle navy duotone tint overlay */}
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-[#0F2A4A]/25 dark:bg-[#0F2A4A]/40 mix-blend-multiply pointer-events-none"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-[#0F2A4A]/70 via-transparent to-transparent pointer-events-none"
                    />

                    {/* Campus Tag */}
                    <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 z-10 px-3 py-1 rounded-lg bg-black/40 backdrop-blur-md border border-white/20 text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Dept. of Computer Science &amp; Engineering, RUET</span>
                    </div>
                  </div>

                  {/* Floating Card 1: Deadline Card (Shown on both desktop & mobile) */}
                  <div className="absolute -top-5 right-2 sm:-top-6 sm:-right-4 z-20 max-w-[260px] sm:max-w-[280px] rounded-2xl p-3 sm:p-3.5 bg-white/95 dark:bg-[#0E2644]/95 border border-slate-200/80 dark:border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.18)] glass-card-blur">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400">
                            Urgent
                          </span>
                          <span className="text-[11px] font-semibold text-[#0B7D7C] dark:text-[#2DD4BF]">
                            CSE 3101
                          </span>
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-[#0F2A4A] dark:text-white leading-snug">
                          Database Assignment
                        </h4>
                        <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          due in 4 hours
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Floating Card 2: Progress Card (hidden on mobile < 768px as requested!) */}
                  <div className="hidden md:flex flex-col gap-2 absolute -bottom-6 -left-4 lg:-bottom-6 lg:-left-6 z-20 min-w-[240px] rounded-2xl p-3.5 sm:p-4 bg-white/95 dark:bg-[#0E2644]/95 border border-slate-200/80 dark:border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.18)] glass-card-blur">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-500/15 text-[#0B7D7C] dark:text-[#2DD4BF] flex items-center justify-center">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-[#0F2A4A] dark:text-white">
                          Course progress
                        </span>
                      </div>
                      <span className="text-xs font-extrabold text-[#0B7D7C] dark:text-[#2DD4BF]">
                        78%
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#0B7D7C] to-[#2DD4BF] h-2 rounded-full transition-all duration-500"
                        style={{ width: "78%" }}
                      />
                    </div>
                    <span className="text-[10px] text-[#64748B] dark:text-[#94A3B8]">
                      Term Even 2026 • 14 of 18 tasks completed
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. FEATURES ROW */}
        <section
          id="features"
          className="py-12 sm:py-16 bg-slate-50 dark:bg-[#0A1B33]/50 border-t border-slate-200/60 dark:border-white/5"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12 space-y-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F2A4A] dark:text-white">
                Engineered for Academic Excellence
              </h2>
              <p className="text-sm sm:text-base text-[#64748B] dark:text-[#94A3B8]">
                Everything RUET students, faculty, and administrators need in one unified ecosystem.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {/* Feature 1: Courses and materials */}
              <div className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-[#0F2A4A]/50 border border-slate-200/80 dark:border-white/10 shadow-sm hover:shadow-md transition-all group">
                <div className="w-12 h-12 rounded-xl bg-[#0F2A4A]/10 dark:bg-teal-500/15 text-[#0F2A4A] dark:text-[#2DD4BF] flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-[#0F2A4A] dark:text-white mb-2">
                  Courses and materials
                </h3>
                <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                  Browse department offerings, access lecture slides, download syllabus documents, and keep track of classroom announcements in real time.
                </p>
              </div>

              {/* Feature 2: Assignments and grades */}
              <div className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-[#0F2A4A]/50 border border-slate-200/80 dark:border-white/10 shadow-sm hover:shadow-md transition-all group">
                <div className="w-12 h-12 rounded-xl bg-teal-500/15 text-[#0B7D7C] dark:text-[#2DD4BF] flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                  <FileCheck2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-[#0F2A4A] dark:text-white mb-2">
                  Assignments and grades
                </h3>
                <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                  Submit lab reports and course tasks with automated version control. Receive transparent grade breakdowns and instructor rubric feedback.
                </p>
              </div>

              {/* Feature 3: Quizzes and progress */}
              <div className="rounded-2xl p-6 sm:p-7 bg-white dark:bg-[#0F2A4A]/50 border border-slate-200/80 dark:border-white/10 shadow-sm hover:shadow-md transition-all group">
                <div className="w-12 h-12 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-[#0F2A4A] dark:text-white mb-2">
                  Quizzes and progress
                </h3>
                <p className="text-xs sm:text-sm text-[#475569] dark:text-[#94A3B8] leading-relaxed">
                  Participate in timed online quizzes, view instant answer analysis, and track cumulative semester progress with comprehensive visual analytics.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 4. SMALL FOOTER */}
      <footer className="border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0A1B33] py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative w-7 h-9 shrink-0">
              <Image
                src="/images/ruet-logo.webp"
                alt="RUET Logo"
                fill
                className="object-contain"
              />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-[#0F2A4A] dark:text-white">
                Rajshahi University of Engineering &amp; Technology
              </p>
              <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                Kazla, Rajshahi-6204, Bangladesh • RUET ELMS © 2026
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5 text-xs font-medium text-[#64748B] dark:text-[#94A3B8]">
            <Link
              href="/login"
              className="hover:text-[#0B7D7C] dark:hover:text-[#2DD4BF] transition-colors"
            >
              Sign in
            </Link>
            <span>•</span>
            <Link
              href="/forgot-password"
              className="hover:text-[#0B7D7C] dark:hover:text-[#2DD4BF] transition-colors"
            >
              Forgot Password
            </Link>
            <span>•</span>
            <Link
              href="/dev/components"
              className="hover:text-[#0B7D7C] dark:hover:text-[#2DD4BF] transition-colors"
            >
              Design Showcase
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
