"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";
import { logout } from "@/app/actions";

function Button({ className }: { className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={className}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

export default function SignOutButton({ className, formClassName }: { className?: string; formClassName?: string }) {
  return (
    <form action={logout} className={formClassName}>
      <Button className={className} />
    </form>
  );
}
