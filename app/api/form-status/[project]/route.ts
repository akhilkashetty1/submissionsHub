import { getFormStatus } from "@/lib/form-status";
import { isFormId } from "@/lib/form-status-defaults";

export const dynamic = "force-dynamic";

/**
 * Is a ride-along form taking submissions? Read by the form itself, so it can show the "closed" screen.
 * Public and read-only on purpose: it holds only what a rider would see anyway (open or closed, and the message).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ project: string }> }) {
  const { project } = await params;
  if (!isFormId(project)) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const { open, title, message } = await getFormStatus(project);
    return Response.json({ open, title, message }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Form status failed", err);
    return Response.json({ error: "Unavailable" }, { status: 503 });
  }
}
