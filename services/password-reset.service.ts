import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import { validatePasswordAgainstPolicy } from "@/lib/validations/password";

export const GENERIC_FORGOT_PASSWORD_RESPONSE =
  "If an account exists with that email address, you will receive password reset instructions shortly.";

/**
 * Computes a SHA-256 hash of a raw token for safe storage.
 */
export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Initiates the password reset flow.
 * Always returns the same response message regardless of user existence.
 * Normalizes timing to prevent user enumeration attacks.
 */
export async function requestPasswordReset(
  email: string,
  clientIp: string = "127.0.0.1",
  baseUrl: string = process.env.NEXTAUTH_URL || "http://localhost:3000"
) {
  const normalizedEmail = email?.toLowerCase().trim();

  // Find user by email
  const user = normalizedEmail
    ? await prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { studentProfile: true },
      })
    : null;

  if (user && user.isActive) {
    // 1. Invalidate any existing unused tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // 2. Generate a secure random token (32 bytes = 64 hex chars)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);

    // 3. Set expiration to 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // 4. Store token hash in the database
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // 5. Send password reset email via Resend (fail-safe)
    const resetUrl = `${baseUrl}/reset-password/${rawToken}`;
    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      recipientName: user.name,
    });

    // 6. Record AuditLog entry without storing sensitive info
    await prisma.auditLog.create({
      data: {
        action: "PASSWORD_RESET_REQUESTED",
        objectType: "User",
        objectId: user.id,
        userId: user.id,
        description: "Password reset requested",
        ip: clientIp,
      },
    });
  } else {
    // Prevent timing analysis: perform a dummy cryptographic calculation
    const dummyToken = crypto.randomBytes(32).toString("hex");
    hashResetToken(dummyToken);
  }

  return {
    success: true,
    message: GENERIC_FORGOT_PASSWORD_RESPONSE,
  };
}

export interface ValidateTokenResult {
  valid: boolean;
  error?: string;
  userId?: string;
  userEmail?: string;
  studentId?: string | null;
}

/**
 * Validates a raw password reset token.
 * Checks hash existence, single-use status, and 30-minute expiration.
 */
export async function validateResetToken(
  rawToken: string
): Promise<ValidateTokenResult> {
  if (!rawToken || typeof rawToken !== "string") {
    return { valid: false, error: "Invalid password reset link." };
  }

  const tokenHash = hashResetToken(rawToken);

  const resetRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          isActive: true,
          studentProfile: {
            select: { studentId: true },
          },
        },
      },
    },
  });

  if (!resetRecord) {
    return { valid: false, error: "This password reset link is invalid or has expired." };
  }

  if (resetRecord.usedAt !== null) {
    return { valid: false, error: "This password reset link has already been used." };
  }

  if (resetRecord.expiresAt < new Date()) {
    return { valid: false, error: "This password reset link has expired (links expire after 30 minutes)." };
  }

  if (!resetRecord.user.isActive) {
    return { valid: false, error: "This account is inactive." };
  }

  return {
    valid: true,
    userId: resetRecord.userId,
    userEmail: resetRecord.user.email,
    studentId: resetRecord.user.studentProfile?.studentId || null,
  };
}

/**
 * Completes the password reset process using a valid single-use token.
 * Sets the new password, invalidates the token, and invalidates all other sessions.
 */
export async function completePasswordReset({
  rawToken,
  newPassword,
  clientIp = "127.0.0.1",
}: {
  rawToken: string;
  newPassword: string;
  clientIp?: string;
}) {
  const tokenValidation = await validateResetToken(rawToken);
  if (!tokenValidation.valid || !tokenValidation.userId) {
    throw new Error(tokenValidation.error || "Invalid or expired password reset link.");
  }

  // Validate new password against policy
  const policyCheck = validatePasswordAgainstPolicy(newPassword, {
    email: tokenValidation.userEmail,
    studentId: tokenValidation.studentId,
  });

  if (!policyCheck.valid) {
    throw new Error(policyCheck.error || "Password does not meet security requirements.");
  }

  const tokenHash = hashResetToken(rawToken);
  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  // Execute in a transaction: consume token, update user password, increment tokenVersion
  await prisma.$transaction(async (tx) => {
    // 1. Mark token as used
    await tx.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    });

    // 2. Invalidate other sessions by incrementing tokenVersion and update password
    await tx.user.update({
      where: { id: tokenValidation.userId },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });

    // 3. Record AuditLog entry
    await tx.auditLog.create({
      data: {
        action: "PASSWORD_RESET_COMPLETED",
        objectType: "User",
        objectId: tokenValidation.userId!,
        userId: tokenValidation.userId!,
        description: "Password reset completed successfully",
        ip: clientIp,
      },
    });
  });

  return { success: true };
}

/**
 * Handles password change (both forced flow and voluntary flow).
 * Requires current password verification and validates new password against policy.
 */
export async function changePassword({
  userId,
  currentPassword,
  newPassword,
  clientIp = "127.0.0.1",
}: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  clientIp?: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentProfile: true },
  });

  if (!user || !user.isActive) {
    throw new Error("User not found or inactive.");
  }

  // Verify current password
  const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isCurrentValid) {
    throw new Error("Current password is incorrect.");
  }

  // Check that new password is not identical to current
  if (currentPassword === newPassword) {
    throw new Error("New password must be different from your current password.");
  }

  // Validate new password against policy
  const policyCheck = validatePasswordAgainstPolicy(newPassword, {
    email: user.email,
    studentId: user.studentProfile?.studentId,
  });

  if (!policyCheck.valid) {
    throw new Error(policyCheck.error || "Password does not meet security requirements.");
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  // Update password and increment tokenVersion
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        action: "PASSWORD_CHANGED",
        objectType: "User",
        objectId: user.id,
        userId: user.id,
        description: "Password changed successfully",
        ip: clientIp,
      },
    });
  });

  return { success: true };
}
