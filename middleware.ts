import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // In production, block the dev design-system showcase
  if (pathname.startsWith("/dev") && process.env.NODE_ENV === "production") {
    const forbiddenUrl = new URL("/forbidden", request.url);
    return NextResponse.redirect(forbiddenUrl);
  }

  // 1. Static files, Next internals, icons, health check, and auth callbacks
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    (pathname.startsWith("/dev") && process.env.NODE_ENV !== "production") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Public auth and error pages, and public homepage
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/reset-password") ||
    pathname === "/forbidden"
  ) {
    return NextResponse.next();
  }

  // 3. Retrieve user session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // 4. Unauthenticated users are redirected to /login with callbackUrl
  if (!token) {
    const callback = encodeURIComponent(pathname + (search || ""));
    const loginUrl = new URL(`/login?callbackUrl=${callback}`, request.url);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Forced password change redirect (cannot be bypassed by typing another URL)
  if (Boolean(token.mustChangePassword)) {
    if (pathname !== "/change-password") {
      const changePasswordUrl = new URL("/change-password", request.url);
      return NextResponse.redirect(changePasswordUrl);
    }
    return NextResponse.next();
  }

  // If user is already on /change-password voluntary, allow it
  if (pathname === "/change-password") {
    return NextResponse.next();
  }

  // 6. Role-based route guards
  // /admin/users & /admin/courses -> SUPER_ADMIN or DEPT_ADMIN
  if (
    pathname.startsWith("/admin/users") ||
    pathname.startsWith("/admin/courses")
  ) {
    if (token.role !== "SUPER_ADMIN" && token.role !== "DEPT_ADMIN") {
      const forbiddenUrl = new URL("/forbidden", request.url);
      return NextResponse.redirect(forbiddenUrl);
    }
  } else if (pathname.startsWith("/admin")) {
    // Other /admin/* routes -> SUPER_ADMIN only
    if (token.role !== "SUPER_ADMIN") {
      const forbiddenUrl = new URL("/forbidden", request.url);
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  // /dept/* -> DEPT_ADMIN or SUPER_ADMIN
  if (pathname.startsWith("/dept")) {
    if (token.role !== "DEPT_ADMIN" && token.role !== "SUPER_ADMIN") {
      const forbiddenUrl = new URL("/forbidden", request.url);
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  // /teach/* -> TEACHER or SUPER_ADMIN
  if (pathname.startsWith("/teach")) {
    if (token.role !== "TEACHER" && token.role !== "SUPER_ADMIN") {
      const forbiddenUrl = new URL("/forbidden", request.url);
      return NextResponse.redirect(forbiddenUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
