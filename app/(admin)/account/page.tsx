import type { Metadata } from "next";
import { KeyRound, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LEVEL_HELP, LEVEL_LABEL, levelFor } from "@/lib/permissions";
import { PROJECTS } from "@/lib/projects";
import AccountPassword from "@/components/AccountPassword";
import PortalIcon from "@/components/PortalIcon";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser({ allowMustChange: true });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2a2c33] to-night text-base font-semibold text-white shadow-card ring-4 ring-paper-2">
          {user.displayName.trim().slice(0, 1).toUpperCase() || "?"}
        </span>
        <div className="min-w-0">
          <h1 className="page-title truncate">{user.displayName}</h1>
          <p className="mt-0.5 text-[0.8125rem] text-muted">@{user.username}</p>
        </div>
      </header>

      {user.mustChangePassword && (
        <p role="status" className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-[0.8125rem] text-amber-900 ring-1 ring-amber-200">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Choose your own password to continue.</strong> The one you were given is temporary. After this you can open the portals you have access to.
          </span>
        </p>
      )}

      <section className="card overflow-hidden">
        <h2 className="section-title border-b border-line px-5 py-3.5">Your access</h2>
        <ul className="divide-y divide-line-soft">
          {user.isAdmin && (
            <li className="flex flex-wrap items-center gap-2 px-5 py-3.5 text-[0.8125rem]">
              <span className="flex items-center gap-1 rounded-md bg-night px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-brand">
                <ShieldCheck className="h-3 w-3" /> Admin
              </span>
              <span className="text-muted">All portals as Manager, plus people and the activity log</span>
            </li>
          )}
          {!user.isAdmin &&
            PROJECTS.map((p) => {
              const level = levelFor(user, p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[0.8125rem]">
                  <span className="flex items-center gap-2 font-medium">
                    <PortalIcon id={p.id} accent={p.accent} size="xs" />
                    {p.name}
                  </span>
                  {level ? (
                    <span className="text-muted">
                      <strong className="text-ink">{LEVEL_LABEL[level]}</strong> · {LEVEL_HELP[level].toLowerCase()}
                    </span>
                  ) : (
                    <span className="text-muted">No access</span>
                  )}
                </li>
              );
            })}
        </ul>
      </section>

      <AccountPassword isOwner={user.isOwner} required={user.mustChangePassword} />
    </div>
  );
}
