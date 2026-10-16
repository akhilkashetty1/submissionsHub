import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { formatIST } from "@/lib/format";
import { listUsers } from "@/lib/users";
import UsersManager from "@/components/UsersManager";

export const metadata: Metadata = { title: "People & access" };

export default async function UsersPage() {
  await requireAdmin();
  const users = await listUsers();
  return (
    <div className="mx-auto max-w-5xl">
      <UsersManager
        ownerName={process.env.ADMIN_USERNAME ?? "Owner"}
        users={users.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          isAdmin: u.isAdmin,
          active: u.active,
          mustChange: u.mustChangePassword,
          lastLogin: u.lastLoginAt ? formatIST(u.lastLoginAt) : null,
          createdBy: u.createdBy,
          access: u.access,
        }))}
      />
    </div>
  );
}
