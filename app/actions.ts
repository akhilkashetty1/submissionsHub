"use server";

import { redirect } from "next/navigation";
import { authConfigured, clientIp, endSession, safeEqual, startSession, verifyPassword } from "@/lib/auth";
import { query } from "@/lib/db";

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
