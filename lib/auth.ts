/**
 * Single-password gate.
 *
 * Edge-safe: uses only Web Crypto + Web globals so it can be imported from
 * `middleware.ts` (Edge runtime) and from Node route handlers alike.
 *
 * The browser never sees the password. On a correct login we store a SHA-256
 * token of the password in an httpOnly cookie; the middleware recomputes the
 * expected token from `DASHBOARD_PASSWORD` and compares.
 *
 * If `DASHBOARD_PASSWORD` is unset the gate is treated as DISABLED so the app
 * stays usable in local/preview environments — set the env var to protect it.
 */

export const AUTH_COOKIE = "afd_auth";

/** The configured dashboard password, or undefined when the gate is off. */
export function dashboardPassword(): string | undefined {
  const pw = process.env.DASHBOARD_PASSWORD;
  return pw && pw.length > 0 ? pw : undefined;
}

/** True when a password is configured and the gate should be enforced. */
export function isAuthConfigured(): boolean {
  return dashboardPassword() !== undefined;
}

const toHex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return toHex(sig);
}

/**
 * Cookie token for a given plaintext password. When AUTH_SECRET is configured we
 * key the token with it (HMAC) so a leaked cookie can't be brute-forced offline
 * against the open-source prefix; without it we fall back to the plain hash
 * (unchanged — the gate still works with only DASHBOARD_PASSWORD set).
 */
export function tokenForPassword(password: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  return secret
    ? hmacSha256Hex(secret, `afd::v1::${password}`)
    : sha256Hex(`afd::v1::${password}`);
}

/** Expected cookie token for the configured password (null when disabled). */
export async function expectedToken(): Promise<string | null> {
  const pw = dashboardPassword();
  if (!pw) return null;
  return tokenForPassword(pw);
}

/** Length-aware constant-time-ish string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Sanitize a post-login redirect target so it can only point to a same-site
 * path (never an absolute URL / protocol-relative open redirect).
 */
export function sanitizeNext(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}
