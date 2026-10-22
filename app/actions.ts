"use server";

import { redirect } from "next/navigation";
import { authConfigured, clientIp, endSession, startSession } from "@/lib/auth";
import { authorise } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { query } from "@/lib/db";
import { DUMMY_HASH, safeEqual, verifyPassword } from "@/lib/password";
import { deleteByIds, deleteMatching, type Filters } from "@/lib/submissions";
import { cleanFilters } from "@/lib/filters";
import { getUserByUsername, touchLogin } from "@/lib/users";

const MAX_FAILURES = 8;
const WINDOW = "15 minutes";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!authConfigured()) return { error: "Sign-in isn't set up yet (ADMIN_USERNAME, ADMIN_PASSWORD_HASH, SESSION_SECRET)." };

  const username = String(form.get("username") ?? "").trim().slice(0, 64);
  const password = String(form.get("password") ?? "").slice(0, 200);
  const ip = await clientIp();

  const [{ n }] = await query<{ n: number }>(
    `select count(*)::int as n from login_failures where ip = $1 and at > now() - interval '${WINDOW}'`,
    [ip],
  );
  if (n >= MAX_FAILURES) return { error: "Too many attempts. Try again in 15 minutes." };

  let who: { id: number; username: string; version: number } | null = null;
  let mustChange = false;
  let disabled = false;

  if (safeEqual(username.toLowerCase(), process.env.ADMIN_USERNAME!.toLowerCase())) {
    // The owner account from the environment settings.
    if (verifyPassword(password, process.env.ADMIN_PASSWORD_HASH!)) who = { id: 0, username: process.env.ADMIN_USERNAME!, version: 0 };
  } else {
    // Everyone else. The password check always runs, so an unknown name takes as long as a wrong password.
    const user = username ? await getUserByUsername(username) : null;
    const passwordOk = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (user && passwordOk) {
      if (!user.active) disabled = true;
      else {
        who = { id: user.id, username: user.username, version: user.sessionVersion };
        mustChange = user.mustChangePassword;
        await touchLogin(user.id);
      }
    }
  }

  if (disabled) return { error: "This account has been disabled. Ask an admin to turn it back on." };
  if (!who) {
    await query(`insert into login_failures (ip) values ($1)`, [ip]);
    await query(`delete from login_failures where at < now() - interval '1 day'`);
    return { error: "Wrong username or password." };
  }

  await query(`delete from login_failures where ip = $1`, [ip]);
  await startSession(who);
  if (mustChange) redirect("/account");
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

/* ------------------------------------------------------------------ delete */

export type DeleteResult = { ok: true; deleted: number } | { ok: false; error: string };

/** Permanently deletes the chosen submissions. Needs Manager on that portal. There is no undo. */
export async function deleteSubmissions(projectId: string, ids: string[]): Promise<DeleteResult> {
  const auth = await authorise(projectId, "manage");
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!Array.isArray(ids) || !ids.length) return { ok: false, error: "Nothing selected." };
  try {
    const deleted = await deleteByIds(auth.project.id, ids.map(String));
    await logActivity(auth.user.username, "records.delete", auth.project.id, { count: deleted, how: "selected" });
    return { ok: true, deleted };
  } catch (err) {
    console.error("Delete failed", err);
    return { ok: false, error: "Could not delete. Try again." };
  }
}


/** Permanently deletes everything matching the current filters (or the whole portal when there are none). */
export async function deleteAllMatching(projectId: string, filters: Filters): Promise<DeleteResult> {
  const auth = await authorise(projectId, "manage");
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const f = cleanFilters(filters);
    const deleted = await deleteMatching(auth.project.id, f);
    await logActivity(auth.user.username, "records.delete", auth.project.id, {
      count: deleted,
      how: "all matching",
      filters: Object.fromEntries(Object.entries(f).filter(([, v]) => v)),
    });
    return { ok: true, deleted };
  } catch (err) {
    console.error("Delete failed", err);
    return { ok: false, error: "Could not delete. Try again." };
  }
}
