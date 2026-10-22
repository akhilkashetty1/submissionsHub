"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bookmark, BookmarkPlus, Check, ChevronDown, Layers, Loader2, Trash2 } from "lucide-react";
import { deleteNamedViewAction, saveNamedViewAction } from "@/app/analysis-actions";
import { startNav } from "@/lib/nav-state";
import { cn } from "@/lib/utils";

export type SavedViewLite = { id: string; name: string; query: string; createdBy: string; mine: boolean };

const pushWith = (router: ReturnType<typeof useRouter>, mutate: (p: URLSearchParams) => void) => {
  const p = new URLSearchParams(window.location.search);
  mutate(p);
  p.delete("page");
  startNav();
  router.push(`${window.location.pathname}${p.size ? `?${p}` : ""}`);
};

/** "Group by": roll the matching records up per HQ, Team or Line Manager. */
export function GroupByPicker({ groups, current }: { groups: { id: string; label: string }[]; current: string }) {
  const router = useRouter();
  return (
    <label className={cn("relative flex h-8 items-center gap-1.5 rounded-lg border bg-paper pl-2.5 pr-7 text-xs font-medium shadow-xs transition", current ? "border-ink/30 text-ink" : "border-line text-ink-soft hover:border-line-strong")}>
      <Layers className="h-3.5 w-3.5" />
      <span className="sr-only">Group by</span>
      <select
        value={current}
        onChange={(e) => pushWith(router, (p) => (e.target.value ? p.set("group", e.target.value) : p.delete("group")))}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Group by"
      >
        <option value="">No grouping</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            Group by {g.label}
          </option>
        ))}
      </select>
      {current ? `By ${groups.find((g) => g.id === current)?.label}` : "Group by"}
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted" />
    </label>
  );
}

/**
 * Saved views: name the current filters, sort and grouping ("Pune · this month · failed"), and everyone
 * with access to the portal can open it from here. The creator or a Manager can delete one.
 */
export function ViewsMenu({ projectId, views, canManage }: { projectId: string; views: SavedViewLite[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState("");

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address bar when the menu opens
    setCurrent(new URLSearchParams(window.location.search).toString());
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const normalise = (q: string) => {
    const p = new URLSearchParams(q);
    p.delete("page");
    return [...p.entries()].sort().map(([k, v]) => `${k}=${v}`).join("&");
  };
  const activeId = views.find((v) => normalise(v.query) === normalise(current))?.id;

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveNamedViewAction(projectId, name, new URLSearchParams(window.location.search).toString());
      if (!res.ok) return setError(res.error);
      setName("");
      router.refresh();
    });
  const remove = (id: string) =>
    start(async () => {
      const res = await deleteNamedViewAction(projectId, id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn("btn btn-sm", open ? "btn-primary" : "btn-secondary")}>
        <Bookmark className="h-3.5 w-3.5" /> Views
        {views.length > 0 && <span className={cn("rounded-full px-1.5 py-0.5 text-[0.6875rem] tabular-nums leading-none", open ? "bg-white/15" : "bg-paper-2 text-ink-soft ring-1 ring-line")}>{views.length}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Saved views" className="pop-in absolute left-0 top-[calc(100%+6px)] z-40 w-80 overflow-hidden rounded-xl bg-paper text-[0.8125rem] shadow-pop ring-1 ring-line">
          <div className="max-h-72 overflow-y-auto p-1.5">
            {views.length ? (
              views.map((v) => (
                <div key={v.id} className={cn("group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper-2", v.id === activeId && "bg-[#fafbe3]")}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      startNav();
                      router.push(`/p/${projectId}?${v.query}`);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-1.5 truncate font-medium text-ink">
                      {v.id === activeId && <Check className="h-3.5 w-3.5 shrink-0" />}
                      {v.name}
                    </span>
                    <span className="block truncate text-[0.6875rem] text-faint">by {v.createdBy}</span>
                  </button>
                  {(v.mine || canManage) && (
                    <button type="button" onClick={() => remove(v.id)} disabled={pending} title="Delete this view" aria-label={`Delete view ${v.name}`} className="grid h-6 w-6 place-items-center rounded-md text-muted opacity-0 transition hover:bg-flag-wash hover:text-flag group-hover:opacity-100 focus-visible:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="px-2 py-3 text-xs text-muted">No saved views yet. Set up filters, sorting or grouping, then save it here for the whole team.</p>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="border-t border-line-soft p-2"
          >
            <label className="label" htmlFor="view-name">
              Save what&rsquo;s on screen now
            </label>
            <div className="flex gap-1.5">
              <input id="view-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Pune · failed brakes" className="field h-8 text-xs" />
              <button disabled={pending || !name.trim()} className="btn btn-primary btn-sm shrink-0">
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />} Save
              </button>
            </div>
            {error && <p className="mt-1.5 text-xs text-flag">{error}</p>}
          </form>
        </div>
      )}
    </div>
  );
}
