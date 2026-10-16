import Link from "next/link";
import { ArrowRight, Highlighter, TriangleAlert } from "lucide-react";
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
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-paper p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Welcome, {user.displayName}</h1>
        <p className="mt-2 text-sm text-muted">You don&rsquo;t have access to any portal yet. Ask an admin to give you access, then reload this page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted">Every submission from the forms you have access to, in one place. Times are India time.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {projects.map((p) => {
          const s = stats[p.id];
          const level = levelFor(user, p.id)!;
          return (
            <Link
              key={p.id}
              href={`/p/${p.id}`}
              className="group relative overflow-hidden rounded-2xl border border-line bg-paper p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: p.accent }} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{p.name}</h2>
                  <p className="text-xs text-muted">{p.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-2">
                <Stat label="Total" value={s?.total ?? 0} />
                <Stat label="Last 30 days" value={s?.last30 ?? 0} />
                <Stat label="With flags" value={s?.flagged ?? 0} tone={s?.flagged ? "flag" : undefined} />
              </dl>
              <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
                <span>Latest: {formatIST(s?.latest ?? null)}</span>
                <span className="flex items-center gap-1.5">
                  {s?.marked ? (
                    <span className="flex items-center gap-1" title="Highlighted records">
                      <Highlighter className="h-3 w-3" /> {s.marked}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 font-medium text-ink-soft">{user.isAdmin ? "Admin" : LEVEL_LABEL[level]}</span>
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      {usedMb != null && (
        <section className="rounded-2xl border border-line bg-paper p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Database storage</h2>
            <p className="text-sm text-muted">
              <span className="font-semibold tabular-nums text-ink">{usedMb < 10 ? usedMb.toFixed(1) : Math.round(usedMb)} MB</span> of{" "}
              {limitMb >= 1024 ? `${+(limitMb / 1024).toFixed(1)} GB` : `${limitMb} MB`} used
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Database storage used">
            <div className={`h-full rounded-full ${pct > 85 ? "bg-flag" : pct > 60 ? "bg-amber-500" : "bg-ok"}`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">Free up room by deleting old entries from a form&rsquo;s page: tick them and press Delete.</p>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-paper shadow-sm">
        <h2 className="border-b border-line px-5 py-3.5 font-semibold">Latest submissions</h2>
        {recent.length ? (
          <ul className="divide-y divide-line">
            {recent.map((r) => {
              const p = getProject(r.project);
              const mark = markById(r.mark);
              return (
                <li key={r.id}>
                  <Link
                    href={`/p/${r.project}/${r.id}`}
                    style={mark ? { backgroundColor: mark.bg } : undefined}
                    className="flex items-center gap-3 px-5 py-3 text-sm hover:brightness-[0.97]"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p?.accent }} />
                    <span className="w-24 shrink-0 text-xs font-medium text-muted">{p?.short ?? r.project}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title || "Untitled"}</span>
                    {mark && <span title={mark.label} className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ background: mark.dot }} />}
                    {r.flagged.length > 0 && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-flag">
                        <TriangleAlert className="h-3.5 w-3.5" /> {r.flagged.length}
                      </span>
                    )}
                    <span className="hidden shrink-0 text-xs text-muted sm:block">{formatIST(r.received_at)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted">No submissions yet. They&rsquo;ll appear here as soon as a form is submitted.</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "flag" }) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${tone === "flag" ? "text-flag" : ""}`}>{value}</dd>
    </div>
  );
}
