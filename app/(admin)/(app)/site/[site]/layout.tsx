import { requireSiteAccess } from "@/lib/auth";

/** A website's photo editor exists only for people with access to it (checked above the loading skeleton → real 404). */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ site: string }> }) {
  await requireSiteAccess((await params).site, "read");
  return children;
}
