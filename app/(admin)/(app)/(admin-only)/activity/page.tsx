import type { Metadata } from "next";
import { Trash2, UserCog } from "lucide-react";
import { recentActivity, type ActivityRow } from "@/lib/activity";
import { requireAdmin } from "@/lib/auth";
import { formatIST } from "@/lib/format";
import { LEVEL_LABEL, isLevel } from "@/lib/permissions";
import { getProject } from "@/lib/projects";

export const metadata: Metadata = { title: "Activity log" };

function describe(a: ActivityRow): { text: string; delete?: boolean } {
  const d = a.detail as Record<string, unknown>;
  const portal = a.project ? (getProject(a.project)?.short ?? a.project) : "";
  const access = d.access && typeof d.access === "object" ? Object.entries(d.access as Record<string, unknown>) : [];
  const accessText = access.length ? access.map(([p, l]) => `${getProject(p)?.short ?? p}: ${isLevel(l) ? LEVEL_LABEL[l] : l}`).join(", ") : "no portal access";
  switch (a.action) {
    case "records.delete":
      return { text: `deleted ${d.count} record${d.count === 1 ? "" : "s"} from ${portal} (${d.how})`, delete: true };
    case "user.create":
      return { text: `added @${d.user}${d.admin ? " as an admin" : ` (${accessText})`}` };
    case "user.update":
      return { text: `changed @${d.user}: ${d.active === false ? "disabled, " : ""}${d.admin ? "admin" : accessText}` };
    case "user.password_reset":
      return { text: `reset the password for @${d.user}` };
    case "user.delete":
      return { text: `deleted @${d.user}` };
    default:
      return { text: a.action };
  }
}

export default async function ActivityPage() {
  await requireAdmin();
  const rows = await recentActivity(200);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="page-title">Activity log</h1>
        <p className="page-sub">Deletes and changes to people, newest first (last 200). Times are India time.</p>
      </header>
      <div className="card overflow-hidden">
        {rows.length ? (
          <ul className="divide-y divide-line-soft">
            {rows.map((a) => {
              const d = describe(a);
              return (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3.5 text-[0.8125rem] transition-colors hover:bg-[#fafafa]">
                  <span className={`-mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ${d.delete ? "bg-flag-wash text-flag ring-[#f6d4d6]" : "bg-paper-2 text-ink-soft ring-line"}`}>
                    {d.delete ? <Trash2 className="h-3.5 w-3.5" /> : <UserCog className="h-3.5 w-3.5" />}
                  </span>
                  <p className="min-w-0 flex-1 leading-relaxed text-ink-soft">
                    <strong className="font-semibold text-ink">{a.actor}</strong> {d.text}
                  </p>
                  <time className="shrink-0 pt-0.5 text-xs tabular-nums text-muted">{formatIST(a.at)}</time>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-14 text-center text-[0.8125rem] text-muted">Nothing yet. Deleting records or changing people will show up here.</p>
        )}
      </div>
    </div>
  );
}
