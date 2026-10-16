"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void }>({ collapsed: false, toggle: () => {} });
export const useSidebar = () => useContext(SidebarContext);

/**
 * The page frame: menu on the left (a slim icon rail when collapsed, so wide tables get the room),
 * content on the right. Press [ to toggle. It starts open; a collapse lasts until the browser is closed.
 * Phones always use the top bar, so this only affects large screens.
 */
export default function AppShell({ initialCollapsed, children }: { initialCollapsed: boolean; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; samesite=lax`; // session cookie: no max-age
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // don't steal typing
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <div
        data-collapsed={collapsed}
        className={cn(
          "group/side min-h-dvh lg:grid lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out",
          collapsed ? "lg:grid-cols-[4rem_1fr]" : "lg:grid-cols-[16.5rem_1fr]",
        )}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
