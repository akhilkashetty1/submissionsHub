"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
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
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-paper p-4 shadow-sm" role="search">
      <label className="min-w-[14rem] flex-1">
        <span className="mb-1 block text-xs font-medium text-muted">Search any answer</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Name, HQ, vehicle number, email…"
            className="w-full rounded-lg border border-line bg-paper-2 py-2 pl-9 pr-3 text-sm outline-none focus:border-ink focus:bg-white"
          />
        </span>
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-muted">From</span>
        <input type="date" name="from" defaultValue={from} className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm" />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-muted">To</span>
        <input type="date" name="to" defaultValue={to} className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm" />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium text-muted">Highlight</span>
        <select name="mark" defaultValue={mark} className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm">
          <option value="">Any</option>
          <option value="any">Highlighted</option>
          <option value="none">Not highlighted</option>
          {MARKS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-2.5 text-sm">
        <input type="checkbox" name="notes" defaultChecked={notes === "1"} className="h-4 w-4 accent-[#15171b]" />
        With notes
      </label>
      <button
        disabled={pending}
        className="flex min-w-[5.5rem] items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-night transition disabled:opacity-80"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Searching
          </>
        ) : (
          "Apply"
        )}
      </button>
      {filtered && (
        <Link href={`/p/${projectId}`} className="flex items-center gap-1 px-2 py-2 text-sm text-muted hover:text-ink">
          <X className="h-4 w-4" /> Clear
        </Link>
      )}
    </form>
  );
}
