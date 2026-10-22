import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Postgres access. One plain `pg` pool works against both a local Postgres
 * and Neon (Vercel's Neon integration sets DATABASE_URL). The schema is
 * created, and upgraded, on first use, so a fresh or existing database needs
 * no manual setup.
 */

const globals = globalThis as unknown as { __hubPool?: Pool; __hubSchema?: Promise<void> };

function connectionString() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set — connect a Postgres database (Vercel → Storage → Neon)");
  return url;
}

function pool() {
  // Reused across hot reloads in dev and across warm invocations on Vercel.
  globals.__hubPool ??= new Pool({ connectionString: connectionString(), max: 3, idleTimeoutMillis: 10_000 });
  return globals.__hubPool;
}

/** Every statement is idempotent, so running it twice (or on an older database) is safe. */
const SCHEMA = `
  create table if not exists submissions (
    id            bigserial primary key,
    project       text        not null,
    received_at   timestamptz not null default now(),
    submitted_at  timestamptz,
    title         text        not null default '',
    headers       jsonb       not null,
    "values"      jsonb       not null,
    flagged       jsonb       not null default '[]',
    search        text        not null default '',
    fingerprint   text        not null,
    origin        text
  );
  create index if not exists submissions_project_received on submissions (project, received_at desc);
  create unique index if not exists submissions_project_fingerprint on submissions (project, fingerprint);

  create table if not exists ingest_log (
    ip       text        not null,
    project  text        not null,
    at       timestamptz not null default now()
  );
  create index if not exists ingest_log_ip_at on ingest_log (ip, at);

  create table if not exists login_failures (
    ip  text        not null,
    at  timestamptz not null default now()
  );
  create index if not exists login_failures_ip_at on login_failures (ip, at);

  -- Highlighting (the Excel row colours)
  alter table submissions add column if not exists mark    text;
  alter table submissions add column if not exists mark_by text;
  alter table submissions add column if not exists mark_at timestamptz;
  create index if not exists submissions_project_mark on submissions (project, mark) where mark is not null;

  -- Highlighting a single value (one cell) of a record, like colouring a cell in Excel
  create table if not exists cell_marks (
    submission_id  bigint      not null references submissions(id) on delete cascade,
    col            text        not null,
    mark           text        not null,
    mark_by        text,
    mark_at        timestamptz not null default now(),
    primary key (submission_id, col)
  );

  -- Notes on records
  create table if not exists submission_notes (
    id             bigserial primary key,
    submission_id  bigint      not null references submissions(id) on delete cascade,
    author_id      bigint,
    author_name    text        not null,
    body           text        not null,
    created_at     timestamptz not null default now()
  );
  create index if not exists submission_notes_submission on submission_notes (submission_id, created_at);

  -- People and what they can open
  create table if not exists users (
    id                    bigserial primary key,
    username              text        not null,
    display_name          text        not null,
    password_hash         text        not null,
    is_admin              boolean     not null default false,
    active                boolean     not null default true,
    must_change_password  boolean     not null default true,
    session_version       integer     not null default 1,
    created_at            timestamptz not null default now(),
    created_by            text,
    last_login_at         timestamptz
  );
  create unique index if not exists users_username_lower on users (lower(username));

  create table if not exists user_access (
    user_id  bigint not null references users(id) on delete cascade,
    project  text   not null,
    level    text   not null check (level in ('read', 'write', 'manage')),
    primary key (user_id, project)
  );

  -- Each person's chosen columns and widths for each portal's table (user_id 0 = the owner account)
  create table if not exists user_views (
    user_id     bigint      not null,
    project     text        not null,
    columns     jsonb       not null default '[]',
    widths      jsonb       not null default '{}',
    updated_at  timestamptz not null default now(),
    primary key (user_id, project)
  );

  -- Who did what (deletes, user changes)
  create table if not exists activity_log (
    id       bigserial primary key,
    at       timestamptz not null default now(),
    actor    text        not null,
    action   text        not null,
    project  text,
    detail   jsonb       not null default '{}'
  );
  create index if not exists activity_log_at on activity_log (at desc);

  -- Website photos (sidebar → Website). Files live in Vercel Blob; only their details are here.
  create table if not exists site_media (
    id          bigserial primary key,
    site        text        not null,
    url         text        not null,
    storage_key text        not null,
    w           integer     not null,
    h           integer     not null,
    bytes       integer     not null,
    name        text        not null default '',
    created_by  text,
    created_at  timestamptz not null default now()
  );
  create index if not exists site_media_site on site_media (site, created_at desc);

  -- Each photo spot on a site: the draft being edited and what's live (null = the site's own photos)
  create table if not exists site_slots (
    site          text        not null,
    slot          text        not null,
    draft         jsonb,
    published     jsonb,
    updated_by    text,
    updated_at    timestamptz,
    published_by  text,
    published_at  timestamptz,
    primary key (site, slot)
  );

  -- The last list of photo spots each site reported, so editing works while the site is briefly down
  create table if not exists site_manifests (
    site        text        primary key,
    manifest    jsonb       not null,
    fetched_at  timestamptz not null default now()
  );

  -- Analysis worked out from each record (lib/analysis.ts) and kept so the table can sort and filter by it.
  -- analysed_v is the rules' version: records analysed by older rules are redone automatically.
  alter table submissions add column if not exists score_ok    integer;
  alter table submissions add column if not exists score_total integer;
  alter table submissions add column if not exists fails       jsonb;
  alter table submissions add column if not exists person_key  text;
  alter table submissions add column if not exists vehicle_key text;
  alter table submissions add column if not exists analysed_v  integer;
  create index if not exists submissions_project_person on submissions (project, person_key);

  -- Name clean-up: another spelling of a value ("Hyd") shown and grouped as one name ("Hyderabad").
  -- The records themselves are never changed.
  create table if not exists value_aliases (
    project     text        not null,
    field       text        not null,
    raw         text        not null,
    canonical   text        not null,
    created_by  text,
    created_at  timestamptz not null default now(),
    primary key (project, field, raw)
  );

  -- Follow-up on a failed check: status, who's on it, a note. No row = still open.
  create table if not exists followups (
    submission_id  bigint      not null references submissions(id) on delete cascade,
    header         text        not null,
    status         text        not null default 'open' check (status in ('open', 'in_progress', 'fixed')),
    owner          text        not null default '',
    note           text        not null default '',
    updated_by     text,
    updated_at     timestamptz not null default now(),
    primary key (submission_id, header)
  );

  -- Saved table views (filters, sort, grouping), shared with everyone who can open the portal
  create table if not exists saved_filters (
    id          bigserial primary key,
    project     text        not null,
    name        text        not null,
    query       text        not null,
    created_by_id bigint,
    created_by  text        not null,
    created_at  timestamptz not null default now()
  );
  create index if not exists saved_filters_project on saved_filters (project, name);
`;

async function migrate() {
  // Cheap check first, so a warm database isn't locked and altered on every cold start.
  const { rows } = await pool().query<{ ok: boolean }>(
    `select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'submissions' and column_name = 'mark_at')
        and to_regclass('public.activity_log') is not null
        and to_regclass('public.user_access') is not null
        and to_regclass('public.submission_notes') is not null
        and to_regclass('public.user_views') is not null
        and to_regclass('public.cell_marks') is not null
        and to_regclass('public.site_slots') is not null
        and to_regclass('public.site_media') is not null
        and to_regclass('public.site_manifests') is not null
        and to_regclass('public.followups') is not null
        and to_regclass('public.value_aliases') is not null
        and to_regclass('public.saved_filters') is not null
        and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'submissions' and column_name = 'analysed_v') as ok`,
  );
  if (rows[0]?.ok) return;

  const client = await pool().connect();
  try {
    await client.query("begin");
    // Two servers starting together must not both create tables; this lock works through Neon's pooler too.
    await client.query("select pg_advisory_xact_lock(727001)");
    await client.query(SCHEMA);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function ensureSchema() {
  globals.__hubSchema ??= migrate().catch((err) => {
    globals.__hubSchema = undefined; // retry on the next request
    throw err;
  });
  return globals.__hubSchema;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const res = await pool().query<T>(text, params);
  return res.rows;
}

/** Runs several statements as one all-or-nothing unit. */
export async function transaction<T>(fn: (q: <R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client: PoolClient = await pool().connect();
  try {
    await client.query("begin");
    const result = await fn(async (text, params = []) => (await client.query(text, params)).rows);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
