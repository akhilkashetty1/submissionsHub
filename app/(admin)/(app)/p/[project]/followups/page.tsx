import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProjectAccess } from "@/lib/auth";
import { formatIST } from "@/lib/format";
import { followupBoard } from "@/lib/insights";
import { can, levelFor } from "@/lib/permissions";
import { getProject } from "@/lib/projects";
import { listUsers } from "@/lib/users";
import PortalHeader from "@/components/PortalHeader";
import FollowupBoard from "@/components/FollowupBoard";

type Props = { params: Promise<{ project: string }>; searchParams: Promise<{ days?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `${getProject((await params).project)?.short ?? "Portal"} follow-ups` };
}

const PERIODS = [30, 90, 180, 365];

export default async function FollowupsPage({ params, searchParams }: Props) {
  const { user, project } = await requireProjectAccess((await params).project, "read");
  if (!project.analysis) notFound();
  const sp = await searchParams;
  const days = PERIODS.includes(Number(sp.days)) ? Number(sp.days) : 180;
  const [items, users] = await Promise.all([followupBoard(project, days), listUsers()]);
  // People who can work on this portal, as suggestions for "who's on it"
  const owners = [
    ...new Set([
      user.displayName,
      ...users
        .filter((u) => u.active && (u.isAdmin || ["write", "manage"].includes(String(levelFor(u, project.id)))))
        .map((u) => u.displayName),
    ]),
  ];

  return (
    <div className="mx-auto max-w-[96rem] space-y-5">
      <PortalHeader project={project} title="Follow-ups" sub="Every failed check, until someone marks it fixed. Drag a card, or open it to assign it and note what was done." />
      <FollowupBoard
        projectId={project.id}
        canWrite={can(user, project.id, "write")}
        me={user.displayName}
        owners={owners}
        days={days}
        periods={PERIODS}
        items={items.map((i) => ({
          ...i,
          at: formatIST(i.at),
          atMs: i.at.getTime(),
          updatedAt: i.updatedAt ? formatIST(i.updatedAt) : null,
        }))}
      />
    </div>
  );
}
