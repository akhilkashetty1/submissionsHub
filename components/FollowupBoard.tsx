"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleDot, ExternalLink, Search, Timer, UserRound, X } from "lucide-react";
import { setFollowupAction } from "@/app/analysis-actions";
import { cn } from "@/lib/utils";

type Status = "open" | "in_progress" | "fixed";
export type BoardItem = {
  submissionId: string;
  header: string;
  label: string;
  section: string | null;
  remark: string;
  person: string;
  group: string;
  at: string;
  atMs: number;
  status: Status;
  owner: string;
  note: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

const COLUMNS: { id: Status; label: string; icon: typeof CircleDot; tone: string; empty: string }[] = [
  { id: "open", label: "Open", icon: CircleDot, tone: "text-flag", empty: "Nothing waiting. Every failed check has been picked up." },
  { id: "in_progress", label: "In progress", icon: Timer, tone: "text-[#b45309]", empty: "Drag a card here when someone starts on it." },
  { id: "fixed", label: "Fixed", icon: CheckCircle2, tone: "text-ok", empty: "Fixed items land here." },
];
const keyOf = (i: Pick<BoardItem, "submissionId" | "header">) => `${i.submissionId}|${i.header}`;
const FIXED_SHOWN = 30;

/**
 * The follow-up board: every failed check as a card, Open → In progress → Fixed. Drag a card to move it
 * (or use the arrows / the editor), assign it to someone and note what was done. Saves instantly; the
 * person and record are one click away. Viewers see the board but can't move cards.
 */
export default function FollowupBoard({
  projectId,
  canWrite,
  me,
  owners,
  days,
  periods,
  items: initial,
}: {
  projectId: string;
  canWrite: boolean;
  me: string;
  owners: string[];
  days: number;
  periods: number[];
  items: BoardItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [owner, setOwner] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [showAllFixed, setShowAllFixed] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [, start] = useTransition();

  const groups = useMemo(() => [...new Set(items.map((i) => i.group))].sort(), [items]);
  const ownerNames = useMemo(() => [...new Set(items.map((i) => i.owner).filter(Boolean))].sort(), [items]);
  const needle = q.trim().toLowerCase();
  const visible = items.filter(
    (i) =>
      (!group || i.group === group) &&
      (!owner || (owner === "__none__" ? !i.owner : i.owner === owner)) &&
      (!needle || `${i.label} ${i.person} ${i.remark} ${i.note} ${i.owner}`.toLowerCase().includes(needle)),
  );

  const say = (text: string, bad = false) => {
    setToast({ text, bad });
    setTimeout(() => setToast(null), bad ? 5000 : 2200);
  };

  const save = (item: BoardItem, patch: Partial<Pick<BoardItem, "status" | "owner" | "note">>) => {
    if (!canWrite) return;
    const before = items;
    setItems((list) => list.map((i) => (keyOf(i) === keyOf(item) ? { ...i, ...patch, updatedBy: me, updatedAt: "just now" } : i)));
    start(async () => {
      const res = await setFollowupAction(projectId, item.submissionId, item.header, patch);
      if (!res.ok) {
        setItems(before);
        say(res.error, true);
        return;
      }
      if (patch.status) say(patch.status === "fixed" ? "Marked fixed" : patch.status === "in_progress" ? "Moved to In progress" : "Moved back to Open");
      router.refresh();
    });
  };

  const move = (item: BoardItem, dir: -1 | 1) => {
    const i = COLUMNS.findIndex((c) => c.id === item.status) + dir;
    if (COLUMNS[i]) save(item, { status: COLUMNS[i].id });
  };

  const total = (s: Status) => visible.filter((i) => i.status === s).length;

  return (
    <>
      <div className="card flex flex-wrap items-end gap-3 p-3.5">
        <label className="min-w-[14rem] flex-1">
          <span className="label">Search</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Check, person, remark, note…" className="field pl-9" />
          </span>
        </label>
        <label>
          <span className="label">HQ</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="field w-auto">
            <option value="">All</option>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Who&rsquo;s on it</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="field w-auto">
            <option value="">Anyone</option>
            <option value="__none__">Not assigned</option>
            {[...new Set([me, ...ownerNames])].map((o) => (
              <option key={o} value={o}>
                {o === me ? `${o} (me)` : o}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="label">Failed in the last</span>
          <div className="flex rounded-lg bg-paper-2 p-0.5 ring-1 ring-line">
            {periods.map((d) => (
              <Link key={d} href={`/p/${projectId}/followups?days=${d}`} className={cn("rounded-md px-2.5 py-1.5 text-xs font-medium", d === days ? "bg-paper text-ink shadow-xs" : "text-muted hover:text-ink")}>
                {d === 365 ? "year" : `${d} days`}
              </Link>
            ))}
          </div>
        </div>
        {(q || group || owner) && (
          <button type="button" onClick={() => (setQ(""), setGroup(""), setOwner(""))} className="btn btn-ghost">
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {COLUMNS.map((col, ci) => {
          const Icon = col.icon;
          let cards = visible.filter((i) => i.status === col.id);
          if (col.id === "fixed") cards = cards.sort((a, b) => (b.updatedAt === "just now" ? 1 : 0) - (a.updatedAt === "just now" ? 1 : 0));
          const shown = col.id === "fixed" && !showAllFixed ? cards.slice(0, FIXED_SHOWN) : cards;
          return (
            <section
              key={col.id}
              aria-label={col.label}
              onDragOver={(e) => {
                if (!canWrite || !dragging) return;
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const item = items.find((i) => keyOf(i) === dragging);
                setDragging(null);
                if (item && item.status !== col.id) save(item, { status: col.id });
              }}
              className={cn("rounded-xl bg-canvas p-2 ring-1 ring-line transition", over === col.id && "bg-[#fafbe3] ring-2 ring-ink/20")}
            >
              <h2 className="flex items-center gap-2 px-1.5 pb-2 pt-1 text-[0.8125rem] font-semibold">
                <Icon className={cn("h-4 w-4", col.tone)} />
                {col.label}
                <span className="rounded-full bg-paper px-2 py-0.5 text-xs tabular-nums text-ink-soft ring-1 ring-line">{total(col.id)}</span>
              </h2>
              <ul className="space-y-2">
                {shown.map((i) => (
                  <Card
                    key={keyOf(i)}
                    item={i}
                    projectId={projectId}
                    canWrite={canWrite}
                    owners={owners}
                    me={me}
                    editing={editing === keyOf(i)}
                    onEdit={() => setEditing(editing === keyOf(i) ? null : keyOf(i))}
                    onSave={(patch) => {
                      save(i, patch);
                      setEditing(null);
                    }}
                    onMove={(d) => move(i, d)}
                    canLeft={ci > 0}
                    canRight={ci < COLUMNS.length - 1}
                    onDragStart={() => setDragging(keyOf(i))}
                    onDragEnd={() => (setDragging(null), setOver(null))}
                    dragging={dragging === keyOf(i)}
                  />
                ))}
              </ul>
              {!cards.length && <p className="px-2 py-6 text-center text-xs text-muted">{col.empty}</p>}
              {col.id === "fixed" && cards.length > FIXED_SHOWN && (
                <button type="button" onClick={() => setShowAllFixed((s) => !s)} className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-muted hover:bg-paper hover:text-ink">
                  {showAllFixed ? "Show the latest only" : `Show all ${cards.length}`}
                </button>
              )}
            </section>
          );
        })}
      </div>

      {toast && (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-4 z-[60] -translate-x-1/2">
          <div className={cn("pop-in flex items-center gap-2 rounded-xl px-4 py-2 text-[0.8125rem] font-medium text-white shadow-pop", toast.bad ? "bg-flag" : "bg-night/95")}>
            {!toast.bad && <CheckCircle2 className="h-4 w-4 text-[#7ee2a8]" />}
            {toast.text}
          </div>
        </div>
      )}
    </>
  );
}

function Card({
  item,
  projectId,
  canWrite,
  owners,
  me,
  editing,
  onEdit,
  onSave,
  onMove,
  canLeft,
  canRight,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  item: BoardItem;
  projectId: string;
  canWrite: boolean;
  owners: string[];
  me: string;
  editing: boolean;
  onEdit: () => void;
  onSave: (patch: Partial<Pick<BoardItem, "status" | "owner" | "note">>) => void;
  onMove: (dir: -1 | 1) => void;
  canLeft: boolean;
  canRight: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const [owner, setOwner] = useState(item.owner);
  const [note, setNote] = useState(item.note);
  const listId = `owners-${item.submissionId}-${item.header.length}`;
  return (
    <li
      draggable={canWrite && !editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn("group rounded-lg bg-paper p-3 shadow-xs ring-1 ring-line transition", canWrite && !editing && "cursor-grab active:cursor-grabbing", dragging && "opacity-40", editing && "ring-2 ring-ink/20")}
    >
      <button type="button" onClick={onEdit} className="block w-full text-left" aria-expanded={editing}>
        <p className="text-[0.8125rem] font-medium leading-snug text-ink">
          {item.section && <span className="mr-1 text-[0.6875rem] font-medium text-faint">{item.section}</span>}
          {item.label}
        </p>
        <p className="mt-1 text-xs text-muted">
          <span className="font-medium text-ink-soft">{item.person}</span> · {item.group} · {item.at.split(",")[0]}
        </p>
        {item.remark && <p className="mt-1.5 rounded-md bg-paper-2 px-2 py-1 text-xs italic text-ink-soft">&ldquo;{item.remark}&rdquo;</p>}
        {item.note && !editing && <p className="mt-1.5 text-xs text-ink-soft">✎ {item.note}</p>}
      </button>
      <div className="mt-2 flex items-center justify-between gap-2">
        {item.owner ? (
          <span className="chip gap-1">
            <UserRound className="h-3 w-3" />
            {item.owner}
          </span>
        ) : (
          <span className="text-[0.6875rem] text-faint">Not assigned</span>
        )}
        <span className="flex items-center gap-0.5">
          <Link href={`/p/${projectId}/${item.submissionId}`} title="Open the record" className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-paper-2 hover:text-ink">
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          {canWrite && (
            <>
              <button type="button" disabled={!canLeft} onClick={() => onMove(-1)} title="Move back" aria-label="Move back" className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-paper-2 hover:text-ink disabled:opacity-25">
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <button type="button" disabled={!canRight} onClick={() => onMove(1)} title="Move forward" aria-label="Move forward" className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-paper-2 hover:text-ink disabled:opacity-25">
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </span>
      </div>
      {item.updatedBy && <p className="mt-1.5 text-[0.625rem] text-faint">Updated by {item.updatedBy} · {item.updatedAt}</p>}

      {editing && canWrite && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ owner, note });
          }}
          className="mt-3 space-y-2 border-t border-line-soft pt-3"
        >
          <label className="block">
            <span className="label">Who&rsquo;s on it</span>
            <span className="flex gap-1.5">
              <input value={owner} onChange={(e) => setOwner(e.target.value)} list={listId} placeholder="Name" maxLength={80} className="field h-8 text-xs" />
              <button type="button" onClick={() => setOwner(me)} className="btn btn-secondary btn-sm shrink-0">
                Me
              </button>
            </span>
            <datalist id={listId}>
              {owners.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="label">What was done</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Rider replaced the mirror on 12 Oct" className="field h-auto resize-none py-2 text-xs" />
          </label>
          <div className="flex flex-wrap justify-end gap-1.5">
            <button type="button" onClick={onEdit} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            {item.status !== "fixed" && (
              <button type="button" onClick={() => onSave({ owner, note, status: "fixed" })} className="btn btn-secondary btn-sm">
                <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> Save &amp; mark fixed
              </button>
            )}
            <button className="btn btn-primary btn-sm">
              Save
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
