"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, Loader2, Plus, RotateCcw, Search, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * The column chooser: a side panel that sits beside the table, so you see the table change as
 * you add and remove columns. Search every field the form has collected, add with a click,
 * drag (or use the arrows) to reorder, and add all the columns where something was flagged.
 */
export default function ColumnPicker({
  available,
  columns,
  defaults,
  flaggedOnPage,
  saveState,
  onChange,
  onReset,
  onClose,
}: {
  available: string[];
  columns: string[];
  defaults: string[];
  /** Columns with a flagged answer somewhere on the page being viewed. */
  flaggedOnPage: string[];
  saveState: SaveState;
  onChange: (columns: string[]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const match = (c: string) => !needle || c.toLowerCase().includes(needle);
  const shown = useMemo(() => new Set(columns), [columns]);
  const remaining = useMemo(() => available.filter((c) => !shown.has(c)), [available, shown]);
  const addable = remaining.filter(match);
  const flaggedToAdd = flaggedOnPage.filter((c) => !shown.has(c));
  // Columns saved earlier that the form no longer has still show (empty) until removed.
  const isDefault = columns.length === defaults.length && columns.every((c, i) => c === defaults[i]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= columns.length || from === to) return;
    const next = [...columns];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };
  const remove = (c: string) => columns.length > 1 && onChange(columns.filter((x) => x !== c));
  const add = (c: string) => onChange([...columns, c]);

  return (
    <aside role="dialog" aria-label="Choose columns" className="slide-in fixed inset-y-0 right-0 z-40 flex w-[min(26rem,100vw)] flex-col border-l border-line bg-paper shadow-[-24px_0_60px_-24px_rgba(15,17,21,0.28)] lg:inset-y-2 lg:right-2 lg:rounded-xl lg:border">
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Columns</h2>
          <p className="mt-0.5 text-xs text-muted">
            Showing <strong className="text-ink">{columns.length}</strong> of {Math.max(available.length, columns.length)}. Changes apply to the table right away and are remembered for you.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-muted transition hover:bg-paper-2 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-3 border-b border-line px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {flaggedToAdd.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([...columns, ...flaggedToAdd])}
              className="flex h-7 items-center gap-1.5 rounded-lg bg-flag-wash px-2.5 text-xs font-semibold text-flag ring-1 ring-[#f6d4d6] transition hover:brightness-[0.98]"
            >
              <TriangleAlert className="h-3.5 w-3.5" /> Add {flaggedToAdd.length} flagged column{flaggedToAdd.length === 1 ? "" : "s"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange([...columns, ...remaining])}
            disabled={!remaining.length}
            className="btn btn-secondary h-7 px-2.5 text-xs"
          >
            Show all
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={isDefault}
            className="btn btn-secondary h-7 gap-1.5 px-2.5 text-xs"
          >
            <RotateCcw className="h-3 w-3" /> Default
          </button>
          <span className="ml-auto flex items-center gap-1.5 self-center text-xs text-muted" aria-live="polite">
            {saveState === "saving" && (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving
              </>
            )}
            {saveState === "saved" && (
              <>
                <Check className="h-3 w-3 text-ok" /> Saved
              </>
            )}
            {saveState === "error" && <span className="text-flag">Couldn&rsquo;t save</span>}
          </span>
        </div>
        <label className="relative block">
          <span className="sr-only">Search columns</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all columns…"
            className="field pl-9"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section aria-label="Columns shown">
          <h3 className="eyebrow sticky top-0 z-10 border-b border-line-soft bg-[#fafafa]/95 px-5 py-2 backdrop-blur">In your table · drag to reorder</h3>
          <ul>
            {columns.map((c, i) =>
              !match(c) ? null : (
                <li
                  key={c}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(i);
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onDrop={() => {
                    if (dragFrom !== null) move(dragFrom, i);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  className={cn("group flex items-center gap-2 border-b border-line-soft px-3 py-2 text-[0.8125rem] transition-colors hover:bg-[#fafafa]", dragOver === i && dragFrom !== i && "bg-[#f8f9de]", dragFrom === i && "opacity-40")}
                >
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-faint" aria-hidden />
                  <span className="min-w-0 flex-1 break-words leading-snug" title={c}>
                    {c}
                  </span>
                  <span className="flex shrink-0 items-center opacity-60 group-hover:opacity-100">
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${c} earlier`} className="rounded-md p-1 text-muted hover:bg-paper-2 hover:text-ink disabled:opacity-25">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(i, i + 1)} disabled={i === columns.length - 1} aria-label={`Move ${c} later`} className="rounded-md p-1 text-muted hover:bg-paper-2 hover:text-ink disabled:opacity-25">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => remove(c)} disabled={columns.length <= 1} aria-label={`Remove ${c}`} className="rounded-md p-1 text-muted hover:bg-flag-wash hover:text-flag disabled:opacity-25">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ),
            )}
          </ul>
        </section>

        <section aria-label="More columns">
          <h3 className="eyebrow sticky top-0 z-10 border-b border-line-soft bg-[#fafafa]/95 px-5 py-2 backdrop-blur">
            More columns · {needle ? `${addable.length} match` : remaining.length}
          </h3>
          {addable.length ? (
            <ul>
              {addable.map((c) => (
                <li key={c}>
                  <button type="button" onClick={() => add(c)} className="group flex w-full items-center gap-2 border-b border-line-soft px-3 py-2 text-left text-[0.8125rem] text-ink-soft transition-colors hover:bg-[#fafafa] hover:text-ink">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-paper-2 text-muted ring-1 ring-line transition group-hover:bg-ink group-hover:text-white group-hover:ring-ink">
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0 flex-1 break-words leading-snug">{c}</span>
                    {flaggedOnPage.includes(c) && <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-flag" aria-label="Flagged on this page" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-muted">{needle ? "No other columns match." : "Every column is already in your table."}</p>
          )}
        </section>
      </div>
    </aside>
  );
}
