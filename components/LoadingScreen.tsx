"use client";

import { useEffect } from "react";
import { endNav, startNav } from "@/lib/nav-state";

/**
 * Wrapper for a skeleton screen. While it is on screen the page is still waiting for
 * data, so the top progress bar keeps running; it finishes when the real page replaces
 * this. Also announces "loading" once to screen readers.
 */
export default function LoadingScreen({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  useEffect(() => {
    startNav();
    return endNav;
  }, []);
  return (
    <div role="status" aria-live="polite" aria-busy className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
