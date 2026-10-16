"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ClipboardCopy, Eraser, ExternalLink, Loader2, MessageSquarePlus, Send, X } from "lucide-react";
import { clearHighlights, createNote, setCellMarkAction, setMark } from "@/app/record-actions";
import { MARKS, markById } from "@/lib/marks";
import { startNav } from "@/lib/nav-state";
import { cn } from "@/lib/utils";

/** Where the person pointed, in screen coordinates. */
export type Anchor = { x: number; y: number; w: number; h: number };

export type QuickTarget = {
  anchor: Anchor;
  rowId: string;
  /** Short name for the record, e.g. the Name column. */
  title: string;
  /** The column the action is about, or null for a whole-row action. */
  col: string | null;
  /** Text the person selected (empty if they just right-clicked or used the row button). */
  quote: string;
  /** The value in that cell. */
  value: string;
  /** Start in "write a note" mode. */
  openNote?: boolean;
};

const POPOVER_W = 340;

/**
 * The pill that appears when you select text in a cell, right-click a row, or press a row's ⋯ button.
 * Colour the value or the whole row, add a note (pre-filled with what you selected), copy, or open the record.
 * Everything saves immediately and the table updates without a reload.
 */
export default function QuickActions({
  projectId,
  target,
  rowMark,
  cellMark,
  rowCellMarks,
  rowCopyText,
  canWrite,
  onClose,
  onMarked,
  onNoted,
  onToast,
}: {
  projectId: string;
  target: QuickTarget;
  rowMark: string | null;
  cellMark: string | null;
  /** Every coloured value on this row (column → colour), including ones not on screen. */
  rowCellMarks: Record<string, string>;
  /** The row's visible values, tab-separated (pastes straight into Excel). */
  rowCopyText: string;
  canWrite: boolean;
  onClose: () => void;
  /** "all" means the row colour and every coloured value were cleared. */
  onMarked: (scope: "cell" | "row" | "all", mark: string | null) => void;
  onNoted: () => void;
  onToast: (message: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const hasCell = target.col !== null;
  const [scope, setScope] = useState<"cell" | "row">(hasCell ? "cell" : "row");
  const [noting, setNoting] = useState(Boolean(target.openNote));
  const [text, setText] = useState(() => (target.quote ? `“${target.quote.slice(0, 200)}”${target.col ? ` (${target.col})` : ""}\n` : target.col && target.value ? `${target.col}: ${target.value.slice(0, 120)}\n` : ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  const current = scope === "cell" ? cellMark : rowMark;
  const colouredValues = Object.keys(rowCellMarks).length;
  const anything = rowMark !== null || colouredValues > 0;

  const clearAll = () => {
    if (!canWrite || pending) return;
    setError(null);
    start(async () => {
      const res = await clearHighlights(projectId, [target.rowId]);
      if (!res.ok) return setError(res.error);
      onMarked("all", null);
      onToast("All highlights on this row cleared");
      onClose();
    });
  };

  const paint = (mark: string | null) => {
    if (!canWrite || pending) return;
    setError(null);
    // Pressing the colour that's already there clears it.
    const next = mark !== null && mark === current ? null : mark;
    start(async () => {
      const res = scope === "cell" && target.col ? await setCellMarkAction(projectId, target.rowId, target.col, next) : await setMark(projectId, [target.rowId], next);
      if (!res.ok) return setError(res.error);
      onMarked(scope, next);
      onToast(next ? `${scope === "cell" ? "Value" : "Row"} highlighted` : `${scope === "cell" ? "Value" : "Row"} highlight cleared`);
      onClose();
    });
  };

  // Close on Escape or a click anywhere outside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      // Number keys pick a colour, 0 clears: quick when your hands are on the keyboard.
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (canWrite && /^[0-5]$/.test(e.key)) paint(e.key === "0" ? null : MARKS[Number(e.key) - 1].id);
    };
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  });

  useEffect(() => {
    if (noting) {
      const el = noteRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [noting]);

  const saveNote = () => {
    if (!text.trim() || pending) return;
    setError(null);
    start(async () => {
      const res = await createNote(projectId, target.rowId, text);
      if (!res.ok) return setError(res.error);
      onNoted();
      onToast(`Note added to ${target.title || "record"}`);
      onClose();
    });
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      onToast(label === "row" ? "Row copied: paste it into Excel" : "Copied");
      setTimeout(onClose, 450);
    } catch {
      setError("Couldn't copy. Select the text and press Ctrl/⌘+C.");
    }
  };

  // Float above the pointed-at text when there's room, else below; keep inside the screen.
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const left = Math.max(8, Math.min(target.anchor.x + target.anchor.w / 2 - POPOVER_W / 2, vw - POPOVER_W - 8));
  const above = target.anchor.y > 230;
  const pos = above ? { left, bottom: vh - target.anchor.y + 10 } : { left, top: target.anchor.y + target.anchor.h + 10 };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Quick actions for ${target.title || "this record"}`}
      // Keep the text selection alive while pressing buttons (but let the note box take focus normally).
      onMouseDown={(e) => !(e.target as HTMLElement).closest("textarea") && e.preventDefault()}
      style={{ ...pos, width: POPOVER_W }}
      className="pop-in fixed z-50 rounded-xl bg-night/[0.97] p-3 text-[0.8125rem] text-white shadow-pop ring-1 ring-white/10 backdrop-blur"
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs text-[#9aa1ad]">
          <strong className="text-white">{target.title || "Record"}</strong>
          {hasCell && scope === "cell" ? <> · {target.col}</> : <> · whole row</>}
          {target.quote && <span className="mt-0.5 block truncate italic text-[#c9ced8]">“{target.quote}”</span>}
        </p>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded p-1 text-[#8b919c] hover:bg-white/[0.07] hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {canWrite && !noting && (
        <>
          {hasCell && (
            <div role="radiogroup" aria-label="What to highlight" className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-white/[0.06] p-0.5 text-xs font-medium ring-1 ring-white/[0.06]">
              {(["cell", "row"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={scope === s}
                  onClick={() => setScope(s)}
                  className={cn("rounded-md px-2 py-1.5 transition", scope === s ? "bg-white text-night shadow-sm" : "text-[#9aa1ad] hover:text-white")}
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    {s === "cell" ? "This value" : "Whole row"}
                    {/* What's on it now, so an existing colour is never hidden behind the other tab */}
                    {markById(s === "cell" ? cellMark : rowMark) && (
                      <span
                        title={`Currently ${markById(s === "cell" ? cellMark : rowMark)!.label}`}
                        className="h-2 w-2 rounded-full ring-1 ring-black/20"
                        style={{ backgroundColor: markById(s === "cell" ? cellMark : rowMark)!.dot }}
                      />
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-1" role="group" aria-label="Highlight colour">
            {MARKS.map((m, i) => (
              <button
                key={m.id}
                type="button"
                disabled={pending}
                onClick={() => paint(m.id)}
                title={`${m.label} (press ${i + 1})`}
                aria-label={m.label}
                aria-pressed={current === m.id}
                style={{ backgroundColor: m.dot }}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-full text-white transition hover:scale-110 disabled:opacity-60",
                  current === m.id ? "ring-2 ring-white ring-offset-2 ring-offset-night" : "ring-1 ring-white/10",
                )}
              >
                {current === m.id ? <Check className="h-4 w-4" strokeWidth={3} /> : <span className="text-[0.65rem] font-bold opacity-70">{i + 1}</span>}
              </button>
            ))}
            <button type="button" disabled={pending || current === null} onClick={() => paint(null)} title={`Clear ${scope === "cell" ? "this value's" : "the row's"} colour (press 0)`} aria-label="Clear highlight" className="grid h-8 w-8 place-items-center rounded-full text-[#8b919c] hover:bg-white/[0.07] hover:text-white disabled:opacity-30">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
          </div>
          {anything && (
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[0.7rem] text-[#9aa1ad] ring-1 ring-white/[0.06]">
              <span className="min-w-0 truncate">
                {rowMark ? `Row: ${markById(rowMark)?.label}` : "Row: no colour"}
                {colouredValues > 0 && ` · ${colouredValues} coloured value${colouredValues === 1 ? "" : "s"}`}
              </span>
              <button
                type="button"
                onClick={clearAll}
                disabled={pending}
                title="Remove the row colour and every coloured value on this row"
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-white transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                <Eraser className="h-3 w-3" /> Clear all
              </button>
            </div>
          )}
        </>
      )}

      {noting && (
        <div className="space-y-2">
          <textarea
            ref={noteRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveNote();
            }}
            rows={4}
            maxLength={2000}
            placeholder="Write a note about this record…"
            aria-label="Note"
            className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[0.8125rem] text-white outline-none transition placeholder:text-[#6b717c] focus:border-white/25 focus:bg-white/[0.06]"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.7rem] text-[#6b717c]">Ctrl/⌘ + Enter to save</span>
            <span className="flex gap-1.5">
              <button type="button" onClick={() => setNoting(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-[#9aa1ad] hover:text-white">
                Back
              </button>
              <button type="button" onClick={saveNote} disabled={!text.trim() || pending} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-night transition hover:brightness-105 disabled:opacity-50">
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Add note
              </button>
            </span>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-flag/20 px-2.5 py-1.5 text-xs font-medium text-[#ff9a9f]">
          {error}
        </p>
      )}

      {!noting && (
        <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-white/[0.08] pt-2.5 text-xs font-medium">
          {canWrite && (
            <button type="button" onClick={() => setNoting(true)} className="flex items-center gap-1.5 rounded-lg bg-white/[0.08] px-2.5 py-1.5 transition hover:bg-white/[0.13]">
              <MessageSquarePlus className="h-3.5 w-3.5" /> Add note
            </button>
          )}
          <button type="button" onClick={() => copy("text", target.quote || target.value)} disabled={!target.quote && !target.value} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[#c9ced8] hover:bg-white/[0.07] disabled:opacity-40">
            {copied === "text" ? <Check className="h-3.5 w-3.5 text-ok" /> : <ClipboardCopy className="h-3.5 w-3.5" />} Copy {target.quote ? "selection" : "value"}
          </button>
          <button type="button" onClick={() => copy("row", rowCopyText)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[#c9ced8] hover:bg-white/[0.07]">
            {copied === "row" ? <Check className="h-3.5 w-3.5 text-ok" /> : <ClipboardCopy className="h-3.5 w-3.5" />} Copy row
          </button>
          <Link href={`/p/${projectId}/${target.rowId}`} onClick={() => startNav()} className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[#c9ced8] hover:bg-white/[0.07]">
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </Link>
        </div>
      )}
    </div>
  );
}
