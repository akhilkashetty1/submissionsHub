import Link from "next/link";
import { History, LayoutGrid, ShieldCheck, UserCog, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LEVEL_LABEL, levelFor, visibleProjects } from "@/lib/permissions";
import { projectStats } from "@/lib/submissions";
import NavLink from "@/components/NavLink";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Pages enforce the password change; the layout must still render for the Account page that asks for it.
  const user = await requireUser({ allowMustChange: true });
  const projects = visibleProjects(user);
  const stats = user.mustChangePassword ? {} : await projectStats();

  const nav = [
    { href: "/", label: "Overview", icon: <LayoutGrid className="h-4 w-4" />, count: null as number | null },
    ...projects.map((p) => ({
      href: `/p/${p.id}`,
      label: p.name,
      icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.accent }} />,
      count: user.mustChangePassword ? null : (stats[p.id]?.total ?? 0),
    })),
  ];
  const adminNav = [
    { href: "/users", label: "People & access", icon: <Users className="h-4 w-4" /> },
    { href: "/activity", label: "Activity log", icon: <History className="h-4 w-4" /> },
  ];

  const role = user.isAdmin ? "Admin" : projects.length ? [...new Set(projects.map((p) => LEVEL_LABEL[levelFor(user, p.id)!]))].join(" · ") : "No access yet";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col bg-night text-[#c9ced8] lg:sticky lg:top-0 lg:h-dvh">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-night">S</span>
            <span className="font-semibold text-white">Submissions Hub</span>
          </Link>
          <SignOutButton formClassName="lg:hidden" className="flex items-center gap-1.5 text-xs text-[#8b919c] hover:text-white disabled:opacity-70" />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0" aria-label="Portals">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href} exact={n.href === "/"}>
              {n.icon}
              <span className="whitespace-nowrap">{n.label}</span>
              {n.count != null && <span className="ml-auto rounded-full bg-night-line px-2 py-0.5 text-[0.7rem] tabular-nums">{n.count}</span>}
            </NavLink>
          ))}
          <div className="lg:hidden">
            <NavLink href="/account">
              <UserCog className="h-4 w-4" />
              <span className="whitespace-nowrap">Account</span>
            </NavLink>
          </div>
          {user.isAdmin && (
            <>
              <p className="hidden px-3 pb-1 pt-4 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#6b717c] lg:block">Admin</p>
              {adminNav.map((n) => (
                <NavLink key={n.href} href={n.href}>
                  {n.icon}
                  <span className="whitespace-nowrap">{n.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="hidden border-t border-night-line px-3 py-4 lg:block">
          <NavLink href="/account">
            <UserCog className="h-4 w-4" />
            <span className="min-w-0">
              <span className="block truncate text-white">{user.displayName}</span>
              <span className="flex items-center gap-1 truncate text-xs text-[#8b919c]">
                {user.isAdmin && <ShieldCheck className="h-3 w-3 text-brand" />}
                {role}
              </span>
            </span>
          </NavLink>
          <SignOutButton formClassName="mt-1 px-3" className="flex items-center gap-1.5 text-sm text-[#8b919c] hover:text-white disabled:opacity-70" />
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
