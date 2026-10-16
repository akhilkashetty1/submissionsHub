"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { changePasswordAction } from "@/app/user-actions";

const input = "field";

/** Change your own password. The owner's lives in the Vercel settings, so they get a pointer instead. */
export default function AccountPassword({ isOwner, required }: { isOwner: boolean; required: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (isOwner) {
    return (
      <section className="card p-5 text-[0.8125rem] leading-relaxed text-muted">
        <h2 className="section-title mb-1">Password</h2>
        The owner password is set in the Vercel environment settings (<code className="rounded-md bg-paper-2 px-1.5 py-0.5 font-mono text-xs text-ink-soft ring-1 ring-line-soft">ADMIN_PASSWORD_HASH</code>), so it can&rsquo;t be changed here. Everyone else you add can change theirs on this page.
      </section>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== again) return setError("The two new passwords don't match.");
    start(async () => {
      const res = await changePasswordAction(current, next);
      if (!res.ok) return setError(res.error);
      setCurrent("");
      setNext("");
      setAgain("");
      setDone(true);
      router.push("/");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="card overflow-hidden">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="section-title">{required ? "Choose your password" : "Change password"}</h2>
      </div>
      <div className="space-y-4 p-5">
      <label className="block text-[0.8125rem]">
        <span className="label">{required ? "Temporary password you were given" : "Current password"}</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required className={input} />
      </label>
      <label className="block text-[0.8125rem]">
        <span className="label">New password</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required minLength={10} className={input} />
        <span className="mt-1.5 block text-xs text-muted">At least 10 characters. A few words with a number is easy to remember and hard to guess.</span>
      </label>
      <label className="block text-[0.8125rem]">
        <span className="label">New password again</span>
        <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required className={input} />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-flag-wash px-3 py-2 text-[0.8125rem] font-medium text-flag ring-1 ring-[#f6d4d6]">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="flex items-center gap-2 text-[0.8125rem] font-medium text-ok">
          <CheckCircle2 className="h-4 w-4" /> Password changed.
        </p>
      )}
      </div>
      <div className="flex justify-end border-t border-line-soft bg-[#fafafa] px-5 py-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {required ? "Save and continue" : "Change password"}
        </button>
      </div>
    </form>
  );
}
