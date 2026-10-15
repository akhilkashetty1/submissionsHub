import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { PROJECTS, getProject } from "@/lib/projects";
import { formatIST, projectStats, recentSubmissions } from "@/lib/submissions";

export default async function Overview() {
  await requireSession();
  const [stats, recent] = await Promise.all([projectStats(), recentSubmissions(10)]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted">Every submission from every form, in one place. Times are India time.</p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {PROJECTS.map((p) => {
          const s = stats[p.id];
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
              <p className="mt-4 text-xs text-muted">Latest: {formatIST(s?.latest ?? null)}</p>
            </Link>
          );
        })}
      </section>

      <section className="rounded-2xl border border-line bg-paper shadow-sm">
        <h2 className="border-b border-line px-5 py-3.5 font-semibold">Latest submissions</h2>
        {recent.length ? (
          <ul className="divide-y divide-line">
            {recent.map((r) => {
              const p = getProject(r.project);
              return (
                <li key={r.id}>
                  <Link href={`/p/${r.project}/${r.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-paper-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p?.accent }} />
                    <span className="w-24 shrink-0 text-xs font-medium text-muted">{p?.short ?? r.project}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title || "Untitled"}</span>
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
