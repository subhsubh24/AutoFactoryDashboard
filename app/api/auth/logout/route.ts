import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** Clear the auth cookie and return to the login page. */
export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
