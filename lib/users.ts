import "server-only";
import { query, transaction } from "@/lib/db";
import { ACCESS_AREAS, isLevel, type Level } from "@/lib/permissions";

export type DbUser = {
  id: number;
  username: string;
  displayName: string;
  passwordHash: string;
  isAdmin: boolean;
  active: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
  createdAt: Date;
  createdBy: string | null;
  lastLoginAt: Date | null;
  access: Record<string, Level>;
};

const SELECT = `
  select u.id::int as id, u.username, u.display_name as "displayName", u.password_hash as "passwordHash",
         u.is_admin as "isAdmin", u.active, u.must_change_password as "mustChangePassword",
         u.session_version as "sessionVersion", u.created_at as "createdAt", u.created_by as "createdBy",
         u.last_login_at as "lastLoginAt",
         coalesce((select json_object_agg(a.project, a.level) from user_access a where a.user_id = u.id), '{}'::json) as access
  from users u`;

/** Only known portals and valid levels survive, whatever was sent. */
function cleanAccess(access: Record<string, unknown>) {
  const out: Record<string, Level> = {};
  for (const p of ACCESS_AREAS) {
    const level = access?.[p.id];
    if (isLevel(level)) out[p.id] = level;
  }
  return out;
}

export async function getUserById(id: number) {
  const [row] = await query<DbUser>(`${SELECT} where u.id = $1`, [id]);
  return row ?? null;
}

export async function getUserByUsername(username: string) {
  const [row] = await query<DbUser>(`${SELECT} where lower(u.username) = lower($1)`, [username]);
  return row ?? null;
}

export async function listUsers() {
  return query<DbUser>(`${SELECT} order by u.active desc, lower(u.display_name)`);
}

export async function createUser(input: {
  username: string;
  displayName: string;
  passwordHash: string;
  isAdmin: boolean;
  access: Record<string, unknown>;
  createdBy: string;
}) {
  return transaction(async (q) => {
    const [{ id }] = await q<{ id: number }>(
      `insert into users (username, display_name, password_hash, is_admin, created_by)
       values ($1, $2, $3, $4, $5) returning id::int as id`,
      [input.username, input.displayName, input.passwordHash, input.isAdmin, input.createdBy],
    );
    for (const [project, level] of Object.entries(cleanAccess(input.access))) {
      await q(`insert into user_access (user_id, project, level) values ($1, $2, $3)`, [id, project, level]);
    }
    return id;
  });
}

export async function updateUser(id: number, input: { displayName: string; isAdmin: boolean; active: boolean; access: Record<string, unknown> }) {
  await transaction(async (q) => {
    await q(
      `update users set display_name = $2, is_admin = $3, active = $4,
              session_version = case when $4 = false then session_version + 1 else session_version end
       where id = $1`,
      [id, input.displayName, input.isAdmin, input.active],
    );
    await q(`delete from user_access where user_id = $1`, [id]);
    for (const [project, level] of Object.entries(cleanAccess(input.access))) {
      await q(`insert into user_access (user_id, project, level) values ($1, $2, $3)`, [id, project, level]);
    }
  });
}

/** Changing a password signs that person out everywhere (session_version moves on). */
export async function setPassword(id: number, passwordHash: string, mustChange: boolean) {
  await query(
    `update users set password_hash = $2, must_change_password = $3, session_version = session_version + 1 where id = $1`,
    [id, passwordHash, mustChange],
  );
}

/** The person changing their own password stays signed in, so return the new session version. */
export async function setOwnPassword(id: number, passwordHash: string) {
  const [row] = await query<{ v: number }>(
    `update users set password_hash = $2, must_change_password = false, session_version = session_version + 1 where id = $1 returning session_version as v`,
    [id, passwordHash],
  );
  return row.v;
}

export async function deleteUser(id: number) {
  await query(`delete from users where id = $1`, [id]);
}

export async function touchLogin(id: number) {
  await query(`update users set last_login_at = now() where id = $1`, [id]);
}

export async function countActiveAdmins() {
  const [r] = await query<{ n: number }>(`select count(*)::int as n from users where is_admin and active`);
  return r.n;
}
