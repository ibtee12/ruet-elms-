"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordStrengthIndicator } from "@/components/shared/password-strength-indicator";
import { changePasswordAction } from "@/actions/auth";
import { UserPasswordContext, validatePasswordAgainstPolicy } from "@/lib/validations/password";
import { toast } from "@/lib/toast";

interface ChangePasswordFormProps {
  isForced: boolean;
  context: UserPasswordContext;
}

export function ChangePasswordForm({ isForced, context }: ChangePasswordFormProps) {
  const router = useRouter();
  const { update } = useSession();

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!currentPassword) {
      setErrorMessage(
        isForced
          ? "Please enter your temporary password."
          : "Please enter your current password."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setErrorMessage("New password must be different from your current password.");
      return;
    }

    const policy = validatePasswordAgainstPolicy(newPassword, context);
    if (!policy.valid) {
      setErrorMessage(policy.error || "Password does not meet security requirements.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await changePasswordAction(
        currentPassword,
        newPassword,
        confirmPassword
      );

      if (!res.success) {
        setErrorMessage(res.error || "Failed to change password.");
        setIsLoading(false);
        return;
      }

      toast.success("Password updated successfully!");

      // Update client session token to clear mustChangePassword
      if (typeof update === "function") {
        await update({ mustChangePassword: false });
      }

      // Navigate to homepage
      router.push("/");
      router.refresh();
    } catch {
      setErrorMessage("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl border border-danger/30 bg-danger/10 text-danger text-sm flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Current / Temporary Password */}
      <div className="space-y-1.5 text-left">
        <label
          htmlFor="currentPassword"
          className="block text-sm font-medium text-foreground"
        >
          {isForced ? "Temporary Password" : "Current Password"}{" "}
          <span className="text-danger">*</span>
        </label>
        <div className="relative">
          <input
            id="currentPassword"
            name="currentPassword"
            type={showCurrent ? "text" : "password"}
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={
              isForced
                ? "Enter your temporary password"
                : "Enter current password"
            }
            disabled={isLoading}
            className="w-full rounded-[10px] border border-border bg-surface pl-3.5 pr-11 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setShowCurrent(!showCurrent)}
            disabled={isLoading}
            aria-label={showCurrent ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-foreground focus-visible:outline-none rounded-md"
          >
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {isForced && (
          <p className="text-[11px] text-muted">
            For initial login, your temporary password is your current password.
          </p>
        )}
      </div>

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
            type={showNew ? "text" : "password"}
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
            onClick={() => setShowNew(!showNew)}
            disabled={isLoading}
            aria-label={showNew ? "Hide password" : "Show password"}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted hover:text-foreground focus-visible:outline-none rounded-md"
          >
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        {/* Strength meter & policy checklist */}
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
          type={showNew ? "text" : "password"}
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter new password"
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
        {isForced ? "Set New Password & Continue" : "Update Password"}
      </Button>
    </form>
  );
}
