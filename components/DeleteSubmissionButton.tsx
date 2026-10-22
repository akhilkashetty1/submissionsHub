"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteSubmissions } from "@/app/actions";
import ConfirmDialog from "@/components/ConfirmDialog";
import { startNav } from "@/lib/nav-state";

/** Delete this one submission, then go back to the list (or, `compact`, stay on the page and refresh it). */
export default function DeleteSubmissionButton({ projectId, id, title, compact }: { projectId: string; id: string; title: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirm = () => {
    setError(null);
    start(async () => {
      const res = await deleteSubmissions(projectId, [id]);
      if (!res.ok) return setError(res.error);
      if (compact) {
        setOpen(false);
        return router.refresh();
      }
      startNav();
      router.push(`/p/${projectId}`);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        title={compact ? `Delete #${id}` : undefined}
        aria-label={compact ? `Delete submission #${id}` : undefined}
        className={compact ? "grid h-6 w-6 place-items-center rounded-md text-muted transition hover:bg-flag-wash hover:text-flag" : "btn btn-secondary text-flag hover:border-[#f0c4c7] hover:bg-flag-wash"}
      >
        <Trash2 className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> {!compact && "Delete"}
      </button>
      <ConfirmDialog
        open={open}
        title="Permanently delete this submission?"
        confirmLabel="Delete"
        pending={pending}
        error={error}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        <p>
          <strong className="text-ink">{title || `Submission #${id}`}</strong> will be removed from the database. <strong className="text-ink">This can&rsquo;t be undone.</strong>
        </p>
        <p>Want a copy first? Cancel, then use the Excel button.</p>
      </ConfirmDialog>
    </>
  );
}
