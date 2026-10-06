import { describe, it, expect, vi } from "vitest";
import {
  resolveUserByIdentifier,
  UserResolverDb,
} from "@/lib/auth/user-resolver";
import { prisma } from "@/lib/prisma";

describe("User Resolver Unit Tests (Mock DB)", () => {
  it("returns null for empty or whitespace-only identifiers without querying DB", async () => {
    const mockDb: UserResolverDb = {
      user: {
        findFirst: vi.fn(),
      },
    };

    expect(await resolveUserByIdentifier("", mockDb)).toBeNull();
    expect(await resolveUserByIdentifier("   ", mockDb)).toBeNull();
    expect(mockDb.user.findFirst).not.toHaveBeenCalled();
  });

  it("trims whitespace and passes case-insensitive query for both email and studentId", async () => {
    const mockDb: UserResolverDb = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "usr_1",
          email: "student@ruet.ac.bd",
          name: "Test Student",
          passwordHash: "hash123",
          role: "STUDENT",
          isActive: true,
          mustChangePassword: false,
          studentProfile: { studentId: "2203001" },
        }),
      },
    };

    const result = await resolveUserByIdentifier("  2203001  ", mockDb);
    expect(result).toBeDefined();
    expect(result?.id).toBe("usr_1");

    expect(mockDb.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { email: { equals: "2203001", mode: "insensitive" } },
          {
            studentProfile: {
              studentId: { equals: "2203001", mode: "insensitive" },
            },
          },
        ],
      },
      include: {
        studentProfile: {
          select: {
            studentId: true,
          },
        },
      },
    });
  });
});

describe("User Resolver Integration Tests (Seeded Database)", () => {
  it("resolves a seeded student by student ID (2203001)", async () => {
    const user = await resolveUserByIdentifier("2203001", prisma);
    expect(user).not.toBeNull();
    expect(user?.role).toBe("STUDENT");
    expect(user?.studentProfile?.studentId).toBe("2203001");
    expect(user?.email).toBe("2203001@student.ruet.ac.bd");
    expect(user?.isActive).toBe(true);
  });

  it("resolves a seeded student by institutional email (case-insensitive)", async () => {
    const user = await resolveUserByIdentifier(
      "2203001@STUDENT.ruet.ac.bd",
      prisma
    );
    expect(user).not.toBeNull();
    expect(user?.role).toBe("STUDENT");
    expect(user?.email).toBe("2203001@student.ruet.ac.bd");
  });

  it("resolves a seeded teacher by email (arahman@cse.ruet.ac.bd)", async () => {
    const user = await resolveUserByIdentifier(
      "arahman@cse.ruet.ac.bd",
      prisma
    );
    expect(user).not.toBeNull();
    expect(user?.role).toBe("TEACHER");
    expect(user?.name).toBe("Dr. A. Rahman");
  });

  it("resolves the seeded super admin by email (admin@ruet.ac.bd)", async () => {
    const user = await resolveUserByIdentifier("admin@ruet.ac.bd", prisma);
    expect(user).not.toBeNull();
    expect(user?.role).toBe("SUPER_ADMIN");
    expect(user?.name).toBe("System Super Admin");
  });

  it("returns null for non-existent identifier", async () => {
    const user = await resolveUserByIdentifier("nonexistent-id-9999", prisma);
    expect(user).toBeNull();
  });
});
