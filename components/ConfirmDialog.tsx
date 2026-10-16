"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

/**
 * Confirmation for destructive actions, on the browser's native <dialog>
 * (focus trapping, Escape to close). `requireText` makes the person type a
 * word before the confirm button works, used for bulk deletes.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  requireText,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  requireText?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    setTyped("");
  }, [open]);

  const ready = !requireText || typed === requireText;

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-line bg-paper p-0 text-ink shadow-pop"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-flag-wash text-flag ring-1 ring-[#f6d4d6]">
            <Trash2 className="h-[1.1rem] w-[1.1rem]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            <div className="mt-1.5 space-y-2 text-[0.8125rem] leading-relaxed text-ink-soft">{children}</div>
          </div>
        </div>

        {requireText && (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-muted">
              Type <strong className="font-mono text-ink">{requireText}</strong> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="field font-mono focus:border-flag focus:shadow-[0_0_0_3px_rgb(196_32_42/0.12)]"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-flag-wash px-3 py-2 text-[0.8125rem] font-medium text-flag ring-1 ring-[#f6d4d6]">
            {error}
          </p>
        )}

        <div className="-mx-6 -mb-6 mt-6 flex justify-end gap-2 rounded-b-2xl border-t border-line-soft bg-[#fafafa] px-6 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            autoFocus
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready || pending}
            className="btn btn-danger"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
