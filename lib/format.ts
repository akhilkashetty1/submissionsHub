/** India time, e.g. "16 Oct 2026, 09:23". Safe to use in the browser and on the server. */
export const formatIST = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "—";
