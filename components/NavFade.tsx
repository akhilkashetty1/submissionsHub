"use client";

import { useNavPending } from "@/lib/nav-state";
import { cn } from "@/lib/utils";

/** Dims its content while a navigation is loading, so searching or changing page visibly "takes". */
export default function NavFade({ children, className }: { children: React.ReactNode; className?: string }) {
  const pending = useNavPending();
  return (
    <div aria-busy={pending} className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-50", className)}>
      {children}
    </div>
  );
}
