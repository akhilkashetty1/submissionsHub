import { requireAdmin } from "@/lib/auth";

/** People and the activity log: admins only. Anyone else gets a real 404, as if the page didn't exist. */
export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
