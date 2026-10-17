import type { Metadata } from "next";
import { requireSiteAccess } from "@/lib/auth";
import { formatIST } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getSite, siteAccessId } from "@/lib/sites";
import { getManifest, listMedia, liveState, publishProblems, siteUrl, slotRows, storageUsed, workingState } from "@/lib/site-photos";
import { blobConfigured, storageReady } from "@/lib/site-storage";
import SiteEditor, { type SlotView } from "@/components/SiteEditor";

type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getSite((await params).site)?.name ?? "Website" };
}

export default async function SitePage({ params }: Props) {
  const { user, site } = await requireSiteAccess((await params).site, "read");
  const [{ manifest, live, fetchedAt }, rows, media, usage] = await Promise.all([getManifest(site), slotRows(site.id), listMedia(site.id), storageUsed(site.id)]);

  const slots: SlotView[] = (manifest?.slots ?? []).map((spec) => {
    const row = rows.get(spec.key);
    const working = workingState(spec, row);
    return {
      spec,
      working,
      live: liveState(spec, row),
      hasDraft: Boolean(row?.draft),
      customised: Boolean(row?.published),
      publishedAt: row?.published_at ? formatIST(row.published_at) : null,
      publishedBy: row?.published_by ?? null,
      problems: publishProblems(spec, working),
    };
  });

  return (
    <SiteEditor
      site={{ id: site.id, name: site.name, url: siteUrl(site) }}
      slots={slots}
      library={media.map((m) => ({ id: m.id, url: m.url, w: m.w, h: m.h, name: m.name, bytes: m.bytes, used: m.used, uploadedBy: m.created_by, uploadedAt: formatIST(m.created_at) }))}
      usage={usage}
      reachable={live}
      lastSeen={fetchedAt ? formatIST(fetchedAt) : null}
      configured={Boolean(siteUrl(site))}
      storage={blobConfigured() ? "blob" : storageReady() ? "local" : "missing"}
      canWrite={can(user, siteAccessId(site.id), "write")}
      canManage={can(user, siteAccessId(site.id), "manage")}
    />
  );
}
