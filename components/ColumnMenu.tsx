"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, CheckCircle2, EyeOff, FilterX, Loader2, TriangleAlert } from "lucide-react";
import { columnBreakdownAction } from "@/app/analysis-actions";
import { decodeColumnFilter, encodeColumnFilter, type Filters } from "@/lib/filters";
import type { Breakdown } from "@/lib/insights";
import { startNav } from "@/lib/nav-state";
import { cn } from "@/lib/utils";

/**
 * A column heading's menu: how the values in this column split across everything matching the current
 * filters (not just this page), and one click to show only one value. Also sort and hide.
 */
export default function ColumnMenu({
  projectId,
  col,
  filters,
  anchor,
  onHide,
  onClose,
}: {
  projectId: string;
  col: string;
  filters: Filters;
  anchor: DOMRect;
  onHide: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    columnBreakdownAction(projectId, filters, col).then((res) => {
      if (!live) return;
      if (res.ok) setData(res.breakdown);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [projectId, filters, col]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const go = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(window.location.search);
    mutate(p);
    p.delete("page");
    startNav();
    router.push(`${window.location.pathname}${p.size ? `?${p}` : ""}`);
    onClose();
  };
  const active = filters.f.filter((raw) => decodeColumnFilter(raw)?.col === col);
  const only = (value: string) =>
    go((p) => {
      const keep = p.getAll("f").filter((raw) => decodeColumnFilter(raw)?.col !== col);
      p.delete("f");
      [...keep, encodeColumnFilter(col, value)].forEach((x) => p.append("f", x));
    });
  const clearCol = () =>
    go((p) => {
      const keep = p.getAll("f").filter((raw) => decodeColumnFilter(raw)?.col !== col);
      p.delete("f");
      keep.forEach((x) => p.append("f", x));
    });
  const sortBy = (dir: "asc" | "desc") =>
    go((p) => {
      p.set("sort", col);
      p.set("dir", dir);
    });

  const W = 320;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8));
  const top = Math.min(anchor.bottom + 6, window.innerHeight - 120);
  const max = Math.max(1, ...(data?.buckets.map((b) => b.count) ?? [1]));

  return createPortal(
    <div ref={ref} role="dialog" aria-label={`${col}: values`} className="pop-in fixed z-50 flex max-h-[min(30rem,80vh)] flex-col overflow-hidden rounded-xl bg-paper text-[0.8125rem] shadow-pop ring-1 ring-line" style={{ left, top, width: W }}>
      <div className="border-b border-line-soft px-3 py-2.5">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-ink">{col}</p>
        {data && <p className="mt-0.5 text-[0.6875rem] text-muted">Across all {data.total.toLocaleString("en-IN")} matching records · click one to show only that</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {!data && !error && (
          <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting…
          </p>
        )}
        {error && <p className="px-2 py-4 text-xs text-flag">{error}</p>}
        {data?.buckets.map((b) => {
          const isActive = active.includes(encodeColumnFilter(col, b.value));
          return (
            <button
              key={b.value}
              type="button"
              onClick={() => only(b.value)}
              disabled={!b.count}
              className={cn("group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-paper-2 disabled:opacity-40", isActive && "bg-[#fafbe3]")}
            >
              {b.tone === "fail" ? <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-flag" /> : b.tone === "ok" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ok" /> : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink">{b.label}</span>
                <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-paper-2" aria-hidden>
                  <span className={cn("block h-full rounded-full", b.tone === "fail" ? "bg-flag" : b.tone === "ok" ? "bg-ok" : "bg-ink/40")} style={{ width: `${(b.count / max) * 100}%` }} />
                </span>
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="text-ink">{b.count}</span>
                <span className="ml-1 text-[0.6875rem] text-faint">{data.total ? Math.round((b.count / data.total) * 100) : 0}%</span>
              </span>
            </button>
          );
        })}
        {data && data.more > 0 && <p className="px-2 py-1.5 text-[0.6875rem] text-faint">+ {data.more} more values (search to find them)</p>}
        {data && !data.buckets.length && <p className="px-2 py-4 text-xs text-muted">No values.</p>}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-line-soft p-1.5">
        <button type="button" onClick={() => sortBy("asc")} className="btn btn-ghost btn-sm">
          <ArrowUpNarrowWide className="h-3.5 w-3.5" /> A→Z
        </button>
        <button type="button" onClick={() => sortBy("desc")} className="btn btn-ghost btn-sm">
          <ArrowDownNarrowWide className="h-3.5 w-3.5" /> Z→A
        </button>
        <button
          type="button"
          onClick={() => {
            onHide();
            onClose();
          }}
          className="btn btn-ghost btn-sm"
        >
          <EyeOff className="h-3.5 w-3.5" /> Hide
        </button>
        {active.length > 0 && (
          <button type="button" onClick={clearCol} className="btn btn-ghost btn-sm ml-auto text-flag">
            <FilterX className="h-3.5 w-3.5" /> Clear filter
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
