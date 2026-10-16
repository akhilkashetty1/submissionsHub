"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Columns3, MessageSquare, Trash2, TriangleAlert, X } from "lucide-react";
import { deleteAllMatching, deleteSubmissions } from "@/app/actions";
import { resetViewAction, saveViewAction } from "@/app/view-actions";
import ColumnPicker, { type SaveState } from "@/components/ColumnPicker";
import ConfirmDialog from "@/components/ConfirmDialog";
import MarkPicker from "@/components/MarkPicker";
import { markById } from "@/lib/marks";
import { startNav } from "@/lib/nav-state";
import { cn } from "@/lib/utils";

export type TableRow = {
  id: string;
  received: string;
  mark: string | null;
  notes: number;
  flags: number;
  /** Every answer on the record by column heading, so columns can be added without asking the server. */
  data: Record<string, string>;
  /** Headings whose answers were flagged. */
  flaggedCols: string[];
};
export type TableFilters = { q: string; from: string; to: string; mark: string; notes: string };
export type TableSort = { col: string; dir: "asc" | "desc" } | null;

const RECEIVED = "received";
const DEFAULT_WIDTH = 170;
const MIN_WIDTH = 70;
const MAX_WIDTH = 900;
const CHECK_W = 44;
const RECEIVED_W = 232;

/**
 * The submissions grid, built to feel like a spreadsheet:
 *
 * - Choose your own columns from everything the form collected (Columns button); remembered per person.
 * - Scrolls sideways and down inside the table, with the checkbox and Received columns and the heading
 *   row frozen in place, and edge shadows hinting there's more.
 * - Drag a column's right edge to resize it (double-click to reset); click a heading to sort by it.
 * - Flagged answers are marked in red right in the grid; highlighted rows are tinted.
 * - Tick rows to highlight or (Managers) delete them, or "Select all N" across every page of a filter.
 */
export default function SubmissionsTable({
  projectId,
  projectShort,
  available,
  defaults,
  initialColumns,
  initialWidths,
  rows,
  total,
  filters,
  filtered,
  sort,
  baseQuery,
  canWrite,
  canManage,
}: {
  projectId: string;
  projectShort: string;
  /** Every column the records have, for the Columns panel. */
  available: string[];
  /** The portal's default columns. */
  defaults: string[];
  initialColumns: string[];
  initialWidths: Record<string, number>;
  rows: TableRow[];
  total: number;
  filters: TableFilters;
  filtered: boolean;
  sort: TableSort;
  /** The page's current search/filter query string without sort, direction or page, for building sort links. */
  baseQuery: string;
  canWrite: boolean;
  canManage: boolean;
}) {
  const router = useRouter();

  // ---- selection and delete
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // ---- the person's layout
  const [columns, setColumns] = useState(initialColumns);
  const [widths, setWidths] = useState(initialWidths);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const firstRun = useRef(true);

  // ---- scrolling
  const scroller = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const selectable = canWrite || canManage;
  const stickyLeft = (selectable ? CHECK_W : 0) + RECEIVED_W;
  const widthOf = (c: string) => widths[c] ?? DEFAULT_WIDTH;
  const tableWidth = stickyLeft + columns.reduce((sum, c) => sum + widthOf(c), 0);

  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const count = allMatching ? total : selected.size;
  const canSelectAll = allOnPage && !allMatching && total > rows.length;
  const flaggedOnPage = useMemo(() => [...new Set(rows.flatMap((r) => r.flaggedCols))], [rows]);
  const isDefaultLayout = columns.length === defaults.length && columns.every((c, i) => c === defaults[i]) && Object.keys(widths).length === 0;

  // Remember the layout (debounced). Going back to exactly the default forgets the customisation instead.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      const res = isDefaultLayout ? await resetViewAction(projectId) : await saveViewAction(projectId, columns, widths);
      setSaveState(res.ok ? "saved" : "error");
    }, 700);
    return () => clearTimeout(timer);
  }, [columns, widths, isDefaultLayout, projectId]);

  // Edge shadows: show a hint on a side when there's more to scroll to.
  useEffect(() => {
    const el = scroller.current;
    const table = tableRef.current;
    if (!el || !table) return;
    const measure = () => setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    const ro = new ResizeObserver(measure); // also fires once on observe, which gives the first reading
    ro.observe(el);
    ro.observe(table);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, []);

  const changeColumns = (next: string[]) => {
    setSaveState("saving");
    setColumns(next);
  };
  const resetLayout = () => {
    setSaveState("saving");
    setColumns(defaults);
    setWidths({});
  };

  const startResize = (e: React.PointerEvent, col: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(col);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => setWidths((w) => ({ ...w, [col]: Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + ev.clientX - startX))) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSaveState("saving");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const resetWidth = (col: string) => {
    setSaveState("saving");
    setWidths((w) => Object.fromEntries(Object.entries(w).filter(([k]) => k !== col)));
  };

  // ---- sorting: the server sorts across every page, so a heading is a link
  const sortHref = (col: string) => {
    let next: TableSort;
    if (!sort || sort.col !== col) next = { col, dir: "asc" };
    else next = sort.dir === "asc" ? { col, dir: "desc" } : null;
    const p = new URLSearchParams(baseQuery);
    if (next) {
      p.set("sort", next.col);
      p.set("dir", next.dir);
    }
    const qs = p.toString();
    return `/p/${projectId}${qs ? `?${qs}` : ""}`;
  };
  const sortIcon = (col: string) =>
    sort?.col === col ? (
      sort.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-label="sorted ascending" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-label="sorted descending" />
    ) : col === RECEIVED && !sort ? (
      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted/60" aria-label="newest first" />
    ) : null;

  // ---- selection helpers
  const clear = () => {
    setSelected(new Set());
    setAllMatching(false);
  };
  const toggleAll = () => {
    setAllMatching(false);
    setSelected(allOnPage ? new Set() : new Set(pageIds));
  };
  const toggle = (id: string) => {
    setAllMatching(false);
    setNotice(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const confirm = () => {
    setError(null);
    start(async () => {
      const res = allMatching ? await deleteAllMatching(projectId, filters) : await deleteSubmissions(projectId, [...selected]);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      clear();
      setNotice(`Permanently deleted ${res.deleted} submission${res.deleted === 1 ? "" : "s"}.`);
      router.refresh();
    });
  };

  // Clicking anywhere on a row opens it (unless the click was a control or the start of selecting text).
  const openRow = (e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).closest("input, button, a, [data-no-open]")) return;
    if (window.getSelection()?.toString()) return;
    startNav();
    router.push(`/p/${projectId}/${id}`);
  };

  const scope = filtered ? "matching your filters" : `in ${projectShort}`;
  const th = "border-b border-r border-line bg-paper-2 px-3 py-2 text-left align-bottom text-[0.7rem] font-semibold uppercase leading-tight tracking-wide text-muted";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          aria-expanded={pickerOpen}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition",
            pickerOpen ? "border-ink bg-night text-white" : "border-line bg-paper hover:border-ink",
          )}
        >
          <Columns3 className="h-4 w-4" /> Columns
          <span className={cn("rounded-full px-2 py-0.5 text-xs tabular-nums", pickerOpen ? "bg-white/15" : "bg-paper-2 text-ink-soft")}>{columns.length}</span>
        </button>
        <p className="hidden text-xs text-muted sm:block">Drag a column edge to resize · click a heading to sort · scroll sideways for more</p>
      </div>

      {notice && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-ok/10 px-4 py-2.5 text-sm font-medium text-ok">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="ml-auto text-ok/70 hover:text-ok">
            <X className="h-4 w-4" />
          </button>
        </p>
      )}

      {selectable && canSelectAll && (
        <p className="mb-3 rounded-xl bg-brand/25 px-4 py-2.5 text-sm">
          All {rows.length} on this page are selected.{" "}
          <button type="button" onClick={() => setAllMatching(true)} className="font-semibold underline underline-offset-2 hover:no-underline">
            Select all {total} {scope}
          </button>
        </p>
      )}
      {selectable && allMatching && (
        <p className="mb-3 rounded-xl bg-brand/25 px-4 py-2.5 text-sm">
          All <strong>{total}</strong> {scope} are selected.{" "}
          <button type="button" onClick={clear} className="font-semibold underline underline-offset-2 hover:no-underline">
            Clear selection
          </button>
        </p>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-line bg-paper shadow-sm" style={{ "--sticky": `${stickyLeft}px` } as React.CSSProperties}>
        <div ref={scroller} className="max-h-[72dvh] overflow-auto overscroll-x-contain" tabIndex={0} aria-label="Submissions table, scrollable">
          <table ref={tableRef} className="border-separate border-spacing-0 text-sm" style={{ width: tableWidth, minWidth: "100%", tableLayout: "fixed" }}>
            <colgroup>
              {selectable && <col style={{ width: CHECK_W }} />}
              <col style={{ width: RECEIVED_W }} />
              {columns.map((c) => (
                <col key={c} style={{ width: widthOf(c) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {selectable && (
                  <th className={cn(th, "sticky top-0 z-20 px-4 md:left-0")} style={{ width: CHECK_W }}>
                    <input
                      type="checkbox"
                      checked={allOnPage}
                      onChange={toggleAll}
                      aria-label="Select every submission on this page"
                      className="h-4 w-4 cursor-pointer accent-[#15171b]"
                    />
                  </th>
                )}
                <th
                  className={cn(th, "sticky top-0 z-20 px-2", selectable ? "md:left-[44px]" : "md:left-0", sort?.col === RECEIVED && "bg-brand/30")}
                  aria-sort={sort?.col === RECEIVED ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <Link href={sortHref(RECEIVED)} className="flex items-center gap-1 hover:text-ink">
                    Received {sortIcon(RECEIVED)}
                  </Link>
                </th>
                {columns.map((c) => (
                  <th key={c} className={cn(th, "sticky top-0 z-10", sort?.col === c && "bg-brand/30")} aria-sort={sort?.col === c ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                    <Link href={sortHref(c)} title={`Sort by ${c}`} className="flex items-end justify-between gap-1 pr-2 hover:text-ink">
                      <span className="line-clamp-2 break-words normal-case tracking-normal">{c}</span>
                      {sortIcon(c)}
                    </Link>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${c}`}
                      title="Drag to resize · double-click to reset"
                      onPointerDown={(e) => startResize(e, c)}
                      onDoubleClick={() => resetWidth(c)}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none hover:bg-brand/70 active:bg-brand"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = allMatching || selected.has(r.id);
                const mark = markById(r.mark);
                const cell = "border-b border-line px-3 py-2.5";
                return (
                  <tr
                    key={r.id}
                    onClick={(e) => openRow(e, r.id)}
                    style={!on && mark ? { backgroundColor: mark.bg } : undefined}
                    className={cn("group cursor-pointer", on ? "bg-[#f6f7cf]" : !mark && "bg-paper hover:bg-paper-2")}
                  >
                    {selectable && (
                      <td className={cn(cell, "z-[5] bg-inherit px-4 md:sticky md:left-0")}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(r.id)}
                          disabled={allMatching}
                          aria-label={`Select submission ${r.id}`}
                          className="h-4 w-4 cursor-pointer accent-[#15171b]"
                        />
                      </td>
                    )}
                    <td className={cn(cell, "z-[5] border-r bg-inherit px-2 md:sticky", selectable ? "md:left-[44px]" : "md:left-0")}>
                      <Link href={`/p/${projectId}/${r.id}`} className="flex items-center gap-2 whitespace-nowrap text-ink-soft">
                        {mark && <span title={mark.label} aria-label={mark.label} className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: mark.dot }} />}
                        <span className="min-w-0 flex-1 truncate">{r.received}</span>
                        {r.flags > 0 && (
                          <span title={`${r.flags} flagged`} className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-flag">
                            <TriangleAlert className="h-3 w-3" />
                            {r.flags}
                          </span>
                        )}
                        {r.notes > 0 && (
                          <span title={`${r.notes} note${r.notes === 1 ? "" : "s"}`} className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-ink-soft">
                            <MessageSquare className="h-3 w-3" />
                            {r.notes}
                          </span>
                        )}
                      </Link>
                    </td>
                    {columns.map((c, i) => {
                      const v = r.data[c] ?? "";
                      const flagged = r.flaggedCols.includes(c);
                      return (
                        <td
                          key={c}
                          title={v}
                          className={cn(cell, "overflow-hidden text-ellipsis whitespace-nowrap", i === 0 && "font-medium", flagged && "bg-flag-wash font-semibold text-flag")}
                        >
                          {v || <span className="text-muted">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Edge shadows: "there's more this way" */}
        <div
          aria-hidden
          className={cn("pointer-events-none absolute inset-y-0 left-0 z-30 w-5 bg-gradient-to-r from-black/15 to-transparent transition-opacity md:left-[var(--sticky)]", edges.left ? "opacity-100" : "opacity-0")}
        />
        <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 z-30 w-8 bg-gradient-to-l from-black/15 to-transparent transition-opacity", edges.right ? "opacity-100" : "opacity-0")} />
      </div>

      {selectable && count > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-3xl bg-night py-2.5 pl-5 pr-3 text-sm text-white shadow-2xl ring-1 ring-night-line">
            <span>
              <strong className="tabular-nums">{count}</strong> selected
            </span>
            <button type="button" onClick={clear} className="text-[#8b919c] hover:text-white">
              Clear
            </button>
            {canWrite && (
              <span className="flex items-center gap-2 border-l border-night-line pl-4">
                <span className="text-[#8b919c]">Highlight</span>
                <MarkPicker
                  dark
                  projectId={projectId}
                  ids={allMatching ? undefined : [...selected]}
                  matching={allMatching ? filters : undefined}
                  onDone={(message) => {
                    clear();
                    setNotice(message);
                  }}
                />
              </span>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirming(true);
                }}
                className="flex items-center gap-1.5 rounded-full bg-flag px-4 py-2 font-semibold transition hover:brightness-110"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </div>
      )}

      {pickerOpen && (
        <ColumnPicker
          available={available}
          columns={columns}
          defaults={defaults}
          flaggedOnPage={flaggedOnPage}
          saveState={saveState}
          onChange={changeColumns}
          onReset={resetLayout}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {canManage && (
        <ConfirmDialog
          open={confirming}
          title={`Permanently delete ${count} submission${count === 1 ? "" : "s"}?`}
          confirmLabel={`Delete ${count}`}
          requireText={allMatching ? "DELETE" : undefined}
          pending={pending}
          error={error}
          onConfirm={confirm}
          onCancel={() => setConfirming(false)}
        >
          <p>
            {allMatching
              ? `This deletes all ${total} submissions ${scope}, including the ones on other pages.`
              : `The selected ${count === 1 ? "submission" : "submissions"} will be removed from the database.`}{" "}
            <strong className="text-ink">This can&rsquo;t be undone.</strong>
          </p>
          <p>
            Want a copy first? Cancel, then use <em>Export to Excel</em>
            {filtered ? " (it exports the same filters)" : ""}.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
