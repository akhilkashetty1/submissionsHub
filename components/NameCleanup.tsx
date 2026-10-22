"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, CheckCircle2, Loader2, Merge, Sparkles, Undo2 } from "lucide-react";
import { mergeNamesAction, unmergeNameAction } from "@/app/analysis-actions";
import type { AliasField } from "@/lib/insights";
import { cn } from "@/lib/utils";

/**
 * Name clean-up for HQ, Team and Line Manager. "Hyd", "hyderabad" and "Hyderabad" become one name
 * everywhere the hub groups or filters (insights, heatmap, group summaries, column menus). Nothing in
 * the records changes, and each merge can be undone. Suggestions come from spelling (same letters,
 * short forms, small typos); anything else can be merged by ticking the names. Managers only.
 */
export default function NameCleanup({ projectId, fields, canManage }: { projectId: string; fields: AliasField[]; canManage: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState(fields[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [into, setInto] = useState("");
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const field = fields.find((f) => f.id === tab) ?? fields[0];
  if (!field) return null;

  const say = (text: string, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), bad ? 5000 : 2600);
  };
  const merge = (names: string[], target: string) =>
    start(async () => {
      const res = await mergeNamesAction(projectId, field.id, names, target);
      if (!res.ok) return say(res.error, true);
      say(`Merged into “${target}”`);
      setPicked(new Set());
      setInto("");
      router.refresh();
    });
  const unmerge = (name: string) =>
    start(async () => {
      const res = await unmergeNameAction(projectId, field.id, name);
      if (!res.ok) return say(res.error, true);
      say(`“${name}” is its own name again`);
      router.refresh();
    });

  const shownAs = (v: { value: string; canonical: string | null }) => v.canonical ?? v.value;
  const finalNames = [...new Set(field.values.map(shownAs))];
  const togglePick = (v: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (!n.delete(v)) n.add(v);
      if (!into && n.size) setInto([...n][0]);
      return n;
    });

  return (
    <section className="card overflow-hidden" aria-labelledby="names-h">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 id="names-h" className="flex items-center gap-2 section-title">
            <Sparkles className="h-4 w-4 text-muted" /> Names
          </h2>
          <p className="mt-0.5 text-xs text-muted">Different spellings of the same {field.label} are shown and counted as one.</p>
        </div>
        <div className="flex rounded-lg bg-paper-2 p-0.5 ring-1 ring-line">
          {fields.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => (setTab(f.id), setPicked(new Set()), setInto(""))}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium", f.id === field.id ? "bg-paper text-ink shadow-xs" : "text-muted hover:text-ink")}
            >
              {f.label}
              {f.suggestions.length > 0 && <span className="ml-1.5 rounded-full bg-brand px-1.5 text-[0.625rem] font-semibold text-night">{f.suggestions.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {field.suggestions.length > 0 && (
        <div className="space-y-2 border-b border-line-soft bg-[#fcfcf4] px-5 py-4">
          <p className="text-xs font-medium text-ink-soft">These look like the same {field.label}:</p>
          {field.suggestions.map((g) => (
            <Suggestion key={g.map((v) => v.value).join("|")} group={g} canManage={canManage} pending={pending} onMerge={(target) => merge(g.map((v) => v.value), target)} />
          ))}
        </div>
      )}

      <div className="px-5 py-4">
        {canManage && picked.size > 0 && (
          <div className="pop-in mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-night px-3 py-2 text-[0.8125rem] text-white">
            <span>
              Merge <strong>{picked.size}</strong> name{picked.size === 1 ? "" : "s"} into
            </span>
            <input value={into} onChange={(e) => setInto(e.target.value)} list="merge-into" className="h-8 w-56 rounded-md border border-white/15 bg-white/10 px-2.5 text-[0.8125rem] text-white outline-none focus:border-white/40" />
            <datalist id="merge-into">
              {finalNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button type="button" disabled={pending || !into.trim()} onClick={() => merge([...picked], into.trim())} className="btn btn-brand btn-sm">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />} Merge
            </button>
            <button type="button" onClick={() => setPicked(new Set())} className="text-xs text-[#9aa1ad] hover:text-white">
              Cancel
            </button>
          </div>
        )}
        <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          {field.values.map((v) => (
            <li key={v.value} className="flex items-center gap-2 border-b border-line-soft py-1.5 text-[0.8125rem]">
              {canManage && <input type="checkbox" checked={picked.has(v.value)} onChange={() => togglePick(v.value)} aria-label={`Select ${v.value}`} className="h-3.5 w-3.5" />}
              <span className={cn("min-w-0 truncate", v.canonical ? "text-muted" : "text-ink")}>{v.value}</span>
              {v.canonical && (
                <span className="flex min-w-0 items-center gap-1 text-xs text-ink-soft">
                  <ArrowRight className="h-3 w-3 shrink-0 text-faint" />
                  <span className="truncate font-medium">{v.canonical}</span>
                </span>
              )}
              <span className="ml-auto shrink-0 text-xs tabular-nums text-faint">{v.count}</span>
              {canManage && v.canonical && (
                <button type="button" onClick={() => unmerge(v.value)} disabled={pending} title="Undo: count it separately again" aria-label={`Undo merge of ${v.value}`} className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-paper-2 hover:text-ink">
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {!canManage && <p className="mt-3 text-xs text-muted">A Manager of this portal can merge names.</p>}
      </div>

      {toast && (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-4 z-[60] -translate-x-1/2">
          <div className={cn("pop-in flex items-center gap-2 rounded-xl px-4 py-2 text-[0.8125rem] font-medium text-white shadow-pop", toast.bad ? "bg-flag" : "bg-night/95")}>
            {!toast.bad && <CheckCircle2 className="h-4 w-4 text-[#7ee2a8]" />}
            {toast.text}
          </div>
        </div>
      )}
    </section>
  );
}

function Suggestion({ group, canManage, pending, onMerge }: { group: { value: string; count: number }[]; canManage: boolean; pending: boolean; onMerge: (target: string) => void }) {
  const [target, setTarget] = useState(group[0].value);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-paper px-3 py-2 ring-1 ring-line">
      {group.map((v) => (
        <span key={v.value} className="chip">
          {v.value} <span className="tabular-nums text-faint">{v.count}</span>
        </span>
      ))}
      {canManage && (
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          show as
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="field h-8 w-auto text-xs">
            {group.map((v) => (
              <option key={v.value}>{v.value}</option>
            ))}
          </select>
          <button type="button" disabled={pending} onClick={() => onMerge(target)} className="btn btn-primary btn-sm">
            <Merge className="h-3.5 w-3.5" /> Merge
          </button>
        </span>
      )}
    </div>
  );
}
