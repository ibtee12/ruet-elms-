import { z } from "zod";

export const COMMON_PASSWORDS = new Set([
  "password",
  "password123",
  "password1234",
  "1234567890",
  "123456789012",
  "12345678901",
  "qwertyuiop",
  "admin12345",
  "admin123456",
  "ruet123456",
  "ruetpassword",
  "welcome1234",
  "changeme123",
  "letmein1234",
  "student1234",
  "superadmin123",
  "iloveyou123",
  "secret12345",
  "bangladesh123",
]);

export interface UserPasswordContext {
  email?: string | null;
  studentId?: string | null;
}

/**
 * Validates a password against RUET ELMS security policy:
 * 1. Minimum 10 characters
 * 2. Not equal to user email or email username part
 * 3. Not equal to student ID
 * 4. Not in common passwords list
 */
export function validatePasswordAgainstPolicy(
  password: string,
  context?: UserPasswordContext
): { valid: boolean; error?: string } {
  if (!password || password.length < 10) {
    return {
      valid: false,
      error: "Password must be at least 10 characters long",
    };
  }

  const lowerPassword = password.toLowerCase().trim();

  // Check against common passwords
  if (COMMON_PASSWORDS.has(lowerPassword)) {
    return {
      valid: false,
      error: "This password is too common. Please choose a stronger password.",
    };
  }

  // Check against user's email
  if (context?.email) {
    const lowerEmail = context.email.toLowerCase().trim();
    const emailPrefix = lowerEmail.split("@")[0];
    if (lowerPassword === lowerEmail || lowerPassword === emailPrefix) {
      return {
        valid: false,
        error: "Password cannot be your email address or username.",
      };
    }
  }

  // Check against student ID
  if (context?.studentId) {
    const lowerStudentId = context.studentId.toLowerCase().trim();
    if (lowerPassword === lowerStudentId) {
      return {
        valid: false,
        error: "Password cannot be your student ID.",
      };
    }
  }

  return { valid: true };
}

/**
 * Creates a Zod string schema with password policy refinements.
 */
export function createPasswordPolicySchema(context?: UserPasswordContext) {
  return z
    .string()
    .min(10, "Password must be at least 10 characters long")
    .refine((val) => !COMMON_PASSWORDS.has(val.toLowerCase().trim()), {
      message: "This password is too common. Please choose a stronger password.",
    })
    .refine(
      (val) => {
        if (!context?.email) return true;
        const lowerVal = val.toLowerCase().trim();
        const lowerEmail = context.email.toLowerCase().trim();
        const emailPrefix = lowerEmail.split("@")[0];
        return lowerVal !== lowerEmail && lowerVal !== emailPrefix;
      },
      {
        message: "Password cannot be your email address or username.",
      }
    )
    .refine(
      (val) => {
        if (!context?.studentId) return true;
        return val.toLowerCase().trim() !== context.studentId.toLowerCase().trim();
      },
      {
        message: "Password cannot be your student ID.",
      }
    );
}

/**
 * Zod schema for changing password (both forced and voluntary flows).
 */
export function createChangePasswordSchema(context?: UserPasswordContext) {
  return z
    .object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: createPasswordPolicySchema(context),
      confirmPassword: z.string().min(1, "Please confirm your new password"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "New passwords do not match",
      path: ["confirmPassword"],
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      message: "New password must be different from current password",
      path: ["newPassword"],
    });
}

/**
 * Zod schema for resetting password via reset token.
 */
export function createResetPasswordSchema(context?: UserPasswordContext) {
  return z
    .object({
      newPassword: createPasswordPolicySchema(context),
      confirmPassword: z.string().min(1, "Please confirm your new password"),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "New passwords do not match",
      path: ["confirmPassword"],
    });
}

/**
 * Zod schema for requesting a password reset.
 */
export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid institutional email address"),
});

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too weak" | "Weak" | "Fair" | "Good" | "Strong";
  color: string;
  feedback: string;
};

/**
 * Calculates password strength and provides UI feedback hints.
 */
export function calculatePasswordStrength(
  password: string,
  context?: UserPasswordContext
): PasswordStrength {
  if (!password || password.length === 0) {
    return {
      score: 0,
      label: "Too weak",
      color: "bg-muted",
      feedback: "Enter at least 10 characters.",
    };
  }

  const policyCheck = validatePasswordAgainstPolicy(password, context);
  if (!policyCheck.valid) {
    return {
      score: 1,
      label: "Too weak",
      color: "bg-danger",
      feedback: policyCheck.error || "Password does not meet minimum policy requirements.",
    };
  }

  let score = 1;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (hasLower && hasUpper) score++;
  if (hasDigit) score++;
  if (hasSpecial) score++;
  if (password.length >= 14) score++;

  if (score <= 1) {
    return {
      score: 1,
      label: "Weak",
      color: "bg-danger",
      feedback: "Add uppercase letters, numbers, or symbols to strengthen.",
    };
  }

  if (score === 2) {
    return {
      score: 2,
      label: "Fair",
      color: "bg-warning",
      feedback: "Good start. Adding symbols or more length will improve security.",
    };
  }

  if (score === 3 || score === 4) {
    return {
      score: 3,
      label: "Good",
      color: "bg-teal-accent",
      feedback: "Strong password. Meets all academic security standards.",
    };
  }

  return {
    score: 4,
    label: "Strong",
    color: "bg-success",
    feedback: "Excellent! Very secure password.",
  };
}
