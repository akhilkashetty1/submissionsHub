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
      className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-night/60 backdrop:backdrop-blur-[2px]"
    >
      <div className="p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-flag-wash text-flag">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            <div className="mt-1.5 space-y-2 text-sm text-ink-soft">{children}</div>
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
              className="w-full rounded-lg border border-line bg-paper-2 px-3 py-2 font-mono outline-none focus:border-flag"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-flag-wash px-3 py-2 text-sm font-medium text-flag">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            autoFocus
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-ink disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready || pending}
            className="flex items-center gap-2 rounded-lg bg-flag px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
