import { Bike, CarFront, FileText, ShieldCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** One icon per portal, by id. Anything new falls back to a document. */
const ICONS: Record<string, LucideIcon> = {
  "2w": Bike,
  "4w": CarFront,
  roadshield: ShieldCheck,
};

const SIZES = {
  xs: { tile: "h-[1.125rem] w-[1.125rem] rounded-[0.3rem]", icon: "h-[0.7rem] w-[0.7rem]" },
  sm: { tile: "h-6 w-6 rounded-md", icon: "h-3.5 w-3.5" },
  md: { tile: "h-9 w-9 rounded-lg", icon: "h-[1.1rem] w-[1.1rem]" },
  lg: { tile: "h-10 w-10 rounded-xl", icon: "h-5 w-5" },
} as const;

/**
 * A portal's icon in a tile tinted with its colour. The stroke is a darker shade of the same
 * colour, so it stays readable on the pale yellows as well as the red.
 */
export default function PortalIcon({ id, accent, size = "sm", className }: { id: string; accent: string; size?: keyof typeof SIZES; className?: string }) {
  const Icon = ICONS[id] ?? FileText;
  const s = SIZES[size];
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center", s.tile, className)}
      style={{
        background: `color-mix(in oklab, ${accent} 22%, white)`,
        color: `color-mix(in oklab, ${accent} 42%, #15161a)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 38%, transparent)`,
      }}
    >
      <Icon className={s.icon} strokeWidth={2} />
    </span>
  );
}
