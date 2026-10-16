"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";
import { logout } from "@/app/actions";

function Button({ className, labelClassName }: { className?: string; labelClassName?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={className} title="Sign out" aria-label="Sign out">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      <span className={labelClassName}>{pending ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

export default function SignOutButton({ className, formClassName, labelClassName }: { className?: string; formClassName?: string; labelClassName?: string }) {
  return (
    <form action={logout} className={formClassName}>
      <Button className={className} labelClassName={labelClassName} />
    </form>
  );
}
