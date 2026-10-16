"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquarePlus, Trash2 } from "lucide-react";
import { createNote, removeNote } from "@/app/record-actions";
import { formatIST } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NoteView = { id: string; authorId: string | null; authorName: string; body: string; at: string };

const MAX = 2000;

/** Notes on one record, newest first. Anyone who can write can add; the author or a manager can delete. */
export default function NotesPanel({
  projectId,
  submissionId,
  initial,
  canWrite,
  canManage,
  userId,
}: {
  projectId: string;
  submissionId: string;
  initial: NoteView[];
  canWrite: boolean;
  canManage: boolean;
  userId: number;
}) {
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const add = () => {
    if (!text.trim() || pending) return;
    setError(null);
    start(async () => {
      const res = await createNote(projectId, submissionId, text);
      if (!res.ok) return setError(res.error);
      const n = res.note;
      setNotes((prev) => [{ id: n.id, authorId: n.author_id, authorName: n.author_name, body: n.body, at: formatIST(n.created_at) }, ...prev]);
      setText("");
    });
  };

  const remove = (id: string) => {
    setError(null);
    start(async () => {
      const res = await removeNote(projectId, id);
      if (!res.ok) return setError(res.error);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setConfirmId(null);
    });
  };

  return (
    <section className="rounded-2xl border border-line bg-paper shadow-sm" aria-labelledby="notes-h">
      <h2 id="notes-h" className="flex items-center justify-between border-b border-line px-5 py-3.5 font-semibold">
        Notes
        <span className="rounded-full bg-paper-2 px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted">{notes.length}</span>
      </h2>

      {canWrite && (
        <div className="border-b border-line p-4">
          <label htmlFor="new-note" className="sr-only">
            Add a note
          </label>
          <textarea
            id="new-note"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add();
            }}
            maxLength={MAX}
            rows={3}
            placeholder="Write a note: what you checked, who you spoke to, what happens next…"
            className="w-full resize-y rounded-lg border border-line bg-paper-2 px-3 py-2.5 text-sm outline-none focus:border-ink focus:bg-white"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-muted">
              {text.length}/{MAX} · Ctrl/⌘ + Enter to add
            </span>
            <button
              type="button"
              onClick={add}
              disabled={!text.trim() || pending}
              className="flex items-center gap-2 rounded-lg bg-night px-4 py-2 text-sm font-semibold text-white transition hover:bg-night-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending && !confirmId ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
              Add note
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mx-4 mt-4 rounded-lg bg-flag-wash px-3 py-2 text-sm font-medium text-flag">
          {error}
        </p>
      )}

      {notes.length ? (
        <ul className="divide-y divide-line">
          {notes.map((n) => {
            const mine = n.authorId !== null && Number(n.authorId) === userId && userId !== 0;
            const deletable = canWrite && (mine || canManage);
            return (
              <li key={n.id} className="px-5 py-3.5">
                <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
                  <span>
                    <strong className="font-semibold text-ink">{n.authorName}</strong> · {n.at}
                  </span>
                  {deletable &&
                    (confirmId === n.id ? (
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={() => remove(n.id)} disabled={pending} className="font-semibold text-flag hover:underline disabled:opacity-60">
                          {pending ? "Deleting…" : "Delete"}
                        </button>
                        <button type="button" onClick={() => setConfirmId(null)} className="hover:text-ink">
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(n.id)} aria-label="Delete note" className={cn("rounded p-1 hover:bg-flag-wash hover:text-flag")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ))}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{n.body}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted">{canWrite ? "No notes yet. Add the first one above." : "No notes on this record."}</p>
      )}
    </section>
  );
}
