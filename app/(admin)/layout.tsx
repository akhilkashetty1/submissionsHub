import Link from "next/link";
import { cookies } from "next/headers";
import { History, LayoutGrid, ShieldCheck, UserCog, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LEVEL_LABEL, levelFor, visibleProjects } from "@/lib/permissions";
import { projectStats } from "@/lib/submissions";
import AppShell from "@/components/AppShell";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import NavLink from "@/components/NavLink";
import SignOutButton from "@/components/SignOutButton";
import TopBar from "@/components/TopBar";

export const dynamic = "force-dynamic";

/** Hidden when the menu is collapsed to its icon rail (large screens only). */
const railHide = "lg:group-data-[collapsed=true]/side:hidden";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Pages enforce the password change; the layout must still render for the Account page that asks for it.
  const user = await requireUser({ allowMustChange: true });
  const projects = visibleProjects(user);
  const stats = user.mustChangePassword ? {} : await projectStats();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  const portals = projects.map((p) => ({
    href: `/p/${p.id}`,
    label: p.name,
    icon: (
      <span className="grid h-4 w-4 shrink-0 place-items-center">
        <span className="h-2 w-2 rounded-[3px] ring-1 ring-black/10" style={{ background: p.accent }} />
      </span>
    ),
    count: user.mustChangePassword ? null : (stats[p.id]?.total ?? 0),
  }));
  const adminNav = [
    { href: "/users", label: "People & access", icon: <Users className="h-4 w-4 shrink-0" /> },
    { href: "/activity", label: "Activity log", icon: <History className="h-4 w-4 shrink-0" /> },
  ];

  const role = user.isAdmin ? "Admin" : projects.length ? [...new Set(projects.map((p) => LEVEL_LABEL[levelFor(user, p.id)!]))].join(" · ") : "No access yet";
  const sectionLabel = `hidden px-2.5 pb-1.5 pt-5 text-[0.6875rem] font-medium tracking-wide text-faint lg:block ${railHide}`;
  const railDivider = "mx-3 my-3 hidden border-t border-line lg:group-data-[collapsed=true]/side:block";

  return (
    <AppShell initialCollapsed={collapsed}>
      <aside className="flex min-w-0 flex-col overflow-hidden border-b border-line bg-canvas text-ink-soft lg:sticky lg:top-0 lg:h-dvh lg:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:h-14 lg:px-4 lg:py-0 lg:group-data-[collapsed=true]/side:justify-center lg:group-data-[collapsed=true]/side:px-2">
          <Link href="/" title="Submissions Hub" className="flex min-w-0 items-center gap-2.5 rounded-lg">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[0.5rem] bg-night text-[0.8rem] font-bold text-brand shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.25)]">
              S
            </span>
            <span className={`truncate whitespace-nowrap text-[0.875rem] font-semibold tracking-[-0.01em] text-ink ${railHide}`}>Submissions Hub</span>
          </Link>
          <SignOutButton formClassName="lg:hidden" className="btn btn-ghost btn-sm" />
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:overflow-x-hidden lg:px-2.5 lg:pb-0 lg:pt-1" aria-label="Portals">
          <NavLink href="/" exact title="Overview">
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span className={`whitespace-nowrap ${railHide}`}>Overview</span>
          </NavLink>

          {portals.length > 0 && <p className={sectionLabel}>Portals</p>}
          {portals.length > 0 && <div aria-hidden className={railDivider} />}
          {portals.map((n) => (
            <NavLink key={n.href} href={n.href} title={n.label}>
              {n.icon}
              <span className={`truncate whitespace-nowrap ${railHide}`}>{n.label}</span>
              {n.count != null && <span className={`ml-auto pl-2 text-[0.6875rem] font-medium tabular-nums text-faint ${railHide}`}>{n.count.toLocaleString("en-IN")}</span>}
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
              <p className={sectionLabel}>Admin</p>
              <div aria-hidden className={railDivider} />
              {adminNav.map((n) => (
                <NavLink key={n.href} href={n.href} title={n.label}>
                  {n.icon}
                  <span className={`whitespace-nowrap ${railHide}`}>{n.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="hidden p-2.5 lg:block">
          <div className="flex items-center gap-1 rounded-xl p-1 transition-colors hover:bg-black/[0.03] lg:group-data-[collapsed=true]/side:flex-col lg:group-data-[collapsed=true]/side:p-0">
            <Link
              href="/account"
              title={`${user.displayName} · ${role}`}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 lg:group-data-[collapsed=true]/side:flex-none"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2a2c33] to-night text-[0.75rem] font-semibold text-white ring-2 ring-paper">
                {user.displayName.trim().slice(0, 1).toUpperCase() || "?"}
              </span>
              <span className={`min-w-0 ${railHide}`}>
                <span className="block truncate text-[0.8125rem] font-medium leading-tight text-ink">{user.displayName}</span>
                <span className="mt-0.5 flex items-center gap-1 truncate text-[0.6875rem] leading-tight text-muted">
                  {user.isAdmin && <ShieldCheck className="h-3 w-3 shrink-0 text-brand-deep" />}
                  {role}
                </span>
              </span>
            </Link>
            <SignOutButton
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-black/[0.05] hover:text-ink disabled:opacity-70"
              labelClassName="sr-only"
            />
          </div>
        </div>
      </aside>

      <main className="min-w-0 bg-paper lg:my-2 lg:mr-2 lg:min-h-[calc(100dvh-1rem)] lg:rounded-xl lg:border lg:border-line lg:shadow-card">
        <TopBar portals={Object.fromEntries(projects.map((p) => [p.id, { name: p.name, accent: p.accent }]))} />
        <div className="px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </AppShell>
  );
}
