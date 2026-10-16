import { requireUser } from "@/lib/auth";

/**
 * Everything except the Account page needs a signed-in person whose password is up to date.
 * Checked here, in a layout, so the redirect happens before the page starts streaming
 * (a page-level redirect after the skeleton has been sent comes back as HTTP 200).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
