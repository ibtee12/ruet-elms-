import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export interface ResolvedUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  tokenVersion?: number;
  studentProfile?: {
    studentId: string;
  } | null;
}

export interface UserResolverDb {
  user: {
    findFirst: (args: {
      where: {
        OR: Array<
          | { email: { equals: string; mode: "insensitive" } }
          | { studentProfile: { studentId: { equals: string; mode: "insensitive" } } }
        >;
      };
      include?: {
        studentProfile?: {
          select?: {
            studentId?: boolean;
          };
        };
      };
    }) => Promise<ResolvedUser | null>;
  };
}

/**
 * Resolves a user account by either their institutional email OR student ID.
 * Performs trimmed, case-insensitive lookup.
 */
export async function resolveUserByIdentifier(
  identifier: string,
  db: UserResolverDb = prisma
): Promise<ResolvedUser | null> {
  const trimmed = identifier?.trim();
  if (!trimmed) {
    return null;
  }

  const user = await db.user.findFirst({
    where: {
      OR: [
        { email: { equals: trimmed, mode: "insensitive" } },
        { studentProfile: { studentId: { equals: trimmed, mode: "insensitive" } } },
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

  return user;
}
