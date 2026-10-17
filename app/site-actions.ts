"use server";

import { authoriseSite } from "@/lib/access";
import { deleteMedia, discardDraft, getManifest, publishSite, saveDraft } from "@/lib/site-photos";
import type { Result } from "@/app/record-actions";

/** Autosave a photo spot's draft (Contributor). Nothing goes live until someone publishes. */
export async function saveSlotDraftAction(siteId: string, slot: string, state: unknown): Promise<Result<{ hasDraft: boolean }>> {
  const auth = await authoriseSite(siteId, "write");
  if (!auth.ok) return auth;
  try {
    const { manifest } = await getManifest(auth.site);
    if (!manifest) return { ok: false, error: "Can't reach the website to check its photo spots. Try again shortly." };
    return await saveDraft(auth.site, manifest, String(slot), state, auth.user.displayName);
  } catch (err) {
    console.error("saveSlotDraft failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}

/** Throw away a spot's draft, back to what's live (Contributor). */
export async function discardSlotDraftAction(siteId: string, slot: string): Promise<Result> {
  const auth = await authoriseSite(siteId, "write");
  if (!auth.ok) return auth;
  await discardDraft(auth.site.id, String(slot));
  return { ok: true };
}

/** Make every draft live (Manager) and refresh the site. */
export async function publishSiteAction(siteId: string): Promise<Result<{ slots: number; refreshed: boolean }>> {
  const auth = await authoriseSite(siteId, "manage");
  if (!auth.ok) return auth;
  try {
    const { manifest } = await getManifest(auth.site);
    if (!manifest) return { ok: false, error: "Can't reach the website. Try again shortly." };
    const res = await publishSite(auth.site, manifest, auth.user.displayName);
    return res.ok ? { ok: true, slots: res.slots.length, refreshed: res.refreshed } : res;
  } catch (err) {
    console.error("publishSite failed", err);
    return { ok: false, error: "Could not publish. Nothing was changed on the site." };
  }
}

/** Delete an uploaded photo that nothing uses (Contributor). */
export async function deleteSitePhotoAction(siteId: string, mediaId: string): Promise<Result> {
  const auth = await authoriseSite(siteId, "write");
  if (!auth.ok) return auth;
  return (await deleteMedia(auth.site.id, String(mediaId))) ? { ok: true } : { ok: false, error: "That photo is still used in a draft or on the live site." };
}
