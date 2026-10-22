"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Check as CheckIcon, CheckCircle2, ChevronDown, Columns3, Eye, MessageSquare, MoreHorizontal, Trash2, TriangleAlert, X } from "lucide-react";
import { deleteAllMatching, deleteSubmissions } from "@/app/actions";
import { resetViewAction, saveViewAction } from "@/app/view-actions";
import ColumnPicker, { type SaveState } from "@/components/ColumnPicker";
import ConfirmDialog from "@/components/ConfirmDialog";
import MarkPicker from "@/components/MarkPicker";
import QuickActions, { type QuickTarget } from "@/components/QuickActions";
import { FocusButton, useFocusMode } from "@/components/TableWorkspace";
import ColumnMenu from "@/components/ColumnMenu";
import RecordPeek from "@/components/RecordPeek";
import { GroupByPicker, ViewsMenu, type SavedViewLite } from "@/components/TableTools";
import { decodeColumnFilter } from "@/lib/filters";
import { firstOf, pct, readChecksFromMap, type Check } from "@/lib/analysis";
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
  /** Colours on individual values: heading → colour. */
  cellMarks: Record<string, string>;
  /** Checks passed / answered (assessment portals). */
  score: { ok: number; total: number } | null;
};
export type TableFilters = { q: string; from: string; to: string; mark: string; notes: string; f: string[] };
/** What the browser needs to read checks and show cleaned-up names (see lib/analysis.ts). */
export type TableAnalysis = { expectNo: string[]; groups: { id: string; label: string; columns: string[] }[] } | null;
export type TableSort = { col: string; dir: "asc" | "desc" } | null;

/** Changes made in this session that the server hasn't sent back yet (so the table reacts instantly). */
type Overrides = Record<string, { mark?: string | null; notes?: number; cells?: Record<string, string | null> }>;

const RECEIVED = "received";
const SCORE = "__score";
const SCORE_W = 132;
const DEFAULT_WIDTH = 170;
const MIN_WIDTH = 70;
const MAX_WIDTH = 900;
const CHECK_W = 44;
const RECEIVED_W = 256;

const elementOf = (n: Node | null) => (n instanceof Element ? n : n?.parentElement ?? null);

/**
 * The submissions grid, built to feel like a spreadsheet:
 *
 * - Choose your own columns from everything the form collected (Columns button); remembered per person.
 * - Scrolls sideways and down inside the table, with the checkbox and Received columns and the heading
 *   row frozen, and edge shadows hinting there's more.
 * - Drag a column's right edge to resize it (double-click to reset); click a heading to sort by it.
 * - Flagged answers are marked in red in the grid; highlighted rows and values are tinted.
 * - Act right where you are: select text in a cell, right-click a row, or press its ⋯ to colour that value or
 *   the whole row, or add a note (pre-filled with what you selected). No need to open the record.
 * - Tick rows to highlight or (Managers) delete them, or "Select all N" across every page of a filter.
 */
export default function SubmissionsTable({
  projectId,
  projectShort,
  titleColumn,
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
  analysis = null,
  aliases = {},
  savedViews = [],
  group = "",
}: {
  projectId: string;
  projectShort: string;
  /** Which column names a record (for the quick-actions heading). */
  titleColumn: string;
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
  analysis?: TableAnalysis;
  /** Cleaned-up names: group id → recorded spelling → name shown. */
  aliases?: Record<string, Record<string, string>>;
  savedViews?: SavedViewLite[];
  group?: string;
}) {
  const router = useRouter();
  const { focus, slot } = useFocusMode();

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

  // ---- quick actions (select text / right-click / ⋯)
  const [quick, setQuick] = useState<QuickTarget | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [overridesFor, setOverridesFor] = useState(rows);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Fresh rows from the server replace anything we were showing optimistically.
  if (overridesFor !== rows) {
    setOverridesFor(rows);
    setOverrides({});
  }

  // ---- scrolling
  const scroller = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const selectable = canWrite || canManage;
  const stickyLeft = (selectable ? CHECK_W : 0) + RECEIVED_W;
  const widthOf = (c: string) => widths[c] ?? DEFAULT_WIDTH;
  const tableWidth = stickyLeft + (analysis ? SCORE_W : 0) + columns.reduce((sum, c) => sum + widthOf(c), 0);

  // ---- reading the answers: checks per row, and cleaned-up names for group columns
  const checksById = useMemo(() => {
    const m = new Map<string, Map<string, Check>>();
    if (analysis) for (const r of rows) m.set(r.id, readChecksFromMap(r.data, analysis));
    return m;
  }, [rows, analysis]);
  const groupOfColumn = useMemo(() => new Map((analysis?.groups ?? []).flatMap((g) => g.columns.map((c) => [c, g.id] as const))), [analysis]);
  const shown = (col: string, v: string) => {
    const g = groupOfColumn.get(col);
    return g ? (aliases[g]?.[v.trim()] ?? v) : v;
  };
  const filteredCols = new Set(filters.f.map((raw) => decodeColumnFilter(raw)?.col).filter(Boolean) as string[]);

  // ---- column menu and quick peek
  const [menu, setMenu] = useState<{ col: string; anchor: DOMRect } | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const peekIndex = peekId ? rows.findIndex((r) => r.id === peekId) : -1;
  const peekRow = peekIndex >= 0 ? rows[peekIndex] : null;
  const focusRow = (id: string) => document.querySelector<HTMLElement>(`tr[data-row="${id}"]`)?.focus({ preventScroll: false });
  const onRowKey = (e: React.KeyboardEvent<HTMLTableRowElement>, r: TableRow, i: number) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === " " && analysis) {
      e.preventDefault();
      setPeekId(r.id);
    } else if (e.key === "Enter") {
      e.preventDefault();
      startNav();
      router.push(`/p/${projectId}/${r.id}`);
    } else if (e.key === "ArrowDown" && rows[i + 1]) {
      e.preventDefault();
      focusRow(rows[i + 1].id);
    } else if (e.key === "ArrowUp" && rows[i - 1]) {
      e.preventDefault();
      focusRow(rows[i - 1].id);
    }
  };

  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const count = allMatching ? total : selected.size;
  const canSelectAll = allOnPage && !allMatching && total > rows.length;
  const flaggedOnPage = useMemo(() => [...new Set(rows.flatMap((r) => r.flaggedCols))], [rows]);
  const isDefaultLayout = columns.length === defaults.length && columns.every((c, i) => c === defaults[i]) && Object.keys(widths).length === 0;
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  // What a row looks like right now, including changes the server hasn't confirmed yet.
  const rowMark = (r: TableRow) => (overrides[r.id] && "mark" in overrides[r.id] ? overrides[r.id].mark ?? null : r.mark);
  const rowNotes = (r: TableRow) => r.notes + (overrides[r.id]?.notes ?? 0);
  const cellMark = (r: TableRow, c: string) => {
    const o = overrides[r.id]?.cells;
    return o && c in o ? o[c] : (r.cellMarks[c] ?? null);
  };
  /** Every coloured value on a row right now (including unconfirmed changes), column → colour. */
  const cellMarksOf = (r: TableRow) => {
    const merged: Record<string, string | null> = { ...r.cellMarks, ...overrides[r.id]?.cells };
    return Object.fromEntries(Object.entries(merged).filter((e): e is [string, string] => e[1] !== null));
  };
  const titleOf = (r: TableRow) => r.data[titleColumn] || `#${r.id}`;

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

  const showToast = (message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

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

  // Clicking anywhere on a row opens it (unless it was a control, the start of selecting text, or just dismissing the pill).
  const openRow = (e: React.MouseEvent, id: string) => {
    if (quick) return setQuick(null);
    if ((e.target as HTMLElement).closest("input, button, a, [data-no-open]")) return;
    if (window.getSelection()?.toString()) return;
    startNav();
    router.push(`/p/${projectId}/${id}`);
  };

  // ---- quick actions: three ways in
  const rowFromNode = (n: Node | null) => {
    const tr = elementOf(n)?.closest<HTMLElement>("tr[data-row]");
    return tr ? { tr, row: byId.get(tr.dataset.row!) } : null;
  };
  const cellFromNode = (n: Node | null) => elementOf(n)?.closest<HTMLElement>("td[data-col]") ?? null;

  /** 1) Select text in a cell (or across a row). */
  const onSelectEnd = () => {
    if (!canWrite) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const text = sel.toString().replace(/\s+/g, " ").trim();
      if (!text || text.length > 400) return;
      const range = sel.getRangeAt(0);
      const start = rowFromNode(range.startContainer);
      const end = rowFromNode(range.endContainer);
      if (!start?.row || start.tr !== end?.tr) return; // the selection must stay inside one record
      const cell = cellFromNode(range.startContainer);
      const col = cell && cell === cellFromNode(range.endContainer) ? (cell.dataset.col ?? null) : null;
      const rect = range.getBoundingClientRect();
      setQuick({ anchor: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }, rowId: start.row.id, title: titleOf(start.row), col, quote: text, value: col ? (start.row.data[col] ?? "") : "" });
    }, 0);
  };

  /** 2) Right-click a row. Viewers keep the browser's own menu. */
  const onRowContext = (e: React.MouseEvent, r: TableRow) => {
    if (!canWrite || (e.target as HTMLElement).closest("input, a, button")) return;
    e.preventDefault();
    const cell = cellFromNode(e.target as Node);
    const col = cell?.dataset.col ?? null;
    const picked = window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "";
    const insideCell = !!cell && !!window.getSelection()?.anchorNode && cell.contains(window.getSelection()!.anchorNode);
    setQuick({ anchor: { x: e.clientX, y: e.clientY, w: 0, h: 0 }, rowId: r.id, title: titleOf(r), col, quote: insideCell ? picked : "", value: col ? (r.data[col] ?? "") : "" });
  };

  /** 3) The ⋯ button on a row. */
  const onRowButton = (e: React.MouseEvent, r: TableRow) => {
    e.stopPropagation();
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setQuick({ anchor: { x: b.left, y: b.top, w: b.width, h: b.height }, rowId: r.id, title: titleOf(r), col: null, quote: "", value: "" });
  };

  const quickRow = quick ? byId.get(quick.rowId) : undefined;

  const scope = filtered ? "matching your filters" : `in ${projectShort}`;
  const columnsButton = (
    <button type="button" onClick={() => setPickerOpen((o) => !o)} aria-expanded={pickerOpen} className={cn("btn btn-sm", pickerOpen ? "btn-primary" : "btn-secondary")}>
      <Columns3 className="h-3.5 w-3.5" /> <span className={cn(focus && "hidden sm:inline")}>Columns</span>
      <span className={cn("rounded-full px-1.5 py-0.5 text-[0.6875rem] tabular-nums leading-none", pickerOpen ? "bg-white/15" : "bg-paper-2 text-ink-soft ring-1 ring-line")}>{columns.length}</span>
    </button>
  );
  const th = "border-b border-r border-line border-r-line-soft bg-[#fafafa] px-3 py-2 text-left align-bottom text-xs font-medium leading-tight text-muted";

  const tools = (
    <>
      {columnsButton}
      <ViewsMenu projectId={projectId} views={savedViews} canManage={canManage} />
      {analysis && <GroupByPicker groups={analysis.groups} current={group} />}
    </>
  );

  return (
    <>
      {focus ? (
        // In focus mode the table's tools live in the command bar at the top.
        slot && createPortal(<span className="flex items-center gap-1.5">{tools}</span>, slot)
      ) : (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2">
            {tools}
            <FocusButton />
          </span>
          <p className="hidden text-xs text-faint lg:block">
            {analysis ? "Space on a row: quick look · ▾ on a heading: counts & filter · " : ""}
            {canWrite ? "select text to highlight · " : ""}drag a column edge to resize
          </p>
        </div>
      )}

      {notice && (
        <p role="status" className="pop-in mb-3 flex items-center gap-2 rounded-lg bg-[#effaf3] px-3.5 py-2.5 text-[0.8125rem] font-medium text-ok ring-1 ring-[#cdebd8]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="ml-auto text-ok/70 hover:text-ok">
            <X className="h-4 w-4" />
          </button>
        </p>
      )}

      {selectable && canSelectAll && (
        <p className="mb-3 rounded-lg bg-[#fafbe3] px-3.5 py-2.5 text-[0.8125rem] text-ink-soft ring-1 ring-[#e9eba6]">
          All {rows.length} on this page are selected.{" "}
          <button type="button" onClick={() => setAllMatching(true)} className="font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
            Select all {total} {scope}
          </button>
        </p>
      )}
      {selectable && allMatching && (
        <p className="mb-3 rounded-lg bg-[#fafbe3] px-3.5 py-2.5 text-[0.8125rem] text-ink-soft ring-1 ring-[#e9eba6]">
          All <strong>{total}</strong> {scope} are selected.{" "}
          <button type="button" onClick={clear} className="font-semibold text-ink underline decoration-ink/30 underline-offset-2 hover:decoration-ink">
            Clear selection
          </button>
        </p>
      )}

      <div className={cn("card relative overflow-hidden", focus && "flex min-h-0 flex-1 flex-col")} style={{ "--sticky": `${stickyLeft}px` } as React.CSSProperties}>
        <div ref={scroller} onMouseUp={onSelectEnd} onKeyUp={(e) => e.shiftKey && onSelectEnd()} className={cn("overflow-auto overscroll-x-contain", focus ? "min-h-0 flex-1" : "max-h-[72dvh]")} tabIndex={0} aria-label="Submissions table, scrollable">
          <table ref={tableRef} className="border-separate border-spacing-0 text-sm" style={{ width: tableWidth, minWidth: "100%", tableLayout: "fixed" }}>
            <colgroup>
              {selectable && <col style={{ width: CHECK_W }} />}
              <col style={{ width: RECEIVED_W }} />
              {analysis && <col style={{ width: SCORE_W }} />}
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
                  className={cn(th, "sticky top-0 z-20 px-2", selectable ? "md:left-[44px]" : "md:left-0", sort?.col === RECEIVED && "bg-paper-2 text-ink")}
                  aria-sort={sort?.col === RECEIVED ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <Link href={sortHref(RECEIVED)} className="flex items-center gap-1 hover:text-ink">
                    Received {sortIcon(RECEIVED)}
                  </Link>
                </th>
                {analysis && (
                  <th className={cn(th, "sticky top-0 z-10", sort?.col === SCORE && "bg-paper-2 text-ink")} aria-sort={sort?.col === SCORE ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                    <Link href={sortHref(SCORE)} title="Sort by score (lowest first, then highest)" className="flex items-center gap-1 hover:text-ink">
                      Score {sortIcon(SCORE)}
                    </Link>
                  </th>
                )}
                {columns.map((c) => (
                  <th key={c} className={cn(th, "group/th sticky top-0 z-10", sort?.col === c && "bg-paper-2 text-ink", filteredCols.has(c) && "bg-[#fafbe3] text-ink")} aria-sort={sort?.col === c ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                    <span className="flex items-end gap-1 pr-2">
                      <Link href={sortHref(c)} title={`Sort by ${c}`} className="flex min-w-0 flex-1 items-end justify-between gap-1 hover:text-ink">
                        <span className="line-clamp-2 break-words">{c}</span>
                        {sortIcon(c)}
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => setMenu({ col: c, anchor: (e.currentTarget.closest("th") as HTMLElement).getBoundingClientRect() })}
                        title="Counts, filter, sort, hide"
                        aria-label={`Options for ${c}`}
                        className={cn("grid h-5 w-5 shrink-0 place-items-center rounded text-muted transition hover:bg-black/[0.06] hover:text-ink", filteredCols.has(c) ? "opacity-100" : "opacity-60 group-hover/th:opacity-100")}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </span>
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${c}`}
                      title="Drag to resize · double-click to reset"
                      onPointerDown={(e) => startResize(e, c)}
                      onDoubleClick={() => resetWidth(c)}
                      className="absolute -right-px top-0 h-full w-1.5 cursor-col-resize touch-none select-none transition-colors hover:bg-ink/15 active:bg-ink/30"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = allMatching || selected.has(r.id);
                const mark = markById(rowMark(r));
                const notes = rowNotes(r);
                const active = quick?.rowId === r.id;
                const cell = "border-b border-line-soft px-3 py-2.5";
                return (
                  <tr
                    key={r.id}
                    data-row={r.id}
                    tabIndex={0}
                    onKeyDown={(e) => onRowKey(e, r, rows.indexOf(r))}
                    onClick={(e) => openRow(e, r.id)}
                    onContextMenu={(e) => onRowContext(e, r)}
                    style={!on && mark ? { backgroundColor: mark.bg } : undefined}
                    className={cn("group cursor-pointer outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink/40", on ? "bg-[#f8f9de]" : !mark && "bg-paper hover:bg-[#fafafb]", (active || peekId === r.id) && "outline outline-2 -outline-offset-2 outline-ink/25")}
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
                    <td className={cn(cell, "z-[5] border-r border-r-line bg-inherit px-2 md:sticky", selectable ? "md:left-[44px]" : "md:left-0")}>
                      <div className="flex items-center gap-1.5">
                        <Link href={`/p/${projectId}/${r.id}`} className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap tabular-nums text-ink-soft">
                          {mark && <span title={mark.label} aria-label={mark.label} className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: mark.dot }} />}
                          <span className="min-w-0 flex-1 truncate">{r.received}</span>
                          {r.flags > 0 && (
                            <span title={`${r.flags} flagged`} className="flex shrink-0 items-center gap-0.5 rounded-full bg-flag-wash px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-flag ring-1 ring-[#f6d4d6]">
                              <TriangleAlert className="h-3 w-3" />
                              {r.flags}
                            </span>
                          )}
                          {notes > 0 && (
                            <span title={`${notes} note${notes === 1 ? "" : "s"}`} className="flex shrink-0 items-center gap-0.5 rounded-full bg-paper-2 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-ink-soft ring-1 ring-line">
                              <MessageSquare className="h-3 w-3" />
                              {notes}
                            </span>
                          )}
                        </Link>
                        {analysis && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPeekId(r.id);
                            }}
                            title="Quick look (Space)"
                            aria-label={`Quick look at ${titleOf(r)}`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition hover:bg-black/[0.06] hover:text-ink focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {canWrite && (
                          <button
                            type="button"
                            onClick={(e) => onRowButton(e, r)}
                            title="Highlight or add a note"
                            aria-label={`Quick actions for ${titleOf(r)}`}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition hover:bg-black/[0.06] hover:text-ink focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                    {analysis && (
                      <td className={cell} data-no-open>
                        {r.score ? (
                          <span className="flex items-center gap-2" title={`${r.score.ok} of ${r.score.total} checks passed`}>
                            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-paper-2 ring-1 ring-line-soft" aria-hidden>
                              <span className={cn("block h-full rounded-full", pct(r.score.ok, r.score.total) >= 90 ? "bg-ok" : pct(r.score.ok, r.score.total) >= 75 ? "bg-[#d97706]" : "bg-flag")} style={{ width: `${pct(r.score.ok, r.score.total)}%` }} />
                            </span>
                            <span className="text-xs font-semibold tabular-nums text-ink">{pct(r.score.ok, r.score.total)}%</span>
                            <span className="text-[0.6875rem] tabular-nums text-faint">
                              {r.score.ok}/{r.score.total}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    )}
                    {columns.map((c, i) => {
                      const raw = r.data[c] ?? "";
                      const check = checksById.get(r.id)?.get(c);
                      const v = shown(c, raw);
                      const flagged = check ? !check.ok : r.flaggedCols.includes(c);
                      const cm = markById(cellMark(r, c));
                      return (
                        <td
                          key={c}
                          data-col={c}
                          title={check ? `${check.answer}${check.remark ? ` · Remarks: ${check.remark}` : ""}` : v !== raw ? `${v} (recorded as “${raw}”)` : v}
                          style={cm ? { backgroundColor: cm.bg, boxShadow: `inset 4px 0 0 ${cm.dot}` } : undefined}
                          className={cn(cell, "overflow-hidden text-ellipsis whitespace-nowrap text-ink-soft", i === 0 && "font-medium text-ink", flagged && !cm && "bg-flag-wash", flagged && !check && "font-semibold text-flag")}
                        >
                          {check ? (
                            <span className="inline-flex max-w-full items-center gap-1.5">
                              <span
                                className={cn(
                                  "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none ring-1",
                                  check.ok ? "bg-[#effaf3] text-ok ring-[#cdebd8]" : "bg-flag text-white ring-flag",
                                )}
                              >
                                {check.ok ? <CheckIcon className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
                                {check.answer}
                              </span>
                              {check.remark && (
                                <span className={cn("flex min-w-0 items-center gap-1 truncate text-xs", check.ok ? "text-muted" : "font-normal text-ink-soft")}>
                                  <MessageSquare className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{check.remark}</span>
                                </span>
                              )}
                            </span>
                          ) : (
                            v || <span className="text-muted">—</span>
                          )}
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
          className={cn("pointer-events-none absolute inset-y-0 left-0 z-30 w-6 bg-gradient-to-r from-black/[0.07] to-transparent transition-opacity md:left-[var(--sticky)]", edges.left ? "opacity-100" : "opacity-0")}
        />
        <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 z-30 w-10 bg-gradient-to-l from-black/[0.07] to-transparent transition-opacity", edges.right ? "opacity-100" : "opacity-0")} />
      </div>

      {selectable && count > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
          <div className="pop-in flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl bg-night/95 py-2 pl-4 pr-2 text-[0.8125rem] text-white shadow-pop ring-1 ring-white/10 backdrop-blur">
            <span>
              <strong className="mr-0.5 inline-grid min-w-6 place-items-center rounded-md bg-white/10 px-1.5 py-0.5 tabular-nums">{count}</strong> selected
            </span>
            <button type="button" onClick={clear} className="text-[#8b919c] hover:text-white">
              Clear
            </button>
            {canWrite && (
              <span className="flex items-center gap-2 border-l border-white/10 pl-4">
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
                className="btn btn-danger btn-sm rounded-lg"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </div>
      )}

      {quick && quickRow && (
        <QuickActions
          key={`${quick.rowId}|${quick.col ?? ""}|${quick.quote}|${quick.anchor.x}|${quick.anchor.y}`}
          projectId={projectId}
          target={quick}
          rowMark={rowMark(quickRow)}
          cellMark={quick.col ? cellMark(quickRow, quick.col) : null}
          rowCellMarks={cellMarksOf(quickRow)}
          rowCopyText={columns.map((c) => quickRow.data[c] ?? "").join("\t")}
          canWrite={canWrite}
          onClose={() => setQuick(null)}
          onMarked={(markScope, mark) => {
            setOverrides((o) => ({
              ...o,
              [quick.rowId]:
                markScope === "all"
                  ? { ...o[quick.rowId], mark: null, cells: Object.fromEntries(Object.keys(cellMarksOf(quickRow)).map((c) => [c, null])) }
                  : markScope === "row"
                    ? { ...o[quick.rowId], mark }
                    : { ...o[quick.rowId], cells: { ...o[quick.rowId]?.cells, [quick.col as string]: mark } },
            }));
            router.refresh();
          }}
          onNoted={() => {
            setOverrides((o) => ({ ...o, [quick.rowId]: { ...o[quick.rowId], notes: (o[quick.rowId]?.notes ?? 0) + 1 } }));
            router.refresh();
          }}
          onToast={showToast}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-4 z-[60] -translate-x-1/2">
          <div className="pop-in flex items-center gap-2 rounded-xl bg-night/95 py-2 pl-3 pr-4 text-[0.8125rem] font-medium text-white shadow-pop ring-1 ring-white/10 backdrop-blur">
            <CheckCircle2 className="h-4 w-4 text-[#7ee2a8]" />
            {toast}
          </div>
        </div>
      )}

      {menu && (
        <ColumnMenu
          key={menu.col}
          projectId={projectId}
          col={menu.col}
          filters={filters}
          anchor={menu.anchor}
          onHide={() => changeColumns(columns.filter((x) => x !== menu.col))}
          onClose={() => setMenu(null)}
        />
      )}

      {peekRow && analysis && (
        <RecordPeek
          projectId={projectId}
          canWrite={canWrite}
          row={peekRow}
          title={titleOf(peekRow)}
          checks={[...(checksById.get(peekRow.id)?.values() ?? [])]}
          facts={[
            ...analysis.groups.map((g) => {
              const col = g.columns.find((c) => c in peekRow.data) ?? g.columns[0];
              return { label: g.label, value: shown(col, firstOf(Object.keys(peekRow.data), Object.values(peekRow.data), g.columns)) };
            }),
          ]}
          position={{ index: peekIndex, total: rows.length }}
          onPrev={rows[peekIndex - 1] ? () => setPeekId(rows[peekIndex - 1].id) : null}
          onNext={rows[peekIndex + 1] ? () => setPeekId(rows[peekIndex + 1].id) : null}
          onClose={() => {
            const id = peekRow.id;
            setPeekId(null);
            requestAnimationFrame(() => focusRow(id));
          }}
        />
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
