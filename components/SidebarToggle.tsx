"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSidebar } from "@/components/AppShell";

/** Collapse or expand the left menu (large screens). Also bound to the [ key. */
export default function SidebarToggle() {
  const { collapsed, toggle } = useSidebar();
  const label = collapsed ? "Open menu" : "Collapse menu";
  return (
    <button
      type="button"
      onClick={toggle}
      title={`${label} ( [ )`}
      aria-label={label}
      aria-expanded={!collapsed}
      className="hidden h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-paper-2 hover:text-ink lg:grid"
    >
      {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
    </button>
  );
}
