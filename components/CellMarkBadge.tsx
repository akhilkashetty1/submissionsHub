"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { setCellMarkAction } from "@/app/record-actions";
import { markById } from "@/lib/marks";

/** The colour label on one value of a record. People who can write get a ✕ to remove it. */
export default function CellMarkBadge({ projectId, submissionId, col, mark, canWrite }: { projectId: string; submissionId: string; col: string; mark: string; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const m = markById(mark);
  if (!m) return null;

  const clear = () => {
    setError(null);
    start(async () => {
      const res = await setCellMarkAction(projectId, submissionId, col, null);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  };

  return (
    <span className="ml-2 inline-flex items-center gap-1 align-middle">
      <span className="inline-flex items-center gap-0.5 rounded-full py-0.5 pl-2 pr-0.5 text-[0.65rem] font-semibold text-white" style={{ backgroundColor: m.dot }}>
        {m.label}
        {canWrite ? (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            title="Remove this value's colour"
            aria-label={`Remove the ${m.label} colour from ${col}`}
            className="grid h-4 w-4 place-items-center rounded-full transition hover:bg-black/20 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" strokeWidth={3} />}
          </button>
        ) : (
          <span className="w-1.5" />
        )}
      </span>
      {error && (
        <span role="alert" className="text-[0.65rem] font-medium text-flag">
          {error}
        </span>
      )}
    </span>
  );
}
