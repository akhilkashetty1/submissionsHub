import "server-only";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import type { Project } from "@/lib/projects";
import { isMark, type MarkId } from "@/lib/marks";

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
  mark: string | null;
  mark_by: string | null;
  mark_at: Date | null;
  note_count: number;
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

/** `mark`: any | none | a colour. `notes`: "1" to show only records that have notes. */
export type Filters = { q?: string; from?: string; to?: string; mark?: string; notes?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function where(project: string, f: Filters) {
  const clauses = ["project = $1"];
  const params: unknown[] = [project];
  if (f.q?.trim()) {
    params.push(`%${f.q.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    // Matches the answers, and also anything written in a note on the record.
    clauses.push(
      `(search like $${params.length} or exists (select 1 from submission_notes sn where sn.submission_id = submissions.id and lower(sn.body) like $${params.length}))`,
    );
  }
  if (f.mark === "any") clauses.push("mark is not null");
  else if (f.mark === "none") clauses.push("mark is null");
  else if (isMark(f.mark)) {
    params.push(f.mark);
    clauses.push(`mark = $${params.length}`);
  }
  if (f.notes === "1") clauses.push("exists (select 1 from submission_notes sn where sn.submission_id = submissions.id)");
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

/** Columns every record query needs. `alias` is the table's name or alias in that query. */
const cols = (alias = "submissions") =>
  `${alias}.id::text as id, ${alias}.project, ${alias}.received_at, ${alias}.submitted_at, ${alias}.title, ${alias}.headers, ${alias}."values", ${alias}.flagged,
   ${alias}.mark, ${alias}.mark_by, ${alias}.mark_at,
   (select count(*)::int from submission_notes sn where sn.submission_id = ${alias}.id) as note_count`;

/** Sort by the time received (RECEIVED) or by any column of the form, by its heading. */
export type Sort = { col: string; dir: "asc" | "desc" };
export const RECEIVED = "received";

export async function listSubmissions(project: string, f: Filters, page: number, pageSize: number, sort?: Sort) {
  const w = where(project, f);
  const params = [...w.params];
  let join = "";
  let orderBy = "received_at desc, id desc";

  if (sort?.col === RECEIVED) {
    const d = sort.dir === "asc" ? "asc" : "desc";
    orderBy = `received_at ${d}, id ${d}`;
  } else if (sort?.col) {
    // Records store their answers as parallel header/value lists, so find this column's value by position.
    // Numbers sort as numbers (2 before 10), everything else as case-insensitive text, empty cells last.
    params.push(sort.col);
    join = `left join lateral (
      select vv.x as v from jsonb_array_elements_text(submissions.headers) with ordinality hh(k, i)
      join jsonb_array_elements_text(submissions."values") with ordinality vv(x, j) on vv.j = hh.i
      where hh.k = $${params.length} limit 1) sv on true`;
    const d = sort.dir === "desc" ? "desc" : "asc";
    orderBy = `(case when nullif(sv.v, '') ~ '^-?[0-9]{1,15}(\\.[0-9]+)?$' then nullif(sv.v, '')::numeric end) ${d} nulls last,
               lower(nullif(sv.v, '')) ${d} nulls last, received_at desc, id desc`;
  }

  params.push(pageSize, (page - 1) * pageSize);
  // Run both at once: one round trip to the database instead of two.
  const [[{ count }], rows] = await Promise.all([
    query<{ count: string }>(`select count(*)::text as count from submissions where ${w.sql}`, w.params),
    query<Submission>(`select ${cols()} from submissions ${join} where ${w.sql} order by ${orderBy} limit $${params.length - 1} offset $${params.length}`, params),
  ]);
  return { rows, total: Number(count) };
}

export async function exportSubmissions(project: string, f: Filters, ids?: string[]) {
  const w = where(project, f);
  if (ids?.length) {
    w.params.push(ids);
    w.sql += ` and id = any($${w.params.length}::bigint[])`;
  }
  return query<Submission>(`select ${cols()} from submissions where ${w.sql} order by received_at asc, id asc limit 50000`, w.params);
}

export async function getSubmission(project: string, id: string) {
  if (!/^\d+$/.test(id)) return null;
  const [row] = await query<Submission & { prev_id: string | null; next_id: string | null }>(
    `select ${cols('s')},
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
  const rows = await query<{ project: string; total: string; last30: string; flagged: string; marked: string; latest: Date | null }>(
    `select project,
            count(*)::text as total,
            count(*) filter (where received_at > now() - interval '30 days')::text as last30,
            count(*) filter (where jsonb_array_length(flagged) > 0)::text as flagged,
            count(*) filter (where mark is not null)::text as marked,
            max(received_at) as latest
     from submissions group by project`,
  );
  return Object.fromEntries(
    rows.map((r) => [r.project, { total: Number(r.total), last30: Number(r.last30), flagged: Number(r.flagged), marked: Number(r.marked), latest: r.latest }]),
  );
}

/** Latest entries across the given portals only (what this person may see). */
export async function recentSubmissions(limit: number, projectIds: string[]) {
  if (!projectIds.length) return [];
  return query<Submission>(`select ${cols()} from submissions where project = any($2::text[]) order by received_at desc, id desc limit $1`, [limit, projectIds]);
}

/** Value of a field by header name ("" when the form didn't send it). */
export const field = (s: Pick<Submission, "headers" | "values">, header: string) => {
  const i = s.headers.indexOf(header);
  return i >= 0 ? s.values[i] : "";
};

export { formatIST } from "@/lib/format";

/* ------------------------------------------------------------- highlights */

/** Sets (or clears, with null) the highlight colour on these records. Returns how many changed. */
export async function setMarkByIds(project: string, ids: string[], mark: MarkId | null, by: string) {
  const clean = [...new Set(ids)].filter((i) => /^\d{1,18}$/.test(i)).slice(0, 1000);
  if (!clean.length) return 0;
  const [r] = await query<{ n: number }>(
    `with u as (
       update submissions set mark = $3, mark_by = case when $3::text is null then null else $4 end, mark_at = case when $3::text is null then null else now() end
       where project = $1 and id = any($2::bigint[]) returning 1
     ) select count(*)::int as n from u`,
    [project, clean, mark, by],
  );
  return r.n;
}

/** Same, for everything matching the current search, date and highlight filters. */
export async function setMarkMatching(project: string, f: Filters, mark: MarkId | null, by: string) {
  const w = where(project, f);
  w.params.push(mark, by);
  const m = w.params.length - 1;
  const b = w.params.length;
  const [r] = await query<{ n: number }>(
    `with u as (
       update submissions set mark = $${m}, mark_by = case when $${m}::text is null then null else $${b} end, mark_at = case when $${m}::text is null then null else now() end
       where ${w.sql} returning 1
     ) select count(*)::int as n from u`,
    w.params,
  );
  return r.n;
}

/* -------------------------------------------------------------------- notes */

export type Note = { id: string; submission_id: string; author_id: string | null; author_name: string; body: string; created_at: Date };

export const MAX_NOTE = 2000;

export async function listNotes(submissionId: string) {
  return query<Note>(
    `select id::text, submission_id::text, author_id::text, author_name, body, created_at from submission_notes where submission_id = $1 order by created_at desc, id desc`,
    [submissionId],
  );
}

/** Adds a note, but only if the record really belongs to this portal. */
export async function addNote(project: string, submissionId: string, authorId: number, authorName: string, body: string) {
  if (!/^\d{1,18}$/.test(submissionId)) return null;
  const [row] = await query<Note>(
    `insert into submission_notes (submission_id, author_id, author_name, body)
     select s.id, $3, $4, $5 from submissions s where s.id = $2 and s.project = $1
     returning id::text, submission_id::text, author_id::text, author_name, body, created_at`,
    [project, submissionId, authorId || null, authorName, body],
  );
  return row ?? null;
}

export async function getNote(project: string, noteId: string) {
  if (!/^\d{1,18}$/.test(noteId)) return null;
  const [row] = await query<Note>(
    `select n.id::text, n.submission_id::text, n.author_id::text, n.author_name, n.body, n.created_at
     from submission_notes n join submissions s on s.id = n.submission_id where n.id = $2 and s.project = $1`,
    [project, noteId],
  );
  return row ?? null;
}

export async function deleteNoteById(noteId: string) {
  await query(`delete from submission_notes where id = $1`, [noteId]);
}

/** All notes for these records, grouped, for the Excel export. */
export async function notesFor(submissionIds: string[]) {
  const map = new Map<string, Note[]>();
  if (!submissionIds.length) return map;
  const rows = await query<Note>(
    `select id::text, submission_id::text, author_id::text, author_name, body, created_at from submission_notes where submission_id = any($1::bigint[]) order by created_at, id`,
    [submissionIds],
  );
  for (const n of rows) map.set(n.submission_id, [...(map.get(n.submission_id) ?? []), n]);
  return map;
}
