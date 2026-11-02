import "server-only";
import { query } from "@/lib/db";
import { DEFAULT_CLOSED, FORM_IDS, type FormId } from "@/lib/form-status-defaults";

export type FormStatus = {
  project: FormId;
  open: boolean;
  /** What the closed screen says: the admin's words, or the standard ones when they left it blank. */
  title: string;
  message: string;
  /** What the admin typed, blank if nothing (the page shows the standard words as a hint, not as text). */
  customTitle: string;
  customMessage: string;
  updatedBy: string | null;
  updatedAt: Date | null;
};

type Row = { project: string; open: boolean; title: string; message: string; updated_by: string | null; updated_at: Date };

const toStatus = (project: FormId, row?: Row): FormStatus => ({
  project,
  open: row?.open ?? true,
  title: row?.title.trim() || DEFAULT_CLOSED.title,
  message: row?.message.trim() || DEFAULT_CLOSED.message,
  customTitle: row?.title ?? "",
  customMessage: row?.message ?? "",
  updatedBy: row?.updated_by ?? null,
  updatedAt: row?.updated_at ?? null,
});

export async function getFormStatus(project: FormId): Promise<FormStatus> {
  const rows = await query<Row>(`select project, open, title, message, updated_by, updated_at from form_status where project = $1`, [project]);
  return toStatus(project, rows[0]);
}

export async function listFormStatus(): Promise<FormStatus[]> {
  const rows = await query<Row>(`select project, open, title, message, updated_by, updated_at from form_status`);
  return FORM_IDS.map((id) => toStatus(id, rows.find((r) => r.project === id)));
}

/** Change whichever of open / title / message is given; the rest stay as they are. */
export async function saveFormStatus(project: FormId, patch: { open?: boolean; title?: string; message?: string }, by: string) {
  await query(
    `insert into form_status (project, open, title, message, updated_by, updated_at)
     values ($1, coalesce($2::boolean, true), coalesce($3::text, ''), coalesce($4::text, ''), $5, now())
     on conflict (project) do update set
       open = coalesce($2::boolean, form_status.open),
       title = coalesce($3::text, form_status.title),
       message = coalesce($4::text, form_status.message),
       updated_by = $5,
       updated_at = now()`,
    [project, patch.open ?? null, patch.title ?? null, patch.message ?? null, by],
  );
  return getFormStatus(project);
}
