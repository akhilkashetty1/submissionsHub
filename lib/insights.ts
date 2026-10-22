import "server-only";
import { query, transaction } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  firstOf,
  pct,
  readChecks,
  similarGroups,
  validTill,
  type AnalysisConfig,
  type Check,
} from "@/lib/analysis";
import { ensureAnalysed } from "@/lib/analysis-server";
import { BLANK, FAIL, PASS } from "@/lib/filters";
import type { Project } from "@/lib/projects";
import { where, type Filters } from "@/lib/submissions";

/**
 * Everything the portal's analysis screens show, worked out from the records themselves:
 * column breakdowns, group summaries, insights (weakest checks, heatmap, trend, line managers, repeat
 * issues), the follow-up board, expiries, a person's history, duplicates, name clean-up and saved views.
 *
 * Volumes are small (hundreds to a few thousand records a year), so records are read and summarised
 * here rather than in SQL: one query, then plain loops. Each function caps what it reads.
 */

const MAX_RECORDS = 20_000;

type Rec = {
  id: string;
  received_at: Date;
  title: string;
  headers: string[];
  values: string[];
  score_ok: number | null;
  score_total: number | null;
  fails: string[] | null;
  person_key: string | null;
  vehicle_key: string | null;
};

const REC_COLS = `id::text, received_at, title, headers, "values", score_ok, score_total, fails, person_key, vehicle_key`;

async function loadRecords(project: Project, f: Filters, extra = "", extraParams: unknown[] = []): Promise<Rec[]> {
  await ensureAnalysed(project);
  const w = where(project.id, f);
  let sql = w.sql;
  const params = [...w.params];
  if (extra) {
    const offset = params.length;
    sql += ` and ${extra.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`)}`;
    params.push(...extraParams);
  }
  return query<Rec>(`select ${REC_COLS} from submissions where ${sql} order by received_at asc, id asc limit ${MAX_RECORDS}`, params);
}

/* ------------------------------------------------------------- aliases */

export type Aliases = Map<string, Map<string, string>>; // group id → raw → canonical

export async function loadAliases(projectId: string): Promise<Aliases> {
  const rows = await query<{ field: string; raw: string; canonical: string }>(`select field, raw, canonical from value_aliases where project = $1`, [projectId]);
  const out: Aliases = new Map();
  for (const r of rows) {
    if (!out.has(r.field)) out.set(r.field, new Map());
    out.get(r.field)!.set(r.raw, r.canonical);
  }
  return out;
}

export const NONE = "(not given)";

/** A record's value for a group (HQ, Team, Line Manager), with cleaned-up spelling. */
export function groupValue(rec: Pick<Rec, "headers" | "values">, group: AnalysisConfig["groups"][number], aliases: Aliases) {
  const raw = firstOf(rec.headers, rec.values, group.columns);
  if (!raw) return NONE;
  return aliases.get(group.id)?.get(raw) ?? raw;
}

/** The column a group is stored under in a record (the form versions use different headings). */
export function groupColumn(rec: Pick<Rec, "headers">, group: AnalysisConfig["groups"][number]) {
  return group.columns.find((c) => rec.headers.includes(c)) ?? group.columns[0];
}

const scorePct = (r: Pick<Rec, "score_ok" | "score_total">) => (r.score_total ? (r.score_ok ?? 0) / r.score_total : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/* ---------------------------------------------------- column breakdown */

export type Breakdown = {
  col: string;
  kind: "check" | "group" | "values";
  total: number;
  buckets: { value: string; label: string; count: number; tone?: "ok" | "fail" }[];
  more: number;
};

/** How the values of one column split across the records matching the filters. */
export async function columnBreakdown(project: Project, f: Filters, col: string): Promise<Breakdown> {
  const cfg = project.analysis;
  const recs = await loadRecords(project, f);
  const total = recs.length;
  const group = cfg?.groups.find((g) => g.columns.includes(col));
  const aliases = group ? await loadAliases(project.id) : new Map();

  // A check column: passed / failed (and the raw Yes / No).
  if (cfg) {
    let checks = 0;
    let failed = 0;
    let yes = 0;
    let no = 0;
    let blank = 0;
    for (const r of recs) {
      const i = r.headers.indexOf(col);
      if (i < 0) {
        blank++;
        continue;
      }
      const c = readChecks([col, ...(r.headers.includes(`${col} — Remarks`) ? [`${col} — Remarks`] : [])], [r.values[i], r.values[r.headers.indexOf(`${col} — Remarks`)] ?? ""], cfg)[0];
      if (!c) continue;
      checks++;
      if (!c.ok) failed++;
      if (c.answer === "Yes") yes++;
      else no++;
    }
    if (checks && checks >= (total - blank) * 0.8) {
      return {
        col,
        kind: "check",
        total,
        buckets: [
          { value: FAIL, label: "Failed (needs follow-up)", count: failed, tone: "fail" as const },
          { value: PASS, label: "Passed", count: checks - failed, tone: "ok" as const },
          { value: "Yes", label: "Answered Yes", count: yes },
          { value: "No", label: "Answered No", count: no },
          ...(blank ? [{ value: BLANK, label: "Not asked (older form)", count: blank }] : []),
        ],
        more: 0,
      };
    }
  }

  const counts = new Map<string, number>();
  let blank = 0;
  for (const r of recs) {
    const i = r.headers.indexOf(col);
    const raw = i >= 0 ? (r.values[i] ?? "").trim() : "";
    if (!raw) {
      blank++;
      continue;
    }
    const v = group ? (aliases.get(group.id)?.get(raw) ?? raw) : raw;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = sorted.slice(0, 25);
  return {
    col,
    kind: group ? "group" : "values",
    total,
    buckets: [...top.map(([value, count]) => ({ value, label: value, count })), ...(blank ? [{ value: BLANK, label: "(empty)", count: blank }] : [])],
    more: sorted.length - top.length,
  };
}

/* -------------------------------------------------------- group summary */

export type GroupRow = { value: string; column: string; records: number; avgScore: number | null; allClear: number; failedChecks: number; worst: string | null; lastAt: Date };

export async function groupSummary(project: Project, f: Filters, groupId: string): Promise<GroupRow[]> {
  const cfg = project.analysis;
  const group = cfg?.groups.find((g) => g.id === groupId);
  if (!cfg || !group) return [];
  const [recs, aliases] = await Promise.all([loadRecords(project, f), loadAliases(project.id)]);
  const by = new Map<string, { column: string; recs: Rec[] }>();
  for (const r of recs.filter((x) => x.score_total)) {
    const v = groupValue(r, group, aliases);
    if (!by.has(v)) by.set(v, { column: groupColumn(r, group), recs: [] });
    by.get(v)!.recs.push(r);
  }
  return [...by.entries()]
    .map(([value, { column, recs: rs }]) => {
      const scores = rs.map(scorePct).filter((x): x is number => x !== null);
      const failCount = new Map<string, number>();
      for (const r of rs) for (const h of r.fails ?? []) failCount.set(h, (failCount.get(h) ?? 0) + 1);
      const worst = [...failCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        value,
        column,
        records: rs.length,
        avgScore: scores.length ? Math.round(avg(scores)! * 100) : null,
        allClear: pct(rs.filter((r) => r.score_total && r.score_ok === r.score_total).length, rs.length),
        failedChecks: [...failCount.values()].reduce((a, b) => a + b, 0),
        worst,
        lastAt: rs[rs.length - 1].received_at,
      };
    })
    .sort((a, b) => b.records - a.records);
}

/* ------------------------------------------------------------- insights */

export type Range = { from: string; to: string; days: number; label: string };

const istDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const RANGES = [
  { id: "30", days: 30, label: "Last 30 days" },
  { id: "90", days: 90, label: "Last 90 days" },
  { id: "365", days: 365, label: "Last 12 months" },
] as const;

export function rangeFor(id: string | undefined, month?: string): Range {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const from = `${month}-01`;
    const next = new Date(`${from}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const to = addDays(next.toISOString().slice(0, 10), -1);
    const label = new Date(`${from}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    return { from, to, days: Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1, label };
  }
  const r = RANGES.find((x) => x.id === id) ?? RANGES[1];
  const to = istDay(new Date());
  return { from: addDays(to, -(r.days - 1)), to, days: r.days, label: r.label };
}

export type CheckStat = { header: string; label: string; section: string | null; asked: number; failed: number; rate: number; prevRate: number | null };

export type Insights = {
  range: Range;
  kpis: {
    records: number;
    prevRecords: number;
    avgScore: number | null;
    prevAvgScore: number | null;
    allClear: number;
    prevAllClear: number | null;
    failedChecks: number;
    openFollowups: number;
    expiringSoon: number;
    expired: number;
  };
  weakest: CheckStat[];
  heatmap: { group: { id: string; label: string }; rows: { value: string; column: string; records: number; cells: Record<string, { asked: number; failed: number }> }[]; checks: CheckStat[] };
  trend: { month: string; label: string; records: number; avgScore: number | null }[];
  managers: { value: string; column: string; now: number; before: number }[];
  repeats: RepeatIssue[];
  groups: { id: string; label: string }[];
};

export type RepeatIssue = { person: string; personKey: string; group: string; header: string; label: string; streak: number; lastId: string; lastAt: Date };

function checkStats(recs: Rec[], cfg: AnalysisConfig) {
  const stats = new Map<string, { label: string; section: string | null; asked: number; failed: number }>();
  for (const r of recs) {
    for (const c of readChecks(r.headers, r.values, cfg)) {
      const s = stats.get(c.header) ?? { label: c.label, section: c.section, asked: 0, failed: 0 };
      s.asked++;
      if (!c.ok) s.failed++;
      stats.set(c.header, s);
    }
  }
  return stats;
}

export async function insights(project: Project, range: Range, byGroupId: string): Promise<Insights | null> {
  const cfg = project.analysis;
  if (!cfg) return null;
  const prevFrom = addDays(range.from, -range.days);
  const prevTo = addDays(range.from, -1);
  const yearAgo = addDays(range.to, -364);
  const [allRows, aliases, fixed, exp] = await Promise.all([
    loadRecords(project, { from: [prevFrom, yearAgo].sort()[0], to: range.to }),
    loadAliases(project.id),
    query<{ submission_id: string; header: string; status: string }>(
      `select f.submission_id::text, f.header, f.status from followups f join submissions s on s.id = f.submission_id where s.project = $1`,
      [project.id],
    ),
    expiries(project),
  ]);
  const day = (r: Rec) => istDay(r.received_at);
  // Only records that actually contain assessment checks count (not test entries or other forms' data).
  const assessed = allRows.filter((r) => r.score_total);
  const all = assessed;
  const cur = all.filter((r) => day(r) >= range.from && day(r) <= range.to);
  const prev = all.filter((r) => day(r) >= prevFrom && day(r) <= prevTo);

  const scoreAvg = (rs: Rec[]) => {
    const xs = rs.map(scorePct).filter((x): x is number => x !== null);
    return xs.length ? Math.round(avg(xs)! * 100) : null;
  };
  const allClear = (rs: Rec[]) => pct(rs.filter((r) => r.score_total && r.score_ok === r.score_total).length, rs.length);
  const status = new Map(fixed.map((f) => [`${f.submission_id}|${f.header}`, f.status]));
  const failedChecks = cur.reduce((n, r) => n + (r.fails?.length ?? 0), 0);
  const openFollowups = cur.reduce((n, r) => n + (r.fails ?? []).filter((h) => status.get(`${r.id}|${h}`) !== "fixed").length, 0);

  // Weakest checks, with the previous period for comparison
  const curStats = checkStats(cur, cfg);
  const prevStats = checkStats(prev, cfg);
  const checks: CheckStat[] = [...curStats.entries()]
    .map(([header, s]) => {
      const p = prevStats.get(header);
      return { header, label: s.label, section: s.section, asked: s.asked, failed: s.failed, rate: s.asked ? s.failed / s.asked : 0, prevRate: p && p.asked >= 3 ? p.failed / p.asked : null };
    })
    .sort((a, b) => b.rate - a.rate || b.failed - a.failed);

  // Heatmap: the chosen group × every check
  const group = cfg.groups.find((g) => g.id === byGroupId) ?? cfg.groups[0];
  const rowsBy = new Map<string, { column: string; records: number; cells: Record<string, { asked: number; failed: number }> }>();
  for (const r of cur) {
    const v = groupValue(r, group, aliases);
    const row = rowsBy.get(v) ?? { column: groupColumn(r, group), records: 0, cells: {} };
    row.records++;
    for (const c of readChecks(r.headers, r.values, cfg)) {
      const cell = (row.cells[c.header] ??= { asked: 0, failed: 0 });
      cell.asked++;
      if (!c.ok) cell.failed++;
    }
    rowsBy.set(v, row);
  }
  const heatRows = [...rowsBy.entries()].map(([value, r]) => ({ value, ...r })).sort((a, b) => b.records - a.records).slice(0, 14);

  // Trend: the last 12 months, by month received
  const months: { month: string; label: string; records: number; avgScore: number | null }[] = [];
  const end = new Date(`${range.to.slice(0, 7)}-01T00:00:00Z`);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = d.toISOString().slice(0, 7);
    const rs = all.filter((r) => day(r).startsWith(key));
    months.push({ month: key, label: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }), records: rs.length, avgScore: scoreAvg(rs) });
  }

  // Line managers: assessments this period vs the one before; anyone who has gone quiet shows up with 0
  const lm = cfg.groups.find((g) => g.id === "lm");
  const managers: Insights["managers"] = [];
  if (lm) {
    const m = new Map<string, { column: string; now: number; before: number }>();
    for (const r of cur) {
      const v = groupValue(r, lm, aliases);
      const e = m.get(v) ?? { column: groupColumn(r, lm), now: 0, before: 0 };
      e.now++;
      m.set(v, e);
    }
    // Earlier records: count the previous period; anyone seen in the last year but not lately still gets a row (0 now)
    for (const r of all.filter((x) => day(x) < range.from)) {
      const v = groupValue(r, lm, aliases);
      const e = m.get(v) ?? { column: groupColumn(r, lm), now: 0, before: 0 };
      if (day(r) >= prevFrom) e.before++;
      m.set(v, e);
    }
    managers.push(...[...m.entries()].filter(([v]) => v !== NONE).map(([value, e]) => ({ value, ...e })).sort((a, b) => b.now - a.now || b.before - a.before));
  }

  return {
    range,
    kpis: {
      records: cur.length,
      prevRecords: prev.length,
      avgScore: scoreAvg(cur),
      prevAvgScore: scoreAvg(prev),
      allClear: allClear(cur),
      prevAllClear: prev.length ? allClear(prev) : null,
      failedChecks,
      openFollowups,
      expiringSoon: exp.filter((e) => e.days >= 0 && e.days <= 30).length,
      expired: exp.filter((e) => e.days < 0).length,
    },
    weakest: checks.filter((c) => c.asked >= 3 && c.failed > 0).slice(0, 12),
    heatmap: { group: { id: group.id, label: group.label }, rows: heatRows, checks: checks.filter((c) => c.asked >= 3) },
    trend: months,
    managers,
    repeats: repeatIssues(all, cfg, aliases).slice(0, 30),
    groups: cfg.groups.map((g) => ({ id: g.id, label: g.label })),
  };
}

/** People whose same check failed in each of their latest two or more assessments. */
function repeatIssues(recs: Rec[], cfg: AnalysisConfig, aliases: Aliases): RepeatIssue[] {
  const byPerson = new Map<string, Rec[]>();
  for (const r of recs) if (r.person_key) byPerson.set(r.person_key, [...(byPerson.get(r.person_key) ?? []), r]);
  const hq = cfg.groups[0];
  const out: RepeatIssue[] = [];
  for (const [key, rs] of byPerson) {
    if (rs.length < 2) continue;
    const latest = rs[rs.length - 1];
    for (const h of latest.fails ?? []) {
      let streak = 0;
      for (let i = rs.length - 1; i >= 0 && (rs[i].fails ?? []).includes(h); i--) streak++;
      if (streak >= 2) {
        const c = readChecks(latest.headers, latest.values, cfg).find((x) => x.header === h);
        out.push({ person: firstOf(latest.headers, latest.values, cfg.person) || key, personKey: key, group: groupValue(latest, hq, aliases), header: h, label: c?.label ?? h, streak, lastId: latest.id, lastAt: latest.received_at });
      }
    }
  }
  return out.sort((a, b) => b.streak - a.streak || b.lastAt.getTime() - a.lastAt.getTime());
}

/* ----------------------------------------------------------- follow-ups */

export type FollowupStatus = "open" | "in_progress" | "fixed";
export const FOLLOWUP_STATUSES: FollowupStatus[] = ["open", "in_progress", "fixed"];

export type FollowupItem = {
  submissionId: string;
  header: string;
  label: string;
  section: string | null;
  remark: string;
  person: string;
  group: string;
  at: Date;
  status: FollowupStatus;
  owner: string;
  note: string;
  updatedBy: string | null;
  updatedAt: Date | null;
};

/** Every failed check in the period, with its follow-up state (no row yet = open). */
export async function followupBoard(project: Project, sinceDays: number): Promise<FollowupItem[]> {
  const cfg = project.analysis;
  if (!cfg) return [];
  const since = addDays(istDay(new Date()), -sinceDays);
  const [recs, aliases, rows] = await Promise.all([
    loadRecords(project, { from: since }, "jsonb_array_length(coalesce(fails, '[]'::jsonb)) > 0"),
    loadAliases(project.id),
    query<{ submission_id: string; header: string; status: FollowupStatus; owner: string; note: string; updated_by: string | null; updated_at: Date }>(
      `select f.submission_id::text, f.header, f.status, f.owner, f.note, f.updated_by, f.updated_at from followups f join submissions s on s.id = f.submission_id where s.project = $1`,
      [project.id],
    ),
  ]);
  const state = new Map(rows.map((r) => [`${r.submission_id}|${r.header}`, r]));
  const hq = cfg.groups[0];
  const items: FollowupItem[] = [];
  for (const r of recs) {
    const checks = new Map<string, Check>(readChecks(r.headers, r.values, cfg).map((c) => [c.header, c]));
    for (const h of r.fails ?? []) {
      const c = checks.get(h);
      const s = state.get(`${r.id}|${h}`);
      items.push({
        submissionId: r.id,
        header: h,
        label: c?.label ?? h,
        section: c?.section ?? null,
        remark: c?.remark ?? "",
        person: firstOf(r.headers, r.values, cfg.person) || r.title || `#${r.id}`,
        group: groupValue(r, hq, aliases),
        at: r.received_at,
        status: s?.status ?? "open",
        owner: s?.owner ?? "",
        note: s?.note ?? "",
        updatedBy: s?.updated_by ?? null,
        updatedAt: s?.updated_at ?? null,
      });
    }
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** Follow-up state of every failed check on one record. */
export async function followupsFor(submissionId: string) {
  return query<{ header: string; status: FollowupStatus; owner: string; note: string; updated_by: string | null; updated_at: Date }>(
    `select header, status, owner, note, updated_by, updated_at from followups where submission_id = $1`,
    [submissionId],
  );
}

/** Changes a follow-up. The check must really have failed on a record of this portal. */
export async function setFollowup(
  project: Project,
  submissionId: string,
  header: string,
  patch: { status?: FollowupStatus; owner?: string; note?: string },
  by: string,
): Promise<boolean> {
  if (!/^\d{1,18}$/.test(submissionId) || typeof header !== "string" || header.length > 300) return false;
  const [rec] = await query<{ id: string }>(`select id::text from submissions where id = $1 and project = $2 and coalesce(fails, '[]'::jsonb) ? $3`, [submissionId, project.id, header]);
  if (!rec) return false;
  await query(
    `insert into followups (submission_id, header, status, owner, note, updated_by, updated_at)
     values ($1, $2, coalesce($3, 'open'), coalesce($4, ''), coalesce($5, ''), $6, now())
     on conflict (submission_id, header) do update set
       status = coalesce($3, followups.status), owner = coalesce($4, followups.owner), note = coalesce($5, followups.note),
       updated_by = $6, updated_at = now()`,
    [submissionId, header, patch.status ?? null, patch.owner ?? null, patch.note ?? null, by],
  );
  return true;
}

/* -------------------------------------------------------------- expiries */

export type Expiry = { person: string; personKey: string; group: string; document: string; date: Date; days: number; submissionId: string; at: Date };

/** Each person's latest valid-till dates (from their most recent record that has them). */
export async function expiries(project: Project): Promise<Expiry[]> {
  const cfg = project.analysis;
  if (!cfg) return [];
  const [recs, aliases] = await Promise.all([loadRecords(project, {}, `exists (select 1 from jsonb_array_elements_text(headers) h where h like '%valid till')`), loadAliases(project.id)]);
  const latest = new Map<string, Rec>();
  for (const r of recs) {
    if (!validTill(r.headers, r.values).length) continue;
    latest.set(r.person_key || `#${r.id}`, r); // records come oldest first, so the last one wins
  }
  const today = new Date(`${istDay(new Date())}T00:00:00Z`).getTime();
  const hq = cfg.groups[0];
  const out: Expiry[] = [];
  for (const [key, r] of latest) {
    for (const v of validTill(r.headers, r.values)) {
      out.push({
        person: firstOf(r.headers, r.values, cfg.person) || r.title || key,
        personKey: key,
        group: groupValue(r, hq, aliases),
        document: v.document,
        date: v.date,
        days: Math.round((v.date.getTime() - today) / 86_400_000),
        submissionId: r.id,
        at: r.received_at,
      });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

/* --------------------------------------------------------------- history */

export type HistoryEntry = { id: string; at: Date; scoreOk: number | null; scoreTotal: number | null; fails: string[]; same: "person" | "vehicle" | "both" };
export type History = { entries: HistoryEntry[]; repeats: { header: string; label: string; streak: number }[] };

/** Other assessments of the same person (or the same vehicle), oldest first, and checks failing again and again. */
export async function historyFor(project: Project, id: string): Promise<History> {
  const cfg = project.analysis;
  if (!cfg || !/^\d{1,18}$/.test(id)) return { entries: [], repeats: [] };
  await ensureAnalysed(project);
  const [me] = await query<{ person_key: string | null; vehicle_key: string | null; received_at: Date }>(
    `select person_key, vehicle_key, received_at from submissions where id = $1 and project = $2`,
    [id, project.id],
  );
  if (!me || (!me.person_key && !me.vehicle_key)) return { entries: [], repeats: [] };
  const rows = await query<{ id: string; received_at: Date; score_ok: number | null; score_total: number | null; fails: string[] | null; person_key: string | null; vehicle_key: string | null; headers: string[]; values: string[] }>(
    `select id::text, received_at, score_ok, score_total, fails, person_key, vehicle_key, headers, "values" from submissions
     where project = $1 and ((person_key is not null and person_key = $2) or (vehicle_key is not null and vehicle_key = $3))
     order by received_at asc, id asc limit 200`,
    [project.id, me.person_key, me.vehicle_key],
  );
  const entries: HistoryEntry[] = rows.map((r) => ({
    id: r.id,
    at: r.received_at,
    scoreOk: r.score_ok,
    scoreTotal: r.score_total,
    fails: r.fails ?? [],
    same: r.person_key === me.person_key && r.vehicle_key === me.vehicle_key ? "both" : r.person_key === me.person_key ? "person" : "vehicle",
  }));
  // Repeats up to and including this record, for the same person
  const mine = rows.filter((r) => r.person_key === me.person_key && r.received_at <= me.received_at);
  const last = mine[mine.length - 1];
  const repeats: History["repeats"] = [];
  if (last && mine.length >= 2) {
    const checks = new Map(readChecks(last.headers, last.values, cfg).map((c) => [c.header, c]));
    for (const h of last.fails ?? []) {
      let streak = 0;
      for (let i = mine.length - 1; i >= 0 && (mine[i].fails ?? []).includes(h); i--) streak++;
      if (streak >= 2) repeats.push({ header: h, label: checks.get(h)?.label ?? h, streak });
    }
  }
  return { entries, repeats: repeats.sort((a, b) => b.streak - a.streak) };
}

/* ------------------------------------------------------------ duplicates */

export type DuplicateGroup = { person: string; day: string; records: { id: string; at: Date; scoreOk: number | null; scoreTotal: number | null }[] };

/** The same person assessed more than once on the same day: often a double submission. */
export async function duplicates(project: Project): Promise<DuplicateGroup[]> {
  if (!project.analysis) return [];
  await ensureAnalysed(project);
  const rows = await query<{ person_key: string; day: string; title: string; ids: string[]; ats: Date[]; oks: (number | null)[]; totals: (number | null)[] }>(
    `select person_key, to_char(received_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day, max(title) as title,
            array_agg(id::text order by received_at) as ids, array_agg(received_at order by received_at) as ats,
            array_agg(score_ok order by received_at) as oks, array_agg(score_total order by received_at) as totals
     from submissions where project = $1 and person_key is not null
     group by person_key, day having count(*) > 1 order by day desc limit 100`,
    [project.id],
  );
  return rows.map((r) => ({
    person: r.title || r.person_key,
    day: r.day,
    records: r.ids.map((id, i) => ({ id, at: r.ats[i], scoreOk: r.oks[i], scoreTotal: r.totals[i] })),
  }));
}

/* ----------------------------------------------------------- name clean-up */

export type AliasField = {
  id: string;
  label: string;
  values: { value: string; count: number; canonical: string | null }[];
  suggestions: { value: string; count: number }[][];
};

export async function aliasOverview(project: Project): Promise<AliasField[]> {
  const cfg = project.analysis;
  if (!cfg) return [];
  const [recs, aliases] = await Promise.all([loadRecords(project, {}), loadAliases(project.id)]);
  return cfg.groups.map((g) => {
    const counts = new Map<string, number>();
    for (const r of recs) {
      const v = firstOf(r.headers, r.values, g.columns);
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const map = aliases.get(g.id) ?? new Map();
    const values = [...counts.entries()].map(([value, count]) => ({ value, count, canonical: map.get(value) ?? null })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    // Suggest only among names that aren't merged yet (counting merged ones under their final name)
    const merged = new Map<string, number>();
    for (const v of values) merged.set(v.canonical ?? v.value, (merged.get(v.canonical ?? v.value) ?? 0) + v.count);
    const suggestions = similarGroups([...merged.entries()].map(([value, count]) => ({ value, count })));
    return { id: g.id, label: g.label, values, suggestions };
  });
}

/** Shows `raws` as `canonical` from now on (and anything already shown as one of them, too). */
export async function mergeNames(project: Project, groupId: string, raws: string[], canonical: string, by: string) {
  const group = project.analysis?.groups.find((g) => g.id === groupId);
  const target = canonical.trim().slice(0, 200);
  const clean = [...new Set(raws.map((r) => String(r).trim().slice(0, 200)).filter(Boolean))].slice(0, 100);
  if (!group || !target || !clean.length) return 0;
  await transaction(async (q) => {
    // Names already merged into one of these follow along (no chains)
    await q(`update value_aliases set canonical = $4, created_by = $5, created_at = now() where project = $1 and field = $2 and canonical = any($3::text[])`, [project.id, groupId, clean, target, by]);
    for (const raw of clean) {
      if (raw === target) {
        await q(`delete from value_aliases where project = $1 and field = $2 and raw = $3`, [project.id, groupId, raw]);
        continue;
      }
      await q(
        `insert into value_aliases (project, field, raw, canonical, created_by) values ($1, $2, $3, $4, $5)
         on conflict (project, field, raw) do update set canonical = excluded.canonical, created_by = excluded.created_by, created_at = now()`,
        [project.id, groupId, raw, target, by],
      );
    }
  });
  await logActivity(by, "names.merge", project.id, { field: group.label, names: clean, into: target });
  return clean.length;
}

export async function unmergeName(project: Project, groupId: string, raw: string, by: string) {
  const group = project.analysis?.groups.find((g) => g.id === groupId);
  if (!group) return false;
  const rows = await query(`delete from value_aliases where project = $1 and field = $2 and raw = $3 returning 1`, [project.id, groupId, String(raw).slice(0, 200)]);
  if (rows.length) await logActivity(by, "names.unmerge", project.id, { field: group.label, name: raw });
  return rows.length > 0;
}

/* ------------------------------------------------------------ saved views */

export type SavedView = { id: string; name: string; query: string; created_by: string; created_by_id: string | null; created_at: Date };

export async function listSavedViews(projectId: string) {
  return query<SavedView>(`select id::text, name, query, created_by, created_by_id::text, created_at from saved_filters where project = $1 order by lower(name) limit 200`, [projectId]);
}

export async function createSavedView(projectId: string, name: string, q: string, userId: number, by: string) {
  const [row] = await query<SavedView>(
    `insert into saved_filters (project, name, query, created_by_id, created_by) values ($1, $2, $3, $4, $5)
     returning id::text, name, query, created_by, created_by_id::text, created_at`,
    [projectId, name, q, userId, by],
  );
  return row;
}

export async function getSavedView(projectId: string, id: string) {
  if (!/^\d{1,18}$/.test(id)) return null;
  const [row] = await query<SavedView>(`select id::text, name, query, created_by, created_by_id::text, created_at from saved_filters where project = $1 and id = $2`, [projectId, id]);
  return row ?? null;
}

export async function deleteSavedView(id: string) {
  await query(`delete from saved_filters where id = $1`, [id]);
}

/* ----------------------------------------------------------- tab badges */

/** Open follow-ups (last 180 days) and documents expired or expiring within 30 days, for the portal tabs. */
export async function tabCounts(project: Project): Promise<{ followups: number; expiries: number }> {
  if (!project.analysis) return { followups: 0, expiries: 0 };
  await ensureAnalysed(project);
  const [[open], exp] = await Promise.all([
    query<{ n: number }>(
      `select coalesce(sum((select count(*) from jsonb_array_elements_text(coalesce(s.fails, '[]'::jsonb)) h(header)
                            where not exists (select 1 from followups f where f.submission_id = s.id and f.header = h.header and f.status = 'fixed'))), 0)::int as n
       from submissions s where s.project = $1 and s.received_at > now() - interval '180 days'`,
      [project.id],
    ),
    expiries(project),
  ]);
  return { followups: open?.n ?? 0, expiries: exp.filter((e) => e.days <= 30).length };
}
