"use client";

import { useActionState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { login, type LoginState } from "@/app/actions";

const input =
  "w-full rounded-lg border border-night-line bg-night-2 px-3.5 py-2.5 text-white outline-none transition-colors placeholder:text-[#5b616d] focus:border-brand";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-night-line bg-[#13161c] p-6 shadow-2xl">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-[#c9ced8]">
          Username
        </label>
        <input id="username" name="username" autoComplete="username" required className={input} />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-[#c9ced8]">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-flag/15 px-3 py-2 text-sm text-[#ff8a8f]">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-night transition hover:brightness-105 disabled:opacity-70"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        Sign in
      </button>
    </form>
  );
}
