"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Filter, X } from "lucide-react";

/** The column filters in force (from column menus, groups and insights), each removable on its own. */
export default function ActiveFilters({ chips }: { chips: { raw: string; label: string }[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  if (!chips.length) return null;
  const without = (raw?: string) => {
    const next = new URLSearchParams(params.toString());
    const keep = raw ? next.getAll("f").filter((x) => x !== raw) : [];
    next.delete("f");
    keep.forEach((x) => next.append("f", x));
    next.delete("page");
    return `${pathname}${next.size ? `?${next}` : ""}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 group-data-[focus=true]/focus:hidden">
      <span className="flex items-center gap-1 text-xs font-medium text-muted">
        <Filter className="h-3.5 w-3.5" /> Showing only
      </span>
      {chips.map((c) => (
        <span key={c.raw} className="chip gap-1 bg-[#fafbe3] pr-0.5 text-ink ring-[#e9eba6]">
          {c.label}
          <Link href={without(c.raw)} aria-label={`Remove filter: ${c.label}`} className="grid h-4 w-4 place-items-center rounded-full text-muted transition hover:bg-black/10 hover:text-ink">
            <X className="h-2.5 w-2.5" strokeWidth={2.5} />
          </Link>
        </span>
      ))}
      {chips.length > 1 && (
        <Link href={without()} className="rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted hover:bg-paper-2 hover:text-ink">
          Clear these
        </Link>
      )}
    </div>
  );
}
