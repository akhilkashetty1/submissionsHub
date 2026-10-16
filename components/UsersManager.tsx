"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Loader2, Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { createUserAction, deleteUserAction, resetPasswordAction, updateUserAction } from "@/app/user-actions";
import ConfirmDialog from "@/components/ConfirmDialog";
import Modal from "@/components/Modal";
import PortalIcon from "@/components/PortalIcon";
import { LEVELS, LEVEL_HELP, LEVEL_LABEL, type Level } from "@/lib/permissions";
import { PROJECTS } from "@/lib/projects";
import { cn } from "@/lib/utils";

export type UserRow = {
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  active: boolean;
  mustChange: boolean;
  lastLogin: string | null;
  createdBy: string | null;
  access: Record<string, Level>;
};

type Credentials = { heading: string; name: string; username: string; password: string };

const input = "field";

export default function UsersManager({ users, ownerName }: { users: UserRow[]; ownerName: string }) {
  const router = useRouter();
  const [editor, setEditor] = useState<{ user: UserRow | null } | null>(null);
  const [reset, setReset] = useState<UserRow | null>(null);
  const [removing, setRemoving] = useState<UserRow | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">People &amp; access</h1>
          <p className="page-sub">Choose who can open each portal, and what they can do there. Changes apply the next time they load a page.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ user: null })}
          className="btn btn-primary"
        >
          <UserPlus className="h-4 w-4" /> Add person
        </button>
      </div>

      <section className="card overflow-hidden" aria-label="What each level can do">
        <div className="grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {LEVELS.map((l, i) => (
            <div key={l} className="flex items-start gap-3 p-4">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-paper-2 text-[0.6875rem] font-semibold text-ink-soft ring-1 ring-line">{i + 1}</span>
              <div>
                <p className="text-[0.8125rem] font-semibold">{LEVEL_LABEL[l]}</p>
                <p className="mt-0.5 text-xs text-muted">{LEVEL_HELP[l]}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="flex items-center gap-2 border-t border-line-soft bg-[#fafafa] px-4 py-2.5 text-xs text-muted">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
          <span>
            <strong className="font-medium text-ink">Admins</strong> have Manager on every portal and also manage people here and see the activity log.
          </span>
        </p>
      </section>

      <div className="card overflow-hidden">
        <ul className="divide-y divide-line-soft">
          <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
            <Avatar name={ownerName} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[0.8125rem] font-medium">
                {ownerName} <span className="rounded-md bg-night px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-brand">Owner</span>
              </p>
              <p className="text-xs text-muted">Always an admin on every portal. Sign-in is set in the Vercel environment settings, so it can&rsquo;t be locked out from here.</p>
            </div>
          </li>

          {users.map((u) => (
            <li key={u.id} className={cn("group/user flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3.5 transition-colors hover:bg-[#fafafa]", !u.active && "bg-paper-2/60")}>
              <Avatar name={u.displayName} muted={!u.active} />
              <div className="min-w-[12rem] flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium">
                  <span className={cn(!u.active && "text-muted")}>{u.displayName}</span>
                  {u.isAdmin && (
                    <span className="flex items-center gap-1 rounded-md bg-night px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-brand">
                      <ShieldCheck className="h-3 w-3" /> Admin
                    </span>
                  )}
                  {!u.active && <span className="rounded-md bg-flag-wash px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-flag ring-1 ring-[#f6d4d6]">Disabled</span>}
                  {u.active && u.mustChange && <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">Hasn&rsquo;t set own password yet</span>}
                </p>
                <p className="text-xs text-muted">
                  @{u.username} · {u.lastLogin ? `last signed in ${u.lastLogin}` : "never signed in"}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {u.isAdmin ? (
                  <span className="chip">All portals · Manager</span>
                ) : PROJECTS.some((p) => u.access[p.id]) ? (
                  PROJECTS.filter((p) => u.access[p.id]).map((p) => (
                    <span key={p.id} className="chip">
                      <PortalIcon id={p.id} accent={p.accent} size="xs" />
                      {p.short} · <strong className="font-semibold text-ink">{LEVEL_LABEL[u.access[p.id]]}</strong>
                    </span>
                  ))
                ) : (
                  <span className="chip text-flag" style={{ background: "var(--color-flag-wash)", boxShadow: "inset 0 0 0 1px #f6d4d6" }}>No access</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <IconButton label="Edit access" onClick={() => setEditor({ user: u })}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
                <IconButton label="Reset password" onClick={() => setReset(u)}>
                  <KeyRound className="h-4 w-4" />
                </IconButton>
                <IconButton label="Delete person" danger onClick={() => setRemoving(u)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
        {!users.length && <p className="border-t border-line-soft px-5 py-10 text-center text-[0.8125rem] text-muted">No one else yet. Add the first person with the button above.</p>}
      </div>

      {editor && (
        <UserEditor
          key={editor.user?.id ?? "new"}
          user={editor.user}
          onClose={() => setEditor(null)}
          onCreated={(c) => {
            setEditor(null);
            setCredentials(c);
          }}
        />
      )}
      {reset && (
        <ResetPassword
          user={reset}
          onClose={() => setReset(null)}
          onDone={(c) => {
            setReset(null);
            setCredentials(c);
          }}
        />
      )}
      {removing && <RemoveUser user={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); router.refresh(); }} />}
      {credentials && <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />}
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

function Avatar({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-[0.8125rem] font-semibold ring-2 ring-paper", muted ? "bg-line text-muted" : "bg-gradient-to-br from-[#2a2c33] to-night text-white")}>
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn("grid h-8 w-8 place-items-center rounded-lg text-muted transition hover:bg-paper-2", danger ? "hover:bg-flag-wash hover:text-flag" : "hover:text-ink")}
    >
      {children}
    </button>
  );
}

function UserEditor({ user, onClose, onCreated }: { user: UserRow | null; onClose: () => void; onCreated: (c: Credentials) => void }) {
  const router = useRouter();
  const editing = Boolean(user);
  const [username, setUsername] = useState(user?.username ?? "");
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(user?.isAdmin ?? false);
  const [active, setActive] = useState(user?.active ?? true);
  const [access, setAccess] = useState<Record<string, string>>(user?.access ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      if (user) {
        const res = await updateUserAction(user.id, { displayName, isAdmin, active, access });
        if (!res.ok) return setError(res.error);
        router.refresh();
        onClose();
      } else {
        const res = await createUserAction({ username, displayName, password, isAdmin, access });
        if (!res.ok) return setError(res.error);
        router.refresh();
        onCreated({ heading: "Person added", name: displayName.trim() || res.username, username: res.username, password: res.password });
      }
    });
  };

  return (
    <Modal title={editing ? `Edit ${user!.displayName}` : "Add a person"} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="label">Name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder="e.g. Priya Sharma" className={input} />
          </label>
          <label className="block text-sm">
            <span className="label">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              disabled={editing}
              required={!editing}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. priya"
              className={cn(input, editing && "cursor-not-allowed opacity-60")}
            />
          </label>
        </div>

        {!editing && (
          <label className="block text-sm">
            <span className="label">
              Password <span className="font-normal text-muted">(optional)</span>
            </span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" placeholder="Leave blank and we'll make one for you" className={input} />
            <span className="mt-1 block text-xs text-muted">They&rsquo;ll be asked to choose their own the first time they sign in.</span>
          </label>
        )}

        <fieldset>
          <legend className="label mb-2">Access</legend>
          <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-[#fafafa] p-3.5 text-[0.8125rem] transition hover:border-line-strong has-[:checked]:border-ink/25 has-[:checked]:bg-paper-2">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              <strong className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Admin
              </strong>
              <span className="text-xs text-muted">Manager on every portal, and can add people and see the activity log.</span>
            </span>
          </label>
          <div className={cn("divide-y divide-line-soft overflow-hidden rounded-xl border border-line", isAdmin && "pointer-events-none opacity-45")}>
            {PROJECTS.map((p) => (
              <label key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-[0.8125rem]">
                <span className="flex items-center gap-2 font-medium">
                  <PortalIcon id={p.id} accent={p.accent} size="xs" />
                  {p.name}
                </span>
                <select
                  value={isAdmin ? "manage" : (access[p.id] ?? "")}
                  onChange={(e) => setAccess((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  disabled={isAdmin}
                  aria-label={`Access to ${p.name}`}
                  className="field h-8 w-auto text-xs"
                >
                  <option value="">No access</option>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABEL[l]}: {LEVEL_HELP[l].toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>

        {editing && (
          <label className="flex cursor-pointer items-start gap-3 text-[0.8125rem]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              <strong>Account active</strong>
              <span className="block text-xs text-muted">Untick to stop them signing in. Their notes stay.</span>
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-flag-wash px-3 py-2 text-[0.8125rem] font-medium text-flag ring-1 ring-[#f6d4d6]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Add person"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: (c: Credentials) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await resetPasswordAction(user.id, password);
      if (!res.ok) return setError(res.error);
      onDone({ heading: "New password", name: user.displayName, username: user.username, password: res.password });
    });
  };

  return (
    <Modal title={`Reset password for ${user.displayName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-[0.8125rem]">
        <p className="text-ink-soft">
          They&rsquo;ll be signed out everywhere and asked to choose their own password next time they sign in.
        </p>
        <label className="block">
          <span className="label">
            New password <span className="font-normal text-muted">(optional)</span>
          </span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" placeholder="Leave blank and we'll make one for you" className={input} />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-flag-wash px-3 py-2 font-medium text-flag ring-1 ring-[#f6d4d6]">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Reset password
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RemoveUser({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <ConfirmDialog
      open
      title={`Delete ${user.displayName}?`}
      confirmLabel="Delete person"
      pending={pending}
      error={error}
      onCancel={onClose}
      onConfirm={() =>
        start(async () => {
          const res = await deleteUserAction(user.id);
          if (!res.ok) return setError(res.error);
          onDone();
        })
      }
    >
      <p>
        <strong className="text-ink">@{user.username}</strong> will no longer be able to sign in. Notes they wrote stay on the records, still showing their name.
      </p>
      <p>To keep the account but stop access, edit them and untick &ldquo;Account active&rdquo; instead.</p>
    </ConfirmDialog>
  );
}

function CredentialsDialog({ credentials: c, onClose }: { credentials: Credentials; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const url = typeof window === "undefined" ? "" : window.location.origin;

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {}
  };
  const all = `Submissions Hub\n${url}\nUsername: ${c.username}\nPassword: ${c.password}\n(You'll choose your own password the first time you sign in.)`;

  return (
    <Modal title={c.heading} onClose={onClose}>
      <div className="space-y-4 text-[0.8125rem]">
        <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-amber-900 ring-1 ring-amber-200">
          <strong>Share this with {c.name} now.</strong> For safety the password is shown only this once and can&rsquo;t be looked up later (you can always reset it).
        </p>
        <dl className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line">
          {[
            ["Address", url],
            ["Username", c.username],
            ["Password", c.password],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt className="text-muted">{label}</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <code className="truncate rounded-md bg-paper-2 px-2 py-1 font-mono text-[0.8rem] ring-1 ring-line-soft">{value}</code>
                <button type="button" onClick={() => copy(label, value)} aria-label={`Copy ${label}`} className="rounded-md p-1 text-muted transition hover:bg-paper-2 hover:text-ink">
                  {copied === label ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
                </button>
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex justify-between gap-2">
          <button type="button" onClick={() => copy("all", all)} className="btn btn-secondary">
            {copied === "all" ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />} Copy all
          </button>
          <button type="button" onClick={onClose} className="btn btn-primary">
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
