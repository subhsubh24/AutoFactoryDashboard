import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  dashboardPassword,
  expectedToken,
  safeEqual,
  sanitizeNext,
  tokenForPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Login. Accepts a urlencoded form POST with `password` (and optional `next`).
 * On success sets the auth cookie and 303-redirects to `next`.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const submitted = String(form.get("password") ?? "");
  const next = sanitizeNext(String(form.get("next") ?? "/"));

  const configured = dashboardPassword();

  // Gate disabled: nothing to check, just continue.
  if (!configured) {
    return NextResponse.redirect(new URL(next, req.url), { status: 303 });
  }

  // Compare the derived tokens (fixed-length hex), never the raw plaintext — a
  // length-aware compare on plaintext would leak the configured password's length.
  const token = await tokenForPassword(submitted);
  const expected = await expectedToken();
  if (!expected || !safeEqual(token, expected)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("error", "1");
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
