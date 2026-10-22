import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CalendarClock, CalendarX2, Info } from "lucide-react";
import { requireProjectAccess } from "@/lib/auth";
import { formatIST } from "@/lib/format";
import { expiries, type Expiry } from "@/lib/insights";
import { getProject } from "@/lib/projects";
import PortalHeader from "@/components/PortalHeader";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ project: string }>; searchParams: Promise<{ show?: string; hq?: string; doc?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${getProject((await params).project)?.short ?? "Portal"} expiries` };
}

const BUCKETS = [
  { id: "expired", label: "Expired", test: (e: Expiry) => e.days < 0 },
  { id: "30", label: "Next 30 days", test: (e: Expiry) => e.days >= 0 && e.days <= 30 },
  { id: "90", label: "31–90 days", test: (e: Expiry) => e.days > 30 && e.days <= 90 },
  { id: "later", label: "Later", test: (e: Expiry) => e.days > 90 },
] as const;

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function Status({ days }: { days: number }) {
  if (days < 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-flag-wash px-2 py-0.5 text-xs font-semibold text-flag ring-1 ring-[#f6d4d6]">
        <CalendarX2 className="h-3 w-3" /> Expired {Math.abs(days)} day{Math.abs(days) === 1 ? "" : "s"} ago
      </span>
    );
  if (days <= 30)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fffbeb] px-2 py-0.5 text-xs font-semibold text-[#92400e] ring-1 ring-[#fde68a]">
        <CalendarClock className="h-3 w-3" /> {days === 0 ? "Expires today" : `${days} day${days === 1 ? "" : "s"} left`}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 text-xs font-medium text-ink-soft ring-1 ring-line">
      <CalendarCheck className="h-3 w-3 text-ok" /> {days} days left
    </span>
  );
}

export default async function ExpiriesPage({ params, searchParams }: Props) {
  const { project } = await requireProjectAccess((await params).project, "read");
  if (!project.analysis) notFound();
  const sp = await searchParams;
  const all = await expiries(project);
  const show = BUCKETS.find((b) => b.id === sp.show)?.id ?? "soon";
  const hqs = [...new Set(all.map((e) => e.group))].sort();
  const docs = [...new Set(all.map((e) => e.document))].sort();
  const base = all.filter((e) => (!sp.hq || e.group === sp.hq) && (!sp.doc || e.document === sp.doc));
  const rows = show === "soon" ? base.filter((e) => e.days <= 30) : base.filter(BUCKETS.find((b) => b.id === show)!.test);
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ show: sp.show, hq: sp.hq, doc: sp.doc, ...patch })) if (v) p.set(k, v);
    return `/p/${project.id}/expiries${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[96rem] space-y-5">
      <PortalHeader project={project} title="Expiries" sub="Driving licence and insurance dates from each person's latest assessment that recorded them." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {BUCKETS.map((b) => {
          const n = base.filter(b.test).length;
          const active = show === b.id || (show === "soon" && (b.id === "expired" || b.id === "30"));
          return (
            <Link key={b.id} href={href({ show: b.id })} className={cn("card p-4 transition hover:shadow-lift", active && "ring-2 ring-ink/15", b.id === "expired" && n && "ring-1 ring-[#f6d4d6]")}>
              <p className="text-xs font-medium text-muted">{b.label}</p>
              <p className={cn("mt-1 text-2xl font-semibold", b.id === "expired" && n ? "text-flag" : "text-ink")}>{n}</p>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Link href={href({ show: undefined })} className={cn("chip", show === "soon" && "bg-ink text-white ring-ink")}>
          Expired + next 30 days
        </Link>
        <span className="mx-1 h-4 w-px bg-line" />
        <span className="text-muted">HQ:</span>
        <Link href={href({ hq: undefined })} className={cn("chip", !sp.hq && "bg-ink text-white ring-ink")}>
          All
        </Link>
        {hqs.map((h) => (
          <Link key={h} href={href({ hq: h })} className={cn("chip", sp.hq === h && "bg-ink text-white ring-ink")}>
            {h}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {docs.map((d) => (
          <Link key={d} href={href({ doc: sp.doc === d ? undefined : d })} className={cn("chip", sp.doc === d && "bg-ink text-white ring-ink")}>
            {d}
          </Link>
        ))}
      </div>

      <section className="card overflow-hidden">
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-[0.8125rem]">
              <thead className="border-b border-line bg-[#fafafa] text-xs text-muted">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Person</th>
                  <th className="px-3 py-2.5 text-left font-medium">HQ</th>
                  <th className="px-3 py-2.5 text-left font-medium">Document</th>
                  <th className="px-3 py-2.5 text-left font-medium">Valid till</th>
                  <th className="px-3 py-2.5 text-left font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((e) => (
                  <tr key={`${e.personKey}|${e.document}`} className="hover:bg-[#fafafb]">
                    <td className="px-5 py-2.5 font-medium text-ink">{e.person}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{e.group}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{e.document}</td>
                    <td className="px-3 py-2.5 tabular-nums text-ink">{fmt(e.date)}</td>
                    <td className="px-3 py-2.5">
                      <Status days={e.days} />
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <Link href={`/p/${project.id}/${e.submissionId}`} className="text-xs text-muted hover:text-ink hover:underline">
                        {formatIST(e.at).split(",")[0]} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-14 text-center text-[0.8125rem] text-muted">{all.length ? "Nothing in this list." : "No valid-till dates recorded yet. They come from the documents question on newer assessments."}</p>
        )}
      </section>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Info className="h-3.5 w-3.5" /> A newer assessment of the same person replaces their dates here. Nobody is emailed automatically yet.
      </p>
    </div>
  );
}
