import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { can, type AppUser, type Level } from "@/lib/permissions";
import { getProject, type Project } from "@/lib/projects";
import { getSite, siteAccessId, type Site } from "@/lib/sites";

export type Authorised<T> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * The gate for every server action. An action is a public web address, not just a
 * button, so each one asks here: signed in, password up to date, portal exists, and
 * enough access on it.
 */
export async function authorise(projectId: unknown, need: Level): Promise<Authorised<{ user: AppUser; project: Project }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };
  if (user.mustChangePassword) return { ok: false, error: "Set a new password first (Account page)." };
  const project = typeof projectId === "string" ? getProject(projectId) : undefined;
  if (!project) return { ok: false, error: "Unknown portal." };
  if (!can(user, project.id, need)) {
    return { ok: false, error: need === "read" ? "You don't have access to this portal." : "You don't have permission to do that here." };
  }
  return { ok: true, user, project };
}

export async function authoriseAdmin(): Promise<Authorised<{ user: AppUser }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };
  if (!user.isAdmin || user.mustChangePassword) return { ok: false, error: "Only admins can do that." };
  return { ok: true, user };
}

/** The same gate for a website's photo editor (access id `site:<id>`). */
export async function authoriseSite(siteId: unknown, need: Level): Promise<Authorised<{ user: AppUser; site: Site }>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };
  if (user.mustChangePassword) return { ok: false, error: "Set a new password first (Account page)." };
  const site = typeof siteId === "string" ? getSite(siteId) : undefined;
  if (!site) return { ok: false, error: "Unknown website." };
  if (!can(user, siteAccessId(site.id), need)) {
    return { ok: false, error: need === "manage" ? "Only a Manager of this website can publish." : "You don't have permission to do that here." };
  }
  return { ok: true, user, site };
}
