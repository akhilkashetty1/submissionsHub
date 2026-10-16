import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { field, formatIST, listSubmissions } from "@/lib/submissions";
import SubmissionsTable from "@/components/SubmissionsTable";

const PAGE_SIZE = 50;

type Props = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ q?: string; from?: string; to?: string; page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getProject((await params).project)?.name ?? "Project" };
}

export default async function ProjectPage({ params, searchParams }: Props) {
  await requireSession();
  const project = getProject((await params).project);
  if (!project) notFound();

  const sp = await searchParams;
  const filters = { q: sp.q ?? "", from: sp.from ?? "", to: sp.to ?? "" };
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listSubmissions(project.id, filters, page, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // After deleting the last rows of the last page, land on the new last page instead of an empty one.
  if (page > pages) redirect(`/p/${project.id}${pages > 1 ? `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page: String(pages) })}` : ""}`);
  const filtered = Boolean(filters.q || filters.from || filters.to);

  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v !== "" && v != null) p.set(k, String(v));
    const s = p.toString();
    return s ? `?${s}` : "";
  };

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
        <a
          href={`/api/export/${project.id}${qs({})}`}
          className="flex items-center gap-2 rounded-lg bg-night px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-night-2"
        >
          <Download className="h-4 w-4" />
          Export to Excel{filtered ? " (filtered)" : ""}
        </a>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-paper p-4 shadow-sm" role="search">
        <label className="min-w-[14rem] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">Search any answer</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Name, HQ, vehicle number, email…"
              className="w-full rounded-lg border border-line bg-paper-2 py-2 pl-9 pr-3 text-sm outline-none focus:border-ink focus:bg-white"
            />
          </span>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted">From</span>
          <input type="date" name="from" defaultValue={filters.from} className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted">To</span>
          <input type="date" name="to" defaultValue={filters.to} className="rounded-lg border border-line bg-paper-2 px-3 py-2 text-sm" />
        </label>
        <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-night">Apply</button>
        {filtered && (
          <Link href={`/p/${project.id}`} className="flex items-center gap-1 px-2 py-2 text-sm text-muted hover:text-ink">
            <X className="h-4 w-4" /> Clear
          </Link>
        )}
      </form>

      {rows.length ? (
        // Keyed so ticked rows reset when you change page or filters.
        <SubmissionsTable
          key={`${page}|${filters.q}|${filters.from}|${filters.to}`}
          projectId={project.id}
          projectShort={project.short}
          columns={project.listColumns}
          rows={rows.map((r) => ({
            id: r.id,
            received: formatIST(r.received_at),
            cells: project.listColumns.map((c) => field(r, c)),
            flags: r.flagged.length,
          }))}
          total={total}
          filters={filters}
          filtered={filtered}
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
    </div>
  );
}
