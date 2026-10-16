"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteSubmissions } from "@/app/actions";
import ConfirmDialog from "@/components/ConfirmDialog";
import { startNav } from "@/lib/nav-state";

/** Delete this one submission, then go back to the list. */
export default function DeleteSubmissionButton({ projectId, id, title }: { projectId: string; id: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirm = () => {
    setError(null);
    start(async () => {
      const res = await deleteSubmissions(projectId, [id]);
      if (!res.ok) return setError(res.error);
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
        className="btn btn-secondary text-flag hover:border-[#f0c4c7] hover:bg-flag-wash"
      >
        <Trash2 className="h-4 w-4" /> Delete
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
