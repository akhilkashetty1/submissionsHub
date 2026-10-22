"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The insights charts. Plain SVG/HTML, following the hub's chart rules: one hue per job (fail rate is a
 * single red ramp, light → dark), thin marks with 4px rounded ends, hairline axes, labels in ink (never in
 * the data colour), a tooltip on every mark, and every mark is also a link into the filtered table.
 */

/** Fail rate → a step of one red ramp. Near-zero recedes to the surface; text flips to white on the dark steps. */
const RAMP = ["#f6f6f7", "#fbe4e4", "#f7c3c4", "#ef9597", "#e0656a", "#c4202a"];
export function failColor(rate: number, asked: number) {
  if (!asked) return { bg: "transparent", fg: "var(--color-faint)" };
  const step = rate <= 0 ? 0 : rate < 0.05 ? 1 : rate < 0.12 ? 2 : rate < 0.22 ? 3 : rate < 0.35 ? 4 : 5;
  return { bg: RAMP[step], fg: step >= 4 ? "#fff" : "var(--color-ink)" };
}

const pctText = (x: number) => `${Math.round(x * 100)}%`;

/* ------------------------------------------------------------- tooltip */

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-72 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg bg-night px-3 py-2 text-xs text-white shadow-pop"
      style={{ left: tip.x, top: tip.y }}
    >
      <p className="font-semibold leading-snug">{tip.title}</p>
      {tip.lines.map((l) => (
        <p key={l} className="mt-0.5 text-[#c9ccd3]">
          {l}
        </p>
      ))}
    </div>
  );
}

const tipAt = (e: React.MouseEvent | React.FocusEvent, title: string, lines: string[]): Tip => {
  const r = (e.currentTarget as Element).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top, title, lines };
};

/* ----------------------------------------------------- weakest checks */

export type BarRow = { key: string; label: string; sub?: string; rate: number; failed: number; asked: number; prevRate: number | null; href: string };

/** Horizontal bars: fail rate per check, worst first, with the change against the previous period. */
export function FailBars({ rows }: { rows: BarRow[] }) {
  const [tip, setTip] = useState<Tip>(null);
  const max = Math.max(0.05, ...rows.map((r) => r.rate));
  return (
    <>
      <ol className="space-y-1">
        {rows.map((r) => {
          const delta = r.prevRate === null ? null : Math.round((r.rate - r.prevRate) * 100);
          const lines = [`Failed ${r.failed} of ${r.asked} (${pctText(r.rate)})`, r.prevRate === null ? "No earlier data to compare" : `Previous period: ${pctText(r.prevRate)}`, "Click to see these records"];
          return (
            <li key={r.key}>
              <Link
                href={r.href}
                onMouseEnter={(e) => setTip(tipAt(e, r.label, lines))}
                onMouseLeave={() => setTip(null)}
                onFocus={(e) => setTip(tipAt(e, r.label, lines))}
                onBlur={() => setTip(null)}
                className="group block rounded-lg px-2 py-1.5 transition-colors hover:bg-paper-2"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[0.8125rem] text-ink" title={r.label}>
                    {r.sub && <span className="mr-1.5 text-[0.6875rem] font-medium text-faint">{r.sub}</span>}
                    {r.label}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2.5">
                    <span className="text-[0.8125rem] font-semibold tabular-nums text-ink">{pctText(r.rate)}</span>
                    <span className="w-14">
                      <Delta value={delta} goodWhenDown />
                    </span>
                  </span>
                </span>
                <span className="relative mt-1 block h-2.5 w-full" aria-hidden>
                  <span className="absolute inset-y-0 left-0 w-px bg-line-strong" />
                  <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-flag/80 transition-colors group-hover:bg-flag" style={{ width: `${Math.max(1, (r.rate / max) * 100)}%` }} />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <Tooltip tip={tip} />
    </>
  );
}

/** "+4 pts" / "−3 pts" against the previous period, green when it's an improvement. */
export function Delta({ value, goodWhenDown, unit = "pts" }: { value: number | null; goodWhenDown?: boolean; unit?: string }) {
  if (value === null) return <span className="text-right text-[0.6875rem] text-faint">—</span>;
  if (value === 0) return <span className="text-right text-[0.6875rem] text-muted">±0</span>;
  const good = goodWhenDown ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("flex items-center justify-end gap-0.5 text-[0.6875rem] font-semibold tabular-nums", good ? "text-ok" : "text-flag")} title={good ? "Better than the previous period" : "Worse than the previous period"}>
      <Icon className="h-3 w-3" aria-hidden />
      {value > 0 ? "+" : "−"}
      {Math.abs(value)} {unit}
      <span className="sr-only">{good ? "(better)" : "(worse)"}</span>
    </span>
  );
}

/* --------------------------------------------------------------- heatmap */

export type HeatColumn = { header: string; label: string; short: string };
export type HeatRow = { value: string; records: number; cells: Record<string, { asked: number; failed: number }>; hrefFor: (header: string) => string };

/** Groups down the side, checks across: each cell's colour is how often that check failed for that group. */
export function Heatmap({ rows, columns, groupLabel }: { rows: { value: string; records: number; cells: Record<string, { asked: number; failed: number }>; hrefs: Record<string, string> }[]; columns: HeatColumn[]; groupLabel: string }) {
  const [tip, setTip] = useState<Tip>(null);
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-[2px] text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-paper px-2 text-left align-bottom font-medium text-muted">{groupLabel}</th>
            {columns.map((c, i) => (
              <th key={c.header} className="w-9 min-w-9 px-0 pb-1 align-bottom font-medium text-muted" title={c.label}>
                <span className="mx-auto block w-fit tabular-nums">{i + 1}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.value}>
              <th scope="row" className="sticky left-0 z-10 max-w-44 truncate bg-paper py-1 pl-2 pr-3 text-left font-medium text-ink" title={`${r.value} · ${r.records} assessment${r.records === 1 ? "" : "s"}`}>
                {r.value}
                <span className="ml-1.5 font-normal tabular-nums text-faint">{r.records}</span>
              </th>
              {columns.map((c) => {
                const cell = r.cells[c.header] ?? { asked: 0, failed: 0 };
                const rate = cell.asked ? cell.failed / cell.asked : 0;
                const { bg, fg } = failColor(rate, cell.asked);
                const lines = cell.asked ? [`${r.value}: failed ${cell.failed} of ${cell.asked} (${pctText(rate)})`, cell.failed ? "Click to see these records" : ""] : ["Not asked here"];
                const body = (
                  <span className="grid h-7 w-9 place-items-center rounded-[4px] text-[0.625rem] font-semibold tabular-nums" style={{ background: bg, color: fg }}>
                    {cell.asked && cell.failed ? pctText(rate).replace("%", "") : cell.asked ? "" : "·"}
                  </span>
                );
                return (
                  <td key={c.header} className="p-0">
                    {cell.failed ? (
                      <Link
                        href={r.hrefs[c.header]}
                        aria-label={`${c.label}, ${r.value}: ${pctText(rate)} failed`}
                        onMouseEnter={(e) => setTip(tipAt(e, c.label, lines.filter(Boolean)))}
                        onMouseLeave={() => setTip(null)}
                        onFocus={(e) => setTip(tipAt(e, c.label, lines.filter(Boolean)))}
                        onBlur={() => setTip(null)}
                        className="block rounded-[4px] ring-ink/40 transition hover:ring-2"
                      >
                        {body}
                      </Link>
                    ) : (
                      <span onMouseEnter={(e) => setTip(tipAt(e, c.label, lines.filter(Boolean)))} onMouseLeave={() => setTip(null)} className="block">
                        {body}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6875rem] text-muted">
        <span className="flex items-center gap-1.5">
          Failed:
          {[
            ["0", 0, 1],
            ["<5%", 0.03, 1],
            ["5–12%", 0.08, 1],
            ["12–22%", 0.15, 1],
            ["22–35%", 0.3, 1],
            ["35%+", 0.5, 1],
          ].map(([label, rate, asked]) => (
            <span key={label as string} className="flex items-center gap-1">
              <span className="h-3 w-4 rounded-[3px] ring-1 ring-black/5" style={{ background: failColor(rate as number, asked as number).bg }} />
              {label}
            </span>
          ))}
        </span>
        <span>Numbers across the top match the list of checks below the map.</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/* ----------------------------------------------------------------- trend */

export type TrendPoint = { month: string; label: string; records: number; avgScore: number | null; href: string };

const W = 560;
const H = 180;
const PAD = { l: 34, r: 12, t: 14, b: 26 };

/** Average score by month: one 2px line on a hairline grid, with a crosshair tooltip. */
export function ScoreTrend({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.map((p) => p.avgScore).filter((v): v is number => v !== null);
  const lo = vals.length ? Math.max(0, Math.floor((Math.min(...vals) - 5) / 10) * 10) : 0;
  const hi = 100;
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => PAD.t + ((hi - v) * (H - PAD.t - PAD.b)) / Math.max(1, hi - lo);
  const segs: string[] = [];
  let d = "";
  points.forEach((p, i) => {
    if (p.avgScore === null) {
      if (d) segs.push(d);
      d = "";
      return;
    }
    d += `${d ? "L" : "M"}${x(i).toFixed(1)} ${y(p.avgScore).toFixed(1)}`;
  });
  if (d) segs.push(d);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const h = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Average score by month">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" className="fill-[var(--color-muted)] text-[10px] tabular-nums">
              {t}%
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.month} x={x(i)} y={H - 8} textAnchor="middle" className="fill-[var(--color-muted)] text-[10px]">
            {p.label}
          </text>
        ))}
        {h && h.avgScore !== null && <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-line-strong)" strokeWidth="1" />}
        {segs.map((s) => (
          <path key={s} d={s} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {points.map((p, i) =>
          p.avgScore === null ? null : (
            <circle key={p.month} cx={x(i)} cy={y(p.avgScore)} r={hover === i ? 5 : i === points.length - 1 ? 4 : 0} fill="var(--color-ink)" stroke="var(--color-paper)" strokeWidth="2" />
          ),
        )}
        {points.length > 0 && points[points.length - 1].avgScore !== null && (
          <text x={x(points.length - 1) - 8} y={y(points[points.length - 1].avgScore!) - 9} textAnchor="end" className="fill-[var(--color-ink)] text-[11px] font-semibold">
            {points[points.length - 1].avgScore}%
          </text>
        )}
        {/* Hover bands: wider than the marks */}
        {points.map((p, i) => (
          <a key={`hit-${p.month}`} href={p.href} aria-label={`${p.label}: ${p.avgScore ?? "no"} average score, ${p.records} assessments`}>
            <rect
              x={x(i) - (W - PAD.l - PAD.r) / Math.max(1, points.length - 1) / 2}
              y={PAD.t}
              width={(W - PAD.l - PAD.r) / Math.max(1, points.length - 1)}
              height={H - PAD.t - PAD.b}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          </a>
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-night px-3 py-2 text-xs text-white shadow-pop" style={{ left: `${(x(hover!) / W) * 100}%` }}>
          <p className="font-semibold">{new Date(`${h.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
          <p className="text-[#c9ccd3]">{h.avgScore === null ? "No assessments" : `Average score ${h.avgScore}%`}</p>
          <p className="text-[#c9ccd3]">
            {h.records} assessment{h.records === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}

/** Assessments per month: thin columns from one baseline, 4px rounded tops, value on hover. */
export function CountColumns({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.records));
  const nice = max <= 5 ? 5 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
  const band = (W - PAD.l - PAD.r) / points.length;
  const bw = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.t + ((nice - v) * (H - PAD.t - PAD.b)) / nice;
  const h = hover !== null ? points[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Assessments per month">
        {[0, nice / 2, nice].map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" className="fill-[var(--color-muted)] text-[10px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = PAD.l + band * i + band / 2;
          const top = y(p.records);
          const base = y(0);
          const r = Math.min(4, (base - top) / 2);
          const path = p.records ? `M${cx - bw / 2} ${base} V${top + r} Q${cx - bw / 2} ${top} ${cx - bw / 2 + r} ${top} H${cx + bw / 2 - r} Q${cx + bw / 2} ${top} ${cx + bw / 2} ${top + r} V${base} Z` : "";
          return (
            <g key={p.month}>
              {path && <path d={path} fill={hover === i ? "var(--color-ink)" : "#9a9ca3"} />}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-[var(--color-muted)] text-[10px]">
                {p.label}
              </text>
              {i === points.length - 1 && p.records > 0 && (
                <text x={cx} y={top - 5} textAnchor="middle" className="fill-[var(--color-ink)] text-[11px] font-semibold tabular-nums">
                  {p.records}
                </text>
              )}
              <a href={p.href} aria-label={`${p.label}: ${p.records} assessments`}>
                <rect x={cx - band / 2} y={PAD.t} width={band} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
              </a>
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg bg-night px-3 py-2 text-xs text-white shadow-pop" style={{ left: `${((PAD.l + band * hover! + band / 2) / W) * 100}%` }}>
          <p className="font-semibold">{new Date(`${h.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
          <p className="text-[#c9ccd3]">
            {h.records} assessment{h.records === 1 ? "" : "s"}
          </p>
        </div>
      )}
    </div>
  );
}
