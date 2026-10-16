import { requireProjectAccess } from "@/lib/auth";

/**
 * A portal's pages exist only for people with access to it. Checked in the layout, above the
 * loading skeleton, so everyone else gets a real 404 and nothing from the portal is ever read.
 */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ project: string }> }) {
  await requireProjectAccess((await params).project, "read");
  return children;
}
