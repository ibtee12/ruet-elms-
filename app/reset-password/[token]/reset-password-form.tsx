"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, EyeOff, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordStrengthIndicator } from "@/components/shared/password-strength-indicator";
import { completePasswordResetAction } from "@/actions/auth";
import { UserPasswordContext, validatePasswordAgainstPolicy } from "@/lib/validations/password";

interface ResetPasswordFormProps {
  token: string;
  context: UserPasswordContext;
}

export function ResetPasswordForm({ token, context }: ResetPasswordFormProps) {
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSuccess, setIsSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match.");
      return;
    }

    const policy = validatePasswordAgainstPolicy(newPassword, context);
    if (!policy.valid) {
      setErrorMessage(policy.error || "Password does not meet security requirements.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await completePasswordResetAction(
        token,
        newPassword,
        confirmPassword
      );

      if (!res.success) {
        setErrorMessage(res.error || "Failed to reset password.");
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      setIsLoading(false);
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div
          role="alert"
          className="p-4 rounded-xl border border-success/30 bg-success/10 text-foreground flex items-start gap-3"
        >
          <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <span className="font-semibold block text-success">
              Password Reset Successfully
            </span>
            <p className="text-xs text-muted leading-relaxed">
              Your password has been updated and all other active sessions have been invalidated. You can now sign in with your new password.
            </p>
          </div>
        </div>

        <Link
          href="/login"
          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold shadow-xs transition-colors"
        >
          <span>Proceed to Sign In</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-danger/30 bg-danger/10 text-danger text-sm flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* New Password */}
      <div className="space-y-1.5 text-left">
        <label
          htmlFor="newPassword"
          className="block text-sm font-medium text-foreground"
        >
          New Password <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <input
            id="newPassword"
            name="newPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 10 characters"
            disabled={isLoading}
            className="w-full rounded-[10px] border border-border bg-surface pl-3.5 pr-11 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={isLoading}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-foreground focus-visible:outline-none rounded-md"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Password Strength Indicator */}
        <PasswordStrengthIndicator password={newPassword} context={context} />
      </div>

      {/* Confirm Password */}
      <div className="space-y-1.5 text-left">
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-foreground"
        >
          Confirm New Password <span className="text-danger">*</span>
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-type new password"
          disabled={isLoading}
          className="w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        isLoading={isLoading}
        className="w-full min-h-[44px] text-sm font-semibold tracking-wide shadow-sm mt-3"
      >
        Reset Password
      </Button>
    </form>
  );
}
