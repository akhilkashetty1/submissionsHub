import "server-only";
import type ExcelJS from "exceljs";
import { pct, readChecks } from "@/lib/analysis";
import { expiries, followupBoard, groupValue, loadAliases } from "@/lib/insights";
import type { Project } from "@/lib/projects";
import { formatIST, type Submission } from "@/lib/submissions";

/**
 * The analysis sheets at the front of an Excel export, so whoever opens the file sees the answers
 * first: a Summary (headline numbers, weakest checks, results by HQ / Team / Line Manager) for exactly
 * the records exported, and with `report` (the monthly report) also a Heatmap, the open Follow-ups and
 * the Expiries.
 */

const INK = "FF0F1013";
const MUTED = "FF75787F";
const LINE = "FFE7E7EA";
const RED_STEPS = ["FFF6F6F7", "FFFBE4E4", "FFF7C3C4", "FFEF9597", "FFE0656A", "FFC4202A"];
const redFor = (rate: number, asked: number) => (!asked ? undefined : RED_STEPS[rate <= 0 ? 0 : rate < 0.05 ? 1 : rate < 0.12 ? 2 : rate < 0.22 ? 3 : rate < 0.35 ? 4 : 5]);
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

function title(ws: ExcelJS.Worksheet, text: string, sub: string) {
  ws.addRow([text]).font = { bold: true, size: 15, color: { argb: INK } };
  ws.addRow([sub]).font = { size: 10, color: { argb: MUTED } };
  ws.addRow([]);
}

function heading(ws: ExcelJS.Worksheet, text: string) {
  ws.addRow([]);
  const r = ws.addRow([text]);
  r.font = { bold: true, size: 12, color: { argb: INK } };
}

function tableHead(ws: ExcelJS.Worksheet, cells: string[]) {
  const r = ws.addRow(cells);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.eachCell((c) => (c.fill = fill("FF15171B")));
  return r;
}

export async function addSummarySheets(wb: ExcelJS.Workbook, project: Project, rows: Submission[], opts: { report: boolean; scope: string }) {
  const cfg = project.analysis;
  if (!cfg) return;
  const aliases = await loadAliases(project.id);
  const assessed = rows.filter((r) => r.score_total);
  const checksOf = new Map(assessed.map((r) => [r.id, readChecks(r.headers, r.values, cfg)]));

  /* ---------------- Summary */
  const ws = wb.addWorksheet("Summary", { properties: { tabColor: { argb: "FFDFE22B" } } });
  ws.columns = [{ width: 58 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 44 }];
  title(ws, `${project.name}: ${opts.report ? "report" : "summary"}`, `${opts.scope} · generated ${formatIST(new Date())}`);

  const scores = assessed.map((r) => (r.score_ok ?? 0) / (r.score_total ?? 1));
  const failedChecks = assessed.reduce((n, r) => n + (r.fails?.length ?? 0), 0);
  const kpis: [string, string | number][] = [
    ["Assessments", assessed.length],
    ["Average score (share of checks passed)", scores.length ? `${Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)}%` : "—"],
    ["All clear (nothing failed)", `${pct(assessed.filter((r) => r.score_ok === r.score_total).length, assessed.length)}%`],
    ["Failed checks", failedChecks],
  ];
  for (const [k, v] of kpis) {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { color: { argb: MUTED } };
    r.getCell(2).font = { bold: true, size: 12 };
    r.getCell(2).alignment = { horizontal: "right" };
  }

  // Weakest checks
  const stats = new Map<string, { label: string; section: string | null; asked: number; failed: number }>();
  for (const cs of checksOf.values())
    for (const c of cs) {
      const s = stats.get(c.header) ?? { label: c.label, section: c.section, asked: 0, failed: 0 };
      s.asked++;
      if (!c.ok) s.failed++;
      stats.set(c.header, s);
    }
  const ranked = [...stats.values()].sort((a, b) => b.failed / b.asked - a.failed / a.asked || b.failed - a.failed);
  heading(ws, "Checks, worst first");
  tableHead(ws, ["Check", "Section", "Asked", "Failed", "Failed %"]);
  for (const s of ranked) {
    const rate = s.asked ? s.failed / s.asked : 0;
    const r = ws.addRow([s.label, s.section ?? "", s.asked, s.failed, rate]);
    r.getCell(5).numFmt = "0%";
    const f = redFor(rate, s.asked);
    if (f && rate > 0) {
      r.getCell(5).fill = fill(f);
      if (rate >= 0.22) r.getCell(5).font = { bold: true, color: { argb: "FFFFFFFF" } };
    }
    r.getCell(1).alignment = { wrapText: true, vertical: "top" };
  }

  // Results by each group (HQ, Team, Line Manager)
  for (const g of cfg.groups) {
    const by = new Map<string, typeof assessed>();
    for (const r of assessed) {
      const v = groupValue(r, g, aliases);
      by.set(v, [...(by.get(v) ?? []), r]);
    }
    heading(ws, `By ${g.label}`);
    tableHead(ws, [g.label, "Assessments", "Avg score", "All clear", "Failed checks", "Most failed check"]);
    for (const [value, rs] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const sc = rs.map((r) => (r.score_ok ?? 0) / (r.score_total ?? 1));
      const counts = new Map<string, number>();
      for (const r of rs) for (const h of r.fails ?? []) counts.set(h, (counts.get(h) ?? 0) + 1);
      const worst = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const row = ws.addRow([
        value,
        rs.length,
        sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null,
        rs.filter((r) => r.score_ok === r.score_total).length / rs.length,
        rs.reduce((n, r) => n + (r.fails?.length ?? 0), 0),
        worst ? (stats.get(worst)?.label ?? worst) : "",
      ]);
      row.getCell(3).numFmt = "0%";
      row.getCell(4).numFmt = "0%";
    }
  }
  ws.eachRow((r) => r.eachCell((c) => (c.border = { bottom: { style: "hair", color: { argb: LINE } } })));

  if (!opts.report) return;

  /* ---------------- Heatmap: first group × checks */
  const g = cfg.groups[0];
  const hm = wb.addWorksheet("Heatmap", { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
  title(hm, `How often each check failed, by ${g.label}`, "Darker red is worse. Blank = not asked.");
  const checks = ranked.filter((s) => s.asked >= 1);
  const headers = [...stats.entries()].sort((a, b) => b[1].failed / b[1].asked - a[1].failed / a[1].asked).map(([h]) => h);
  const head = hm.addRow([g.label, ...checks.map((c) => c.label)]);
  head.height = 120;
  head.eachCell((c, i) => {
    c.font = { bold: true, size: 9 };
    c.alignment = i === 1 ? { vertical: "bottom" } : { textRotation: 90, vertical: "bottom", wrapText: true };
  });
  hm.getColumn(1).width = 26;
  for (let i = 2; i <= checks.length + 1; i++) hm.getColumn(i).width = 6;
  const groupsBy = new Map<string, typeof assessed>();
  for (const r of assessed) {
    const v = groupValue(r, g, aliases);
    groupsBy.set(v, [...(groupsBy.get(v) ?? []), r]);
  }
  for (const [value, rs] of [...groupsBy.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const cells = headers.map((h) => {
      let asked = 0;
      let failed = 0;
      for (const r of rs) {
        const c = checksOf.get(r.id)?.find((x) => x.header === h);
        if (c) {
          asked++;
          if (!c.ok) failed++;
        }
      }
      return { asked, failed };
    });
    const row = hm.addRow([`${value} (${rs.length})`, ...cells.map((c) => (c.asked ? c.failed / c.asked : null))]);
    cells.forEach((c, i) => {
      const cell = row.getCell(i + 2);
      cell.numFmt = "0%";
      const f = redFor(c.asked ? c.failed / c.asked : 0, c.asked);
      if (f) cell.fill = fill(f);
      if (c.asked && c.failed / c.asked >= 0.22) cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    });
  }

  /* ---------------- Follow-ups still open */
  const items = (await followupBoard(project, 3650)).filter((i) => i.status !== "fixed");
  const fu = wb.addWorksheet("Follow-ups", { views: [{ state: "frozen", ySplit: 4 }] });
  title(fu, "Failed checks not yet marked fixed", `${items.length} open or in progress`);
  fu.columns = [{ width: 22 }, { width: 16 }, { width: 50 }, { width: 36 }, { width: 14 }, { width: 18 }, { width: 36 }, { width: 18 }];
  tableHead(fu, ["Person", "HQ", "Check", "Remark", "Status", "Who's on it", "Note", "Assessed"]);
  for (const i of items) fu.addRow([i.person, i.group, i.label, i.remark, i.status === "in_progress" ? "In progress" : "Open", i.owner, i.note, formatIST(i.at)]);

  /* ---------------- Expiries */
  const ex = (await expiries(project)).filter((e) => e.days <= 90);
  const es = wb.addWorksheet("Expiries", { views: [{ state: "frozen", ySplit: 4 }] });
  title(es, "Documents expired or expiring within 90 days", "From each person's latest assessment that recorded the dates");
  es.columns = [{ width: 24 }, { width: 16 }, { width: 22 }, { width: 14 }, { width: 14 }];
  tableHead(es, ["Person", "HQ", "Document", "Valid till", "Days left"]);
  for (const e of ex) {
    const r = es.addRow([e.person, e.group, e.document, e.date, e.days]);
    r.getCell(4).numFmt = "dd mmm yyyy";
    if (e.days < 0) r.getCell(5).fill = fill("FFFDF1F1");
    else if (e.days <= 30) r.getCell(5).fill = fill("FFFFFBEB");
  }
}
