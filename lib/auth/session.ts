import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/errors";
import { Role } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
  tokenVersion?: number;
}

/**
 * Ensures the caller is authenticated. Returns the active session user or throws 401 Unauthorized.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  return session.user as AuthenticatedUser;
}

/**
 * Ensures the caller has one of the allowed roles.
 * Returns the user or throws 401 (if unauthenticated) or 403 Forbidden (if unauthorized).
 */
export async function requireRole(...roles: Role[]): Promise<AuthenticatedUser> {
  const user = await requireUser();

  if (!roles.includes(user.role)) {
    throw new ForbiddenError(
      `Access denied. Role '${user.role}' is not authorized to access this resource.`
    );
  }

  return user;
}
