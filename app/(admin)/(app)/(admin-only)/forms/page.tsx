import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { formatIST } from "@/lib/format";
import { listFormStatus } from "@/lib/form-status";
import { getProject } from "@/lib/projects";
import FormsManager from "@/components/FormsManager";

export const metadata: Metadata = { title: "Forms" };

export default async function FormsPage() {
  await requireAdmin();
  const statuses = await listFormStatus();
  return (
    <div className="mx-auto max-w-4xl">
      <FormsManager
        forms={statuses.map((s) => {
          const p = getProject(s.project)!;
          return {
            id: s.project,
            name: p.name,
            accent: p.accent,
            open: s.open,
            title: s.customTitle,
            message: s.customMessage,
            updatedBy: s.updatedBy,
            updatedAt: s.updatedAt ? formatIST(s.updatedAt) : null,
          };
        })}
      />
    </div>
  );
}
