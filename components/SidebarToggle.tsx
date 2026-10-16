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
      className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg text-[#8b919c] transition hover:bg-night-2 hover:text-white lg:grid"
    >
      {collapsed ? <PanelLeftOpen className="h-4.5 w-4.5" /> : <PanelLeftClose className="h-4.5 w-4.5" />}
    </button>
  );
}
