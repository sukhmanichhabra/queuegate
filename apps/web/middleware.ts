import { NextRequest, NextResponse } from "next/server";

/**
 * Protected routes — any path that starts with one of these prefixes
 * requires the user to be authenticated (accessToken in localStorage is
 * not available server-side, so we use the custom header set by the
 * client-side API interceptor OR the presence of the cookie).
 *
 * Because Next.js middleware runs on the Edge (no localStorage), we rely
 * on a Bearer token in the Authorization header OR a "qg_logged_in"
 * cookie that the login flow sets as a plain (non-HttpOnly) cookie so
 * middleware can read it.
 */

const PROTECTED_PREFIXES = [
  "/events",
  "/tickets",
];

const PUBLIC_PATHS = [
  "/",           // landing page — always public
  "/login",
  "/register",
  "/(auth)",
];

function isProtected(pathname: string): boolean {
  // Allow the bare landing page and auth pages
  for (const pub of PUBLIC_PATHS) {
    if (pathname === pub || pathname.startsWith(pub + "/")) return false;
  }
  for (const prefix of PROTECTED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  // Check for the lightweight "qg_logged_in" indicator cookie
  // (set by the login page; NOT HttpOnly so the middleware can read it)
  const loggedInCookie = request.cookies.get("qg_logged_in");

  if (loggedInCookie?.value === "1") {
    // User is authenticated — allow through
    return NextResponse.next();
  }

  // Not authenticated → redirect to /login, preserving the intended URL
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("returnUrl", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Match all app routes except Next.js internals and static files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|videos|images|public).*)",
  ],
};
