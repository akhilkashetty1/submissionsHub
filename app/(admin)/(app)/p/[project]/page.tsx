import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireProjectAccess } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProject } from "@/lib/projects";
import { field, formatIST, listSubmissions } from "@/lib/submissions";
import SubmissionsTable from "@/components/SubmissionsTable";
import FilterBar from "@/components/FilterBar";
import ExportButton from "@/components/ExportButton";
import NavFade from "@/components/NavFade";
import { MARKS } from "@/lib/marks";

const PAGE_SIZE = 50;

type Props = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ q?: string; from?: string; to?: string; mark?: string; notes?: string; page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getProject((await params).project)?.name ?? "Project" };
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const { user, project } = await requireProjectAccess((await params).project, "read");

  const sp = await searchParams;
  const mark = sp.mark === "any" || sp.mark === "none" || MARKS.some((m) => m.id === sp.mark) ? sp.mark! : "";
  const filters = { q: sp.q ?? "", from: sp.from ?? "", to: sp.to ?? "", mark, notes: sp.notes === "1" ? "1" : "" };
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listSubmissions(project.id, filters, page, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v !== "" && v != null) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  // After deleting the last rows of the last page, land on the new last page instead of an empty one.
  if (page > pages) redirect(`/p/${project.id}${pages > 1 ? qs({ page: pages }) : qs({ page: "" })}`);
  const filtered = Boolean(filters.q || filters.from || filters.to || filters.mark || filters.notes);

  const canWrite = can(user, project.id, "write");
  const canManage = can(user, project.id, "manage");

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 rounded-full" style={{ background: project.accent }} />
            <h1 className="text-2xl font-semibold">{project.name}</h1>
          </div>
          <p className="mt-1 text-sm text-muted">
            {total} submission{total === 1 ? "" : "s"}
            {filtered && " matching your filters"}
          </p>
        </div>
        <ExportButton
          href={`/api/export/${project.id}${qs({ page: "" })}`}
          label={`Export to Excel${filtered ? " (filtered)" : ""}`}
          className="flex items-center gap-2 rounded-lg bg-night px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-night-2 disabled:opacity-80"
        />
      </header>

      <FilterBar projectId={project.id} q={filters.q} from={filters.from} to={filters.to} mark={filters.mark} notes={filters.notes} filtered={filtered} />

      <NavFade className="space-y-5">
        {rows.length ? (
          // Keyed so ticked rows reset when you change page or filters.
          <SubmissionsTable
            key={`${page}|${filters.q}|${filters.from}|${filters.to}|${filters.mark}|${filters.notes}`}
            projectId={project.id}
            projectShort={project.short}
            columns={project.listColumns}
            rows={rows.map((r) => ({
              id: r.id,
              received: formatIST(r.received_at),
              cells: project.listColumns.map((c) => field(r, c)),
              flags: r.flagged.length,
              mark: r.mark,
              notes: r.note_count,
            }))}
            total={total}
            filters={filters}
            filtered={filtered}
            canWrite={canWrite}
            canManage={canManage}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
            <p className="px-5 py-14 text-center text-sm text-muted">{filtered ? "Nothing matches these filters." : "No submissions yet for this form."}</p>
          </div>
        )}

        {pages > 1 && (
          <nav className="flex items-center justify-between text-sm" aria-label="Pages">
            <span className="text-muted">
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/p/${project.id}${qs({ page: page - 1 })}`} className="flex items-center gap-1 rounded-lg border border-line bg-paper px-3 py-1.5 hover:border-ink">
                  <ChevronLeft className="h-4 w-4" /> Newer
                </Link>
              )}
              {page < pages && (
                <Link href={`/p/${project.id}${qs({ page: page + 1 })}`} className="flex items-center gap-1 rounded-lg border border-line bg-paper px-3 py-1.5 hover:border-ink">
                  Older <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </nav>
        )}
      </NavFade>
    </div>
  );
}
