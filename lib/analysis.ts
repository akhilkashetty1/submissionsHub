/**
 * Reading the ride-along forms as data: which values are Yes/No checks, whether each one passed,
 * a score per record, and who/what the record is about (person, vehicle, HQ / Team / Line Manager,
 * valid-till dates). Everything the insights, the table's chips and the follow-up board build on.
 *
 * Works on any record's `headers` / `values`, whichever version of the form sent it:
 *  - 2W sends one cell per question: "Yes, Remarks: Left mirror loose" ("No Remarks" means none);
 *  - 4W sends "<question>" = "Yes" plus a separate "<question> — Remarks" cell, and numbers its questions
 *    "Vehicle 3. …" / "Driver 7. …".
 * Anything else (names, vehicle numbers, "Do you use a secondary vehicle?") is just a field.
 *
 * Plain functions with no server imports, so the table in the browser uses the same rules.
 */

/** Per portal: where to find the people, groups and vehicles, and which checks are good when answered No. */
export type AnalysisConfig = {
  /** Columns that name the person assessed (first one found wins). */
  person: string[];
  /** Columns holding the vehicle number. */
  vehicle: string[];
  /** Fields worth grouping and filtering by. `columns` lists the heading in each form version. */
  groups: { id: string; label: string; columns: string[] }[];
  /** Lower-case phrases: a check whose text contains one is "all good" when answered No (e.g. "sleepy"). */
  expectNo: string[];
};

export type Answer = "Yes" | "No";

export type Check = {
  /** The heading as stored (the column name). */
  header: string;
  /** The question without "Vehicle 3. " numbering. */
  label: string;
  /** "Vehicle" / "Driver" when the form numbers its sections, else null. */
  section: string | null;
  answer: Answer;
  remark: string;
  /** The answer is the "all good" one. */
  ok: boolean;
};

export const REMARKS_SUFFIX = " — Remarks";
const COMBINED = /^(Yes|No), Remarks: ([\s\S]*)$/;
const NUMBERED = /^([A-Z][a-z]+) (\d+)\.\s+([\s\S]+)$/;

export function expectedAnswer(label: string, cfg: Pick<AnalysisConfig, "expectNo">): Answer {
  const l = label.toLowerCase();
  return cfg.expectNo.some((p) => l.includes(p)) ? "No" : "Yes";
}

/** Splits "Vehicle 3. Is the horn working?" into its section and the question. */
export function splitLabel(header: string): { section: string | null; label: string } {
  const m = header.match(NUMBERED);
  return m ? { section: m[1], label: m[3] } : { section: null, label: header };
}

/**
 * Reads one cell as a check, or null when it isn't one. `remarkOf` returns the separate remarks cell
 * for a heading (4W), or undefined when the record has none.
 */
export function readCell(header: string, value: string, remarkOf: (h: string) => string | undefined, cfg: Pick<AnalysisConfig, "expectNo">): Check | null {
  if (header.endsWith(REMARKS_SUFFIX)) return null;
  let answer: Answer;
  let remark: string;
  const m = value.match(COMBINED);
  if (m) {
    answer = m[1] as Answer;
    remark = m[2].trim() === "No Remarks" ? "" : m[2].trim();
  } else if (value === "Yes" || value === "No") {
    const r = remarkOf(header);
    if (r === undefined) return null; // a plain Yes/No field, not an assessment question
    answer = value;
    remark = r.trim();
  } else return null;
  const { section, label } = splitLabel(header);
  return { header, label, section, answer, remark, ok: answer === expectedAnswer(label, cfg) };
}

/** Every check in a record, in form order. */
export function readChecks(headers: string[], values: string[], cfg: Pick<AnalysisConfig, "expectNo">): Check[] {
  const remarks = new Map<string, string>();
  headers.forEach((h, i) => h.endsWith(REMARKS_SUFFIX) && remarks.set(h.slice(0, -REMARKS_SUFFIX.length), values[i] ?? ""));
  const out: Check[] = [];
  headers.forEach((h, i) => {
    const c = readCell(h, values[i] ?? "", (q) => remarks.get(q), cfg);
    if (c) out.push(c);
  });
  return out;
}

/** Same as readChecks, from a heading → value map (what the table has in the browser). */
export function readChecksFromMap(data: Record<string, string>, cfg: Pick<AnalysisConfig, "expectNo">): Map<string, Check> {
  const out = new Map<string, Check>();
  for (const [h, v] of Object.entries(data)) {
    const c = readCell(h, v ?? "", (q) => data[`${q}${REMARKS_SUFFIX}`], cfg);
    if (c) out.set(h, c);
  }
  return out;
}

export type Score = { ok: number; total: number; fails: string[] };

export function scoreOf(checks: Check[]): Score {
  return { ok: checks.filter((c) => c.ok).length, total: checks.length, fails: checks.filter((c) => !c.ok).map((c) => c.header) };
}

export const pct = (ok: number, total: number) => (total ? Math.round((ok / total) * 100) : 0);

/** First non-empty value among these headings. */
export function firstOf(headers: string[], values: string[], columns: string[]) {
  for (const c of columns) {
    const i = headers.indexOf(c);
    if (i >= 0 && (values[i] ?? "").trim()) return values[i].trim();
  }
  return "";
}

/** For matching people across records: lower case, single spaces, no punctuation. */
export const personKey = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

/** For matching vehicles: letters and digits only, upper case ("ka 01-ab 1234" → "KA01AB1234"). */
export const vehicleKey = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** For spotting spellings of the same name ("Hyderabad", "hyderabad ", "HYDERABAD."). */
export const looseKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

/* ------------------------------------------------------------------ dates */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "05 Mar 2027" (what the forms send for valid-till dates) → that day at UTC midnight, or null. */
export function parseShortDate(v: string): Date | null {
  const m = v.trim().match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
  return d.getUTCDate() === Number(m[1]) ? d : null;
}

/** Valid-till columns ("<question> — Driving licence valid till") in a record, with their dates. */
export function validTill(headers: string[], values: string[]): { header: string; document: string; date: Date }[] {
  const out: { header: string; document: string; date: Date }[] = [];
  headers.forEach((h, i) => {
    const m = h.match(/ — ([^—]+) valid till$/i);
    const d = m ? parseShortDate(values[i] ?? "") : null;
    if (m && d) out.push({ header: h, document: m[1].trim(), date: d });
  });
  return out;
}

/* --------------------------------------------------------- similar names */

/** Typing distance (insert, delete, replace, or swap two neighbouring letters), giving up past `max`. */
function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Groups values that are probably the same thing typed differently: same letters and digits
 * ("Hyderabad" / "hyderabad."), one a short form of the other ("Hyd" / "Hyderabad"), or a typo away
 * ("Hyderbad"). Returns only groups with at least two different spellings, biggest first.
 */
export function similarGroups(values: { value: string; count: number }[]): { value: string; count: number }[][] {
  const items = values.filter((v) => looseKey(v.value));
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => (parent[find(a)] = find(b));
  const keys = items.map((v) => looseKey(v.value));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = keys[i];
      const b = keys[j];
      const [short, long] = a.length <= b.length ? [a, b] : [b, a];
      const same =
        a === b ||
        (short.length >= 3 && long.startsWith(short) && long.length - short.length <= 12) ||
        (short.length >= 5 && editDistance(a, b, short.length >= 8 ? 2 : 1) <= (short.length >= 8 ? 2 : 1));
      if (same) join(i, j);
    }
  }
  const groups = new Map<number, { value: string; count: number }[]>();
  items.forEach((v, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), v]));
  return [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((x, y) => y.count - x.count))
    .sort((x, y) => y.reduce((n, v) => n + v.count, 0) - x.reduce((n, v) => n + v.count, 0));
}
