import ExcelJS from "exceljs";
import { getProject } from "@/lib/projects";
import { getSession } from "@/lib/auth";
import { exportSubmissions, formatIST } from "@/lib/submissions";

export const dynamic = "force-dynamic";

/**
 * Excel export of the current filters (or one submission with ?id=).
 * Columns are the union of every submission's headers in first-seen order,
 * so rows from older versions of a form still line up under the right names.
 */
export async function GET(request: Request, { params }: { params: Promise<{ project: string }> }) {
  if (!(await getSession())) return new Response("Not signed in", { status: 401 });
  const project = getProject((await params).project);
  if (!project) return new Response("Unknown project", { status: 404 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const rows = await exportSubmissions(
    project.id,
    { q: url.searchParams.get("q") ?? "", from: url.searchParams.get("from") ?? "", to: url.searchParams.get("to") ?? "" },
    id && /^\d+$/.test(id) ? [id] : undefined,
  );

  const columns: string[] = [];
  for (const r of rows) for (const h of r.headers) if (!columns.includes(h)) columns.push(h);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Submissions Hub";
  const ws = wb.addWorksheet(project.short, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
  ws.columns = [
    { header: "Hub ID", width: 9 },
    { header: "Received At (IST)", width: 20 },
    ...columns.map((c) => ({ header: c, width: Math.min(48, Math.max(14, c.length * 0.9)) })),
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF15171B" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 42;

  for (const r of rows) {
    const byName = new Map(r.headers.map((h, i) => [h, r.values[i]]));
    const row = ws.addRow([Number(r.id), formatIST(r.received_at), ...columns.map((c) => byName.get(c) ?? "")]);
    for (const f of r.flagged) {
      const col = columns.indexOf(f);
      if (col < 0) continue;
      const cell = row.getCell(col + 3);
      cell.font = { bold: true, color: { argb: "FFB3141A" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECED" } };
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length + 2 } };

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
