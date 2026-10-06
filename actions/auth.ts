"use server";

import { getServerSession } from "next-auth/next";
import { headers } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import {
  requestPasswordReset,
  completePasswordReset,
  changePassword,
} from "@/services/password-reset.service";

/**
 * Server action to log the user out and record the LOGOUT event in the AuditLog.
 */
export async function logoutAction() {
  const session = await getServerSession(authOptions);

  if (session?.user?.id) {
    const headerList = await headers();
    const clientIp = getClientIp(headerList);

    try {
      await prisma.auditLog.create({
        data: {
          action: "LOGOUT",
          objectType: "User",
          objectId: session.user.id,
          userId: session.user.id,
          description: "User logged out",
          ip: clientIp,
        },
      });
    } catch (e) {
      console.error("Failed to record logout audit log:", e);
    }
  }

  return { success: true };
}

/**
 * Server action to request a password reset email.
 * Always returns the same generic message.
 */
export async function requestPasswordResetAction(email: string) {
  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const res = await requestPasswordReset(email, clientIp);
  return res;
}

/**
 * Server action to complete a password reset using a single-use token.
 */
export async function completePasswordResetAction(
  rawToken: string,
  newPassword: string,
  confirmPassword: string
) {
  if (newPassword !== confirmPassword) {
    return { success: false, error: "New passwords do not match." };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  try {
    await completePasswordReset({
      rawToken,
      newPassword,
      clientIp,
    });
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to reset password.";
    return { success: false, error: message };
  }
}

/**
 * Server action to change password (both forced and voluntary flows).
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      success: false,
      error: "You must be authenticated to change your password.",
    };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "New passwords do not match." };
  }

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  try {
    await changePassword({
      userId: session.user.id,
      currentPassword,
      newPassword,
      clientIp,
    });
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to change password.";
    return { success: false, error: message };
  }
}
