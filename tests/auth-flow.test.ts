import { describe, it, expect, beforeEach } from "vitest";
import {
  authOptions,
  authorizeCredentials,
  GENERIC_AUTH_ERROR,
  RATE_LIMIT_ERROR,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authRateLimiter, InMemoryRateLimiter } from "@/lib/rate-limiter";
import bcrypt from "bcryptjs";

describe("Authentication Flow & Acceptance Criteria", () => {
  const authorize = authorizeCredentials;

  beforeEach(() => {
    // Reset rate limiter between test runs
    if (authRateLimiter instanceof InMemoryRateLimiter) {
      authRateLimiter.clear();
    }
  });

  it("allows a seeded student to log in with studentId + password", async () => {
    const user = await authorize(
      {
        identifier: "2203001",
        password: "Password123!",
      },
      { headers: { "x-forwarded-for": "10.10.1.1" } }
    );

    expect(user).toBeDefined();
    expect(user.role).toBe("STUDENT");
    expect(user.email).toBe("2203001@student.ruet.ac.bd");
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("password");

    // Check lastActiveAt was updated
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(dbUser?.lastActiveAt).not.toBeNull();

    // Check LOGIN_SUCCESS audit log was created
    const log = await prisma.auditLog.findFirst({
      where: {
        userId: user.id,
        action: "LOGIN_SUCCESS",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toBeDefined();
    expect(log?.ip).toBe("10.10.1.1");
    // Verify password is never logged
    expect(log?.description).not.toContain("Password123!");
  });

  it("allows a seeded teacher to log in with email + password", async () => {
    const user = await authorize(
      {
        identifier: "arahman@cse.ruet.ac.bd",
        password: "Password123!",
      },
      { headers: { "x-forwarded-for": "10.10.1.2" } }
    );

    expect(user).toBeDefined();
    expect(user.role).toBe("TEACHER");
    expect(user.name).toBe("Dr. A. Rahman");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("allows the seeded super admin to log in with email + password", async () => {
    const user = await authorize(
      {
        identifier: "admin@ruet.ac.bd",
        password: "Password123!",
      },
      { headers: { "x-forwarded-for": "10.10.1.3" } }
    );

    expect(user).toBeDefined();
    expect(user.role).toBe("SUPER_ADMIN");
    expect(user.name).toBe("System Super Admin");
  });

  it("rejects wrong password with the exact generic error 'Incorrect ID or password'", async () => {
    await expect(
      authorize(
        {
          identifier: "admin@ruet.ac.bd",
          password: "WrongPassword123!",
        },
        { headers: { "x-forwarded-for": "10.10.1.4" } }
      )
    ).rejects.toThrow(GENERIC_AUTH_ERROR);

    // Verify LOGIN_FAILED audit log does NOT contain password
    const log = await prisma.auditLog.findFirst({
      where: {
        action: "LOGIN_FAILED",
        ip: "10.10.1.4",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toBeDefined();
    expect(log?.description).not.toContain("WrongPassword123!");
  });

  it("rejects non-existent user with the same generic error", async () => {
    await expect(
      authorize(
        {
          identifier: "does-not-exist@ruet.ac.bd",
          password: "AnyPassword123!",
        },
        { headers: { "x-forwarded-for": "10.10.1.5" } }
      )
    ).rejects.toThrow(GENERIC_AUTH_ERROR);
  });

  it("rejects inactive users with the generic error", async () => {
    // Create a temporary inactive user
    const testPassword = "InactiveUserPass1!";
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const inactiveUser = await prisma.user.create({
      data: {
        email: "inactive-test-user@ruet.ac.bd",
        name: "Inactive Test User",
        passwordHash,
        role: "STUDENT",
        isActive: false,
        mustChangePassword: false,
      },
    });

    try {
      await expect(
        authorize(
          {
            identifier: "inactive-test-user@ruet.ac.bd",
            password: testPassword,
          },
          { headers: { "x-forwarded-for": "10.10.1.6" } }
        )
      ).rejects.toThrow(GENERIC_AUTH_ERROR);

      // Verify LOGIN_FAILED audit log recorded account is inactive
      const log = await prisma.auditLog.findFirst({
        where: {
          userId: inactiveUser.id,
          action: "LOGIN_FAILED",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(log).toBeDefined();
      expect(log?.description).toBe("Failed login attempt: account is inactive");
      expect(log?.description).not.toContain(testPassword);
    } finally {
      // Clean up
      await prisma.auditLog.deleteMany({ where: { userId: inactiveUser.id } });
      await prisma.user.delete({ where: { id: inactiveUser.id } });
    }
  });

  it("locks out further attempts after 5 consecutive failed attempts", async () => {
    const targetIdentifier = "2203002";
    const testIp = "192.168.100.50";

    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      await expect(
        authorize(
          {
            identifier: targetIdentifier,
            password: "BadPassword!",
          },
          { headers: { "x-forwarded-for": testIp } }
        )
      ).rejects.toThrow(GENERIC_AUTH_ERROR);
    }

    // 6th attempt: should be blocked by rate limiter even with the correct password!
    await expect(
      authorize(
        {
          identifier: targetIdentifier,
          password: "Password123!", // Even the correct password is blocked during lockout
        },
        { headers: { "x-forwarded-for": testIp } }
      )
    ).rejects.toThrow(RATE_LIMIT_ERROR);
  });

  it("ensures passwords are never stored in session or JWT callbacks", async () => {
    const seededStudent = await prisma.user.findFirst({
      where: { email: "2203001@student.ruet.ac.bd" },
    });
    expect(seededStudent).toBeDefined();

    const mockUser = {
      id: seededStudent!.id,
      email: seededStudent!.email,
      name: seededStudent!.name,
      role: "STUDENT" as const,
      mustChangePassword: false,
      tokenVersion: seededStudent!.tokenVersion,
      passwordHash: "secret-hash-12345",
      password: "secret-password",
    };

    const jwtCallback = authOptions.callbacks?.jwt;
    const sessionCallback = authOptions.callbacks?.session;

    expect(jwtCallback).toBeDefined();
    expect(sessionCallback).toBeDefined();

    if (!jwtCallback || !sessionCallback) return;

    const token = await jwtCallback({
      token: {},
      user: mockUser,
      account: null,
    });
    expect(token).toEqual({
      id: mockUser.id,
      role: "STUDENT",
      mustChangePassword: false,
      tokenVersion: mockUser.tokenVersion,
    });
    expect(token).not.toHaveProperty("passwordHash");
    expect(token).not.toHaveProperty("password");

    const session = await sessionCallback({
      session: {
        user: { name: "", email: "", image: "" },
        expires: new Date().toISOString(),
      },
      token,
      user: mockUser,
      newSession: undefined,
      trigger: "update",
    });
    expect(session.user).toMatchObject({
      id: mockUser.id,
      role: "STUDENT",
      mustChangePassword: false,
    });
    expect(session.user).not.toHaveProperty("passwordHash");
    expect(session.user).not.toHaveProperty("password");
  });
});
