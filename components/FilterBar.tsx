"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, Loader2, Search, X } from "lucide-react";
import { MARKS } from "@/lib/marks";
import { startNav } from "@/lib/nav-state";

/**
 * Search + date filters. Submits without reloading the page, so Apply shows a spinner,
 * the progress bar runs and the table dims until the new results arrive.
 */
export default function FilterBar({
  projectId,
  q,
  from,
  to,
  mark,
  notes,
  sort,
  dir,
  filtered,
}: {
  projectId: string;
  q: string;
  from: string;
  to: string;
  mark: string;
  notes: string;
  sort: string;
  dir: string;
  filtered: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "from", "to", "mark"]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    if (data.get("notes")) params.set("notes", "1");
    // Searching keeps your sort order.
    if (sort) {
      params.set("sort", sort);
      params.set("dir", dir || "asc");
    }
    const target = `/p/${projectId}${params.size ? `?${params}` : ""}`;
    const unchanged = target === `${location.pathname}${location.search}`;
    // Started outside the transition on purpose: updates inside a transition are deferred until it finishes.
    if (!unchanged) startNav();
    start(() => {
      if (unchanged) return router.refresh(); // same search again: just reload the results
      router.push(target);
    });
  };

  return (
    <form onSubmit={onSubmit} className="card flex flex-wrap items-end gap-3 p-3.5" role="search">
      <label className="min-w-[14rem] flex-1">
        <span className="label">Search any answer</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={q} placeholder="Name, HQ, vehicle number, email…" className="field pl-9" />
        </span>
      </label>
      <label>
        <span className="label">From</span>
        <input type="date" name="from" defaultValue={from} className="field w-auto tabular-nums" />
      </label>
      <label>
        <span className="label">To</span>
        <input type="date" name="to" defaultValue={to} className="field w-auto tabular-nums" />
      </label>
      <label>
        <span className="label">Highlight</span>
        <span className="relative block">
          <select name="mark" defaultValue={mark} className="field w-auto appearance-none pr-8">
            <option value="">Any</option>
            <option value="any">Highlighted</option>
            <option value="none">Not highlighted</option>
            {MARKS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        </span>
      </label>
      <label className="flex h-9 cursor-pointer select-none items-center gap-2 rounded-lg border border-line bg-paper px-3 text-[0.8125rem] text-ink-soft shadow-xs transition hover:border-line-strong has-[:checked]:border-ink/30 has-[:checked]:bg-paper-2 has-[:checked]:text-ink">
        <input type="checkbox" name="notes" defaultChecked={notes === "1"} className="h-3.5 w-3.5" />
        With notes
      </label>
      <span className="flex items-center gap-1">
        <button disabled={pending} className="btn btn-primary min-w-[5.5rem]">
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Searching
            </>
          ) : (
            "Apply"
          )}
        </button>
        {filtered && (
          <Link href={`/p/${projectId}`} className="btn btn-ghost">
            <X className="h-4 w-4" /> Clear
          </Link>
        )}
      </span>
    </form>
  );
}
