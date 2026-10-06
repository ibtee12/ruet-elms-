"use client";

import * as React from "react";
import {
  calculatePasswordStrength,
  UserPasswordContext,
} from "@/lib/validations/password";
import { Check, X, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface PasswordStrengthIndicatorProps {
  password: string;
  context?: UserPasswordContext;
  className?: string;
}

export function PasswordStrengthIndicator({
  password,
  context,
  className,
}: PasswordStrengthIndicatorProps) {
  const strength = calculatePasswordStrength(password, context);

  const hasMinLength = password.length >= 10;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!password) {
    return (
      <div className={cn("text-xs text-muted space-y-1 mt-1.5", className)}>
        <p className="flex items-center gap-1.5 text-muted/80">
          <ShieldAlert className="w-3.5 h-3.5 text-muted" />
          <span>Must be at least 10 characters and meet academic security policies.</span>
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2 mt-2", className)}>
      {/* 4-segment strength bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Password Strength:</span>
          <span
            className={cn(
              "font-semibold",
              strength.score <= 1 && "text-danger",
              strength.score === 2 && "text-warning",
              strength.score === 3 && "text-primary",
              strength.score === 4 && "text-success"
            )}
          >
            {strength.label}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
          {[1, 2, 3, 4].map((step) => {
            const isFilled = strength.score >= step;
            return (
              <div
                key={step}
                className={cn(
                  "rounded-full transition-all duration-300",
                  isFilled
                    ? strength.score <= 1
                      ? "bg-danger"
                      : strength.score === 2
                      ? "bg-warning"
                      : strength.score === 3
                      ? "bg-teal-accent"
                      : "bg-success"
                    : "bg-border"
                )}
              />
            );
          })}
        </div>
      </div>

      {/* Real-time hint message */}
      <p className="text-xs text-muted flex items-start gap-1.5 leading-tight">
        <span>{strength.feedback}</span>
      </p>

      {/* Policy checklist */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 border-t border-border/50 text-[11px]">
        <div
          className={cn(
            "flex items-center gap-1",
            hasMinLength ? "text-success font-medium" : "text-muted"
          )}
        >
          {hasMinLength ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
          <span>10+ characters</span>
        </div>

        <div
          className={cn(
            "flex items-center gap-1",
            hasLower && hasUpper ? "text-success font-medium" : "text-muted"
          )}
        >
          {hasLower && hasUpper ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
          <span>Upper & lowercase</span>
        </div>

        <div
          className={cn(
            "flex items-center gap-1",
            hasNumber ? "text-success font-medium" : "text-muted"
          )}
        >
          {hasNumber ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
          <span>Includes a number</span>
        </div>

        <div
          className={cn(
            "flex items-center gap-1",
            hasSpecial ? "text-success font-medium" : "text-muted"
          )}
        >
          {hasSpecial ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
          <span>Special symbol</span>
        </div>
      </div>
    </div>
  );
}
