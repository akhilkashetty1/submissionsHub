"use server";

import { authorise } from "@/lib/access";
import { cleanView, resetView, saveView } from "@/lib/views";
import type { Result } from "@/app/record-actions";

/** Remember this person's columns and widths for a portal. Anyone with access to it can have their own layout. */
export async function saveViewAction(projectId: string, columns: string[], widths: Record<string, number>): Promise<Result> {
  const auth = await authorise(projectId, "read");
  if (!auth.ok) return auth;
  const v = cleanView(columns, widths);
  if (!v.columns.length) return { ok: false, error: "Keep at least one column." };
  try {
    await saveView(auth.user.id, auth.project.id, v.columns, v.widths);
    return { ok: true };
  } catch (err) {
    console.error("saveView failed", err);
    return { ok: false, error: "Couldn't save your columns. Try again." };
  }
}

/** Back to the portal's default columns and widths. */
export async function resetViewAction(projectId: string): Promise<Result> {
  const auth = await authorise(projectId, "read");
  if (!auth.ok) return auth;
  await resetView(auth.user.id, auth.project.id);
  return { ok: true };
}
