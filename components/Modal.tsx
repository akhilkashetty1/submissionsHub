"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** A dialog on the browser's native <dialog> (focus trap, Escape to close). Mount it to open it. */
export default function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "m-auto max-h-[92dvh] w-[min(94vw,var(--w))] overflow-y-auto rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-night/60 backdrop:backdrop-blur-[2px]",
      )}
      style={{ "--w": wide ? "40rem" : "28rem" } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-paper-2 hover:text-ink">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}
