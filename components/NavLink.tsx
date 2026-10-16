"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shows a spinner on this item while its page is loading. Must sit inside the <Link>. */
function Spinner() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 aria-label="Loading" className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" /> : null;
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
        "flex h-8 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors lg:group-data-[collapsed=true]/side:mx-auto lg:group-data-[collapsed=true]/side:w-9 lg:group-data-[collapsed=true]/side:justify-center lg:group-data-[collapsed=true]/side:px-0",
        active
          ? "bg-paper text-ink shadow-[0_1px_2px_rgb(16_17_20/0.06)] ring-1 ring-line"
          : "text-ink-soft hover:bg-black/[0.04] hover:text-ink",
      )}
    >
      {children}
      <Spinner />
    </Link>
  );
}
