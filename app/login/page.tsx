"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const CSE_BUILDING_BLUR =
  "data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAADwAQCdASoQAAsAA4BaJZQC7AYwxdOXlgAA/u+FXnI+B7Gn5PqyfBtvXRYGK4VLyEhuzPcwBVpupMPcVSpQK5uC5ih5giLJ3W5idlGkBs9SFUu4ZOEAXFjAAAA=";

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0F2A4A]">
          <div className="w-9 h-9 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [bgFailed, setBgFailed] = React.useState(false);

  // Check if NextAuth passed an error in query string
  React.useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      if (
        errorParam.toLowerCase().includes("rate") ||
        errorParam.toLowerCase().includes("lockout")
      ) {
        setErrorMessage(
          "Too many failed login attempts. Please try again in 15 minutes."
        );
      } else {
        setErrorMessage("Incorrect ID or password");
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedId = identifier.trim();
    if (!trimmedId || !password) {
      setErrorMessage("Incorrect ID or password");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        identifier: trimmedId,
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setPassword("");

        if (
          result?.error?.includes("Too many failed") ||
          result?.error?.includes("RATE_LIMIT")
        ) {
          setErrorMessage(
            "Too many failed login attempts. Please try again in 15 minutes."
          );
        } else {
          setErrorMessage("Incorrect ID or password");
        }
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErrorMessage("Incorrect ID or password");
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-[#0F2A4A]">
      {/* 1. FULL-SCREEN BACKGROUND: Campus photo (oversized -inset-6 with blur, saturation, scale) */}
      {!bgFailed && (
        <div
          aria-hidden="true"
          className="absolute -inset-6 pointer-events-none overflow-hidden select-none"
        >
          <div className="relative w-full h-full animate-bg-zoom">
            <Image
              src="/images/ruet-cse-building.webp"
              alt=""
              fill
              priority
              placeholder="blur"
              blurDataURL={CSE_BUILDING_BLUR}
              sizes="100vw"
              onError={() => setBgFailed(true)}
              className="object-cover object-center"
              style={{
                filter: "blur(14px) saturate(1.1)",
                transform: "scale(1.05)",
              }}
            />
          </div>
        </div>
      )}

      {/* 2. NAVY-TO-TEAL GRADIENT OVERLAY (#0F2A4A at 80% to #0B7D7C at 55%) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none bg-gradient-to-br from-[#0F2A4A]/80 via-[#0E355D]/75 to-[#0B7D7C]/55"
      />

      {/* Top right theme toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <div className="p-1 rounded-full bg-black/20 backdrop-blur-md border border-white/20">
          <ThemeToggle />
        </div>
      </div>

      {/* 3. CENTERED GLASS CARD (max-width 420px, radius 16px, 88% white in light, 75% navy in dark) */}
      <div className="relative z-10 w-full max-w-[420px] rounded-[16px] p-6 sm:p-8 bg-[rgba(255,255,255,0.88)] dark:bg-[rgba(15,42,74,0.75)] text-[#1E293B] dark:text-white border border-white/70 dark:border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.35)] glass-card-blur transition-colors">
        {/* Card Header: RUET Monogram Logo & Wordmark */}
        <div className="flex flex-col items-center text-center mb-6 sm:mb-7">
          <Link
            href="/"
            className="group flex flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7D7C] dark:focus-visible:ring-[#2DD4BF] rounded-lg p-1"
          >
            <div className="relative w-12 h-14 sm:w-14 sm:h-16 mb-2.5 transition-transform duration-200 group-hover:scale-105">
              <Image
                src="/images/ruet-logo.webp"
                alt="RUET Logo"
                fill
                priority
                className="object-contain drop-shadow-sm"
              />
            </div>
            <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold text-[#0B7D7C] dark:text-[#2DD4BF]">
              Rajshahi University of Eng. &amp; Tech.
            </span>
            <span className="text-xl sm:text-2xl font-extrabold tracking-tight text-[#0F2A4A] dark:text-white">
              RUET ELMS
            </span>
          </Link>
          <p className="text-xs sm:text-sm text-[#475569] dark:text-[#CBD5E1] mt-1">
            Centralized Academic Learning Management System
          </p>
        </div>

        {/* Error Alert Banner */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-5 p-3.5 rounded-xl border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 flex items-start gap-2.5 text-xs sm:text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
            <div className="space-y-0.5">
              <span className="font-semibold block">{errorMessage}</span>
              {errorMessage.includes("15 minutes") && (
                <span className="text-xs opacity-90 block">
                  Security lockout active after multiple unsuccessful attempts.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} method="POST" className="space-y-4 sm:space-y-4.5" noValidate>
          {/* Identifier Input */}
          <div className="space-y-1.5 text-left">
            <label
              htmlFor="identifier"
              className="block text-xs sm:text-sm font-semibold text-[#0F2A4A] dark:text-[#F1F5F9]"
            >
              Student ID or University Email <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. 2203001 or teacher@cse.ruet.ac.bd"
              disabled={isLoading}
              className="w-full rounded-[10px] border border-slate-300 dark:border-white/20 bg-white/95 dark:bg-[#0A1B33]/85 px-3.5 py-2.5 text-sm text-[#0F2A4A] dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7D7C] dark:focus-visible:ring-[#2DD4BF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Password Input with Show/Hide Toggle */}
          <div className="space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-xs sm:text-sm font-semibold text-[#0F2A4A] dark:text-[#F1F5F9]"
              >
                Password <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-semibold text-[#0B7D7C] dark:text-[#2DD4BF] hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7D7C] dark:focus-visible:ring-[#2DD4BF] rounded px-1"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={isLoading}
                className="w-full rounded-[10px] border border-slate-300 dark:border-white/20 bg-white/95 dark:bg-[#0A1B33]/85 pl-3.5 pr-11 py-2.5 text-sm text-[#0F2A4A] dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7D7C] dark:focus-visible:ring-[#2DD4BF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 dark:text-slate-400 hover:text-[#0F2A4A] dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B7D7C] dark:focus-visible:ring-[#2DD4BF] rounded-md transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            isLoading={isLoading}
            className="w-full min-h-[44px] text-sm font-bold tracking-wide shadow-md mt-2 bg-[#0B7D7C] hover:bg-[#096968] text-white dark:bg-[#2DD4BF] dark:hover:bg-[#5EEAD4] dark:text-[#06201F] transition-colors"
          >
            Sign in
          </Button>
        </form>

        {/* Demo Credentials Disclosure for Quick Seed Testing */}
        <div className="mt-6 pt-5 border-t border-slate-300/80 dark:border-white/15">
          <details className="text-xs text-[#475569] dark:text-[#94A3B8] group cursor-pointer">
            <summary className="font-semibold hover:text-[#0F2A4A] dark:hover:text-white list-none flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[#0B7D7C] dark:text-[#2DD4BF]" />
                <span>Demo seeded credentials</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-white/10 font-mono">
                Seeds
              </span>
            </summary>
            <div className="mt-2.5 p-2.5 rounded-lg bg-slate-100/90 dark:bg-[#0A1B33]/90 border border-slate-200 dark:border-white/10 space-y-1.5 text-[11px] font-mono text-[#1E293B] dark:text-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Student:</span>
                <span>2203001</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Teacher:</span>
                <span>arahman@cse.ruet.ac.bd</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Admin:</span>
                <span>admin@ruet.ac.bd</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-white/10 pt-1 text-[#0B7D7C] dark:text-[#2DD4BF] font-semibold">
                <span>Password:</span>
                <span>Password123!</span>
              </div>
            </div>
          </details>
        </div>

        {/* Card Footer Note */}
        <div className="mt-5 text-center text-[11px] text-[#64748B] dark:text-slate-400">
          <p>© {new Date().getFullYear()} RUET • Kazla, Rajshahi-6204</p>
        </div>
      </div>
    </main>
  );
}
