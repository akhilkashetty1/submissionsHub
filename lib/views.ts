import "server-only";
import { query } from "@/lib/db";

/**
 * A person's saved table layout for one portal: which columns, in what order, how wide.
 * Stored on the server, so it follows them to any device, and the page renders with it
 * on the first paint (no flash of the default columns).
 */
export type View = { columns: string[] | null; widths: Record<string, number> };

export const MAX_VIEW_COLUMNS = 300;
export const MIN_WIDTH = 70;
export const MAX_WIDTH = 900;

export async function getView(userId: number, project: string): Promise<View> {
  const [row] = await query<{ columns: unknown; widths: unknown }>(`select columns, widths from user_views where user_id = $1 and project = $2`, [userId, project]);
  if (!row) return { columns: null, widths: {} };
  const columns = Array.isArray(row.columns) ? row.columns.filter((c): c is string => typeof c === "string") : [];
  const widths = row.widths && typeof row.widths === "object" ? (row.widths as Record<string, number>) : {};
  // An empty saved list means "never customised": fall back to the portal's default columns.
  return { columns: columns.length ? columns : null, widths };
}

/** Whatever is sent is cleaned: strings only, no duplicates, bounded counts and widths. */
export function cleanView(columns: unknown, widths: unknown): { columns: string[]; widths: Record<string, number> } {
  const cols: string[] = [];
  if (Array.isArray(columns)) {
    for (const c of columns) {
      if (typeof c === "string" && c.length > 0 && c.length <= 300 && !cols.includes(c) && cols.length < MAX_VIEW_COLUMNS) cols.push(c);
    }
  }
  const w: Record<string, number> = {};
  if (widths && typeof widths === "object") {
    for (const [k, v] of Object.entries(widths as Record<string, unknown>)) {
      if (k.length <= 300 && typeof v === "number" && Number.isFinite(v) && Object.keys(w).length < MAX_VIEW_COLUMNS) {
        w[k] = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, v)));
      }
    }
  }
  return { columns: cols, widths: w };
}

export async function saveView(userId: number, project: string, columns: string[], widths: Record<string, number>) {
  await query(
    `insert into user_views (user_id, project, columns, widths, updated_at) values ($1, $2, $3, $4, now())
     on conflict (user_id, project) do update set columns = excluded.columns, widths = excluded.widths, updated_at = now()`,
    [userId, project, JSON.stringify(columns), JSON.stringify(widths)],
  );
}

/** Forget the customisation so the portal's default columns apply again. */
export async function resetView(userId: number, project: string) {
  await query(`delete from user_views where user_id = $1 and project = $2`, [userId, project]);
}

/**
 * Every column this portal's records have, in the order the newest form version asks them.
 * Looks at the 1000 most recent records' header lists (distinct ones, so it's cheap even when
 * there are many records), so reworded or removed questions from long ago don't clutter the list.
 */
export async function availableColumns(project: string): Promise<string[]> {
  const rows = await query<{ headers: string[] }>(
    `select headers from (select headers, received_at from submissions where project = $1 order by received_at desc limit 1000) recent
     group by headers order by max(received_at) desc`,
    [project],
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    for (const h of r.headers) {
      if (seen.has(h)) continue;
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}
