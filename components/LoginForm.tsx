"use client";

import { useActionState } from "react";
import { Loader2, LockKeyhole } from "lucide-react";
import { login, type LoginState } from "@/app/actions";

const input = "field h-10 text-sm";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="username" className="label">
          Username
        </label>
        <input id="username" name="username" autoComplete="username" required className={input} />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg bg-flag-wash px-3 py-2 text-[0.8125rem] font-medium text-flag ring-1 ring-[#f6d4d6]">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary h-10 w-full text-sm"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        Sign in
      </button>
    </form>
  );
}
