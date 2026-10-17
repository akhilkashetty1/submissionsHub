import "server-only";
import { logActivity } from "@/lib/activity";
import { query, transaction } from "@/lib/db";
import { removeImage } from "@/lib/site-storage";
import {
  DEFAULT_GALLERY_LAYOUT,
  type GalleryLayout,
  type GalleryStyle,
  type Site,
  type SiteManifest,
  type SitePhoto,
  type SlotItem,
  type SlotSpec,
  type SlotState,
} from "@/lib/sites";

/**
 * Website photos: the site describes its photo spots ("slots") and their built-in photos at
 * /api/site-manifest. Here, each slot has a draft (being edited, autosaved) and what's
 * published. The site reads the published state from /api/site/<site> and is told to refresh
 * when someone publishes. A slot nobody has published shows the site's built-in photos.
 */

const STYLES: GalleryStyle[] = ["masonry", "grid", "featured", "carousel"];
const MAX_ITEMS = 300;

export const siteUrl = (site: Site) => (process.env[site.urlEnv] ?? "").trim().replace(/\/$/, "");

// ---- the site's list of photo spots

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 100_000 ? Math.round(v) : undefined);

function cleanPhoto(p: unknown): SitePhoto | null {
  const o = p as Record<string, unknown>;
  const src = str(o?.src, 1000);
  if (!src || !(src.startsWith("/") || src.startsWith("https://"))) return null;
  return { src, alt: str(o.alt, 300), w: num(o.w), h: num(o.h), label: str(o.label, 80) || undefined, position: str(o.position, 40) || undefined };
}

/** Only trust the shape we expect from the site. */
function cleanManifest(json: unknown): SiteManifest | null {
  const m = json as Record<string, unknown>;
  if (!m || !Array.isArray(m.slots)) return null;
  const slots: SlotSpec[] = [];
  for (const raw of m.slots as Record<string, unknown>[]) {
    const key = str(raw?.key, 80);
    const kind = raw?.kind === "gallery" || raw?.kind === "set" || raw?.kind === "fixed" ? raw.kind : null;
    if (!/^[a-z0-9.-]+$/.test(key) || !kind) continue;
    const max = Math.min(MAX_ITEMS, num(raw.max) ?? MAX_ITEMS);
    const min = Math.min(max, typeof raw.min === "number" && raw.min >= 0 ? Math.round(raw.min) : 0);
    slots.push({
      key,
      kind,
      min,
      max,
      title: str(raw.title, 120) || key,
      help: str(raw.help, 400),
      pages: (Array.isArray(raw.pages) ? raw.pages : [])
        .map((p: Record<string, unknown>) => ({ path: str(p?.path, 200), name: str(p?.name, 80) }))
        .filter((p) => p.path.startsWith("/")),
      label: raw.label === "Label" || raw.label === "Caption" ? raw.label : undefined,
      ratio: /^(auto|\d{1,2}\/\d{1,2})$/.test(str(raw.ratio, 10)) ? str(raw.ratio, 10) : "4/3",
      positions: Array.isArray(raw.positions) ? raw.positions.map((p) => str(p, 60)) : undefined,
      defaults: (Array.isArray(raw.defaults) ? raw.defaults : []).map(cleanPhoto).filter((p): p is SitePhoto => p !== null),
    });
  }
  return { site: str(m.site, 40), version: num(m.version) ?? 1, galleryStyles: STYLES, slots };
}

/**
 * The site's current list of photo spots. Fetched fresh (it's small) and remembered, so the
 * editor still opens from the last copy if the site is briefly unreachable.
 */
export async function getManifest(site: Site): Promise<{ manifest: SiteManifest | null; live: boolean; fetchedAt: Date | null }> {
  const base = siteUrl(site);
  if (base) {
    try {
      const res = await fetch(`${base}/api/site-manifest`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      const manifest = res.ok ? cleanManifest(await res.json()) : null;
      if (manifest) {
        await query(
          `insert into site_manifests (site, manifest, fetched_at) values ($1, $2, now())
           on conflict (site) do update set manifest = excluded.manifest, fetched_at = now()`,
          [site.id, JSON.stringify(manifest)],
        );
        return { manifest, live: true, fetchedAt: new Date() };
      }
    } catch (err) {
      console.warn(`Site manifest for ${site.id} unavailable:`, (err as Error).message);
    }
  }
  const [saved] = await query<{ manifest: unknown; fetched_at: Date }>(`select manifest, fetched_at from site_manifests where site = $1`, [site.id]);
  return { manifest: saved ? cleanManifest(saved.manifest) : null, live: false, fetchedAt: saved?.fetched_at ?? null };
}

// ---- slot state

export type SlotRow = {
  slot: string;
  draft: SlotState | null;
  published: SlotState | null;
  updated_by: string | null;
  updated_at: Date | null;
  published_by: string | null;
  published_at: Date | null;
};

export async function slotRows(siteId: string): Promise<Map<string, SlotRow>> {
  const rows = await query<SlotRow>(`select slot, draft, published, updated_by, updated_at, published_by, published_at from site_slots where site = $1`, [siteId]);
  return new Map(rows.map((r) => [r.slot, r]));
}

/** What the site shows now: the published state, or its built-in photos. */
export function liveState(spec: SlotSpec, row: SlotRow | undefined): SlotState {
  if (row?.published) return row.published;
  return { ...(spec.kind === "gallery" ? { layout: DEFAULT_GALLERY_LAYOUT } : {}), items: spec.defaults.map((d) => ({ ...d })) };
}

/** What the editor shows: the draft if there is one, else what's live. */
export const workingState = (spec: SlotSpec, row: SlotRow | undefined): SlotState => row?.draft ?? liveState(spec, row);

const same = (a: SlotState, b: SlotState) => JSON.stringify(a) === JSON.stringify(b);

const POSITION = /^(?:(?:left|center|right|top|bottom|\d{1,3}%)(?: (?:left|center|right|top|bottom|\d{1,3}%))?)$/;

type MediaRow = { id: string; url: string; w: number; h: number; name: string; bytes: number; created_at: Date; created_by: string | null };

/**
 * Turns what the browser sent into a valid slot state. Every photo must be either one uploaded
 * to this site here (looked up by id, so its address and size come from us) or one of the
 * site's own built-in photos. Anything else is dropped.
 */
async function normalise(siteId: string, manifest: SiteManifest, spec: SlotSpec, input: unknown): Promise<SlotState | string> {
  const raw = input as { layout?: Partial<GalleryLayout>; items?: unknown[] };
  if (!raw || !Array.isArray(raw.items)) return "Nothing to save.";
  if (raw.items.length > spec.max) return `This spot takes at most ${spec.max} photo${spec.max === 1 ? "" : "s"}.`;

  const builtIn = new Map<string, SitePhoto>();
  for (const s of manifest.slots) for (const d of s.defaults) if (!builtIn.has(d.src)) builtIn.set(d.src, d);

  const ids = raw.items.map((i) => (i as SlotItem)?.media).filter((m): m is string => typeof m === "string" && /^\d{1,18}$/.test(m));
  const media = new Map(
    ids.length
      ? (await query<MediaRow>(`select id::text, url, w, h, name, bytes, created_at, created_by from site_media where site = $1 and id = any($2::bigint[])`, [siteId, ids])).map((m) => [m.id, m])
      : [],
  );

  const items: SlotItem[] = [];
  for (const r of raw.items as SlotItem[]) {
    const alt = str(r?.alt, 300).trim();
    const label = spec.label ? str(r?.label, 80).trim() || undefined : undefined;
    const position = typeof r?.position === "string" && POSITION.test(r.position) ? r.position : undefined;
    const m = typeof r?.media === "string" ? media.get(r.media) : undefined;
    if (m) {
      items.push({ src: m.url, alt, w: m.w, h: m.h, label, position, media: m.id });
      continue;
    }
    const d = typeof r?.src === "string" ? builtIn.get(r.src) : undefined;
    if (d) items.push({ src: d.src, alt, w: d.w, h: d.h, label, position });
    else return "One of the photos no longer exists. Reload the page and try again.";
  }

  let layout: GalleryLayout | undefined;
  if (spec.kind === "gallery") {
    const style = STYLES.find((s) => s === raw.layout?.style) ?? DEFAULT_GALLERY_LAYOUT.style;
    const columns = raw.layout?.columns === 2 || raw.layout?.columns === 3 || raw.layout?.columns === 4 ? raw.layout.columns : DEFAULT_GALLERY_LAYOUT.columns;
    layout = { style, columns };
  }
  // Strip undefined so stored drafts compare cleanly with what's live.
  return JSON.parse(JSON.stringify({ ...(layout ? { layout } : {}), items }));
}

/** Autosaves a slot's draft. A draft identical to what's live is dropped (nothing to publish). */
export async function saveDraft(site: Site, manifest: SiteManifest, slotKey: string, input: unknown, by: string): Promise<{ ok: true; hasDraft: boolean } | { ok: false; error: string }> {
  const spec = manifest.slots.find((s) => s.key === slotKey);
  if (!spec) return { ok: false, error: "That photo spot no longer exists on the site." };
  const state = await normalise(site.id, manifest, spec, input);
  if (typeof state === "string") return { ok: false, error: state };
  const row = (await slotRows(site.id)).get(slotKey);
  const draft = same(state, liveState(spec, row)) ? null : state;
  await query(
    `insert into site_slots (site, slot, draft, updated_by, updated_at) values ($1, $2, $3, $4, now())
     on conflict (site, slot) do update set draft = excluded.draft, updated_by = excluded.updated_by, updated_at = now()`,
    [site.id, slotKey, draft ? JSON.stringify(draft) : null, by],
  );
  return { ok: true, hasDraft: draft !== null };
}

export async function discardDraft(siteId: string, slotKey: string) {
  await query(`update site_slots set draft = null where site = $1 and slot = $2`, [siteId, slotKey]);
}

/** Problems that stop a slot's draft going live (a set design needs its exact number of photos). */
export function publishProblems(spec: SlotSpec, state: SlotState): string[] {
  const out: string[] = [];
  const n = state.items.length;
  if (n < spec.min || n > spec.max) {
    out.push(spec.min === spec.max ? `needs exactly ${spec.min} photo${spec.min === 1 ? "" : "s"} (has ${n})` : `needs ${spec.min}–${spec.max} photos (has ${n})`);
  }
  const noAlt = state.items.filter((i) => !i.alt).length;
  if (noAlt) out.push(`${noAlt} photo${noAlt === 1 ? " is" : "s are"} missing a description`);
  if (spec.ratio === "auto" && state.items.some((i) => !i.w || !i.h)) out.push("a photo's size is unknown; upload it again");
  return out;
}

/** Makes every draft live at once, then asks the site to refresh. All or nothing. */
export async function publishSite(site: Site, manifest: SiteManifest, by: string): Promise<{ ok: true; slots: string[]; refreshed: boolean } | { ok: false; error: string }> {
  const rows = [...(await slotRows(site.id)).values()].filter((r) => r.draft);
  if (!rows.length) return { ok: false, error: "There are no changes to publish." };
  const problems: string[] = [];
  for (const r of rows) {
    const spec = manifest.slots.find((s) => s.key === r.slot);
    if (!spec) continue;
    const p = publishProblems(spec, r.draft!);
    if (p.length) problems.push(`${spec.title}: ${p.join(", ")}`);
  }
  if (problems.length) return { ok: false, error: `Fix these first. ${problems.join(". ")}.` };

  const known = rows.filter((r) => manifest.slots.some((s) => s.key === r.slot));
  await transaction(async (q) => {
    for (const r of known) {
      await q(
        `update site_slots set published = draft, draft = null, published_by = $3, published_at = now() where site = $1 and slot = $2 and draft is not null`,
        [site.id, r.slot, by],
      );
    }
  });
  await logActivity(by, "site.publish", null, { site: site.id, slots: known.map((r) => r.slot) });
  const refreshed = await refreshSite(site, [...new Set(known.flatMap((r) => manifest.slots.find((s) => s.key === r.slot)?.pages.map((p) => p.path) ?? []))]);
  await cleanUpMedia(site.id).catch((err) => console.error("Photo clean-up failed", err));
  return { ok: true, slots: known.map((r) => r.slot), refreshed };
}

/**
 * Tells the site to show the new photos now, then opens each changed page once so it rebuilds
 * straight away (the site keeps serving the previous version until the new one is ready).
 * If the site can't be reached, it still updates within the hour.
 */
export async function refreshSite(site: Site, paths: string[] = []): Promise<boolean> {
  const base = siteUrl(site);
  const secret = process.env[site.secretEnv];
  if (!base || !secret) return false;
  try {
    const res = await fetch(`${base}/api/site-revalidate`, { method: "POST", headers: { "x-site-secret": secret }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
  } catch {
    return false;
  }
  await Promise.allSettled(paths.map((p) => fetch(`${base}${p}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) }).then((r) => r.arrayBuffer())));
  return true;
}

// ---- the photo library

const USED_SQL = `exists (
  select 1 from site_slots s where s.site = m.site and (
    jsonb_path_exists(coalesce(s.draft, '{}'), '$.items[*] ? (@.media == $id)', jsonb_build_object('id', m.id::text))
    or jsonb_path_exists(coalesce(s.published, '{}'), '$.items[*] ? (@.media == $id)', jsonb_build_object('id', m.id::text))
  ))`;

export type LibraryPhoto = MediaRow & { used: boolean };

export async function listMedia(siteId: string): Promise<LibraryPhoto[]> {
  return query<LibraryPhoto>(`select m.id::text, m.url, m.w, m.h, m.name, m.bytes, m.created_at, m.created_by, ${USED_SQL} as used from site_media m where m.site = $1 order by m.created_at desc`, [siteId]);
}

export async function addMedia(siteId: string, file: { url: string; key: string; w: number; h: number; bytes: number; name: string }, by: string) {
  const [row] = await query<MediaRow>(
    `insert into site_media (site, url, storage_key, w, h, bytes, name, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id::text, url, w, h, name, bytes, created_at, created_by`,
    [siteId, file.url, file.key, file.w, file.h, file.bytes, file.name.slice(0, 200), by],
  );
  return row;
}

/** Deletes one uploaded photo, only if no draft and nothing live uses it. */
export async function deleteMedia(siteId: string, id: string): Promise<boolean> {
  if (!/^\d{1,18}$/.test(id)) return false;
  const [gone] = await query<{ storage_key: string }>(`delete from site_media m where m.site = $1 and m.id = $2 and not ${USED_SQL} returning storage_key`, [siteId, id]);
  if (!gone) return false;
  await removeImage(gone.storage_key).catch((err) => console.error("Could not remove photo file", err));
  return true;
}

/**
 * Frees storage: uploads that nothing uses any more (taken out of every draft and not live)
 * are deleted a day after upload, so a photo added and removed by mistake can still be put back.
 */
export async function cleanUpMedia(siteId: string) {
  const gone = await query<{ storage_key: string }>(
    `delete from site_media m where m.site = $1 and m.created_at < now() - interval '1 day' and not ${USED_SQL} returning storage_key`,
    [siteId],
  );
  for (const g of gone) await removeImage(g.storage_key).catch((err) => console.error("Could not remove photo file", err));
  return gone.length;
}

export async function storageUsed(siteId: string) {
  const [r] = await query<{ n: number; bytes: string }>(`select count(*)::int as n, coalesce(sum(bytes), 0)::text as bytes from site_media where site = $1`, [siteId]);
  return { photos: r?.n ?? 0, bytes: Number(r?.bytes ?? 0) };
}

// ---- what the site reads

/** The published photos per slot, for the site. Only what's live; drafts never leave the hub. */
export async function publishedFeed(siteId: string) {
  const rows = await query<{ slot: string; published: SlotState; published_at: Date }>(
    `select slot, published, published_at from site_slots where site = $1 and published is not null`,
    [siteId],
  );
  const slots: Record<string, { layout?: GalleryLayout; items: Omit<SlotItem, "media">[] }> = {};
  for (const r of rows) {
    slots[r.slot] = {
      ...(r.published.layout ? { layout: r.published.layout } : {}),
      items: r.published.items.map(({ src, alt, w, h, label, position }) => ({ src, alt, w, h, label, position })),
    };
  }
  const updatedAt = rows.reduce<Date | null>((a, r) => (!a || r.published_at > a ? r.published_at : a), null);
  return { site: siteId, updatedAt, slots };
}
