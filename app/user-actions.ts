"use server";

import { authoriseAdmin } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { clientIp, getCurrentUser, startSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { generatePassword, hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { ACCESS_AREAS } from "@/lib/permissions";
import { createUser, deleteUser, getUserById, getUserByUsername, setOwnPassword, setPassword, updateUser } from "@/lib/users";
import type { Result } from "@/app/record-actions";

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

type UserInput = { displayName: string; isAdmin: boolean; active?: boolean; access: Record<string, string> };

const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, 60) : "");

function describeAccess(access: Record<string, unknown>) {
  return Object.fromEntries(ACCESS_AREAS.filter((p) => access?.[p.id]).map((p) => [p.id, access[p.id]]));
}

/** Add a person. Leave the password blank to have one generated; it's shown once, and they must change it at first sign-in. */
export async function createUserAction(input: UserInput & { username: string; password: string }): Promise<Result<{ id: number; username: string; password: string }>> {
  const auth = await authoriseAdmin();
  if (!auth.ok) return auth;

  const username = String(input?.username ?? "").trim().toLowerCase();
  if (!USERNAME.test(username)) return { ok: false, error: "Username: 3–32 characters, lowercase letters, numbers, dots, dashes or underscores." };
  if (username === process.env.ADMIN_USERNAME?.toLowerCase()) return { ok: false, error: "That username is reserved for the owner account." };
  if (await getUserByUsername(username)) return { ok: false, error: "That username is already taken." };

  const password = String(input?.password ?? "").trim() || generatePassword();
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };

  try {
    const id = await createUser({
      username,
      displayName: cleanName(input?.displayName) || username,
      passwordHash: hashPassword(password),
      isAdmin: input?.isAdmin === true,
      access: input?.access ?? {},
      createdBy: auth.user.username,
    });
    await logActivity(auth.user.username, "user.create", null, { user: username, admin: input?.isAdmin === true, access: describeAccess(input?.access ?? {}) });
    return { ok: true, id, username, password };
  } catch (err) {
    console.error("createUser failed", err);
    return { ok: false, error: "Could not create the user. Try again." };
  }
}

/** Change a person's name, admin status, active status and per-portal access. Takes effect immediately. */
export async function updateUserAction(id: number, input: UserInput): Promise<Result> {
  const auth = await authoriseAdmin();
  if (!auth.ok) return auth;
  const target = await getUserById(Number(id));
  if (!target) return { ok: false, error: "That user no longer exists." };

  const isAdmin = input?.isAdmin === true;
  const active = input?.active !== false;
  if (target.id === auth.user.id && (!active || !isAdmin)) return { ok: false, error: "You can't disable or demote your own account." };

  try {
    await updateUser(target.id, { displayName: cleanName(input?.displayName) || target.username, isAdmin, active, access: input?.access ?? {} });
    await logActivity(auth.user.username, "user.update", null, {
      user: target.username,
      admin: isAdmin,
      active,
      access: describeAccess(input?.access ?? {}),
    });
    return { ok: true };
  } catch (err) {
    console.error("updateUser failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}

/** Give someone a new password (shown once). They're signed out everywhere and must choose their own next. */
export async function resetPasswordAction(id: number, password: string): Promise<Result<{ password: string }>> {
  const auth = await authoriseAdmin();
  if (!auth.ok) return auth;
  const target = await getUserById(Number(id));
  if (!target) return { ok: false, error: "That user no longer exists." };
  if (target.id === auth.user.id) return { ok: false, error: "Change your own password from the Account page." };

  const next = String(password ?? "").trim() || generatePassword();
  const problem = passwordProblem(next);
  if (problem) return { ok: false, error: problem };

  await setPassword(target.id, hashPassword(next), true);
  await logActivity(auth.user.username, "user.password_reset", null, { user: target.username });
  return { ok: true, password: next };
}

/** Remove someone for good. Their notes stay, still showing their name. */
export async function deleteUserAction(id: number): Promise<Result> {
  const auth = await authoriseAdmin();
  if (!auth.ok) return auth;
  const target = await getUserById(Number(id));
  if (!target) return { ok: false, error: "That user no longer exists." };
  if (target.id === auth.user.id) return { ok: false, error: "You can't delete your own account." };

  await deleteUser(target.id);
  await logActivity(auth.user.username, "user.delete", null, { user: target.username });
  return { ok: true };
}

/** Everyone changes their own password here (the owner's lives in the Vercel settings). */
export async function changePasswordAction(current: string, next: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };
  if (user.isOwner) return { ok: false, error: "The owner password is set in the Vercel environment settings." };

  const ip = await clientIp();
  const [{ n }] = await query<{ n: number }>(`select count(*)::int as n from login_failures where ip = $1 and at > now() - interval '15 minutes'`, [ip]);
  if (n >= 8) return { ok: false, error: "Too many attempts. Try again in 15 minutes." };

  const row = await getUserById(user.id);
  if (!row || !verifyPassword(String(current ?? ""), row.passwordHash)) {
    await query(`insert into login_failures (ip) values ($1)`, [ip]);
    return { ok: false, error: "Your current password isn't right." };
  }
  const password = String(next ?? "");
  const problem = passwordProblem(password);
  if (problem) return { ok: false, error: problem };
  if (password === current) return { ok: false, error: "Choose a different password from the current one." };

  const version = await setOwnPassword(row.id, hashPassword(password));
  await startSession({ id: row.id, username: row.username, version }); // stay signed in on this device
  return { ok: true };
}
