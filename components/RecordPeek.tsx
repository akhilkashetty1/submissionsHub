"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, History, Loader2, MessageSquare, Repeat, TriangleAlert, X } from "lucide-react";
import { historyAction } from "@/app/analysis-actions";
import { REMARKS_SUFFIX, pct, type Check } from "@/lib/analysis";
import type { History as HistoryData } from "@/lib/insights";
import { startNav } from "@/lib/nav-state";
import { cn } from "@/lib/utils";

export type PeekRow = { id: string; received: string; data: Record<string, string>; score: { ok: number; total: number } | null };

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function ScoreBadge({ ok, total, size = "sm" }: { ok: number; total: number; size?: "sm" | "md" }) {
  const p = pct(ok, total);
  const tone = p >= 90 ? "bg-[#effaf3] text-ok ring-[#cdebd8]" : p >= 75 ? "bg-[#fffbeb] text-[#92400e] ring-[#fde68a]" : "bg-flag-wash text-flag ring-[#f6d4d6]";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full font-semibold tabular-nums ring-1", tone, size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs")} title={`${ok} of ${total} checks passed`}>
      {ok}/{total}
      <span className="font-normal opacity-75">· {p}%</span>
    </span>
  );
}

/**
 * Quick peek: the whole record in a side panel without leaving the table. ↑/↓ (or J/K) move through the
 * rows on this page, Enter opens the full record, Esc closes. Shows what failed (with remarks), the
 * person's earlier assessments and anything failing again and again.
 */
export default function RecordPeek({
  projectId,
  row,
  title,
  checks,
  facts,
  position,
  onPrev,
  onNext,
  onClose,
}: {
  projectId: string;
  row: PeekRow;
  title: string;
  checks: Check[];
  /** Key facts to show first (HQ, Team, Line Manager, vehicle), already cleaned up. */
  facts: { label: string; value: string }[];
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [history, setHistory] = useState<{ id: string; data: HistoryData | null; error?: string } | null>(null);

  useEffect(() => {
    let live = true;
    historyAction(projectId, row.id).then((res) => {
      if (live) setHistory({ id: row.id, data: res.ok ? res.history : null, error: res.ok ? undefined : res.error });
    });
    return () => {
      live = false;
    };
  }, [projectId, row.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") return onClose();
      if ((e.key === "ArrowDown" || e.key === "j") && onNext) return e.preventDefault(), onNext();
      if ((e.key === "ArrowUp" || e.key === "k") && onPrev) return e.preventDefault(), onPrev();
      if (e.key === "Enter") {
        e.preventDefault();
        startNav();
        router.push(`/p/${projectId}/${row.id}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrev, projectId, router, row.id]);

  const failed = checks.filter((c) => !c.ok);
  const checkHeaders = new Set(checks.map((c) => c.header));
  const others = Object.entries(row.data).filter(([h]) => !checkHeaders.has(h) && !h.endsWith(REMARKS_SUFFIX) && !facts.some((f) => f.label === h));
  const loading = !history || history.id !== row.id;
  const entries = history?.data?.entries ?? [];
  const repeats = history?.data?.repeats ?? [];
  const sections = [...new Set(checks.map((c) => c.section ?? ""))];

  return (
    <aside role="dialog" aria-label={`Quick look: ${title}`} className="slide-in fixed inset-y-0 right-0 z-50 flex w-full max-w-[30rem] flex-col border-l border-line bg-paper shadow-pop">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">
            #{row.id} · {row.received} · {position.index + 1} of {position.total} on this page
          </p>
          <h2 className="mt-0.5 truncate text-lg font-semibold tracking-[-0.02em]">{title}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {row.score && <ScoreBadge ok={row.score.ok} total={row.score.total} size="md" />}
            {failed.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-flag">
                <TriangleAlert className="h-3.5 w-3.5" /> {failed.length} to follow up
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onPrev ?? undefined} disabled={!onPrev} title="Previous (↑ or K)" aria-label="Previous record" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-paper-2 hover:text-ink disabled:opacity-30">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" onClick={onNext ?? undefined} disabled={!onNext} title="Next (↓ or J)" aria-label="Next record" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-paper-2 hover:text-ink disabled:opacity-30">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} title="Close (Esc)" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-paper-2 hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 text-[0.8125rem]">
        {facts.length > 0 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-[0.6875rem] text-muted">{f.label}</dt>
                <dd className="truncate font-medium text-ink">{f.value || "—"}</dd>
              </div>
            ))}
          </dl>
        )}

        {failed.length > 0 && (
          <section>
            <h3 className="eyebrow mb-2">Needs follow-up</h3>
            <ul className="space-y-1.5">
              {failed.map((c) => (
                <li key={c.header} className="rounded-lg bg-flag-wash px-3 py-2 ring-1 ring-[#f6d4d6]">
                  <p className="font-medium text-ink">
                    {c.label} <span className="font-semibold text-flag">· {c.answer}</span>
                  </p>
                  {c.remark && <p className="mt-0.5 text-xs italic text-ink-soft">&ldquo;{c.remark}&rdquo;</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="eyebrow mb-2 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" /> History
          </h3>
          {loading ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for earlier assessments…
            </p>
          ) : history?.error ? (
            <p className="text-xs text-flag">{history.error}</p>
          ) : entries.length <= 1 ? (
            <p className="text-xs text-muted">First assessment of this person and vehicle.</p>
          ) : (
            <>
              {repeats.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {repeats.map((r) => (
                    <li key={r.header} className="flex items-start gap-2 rounded-lg bg-[#fffbeb] px-2.5 py-1.5 text-xs text-[#92400e] ring-1 ring-[#fde68a]">
                      <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong>{r.label}</strong> failed {r.streak} times in a row
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <ol className="flex flex-wrap items-center gap-1.5">
                {entries.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/p/${projectId}/${e.id}`}
                      title={`${new Date(e.at).toLocaleDateString("en-IN", { dateStyle: "medium" })}${e.same === "vehicle" ? " · same vehicle, different name" : ""}`}
                      className={cn("flex flex-col items-center rounded-lg px-2 py-1 text-[0.6875rem] ring-1 transition", e.id === row.id ? "bg-ink text-white ring-ink" : "bg-paper text-ink-soft ring-line hover:ring-line-strong")}
                    >
                      <span className="font-semibold tabular-nums">{e.scoreTotal ? `${pct(e.scoreOk ?? 0, e.scoreTotal)}%` : "—"}</span>
                      <span className={e.id === row.id ? "text-white/70" : "text-faint"}>{new Date(e.at).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>

        {checks.length > 0 && (
          <section>
            <h3 className="eyebrow mb-2">All checks</h3>
            {sections.map((s) => (
              <div key={s || "checks"} className="mb-2">
                {s && <p className="mb-1 text-[0.6875rem] font-semibold text-muted">{s}</p>}
                <ul className="divide-y divide-line-soft rounded-lg ring-1 ring-line">
                  {checks
                    .filter((c) => (c.section ?? "") === s)
                    .map((c) => (
                      <li key={c.header} className="flex items-start gap-2 px-2.5 py-1.5">
                        {c.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flag" />}
                        <span className="min-w-0 flex-1">
                          <span className={cn("block leading-snug", c.ok ? "text-ink-soft" : "font-medium text-ink")}>{c.label}</span>
                          {c.remark && (
                            <span className="mt-0.5 flex items-start gap-1 text-xs italic text-muted">
                              <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                              {c.remark}
                            </span>
                          )}
                        </span>
                        <span className={cn("shrink-0 text-xs font-semibold", c.ok ? "text-muted" : "text-flag")}>{c.answer}</span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {others.length > 0 && (
          <section>
            <h3 className="eyebrow mb-2">Other details</h3>
            <dl className="divide-y divide-line-soft rounded-lg ring-1 ring-line">
              {others.map(([h, v]) => (
                <div key={h} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 px-2.5 py-1.5">
                  <dt className="text-xs text-muted">{h}</dt>
                  <dd className="break-words text-right text-xs font-medium text-ink">{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        <span className="hidden text-[0.6875rem] text-faint sm:block">
          <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> move · <kbd className="kbd">Enter</kbd> open · <kbd className="kbd">Esc</kbd> close
        </span>
        <Link href={`/p/${projectId}/${row.id}`} onClick={() => startNav()} className="btn btn-primary btn-sm">
          Open full record <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </footer>
    </aside>
  );
}
