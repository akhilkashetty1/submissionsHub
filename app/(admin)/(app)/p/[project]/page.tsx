import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Inbox, SearchX } from "lucide-react";
import { requireProjectAccess } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProject } from "@/lib/projects";
import { RECEIVED, formatIST, listSubmissions, type Sort } from "@/lib/submissions";
import { availableColumns, getView } from "@/lib/views";
import SubmissionsTable from "@/components/SubmissionsTable";
import FilterBar from "@/components/FilterBar";
import ExportButton from "@/components/ExportButton";
import PortalIcon from "@/components/PortalIcon";
import NavFade from "@/components/NavFade";
import TableWorkspace from "@/components/TableWorkspace";
import { FOCUS_COOKIE } from "@/lib/sidebar";
import { MARKS } from "@/lib/marks";

const PAGE_SIZE = 50;
/** Long answers are cut for the grid (the record page shows them in full). */
const CELL_MAX = 300;

type Props = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ q?: string; from?: string; to?: string; mark?: string; notes?: string; sort?: string; dir?: string; page?: string }>;
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
  const sortCol = typeof sp.sort === "string" && sp.sort.length > 0 && sp.sort.length <= 300 ? sp.sort : "";
  const sortDir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const sort: Sort | undefined = sortCol ? { col: sortCol, dir: sortDir } : undefined;

  const [{ rows, total }, view, available] = await Promise.all([
    listSubmissions(project.id, filters, page, PAGE_SIZE, sort),
    getView(user.id, project.id),
    availableColumns(project.id),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // The current search and filters as a query string (no sort or page), for building links.
  const filterQuery = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== "")).toString();
  const withSort = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams(filterQuery);
    if (sort) {
      p.set("sort", sort.col);
      p.set("dir", sort.dir);
    }
    for (const [k, v] of Object.entries(extra)) if (v !== "" && v != null) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  // After deleting the last rows of the last page, land on the new last page instead of an empty one.
  if (page > pages) redirect(`/p/${project.id}${pages > 1 ? withSort({ page: pages }) : withSort({})}`);
  const filtered = Boolean(filters.q || filters.from || filters.to || filters.mark || filters.notes);

  const canWrite = can(user, project.id, "write");
  const canManage = can(user, project.id, "manage");
  const initialColumns = view.columns ?? project.listColumns;
  const initialFocus = (await cookies()).get(FOCUS_COOKIE)?.value === "1";
  const exportHref = `/api/export/${project.id}${filterQuery ? `?${filterQuery}` : ""}`;

  return (
    <div className="mx-auto max-w-[96rem] space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <PortalIcon id={project.id} accent={project.accent} size="lg" />
          <div className="min-w-0">
            <h1 className="page-title truncate">{project.name}</h1>
            <p className="mt-0.5 text-[0.8125rem] text-muted">
              <span className="font-medium tabular-nums text-ink-soft">{total.toLocaleString("en-IN")}</span> submission{total === 1 ? "" : "s"}
              {filtered && " matching your filters"}
              {sort && (
                <>
                  {" "}
                  · sorted by <strong className="font-medium text-ink-soft">{sort.col === RECEIVED ? "time received" : sort.col}</strong> ({sort.dir === "asc" ? "A→Z / low→high" : "Z→A / high→low"})
                </>
              )}
            </p>
          </div>
        </div>
        <ExportButton
          href={exportHref}
          label={`Export to Excel${filtered ? " (filtered)" : ""}`}
          className="btn btn-secondary"
        />
      </header>

      <TableWorkspace
        initialFocus={initialFocus}
        project={{ id: project.id, name: project.name, accent: project.accent }}
        total={total}
        filters={filters}
        pager={{
          from: total ? (page - 1) * PAGE_SIZE + 1 : 0,
          to: Math.min(page * PAGE_SIZE, total),
          newerHref: page > 1 ? `/p/${project.id}${withSort({ page: page - 1 })}` : null,
          olderHref: page < pages ? `/p/${project.id}${withSort({ page: page + 1 })}` : null,
        }}
        exportHref={exportHref}
        filterBar={
          <FilterBar
            projectId={project.id}
            q={filters.q}
            from={filters.from}
            to={filters.to}
            mark={filters.mark}
            notes={filters.notes}
            sort={sort?.col ?? ""}
            dir={sort?.dir ?? ""}
            filtered={filtered}
          />
        }
      >
        <NavFade className="space-y-4 group-data-[focus=true]/focus:flex group-data-[focus=true]/focus:min-h-0 group-data-[focus=true]/focus:flex-1 group-data-[focus=true]/focus:flex-col group-data-[focus=true]/focus:space-y-0">
          {rows.length ? (
            // Keyed so ticked rows reset when you change page, filters or sort.
            <SubmissionsTable
              key={`${page}|${filterQuery}|${sort?.col ?? ""}|${sort?.dir ?? ""}`}
              projectId={project.id}
              projectShort={project.short}
              titleColumn={project.titleColumn}
              available={available}
              defaults={project.listColumns}
              initialColumns={initialColumns}
              initialWidths={view.widths}
              rows={rows.map((r) => ({
                id: r.id,
                received: formatIST(r.received_at),
                mark: r.mark,
                notes: r.note_count,
                flags: r.flagged.length,
                data: Object.fromEntries(r.headers.map((h, i) => [h, (r.values[i] ?? "").slice(0, CELL_MAX)])),
                flaggedCols: r.flagged,
                cellMarks: r.cell_marks,
              }))}
              total={total}
              filters={filters}
              filtered={filtered}
              sort={sort ? { col: sort.col, dir: sort.dir } : null}
              baseQuery={filterQuery}
              canWrite={canWrite}
              canManage={canManage}
            />
          ) : (
            <div className="card px-5 py-16 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-paper-2 text-faint ring-1 ring-line">
                {filtered ? <SearchX className="h-5 w-5" /> : <Inbox className="h-5 w-5" />}
              </span>
              <p className="mt-3 text-sm font-medium text-ink">{filtered ? "Nothing matches these filters" : "No submissions yet"}</p>
              <p className="mt-1 text-xs text-muted">{filtered ? "Try a wider date range or a different search." : "New entries from this form will show up here."}</p>
            </div>
          )}

          {pages > 1 && (
            <nav className="flex items-center justify-between text-[0.8125rem] group-data-[focus=true]/focus:hidden" aria-label="Pages">
              <span className="text-muted">
                Page <span className="font-medium tabular-nums text-ink">{page}</span> of <span className="tabular-nums">{pages}</span>
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={`/p/${project.id}${withSort({ page: page - 1 })}`} className="btn btn-secondary btn-sm">
                    <ChevronLeft className="h-4 w-4" /> Newer
                  </Link>
                )}
                {page < pages && (
                  <Link href={`/p/${project.id}${withSort({ page: page + 1 })}`} className="btn btn-secondary btn-sm">
                    Older <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </nav>
          )}
        </NavFade>
      </TableWorkspace>
    </div>
  );
}
