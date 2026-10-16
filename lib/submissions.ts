import "server-only";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import type { Project } from "@/lib/projects";

/**
 * A submission is stored the way the projects already describe their Google
 * Sheet rows: ordered `headers` and matching `values`. The hub never depends
 * on a fixed column list, so a form can add or reword questions freely.
 */

export type Submission = {
  id: string;
  project: string;
  received_at: Date;
  submitted_at: Date | null;
  title: string;
  headers: string[];
  values: string[];
  flagged: string[];
};

export type Incoming = { headers: string[]; values: string[]; submittedAt: Date | null; flagged: string[] };

const MAX_COLUMNS = 300;
const MAX_HEADER = 300;
const MAX_VALUE = 5000;

const asText = (v: unknown) =>
  v == null ? "" : (typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v)).slice(0, MAX_VALUE);

/**
 * Accepts `{ headers: string[], values: unknown[] }` (4W, RoadShield) or
 * `{ fields: { [header]: value } }` (2W's flat object), plus optional
 * `submittedAt` (ISO time the form was completed) and `flagged` (header names).
 */
export function normalize(body: unknown): Incoming | { error: string } {
  if (!body || typeof body !== "object") return { error: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;

  let pairs: [unknown, unknown][];
  if (Array.isArray(b.headers) && Array.isArray(b.values)) {
    if (b.headers.length !== b.values.length) return { error: "headers and values must be the same length" };
    pairs = b.headers.map((h, i) => [h, (b.values as unknown[])[i]]);
  } else if (b.fields && typeof b.fields === "object" && !Array.isArray(b.fields)) {
    pairs = Object.entries(b.fields as Record<string, unknown>);
  } else return { error: "Send { headers, values } or { fields }" };

  if (!pairs.length) return { error: "No fields" };
  if (pairs.length > MAX_COLUMNS) return { error: `At most ${MAX_COLUMNS} fields` };

  const headers: string[] = [];
  const values: string[] = [];
  for (const [h, v] of pairs) {
    let name = typeof h === "string" ? h.trim().slice(0, MAX_HEADER) : "";
    if (!name) return { error: "Every header must be a non-empty string" };
    // Keep repeated header names distinct instead of silently overwriting.
    for (let n = 2; headers.includes(name); n++) name = `${name.replace(/ \(\d+\)$/, "")} (${n})`;
    headers.push(name);
    values.push(asText(v));
  }

  let submittedAt: Date | null = null;
  if (typeof b.submittedAt === "string") {
    const d = new Date(b.submittedAt);
    const age = Date.now() - d.getTime();
    if (age >= -5 * 60_000 && age <= 60 * 86_400_000) submittedAt = d;
  }

  const flagged = Array.isArray(b.flagged) ? b.flagged.filter((f): f is string => typeof f === "string" && headers.includes(f)) : [];
  return { headers, values, submittedAt, flagged };
}

export async function insertSubmission(project: Project, s: Incoming, origin: string | null) {
  // Identical resubmissions (e.g. an offline outbox retrying after a lost response) are stored once.
  const fingerprint = createHash("sha256").update(JSON.stringify([s.headers, s.values])).digest("hex");
  const titleIndex = s.headers.indexOf(project.titleColumn);
  const title = titleIndex >= 0 ? s.values[titleIndex].slice(0, 200) : "";
  const search = s.values.join(" • ").toLowerCase().slice(0, 50_000);

  const rows = await query<{ id: string }>(
    `insert into submissions (project, submitted_at, title, headers, "values", flagged, search, fingerprint, origin)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (project, fingerprint) do nothing
     returning id`,
    [project.id, s.submittedAt, title, JSON.stringify(s.headers), JSON.stringify(s.values), JSON.stringify(s.flagged), search, fingerprint, origin],
  );
  return rows[0]?.id ?? null;
}

/* ------------------------------------------------------------- reading */

export type Filters = { q?: string; from?: string; to?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function where(project: string, f: Filters) {
  const clauses = ["project = $1"];
  const params: unknown[] = [project];
  if (f.q?.trim()) {
    params.push(`%${f.q.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    clauses.push(`search like $${params.length}`);
  }
  // Dates are calendar days in India time.
  if (f.from && DATE.test(f.from)) {
    params.push(f.from);
    clauses.push(`received_at >= ($${params.length}::date::timestamp at time zone 'Asia/Kolkata')`);
  }
  if (f.to && DATE.test(f.to)) {
    params.push(f.to);
    clauses.push(`received_at < (($${params.length}::date + 1)::timestamp at time zone 'Asia/Kolkata')`);
  }
  return { sql: clauses.join(" and "), params };
}

const COLUMNS = `id::text, project, received_at, submitted_at, title, headers, "values", flagged`;

export async function listSubmissions(project: string, f: Filters, page: number, pageSize: number) {
  const w = where(project, f);
  const [{ count }] = await query<{ count: string }>(`select count(*)::text as count from submissions where ${w.sql}`, w.params);
  const rows = await query<Submission>(
    `select ${COLUMNS} from submissions where ${w.sql} order by received_at desc, id desc limit $${w.params.length + 1} offset $${w.params.length + 2}`,
    [...w.params, pageSize, (page - 1) * pageSize],
  );
  return { rows, total: Number(count) };
}

export async function exportSubmissions(project: string, f: Filters, ids?: string[]) {
  const w = where(project, f);
  if (ids?.length) {
    w.params.push(ids);
    w.sql += ` and id = any($${w.params.length}::bigint[])`;
  }
  return query<Submission>(`select ${COLUMNS} from submissions where ${w.sql} order by received_at asc, id asc limit 50000`, w.params);
}

export async function getSubmission(project: string, id: string) {
  if (!/^\d+$/.test(id)) return null;
  const [row] = await query<Submission & { prev_id: string | null; next_id: string | null }>(
    `select ${COLUMNS},
       (select id::text from submissions p where p.project = s.project and (p.received_at, p.id) < (s.received_at, s.id) order by received_at desc, id desc limit 1) as prev_id,
       (select id::text from submissions n where n.project = s.project and (n.received_at, n.id) > (s.received_at, s.id) order by received_at asc, id asc limit 1) as next_id
     from submissions s where project = $1 and id = $2`,
    [project, id],
  );
  return row ?? null;
}

/* ------------------------------------------------------------ deleting */

/** Permanently deletes these submissions (hard delete) from one project. Returns how many were removed. */
export async function deleteByIds(project: string, ids: string[]) {
  const clean = [...new Set(ids)].filter((i) => /^\d{1,18}$/.test(i)).slice(0, 1000);
  if (!clean.length) return 0;
  const [r] = await query<{ n: number }>(
    `with d as (delete from submissions where project = $1 and id = any($2::bigint[]) returning 1) select count(*)::int as n from d`,
    [project, clean],
  );
  return r.n;
}

/** Permanently deletes everything in a project that matches the current search/date filters. */
export async function deleteMatching(project: string, f: Filters) {
  const w = where(project, f);
  const [r] = await query<{ n: number }>(`with d as (delete from submissions where ${w.sql} returning 1) select count(*)::int as n from d`, w.params);
  return r.n;
}

/** Bytes the database currently uses (what counts against the free plan's storage). */
export async function storageUsage() {
  const [r] = await query<{ bytes: string }>(`select pg_database_size(current_database())::text as bytes`);
  return Number(r.bytes);
}

export async function projectStats() {
  const rows = await query<{ project: string; total: string; last30: string; flagged: string; latest: Date | null }>(
    `select project,
            count(*)::text as total,
            count(*) filter (where received_at > now() - interval '30 days')::text as last30,
            count(*) filter (where jsonb_array_length(flagged) > 0)::text as flagged,
            max(received_at) as latest
     from submissions group by project`,
  );
  return Object.fromEntries(rows.map((r) => [r.project, { total: Number(r.total), last30: Number(r.last30), flagged: Number(r.flagged), latest: r.latest }]));
}

export async function recentSubmissions(limit = 8) {
  return query<Submission>(`select ${COLUMNS} from submissions order by received_at desc, id desc limit $1`, [limit]);
}

/** Value of a field by header name ("" when the form didn't send it). */
export const field = (s: Pick<Submission, "headers" | "values">, header: string) => {
  const i = s.headers.indexOf(header);
  return i >= 0 ? s.values[i] : "";
};

export const formatIST = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—";
