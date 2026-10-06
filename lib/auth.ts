import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resolveUserByIdentifier } from "@/lib/auth/user-resolver";
import { authRateLimiter, getAuthRateLimitKey } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/utils/ip";
import { Role } from "@prisma/client";

export const GENERIC_AUTH_ERROR = "Incorrect ID or password";
export const RATE_LIMIT_ERROR =
  "Too many failed login attempts. Please try again in 15 minutes.";

export * from "./auth/errors";
export * from "./auth/session";
export * from "./auth/guards";
export * from "./auth/scopes";
export * from "./auth/user-resolver";

export async function authorizeCredentials(
  credentials: Record<string, string> | undefined,
  req?: { headers?: Record<string, string | string[] | undefined> | Headers }
) {
  if (!credentials?.identifier || !credentials?.password) {
    throw new Error(GENERIC_AUTH_ERROR);
  }

  const clientIp = getClientIp(req?.headers);
  const rateLimitKey = getAuthRateLimitKey(
    credentials.identifier,
    clientIp
  );

  // 1. Check rate limit before performing authentication
  const rateLimitStatus = await authRateLimiter.check(rateLimitKey);
  if (!rateLimitStatus.allowed) {
    try {
      await prisma.auditLog.create({
        data: {
          action: "LOGIN_FAILED",
          objectType: "User",
          objectId: "rate-limited",
          userId: null,
          description: `Login attempt blocked: rate limit exceeded for identifier: ${credentials.identifier.slice(0, 80)}`,
          ip: clientIp,
        },
      });
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }
    throw new Error(RATE_LIMIT_ERROR);
  }

  // 2. Resolve user by institutional email or student ID
  const user = await resolveUserByIdentifier(credentials.identifier);

  if (!user) {
    // Record failed attempt
    await authRateLimiter.recordFailure(rateLimitKey);

    // Audit log failure without storing sensitive data
    try {
      await prisma.auditLog.create({
        data: {
          action: "LOGIN_FAILED",
          objectType: "User",
          objectId: "unknown",
          userId: null,
          description: `Failed login attempt for identifier: ${credentials.identifier.slice(0, 80)}`,
          ip: clientIp,
        },
      });
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }

    throw new Error(GENERIC_AUTH_ERROR);
  }

  // 3. Reject inactive users with identical generic error
  if (!user.isActive) {
    await authRateLimiter.recordFailure(rateLimitKey);

    try {
      await prisma.auditLog.create({
        data: {
          action: "LOGIN_FAILED",
          objectType: "User",
          objectId: user.id,
          userId: user.id,
          description: "Failed login attempt: account is inactive",
          ip: clientIp,
        },
      });
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }

    throw new Error(GENERIC_AUTH_ERROR);
  }

  // 4. Verify password with bcrypt
  const isPasswordValid = await bcrypt.compare(
    credentials.password,
    user.passwordHash
  );

  if (!isPasswordValid) {
    await authRateLimiter.recordFailure(rateLimitKey);

    try {
      await prisma.auditLog.create({
        data: {
          action: "LOGIN_FAILED",
          objectType: "User",
          objectId: user.id,
          userId: user.id,
          description: "Failed login attempt: invalid password",
          ip: clientIp,
        },
      });
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }

    throw new Error(GENERIC_AUTH_ERROR);
  }

  // 5. Success: reset rate limiter, update lastActiveAt, record audit log
  await authRateLimiter.reset(rateLimitKey);

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        action: "LOGIN_SUCCESS",
        objectType: "User",
        objectId: user.id,
        userId: user.id,
        description: "User logged in successfully",
        ip: clientIp,
      },
    });
  } catch (e) {
    console.error("Failed to record login activity/audit:", e);
  }

  // Return user session payload (NEVER include passwordHash or sensitive fields)
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    tokenVersion: user.tokenVersion,
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours in seconds
  },
  jwt: {
    maxAge: 8 * 60 * 60, // 8 hours
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-next-auth.session-token"
          : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Institutional Credentials",
      credentials: {
        identifier: { label: "Student ID or Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
        token.tokenVersion = user.tokenVersion;
      }
      if (trigger === "update" && session) {
        if (typeof session.mustChangePassword === "boolean") {
          token.mustChangePassword = session.mustChangePassword;
        }
        if (typeof session.tokenVersion === "number") {
          token.tokenVersion = session.tokenVersion;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        if (token.id) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id as string },
              select: {
                tokenVersion: true,
                mustChangePassword: true,
                isActive: true,
              },
            });

            if (!dbUser || !dbUser.isActive) {
              return null as unknown as typeof session;
            }

            // Invalidate session if tokenVersion differs (e.g. password was reset)
            if (
              token.tokenVersion !== undefined &&
              dbUser.tokenVersion !== token.tokenVersion
            ) {
              return null as unknown as typeof session;
            }

            session.user.mustChangePassword = dbUser.mustChangePassword;
            token.mustChangePassword = dbUser.mustChangePassword;
          } catch (e) {
            console.error("Session DB check error:", e);
          }
        }

        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.mustChangePassword = Boolean(token.mustChangePassword);
        session.user.tokenVersion = token.tokenVersion as number | undefined;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
