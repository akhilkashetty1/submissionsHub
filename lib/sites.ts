/**
 * Websites whose photos are managed here (sidebar → Website). Adding a site is one
 * entry plus its two settings in the environment; the site itself describes its
 * photo spots at /api/site-manifest (see the RoadShield repo's lib/photo-slots.ts).
 *
 * - `urlEnv`: the site's address, e.g. https://road-shield.in
 * - `secretEnv`: shared with the site (its SITE_REVALIDATE_SECRET) so Publish can refresh it instantly
 *
 * Access is given per person like a portal, under the id `site:<id>`:
 * Viewer sees, Contributor edits drafts, Manager publishes.
 *
 * Plain data only, so both server and browser code can share it.
 */
export type Site = {
  id: string;
  name: string;
  short: string;
  accent: string;
  urlEnv: string;
  secretEnv: string;
};

export const SITES: Site[] = [
  {
    id: "roadshield",
    name: "RoadShield website",
    short: "RoadShield site",
    accent: "#da1f26",
    urlEnv: "SITE_URL_ROADSHIELD",
    secretEnv: "SITE_SECRET_ROADSHIELD",
  },
];

export const getSite = (id: string) => SITES.find((s) => s.id === id);
export const siteAccessId = (id: string) => `site:${id}`;

export const SITE_LEVEL_HELP = {
  read: "Can see the site's photos and layouts",
  write: "Also uploads, arranges and edits drafts",
  manage: "Also publishes changes to the live site",
} as const;

/** What a slot looks like, as the site describes it (its /api/site-manifest). */
export type SitePhoto = { src: string; alt: string; w?: number; h?: number; label?: string; position?: string };
export type GalleryStyle = "masonry" | "grid" | "featured" | "carousel";
export type GalleryLayout = { style: GalleryStyle; columns: 2 | 3 | 4 };
export type SlotSpec = {
  key: string;
  pages: { path: string; name: string }[];
  title: string;
  help: string;
  kind: "gallery" | "set" | "fixed";
  min: number;
  max: number;
  label?: "Label" | "Caption";
  ratio: string;
  positions?: string[];
  defaults: SitePhoto[];
};
export type SiteManifest = { site: string; version: number; galleryStyles: GalleryStyle[]; slots: SlotSpec[] };

export const GALLERY_STYLE_INFO: Record<GalleryStyle, { label: string; help: string }> = {
  masonry: { label: "Masonry", help: "Every photo at its own shape, nothing cropped" },
  grid: { label: "Even grid", help: "Same-size tiles, neatly cropped" },
  featured: { label: "Featured", help: "The first photo large, the rest in a grid" },
  carousel: { label: "Carousel", help: "One swipeable row" },
};
export const DEFAULT_GALLERY_LAYOUT: GalleryLayout = { style: "masonry", columns: 4 };

/** One photo placed in a slot (a draft or what's live). `media` is set for photos uploaded here. */
export type SlotItem = { src: string; alt: string; w?: number; h?: number; label?: string; position?: string; media?: string };
export type SlotState = { layout?: GalleryLayout; items: SlotItem[] };
