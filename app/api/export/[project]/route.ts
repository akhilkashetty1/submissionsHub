import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { markById, MARKS } from "@/lib/marks";
import { can } from "@/lib/permissions";
import { getProject } from "@/lib/projects";
import { exportSubmissions, formatIST, notesFor } from "@/lib/submissions";

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
  const markParam = url.searchParams.get("mark") ?? "";
  const rows = await exportSubmissions(
    project.id,
    {
      q: url.searchParams.get("q") ?? "",
      from: url.searchParams.get("from") ?? "",
      to: url.searchParams.get("to") ?? "",
      mark: markParam === "any" || markParam === "none" || MARKS.some((m) => m.id === markParam) ? markParam : "",
      notes: url.searchParams.get("notes") === "1" ? "1" : "",
    },
    id && /^\d+$/.test(id) ? [id] : undefined,
  );
  const notes = await notesFor(rows.filter((r) => r.note_count > 0).map((r) => r.id));

  const columns: string[] = [];
  for (const r of rows) for (const h of r.headers) if (!columns.includes(h)) columns.push(h);

  // Hub columns first, then the form's own columns.
  const FIXED = 5;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Submissions Hub";
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
