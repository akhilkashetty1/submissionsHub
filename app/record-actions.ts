"use server";

import { authorise } from "@/lib/access";
import { isMark } from "@/lib/marks";
import { can } from "@/lib/permissions";
import { MAX_NOTE, addNote, deleteNoteById, getNote, setCellMark, setMarkByIds, setMarkMatching, type Filters, type Note } from "@/lib/submissions";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const parseMark = (mark: unknown) => (mark === null || mark === "" ? null : isMark(mark) ? mark : undefined);

/** Highlight (or clear, with null) the chosen records. Needs Contributor. */
export async function setMark(projectId: string, ids: string[], mark: string | null): Promise<Result<{ changed: number }>> {
  const auth = await authorise(projectId, "write");
  if (!auth.ok) return auth;
  const m = parseMark(mark);
  if (m === undefined) return { ok: false, error: "Unknown colour." };
  if (!Array.isArray(ids) || !ids.length) return { ok: false, error: "Nothing selected." };
  try {
    return { ok: true, changed: await setMarkByIds(auth.project.id, ids.map(String), m, auth.user.displayName) };
  } catch (err) {
    console.error("setMark failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}

/** Highlight everything matching the current filters, across all pages. */
export async function setMarkForAllMatching(projectId: string, filters: Filters, mark: string | null): Promise<Result<{ changed: number }>> {
  const auth = await authorise(projectId, "write");
  if (!auth.ok) return auth;
  const m = parseMark(mark);
  if (m === undefined) return { ok: false, error: "Unknown colour." };
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  try {
    return {
      ok: true,
      changed: await setMarkMatching(auth.project.id, { q: s(filters?.q), from: s(filters?.from), to: s(filters?.to), mark: s(filters?.mark), notes: s(filters?.notes) }, m, auth.user.displayName),
    };
  } catch (err) {
    console.error("setMarkForAllMatching failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}

/** Add a note to a record. Needs Contributor. */
export async function createNote(projectId: string, submissionId: string, body: string): Promise<Result<{ note: Note }>> {
  const auth = await authorise(projectId, "write");
  if (!auth.ok) return auth;
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > MAX_NOTE) return { ok: false, error: `Notes can be up to ${MAX_NOTE} characters.` };
  try {
    const note = await addNote(auth.project.id, String(submissionId), auth.user.id, auth.user.displayName, text);
    if (!note) return { ok: false, error: "That record no longer exists." };
    return { ok: true, note };
  } catch (err) {
    console.error("createNote failed", err);
    return { ok: false, error: "Could not save the note. Try again." };
  }
}

/** Delete a note: its author can, and so can a Manager of that portal. */
export async function removeNote(projectId: string, noteId: string): Promise<Result> {
  const auth = await authorise(projectId, "write");
  if (!auth.ok) return auth;
  const note = await getNote(auth.project.id, String(noteId));
  if (!note) return { ok: false, error: "That note no longer exists." };
  const mine = note.author_id !== null && Number(note.author_id) === auth.user.id && auth.user.id !== 0;
  if (!mine && !can(auth.user, auth.project.id, "manage")) return { ok: false, error: "Only the author or a manager can delete this note." };
  await deleteNoteById(note.id);
  return { ok: true };
}

/** Colour a single value of a record (or clear it with null). Needs Contributor. */
export async function setCellMarkAction(projectId: string, submissionId: string, col: string, mark: string | null): Promise<Result> {
  const auth = await authorise(projectId, "write");
  if (!auth.ok) return auth;
  const m = parseMark(mark);
  if (m === undefined) return { ok: false, error: "Unknown colour." };
  try {
    const done = await setCellMark(auth.project.id, String(submissionId), String(col), m, auth.user.displayName);
    return done ? { ok: true } : { ok: false, error: "That value no longer exists." };
  } catch (err) {
    console.error("setCellMark failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}
