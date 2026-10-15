import "server-only";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Single admin login. Credentials live in the environment:
 *   ADMIN_USERNAME, ADMIN_PASSWORD_HASH (from `npm run hash-password`),
 *   SESSION_SECRET (from `npm run secrets`).
 * Sessions are a signed, httpOnly cookie — no session table needed.
 */

const COOKIE = "hub_session";
const SESSION_DAYS = 7;

export function authConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH && (process.env.SESSION_SECRET?.length ?? 0) >= 32);
}

/** Format: scrypt.<salt>.<hash>, base64url — no `$`, so .env files can't mangle it. */
export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt.${salt.toString("base64url")}.${scryptSync(password, salt, 64).toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(".");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const sign = (payload: string) => createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("base64url");

export async function startSession(username: string) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = Buffer.from(JSON.stringify({ u: username, exp })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(exp),
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<{ username: string } | null> {
  if (!authConfigured()) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    // A changed username (or rotated SESSION_SECRET) logs everyone out.
    if (typeof exp !== "number" || exp < Date.now() || u !== process.env.ADMIN_USERNAME) return null;
    return { username: u };
  } catch {
    return null;
  }
}

/** For admin pages: bounce to /login without a valid session. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Best-effort client IP behind Vercel's proxy. */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
