import Link from "next/link";
import { ArrowUpRight, Database, Highlighter, Inbox, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LEVEL_LABEL, levelFor, visibleProjects } from "@/lib/permissions";
import { getProject } from "@/lib/projects";
import { markById } from "@/lib/marks";
import { formatIST, projectStats, recentSubmissions, storageUsage } from "@/lib/submissions";

export default async function Overview() {
  const user = await requireUser();
  const projects = visibleProjects(user);
  const [stats, recent, used] = await Promise.all([
    projectStats(),
    recentSubmissions(10, projects.map((p) => p.id)),
    // The storage meter is for admins: it's about the whole database.
    user.isAdmin ? storageUsage().catch(() => null) : Promise.resolve(null),
  ]);
  // The database plan's storage limit (Neon free tier), so the meter shows how much room is left.
  const limitMb = Number(process.env.STORAGE_LIMIT_MB) || 1024;
  const usedMb = used == null ? null : used / 1_048_576;
  const pct = usedMb == null ? 0 : Math.min(100, (usedMb / limitMb) * 100);

  if (!projects.length) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-10 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-paper-2 text-muted ring-1 ring-line">
          <Inbox className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">Welcome, {user.displayName}</h1>
        <p className="mt-1.5 text-sm text-muted">You don&rsquo;t have access to any portal yet. Ask an admin to give you access, then reload this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="page-title">Overview</h1>
        <p className="page-sub">Every submission from the forms you have access to, in one place. Times are India time.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {projects.map((p) => {
          const s = stats[p.id];
          const level = levelFor(user, p.id)!;
          return (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="card group relative flex flex-col overflow-hidden p-5 transition-all duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-lift"
            >
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-[0.14] blur-2xl" style={{ background: p.accent }} />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ring-black/[0.06]" style={{ background: `color-mix(in oklab, ${p.accent} 18%, white)` }}>
                    <span className="h-3 w-3 rounded-[4px] ring-1 ring-black/10" style={{ background: p.accent }} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold tracking-[-0.01em]">{p.name}</h2>
                    <p className="truncate text-xs text-muted">{p.description}</p>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
              </div>

              <div className="relative mt-6">
                <p className="eyebrow">Total submissions</p>
                <p className="mt-1 text-[2rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{(s?.total ?? 0).toLocaleString("en-IN")}</p>
              </div>

              <dl className="relative mt-5 grid grid-cols-2 divide-x divide-line rounded-lg bg-paper-2 py-2.5 ring-1 ring-line-soft">
                <Stat label="Last 30 days" value={s?.last30 ?? 0} />
                <Stat label="With flags" value={s?.flagged ?? 0} tone={s?.flagged ? "flag" : undefined} />
              </dl>

              <div className="relative mt-4 flex items-center justify-between gap-2 text-xs text-muted">
                <span className="truncate">Latest {formatIST(s?.latest ?? null)}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {s?.marked ? (
                    <span className="chip" title="Highlighted records">
                      <Highlighter className="h-3 w-3" /> {s.marked}
                    </span>
                  ) : null}
                  <span className="chip">{user.isAdmin ? "Admin" : LEVEL_LABEL[level]}</span>
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      {usedMb != null && (
        <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-3 sm:w-64 sm:shrink-0">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-paper-2 text-ink-soft ring-1 ring-line">
              <Database className="h-4 w-4" />
            </span>
            <div>
              <h2 className="section-title">Database storage</h2>
              <p className="text-xs text-muted">
                <span className="font-semibold tabular-nums text-ink">{usedMb < 10 ? usedMb.toFixed(1) : Math.round(usedMb)} MB</span> of{" "}
                {limitMb >= 1024 ? `${+(limitMb / 1024).toFixed(1)} GB` : `${limitMb} MB`} used
              </p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-paper-2 ring-1 ring-line-soft" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Database storage used">
              <div className={`h-full rounded-full ${pct > 85 ? "bg-flag" : pct > 60 ? "bg-amber-500" : "bg-ok"}`} style={{ width: `${Math.max(pct, 0.75)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">Free up room by deleting old entries from a form&rsquo;s page: tick them and press Delete.</p>
          </div>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="section-title">Latest submissions</h2>
          {recent.length > 0 && <span className="text-xs text-muted">Last {recent.length}</span>}
        </div>
        {recent.length ? (
          <ul className="divide-y divide-line-soft">
            {recent.map((r) => {
              const p = getProject(r.project);
              const mark = markById(r.mark);
              return (
                <li key={r.id}>
                  <Link
                    href={`/p/${r.project}/${r.id}`}
                    style={mark ? { backgroundColor: mark.bg } : undefined}
                    className="group flex h-12 items-center gap-3 px-5 text-[0.8125rem] transition-colors hover:bg-paper-2"
                  >
                    <span className="flex w-28 shrink-0 items-center gap-2 text-xs font-medium text-ink-soft">
                      <span className="h-2 w-2 shrink-0 rounded-[3px] ring-1 ring-black/10" style={{ background: p?.accent }} />
                      <span className="truncate">{p?.short ?? r.project}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.title || "Untitled"}</span>
                    {mark && (
                      <span className="chip shrink-0" style={{ background: "white" }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: mark.dot }} /> {mark.label}
                      </span>
                    )}
                    {r.flagged.length > 0 && (
                      <span className="chip shrink-0 font-semibold text-flag" style={{ background: "var(--color-flag-wash)", boxShadow: "inset 0 0 0 1px #f6d4d6" }}>
                        <TriangleAlert className="h-3 w-3" /> {r.flagged.length}
                      </span>
                    )}
                    <span className="hidden w-44 shrink-0 text-right text-xs tabular-nums text-muted sm:block">{formatIST(r.received_at)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-paper-2 text-faint ring-1 ring-line">
              <Inbox className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-ink">No submissions yet</p>
            <p className="mt-1 text-xs text-muted">They&rsquo;ll appear here as soon as a form is submitted.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "flag" }) {
  return (
    <div className="px-3.5">
      <dt className="text-[0.6875rem] text-muted">{label}</dt>
      <dd className={`mt-0.5 flex items-center gap-1 text-base font-semibold tabular-nums tracking-tight ${tone === "flag" ? "text-flag" : "text-ink"}`}>
        {tone === "flag" && <TriangleAlert className="h-3.5 w-3.5" />}
        {value.toLocaleString("en-IN")}
      </dd>
    </div>
  );
}
