"use server";

import { authoriseAdmin } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { getFormStatus, saveFormStatus, type FormStatus } from "@/lib/form-status";
import { FORM_LIMITS, isFormId } from "@/lib/form-status-defaults";
import type { Result } from "@/app/record-actions";

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : undefined);

/**
 * Open or close a ride-along form, and/or change what people see while it is closed. Admins only.
 * Whatever is left out stays as it was. Blank words mean "use the standard ones".
 */
export async function saveFormStatusAction(input: { project: string; open?: boolean; title?: string; message?: string }): Promise<Result<{ status: FormStatus }>> {
  const auth = await authoriseAdmin();
  if (!auth.ok) return auth;
  if (!isFormId(input?.project)) return { ok: false, error: "Unknown form." };

  const patch = {
    open: typeof input.open === "boolean" ? input.open : undefined,
    title: clean(input.title, FORM_LIMITS.title),
    message: clean(input.message, FORM_LIMITS.message),
  };
  try {
    const before = await getFormStatus(input.project);
    const status = await saveFormStatus(input.project, patch, auth.user.username);
    if (patch.open !== undefined && patch.open !== before.open) {
      await logActivity(auth.user.username, patch.open ? "form.open" : "form.close", input.project);
    }
    if ((patch.title !== undefined && patch.title !== before.customTitle) || (patch.message !== undefined && patch.message !== before.customMessage)) {
      await logActivity(auth.user.username, "form.message", input.project, { title: status.title });
    }
    return { ok: true, status };
  } catch (err) {
    console.error("saveFormStatus failed", err);
    return { ok: false, error: "Could not save. Try again." };
  }
}
