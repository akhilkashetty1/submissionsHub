"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, Layers, X } from "lucide-react";
import { encodeColumnFilter } from "@/lib/filters";
import { cn } from "@/lib/utils";

type Row = { value: string; column: string; records: number; avgScore: number | null; allClear: number; failedChecks: number; worst: string | null; lastAt: string };
type Key = "value" | "records" | "avgScore" | "allClear" | "failedChecks";

const short = (h: string | null) => (h ? h.replace(/^[A-Z][a-z]+ \d+\.\s+/, "") : "—");

/**
 * "Group by": the matching records rolled up per HQ, Team or Line Manager, the pivot table people used
 * to build in Excel. Click a group to see just its records. Sort by any column.
 */
export default function GroupSummary({ projectId, group, rows, baseQuery }: { projectId: string; group: { id: string; label: string }; rows: Row[]; baseQuery: string }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "records", dir: -1 });
  const sorted = [...rows].sort((a, b) => {
    const x = a[sort.key] ?? -1;
    const y = b[sort.key] ?? -1;
    return (typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number)) * sort.dir;
  });
  const drill = (r: Row) => {
    const p = new URLSearchParams(baseQuery);
    p.append("f", encodeColumnFilter(r.column, r.value));
    return `/p/${projectId}?${p}`;
  };
  const close = `/p/${projectId}${baseQuery ? `?${baseQuery}` : ""}`;
  const th = (key: Key, label: string, right = true) => (
    <th className={cn("px-3 py-2 font-medium", right ? "text-right" : "text-left")}>
      <button type="button" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "value" ? 1 : -1 }))} className={cn("inline-flex items-center gap-1 hover:text-ink", sort.key === key && "text-ink")}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
  const total = rows.reduce((n, r) => n + r.records, 0);

  return (
    <section className="card overflow-hidden group-data-[focus=true]/focus:hidden" aria-label={`Grouped by ${group.label}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[0.8125rem] font-semibold">
          <Layers className="h-4 w-4 text-muted" /> By {group.label}
          <span className="font-normal text-muted">
            · {rows.length} group{rows.length === 1 ? "" : "s"}, {total} records
          </span>
        </h2>
        <Link href={close} className="btn btn-ghost btn-sm">
          <X className="h-3.5 w-3.5" /> Ungroup
        </Link>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[40rem] text-[0.8125rem]">
          <thead className="sticky top-0 bg-[#fafafa] text-xs text-muted">
            <tr>
              {th("value", group.label, false)}
              {th("records", "Records")}
              {th("avgScore", "Avg score")}
              {th("allClear", "All clear")}
              {th("failedChecks", "Failed checks")}
              <th className="px-3 py-2 text-left font-medium">Most failed</th>
              <th className="px-4 py-2 text-right font-medium">Latest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {sorted.map((r) => (
              <tr key={r.value} className="hover:bg-[#fafafb]">
                <td className="px-3 py-2">
                  <Link href={drill(r)} className="font-medium text-ink hover:underline">
                    {r.value}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.records}</td>
                <td className="px-3 py-2 text-right">
                  {r.avgScore === null ? (
                    <span className="text-faint">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-paper-2 sm:block" aria-hidden>
                        <span className={cn("block h-full rounded-full", r.avgScore >= 90 ? "bg-ok" : r.avgScore >= 75 ? "bg-[#d97706]" : "bg-flag")} style={{ width: `${r.avgScore}%` }} />
                      </span>
                      <span className="tabular-nums">{r.avgScore}%</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.allClear}%</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", r.failedChecks && "font-semibold text-flag")}>{r.failedChecks}</td>
                <td className="max-w-64 truncate px-3 py-2 text-ink-soft" title={short(r.worst)}>
                  {short(r.worst)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted">{r.lastAt.split(",")[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
