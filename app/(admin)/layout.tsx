import Link from "next/link";
import { cookies } from "next/headers";
import { History, LayoutGrid, ShieldCheck, UserCog, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LEVEL_LABEL, levelFor, visibleProjects } from "@/lib/permissions";
import { projectStats } from "@/lib/submissions";
import AppShell from "@/components/AppShell";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import NavLink from "@/components/NavLink";
import SidebarToggle from "@/components/SidebarToggle";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

/** Hidden when the menu is collapsed to its icon rail (large screens only). */
const railHide = "lg:group-data-[collapsed=true]/side:hidden";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Pages enforce the password change; the layout must still render for the Account page that asks for it.
  const user = await requireUser({ allowMustChange: true });
  const projects = visibleProjects(user);
  const stats = user.mustChangePassword ? {} : await projectStats();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  const nav = [
    { href: "/", label: "Overview", icon: <LayoutGrid className="h-4 w-4 shrink-0" />, count: null as number | null },
    ...projects.map((p) => ({
      href: `/p/${p.id}`,
      label: p.name,
      icon: <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.accent }} />,
      count: user.mustChangePassword ? null : (stats[p.id]?.total ?? 0),
    })),
  ];
  const adminNav = [
    { href: "/users", label: "People & access", icon: <Users className="h-4 w-4 shrink-0" /> },
    { href: "/activity", label: "Activity log", icon: <History className="h-4 w-4 shrink-0" /> },
  ];

  const role = user.isAdmin ? "Admin" : projects.length ? [...new Set(projects.map((p) => LEVEL_LABEL[levelFor(user, p.id)!]))].join(" · ") : "No access yet";

  return (
    <AppShell initialCollapsed={collapsed}>
      <aside className="flex min-w-0 flex-col overflow-hidden bg-night text-[#c9ced8] lg:sticky lg:top-0 lg:h-dvh">
        <div
          className={`flex items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-6 lg:group-data-[collapsed=true]/side:flex-col lg:group-data-[collapsed=true]/side:gap-3 lg:group-data-[collapsed=true]/side:px-2`}
        >
          <Link href="/" title="Submissions Hub" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-night">S</span>
            <span className={`whitespace-nowrap font-semibold text-white ${railHide}`}>Submissions Hub</span>
          </Link>
          <SidebarToggle />
          <SignOutButton formClassName="lg:hidden" className="flex items-center gap-1.5 text-xs text-[#8b919c] hover:text-white disabled:opacity-70" />
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:pb-0" aria-label="Portals">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href} exact={n.href === "/"} title={n.label}>
              {n.icon}
              <span className={`whitespace-nowrap ${railHide}`}>{n.label}</span>
              {n.count != null && <span className={`ml-auto rounded-full bg-night-line px-2 py-0.5 text-[0.7rem] tabular-nums ${railHide}`}>{n.count}</span>}
            </NavLink>
          ))}
          <div className="lg:hidden">
            <NavLink href="/account" title="Account">
              <UserCog className="h-4 w-4" />
              <span className="whitespace-nowrap">Account</span>
            </NavLink>
          </div>
          {user.isAdmin && (
            <>
              <p className={`hidden px-3 pb-1 pt-4 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#6b717c] lg:block ${railHide}`}>Admin</p>
              <div aria-hidden className="mx-3 my-2 hidden border-t border-night-line lg:group-data-[collapsed=true]/side:block" />
              {adminNav.map((n) => (
                <NavLink key={n.href} href={n.href} title={n.label}>
                  {n.icon}
                  <span className={`whitespace-nowrap ${railHide}`}>{n.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="hidden border-t border-night-line px-3 py-4 lg:block">
          <NavLink href="/account" title={`${user.displayName} · ${role}`}>
            <UserCog className="h-4 w-4 shrink-0" />
            <span className={`min-w-0 ${railHide}`}>
              <span className="block truncate text-white">{user.displayName}</span>
              <span className="flex items-center gap-1 truncate text-xs text-[#8b919c]">
                {user.isAdmin && <ShieldCheck className="h-3 w-3 text-brand" />}
                {role}
              </span>
            </span>
          </NavLink>
          <SignOutButton
            formClassName="mt-1 px-3 lg:group-data-[collapsed=true]/side:flex lg:group-data-[collapsed=true]/side:justify-center lg:group-data-[collapsed=true]/side:px-0"
            className="flex items-center gap-1.5 text-sm text-[#8b919c] hover:text-white disabled:opacity-70"
            labelClassName={railHide}
          />
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </AppShell>
  );
}
