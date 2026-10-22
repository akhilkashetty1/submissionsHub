import "server-only";
import { query } from "@/lib/db";
import { firstOf, personKey, readChecks, scoreOf, vehicleKey } from "@/lib/analysis";
import type { Project } from "@/lib/projects";

/**
 * Bump when the rules in lib/analysis.ts change: records analysed by older rules are redone the next
 * time their portal is opened (ensureAnalysed), so stored scores never go stale.
 */
export const ANALYSIS_VERSION = 1;

export type StoredAnalysis = {
  score_ok: number | null;
  score_total: number | null;
  fails: string[] | null;
  person_key: string | null;
  vehicle_key: string | null;
};

export function analyseRecord(project: Project, headers: string[], values: string[]): StoredAnalysis {
  const cfg = project.analysis;
  if (!cfg) return { score_ok: null, score_total: null, fails: null, person_key: null, vehicle_key: null };
  const checks = readChecks(headers, values, cfg);
  const s = scoreOf(checks);
  return {
    score_ok: checks.length ? s.ok : null,
    score_total: checks.length ? s.total : null,
    fails: checks.length ? s.fails : null,
    person_key: personKey(firstOf(headers, values, cfg.person)) || null,
    vehicle_key: vehicleKey(firstOf(headers, values, cfg.vehicle)) || null,
  };
}

/**
 * Analyses any records of this portal that haven't been (older rows, or rows from older rules).
 * Cheap when there's nothing to do: one indexed count. Runs in batches so a big backlog is handled
 * across a few page loads rather than one slow one.
 */
export async function ensureAnalysed(project: Project, maxBatches = 6) {
  for (let b = 0; b < maxBatches; b++) {
    const rows = await query<{ id: string; headers: string[]; values: string[] }>(
      `select id::text, headers, "values" from submissions where project = $1 and analysed_v is distinct from $2 order by id limit 400`,
      [project.id, ANALYSIS_VERSION],
    );
    if (!rows.length) return;
    const updates = rows.map((r) => ({ id: r.id, ...analyseRecord(project, r.headers, r.values) }));
    await query(
      `update submissions s set score_ok = u.score_ok, score_total = u.score_total, fails = u.fails, person_key = u.person_key,
              vehicle_key = u.vehicle_key, analysed_v = $2
       from jsonb_to_recordset($1::jsonb) as u(id bigint, score_ok int, score_total int, fails jsonb, person_key text, vehicle_key text)
       where s.id = u.id`,
      [JSON.stringify(updates), ANALYSIS_VERSION],
    );
    if (rows.length < 400) return;
  }
}
