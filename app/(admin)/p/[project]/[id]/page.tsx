import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { formatIST, getSubmission } from "@/lib/submissions";
import { cn } from "@/lib/utils";
import DeleteSubmissionButton from "@/components/DeleteSubmissionButton";
import ExportButton from "@/components/ExportButton";

type Props = { params: Promise<{ project: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project, id } = await params;
  return { title: `${getProject(project)?.short ?? project} #${id}` };
}

const REMARKS = " — Remarks";

export default async function SubmissionPage({ params }: Props) {
  await requireSession();
  const { project: projectId, id } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  const s = await getSubmission(project.id, id);
  if (!s) notFound();

  // Fold "<question> — Remarks" columns under their question.
  const remarks = new Map<string, string>();
  s.headers.forEach((h, i) => h.endsWith(REMARKS) && remarks.set(h.slice(0, -REMARKS.length), s.values[i]));
  const rows = s.headers
    .map((h, i) => ({ h, v: s.values[i] }))
    .filter(({ h }) => !(h.endsWith(REMARKS) && s.headers.includes(h.slice(0, -REMARKS.length))));
  const flagged = new Set(s.flagged);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/p/${project.id}`} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> {project.name}
        </Link>
        <div className="flex items-center gap-2 text-sm">
          {s.next_id && (
            <Link href={`/p/${project.id}/${s.next_id}`} className="flex items-center gap-1 rounded-lg border border-line bg-paper px-3 py-1.5 hover:border-ink">
              <ChevronLeft className="h-4 w-4" /> Newer
            </Link>
          )}
          {s.prev_id && (
            <Link href={`/p/${project.id}/${s.prev_id}`} className="flex items-center gap-1 rounded-lg border border-line bg-paper px-3 py-1.5 hover:border-ink">
              Older <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      <header className="rounded-2xl border border-line bg-paper p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {project.short} · #{s.id}
            </p>
            <h1 className="mt-1 text-2xl font-semibold">{s.title || "Untitled submission"}</h1>
            <p className="mt-2 text-sm text-muted">
              Received {formatIST(s.received_at)}
              {s.submitted_at && Math.abs(new Date(s.submitted_at).getTime() - new Date(s.received_at).getTime()) > 120_000 && (
                <> · completed on device {formatIST(s.submitted_at)} (sent later)</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton
              href={`/api/export/${project.id}?id=${s.id}`}
              label="Excel"
              className="flex items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-sm font-medium hover:border-ink disabled:opacity-70"
            />
            <DeleteSubmissionButton projectId={project.id} id={s.id} title={s.title} />
          </div>
        </div>
        {s.flagged.length > 0 && (
          <div className="mt-4 rounded-xl bg-flag-wash p-3.5">
            <p className="flex items-center gap-2 text-sm font-semibold text-flag">
              <TriangleAlert className="h-4 w-4" /> {s.flagged.length} item{s.flagged.length === 1 ? " needs" : "s need"} follow-up
            </p>
            <ul className="mt-1.5 space-y-0.5 pl-6 text-sm text-ink-soft">
              {s.flagged.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
        {rows.map(({ h, v }) => (
          <div key={h} className={cn("grid gap-1 px-5 py-3 text-sm sm:grid-cols-[1fr_minmax(8rem,16rem)] sm:gap-6", flagged.has(h) && "bg-flag-wash/60")}>
            <dt className="text-ink-soft">
              {h}
              {remarks.has(h) && <span className="mt-0.5 block text-xs italic text-muted">Remarks: {remarks.get(h) || "—"}</span>}
            </dt>
            <dd className={cn("whitespace-pre-wrap break-words font-medium sm:text-right", flagged.has(h) && "text-flag")}>{v || <span className="text-muted">—</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
