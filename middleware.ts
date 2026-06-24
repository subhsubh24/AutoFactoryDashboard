import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken, safeEqual } from "@/lib/auth";

/**
 * Password gate. Anything not explicitly excluded by `config.matcher` below
 * requires a valid auth cookie; otherwise we bounce to /login?next=<path>.
 *
 * When no DASHBOARD_PASSWORD is configured `expectedToken()` returns null and
 * we let every request through (gate disabled).
 */
export async function middleware(req: NextRequest) {
  const expected = await expectedToken();

  // Gate disabled (no password configured) — allow everything.
  if (!expected) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token && safeEqual(token, expected)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const target = req.nextUrl.pathname + req.nextUrl.search;
  if (target && target !== "/") url.searchParams.set("next", target);
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything except Next internals, static assets, the login page,
  // the auth endpoints, and the cron endpoint (which authenticates itself).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|login|api/auth|api/cron|.*\\.(?:png|jpe?g|gif|svg|ico|webp|woff2?)).*)",
  ],
};
