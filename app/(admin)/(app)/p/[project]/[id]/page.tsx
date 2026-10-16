import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Highlighter, TriangleAlert } from "lucide-react";
import { requireProjectAccess } from "@/lib/auth";
import { markById } from "@/lib/marks";
import { can } from "@/lib/permissions";
import { getProject } from "@/lib/projects";
import { formatIST, getSubmission, listNotes } from "@/lib/submissions";
import { cn } from "@/lib/utils";
import CellMarkBadge from "@/components/CellMarkBadge";
import DeleteSubmissionButton from "@/components/DeleteSubmissionButton";
import ExportButton from "@/components/ExportButton";
import MarkPicker from "@/components/MarkPicker";
import NotesPanel from "@/components/NotesPanel";

type Props = { params: Promise<{ project: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { project, id } = await params;
  return { title: `${getProject(project)?.short ?? project} #${id}` };
}

const REMARKS = " — Remarks";

export default async function SubmissionPage({ params }: Props) {
  const { project: projectId, id } = await params;
  const { user, project } = await requireProjectAccess(projectId, "read");
  const s = await getSubmission(project.id, id);
  if (!s) notFound();
  const notes = await listNotes(s.id);
  const canWrite = can(user, project.id, "write");
  const canManage = can(user, project.id, "manage");
  const mark = markById(s.mark);

  // Fold "<question> — Remarks" columns under their question.
  const remarks = new Map<string, string>();
  s.headers.forEach((h, i) => h.endsWith(REMARKS) && remarks.set(h.slice(0, -REMARKS.length), s.values[i]));
  const rows = s.headers
    .map((h, i) => ({ h, v: s.values[i] }))
    .filter(({ h }) => !(h.endsWith(REMARKS) && s.headers.includes(h.slice(0, -REMARKS.length))));
  const flagged = new Set(s.flagged);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/p/${project.id}`} className="btn btn-ghost btn-sm -ml-2.5 text-muted">
          <ArrowLeft className="h-4 w-4" /> {project.name}
        </Link>
        <div className="flex items-center gap-1.5">
          {s.next_id && (
            <Link href={`/p/${project.id}/${s.next_id}`} className="btn btn-secondary btn-sm">
              <ChevronLeft className="h-4 w-4" /> Newer
            </Link>
          )}
          {s.prev_id && (
            <Link href={`/p/${project.id}/${s.prev_id}`} className="btn btn-secondary btn-sm">
              Older <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      <header className="card overflow-hidden" style={mark ? { borderColor: mark.dot } : undefined}>
        {mark && (
          <div className="flex items-center gap-2 border-b px-5 py-2 text-xs font-semibold" style={{ backgroundColor: mark.bg, borderColor: `color-mix(in oklab, ${mark.dot} 25%, transparent)` }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: mark.dot }} />
            {mark.label}
            {s.mark_by && <span className="font-normal text-ink-soft">· highlighted by {s.mark_by}</span>}
          </div>
        )}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-medium text-muted">
                <span className="h-2 w-2 rounded-[3px] ring-1 ring-black/10" style={{ background: project.accent }} />
                {project.short}
                <span className="text-faint">/</span>
                <span className="font-mono tabular-nums">#{s.id}</span>
              </p>
              <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.025em]">{s.title || "Untitled submission"}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted">
                <Clock className="h-3.5 w-3.5" /> Received {formatIST(s.received_at)}
                {s.submitted_at && Math.abs(new Date(s.submitted_at).getTime() - new Date(s.received_at).getTime()) > 120_000 && (
                  <> · completed on device {formatIST(s.submitted_at)} (sent later)</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ExportButton href={`/api/export/${project.id}?id=${s.id}`} label="Excel" className="btn btn-secondary" />
              {canManage && <DeleteSubmissionButton projectId={project.id} id={s.id} title={s.title} />}
            </div>
          </div>

          {canWrite && (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Highlighter className="h-3.5 w-3.5" /> Highlight
              </span>
              <MarkPicker projectId={project.id} ids={[s.id]} current={s.mark} />
              {mark && <span className="chip">{mark.label}</span>}
              {Object.keys(s.cell_marks).length > 0 && (
                <span className="text-xs text-muted">
                  + {Object.keys(s.cell_marks).length} coloured value{Object.keys(s.cell_marks).length === 1 ? "" : "s"} below · ✕ clears everything
                </span>
              )}
            </div>
          )}

          {s.flagged.length > 0 && (
            <div className="mt-4 rounded-lg bg-flag-wash p-3.5 ring-1 ring-[#f6d4d6]">
              <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-flag">
                <TriangleAlert className="h-4 w-4" /> {s.flagged.length} item{s.flagged.length === 1 ? " needs" : "s need"} follow-up
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-10 text-[0.8125rem] text-ink-soft marker:text-flag/50">
                {s.flagged.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="lg:sticky lg:top-16 lg:order-2">
          <NotesPanel
            projectId={project.id}
            submissionId={s.id}
            canWrite={canWrite}
            canManage={canManage}
            userId={user.id}
            initial={notes.map((n) => ({ id: n.id, authorId: n.author_id, authorName: n.author_name, body: n.body, at: formatIST(n.created_at) }))}
          />
        </div>
        <section className="card overflow-hidden lg:order-1" aria-labelledby="answers-h">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 id="answers-h" className="section-title">Responses</h2>
            <span className="chip tabular-nums">{rows.length}</span>
          </div>
          <dl className="divide-y divide-line-soft">
            {rows.map(({ h, v }) => {
              const cm = markById(s.cell_marks[h]);
              return (
              <div
                key={h}
                style={cm ? { backgroundColor: cm.bg, boxShadow: `inset 3px 0 0 ${cm.dot}` } : undefined}
                className={cn("grid gap-1 px-5 py-3 text-[0.8125rem] sm:grid-cols-[minmax(0,1fr)_minmax(8rem,18rem)] sm:gap-6", flagged.has(h) && !cm && "bg-flag-wash/70 shadow-[inset_3px_0_0_var(--color-flag)]")}
              >
                <dt className="text-muted">
                  {h}
                  {cm && <CellMarkBadge projectId={project.id} submissionId={s.id} col={h} mark={cm.id} canWrite={canWrite} />}
                  {remarks.has(h) && <span className="mt-1.5 block w-fit max-w-full rounded-md bg-paper-2 px-2 py-1 text-xs italic text-ink-soft ring-1 ring-line-soft">Remarks: {remarks.get(h) || "—"}</span>}
                </dt>
                <dd className={cn("whitespace-pre-wrap break-words font-medium text-ink sm:text-right", flagged.has(h) && "text-flag")}>{v || <span className="font-normal text-faint">—</span>}</dd>
              </div>
              );
            })}
          </dl>
        </section>

      </div>
    </div>
  );
}
