"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { setMark, setMarkForAllMatching } from "@/app/record-actions";
import { MARKS } from "@/lib/marks";
import { cn } from "@/lib/utils";

/**
 * Row of highlight colours, the digital version of colouring a row in Excel.
 * Works on a record (`ids`), on a selection (`ids`), or on everything matching the
 * filters (`matching`). Clicking the colour a record already has clears it.
 */
export default function MarkPicker({
  projectId,
  ids,
  matching,
  current,
  onDone,
  dark,
}: {
  projectId: string;
  ids?: string[];
  matching?: { q: string; from: string; to: string; mark: string; notes: string };
  current?: string | null;
  onDone?: (message: string) => void;
  /** On the dark selection bar. */
  dark?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const apply = (mark: string | null) => {
    setError(null);
    start(async () => {
      const res = matching ? await setMarkForAllMatching(projectId, matching, mark) : await setMark(projectId, ids ?? [], mark);
      if (!res.ok) return setError(res.error);
      onDone?.(mark ? `Highlighted ${res.changed} record${res.changed === 1 ? "" : "s"}.` : `Cleared the highlight on ${res.changed} record${res.changed === 1 ? "" : "s"}.`);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex items-center gap-1.5" role="group" aria-label="Highlight colour">
      {MARKS.map((m) => {
        const on = current === m.id;
        return (
          <button
            key={m.id}
            type="button"
            disabled={pending}
            onClick={() => apply(on ? null : m.id)}
            title={on ? `${m.label} (click to clear)` : m.label}
            aria-label={m.label}
            aria-pressed={on}
            style={{ backgroundColor: m.dot }}
            className={cn(
              "grid h-6 w-6 place-items-center rounded-full text-white transition hover:scale-110 disabled:opacity-60",
              on ? (dark ? "ring-2 ring-white ring-offset-2 ring-offset-night" : "ring-2 ring-ink ring-offset-2") : "ring-1 ring-inset ring-black/10",
            )}
          >
            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </button>
        );
      })}
      <button
        type="button"
        disabled={pending}
        onClick={() => apply(null)}
        title="Clear highlight"
        aria-label="Clear highlight"
        className={cn("grid h-6 w-6 place-items-center rounded-full transition disabled:opacity-60", dark ? "text-[#8b919c] hover:text-white" : "text-muted hover:text-ink")}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </button>
      {error && (
        <span role="alert" className="ml-1 text-xs font-medium text-[#ff8a8f]">
          {error}
        </span>
      )}
    </span>
  );
}
