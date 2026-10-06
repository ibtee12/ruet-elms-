import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { changePassword } from "@/services/password-reset.service";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import * as nextAuthJwt from "next-auth/jwt";

describe("Password Change Flow & Forced Change Policy", () => {
  let testUserId: string;
  const testEmail = "forced-change-user@ruet.ac.bd";
  const tempPassword = "TemporaryPassword123!";

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        name: "Forced Change User",
        passwordHash,
        role: "STUDENT",
        isActive: true,
        mustChangePassword: true, // User forced to change password
        tokenVersion: 1,
      },
    });
    testUserId = user.id;
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  it("requires the temporary password as currentPassword in the forced change flow", async () => {
    // Incorrect temporary password
    await expect(
      changePassword({
        userId: testUserId,
        currentPassword: "WrongTemporaryPassword!",
        newPassword: "BrandNewSecurePassword#2026",
      })
    ).rejects.toThrow("Current password is incorrect");

    // Correct temporary password
    const res = await changePassword({
      userId: testUserId,
      currentPassword: tempPassword,
      newPassword: "BrandNewSecurePassword#2026",
      clientIp: "192.168.1.10",
    });
    expect(res.success).toBe(true);

    // Verify user is no longer forced to change password
    const updated = await prisma.user.findUnique({
      where: { id: testUserId },
    });
    expect(updated?.mustChangePassword).toBe(false);

    // Verify PASSWORD_CHANGED audit log
    const log = await prisma.auditLog.findFirst({
      where: {
        userId: testUserId,
        action: "PASSWORD_CHANGED",
      },
    });
    expect(log).toBeDefined();
    expect(log?.ip).toBe("192.168.1.10");
  });

  it("rejects setting new password identical to current password", async () => {
    await expect(
      changePassword({
        userId: testUserId,
        currentPassword: tempPassword,
        newPassword: tempPassword,
      })
    ).rejects.toThrow("different from your current password");
  });

  it("enforces password policy on new password", async () => {
    await expect(
      changePassword({
        userId: testUserId,
        currentPassword: tempPassword,
        newPassword: "short",
      })
    ).rejects.toThrow(/at least 10 characters/);
  });
});

describe("Forced Change Route Protection (Middleware)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects users with mustChangePassword=true to /change-password from any route", async () => {
    vi.spyOn(nextAuthJwt, "getToken").mockResolvedValue({
      id: "usr_123",
      mustChangePassword: true,
    } as nextAuthJwt.JWT);

    const reqHome = new NextRequest("http://localhost:3000/");
    const resHome = await middleware(reqHome);

    expect(resHome.status).toBe(307);
    expect(resHome.headers.get("location")).toBe(
      "http://localhost:3000/change-password"
    );

    const reqDashboard = new NextRequest("http://localhost:3000/courses/1");
    const resDashboard = await middleware(reqDashboard);

    expect(resDashboard.status).toBe(307);
    expect(resDashboard.headers.get("location")).toBe(
      "http://localhost:3000/change-password"
    );
  });

  it("allows access to /change-password even when mustChangePassword=true", async () => {
    vi.spyOn(nextAuthJwt, "getToken").mockResolvedValue({
      id: "usr_123",
      mustChangePassword: true,
    } as nextAuthJwt.JWT);

    const reqChange = new NextRequest("http://localhost:3000/change-password");
    const resChange = await middleware(reqChange);

    // Allowed through (not redirected to /change-password in a loop)
    expect(resChange.status).toBe(200);
  });

  it("allows normal navigation when mustChangePassword=false", async () => {
    vi.spyOn(nextAuthJwt, "getToken").mockResolvedValue({
      id: "usr_123",
      mustChangePassword: false,
    } as nextAuthJwt.JWT);

    const req = new NextRequest("http://localhost:3000/");
    const res = await middleware(req);

    // Permitted through
    expect(res.status).toBe(200);
  });
});
