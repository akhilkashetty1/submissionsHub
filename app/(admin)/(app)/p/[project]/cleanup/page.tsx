import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy } from "lucide-react";
import { requireProjectAccess } from "@/lib/auth";
import { formatIST } from "@/lib/format";
import { aliasOverview, duplicates } from "@/lib/insights";
import { can } from "@/lib/permissions";
import { getProject } from "@/lib/projects";
import PortalHeader from "@/components/PortalHeader";
import NameCleanup from "@/components/NameCleanup";
import DeleteSubmissionButton from "@/components/DeleteSubmissionButton";

type Props = { params: Promise<{ project: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${getProject((await params).project)?.short ?? "Portal"} clean-up` };
}

export default async function CleanupPage({ params }: Props) {
  const { user, project } = await requireProjectAccess((await params).project, "read");
  if (!project.analysis) notFound();
  const [fields, dups] = await Promise.all([aliasOverview(project), duplicates(project)]);
  const canManage = can(user, project.id, "manage");

  return (
    <div className="mx-auto max-w-[96rem] space-y-5">
      <PortalHeader project={project} title="Clean-up" sub="Tidy names so groups and charts count correctly, and catch double submissions. The records themselves are never edited." />

      <NameCleanup projectId={project.id} fields={fields} canManage={canManage} />

      <section className="card overflow-hidden" aria-labelledby="dup-h">
        <div className="border-b border-line px-5 py-3.5">
          <h2 id="dup-h" className="flex items-center gap-2 section-title">
            <Copy className="h-4 w-4 text-muted" /> Possible duplicates
          </h2>
          <p className="mt-0.5 text-xs text-muted">The same person assessed more than once on the same day. Often a form sent twice; sometimes a genuine second ride.</p>
        </div>
        {dups.length ? (
          <ul className="divide-y divide-line-soft">
            {dups.map((g) => (
              <li key={`${g.person}|${g.day}`} className="px-5 py-3">
                <p className="text-[0.8125rem] font-medium text-ink">
                  {g.person}{" "}
                  <span className="font-normal text-muted">
                    · {new Date(`${g.day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} · {g.records.length} records
                  </span>
                </p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {g.records.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 rounded-lg bg-paper-2 py-1 pl-3 pr-1 text-xs ring-1 ring-line">
                      <Link href={`/p/${project.id}/${r.id}`} className="font-medium text-ink hover:underline">
                        #{r.id}
                      </Link>
                      <span className="text-muted">{formatIST(r.at).split(", ").slice(-1)[0]}</span>
                      {r.scoreTotal ? (
                        <span className="tabular-nums text-ink-soft">
                          {r.scoreOk}/{r.scoreTotal}
                        </span>
                      ) : null}
                      {canManage && <DeleteSubmissionButton projectId={project.id} id={r.id} title={g.person} compact />}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-[0.8125rem] text-muted">No duplicates found.</p>
        )}
      </section>
    </div>
  );
}
