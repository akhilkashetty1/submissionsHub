import { cn } from "@/lib/utils";

/** A pulsing placeholder block. */
export default function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-[#ececef]", className)} />;
}
