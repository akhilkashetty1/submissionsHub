"use server";

import { authorise } from "@/lib/access";
import { cleanFilters, filtersToParams } from "@/lib/filters";
import {
  FOLLOWUP_STATUSES,
  columnBreakdown,
  createSavedView,
  deleteSavedView,
  getSavedView,
  historyFor,
  mergeNames,
  setFollowup,
  unmergeName,
  type Breakdown,
  type FollowupStatus,
  type History,
  type SavedView,
} from "@/lib/insights";
import { can } from "@/lib/permissions";
import type { Result } from "@/app/record-actions";

/** How a column's values split across the records matching the filters (column menu). Viewer. */
export async function columnBreakdownAction(projectId: string, filters: unknown, col: string): Promise<Result<{ breakdown: Breakdown }>> {
  const auth = await authorise(projectId, "read");
  if (!auth.ok) return auth;
  if (typeof col !== "string" || !col || col.length > 300) return { ok: false, error: "Unknown column." };
  try {
    return { ok: true, breakdown: await columnBreakdown(auth.project, cleanFilters(filters), col) };
  } catch (err) {
    console.error("columnBreakdown failed", err);
    return { ok: false, error: "Could not load. Try again." };
  }
}

/** Other assessments of the same person or vehicle (quick peek). Viewer. */
export async function historyAction(projectId: string, id: string): Promise<Result<{ history: History }>> {
  const auth = await authorise(projectId, "read");
  if (!auth.ok) return auth;
  try {
    return { ok: true, history: await historyFor(auth.project, String(id)) };
  } catch (err) {
    console.error("history failed", err);
    return { ok: false, error: "Could not load. Try again." };
  }
}

/** Move a failed check along the follow-up board, assign it, or note what was done. Contributor. */
export async function setFollowupAction(
  projectId: string,
  submissionId: string,
  header: string,
  patch: { status?: unknown; owner?: unknown; note?: unknown },
): Promise<Result> {
  const auth = await authorise(projectId, "write");
  if (!auth.ok) return auth;
  const clean: { status?: FollowupStatus; owner?: string; note?: string } = {};
  if (patch?.status !== undefined) {
    if (!FOLLOWUP_STATUSES.includes(patch.status as FollowupStatus)) return { ok: false, error: "Unknown status." };
    clean.status = patch.status as FollowupStatus;
  }
  if (patch?.owner !== undefined) clean.owner = String(patch.owner).trim().slice(0, 80);
  if (patch?.note !== undefined) clean.note = String(patch.note).trim().slice(0, 500);
  if (!Object.keys(clean).length) return { ok: false, error: "Nothing to change." };
  try {
    const ok = await setFollowup(auth.project, String(submissionId), String(header), clean, auth.user.displayName);
    return ok ? { ok: true } : { ok: false, error: "That check no longer needs follow-up (the record changed or was deleted)." };
  } catch (err) {
    console.error("setFollowup failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}

/** Show several spellings as one name (Clean-up). Manager. */
export async function mergeNamesAction(projectId: string, field: string, names: string[], into: string): Promise<Result<{ merged: number }>> {
  const auth = await authorise(projectId, "manage");
  if (!auth.ok) return auth;
  if (!Array.isArray(names) || !names.length || typeof into !== "string" || !into.trim()) return { ok: false, error: "Choose the names and the name to keep." };
  try {
    const merged = await mergeNames(auth.project, String(field), names.map(String), into, auth.user.displayName);
    return merged ? { ok: true, merged } : { ok: false, error: "Nothing to merge." };
  } catch (err) {
    console.error("mergeNames failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}

export async function unmergeNameAction(projectId: string, field: string, name: string): Promise<Result> {
  const auth = await authorise(projectId, "manage");
  if (!auth.ok) return auth;
  return (await unmergeName(auth.project, String(field), String(name), auth.user.displayName)) ? { ok: true } : { ok: false, error: "That name isn't merged." };
}

/** Keep only the table's own parameters, cleaned, so a saved view can't carry anything else. */
function cleanViewQuery(raw: string) {
  const p = new URLSearchParams(typeof raw === "string" ? raw.slice(0, 4000) : "");
  const out = filtersToParams(cleanFilters({ q: p.get("q") ?? "", from: p.get("from") ?? "", to: p.get("to") ?? "", mark: p.get("mark") ?? "", notes: p.get("notes") ?? "", f: p.getAll("f") }));
  const sort = p.get("sort");
  if (sort && sort.length <= 300) {
    out.set("sort", sort);
    out.set("dir", p.get("dir") === "desc" ? "desc" : "asc");
  }
  const group = p.get("group");
  if (group && /^[a-z0-9_-]{1,40}$/.test(group)) out.set("group", group);
  return out.toString();
}

/** Save the current filters as a named view everyone with access can use. Viewer and up. */
export async function saveNamedViewAction(projectId: string, name: string, query: string): Promise<Result<{ view: SavedView }>> {
  const auth = await authorise(projectId, "read");
  if (!auth.ok) return auth;
  const n = typeof name === "string" ? name.trim().slice(0, 60) : "";
  if (!n) return { ok: false, error: "Give the view a name." };
  const q = cleanViewQuery(query);
  if (!q) return { ok: false, error: "Set a filter, sort or grouping first: there's nothing to save." };
  try {
    return { ok: true, view: await createSavedView(auth.project.id, n, q, auth.user.id, auth.user.displayName) };
  } catch (err) {
    console.error("saveNamedView failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}

/** Delete a saved view: its creator can, and so can a Manager. */
export async function deleteNamedViewAction(projectId: string, id: string): Promise<Result> {
  const auth = await authorise(projectId, "read");
  if (!auth.ok) return auth;
  const view = await getSavedView(auth.project.id, String(id));
  if (!view) return { ok: false, error: "That view no longer exists." };
  const mine = view.created_by_id !== null && Number(view.created_by_id) === auth.user.id;
  if (!mine && !can(auth.user, auth.project.id, "manage")) return { ok: false, error: "Only whoever saved it, or a Manager, can delete this view." };
  await deleteSavedView(view.id);
  return { ok: true };
}
