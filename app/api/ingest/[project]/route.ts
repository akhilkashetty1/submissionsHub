import { NextResponse } from "next/server";
import { allowedOrigins, getProject, type Project } from "@/lib/projects";
import { safeEqual, clientIp } from "@/lib/auth";
import { query } from "@/lib/db";
import { insertSubmission, normalize } from "@/lib/submissions";

/**
 * POST /api/ingest/{project}
 *
 * Two ways in:
 * - Server to server (4W, RoadShield): `x-hub-key` must equal that project's
 *   INGEST_KEY_*. A key only ever writes to its own project.
 * - From a browser (2W, whose form posts directly): no key is possible, so the
 *   request's Origin must be in that project's INGEST_ORIGINS_*, and each IP is
 *   rate-limited.
 */

const MAX_BYTES = 200_000;
const BROWSER_LIMIT_PER_HOUR = 30;

type Ctx = { params: Promise<{ project: string }> };

function corsHeaders(project: Project | undefined, origin: string | null): Record<string, string> {
  if (!project || !origin || !allowedOrigins(project).includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request, { params }: Ctx) {
  const project = getProject((await params).project);
  const cors = corsHeaders(project, request.headers.get("origin"));
  return new Response(null, { status: Object.keys(cors).length ? 204 : 403, headers: cors });
}

export async function POST(request: Request, { params }: Ctx) {
  const project = getProject((await params).project);
  const origin = request.headers.get("origin");
  const cors = corsHeaders(project, origin);
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: cors });

  if (!project) return reply({ error: "Unknown project" }, 404);

  const key = request.headers.get("x-hub-key");
  const expectedKey = project.keyEnv ? process.env[project.keyEnv] : undefined;
  const viaKey = Boolean(key && expectedKey && expectedKey.length >= 24 && safeEqual(key, expectedKey));
  const viaBrowser = !viaKey && Object.keys(cors).length > 0;
  if (!viaKey && !viaBrowser) return reply({ error: "Not allowed" }, 401);

  const raw = await request.text();
  if (raw.length > MAX_BYTES) return reply({ error: "Submission too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Body must be JSON" }, 400);
  }
  const incoming = normalize(body);
  if ("error" in incoming) return reply({ error: incoming.error }, 400);

  try {
    if (viaBrowser) {
      const ip = await clientIp();
      const [{ n }] = await query<{ n: number }>(
        `select count(*)::int as n from ingest_log where ip = $1 and at > now() - interval '1 hour'`,
        [ip],
      );
      if (n >= BROWSER_LIMIT_PER_HOUR) return reply({ error: "Too many submissions — try again later" }, 429);
      await query(`insert into ingest_log (ip, project) values ($1, $2)`, [ip, project.id]);
      // Keep the log small; it only ever needs the last hour.
      if (Math.random() < 0.05) await query(`delete from ingest_log where at < now() - interval '1 day'`);
    }

    const id = await insertSubmission(project, incoming, viaBrowser ? origin : null);
    return reply(id ? { ok: true, id } : { ok: true, duplicate: true }, id ? 201 : 200);
  } catch (err) {
    console.error("Ingest failed", project.id, err);
    return reply({ error: "Could not save the submission" }, 500);
  }
}
