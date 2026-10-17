import { getSite } from "@/lib/sites";
import { publishedFeed } from "@/lib/site-photos";

export const dynamic = "force-dynamic";

/**
 * The published photos for a website, read by the site itself (its HUB_SITE_URL).
 * Public and read-only on purpose: it holds only what the site already shows to everyone.
 * Never cached here, so the site's refresh after Publish always gets the latest.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ site: string }> }) {
  const site = getSite((await params).site);
  if (!site) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    return Response.json(await publishedFeed(site.id), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Site feed failed", err);
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }
}
