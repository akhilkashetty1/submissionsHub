"use client";
/* eslint-disable @next/next/no-img-element -- photos come from the site or Blob storage; the hub shows them as they are */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Images,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Rocket,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import { discardSlotDraftAction, publishSiteAction, saveSlotDraftAction } from "@/app/site-actions";
import { PhotoDialog, LibraryDialog, type LibraryItem } from "@/components/SitePhotoDialogs";
import { altFromName, prepareImage } from "@/lib/image-prep";
import { GALLERY_STYLE_INFO, type GalleryLayout, type GalleryStyle, type SlotItem, type SlotSpec, type SlotState } from "@/lib/sites";
import { cn } from "@/lib/utils";

export type { LibraryItem };

export type SlotView = {
  spec: SlotSpec;
  working: SlotState;
  live: SlotState;
  hasDraft: boolean;
  customised: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  problems: string[];
};

type Save = "saving" | "saved" | "error";
type Pending = { id: string; name: string; preview: string; replace?: number };

/** The same checks the server makes before publishing, so problems show while editing. */
function problemsFor(spec: SlotSpec, state: SlotState) {
  const out: string[] = [];
  const n = state.items.length;
  if (n < spec.min || n > spec.max) out.push(spec.min === spec.max ? `Needs exactly ${spec.min} photo${spec.min === 1 ? "" : "s"} (has ${n})` : `Needs ${spec.min}–${spec.max} photos (has ${n})`);
  const noAlt = state.items.filter((i) => !i.alt.trim()).length;
  if (noAlt) out.push(`${noAlt} photo${noAlt === 1 ? " needs" : "s need"} a description`);
  return out;
}

const sizeRule = (s: SlotSpec) => (s.kind === "gallery" ? "Any number of photos" : s.min === s.max ? `Exactly ${s.min} photo${s.min === 1 ? "" : "s"}` : `${s.min}–${s.max} photos`);
const mb = (b: number) => (b < 1_048_576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1_048_576).toFixed(b < 10_485_760 ? 1 : 0)} MB`);

/**
 * The website photo editor. Every spot on the site that shows photos is a card: upload (button
 * or drag files in), drag to reorder, click a photo to describe it, label it and set its focus
 * point, choose a gallery's layout. Changes autosave as a draft; nothing changes on the site
 * until a Manager presses Publish, which updates every changed spot at once.
 */
export default function SiteEditor({
  site,
  slots,
  library,
  usage,
  reachable,
  lastSeen,
  configured,
  storage,
  canWrite,
  canManage,
}: {
  site: { id: string; name: string; url: string };
  slots: SlotView[];
  library: LibraryItem[];
  usage: { photos: number; bytes: number };
  reachable: boolean;
  lastSeen: string | null;
  configured: boolean;
  storage: "blob" | "local" | "missing";
  canWrite: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const fromProps = () => Object.fromEntries(slots.map((s) => [s.spec.key, s.working]));
  const [state, setState] = useState<Record<string, SlotState>>(fromProps);
  const stateRef = useRef(state);
  const [drafts, setDrafts] = useState<Record<string, boolean>>(() => Object.fromEntries(slots.map((s) => [s.spec.key, s.hasDraft])));
  const [saves, setSaves] = useState<Record<string, Save>>({});
  const [pending, setPending] = useState<Record<string, Pending[]>>({});
  const [lib, setLib] = useState(library);
  const [editing, setEditing] = useState<{ slot: string; index: number } | null>(null);
  const [picking, setPicking] = useState<{ slot: string; replace?: number } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" | "error" } | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Fresh data from the server (after publishing or discarding) replaces local state.
  const [seen, setSeen] = useState(slots);
  if (seen !== slots) {
    setSeen(slots);
    const next = fromProps();
    setState(next);
    setDrafts(Object.fromEntries(slots.map((s) => [s.spec.key, s.hasDraft])));
    setLib(library);
  }
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const say = (text: string, tone: "ok" | "warn" | "error" = "ok") => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "ok" ? 3000 : 6000);
  };

  const spec = (key: string) => slots.find((s) => s.spec.key === key)!.spec;

  /** Change a slot and autosave it (debounced). */
  const update = (key: string, fn: (s: SlotState) => SlotState) => {
    const next = fn(stateRef.current[key]);
    stateRef.current = { ...stateRef.current, [key]: next };
    setState(stateRef.current);
    setSaves((s) => ({ ...s, [key]: "saving" }));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      const res = await saveSlotDraftAction(site.id, key, next);
      if (stateRef.current[key] !== next) return; // a newer change is on its way
      if (res.ok) {
        setDrafts((d) => ({ ...d, [key]: res.hasDraft }));
        setSaves((s) => ({ ...s, [key]: "saved" }));
      } else {
        setSaves((s) => ({ ...s, [key]: "error" }));
        say(res.error, "error");
      }
    }, 550);
  };

  const upload = async (key: string, files: File[], replace?: number) => {
    const s = spec(key);
    const images = files.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!images.length) return say("Those weren't photos.", "error");
    const room = replace !== undefined ? 1 : s.max - stateRef.current[key].items.length;
    if (room <= 0) return say(`${s.title} already has its ${s.max} photos. Replace one instead.`, "warn");
    const batch = images.slice(0, room);
    if (batch.length < images.length) say(`Only ${room} more fit in ${s.title}; the rest were skipped.`, "warn");

    const jobs: Pending[] = batch.map((f) => ({ id: crypto.randomUUID(), name: f.name, preview: URL.createObjectURL(f), replace }));
    setPending((p) => ({ ...p, [key]: [...(p[key] ?? []), ...jobs] }));
    let added = 0;
    for (const [i, file] of batch.entries()) {
      const job = jobs[i];
      try {
        const body = new FormData();
        body.append("file", await prepareImage(file), file.name);
        const res = await fetch(`/api/site/${site.id}/upload`, { method: "POST", body });
        const json = await res.json().catch(() => ({ ok: false, error: "Upload failed. Try again." }));
        if (!json.ok) throw new Error(json.error);
        const m = json.media as { id: string; url: string; w: number; h: number; name: string; bytes: number };
        setLib((l) => [{ id: m.id, url: m.url, w: m.w, h: m.h, name: m.name, bytes: m.bytes, used: true, uploadedBy: "You", uploadedAt: "just now" }, ...l]);
        const item: SlotItem = { src: m.url, alt: altFromName(file.name), w: m.w, h: m.h, media: m.id };
        update(key, (cur) => {
          if (replace !== undefined && cur.items[replace]) {
            const items = [...cur.items];
            items[replace] = { ...item, label: cur.items[replace].label };
            return { ...cur, items };
          }
          return cur.items.length < s.max ? { ...cur, items: [...cur.items, item] } : cur;
        });
        added++;
      } catch (err) {
        say(`${file.name}: ${(err as Error).message}`, "error");
      } finally {
        URL.revokeObjectURL(job.preview);
        setPending((p) => ({ ...p, [key]: (p[key] ?? []).filter((x) => x.id !== job.id) }));
      }
    }
    if (added) say(replace !== undefined ? "Photo replaced. Publish to put it on the site." : `${added} photo${added === 1 ? "" : "s"} added. Publish to put ${added === 1 ? "it" : "them"} on the site.`);
  };

  const discard = async (key: string) => {
    clearTimeout(timers.current[key]);
    const res = await discardSlotDraftAction(site.id, key);
    if (!res.ok) return say(res.error, "error");
    const live = slots.find((s) => s.spec.key === key)!.live;
    stateRef.current = { ...stateRef.current, [key]: live };
    setState(stateRef.current);
    setDrafts((d) => ({ ...d, [key]: false }));
    setSaves((s) => ({ ...s, [key]: "saved" }));
    say("Draft discarded. Back to what's live.");
  };

  const changed = slots.filter((s) => drafts[s.spec.key]);
  const blocked = changed.filter((s) => problemsFor(s.spec, state[s.spec.key]).length);
  const busy = Object.values(saves).includes("saving") || Object.values(pending).some((p) => p.length);

  const publish = async () => {
    setPublishing(true);
    const res = await publishSiteAction(site.id);
    setPublishing(false);
    if (!res.ok) return say(res.error, "error");
    say(
      res.refreshed
        ? `Published ${res.slots} spot${res.slots === 1 ? "" : "s"}. The site shows them within a few seconds.`
        : `Published. The site couldn't be reached to refresh now, so it will pick this up within the hour.`,
      res.refreshed ? "ok" : "warn",
    );
    router.refresh();
  };

  // Group the spots by the page they're on, in the site's order.
  const pages: { name: string; path: string; slots: SlotView[] }[] = [];
  for (const s of slots) {
    const p = s.spec.pages[0] ?? { name: "Other", path: "/" };
    const group = pages.find((g) => g.name === p.name) ?? pages[pages.push({ ...p, slots: [] }) - 1];
    group.slots.push(s);
  }

  const editingSlot = editing ? slots.find((s) => s.spec.key === editing.slot) : undefined;
  const editingItem = editing ? state[editing.slot]?.items[editing.index] : undefined;

  return (
    <div className="mx-auto max-w-[80rem] space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2.5">
            <Images className="h-5 w-5 text-ink-soft" /> {site.name}
          </h1>
          <p className="page-sub">
            The photos on {site.url ? <a href={site.url} target="_blank" rel="noreferrer" className="font-medium text-ink underline-offset-2 hover:underline">{site.url.replace(/^https?:\/\//, "")}</a> : "the site"}. Edits save as a draft; Publish puts them live.
            {usage.photos > 0 && ` · ${usage.photos} uploaded photo${usage.photos === 1 ? "" : "s"}, ${mb(usage.bytes)}`}
          </p>
        </div>
        {canWrite && (
          <button type="button" onClick={() => setPicking({ slot: "" })} className="btn btn-secondary">
            <Images className="h-4 w-4" /> Photo library
          </button>
        )}
      </header>

      {!configured && (
        <Banner tone="warn" icon={<CloudOff className="h-4 w-4" />}>
          The website&rsquo;s address isn&rsquo;t set. Add <code className="font-mono">SITE_URL_ROADSHIELD</code> (and <code className="font-mono">SITE_SECRET_ROADSHIELD</code>) to the hub&rsquo;s environment variables, then redeploy.
        </Banner>
      )}
      {configured && !reachable && (
        <Banner tone="warn" icon={<CloudOff className="h-4 w-4" />}>
          Couldn&rsquo;t reach the website just now{lastSeen ? `; showing its photo spots as of ${lastSeen}` : ""}. Saving and publishing will work again once it&rsquo;s back.
        </Banner>
      )}
      {storage === "missing" && canWrite && (
        <Banner tone="warn" icon={<AlertTriangle className="h-4 w-4" />}>
          Photo storage isn&rsquo;t connected, so uploads won&rsquo;t work yet. In Vercel: hub project → Storage → Create → Blob (public) → connect, then redeploy. Rearranging existing photos works meanwhile.
        </Banner>
      )}

      {/* Publish bar: always in view while scrolling through the spots */}
      <div className="sticky top-2 z-20">
        <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-card backdrop-blur", changed.length ? "border-[#f0d58a] bg-[#fff9e6]/95" : "border-line bg-paper/95")}>
          <p className="flex items-center gap-2 text-[0.8125rem]">
            {changed.length ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[#e0a100]" />
                <strong className="font-semibold">{changed.length} spot{changed.length === 1 ? "" : "s"} changed</strong>
                <span className="text-muted">· not on the site until published</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-ok" />
                <span className="text-ink-soft">Everything here is live on the site.</span>
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            {pages.map((p) => (
              <a key={p.name} href={`#page-${p.path}`} className="hidden rounded-full px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-black/5 xl:inline">
                {p.name}
              </a>
            ))}
            {changed.length > 0 &&
              (canManage ? (
                <button type="button" onClick={publish} disabled={publishing || busy || blocked.length > 0} title={blocked.length ? "Fix the spots marked in amber first" : undefined} className="btn btn-primary">
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publish {changed.length} change{changed.length === 1 ? "" : "s"}
                </button>
              ) : (
                <span className="text-xs text-muted">A Manager of this website publishes.</span>
              ))}
          </div>
        </div>
        {changed.length > 0 && blocked.length > 0 && (
          <p className="mt-1.5 px-1 text-xs font-medium text-[#9a6b00]">Before publishing: {blocked.map((b) => b.spec.title).join(", ")}.</p>
        )}
      </div>

      {pages.map((page) => (
        <section key={page.name} id={`page-${page.path}`} className="scroll-mt-24 space-y-4">
          <h2 className="flex items-center gap-2 pt-2 text-[0.9375rem] font-semibold">
            {page.name}
            {site.url && (
              <a href={`${site.url}${page.path}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-normal text-muted hover:text-ink">
                {page.path} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </h2>
          {page.slots.map((v) => (
            <SlotCard
              key={v.spec.key}
              view={v}
              state={state[v.spec.key]}
              hasDraft={drafts[v.spec.key]}
              save={saves[v.spec.key]}
              pending={pending[v.spec.key] ?? []}
              siteUrl={site.url}
              canWrite={canWrite}
              onChange={(fn) => update(v.spec.key, fn)}
              onUpload={(files, replace) => upload(v.spec.key, files, replace)}
              onEdit={(index) => setEditing({ slot: v.spec.key, index })}
              onPick={(replace) => setPicking({ slot: v.spec.key, replace })}
              onDiscard={() => discard(v.spec.key)}
            />
          ))}
        </section>
      ))}

      {editing && editingSlot && editingItem && (
        <PhotoDialog
          spec={editingSlot.spec}
          index={editing.index}
          item={editingItem}
          siteUrl={site.url}
          canWrite={canWrite}
          onChange={(patch) => update(editing.slot, (cur) => ({ ...cur, items: cur.items.map((it, i) => (i === editing.index ? { ...it, ...patch } : it)) }))}
          onRemove={() => {
            update(editing.slot, (cur) => ({ ...cur, items: cur.items.filter((_, i) => i !== editing.index) }));
            setEditing(null);
          }}
          onReplaceUpload={(file) => {
            const slot = editing.slot;
            const index = editing.index;
            setEditing(null);
            upload(slot, [file], index);
          }}
          onReplacePick={() => {
            setPicking({ slot: editing.slot, replace: editing.index });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {picking && (
        <LibraryDialog
          siteId={site.id}
          siteUrl={site.url}
          library={lib}
          builtIn={slots.flatMap((s) => s.spec.defaults)}
          target={picking.slot ? { spec: spec(picking.slot), replace: picking.replace, room: spec(picking.slot).max - (state[picking.slot]?.items.length ?? 0) } : null}
          canWrite={canWrite}
          onDeleted={(id) => setLib((l) => l.filter((x) => x.id !== id))}
          onPick={(items) => {
            const key = picking.slot;
            const replace = picking.replace;
            update(key, (cur) => {
              if (replace !== undefined) {
                const next = [...cur.items];
                next[replace] = { ...items[0], label: cur.items[replace]?.label };
                return { ...cur, items: next };
              }
              return { ...cur, items: [...cur.items, ...items].slice(0, spec(key).max) };
            });
            setPicking(null);
            say(replace !== undefined ? "Photo replaced. Publish to put it on the site." : `${items.length} photo${items.length === 1 ? "" : "s"} added. Publish to put ${items.length === 1 ? "it" : "them"} on the site.`);
          }}
          onClose={() => setPicking(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed bottom-5 left-1/2 z-[60] max-w-[min(92vw,34rem)] -translate-x-1/2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-2xl ring-1",
            toast.tone === "ok" && "bg-night text-white ring-night-line",
            toast.tone === "warn" && "bg-[#fff4d6] text-[#7a5500] ring-[#f0d58a]",
            toast.tone === "error" && "bg-flag text-white ring-flag",
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: "warn"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className={cn("flex items-start gap-2.5 rounded-xl px-4 py-3 text-[0.8125rem]", tone === "warn" && "bg-[#fff6dc] text-[#7a5500] ring-1 ring-[#f3dc9a]")}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

export const absolute = (src: string, siteUrl: string) => (src.startsWith("/") ? `${siteUrl}${src}` : src);

function SlotCard({
  view,
  state,
  hasDraft,
  save,
  pending,
  siteUrl,
  canWrite,
  onChange,
  onUpload,
  onEdit,
  onPick,
  onDiscard,
}: {
  view: SlotView;
  state: SlotState;
  hasDraft: boolean;
  save?: Save;
  pending: Pending[];
  siteUrl: string;
  canWrite: boolean;
  onChange: (fn: (s: SlotState) => SlotState) => void;
  onUpload: (files: File[], replace?: number) => void;
  onEdit: (index: number) => void;
  onPick: (replace?: number) => void;
  onDiscard: () => void;
}) {
  const { spec } = view;
  const input = useRef<HTMLInputElement>(null);
  const replaceAt = useRef<number | undefined>(undefined);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | "card" | null>(null);
  const [preview, setPreview] = useState(false);
  const fixed = spec.kind === "fixed";
  const room = spec.max - state.items.length - pending.filter((p) => p.replace === undefined).length;
  const problems = problemsFor(spec, state);
  const isOriginal = JSON.stringify(state.items.map((i) => i.src)) === JSON.stringify(spec.defaults.map((d) => d.src)) && !view.customised;
  const ratio = spec.ratio === "auto" ? "4/3" : spec.ratio;

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= state.items.length) return;
    onChange((cur) => {
      const items = [...cur.items];
      const [it] = items.splice(from, 1);
      items.splice(to, 0, it);
      return { ...cur, items };
    });
  };
  const pickFiles = (replace?: number) => {
    replaceAt.current = replace;
    input.current?.click();
  };
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  return (
    <article
      className={cn("card overflow-hidden transition", over === "card" && "ring-2 ring-brand")}
      onDragOver={(e) => {
        if (canWrite && hasFiles(e) && !fixed && room > 0) {
          e.preventDefault();
          if (over === null) setOver("card");
        }
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
      onDrop={(e) => {
        if (!hasFiles(e) || over !== "card") return;
        e.preventDefault();
        setOver(null);
        onUpload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold">
            {spec.title}
            <StatusPill hasDraft={hasDraft} view={view} />
          </h3>
          <p className="mt-1 text-[0.8125rem] text-muted">
            {spec.help} <span className="text-faint">· {sizeRule(spec)}</span>
            {spec.pages.length > 1 && <span className="text-faint"> · also on {spec.pages.slice(1).map((p) => p.name).join(", ")}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          {save === "saving" && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving draft…
            </span>
          )}
          {save === "saved" && hasDraft && <span>Draft saved</span>}
          {save === "error" && <span className="font-medium text-flag">Not saved</span>}
        </div>
      </div>

      {spec.kind === "gallery" && state.layout && (
        <LayoutPicker
          layout={state.layout}
          disabled={!canWrite}
          preview={preview}
          onPreview={() => setPreview((p) => !p)}
          onChange={(layout) => onChange((cur) => ({ ...cur, layout }))}
        />
      )}
      {preview && state.layout && <LayoutPreview layout={state.layout} items={state.items} siteUrl={siteUrl} />}

      <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
        {state.items.map((it, i) => {
          const replacing = pending.find((p) => p.replace === i);
          return (
            <figure
              key={`${i}-${it.src}`}
              draggable={canWrite && !replacing}
              onDragStart={(e) => {
                setDrag(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!canWrite) return;
                if (drag !== null || (fixed && hasFiles(e))) {
                  e.preventDefault();
                  e.stopPropagation();
                  setOver(i);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOver(null);
                if (drag !== null) move(drag, i);
                else if (hasFiles(e)) onUpload([...e.dataTransfer.files].slice(0, 1), i);
                setDrag(null);
              }}
              className={cn("group relative", drag === i && "opacity-40")}
            >
              <button
                type="button"
                onClick={() => onEdit(i)}
                aria-label={`Photo ${i + 1}: ${it.alt || "no description"}. ${canWrite ? "Edit" : "View"}`}
                className={cn(
                  "relative block w-full overflow-hidden rounded-xl bg-paper-2 ring-1 ring-line transition hover:ring-2 hover:ring-ink/30",
                  over === i && "ring-2 ring-brand",
                  canWrite && "cursor-grab active:cursor-grabbing",
                )}
                style={{ aspectRatio: ratio }}
              >
                <img
                  src={replacing ? replacing.preview : absolute(it.src, siteUrl)}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className={cn("h-full w-full", spec.ratio === "auto" ? "object-contain" : "object-cover", replacing && "opacity-50")}
                  style={{ objectPosition: it.position ?? "center" }}
                />
                {replacing && <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-ink" />}
                <span className="absolute left-1.5 top-1.5 grid h-5 min-w-5 place-items-center rounded-md bg-black/60 px-1 text-[0.625rem] font-semibold tabular-nums text-white">{i + 1}</span>
                {it.label && <span className="absolute bottom-1.5 left-1.5 max-w-[85%] truncate rounded-full bg-white/95 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-ink shadow">{it.label}</span>}
                {!it.alt.trim() && (
                  <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-[#ffe9a8] px-1.5 py-0.5 text-[0.625rem] font-semibold text-[#7a5500]">
                    <AlertTriangle className="h-3 w-3" /> Describe
                  </span>
                )}
              </button>
              {canWrite && (
                <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                  {it.alt.trim() && <IconBtn label="Edit" onClick={() => onEdit(i)} icon={<Pencil className="h-3.5 w-3.5" />} />}
                  {fixed ? (
                    <IconBtn label="Replace with a new photo" onClick={() => pickFiles(i)} icon={<RefreshCw className="h-3.5 w-3.5" />} />
                  ) : (
                    <IconBtn label="Remove from this spot" onClick={() => onChange((cur) => ({ ...cur, items: cur.items.filter((_, j) => j !== i) }))} icon={<Trash2 className="h-3.5 w-3.5" />} danger />
                  )}
                </div>
              )}
              <figcaption className="mt-1.5 flex items-center justify-between gap-1 text-[0.6875rem] text-muted">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  {canWrite && <GripVertical className="h-3 w-3 shrink-0 text-faint" />}
                  <span className="truncate">{spec.positions?.[i] ?? it.alt ?? ""}</span>
                </span>
                {canWrite && state.items.length > 1 && (
                  <span className="flex shrink-0">
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move earlier" className="rounded p-0.5 hover:bg-black/5 hover:text-ink disabled:opacity-30">
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(i, i + 1)} disabled={i === state.items.length - 1} aria-label="Move later" className="rounded p-0.5 hover:bg-black/5 hover:text-ink disabled:opacity-30">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </figcaption>
            </figure>
          );
        })}

        {pending
          .filter((p) => p.replace === undefined)
          .map((p) => (
            <div key={p.id} className="relative overflow-hidden rounded-xl bg-paper-2 ring-1 ring-line" style={{ aspectRatio: ratio }}>
              <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs font-medium text-ink">
                <Loader2 className="h-5 w-5 animate-spin" /> Uploading…
              </span>
            </div>
          ))}

        {canWrite && !fixed && room > 0 && (
          <div className="flex flex-col gap-1.5" style={{ aspectRatio: ratio }}>
            <button
              type="button"
              onClick={() => pickFiles()}
              className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-strong text-xs font-medium text-ink-soft transition hover:border-ink hover:bg-paper-2 hover:text-ink"
            >
              <ImagePlus className="h-5 w-5" />
              Add photos
              <span className="font-normal text-faint">or drop them here</span>
            </button>
            <button type="button" onClick={() => onPick()} className="rounded-lg py-1 text-[0.6875rem] font-medium text-muted hover:bg-paper-2 hover:text-ink">
              From library
            </button>
          </div>
        )}
        {state.items.length === 0 && !canWrite && <p className="col-span-full py-6 text-center text-sm text-muted">No photos here yet.</p>}
      </div>

      {(problems.length > 0 || (canWrite && (hasDraft || !isOriginal))) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft bg-[#fafafa] px-5 py-3">
          <p className="text-xs font-medium text-[#9a6b00]">
            {problems.length > 0 && (
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> {problems.join(" · ")}
              </span>
            )}
          </p>
          {canWrite && (
            <div className="flex gap-2">
              {!isOriginal && (
                <button
                  type="button"
                  onClick={() => onChange((cur) => ({ ...cur, items: spec.defaults.map((d) => ({ ...d })) }))}
                  className="btn btn-ghost btn-sm"
                  title="Use the photos the site was built with"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Site&rsquo;s originals
                </button>
              )}
              {hasDraft && (
                <button type="button" onClick={onDiscard} className="btn btn-secondary btn-sm">
                  <Undo2 className="h-3.5 w-3.5" /> Discard draft
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) onUpload(replaceAt.current === undefined ? files : files.slice(0, 1), replaceAt.current);
        }}
      />
    </article>
  );
}

function StatusPill({ hasDraft, view }: { hasDraft: boolean; view: SlotView }) {
  if (hasDraft) return <span className="rounded-full bg-[#fff1c2] px-2 py-0.5 text-[0.6875rem] font-medium text-[#7a5500]">Draft · not live yet</span>;
  if (view.customised)
    return (
      <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[0.6875rem] font-medium text-ok" title={view.publishedBy ? `Published by ${view.publishedBy}` : undefined}>
        Live · published {view.publishedAt}
      </span>
    );
  return <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[0.6875rem] font-medium text-muted ring-1 ring-line">Live · site&rsquo;s original photos</span>;
}

function IconBtn({ label, onClick, icon, danger }: { label: string; onClick: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className={cn("grid h-7 w-7 place-items-center rounded-lg bg-white/95 text-ink shadow ring-1 ring-black/10 transition hover:scale-105", danger && "hover:bg-flag hover:text-white")}
    >
      {icon}
    </button>
  );
}

const STYLES: GalleryStyle[] = ["masonry", "grid", "featured", "carousel"];

/** A tiny drawing of each layout, so the choice is visual. */
function StyleIcon({ style }: { style: GalleryStyle }) {
  const r = (x: number, y: number, w: number, h: number, k: number) => <rect key={k} x={x} y={y} width={w} height={h} rx={1.5} />;
  const shapes = {
    masonry: [r(1, 1, 9, 12, 0), r(1, 15, 9, 8, 1), r(12, 1, 9, 7, 2), r(12, 10, 9, 13, 3), r(23, 1, 9, 10, 4), r(23, 13, 9, 10, 5)],
    grid: [r(1, 1, 9, 10, 0), r(12, 1, 9, 10, 1), r(23, 1, 9, 10, 2), r(1, 13, 9, 10, 3), r(12, 13, 9, 10, 4), r(23, 13, 9, 10, 5)],
    featured: [r(1, 1, 20, 22, 0), r(23, 1, 9, 10, 1), r(23, 13, 9, 10, 2)],
    carousel: [r(1, 4, 12, 16, 0), r(15, 4, 12, 16, 1), r(29, 4, 4, 16, 2)],
  }[style];
  return (
    <svg viewBox="0 0 33 24" className="h-6 w-8 fill-current" aria-hidden>
      {shapes}
    </svg>
  );
}

function LayoutPicker({ layout, disabled, preview, onPreview, onChange }: { layout: GalleryLayout; disabled: boolean; preview: boolean; onPreview: () => void; onChange: (l: GalleryLayout) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line-soft px-5 py-3.5">
      <div role="radiogroup" aria-label="Layout" className="flex flex-wrap gap-1.5">
        {STYLES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={layout.style === s}
            disabled={disabled}
            onClick={() => onChange({ ...layout, style: s })}
            title={GALLERY_STYLE_INFO[s].help}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-default",
              layout.style === s ? "border-ink bg-night text-white" : "border-line bg-paper text-ink-soft enabled:hover:border-ink",
            )}
          >
            <StyleIcon style={s} />
            {GALLERY_STYLE_INFO[s].label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        Columns on desktop
        <div role="radiogroup" aria-label="Columns" className="flex rounded-lg bg-paper-2 p-0.5 ring-1 ring-line">
          {([2, 3, 4] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={layout.columns === c}
              disabled={disabled}
              onClick={() => onChange({ ...layout, columns: c })}
              className={cn("h-7 w-8 rounded-md text-xs font-semibold tabular-nums transition", layout.columns === c ? "bg-white text-ink shadow-sm" : "text-muted enabled:hover:text-ink")}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={onPreview} aria-pressed={preview} className={cn("ml-auto rounded-lg px-2.5 py-1.5 text-xs font-medium transition", preview ? "bg-brand/40 text-ink" : "text-ink-soft hover:bg-paper-2")}>
        {preview ? "Hide preview" : "Preview layout"}
      </button>
    </div>
  );
}

/** A scaled-down look at the gallery in its chosen layout (desktop width). */
function LayoutPreview({ layout, items, siteUrl }: { layout: GalleryLayout; items: SlotItem[]; siteUrl: string }) {
  const shown = items.slice(0, layout.style === "carousel" ? 8 : 12);
  const img = (it: SlotItem, cover: boolean, k: number, cls = "") => (
    <img key={k} src={absolute(it.src, siteUrl)} alt="" loading="lazy" className={cn("w-full rounded-md", cover ? "h-full object-cover" : "h-auto", cls)} style={cover ? { objectPosition: it.position ?? "center" } : undefined} />
  );
  return (
    <div className="border-b border-line-soft bg-[#f6f6f4] px-5 py-4">
      <p className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wide text-faint">Preview · how the site lays it out on a desktop</p>
      <div className="mx-auto max-w-3xl rounded-xl bg-white p-3 shadow-sm ring-1 ring-line">
        {layout.style === "masonry" && (
          <div className="gap-1.5" style={{ columnCount: layout.columns }}>
            {shown.map((it, i) => (
              <div key={i} className="mb-1.5 break-inside-avoid">
                {img(it, false, i)}
              </div>
            ))}
          </div>
        )}
        {(layout.style === "grid" || layout.style === "featured") && (
          <div className="grid grid-flow-dense gap-1.5" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}>
            {shown.map((it, i) => (
              <div key={i} className={cn("aspect-[4/3]", layout.style === "featured" && i === 0 && "col-span-2 row-span-2 aspect-auto")}>
                {img(it, true, i)}
              </div>
            ))}
          </div>
        )}
        {layout.style === "carousel" && (
          <div className="flex gap-1.5 overflow-hidden">
            {shown.map((it, i) => (
              <div key={i} className="aspect-[4/3] shrink-0" style={{ width: `${100 / layout.columns - 1}%` }}>
                {img(it, true, i)}
              </div>
            ))}
          </div>
        )}
        {items.length > shown.length && <p className="mt-2 text-center text-[0.6875rem] text-muted">+ {items.length - shown.length} more</p>}
        {items.length === 0 && <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted"><Upload className="h-3.5 w-3.5" /> No photos yet</p>}
      </div>
    </div>
  );
}
