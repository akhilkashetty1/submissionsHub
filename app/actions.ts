"use server";

import { redirect } from "next/navigation";
import { authConfigured, clientIp, endSession, getSession, safeEqual, startSession, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { deleteByIds, deleteMatching } from "@/lib/submissions";

const MAX_FAILURES = 8;
const WINDOW = "15 minutes";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!authConfigured()) return { error: "Admin login isn't set up yet (ADMIN_USERNAME, ADMIN_PASSWORD_HASH, SESSION_SECRET)." };

  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const ip = await clientIp();

  const [{ n }] = await query<{ n: number }>(
    `select count(*)::int as n from login_failures where ip = $1 and at > now() - interval '${WINDOW}'`,
    [ip],
  );
  if (n >= MAX_FAILURES) return { error: "Too many attempts. Try again in 15 minutes." };

  // Always run the password check so a wrong username takes as long as a wrong password.
  const passwordOk = verifyPassword(password, process.env.ADMIN_PASSWORD_HASH!);
  const usernameOk = safeEqual(username.toLowerCase(), process.env.ADMIN_USERNAME!.toLowerCase());
  if (!passwordOk || !usernameOk) {
    await query(`insert into login_failures (ip) values ($1)`, [ip]);
    await query(`delete from login_failures where at < now() - interval '1 day'`);
    return { error: "Wrong username or password." };
  }

  await query(`delete from login_failures where ip = $1`, [ip]);
  await startSession(process.env.ADMIN_USERNAME!);
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/* ------------------------------------------------------------------ delete */

export type DeleteResult = { ok: true; deleted: number } | { ok: false; error: string };

/** Every delete re-checks the login: a server action is a public endpoint, not just a button. */
async function authorise(projectId: unknown) {
  if (!(await getSession())) return { ok: false, error: "Your session expired. Sign in again to delete." } as const;
  const project = typeof projectId === "string" ? getProject(projectId) : undefined;
  if (!project) return { ok: false, error: "Unknown project." } as const;
  return { ok: true, project } as const;
}

/** Permanently deletes the chosen submissions. There is no undo. */
export async function deleteSubmissions(projectId: string, ids: string[]): Promise<DeleteResult> {
  const auth = await authorise(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!Array.isArray(ids) || !ids.length) return { ok: false, error: "Nothing selected." };
  try {
    const deleted = await deleteByIds(auth.project.id, ids.map(String));
    console.log(`Deleted ${deleted} ${auth.project.id} submission(s) by id`);
    return { ok: true, deleted };
  } catch (err) {
    console.error("Delete failed", err);
    return { ok: false, error: "Could not delete. Try again." };
  }
}

/** Permanently deletes everything matching the current search/date filters (or the whole project when there are none). */
export async function deleteAllMatching(projectId: string, filters: { q?: string; from?: string; to?: string }): Promise<DeleteResult> {
  const auth = await authorise(projectId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const clean = (v: unknown) => (typeof v === "string" ? v : "");
  try {
    const deleted = await deleteMatching(auth.project.id, { q: clean(filters?.q), from: clean(filters?.from), to: clean(filters?.to) });
    console.log(`Deleted ${deleted} ${auth.project.id} submission(s) by filter`);
    return { ok: true, deleted };
  } catch (err) {
    console.error("Delete failed", err);
    return { ok: false, error: "Could not delete. Try again." };
  }
}
