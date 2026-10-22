import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleDot, Clock, Highlighter, History, MessageSquare, Repeat, Timer, TriangleAlert, X } from "lucide-react";
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
import PortalIcon from "@/components/PortalIcon";
import NotesPanel from "@/components/NotesPanel";
import { ScoreBadge } from "@/components/RecordPeek";
import { pct, readChecks } from "@/lib/analysis";
import { followupsFor, historyFor } from "@/lib/insights";

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
  const [notes, history, followups] = await Promise.all([
    listNotes(s.id),
    project.analysis ? historyFor(project, s.id) : Promise.resolve({ entries: [], repeats: [] }),
    project.analysis ? followupsFor(s.id) : Promise.resolve([]),
  ]);
  const checks = project.analysis ? readChecks(s.headers, s.values, project.analysis) : [];
  const checkOf = new Map(checks.map((c) => [c.header, c]));
  const failed = checks.filter((c) => !c.ok);
  const followup = new Map(followups.map((f) => [f.header, f]));
  const repeatOf = new Map(history.repeats.map((r) => [r.header, r.streak]));
  const canWrite = can(user, project.id, "write");
  const canManage = can(user, project.id, "manage");
  const mark = markById(s.mark);

  // Fold "<question> — Remarks" columns under their question.
  const remarks = new Map<string, string>();
  s.headers.forEach((h, i) => h.endsWith(REMARKS) && remarks.set(h.slice(0, -REMARKS.length), s.values[i]));
  const rows = s.headers
    .map((h, i) => ({ h, v: s.values[i] }))
    .filter(({ h }) => !(h.endsWith(REMARKS) && s.headers.includes(h.slice(0, -REMARKS.length))));
  // Assessment portals: what failed by the checks' own rules; other portals: what the form flagged.
  const flagged = new Set(project.analysis ? failed.map((c) => c.header) : s.flagged);

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
                <PortalIcon id={project.id} accent={project.accent} size="xs" />
                {project.short}
                <span className="text-faint">/</span>
                <span className="font-mono tabular-nums">#{s.id}</span>
              </p>
              <h1 className="mt-1.5 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-[-0.025em]">
                {s.title || "Untitled submission"}
                {s.score_total ? <ScoreBadge ok={s.score_ok ?? 0} total={s.score_total} size="md" /> : null}
              </h1>
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

          {failed.length > 0 && (
            <div className="mt-4 rounded-lg bg-flag-wash p-3.5 ring-1 ring-[#f6d4d6]">
              <p className="flex items-center justify-between gap-2 text-[0.8125rem] font-semibold text-flag">
                <span className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4" /> {failed.length} item{failed.length === 1 ? " needs" : "s need"} follow-up
                </span>
                <Link href={`/p/${project.id}/followups`} className="text-xs font-medium text-flag/80 hover:text-flag hover:underline">
                  Follow-up board →
                </Link>
              </p>
              <ul className="mt-2 space-y-1.5">
                {failed.map((c) => {
                  const f = followup.get(c.header);
                  const status = f?.status ?? "open";
                  return (
                    <li key={c.header} className="flex flex-wrap items-start gap-x-2 gap-y-1 rounded-md bg-paper/70 px-2.5 py-1.5 text-[0.8125rem] ring-1 ring-[#f6d4d6]">
                      <span className="min-w-0 flex-1 text-ink">
                        {c.label} <span className="font-semibold text-flag">· {c.answer}</span>
                        {c.remark && <span className="block text-xs italic text-ink-soft">&ldquo;{c.remark}&rdquo;</span>}
                        {f?.note && <span className="block text-xs text-ink-soft">✎ {f.note}</span>}
                      </span>
                      {repeatOf.has(c.header) && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fffbeb] px-2 py-0.5 text-[0.6875rem] font-semibold text-[#92400e] ring-1 ring-[#fde68a]" title="Failed in this person's previous assessments too">
                          <Repeat className="h-3 w-3" /> {repeatOf.get(c.header)}× in a row
                        </span>
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1",
                          status === "fixed" ? "bg-[#effaf3] text-ok ring-[#cdebd8]" : status === "in_progress" ? "bg-[#fffbeb] text-[#92400e] ring-[#fde68a]" : "bg-paper text-flag ring-[#f6d4d6]",
                        )}
                      >
                        {status === "fixed" ? <Check className="h-3 w-3" /> : status === "in_progress" ? <Timer className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                        {status === "fixed" ? "Fixed" : status === "in_progress" ? "In progress" : "Open"}
                        {f?.owner && <span className="font-normal opacity-80">· {f.owner}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {failed.length === 0 && !project.analysis && s.flagged.length > 0 && (
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
        <div className="space-y-5 lg:sticky lg:top-16 lg:order-2">
          {history.entries.length > 1 && (
            <section className="card p-4" aria-labelledby="hist-h">
              <h2 id="hist-h" className="flex items-center gap-2 section-title">
                <History className="h-4 w-4 text-muted" /> History
                <span className="font-normal text-muted">· {history.entries.length} assessments</span>
              </h2>
              <ol className="mt-3 space-y-1">
                {[...history.entries].reverse().map((e) => {
                  const p = e.scoreTotal ? pct(e.scoreOk ?? 0, e.scoreTotal) : null;
                  return (
                    <li key={e.id}>
                      <Link href={`/p/${project.id}/${e.id}`} aria-current={e.id === s.id ? "page" : undefined} className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 text-[0.8125rem] transition", e.id === s.id ? "bg-paper-2 ring-1 ring-line" : "hover:bg-paper-2")}>
                        <span className="w-24 shrink-0 tabular-nums text-ink-soft">{formatIST(e.at).split(",")[0]}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-2 ring-1 ring-line-soft" aria-hidden>
                          {p !== null && <span className={cn("block h-full rounded-full", p >= 90 ? "bg-ok" : p >= 75 ? "bg-[#d97706]" : "bg-flag")} style={{ width: `${p}%` }} />}
                        </span>
                        <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{p === null ? "—" : `${p}%`}</span>
                        {e.same === "vehicle" && <span className="text-[0.625rem] text-faint" title="Same vehicle, different name">veh.</span>}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
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
                <dd className={cn("whitespace-pre-wrap break-words font-medium text-ink sm:text-right", !checkOf.get(h) && flagged.has(h) && "text-flag")}>
                  {checkOf.get(h) ? (
                    <span className="inline-flex flex-col items-end gap-1">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1", checkOf.get(h)!.ok ? "bg-[#effaf3] text-ok ring-[#cdebd8]" : "bg-flag text-white ring-flag")}>
                        {checkOf.get(h)!.ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
                        {checkOf.get(h)!.answer}
                      </span>
                      {checkOf.get(h)!.remark && !remarks.has(h) && (
                        <span className="flex items-start gap-1 text-xs font-normal italic text-ink-soft">
                          <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
                          {checkOf.get(h)!.remark}
                        </span>
                      )}
                    </span>
                  ) : (
                    v || <span className="font-normal text-faint">—</span>
                  )}
                </dd>
              </div>
              );
            })}
          </dl>
        </section>

      </div>
    </div>
  );
}
