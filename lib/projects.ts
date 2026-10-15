/**
 * The projects that send submissions here. Adding a project is one entry
 * plus its ingest credentials in the environment.
 *
 * - `keyEnv`: env var holding the secret the project's server sends as `x-hub-key`.
 * - `originsEnv`: for projects that post straight from the browser (they can't
 *   keep a secret), a comma-separated list of allowed site origins.
 * - `listColumns`: which submitted fields show in the table, by header name.
 */
export type Project = {
  id: string;
  name: string;
  short: string;
  description: string;
  accent: string;
  keyEnv?: string;
  originsEnv?: string;
  titleColumn: string;
  listColumns: string[];
};

export const PROJECTS: Project[] = [
  {
    id: "2w",
    name: "Two Wheeler Ride Along",
    short: "2W",
    description: "ride-along-form.in",
    accent: "#cedb28",
    keyEnv: "INGEST_KEY_2W",
    originsEnv: "INGEST_ORIGINS_2W",
    titleColumn: "Name",
    listColumns: ["Name", "HQ", "Team", "Line Man", "Primary Vehicle Number"],
  },
  {
    id: "4w",
    name: "Four Wheeler Ride Along",
    short: "4W",
    description: "4W ride along form",
    accent: "#dfe22b",
    keyEnv: "INGEST_KEY_4W",
    titleColumn: "Name",
    listColumns: ["Name", "HQ", "Team", "Line Manager", "Vehicle Number"],
  },
  {
    id: "roadshield",
    name: "RoadShield Enquiries",
    short: "RoadShield",
    description: "road-shield.in contact forms",
    accent: "#da1f26",
    keyEnv: "INGEST_KEY_ROADSHIELD",
    titleColumn: "Name",
    listColumns: ["Name", "Email", "Phone", "Lane", "Organisation / Fleet Size"],
  },
];

export const getProject = (id: string) => PROJECTS.find((p) => p.id === id);

export function allowedOrigins(project: Project): string[] {
  if (!project.originsEnv) return [];
  return (process.env[project.originsEnv] ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}
