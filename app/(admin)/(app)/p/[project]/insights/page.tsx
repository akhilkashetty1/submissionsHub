import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CheckCircle2, ClipboardCheck, FileSpreadsheet, Gauge, Repeat, TriangleAlert, Users } from "lucide-react";
import { requireProjectAccess } from "@/lib/auth";
import { FAIL, encodeColumnFilter } from "@/lib/filters";
import { NONE, RANGES, insights, rangeFor } from "@/lib/insights";
import { getProject } from "@/lib/projects";
import PortalHeader from "@/components/PortalHeader";
import PrintButton from "@/components/PrintButton";
import { CountColumns, Delta, FailBars, Heatmap, ScoreTrend } from "@/components/Charts";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ project: string }>; searchParams: Promise<{ range?: string; month?: string; by?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${getProject((await params).project)?.short ?? "Portal"} insights` };
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function InsightsPage({ params, searchParams }: Props) {
  const { project } = await requireProjectAccess((await params).project, "read");
  if (!project.analysis) notFound();
  const sp = await searchParams;
  const range = rangeFor(sp.range, sp.month);
  const data = await insights(project, range, sp.by ?? "hq");
  if (!data) notFound();
  const { kpis } = data;

  /** A link into the table, filtered to this period plus some column filters. */
  const table = (filters: string[] = [], extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ from: range.from, to: range.to, ...extra });
    filters.forEach((f) => p.append("f", f));
    return `/p/${project.id}?${p}`;
  };
  const here = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { range: sp.range, month: sp.month, by: sp.by, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/p/${project.id}/insights${p.size ? `?${p}` : ""}`;
  };
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    return { id: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) };
  });
  const reportHref = `/api/export/${project.id}?from=${range.from}&to=${range.to}&report=1`;
  const heatChecks = data.heatmap.checks;
  const sample = kpis.records < 10;

  return (
    <div className="mx-auto max-w-[96rem] space-y-5 print:space-y-4">
      <PortalHeader
        project={project}
        title="Insights"
        sub={
          <>
            {range.label} · {fmtDay(range.from)} – {fmtDay(range.to)} · compared with the {range.days} days before
          </>
        }
        actions={
          <>
            <a href={reportHref} className="btn btn-secondary btn-sm print:hidden">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Report (Excel)
            </a>
            <PrintButton />
          </>
        }
      />

      {/* Period */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex rounded-lg bg-paper p-0.5 shadow-xs ring-1 ring-line">
          {RANGES.map((r) => (
            <Link key={r.id} href={here({ range: r.id, month: undefined })} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition", !sp.month && range.label === r.label ? "bg-ink text-white" : "text-ink-soft hover:bg-paper-2 hover:text-ink")}>
              {r.label}
            </Link>
          ))}
        </div>
        <span className="text-xs text-muted">or a month:</span>
        <div className="flex flex-wrap gap-1">
          {months.slice(0, 6).map((m) => (
            <Link key={m.id} href={here({ month: m.id, range: undefined })} className={cn("chip transition hover:ring-line-strong", sp.month === m.id && "bg-ink text-white ring-ink")}>
              {m.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Headline numbers */}
      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile icon={<Users className="h-4 w-4" />} label="Assessments" value={kpis.records.toLocaleString("en-IN")} href={table()} delta={<Delta value={kpis.records - kpis.prevRecords} unit="" />} />
        <Tile icon={<Gauge className="h-4 w-4" />} label="Average score" value={kpis.avgScore === null ? "—" : `${kpis.avgScore}%`} hint="share of checks passed" delta={<Delta value={kpis.avgScore !== null && kpis.prevAvgScore !== null ? kpis.avgScore - kpis.prevAvgScore : null} />} />
        <Tile icon={<CheckCircle2 className="h-4 w-4" />} label="All clear" value={`${kpis.allClear}%`} hint="nothing failed" delta={<Delta value={kpis.prevAllClear === null ? null : kpis.allClear - kpis.prevAllClear} />} />
        <Tile icon={<TriangleAlert className="h-4 w-4" />} label="Failed checks" value={kpis.failedChecks.toLocaleString("en-IN")} href={`/p/${project.id}/followups`} hint="in this period" />
        <Tile icon={<ClipboardCheck className="h-4 w-4" />} label="Still open" value={kpis.openFollowups.toLocaleString("en-IN")} href={`/p/${project.id}/followups`} hint="from this period, not fixed" tone={kpis.openFollowups ? "warn" : undefined} />
        <Tile icon={<CalendarClock className="h-4 w-4" />} label="Documents" value={`${kpis.expired} / ${kpis.expiringSoon}`} href={`/p/${project.id}/expiries`} hint="expired / due in 30 days" tone={kpis.expired ? "bad" : kpis.expiringSoon ? "warn" : undefined} />
      </section>

      {sample && <p className="rounded-lg bg-paper-2 px-3.5 py-2.5 text-xs text-muted ring-1 ring-line">Only {kpis.records} assessment{kpis.records === 1 ? "" : "s"} in this period, so treat the percentages as a rough guide. Try a longer period.</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section className="card p-5 print:break-inside-avoid" aria-labelledby="weak-h">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="weak-h" className="section-title">Weakest checks</h2>
            <span className="text-xs text-muted">failed · vs before</span>
          </div>
          {data.weakest.length ? (
            <FailBars
              rows={data.weakest.map((c) => ({ key: c.header, label: c.label, sub: c.section ?? undefined, rate: c.rate, failed: c.failed, asked: c.asked, prevRate: c.prevRate, href: table([encodeColumnFilter(c.header, FAIL)]) }))}
            />
          ) : (
            <Empty>Nothing failed in this period.</Empty>
          )}
        </section>

        <section className="card p-5 print:break-inside-avoid" aria-labelledby="trend-h">
          <h2 id="trend-h" className="section-title">The last 12 months</h2>
          <div className="mt-3 grid gap-5">
            <figure>
              <figcaption className="mb-1 text-xs text-muted">Average score</figcaption>
              <ScoreTrend points={data.trend.map((t) => ({ ...t, href: monthHref(project.id, t.month) }))} />
            </figure>
            <figure>
              <figcaption className="mb-1 text-xs text-muted">Assessments</figcaption>
              <CountColumns points={data.trend.map((t) => ({ ...t, href: monthHref(project.id, t.month) }))} />
            </figure>
          </div>
        </section>
      </div>

      <section className="card p-5 print:break-inside-avoid" aria-labelledby="heat-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="heat-h" className="section-title">Where it fails</h2>
            <p className="mt-0.5 text-xs text-muted">How often each check failed, by {data.heatmap.group.label}. Darker is worse; click a cell for those records.</p>
          </div>
          <div className="flex rounded-lg bg-paper-2 p-0.5 ring-1 ring-line print:hidden">
            {data.groups.map((g) => (
              <Link key={g.id} href={here({ by: g.id })} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", data.heatmap.group.id === g.id ? "bg-paper text-ink shadow-xs" : "text-muted hover:text-ink")}>
                {g.label}
              </Link>
            ))}
          </div>
        </div>
        {data.heatmap.rows.length && heatChecks.length ? (
          <>
            <Heatmap
              groupLabel={data.heatmap.group.label}
              columns={heatChecks.map((c, i) => ({ header: c.header, label: c.label, short: String(i + 1) }))}
              rows={data.heatmap.rows.map((r) => ({
                value: r.value,
                records: r.records,
                cells: r.cells,
                hrefs: Object.fromEntries(heatChecks.map((c) => [c.header, table([...(r.value === NONE ? [] : [encodeColumnFilter(r.column, r.value)]), encodeColumnFilter(c.header, FAIL)])])),
              }))}
            />
            <ol className="mt-4 grid gap-x-6 gap-y-1 text-xs text-ink-soft sm:grid-cols-2 xl:grid-cols-3">
              {heatChecks.map((c, i) => (
                <li key={c.header} className="flex gap-2">
                  <span className="w-5 shrink-0 text-right tabular-nums text-faint">{i + 1}</span>
                  <span className="min-w-0 truncate" title={c.label}>
                    {c.label}
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <Empty>No assessments in this period.</Empty>
        )}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="card overflow-hidden print:break-inside-avoid" aria-labelledby="lm-h">
          <div className="border-b border-line px-5 py-3.5">
            <h2 id="lm-h" className="section-title">Line managers</h2>
            <p className="mt-0.5 text-xs text-muted">Ride-alongs done in this period and the one before. Anyone at 0 hasn&rsquo;t done one lately.</p>
          </div>
          {data.managers.length ? (
            <table className="w-full text-[0.8125rem]">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line-soft">
                  <th className="px-5 py-2 text-left font-medium">Line manager</th>
                  <th className="px-3 py-2 text-right font-medium">Now</th>
                  <th className="px-3 py-2 text-right font-medium">Before</th>
                  <th className="px-5 py-2 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {data.managers.slice(0, 15).map((m) => (
                  <tr key={m.value} className={cn(m.now === 0 && "bg-[#fffbeb]")}>
                    <td className="px-5 py-2">
                      <Link href={table([encodeColumnFilter(m.column, m.value)])} className="font-medium text-ink hover:underline">
                        {m.value}
                      </Link>
                      {m.now === 0 && <span className="ml-2 rounded-full bg-[#fef3c7] px-1.5 py-0.5 text-[0.625rem] font-semibold text-[#92400e]">none lately</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{m.now}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{m.before}</td>
                    <td className="px-5 py-2">
                      <Delta value={m.now - m.before} unit="" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No line managers recorded yet.</Empty>
          )}
        </section>

        <section className="card overflow-hidden print:break-inside-avoid" aria-labelledby="rep-h">
          <div className="border-b border-line px-5 py-3.5">
            <h2 id="rep-h" className="flex items-center gap-2 section-title">
              <Repeat className="h-4 w-4 text-flag" /> Same problem again
            </h2>
            <p className="mt-0.5 text-xs text-muted">The same check failed in a person&rsquo;s latest assessments, one after another.</p>
          </div>
          {data.repeats.length ? (
            <ul className="divide-y divide-line-soft">
              {data.repeats.slice(0, 12).map((r) => (
                <li key={`${r.personKey}|${r.header}`}>
                  <Link href={`/p/${project.id}/${r.lastId}`} className="flex items-start gap-3 px-5 py-2.5 transition hover:bg-paper-2">
                    <span className="mt-0.5 grid h-6 min-w-6 place-items-center rounded-md bg-flag-wash px-1 text-xs font-semibold tabular-nums text-flag ring-1 ring-[#f6d4d6]">{r.streak}×</span>
                    <span className="min-w-0">
                      <span className="block text-[0.8125rem] font-medium text-ink">
                        {r.person} <span className="font-normal text-muted">· {r.group}</span>
                      </span>
                      <span className="block truncate text-xs text-ink-soft">{r.label}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No repeated problems. Good sign.</Empty>
          )}
        </section>
      </div>
    </div>
  );
}

function monthHref(projectId: string, month: string) {
  const from = `${month}-01`;
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return `/p/${projectId}?from=${from}&to=${d.toISOString().slice(0, 10)}`;
}

function Tile({ icon, label, value, hint, delta, href, tone }: { icon: React.ReactNode; label: string; value: string; hint?: string; delta?: React.ReactNode; href?: string; tone?: "warn" | "bad" }) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <span className={cn("text-faint", tone === "warn" && "text-[#b45309]", tone === "bad" && "text-flag")}>{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink">{value}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[0.6875rem] text-faint">
        <span>{hint}</span>
        {delta}
      </div>
    </>
  );
  const cls = cn("card block p-4", tone === "warn" && "ring-1 ring-[#fde68a]", tone === "bad" && "ring-1 ring-[#f6d4d6]");
  return href ? (
    <Link href={href} className={cn(cls, "transition hover:shadow-lift")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-[0.8125rem] text-muted">{children}</p>;
}
