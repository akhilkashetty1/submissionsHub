"use client";
/* eslint-disable @next/next/no-img-element -- photos come from the site or Blob storage; the hub shows them as they are */

import { useRef, useState } from "react";
import { Check, Crosshair, ImageUp, Images, Loader2, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { deleteSitePhotoAction } from "@/app/site-actions";
import type { SitePhoto, SlotItem, SlotSpec } from "@/lib/sites";
import { cn } from "@/lib/utils";

export type LibraryItem = { id: string; url: string; w: number; h: number; name: string; bytes: number; used: boolean; uploadedBy: string | null; uploadedAt: string };

const absolute = (src: string, siteUrl: string) => (src.startsWith("/") ? `${siteUrl}${src}` : src);

/** "40% 25%" → [40, 25]; keywords and anything else → centre. */
function focusOf(position?: string): [number, number] {
  const m = position?.match(/^(\d{1,3})% (\d{1,3})%$/);
  if (m) return [Number(m[1]), Number(m[2])];
  const word = (w: string | undefined, axis: "x" | "y") => (w === (axis === "x" ? "left" : "top") ? 0 : w === (axis === "x" ? "right" : "bottom") ? 100 : 50);
  const [a, b] = (position ?? "").split(" ");
  const x = /%$/.test(a ?? "") ? parseInt(a) : word(a, "x");
  const y = b ? (/%$/.test(b) ? parseInt(b) : word(b, "y")) : 50;
  return [x, y];
}

/**
 * One photo in a spot: describe it (alt text, for search engines and screen readers), label
 * it, and click the photo to set its focus point, which keeps that part in view wherever the
 * site crops it. Changes save as you type.
 */
export function PhotoDialog({
  spec,
  index,
  item,
  siteUrl,
  canWrite,
  onChange,
  onRemove,
  onReplaceUpload,
  onReplacePick,
  onClose,
}: {
  spec: SlotSpec;
  index: number;
  item: SlotItem;
  siteUrl: string;
  canWrite: boolean;
  onChange: (patch: Partial<SlotItem>) => void;
  onRemove: () => void;
  onReplaceUpload: (file: File) => void;
  onReplacePick: () => void;
  onClose: () => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [fx, fy] = focusOf(item.position);
  const cropped = spec.ratio !== "auto";
  const src = absolute(item.src, siteUrl);

  const setFocus = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canWrite || !cropped) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
    onChange({ position: x === 50 && y === 50 ? undefined : `${x}% ${y}%` });
  };

  return (
    <Modal title={`${spec.title} · photo ${index + 1}${spec.positions?.[index] ? ` (${spec.positions[index]})` : ""}`} onClose={onClose} width="54rem">
      <div className="grid gap-6 md:grid-cols-[1.35fr_1fr]">
        <div className="space-y-2">
          <div
            onClick={setFocus}
            className={cn("relative overflow-hidden rounded-xl bg-paper-2 ring-1 ring-line", canWrite && cropped && "cursor-crosshair")}
            title={canWrite && cropped ? "Click the part of the photo that must stay in view" : undefined}
          >
            <img src={src} alt="" className="block max-h-[52dvh] w-full object-contain" />
            {cropped && (
              <span
                aria-hidden
                className="pointer-events-none absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-brand/80 shadow-lg"
                style={{ left: `${fx}%`, top: `${fy}%` }}
              >
                <Crosshair className="h-3.5 w-3.5 text-night" />
              </span>
            )}
          </div>
          <p className="text-xs text-muted">
            {cropped ? (canWrite ? "Click to set the focus point: the part that stays in view when the site crops this photo." : "The yellow dot is the focus point.") : "Shown whole on the site, never cropped."}
            {item.w && item.h ? ` · ${item.w} × ${item.h}px` : ""}
          </p>
        </div>

        <div className="space-y-4">
          {cropped && (
            <div>
              <p className="label">How the site crops it</p>
              <div className="overflow-hidden rounded-xl ring-1 ring-line" style={{ aspectRatio: spec.ratio }}>
                <img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: item.position ?? "center" }} />
              </div>
            </div>
          )}

          <label className="block">
            <span className="label">
              Description <span className="font-normal text-faint">(required · what&rsquo;s in the photo)</span>
            </span>
            <textarea
              value={item.alt}
              onChange={(e) => onChange({ alt: e.target.value.slice(0, 300) })}
              disabled={!canWrite}
              rows={3}
              placeholder="e.g. A rider leaning into a turn at a field session"
              className={cn("field h-auto resize-none py-2", !item.alt.trim() && "border-[#e8c66a]")}
            />
            <span className="mt-1 block text-[0.6875rem] text-faint">Read aloud by screen readers and used by Google. Shown in the gallery viewer.</span>
          </label>

          {spec.label && (
            <label className="block">
              <span className="label">{spec.label}</span>
              <input
                value={item.label ?? ""}
                onChange={(e) => onChange({ label: e.target.value.slice(0, 80) || undefined })}
                disabled={!canWrite}
                placeholder={spec.label === "Label" ? "e.g. Cornering" : "e.g. An actual campaign creative"}
                className="field"
              />
            </label>
          )}

          {canWrite && (
            <div className="flex flex-wrap gap-2 border-t border-line-soft pt-4">
              <button type="button" onClick={() => file.current?.click()} className="btn btn-secondary btn-sm">
                <ImageUp className="h-3.5 w-3.5" /> Replace with upload
              </button>
              <button type="button" onClick={onReplacePick} className="btn btn-secondary btn-sm">
                <Images className="h-3.5 w-3.5" /> Replace from library
              </button>
              {spec.kind !== "fixed" && (
                <button type="button" onClick={onRemove} className="btn btn-ghost btn-sm text-flag">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
              {item.position && cropped && (
                <button type="button" onClick={() => onChange({ position: undefined })} className="btn btn-ghost btn-sm">
                  <Crosshair className="h-3.5 w-3.5" /> Re-centre
                </button>
              )}
              <input
                ref={file}
                type="file"
                accept="image/*,.heic,.heif"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onReplaceUpload(f);
                }}
              />
            </div>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="btn btn-primary">
              Done
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Every photo available to a site: uploads made here and the site's own built-in photos.
 * Pick some to add to a spot (or one to replace a photo), or tidy up uploads nothing uses.
 */
export function LibraryDialog({
  siteId,
  siteUrl,
  library,
  builtIn,
  target,
  canWrite,
  onPick,
  onDeleted,
  onClose,
}: {
  siteId: string;
  siteUrl: string;
  library: LibraryItem[];
  builtIn: SitePhoto[];
  /** null = just browsing the library */
  target: { spec: SlotSpec; replace?: number; room: number } | null;
  canWrite: boolean;
  onPick: (items: SlotItem[]) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"uploads" | "site">(library.length ? "uploads" : "site");
  const [chosen, setChosen] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const single = target?.replace !== undefined;
  const limit = single ? 1 : Math.max(0, target?.room ?? 0);

  const own = [...new Map(builtIn.map((p) => [p.src, p])).values()];
  const options: { key: string; src: string; item: SlotItem; meta: string; lib?: LibraryItem }[] =
    tab === "uploads"
      ? library.map((m) => ({ key: `m:${m.id}`, src: m.url, item: { src: m.url, alt: "", w: m.w, h: m.h, media: m.id }, meta: `${m.uploadedBy ?? "Someone"} · ${m.uploadedAt}`, lib: m }))
      : own.map((p) => ({ key: `s:${p.src}`, src: absolute(p.src, siteUrl), item: { src: p.src, alt: p.alt, w: p.w, h: p.h }, meta: p.alt }));
  const byKey = new Map<string, SlotItem>(
    [...library.map((m) => [`m:${m.id}`, { src: m.url, alt: "", w: m.w, h: m.h, media: m.id } as SlotItem] as const), ...own.map((p) => [`s:${p.src}`, { src: p.src, alt: p.alt, w: p.w, h: p.h } as SlotItem] as const)],
  );

  const toggle = (key: string) => {
    if (!target) return;
    setChosen((c) => (c.includes(key) ? c.filter((k) => k !== key) : single ? [key] : c.length < limit ? [...c, key] : c));
  };

  const remove = async (m: LibraryItem) => {
    setError(null);
    setDeleting(m.id);
    const res = await deleteSitePhotoAction(siteId, m.id);
    setDeleting(null);
    if (!res.ok) return setError(res.error);
    setChosen((c) => c.filter((k) => k !== `m:${m.id}`));
    onDeleted(m.id);
  };

  const title = !target ? "Photo library" : single ? `Replace photo ${target.replace! + 1} in ${target.spec.title}` : `Add to ${target.spec.title}`;

  return (
    <Modal title={title} onClose={onClose} width="62rem">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex rounded-lg bg-paper-2 p-0.5 text-xs font-medium ring-1 ring-line">
          {(["uploads", "site"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5 transition", tab === t ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}>
              {t === "uploads" ? `Uploaded here (${library.length})` : `Site's own photos (${own.length})`}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {target ? (single ? "Choose one photo." : `Choose up to ${limit}.`) : "Uploads that nothing uses can be deleted. Unused uploads are also cleaned up automatically a day after they were removed."}
        </p>
      </div>

      {error && <p role="alert" className="mb-3 rounded-lg bg-flag-wash px-3 py-2 text-[0.8125rem] font-medium text-flag">{error}</p>}

      {options.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong py-12 text-center text-sm text-muted">No uploads yet. Use “Add photos” on any spot.</p>
      ) : (
        <div className="grid max-h-[58dvh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-5">
          {options.map((o) => {
            const on = chosen.includes(o.key);
            return (
              <div key={o.key} className="group relative">
                <button
                  type="button"
                  onClick={() => toggle(o.key)}
                  disabled={!target}
                  aria-pressed={on}
                  className={cn("relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-paper-2 ring-1 ring-line transition", target && "hover:ring-2 hover:ring-ink/30", on && "ring-[3px] ring-ink")}
                >
                  <img src={o.src} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {on && (
                    <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink text-white shadow">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  )}
                  {o.lib && !o.lib.used && <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[0.625rem] font-medium text-white">Not used</span>}
                </button>
                <p className="mt-1 truncate text-[0.6875rem] text-muted" title={o.lib ? o.lib.name : o.meta}>
                  {o.lib ? o.lib.name : o.meta}
                </p>
                {o.lib && canWrite && !o.lib.used && (
                  <button
                    type="button"
                    onClick={() => remove(o.lib!)}
                    disabled={deleting === o.lib.id}
                    title="Delete this upload"
                    aria-label={`Delete ${o.lib.name}`}
                    className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg bg-white/95 text-flag opacity-0 shadow ring-1 ring-black/10 transition hover:bg-flag hover:text-white group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    {deleting === o.lib.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          {target ? "Cancel" : "Close"}
        </button>
        {target && (
          <button type="button" disabled={!chosen.length} onClick={() => onPick(chosen.map((k) => byKey.get(k)!).filter(Boolean))} className="btn btn-primary">
            {single ? "Use this photo" : `Add ${chosen.length || ""} photo${chosen.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    </Modal>
  );
}
