/**
 * A portal's table filters, as they travel in the address bar (so every view is a shareable link) and
 * into server actions. Plain data and functions, safe for the browser and the server.
 *
 *   q        search any answer (and notes)
 *   from/to  received between these days (YYYY-MM-DD, India time)
 *   mark     highlight: any | none | a colour id
 *   notes    "1" = only records with notes
 *   f        column filters, repeated: "<column>::<value>". Special values:
 *              __fail__  the check in that column failed      __pass__  it passed
 *              __blank__ the column is empty / missing
 *            Yes / No on a check column match the answer, whatever the remark.
 */

export type Filters = { q: string; from: string; to: string; mark: string; notes: string; f: string[] };

export const EMPTY_FILTERS: Filters = { q: "", from: "", to: "", mark: "", notes: "", f: [] };

export const FAIL = "__fail__";
export const PASS = "__pass__";
export const BLANK = "__blank__";
const SEP = "::";
const MAX_COLUMN_FILTERS = 12;

export type ColumnFilter = { col: string; value: string };

export const encodeColumnFilter = (col: string, value: string) => `${col}${SEP}${value}`;

export function decodeColumnFilter(raw: string): ColumnFilter | null {
  const i = raw.indexOf(SEP);
  if (i <= 0) return null;
  const col = raw.slice(0, i);
  const value = raw.slice(i + SEP.length);
  if (col.length > 300 || value.length > 300) return null;
  return { col, value };
}

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

/** Anything (URL params or an object from the browser) → clean filters. */
export function cleanFilters(input: unknown): Filters {
  const o = (input ?? {}) as Record<string, unknown>;
  const fRaw = Array.isArray(o.f) ? o.f : typeof o.f === "string" ? [o.f] : [];
  const f = [...new Set(fRaw.map((x) => str(x, 620)).filter((x) => decodeColumnFilter(x)))].slice(0, MAX_COLUMN_FILTERS);
  return {
    q: str(o.q),
    from: /^\d{4}-\d{2}-\d{2}$/.test(str(o.from)) ? str(o.from) : "",
    to: /^\d{4}-\d{2}-\d{2}$/.test(str(o.to)) ? str(o.to) : "",
    mark: str(o.mark, 20),
    notes: o.notes === "1" ? "1" : "",
    f,
  };
}

/** Next.js searchParams (values can be string | string[]) → clean filters. */
export function filtersFromSearchParams(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  return cleanFilters({ q: one("q"), from: one("from"), to: one("to"), mark: one("mark"), notes: one("notes"), f: sp.f });
}

export function filtersToParams(f: Filters, params = new URLSearchParams()) {
  for (const k of ["q", "from", "to", "mark", "notes"] as const) if (f[k]) params.set(k, f[k]);
  for (const x of f.f) params.append("f", x);
  return params;
}

export const isFiltered = (f: Filters) => Boolean(f.q || f.from || f.to || f.mark || f.notes || f.f.length);

/** How a column filter reads in a chip: "HQ: Pune", "Brakes: failed". */
export function describeColumnFilter({ col, value }: ColumnFilter, short = 36) {
  const name = col.replace(/^[A-Z][a-z]+ \d+\.\s+/, "");
  const label = name.length > short ? `${name.slice(0, short - 1)}…` : name;
  const v = value === FAIL ? "failed" : value === PASS ? "passed" : value === BLANK ? "(empty)" : value;
  return `${label}: ${v}`;
}
