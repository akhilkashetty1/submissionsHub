import "server-only";
import { query } from "@/lib/db";

export type ActivityRow = { id: string; at: Date; actor: string; action: string; project: string | null; detail: Record<string, unknown> };

/** A short audit trail of the things that can't be undone: deletes and user changes. Never throws. */
export async function logActivity(actor: string, action: string, project: string | null, detail: Record<string, unknown> = {}) {
  try {
    await query(`insert into activity_log (actor, action, project, detail) values ($1, $2, $3, $4)`, [actor, action, project, JSON.stringify(detail)]);
  } catch (err) {
    console.error("Could not write activity log", err);
  }
}

export async function recentActivity(limit = 200) {
  return query<ActivityRow>(`select id::text, at, actor, action, project, detail from activity_log order by at desc, id desc limit $1`, [limit]);
}
