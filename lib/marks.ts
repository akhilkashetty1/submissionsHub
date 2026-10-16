/**
 * Highlight colours: the digital version of colouring a row in Excel.
 * Each colour carries a meaning so a highlighted row says something on its own.
 * Shared by the list, the record page, the picker and the Excel export.
 */
export const MARKS = [
  { id: "red", label: "Needs action", bg: "#fde8e9", dot: "#d62d36" },
  { id: "amber", label: "Follow up", bg: "#fff3d1", dot: "#e8a008" },
  { id: "green", label: "Done / OK", bg: "#e3f4e8", dot: "#1f9d55" },
  { id: "blue", label: "For info", bg: "#e3eeff", dot: "#2f6fe4" },
  { id: "purple", label: "Escalated", bg: "#efe6ff", dot: "#7c4dde" },
] as const;

export type MarkId = (typeof MARKS)[number]["id"];

export const isMark = (v: unknown): v is MarkId => MARKS.some((m) => m.id === v);

export const markById = (id: string | null | undefined) => MARKS.find((m) => m.id === id) ?? null;
