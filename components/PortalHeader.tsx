import PortalIcon from "@/components/PortalIcon";
import PortalTabs from "@/components/PortalTabs";
import { tabCounts } from "@/lib/insights";
import type { Project } from "@/lib/projects";

/** Portal name, a one-line summary, optional actions on the right, and the portal's tabs underneath. */
export default async function PortalHeader({ project, title, sub, actions }: { project: Project; title?: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  const counts = project.analysis ? await tabCounts(project) : undefined;
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <PortalIcon id={project.id} accent={project.accent} size="lg" />
          <div className="min-w-0">
            <h1 className="page-title truncate">
              {project.name}
              {title && <span className="font-normal text-muted"> · {title}</span>}
            </h1>
            {sub && <p className="mt-0.5 text-[0.8125rem] text-muted">{sub}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <PortalTabs projectId={project.id} analysis={Boolean(project.analysis)} counts={counts} />
    </header>
  );
}
