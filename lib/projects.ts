/**
 * The projects that send submissions here. Adding a project is one entry
 * plus its ingest credentials in the environment.
 *
 * - `keyEnv`: env var holding the secret the project's server sends as `x-hub-key`.
 * - `originsEnv`: for projects that post straight from the browser (they can't
 *   keep a secret), a comma-separated list of allowed site origins.
 * - `listColumns`: which submitted fields show in the table, by header name.
 * - `analysis`: for the assessment forms, where the person, vehicle and groups (HQ, Team, Line Manager)
 *   are, and which checks are good when answered No. Turns on scores, insights, follow-ups, expiries
 *   and clean-up for that portal (see lib/analysis.ts).
 */
import type { AnalysisConfig } from "@/lib/analysis";

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
  analysis?: AnalysisConfig;
};

/** "Is the rider sleepy?" and "Does the rider use a mobile phone?" are good when the answer is No. */
const EXPECT_NO = ["sleepy", "mobile phone"];

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
    analysis: {
      person: ["Name"],
      vehicle: ["Primary Vehicle Number"],
      groups: [
        { id: "hq", label: "HQ", columns: ["HQ"] },
        { id: "team", label: "Team", columns: ["Team"] },
        { id: "lm", label: "Line Manager", columns: ["Line Man"] },
      ],
      expectNo: EXPECT_NO,
    },
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
    analysis: {
      person: ["Name"],
      vehicle: ["Vehicle Number", "Primary Vehicle Number"],
      groups: [
        { id: "hq", label: "HQ", columns: ["HQ"] },
        { id: "team", label: "Team", columns: ["Team"] },
        { id: "lm", label: "Line Manager", columns: ["Line Manager"] },
      ],
      expectNo: EXPECT_NO,
    },
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
