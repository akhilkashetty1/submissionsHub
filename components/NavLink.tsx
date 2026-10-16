"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shows a spinner on this item while its page is loading. Must sit inside the <Link>. */
function Spinner() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 aria-label="Loading" className="h-3.5 w-3.5 shrink-0 animate-spin text-brand" /> : null;
}

export default function NavLink({ href, exact, title, children }: { href: string; exact?: boolean; title?: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      title={title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors lg:group-data-[collapsed=true]/side:justify-center lg:group-data-[collapsed=true]/side:px-0",
        active ? "bg-night-2 text-white ring-1 ring-night-line" : "hover:bg-night-2/60 hover:text-white",
      )}
    >
      {children}
      <Spinner />
    </Link>
  );
}
