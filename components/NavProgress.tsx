"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { endNav, startNav, subscribeNav } from "@/lib/nav-state";

/**
 * Thin progress bar at the top of the page. It starts on the click itself (not when
 * the server answers), so every navigation feels instant even when the database is
 * waking up. It finishes when the URL changes.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<"idle" | "run" | "finish">("idle");

  // The new page has arrived.
  useEffect(() => {
    endNav();
  }, [pathname, search]);

  useEffect(() => {
    const unsubscribe = subscribeNav((pending) => setPhase((p) => (pending ? "run" : p === "run" ? "finish" : p)));

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page: nothing will change
      startNav();
    };
    document.addEventListener("click", onClick, true);

    return () => {
      unsubscribe();
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      {phase !== "idle" && (
        <div
          className={`h-full bg-brand shadow-[0_0_10px_var(--color-brand)] ${phase === "run" ? "nav-crawl" : "nav-finish"}`}
          onAnimationEnd={() => phase === "finish" && setPhase("idle")}
        />
      )}
    </div>
  );
}

export default function NavProgress() {
  // useSearchParams needs a Suspense boundary
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
