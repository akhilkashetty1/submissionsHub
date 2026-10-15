import "server-only";
import { Pool, type QueryResultRow } from "pg";

/**
 * Postgres access. One plain `pg` pool works against both a local Postgres
 * and Neon (Vercel's Neon integration sets DATABASE_URL). The schema is
 * created on first use, so a fresh database needs no manual setup.
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
`;

function ensureSchema() {
  globals.__hubSchema ??= pool()
    .query(SCHEMA)
    .then(() => undefined)
    .catch((err) => {
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
