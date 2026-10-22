"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize, Minimize2, Search, SlidersHorizontal, X } from "lucide-react";
import ExportButton from "@/components/ExportButton";
import PortalIcon from "@/components/PortalIcon";
import { markById } from "@/lib/marks";
import { decodeColumnFilter, describeColumnFilter } from "@/lib/filters";
import { startNav } from "@/lib/nav-state";
import { FOCUS_COOKIE } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

type FocusState = { focus: boolean; setFocus: (on: boolean) => void; /** Where the table puts its Columns button while in focus mode. */ slot: HTMLElement | null };
const FocusContext = createContext<FocusState>({ focus: false, setFocus: () => {}, slot: null });
export const useFocusMode = () => useContext(FocusContext);

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
/** Something else that Escape should close first (quick actions, the columns panel, a dialog). */
const somethingOpen = () => Boolean(document.querySelector('[role="dialog"]:not([data-focus-filters]), dialog[open]'));

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/**
 * The filters and table of a portal, with a full-screen "focus mode" for working through records
 * like a spreadsheet: the menu, page header and filter card step aside, the table fills the window,
 * and one slim command bar keeps search, filters (as removable chips), columns, paging and export
 * within reach. Press F (or the Focus button) to enter and Esc to leave. It stays on while you page,
 * sort, filter or open a record and come back, until you leave it or close the browser.
 */
export default function TableWorkspace({
  initialFocus,
  project,
  total,
  filters,
  pager,
  exportHref,
  filterBar,
  children,
}: {
  initialFocus: boolean;
  project: { id: string; name: string; accent: string };
  total: number;
  filters: { q: string; from: string; to: string; mark: string; notes: string; f?: string[] };
  pager: { from: number; to: number; newerHref: string | null; olderHref: string | null };
  exportHref: string;
  /** The regular filter bar: shown above the table normally, and in a drop-down in focus mode. */
  filterBar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [focus, setFocusState] = useState(initialFocus);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setFocus = useCallback((on: boolean) => {
    setFocusState(on);
    setFiltersOpen(false);
    document.cookie = `${FOCUS_COOKIE}=${on ? "1" : ""}; path=/; samesite=lax${on ? "" : "; max-age=0"}`; // session cookie
  }, []);

  // F toggles, Esc leaves (unless a popover or dialog should close first).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "f" || e.key === "F") {
        if (somethingOpen()) return;
        e.preventDefault();
        setFocus(!focus);
      } else if (e.key === "Escape" && focus) {
        if (filtersOpen) return setFiltersOpen(false);
        if (!somethingOpen()) setFocus(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, filtersOpen, setFocus]);

  // The page behind shouldn't scroll while the table has the whole window.
  useEffect(() => {
    if (!focus) return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [focus]);

  // New results arrived: the filter drop-down has done its job.
  const search = useSearchParams().toString();
  const [lastSearch, setLastSearch] = useState(search);
  if (search !== lastSearch) {
    setLastSearch(search);
    setFiltersOpen(false);
  }

  const activeCount = [filters.from, filters.to, filters.mark, filters.notes].filter(Boolean).length + (filters.f?.length ?? 0);

  return (
    <FocusContext.Provider value={{ focus, setFocus, slot }}>
      {!focus ? (
        <div className="space-y-4">
          {filterBar}
          {children}
        </div>
      ) : (
        <div data-focus="true" role="region" aria-label={`${project.name}, focus mode`} className="fade-in group/focus fixed inset-0 z-40 flex flex-col bg-canvas">
          <header className="relative flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-paper px-3 shadow-[0_1px_2px_rgb(16_17_20/0.03)]">
            <PortalIcon id={project.id} accent={project.accent} size="sm" />
            <div className="hidden min-w-0 items-baseline gap-2 sm:flex">
              <span className="truncate text-[0.8125rem] font-semibold tracking-[-0.01em]">{project.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{total.toLocaleString("en-IN")}</span>
            </div>
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-line sm:block" />

            <QuickSearch q={filters.q} />

            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className={cn("btn btn-sm", filtersOpen ? "btn-primary" : "btn-secondary")}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Filters</span>
              {activeCount > 0 && (
                <span className={cn("grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.625rem] font-semibold tabular-nums", filtersOpen ? "bg-white/20" : "bg-ink text-white")}>{activeCount}</span>
              )}
            </button>
            <FilterChips filters={filters} />

            {/* The table puts its Columns button here */}
            <div ref={setSlot} className="flex items-center" />

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <span className="hidden text-xs tabular-nums text-muted md:inline">
                {total ? (
                  <>
                    <span className="font-medium text-ink">
                      {pager.from}–{pager.to}
                    </span>{" "}
                    of {total.toLocaleString("en-IN")}
                  </>
                ) : (
                  "No results"
                )}
              </span>
              <PageLink href={pager.newerHref} label="Newer page">
                <ChevronLeft className="h-4 w-4" />
              </PageLink>
              <PageLink href={pager.olderHref} label="Older page">
                <ChevronRight className="h-4 w-4" />
              </PageLink>
              <span className="hidden items-center gap-1.5 sm:flex">
                <span aria-hidden className="mx-1 h-5 w-px bg-line" />
                <ExportButton href={exportHref} label="Export" className="btn btn-secondary btn-sm" />
              </span>
              <button type="button" onClick={() => setFocus(false)} title="Leave focus mode (Esc)" className="btn btn-ghost btn-sm">
                <Minimize2 className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Exit</span>
                <kbd className="kbd hidden lg:inline-grid">Esc</kbd>
              </button>
            </div>

            {filtersOpen && (
              <>
                <div aria-hidden className="fixed inset-0 top-12 z-40 bg-night/10" onClick={() => setFiltersOpen(false)} />
                <div role="dialog" data-focus-filters aria-label="Filters" className="pop-in absolute inset-x-3 top-[calc(100%+0.5rem)] z-50 rounded-xl shadow-pop">
                  {filterBar}
                </div>
              </>
            )}
          </header>

          <div className="flex min-h-0 flex-1 flex-col p-2 sm:p-3">{children}</div>
        </div>
      )}
    </FocusContext.Provider>
  );
}

/** The button that puts the table into focus mode. */
export function FocusButton() {
  const { focus, setFocus } = useFocusMode();
  if (focus) return null;
  return (
    <button type="button" onClick={() => setFocus(true)} title="Full-screen table with no distractions (F)" className="btn btn-secondary btn-sm">
      <Maximize className="h-3.5 w-3.5" />
      Focus
      <kbd className="kbd -mr-1">F</kbd>
    </button>
  );
}

/* --------------------------------------------------------------- pieces */

/** Search box in the command bar. Keeps the other filters and the sort; goes back to page 1. */
function QuickSearch({ q }: { q: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  // "/" jumps to the search box, as in most data tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || somethingOpen()) return;
      e.preventDefault();
      ref.current?.focus();
      ref.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = (ref.current?.value ?? "").trim();
    const next = new URLSearchParams(params.toString());
    if (value) next.set("q", value);
    else next.delete("q");
    next.delete("page");
    const target = `${pathname}${next.size ? `?${next}` : ""}`;
    if (target === `${location.pathname}${location.search}`) return;
    startNav();
    start(() => router.push(target));
  };

  return (
    <form role="search" onSubmit={submit} className="relative hidden w-56 shrink-0 md:block lg:w-72">
      {pending ? (
        <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted" />
      ) : (
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      )}
      <input
        ref={ref}
        key={q}
        name="q"
        defaultValue={q}
        placeholder="Search…  press Enter"
        aria-label="Search any answer"
        className="field h-8 pl-8 pr-8 text-xs"
        onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur(), e.stopPropagation())}
      />
      <kbd className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">/</kbd>
    </form>
  );
}

/** Every active filter as a chip; × removes just that one. */
function FilterChips({ filters }: { filters: { q: string; from: string; to: string; mark: string; notes: string; f?: string[] } }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const without = (...keys: string[]) => {
    const next = new URLSearchParams(params.toString());
    for (const k of keys) {
      if (k.startsWith("f:")) {
        const keep = next.getAll("f").filter((x) => x !== k.slice(2));
        next.delete("f");
        keep.forEach((x) => next.append("f", x));
      } else next.delete(k);
    }
    next.delete("page");
    return `${pathname}${next.size ? `?${next}` : ""}`;
  };
  const mark = filters.mark === "any" ? "Highlighted" : filters.mark === "none" ? "Not highlighted" : markById(filters.mark)?.label;
  const chips = [
    filters.q && { key: "q", label: `“${filters.q.length > 18 ? `${filters.q.slice(0, 18)}…` : filters.q}”` },
    filters.from && { key: "from", label: `From ${fmtDate(filters.from)}` },
    filters.to && { key: "to", label: `To ${fmtDate(filters.to)}` },
    mark && { key: "mark", label: mark, dot: markById(filters.mark)?.dot },
    filters.notes && { key: "notes", label: "With notes" },
    ...(filters.f ?? []).map((raw) => {
      const cf = decodeColumnFilter(raw);
      return cf ? { key: `f:${raw}`, label: describeColumnFilter(cf, 22) } : null;
    }),
  ].filter(Boolean) as { key: string; label: string; dot?: string }[];
  if (!chips.length) return null;

  return (
    <div className="hidden min-w-0 items-center gap-1 overflow-hidden xl:flex">
      {chips.map((c) => (
        <span key={c.key} className="chip shrink-0 gap-1 pr-0.5">
          {c.dot && <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />}
          {c.label}
          <Link href={without(c.key)} aria-label={`Remove filter: ${c.label}`} className="grid h-4 w-4 place-items-center rounded-full text-muted transition hover:bg-black/10 hover:text-ink">
            <X className="h-2.5 w-2.5" strokeWidth={2.5} />
          </Link>
        </span>
      ))}
      {chips.length > 1 && (
        <Link href={without("q", "from", "to", "mark", "notes", "f")} className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted transition hover:bg-paper-2 hover:text-ink">
          Clear all
        </Link>
      )}
    </div>
  );
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  const cls = "grid h-8 w-8 place-items-center rounded-lg border border-line bg-paper text-ink-soft shadow-xs transition";
  return href ? (
    <Link href={href} aria-label={label} title={label} className={cn(cls, "hover:border-line-strong hover:bg-paper-2 hover:text-ink")}>
      {children}
    </Link>
  ) : (
    <span aria-disabled aria-label={label} className={cn(cls, "cursor-not-allowed opacity-40")}>
      {children}
    </span>
  );
}
