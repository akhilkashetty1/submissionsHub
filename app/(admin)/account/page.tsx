import type { Metadata } from "next";
import { KeyRound, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LEVEL_HELP, LEVEL_LABEL, levelFor } from "@/lib/permissions";
import { PROJECTS } from "@/lib/projects";
import AccountPassword from "@/components/AccountPassword";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser({ allowMustChange: true });
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-1 text-sm text-muted">
          {user.displayName} · @{user.username}
        </p>
      </header>

      {user.mustChangePassword && (
        <p role="status" className="flex items-start gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Choose your own password to continue.</strong> The one you were given is temporary. After this you can open the portals you have access to.
          </span>
        </p>
      )}

      <section className="rounded-2xl border border-line bg-paper shadow-sm">
        <h2 className="border-b border-line px-5 py-3.5 font-semibold">Your access</h2>
        <ul className="divide-y divide-line">
          {user.isAdmin && (
            <li className="flex items-center gap-2 px-5 py-3 text-sm">
              <ShieldCheck className="h-4 w-4" /> <strong>Admin</strong>
              <span className="text-muted">All portals as Manager, plus people and the activity log</span>
            </li>
          )}
          {!user.isAdmin &&
            PROJECTS.map((p) => {
              const level = levelFor(user, p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.accent }} />
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
