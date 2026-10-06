import { describe, it, expect } from "vitest";
import {
  validatePasswordAgainstPolicy,
  createPasswordPolicySchema,
  createChangePasswordSchema,
  createResetPasswordSchema,
  calculatePasswordStrength,
  COMMON_PASSWORDS,
} from "@/lib/validations/password";

describe("Password Policy Validation", () => {
  const userContext = {
    email: "student2203001@ruet.ac.bd",
    studentId: "2203001",
  };

  it("rejects passwords shorter than 10 characters", () => {
    const res = validatePasswordAgainstPolicy("Short9!", userContext);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("at least 10 characters");
  });

  it("rejects passwords from the common password list", () => {
    for (const common of ["password123", "admin12345", "qwertyuiop", "bangladesh123"]) {
      const res = validatePasswordAgainstPolicy(common, userContext);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("too common");
    }
  });

  it("rejects passwords matching user email or email username prefix", () => {
    const res1 = validatePasswordAgainstPolicy(
      "student2203001@ruet.ac.bd",
      userContext
    );
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain("cannot be your email address or username");

    const res2 = validatePasswordAgainstPolicy(
      "student2203001",
      userContext
    );
    expect(res2.valid).toBe(false);
    expect(res2.error).toContain("cannot be your email address or username");
  });

  it("rejects passwords matching student ID", () => {
    const res = validatePasswordAgainstPolicy("2203001", userContext);
    expect(res.valid).toBe(false);
  });

  it("accepts valid, strong passwords meeting all requirements", () => {
    const res = validatePasswordAgainstPolicy(
      "PadmaBridge#2026Safe!",
      userContext
    );
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it("calculates strength score and provides helpful hints", () => {
    // Empty
    expect(calculatePasswordStrength("").score).toBe(0);

    // Short / too weak
    expect(calculatePasswordStrength("abc").score).toBe(1);

    // Common password
    expect(calculatePasswordStrength("password123").score).toBe(1);

    // Valid medium password
    const fair = calculatePasswordStrength("Bangladesh123"); // common check catches this or length
    expect(fair.score).toBeLessThanOrEqual(2);

    // Strong password
    const strong = calculatePasswordStrength("Academic#2026SafeTerm!", userContext);
    expect(strong.score).toBeGreaterThanOrEqual(3);
    expect(strong.label).toMatch(/Good|Strong/);
  });
});

describe("Zod Password Schemas", () => {
  const context = {
    email: "teacher@cse.ruet.ac.bd",
    studentId: null,
  };

  it("validates changePasswordSchema requiring current password and matching new passwords", () => {
    const schema = createChangePasswordSchema(context);

    // Mismatched new passwords
    const mismatch = schema.safeParse({
      currentPassword: "OldPassword123!",
      newPassword: "BrandNewPassword123!",
      confirmPassword: "DifferentPassword123!",
    });
    expect(mismatch.success).toBe(false);

    // New password same as current
    const same = schema.safeParse({
      currentPassword: "SamePassword123!",
      newPassword: "SamePassword123!",
      confirmPassword: "SamePassword123!",
    });
    expect(same.success).toBe(false);

    // Valid change password
    const valid = schema.safeParse({
      currentPassword: "OldPassword123!",
      newPassword: "BrandNewPassword123!",
      confirmPassword: "BrandNewPassword123!",
    });
    expect(valid.success).toBe(true);
  });

  it("validates resetPasswordSchema", () => {
    const schema = createResetPasswordSchema(context);

    const valid = schema.safeParse({
      newPassword: "SecureAcademicPass2026!",
      confirmPassword: "SecureAcademicPass2026!",
    });
    expect(valid.success).toBe(true);
  });

  it("validates standalone createPasswordPolicySchema and checks COMMON_PASSWORDS set", () => {
    expect(COMMON_PASSWORDS.has("password123")).toBe(true);
    expect(COMMON_PASSWORDS.has("bangladesh123")).toBe(true);

    const policySchema = createPasswordPolicySchema(context);
    expect(policySchema.safeParse("password123").success).toBe(false);
    expect(policySchema.safeParse("teacher@cse.ruet.ac.bd").success).toBe(false);
    expect(policySchema.safeParse("teacher").success).toBe(false);
    expect(policySchema.safeParse("Compliant#Pass1234").success).toBe(true);
  });
});
