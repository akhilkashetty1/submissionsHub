import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { markById, MARKS } from "@/lib/marks";
import { can } from "@/lib/permissions";
import { getProject } from "@/lib/projects";
import { exportSubmissions, formatIST, notesFor } from "@/lib/submissions";
import { cleanFilters, decodeColumnFilter, describeColumnFilter } from "@/lib/filters";
import { ensureAnalysed } from "@/lib/analysis-server";
import { addSummarySheets } from "@/lib/report";

export const dynamic = "force-dynamic";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

/**
 * Excel export of the current filters (or one submission with ?id=). Needs at least read
 * access to the portal. Columns are the union of every submission's headers in first-seen
 * order, so rows from older versions of a form still line up under the right names.
 * Highlighted records keep their row colour, and notes come along as a column.
 */
export async function GET(request: Request, { params }: { params: Promise<{ project: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (user.mustChangePassword) return new Response("Set a new password first", { status: 403 });
  const project = getProject((await params).project);
  if (!project || !can(user, project.id, "read")) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const sp = url.searchParams;
  const filters = cleanFilters({ q: sp.get("q") ?? "", from: sp.get("from") ?? "", to: sp.get("to") ?? "", mark: sp.get("mark") ?? "", notes: sp.get("notes") ?? "", f: sp.getAll("f") });
  if (!(filters.mark === "any" || filters.mark === "none" || MARKS.some((m) => m.id === filters.mark))) filters.mark = "";
  if (project.analysis) await ensureAnalysed(project);
  const rows = await exportSubmissions(project.id, filters, id && /^\d+$/.test(id) ? [id] : undefined);
  const notes = await notesFor(rows.filter((r) => r.note_count > 0).map((r) => r.id));

  const columns: string[] = [];
  for (const r of rows) for (const h of r.headers) if (!columns.includes(h)) columns.push(h);

  // Hub columns first, then the form's own columns.
  const FIXED = 5;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Submissions Hub";
  // The analysis first (assessment portals, whole exports only), then the data.
  if (project.analysis && !id) {
    const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const scope = [
      filters.from || filters.to ? `${filters.from ? fmtDay(filters.from) : "start"} – ${filters.to ? fmtDay(filters.to) : "today"}` : "All dates",
      filters.q && `search “${filters.q}”`,
      ...filters.f.map((raw) => describeColumnFilter(decodeColumnFilter(raw)!, 60)),
      `${rows.length} records`,
    ]
      .filter(Boolean)
      .join(" · ");
    await addSummarySheets(wb, project, rows, { report: sp.get("report") === "1", scope });
  }
  const ws = wb.addWorksheet(project.short, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  ws.columns = [
    { header: "Hub ID", width: 9 },
    { header: "Received At (IST)", width: 20 },
    { header: "Highlight", width: 16 },
    { header: "Highlighted by", width: 18 },
    { header: "Notes", width: 60 },
    ...columns.map((c) => ({ header: c, width: Math.min(48, Math.max(14, c.length * 0.9)) })),
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15171B" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 42;

  for (const r of rows) {
    const byName = new Map(r.headers.map((h, i) => [h, r.values[i]]));
    const mark = markById(r.mark);
    const noteText = (notes.get(r.id) ?? []).map((n) => `[${formatIST(n.created_at)}] ${n.author_name}: ${n.body}`).join("\n");
    const row = ws.addRow([Number(r.id), formatIST(r.received_at), mark?.label ?? "", r.mark_by ?? "", noteText, ...columns.map((c) => byName.get(c) ?? "")]);
    if (noteText) row.getCell(5).alignment = { wrapText: true, vertical: "top" };

    // The Excel habit this replaces: a coloured row.
    if (mark) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(mark.bg) } };
      });
      row.getCell(3).font = { bold: true, color: { argb: argb(mark.dot) } };
    }
    // A colour on a single value
    for (const [heading, markId] of Object.entries(r.cell_marks)) {
      const col = columns.indexOf(heading);
      const m = markById(markId);
      if (col < 0 || !m) continue;
      const cell = row.getCell(col + FIXED + 1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(m.dot) } };
      cell.font = { bold: true, color: { argb: m.id === "amber" ? "FF15171B" : "FFFFFFFF" } };
    }
    for (const f of r.flagged) {
      const col = columns.indexOf(f);
      if (col < 0) continue;
      const cell = row.getCell(col + FIXED + 1);
      cell.font = { bold: true, color: { argb: "FFB3141A" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECED" } };
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length + FIXED } };

  const buffer = await wb.xlsx.writeBuffer();
  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const name = id ? `${project.id}-submission-${id}.xlsx` : `${project.id}-submissions-${stamp}.xlsx`;
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
