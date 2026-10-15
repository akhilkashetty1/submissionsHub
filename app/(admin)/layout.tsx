import Link from "next/link";
import { LayoutGrid, LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { PROJECTS } from "@/lib/projects";
import { projectStats } from "@/lib/submissions";
import { logout } from "@/app/actions";
import NavLink from "@/components/NavLink";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const stats = await projectStats();

  const nav = [
    { href: "/", label: "Overview", icon: <LayoutGrid className="h-4 w-4" />, count: null as number | null },
    ...PROJECTS.map((p) => ({
      href: `/p/${p.id}`,
      label: p.name,
      icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.accent }} />,
      count: stats[p.id]?.total ?? 0,
    })),
  ];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="bg-night text-[#c9ced8] lg:sticky lg:top-0 lg:h-dvh">
        <div className="flex items-center justify-between gap-3 px-4 py-4 lg:px-5 lg:py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-night">S</span>
            <span className="font-semibold text-white">Submissions Hub</span>
          </Link>
          <form action={logout} className="lg:hidden">
            <button className="flex items-center gap-1.5 text-xs text-[#8b919c] hover:text-white">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href} exact={n.href === "/"}>
              {n.icon}
              <span className="whitespace-nowrap">{n.label}</span>
              {n.count != null && <span className="ml-auto rounded-full bg-night-line px-2 py-0.5 text-[0.7rem] tabular-nums">{n.count}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 hidden w-64 border-t border-night-line px-5 py-4 lg:block">
          <p className="truncate text-xs text-[#8b919c]">
            Signed in as <span className="text-white">{session.username}</span>
          </p>
          <form action={logout}>
            <button className="mt-2 flex items-center gap-1.5 text-sm text-[#8b919c] hover:text-white">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
