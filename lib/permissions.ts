import { PROJECTS, type Project } from "@/lib/projects";

/**
 * Who can do what. Access is set per person, per portal:
 *
 *   read    Viewer       open and search records, export to Excel
 *   write   Contributor  + add notes and highlight records
 *   manage  Manager      + delete records
 *
 * An admin has Manager on every portal and also manages users. No access
 * means the portal is invisible to that person: not in the menu, and its
 * addresses answer "not found".
 *
 * Plain data and functions only, so both server and browser code can share it.
 */

export type Level = "read" | "write" | "manage";

export const LEVELS: Level[] = ["read", "write", "manage"];

export const LEVEL_LABEL: Record<Level, string> = {
  read: "Viewer",
  write: "Contributor",
  manage: "Manager",
};

export const LEVEL_HELP: Record<Level, string> = {
  read: "Can open, search and export records",
  write: "Also adds notes and highlights records",
  manage: "Also deletes records",
};

const RANK: Record<Level, number> = { read: 1, write: 2, manage: 3 };

export const isLevel = (v: unknown): v is Level => v === "read" || v === "write" || v === "manage";

export type AppUser = {
  /** 0 for the owner account that lives in the environment settings. */
  id: number;
  username: string;
  displayName: string;
  isAdmin: boolean;
  /** The environment-settings account: always an admin, can't be disabled or edited here. */
  isOwner: boolean;
  access: Record<string, Level>;
  mustChangePassword: boolean;
};

export function levelFor(user: Pick<AppUser, "isAdmin" | "access">, projectId: string): Level | null {
  if (user.isAdmin) return "manage";
  return user.access[projectId] ?? null;
}

export function can(user: Pick<AppUser, "isAdmin" | "access">, projectId: string, need: Level): boolean {
  const have = levelFor(user, projectId);
  return have !== null && RANK[have] >= RANK[need];
}

export function visibleProjects(user: Pick<AppUser, "isAdmin" | "access">): Project[] {
  return PROJECTS.filter((p) => levelFor(user, p.id) !== null);
}
