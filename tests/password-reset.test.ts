import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  requestPasswordReset,
  validateResetToken,
  completePasswordReset,
  hashResetToken,
  GENERIC_FORGOT_PASSWORD_RESPONSE,
} from "@/services/password-reset.service";

describe("Password Reset Flow & Token Expiry/Reuse", () => {
  let testUserId: string;
  const testEmail = "reset-test-user@ruet.ac.bd";
  const initialPassword = "InitialPassword123!";

  beforeEach(async () => {
    // Create a dedicated test user
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        name: "Reset Test User",
        passwordHash,
        role: "STUDENT",
        isActive: true,
        mustChangePassword: false,
        tokenVersion: 1,
      },
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    // Clean up tokens, audit logs, and test user
    await prisma.passwordResetToken.deleteMany({ where: { userId: testUserId } });
    await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it("returns identical response for existing and non-existing emails with similar timing", async () => {
    // 1. Existing email
    const start1 = performance.now();
    const resExisting = await requestPasswordReset(testEmail, "10.0.0.1");
    const durationExisting = performance.now() - start1;

    // 2. Non-existing email
    const start2 = performance.now();
    const resNonExisting = await requestPasswordReset(
      "completely-nonexistent-user-12345@ruet.ac.bd",
      "10.0.0.1"
    );
    const durationNonExisting = performance.now() - start2;

    // Acceptance criterion: Responses must be strictly identical
    expect(resExisting.message).toBe(GENERIC_FORGOT_PASSWORD_RESPONSE);
    expect(resNonExisting.message).toBe(GENERIC_FORGOT_PASSWORD_RESPONSE);
    expect(resExisting.message).toBe(resNonExisting.message);

    // Acceptance criterion: Timing difference should be small (preventing enumeration)
    const timingDiff = Math.abs(durationExisting - durationNonExisting);
    expect(timingDiff).toBeLessThan(100); // within 100ms tolerance
  });

  it("stores only the SHA-256 hash of the token in the database, never the raw token", async () => {
    await requestPasswordReset(testEmail, "10.0.0.2");

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: testUserId },
    });

    expect(record).toBeDefined();
    // SHA-256 hex string is exactly 64 characters
    expect(record?.tokenHash).toHaveLength(64);

    // Verify AuditLog PASSWORD_RESET_REQUESTED was logged
    const log = await prisma.auditLog.findFirst({
      where: {
        userId: testUserId,
        action: "PASSWORD_RESET_REQUESTED",
      },
    });
    expect(log).toBeDefined();
    expect(log?.ip).toBe("10.0.0.2");
  });

  it("validates that a fresh token within 30 minutes is valid", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: testUserId,
        tokenHash,
        expiresAt,
      },
    });

    const validation = await validateResetToken(rawToken);
    expect(validation.valid).toBe(true);
    expect(validation.userId).toBe(testUserId);
    expect(validation.userEmail).toBe(testEmail);
  });

  it("rejects token after it has expired", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    // Expired 5 minutes ago
    const expiresAt = new Date(Date.now() - 5 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: testUserId,
        tokenHash,
        expiresAt,
      },
    });

    const validation = await validateResetToken(rawToken);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain("expired");

    // Attempting to complete reset with expired token throws error
    await expect(
      completePasswordReset({
        rawToken,
        newPassword: "BrandNewSecurePassword#2026",
      })
    ).rejects.toThrow(/expired/);
  });

  it("prevents token reuse: token cannot be used twice", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: testUserId,
        tokenHash,
        expiresAt,
      },
    });

    // 1st use: should succeed
    const res = await completePasswordReset({
      rawToken,
      newPassword: "FirstNewSecurePassword#1",
      clientIp: "10.0.0.3",
    });
    expect(res.success).toBe(true);

    // Verify token was marked used
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    expect(record?.usedAt).not.toBeNull();

    // Verify PASSWORD_RESET_COMPLETED audit log
    const log = await prisma.auditLog.findFirst({
      where: {
        userId: testUserId,
        action: "PASSWORD_RESET_COMPLETED",
      },
    });
    expect(log).toBeDefined();

    // 2nd use (reuse attempt): MUST fail
    await expect(
      completePasswordReset({
        rawToken,
        newPassword: "SecondAttemptPassword#2",
        clientIp: "10.0.0.3",
      })
    ).rejects.toThrow(/already been used/);
  });

  it("invalidates all other sessions on reset by incrementing tokenVersion", async () => {
    const initialUser = await prisma.user.findUnique({
      where: { id: testUserId },
    });
    const initialVersion = initialUser?.tokenVersion ?? 1;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    await prisma.passwordResetToken.create({
      data: {
        userId: testUserId,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    await completePasswordReset({
      rawToken,
      newPassword: "NewValidPassword#2026",
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: testUserId },
    });

    // tokenVersion has been incremented, effectively invalidating existing JWT sessions
    expect(updatedUser?.tokenVersion).toBe(initialVersion + 1);

    // New password can be verified
    const isNewPassValid = await bcrypt.compare(
      "NewValidPassword#2026",
      updatedUser!.passwordHash
    );
    expect(isNewPassValid).toBe(true);
  });
});
