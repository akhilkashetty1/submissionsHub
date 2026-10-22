"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarClock, ClipboardCheck, Loader2, Sparkles, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

function Spinner() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 aria-label="Loading" className="h-3 w-3 animate-spin text-muted" /> : null;
}

/** The portal's views: the table plus, for assessment forms, insights, follow-ups, expiries and clean-up. */
export default function PortalTabs({ projectId, analysis, counts }: { projectId: string; analysis: boolean; counts?: { followups?: number; expiries?: number } }) {
  const path = usePathname();
  const base = `/p/${projectId}`;
  const tabs = [
    { href: base, label: "Submissions", icon: Table2, exact: true },
    ...(analysis
      ? [
          { href: `${base}/insights`, label: "Insights", icon: BarChart3 },
          { href: `${base}/followups`, label: "Follow-ups", icon: ClipboardCheck, count: counts?.followups },
          { href: `${base}/expiries`, label: "Expiries", icon: CalendarClock, count: counts?.expiries },
          { href: `${base}/cleanup`, label: "Clean-up", icon: Sparkles },
        ]
      : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Portal views" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(`${t.href}/`);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[0.8125rem] font-medium transition-colors",
              active ? "bg-paper text-ink shadow-[0_1px_2px_rgb(16_17_20/0.06)] ring-1 ring-line" : "text-ink-soft hover:bg-black/[0.04] hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
            {!!t.count && <span className="rounded-full bg-flag px-1.5 py-px text-[0.625rem] font-semibold tabular-nums text-white">{t.count}</span>}
            <Spinner />
          </Link>
        );
      })}
    </nav>
  );
}
