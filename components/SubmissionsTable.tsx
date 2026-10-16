"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Trash2, TriangleAlert, X } from "lucide-react";
import { deleteAllMatching, deleteSubmissions } from "@/app/actions";
import ConfirmDialog from "@/components/ConfirmDialog";
import { cn } from "@/lib/utils";

export type TableRow = { id: string; received: string; cells: string[]; flags: number };

/**
 * The submissions table with multi-select and hard delete.
 *
 * - Tick rows (or the header box for the whole page) and delete them together.
 * - When a page is fully ticked and more entries match, "Select all N" extends the
 *   choice to every match of the current search/date filters, across all pages.
 * - Deletes are permanent. Selecting by id asks once; deleting everything matching
 *   makes you type DELETE.
 */
export default function SubmissionsTable({
  projectId,
  projectShort,
  columns,
  rows,
  total,
  filters,
  filtered,
}: {
  projectId: string;
  projectShort: string;
  columns: string[];
  rows: TableRow[];
  total: number;
  filters: { q: string; from: string; to: string };
  filtered: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pageIds = rows.map((r) => r.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const count = allMatching ? total : selected.size;
  const canSelectAll = allOnPage && !allMatching && total > rows.length;

  const clear = () => {
    setSelected(new Set());
    setAllMatching(false);
  };
  const toggleAll = () => {
    setAllMatching(false);
    setSelected(allOnPage ? new Set() : new Set(pageIds));
  };
  const toggle = (id: string) => {
    setAllMatching(false);
    setNotice(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const confirm = () => {
    setError(null);
    start(async () => {
      const res = allMatching ? await deleteAllMatching(projectId, filters) : await deleteSubmissions(projectId, [...selected]);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      clear();
      setNotice(`Permanently deleted ${res.deleted} submission${res.deleted === 1 ? "" : "s"}.`);
      router.refresh();
    });
  };

  const scope = filtered ? "matching your filters" : `in ${projectShort}`;

  return (
    <>
      {notice && (
        <p role="status" className="mb-4 flex items-center gap-2 rounded-xl bg-ok/10 px-4 py-2.5 text-sm font-medium text-ok">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="ml-auto text-ok/70 hover:text-ok">
            <X className="h-4 w-4" />
          </button>
        </p>
      )}

      {canSelectAll && (
        <p className="mb-3 rounded-xl bg-brand/25 px-4 py-2.5 text-sm">
          All {rows.length} on this page are selected.{" "}
          <button type="button" onClick={() => setAllMatching(true)} className="font-semibold underline underline-offset-2 hover:no-underline">
            Select all {total} {scope}
          </button>
        </p>
      )}
      {allMatching && (
        <p className="mb-3 rounded-xl bg-brand/25 px-4 py-2.5 text-sm">
          All <strong>{total}</strong> {scope} are selected.{" "}
          <button type="button" onClick={clear} className="font-semibold underline underline-offset-2 hover:no-underline">
            Clear selection
          </button>
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allOnPage}
                    onChange={toggleAll}
                    aria-label="Select every submission on this page"
                    className="h-4 w-4 cursor-pointer accent-[#15171b]"
                  />
                </th>
                <th className="px-2 py-3 font-medium">Received</th>
                {columns.map((c) => (
                  <th key={c} className="whitespace-nowrap px-4 py-3 font-medium">
                    {c}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const on = allMatching || selected.has(r.id);
                return (
                  <tr key={r.id} className={cn("group relative hover:bg-paper-2", on && "bg-brand/15 hover:bg-brand/20")}>
                    <td className="relative z-10 w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(r.id)}
                        disabled={allMatching}
                        aria-label={`Select submission ${r.id}`}
                        className="h-4 w-4 cursor-pointer accent-[#15171b]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-muted">
                      {/* The link covers the whole row; the checkbox sits above it */}
                      <Link href={`/p/${projectId}/${r.id}`} className="after:absolute after:inset-0">
                        {r.received}
                      </Link>
                    </td>
                    {r.cells.map((cell, i) => (
                      <td key={i} className={cn("max-w-[16rem] truncate px-4 py-3", i === 0 && "font-medium")}>
                        {cell || <span className="text-muted">—</span>}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      {r.flags ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-flag-wash px-2 py-0.5 text-xs font-semibold text-flag">
                          <TriangleAlert className="h-3 w-3" /> {r.flags}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full bg-night py-2 pl-5 pr-2 text-sm text-white shadow-2xl ring-1 ring-night-line">
            <span>
              <strong className="tabular-nums">{count}</strong> selected
            </span>
            <button type="button" onClick={clear} className="text-[#8b919c] hover:text-white">
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
              className="flex items-center gap-1.5 rounded-full bg-flag px-4 py-2 font-semibold transition hover:brightness-110"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Permanently delete ${count} submission${count === 1 ? "" : "s"}?`}
        confirmLabel={`Delete ${count}`}
        requireText={allMatching ? "DELETE" : undefined}
        pending={pending}
        error={error}
        onConfirm={confirm}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {allMatching
            ? `This deletes all ${total} submissions ${scope}, including the ones on other pages.`
            : `The selected ${count === 1 ? "submission" : "submissions"} will be removed from the database.`}{" "}
          <strong className="text-ink">This can&rsquo;t be undone.</strong>
        </p>
        <p>
          Want a copy first? Cancel, then use <em>Export to Excel</em>
          {filtered ? " (it exports the same filters)" : ""}.
        </p>
      </ConfirmDialog>
    </>
  );
}
