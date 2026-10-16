"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Clock } from "lucide-react";
import SidebarToggle from "@/components/SidebarToggle";

type Crumb = { label: string; href?: string; accent?: string };

/** Where you are, worked out from the address. Large screens only (phones have the top menu). */
function crumbsFor(path: string, portals: Record<string, { name: string; accent: string }>): Crumb[] {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return [{ label: "Overview" }];
  if (parts[0] === "p" && parts[1]) {
    const p = portals[parts[1]];
    const portal: Crumb = { label: p?.name ?? parts[1], href: `/p/${parts[1]}`, accent: p?.accent };
    return parts[2] ? [portal, { label: `#${parts[2]}` }] : [{ ...portal, href: undefined }];
  }
  if (parts[0] === "users") return [{ label: "Admin" }, { label: "People & access" }];
  if (parts[0] === "activity") return [{ label: "Admin" }, { label: "Activity log" }];
  if (parts[0] === "account") return [{ label: "Account" }];
  return [];
}

export default function TopBar({ portals }: { portals: Record<string, { name: string; accent: string }> }) {
  const crumbs = crumbsFor(usePathname(), portals);
  return (
    <div className="sticky top-0 z-20 hidden h-12 items-center gap-2 rounded-t-xl border-b border-line-soft bg-paper/85 px-3 backdrop-blur-md lg:flex">
      <SidebarToggle />
      <span aria-hidden className="mx-1 h-4 w-px bg-line" />
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1 text-[0.8125rem]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={i} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-faint" />}
                {c.href ? (
                  <Link href={c.href} className="flex min-w-0 items-center gap-2 truncate rounded-md px-1.5 py-1 text-muted transition hover:bg-paper-2 hover:text-ink">
                    {c.accent && <span className="h-2 w-2 shrink-0 rounded-[3px] ring-1 ring-black/10" style={{ background: c.accent }} />}
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={`flex min-w-0 items-center gap-2 truncate px-1.5 py-1 ${last ? "font-medium text-ink" : "text-muted"}`}>
                    {c.accent && <span className="h-2 w-2 shrink-0 rounded-[3px] ring-1 ring-black/10" style={{ background: c.accent }} />}
                    {c.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <span className="chip shrink-0" title="Every time in this app is India Standard Time">
        <Clock className="h-3 w-3" /> IST
      </span>
    </div>
  );
}
