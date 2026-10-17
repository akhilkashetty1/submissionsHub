import "server-only";
import { createHmac } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { can, type AppUser, type Level } from "@/lib/permissions";
import { getProject, type Project } from "@/lib/projects";
import { getSite, siteAccessId, type Site } from "@/lib/sites";
import { safeEqual } from "@/lib/password";
import { getUserById } from "@/lib/users";

export { safeEqual } from "@/lib/password";

/**
 * Sessions are a signed, httpOnly cookie holding who you are and your "session
 * version". Access is looked up fresh on every request, so changing someone's
 * access, disabling them or resetting their password takes effect immediately.
 *
 * Two kinds of people sign in:
 *  - the owner, from ADMIN_USERNAME / ADMIN_PASSWORD_HASH in the environment
 *    (id 0): always an admin, can never be locked out by a mistake in the UI;
 *  - everyone else, stored in the database and managed by an admin.
 */

const COOKIE = "hub_session";
const SESSION_DAYS = 7;

/** The owner login (environment settings) and the signing secret are both set. */
export function authConfigured() {
  return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH && (process.env.SESSION_SECRET?.length ?? 0) >= 32);
}

export function owner(): AppUser {
  return { id: 0, username: process.env.ADMIN_USERNAME!, displayName: "Owner", isAdmin: true, isOwner: true, access: {}, mustChangePassword: false };
}

const sign = (payload: string) => createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("base64url");

export async function startSession(who: { id: number; username: string; version: number }) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = Buffer.from(JSON.stringify({ i: who.id, u: who.username, v: who.version, exp })).toString("base64url");
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

/** Who is signed in right now, or null. Looked up once per request. */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  if (!authConfigured()) return null;
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;

  let session: { i: number; u: string; v: number; exp: number };
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  // Older single-admin cookies have no `i`: they simply ask for a fresh sign-in.
  if (typeof session.exp !== "number" || session.exp < Date.now() || typeof session.i !== "number") return null;

  if (session.i === 0) {
    // The owner. Rotating SESSION_SECRET or renaming ADMIN_USERNAME signs them out.
    return session.u.toLowerCase() === process.env.ADMIN_USERNAME!.toLowerCase() ? owner() : null;
  }

  const user = await getUserById(session.i);
  if (!user || !user.active || user.sessionVersion !== session.v || user.username !== session.u) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    isOwner: false,
    access: user.access,
    mustChangePassword: user.mustChangePassword,
  };
});

/** For pages: bounce to /login without a session, and to the password page when a new password is required. */
export async function requireUser(options: { allowMustChange?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options.allowMustChange) redirect("/account");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return user;
}

/** For project pages: the portal must exist and the person needs at least `need` on it, else "not found". */
export async function requireProjectAccess(projectId: string, need: Level = "read"): Promise<{ user: AppUser; project: Project }> {
  const user = await requireUser();
  const project = getProject(projectId);
  if (!project || !can(user, project.id, need)) notFound();
  return { user, project };
}

/** Best-effort client IP behind Vercel's proxy. */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** For website pages: the site must exist and the person needs at least `need` on it, else "not found". */
export async function requireSiteAccess(siteId: string, need: Level = "read"): Promise<{ user: AppUser; site: Site }> {
  const user = await requireUser();
  const site = getSite(siteId);
  if (!site || !can(user, siteAccessId(site.id), need)) notFound();
  return { user, site };
}
