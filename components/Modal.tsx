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
        "m-auto max-h-[92dvh] w-[min(94vw,var(--w))] overflow-y-auto rounded-2xl border border-line bg-paper p-0 text-ink shadow-pop",
      )}
      style={{ "--w": wide ? "40rem" : "28rem" } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1.5 rounded-lg p-1.5 text-muted transition hover:bg-paper-2 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}
