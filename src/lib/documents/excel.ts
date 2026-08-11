/**
 * Real .xlsx export via ExcelJS (dynamically imported, code-split).
 * Numbers stay numeric (not "5,000.00 SAR" strings); dates are real dates.
 */
import type { DocumentDefinition } from "./types";
import { getOrg } from "./org";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportExcel(def: DocumentDefinition) {
  const ExcelJS = (await import("exceljs")).default;
  const org = getOrg();
  const wb = new ExcelJS.Workbook();
  wb.creator = org.nameAr;
  wb.created = new Date();
  const ws = wb.addWorksheet(def.title.slice(0, 28) || "تقرير", {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: def.orientation === "landscape" ? "landscape" : "portrait", fitToPage: true },
  });

  const ncol = def.columns.length;
  const span = (r: number) => `A${r}:${String.fromCharCode(64 + ncol)}${r}`;
  let row = 1;

  // Title + org
  ws.mergeCells(span(row));
  const t = ws.getCell(`A${row}`);
  t.value = def.title;
  t.font = { bold: true, size: 15 };
  t.alignment = { horizontal: "center" };
  row++;
  ws.mergeCells(span(row));
  ws.getCell(`A${row}`).value = org.nameAr;
  ws.getCell(`A${row}`).alignment = { horizontal: "center" };
  row++;
  if (def.number || def.date) {
    ws.mergeCells(span(row));
    ws.getCell(`A${row}`).value = [def.number && `المستند: ${def.number}`, def.date && `التاريخ: ${def.date.slice(0, 10)}`]
      .filter(Boolean)
      .join("   ");
    ws.getCell(`A${row}`).alignment = { horizontal: "center" };
    row++;
  }
  // Filters used
  for (const f of [...(def.meta ?? []), ...(def.filters ?? [])]) {
    ws.mergeCells(span(row));
    ws.getCell(`A${row}`).value = `${f.label}: ${f.value}`;
    ws.getCell(`A${row}`).font = { size: 10, color: { argb: "FF6B7280" } };
    row++;
  }
  row++; // spacer

  // Header
  const headerRow = ws.getRow(row);
  def.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.alignment = { horizontal: "center" };
    cell.border = { bottom: { style: "thin" }, top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  headerRow.commit();
  row++;

  // Data — keep numbers numeric with a format.
  for (const r of def.rows) {
    const dataRow = ws.getRow(row);
    def.columns.forEach((c, i) => {
      const cell = dataRow.getCell(i + 1);
      const v = r[c.key];
      if (c.type === "money" || c.type === "number") {
        cell.value = v == null || v === "" ? 0 : Number(v);
        cell.numFmt = c.type === "money" ? "#,##0.00" : "#,##0";
        cell.alignment = { horizontal: "left" };
      } else if (c.type === "date") {
        cell.value = v ? String(v).slice(0, 10) : "";
      } else {
        cell.value = v == null ? "" : String(v);
      }
      cell.border = { bottom: { style: "hair" } };
    });
    dataRow.commit();
    row++;
  }

  // Totals
  if (def.totals?.length) {
    row++;
    for (const tot of def.totals) {
      const rr = ws.getRow(row);
      rr.getCell(1).value = tot.label;
      rr.getCell(1).font = { bold: true };
      const vcell = rr.getCell(ncol);
      vcell.value = Number(tot.value || 0);
      vcell.numFmt = tot.type === "number" ? "#,##0" : "#,##0.00";
      vcell.font = { bold: true };
      row++;
    }
  }

  // Column widths
  def.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(12, Math.min(40, (c.label?.length ?? 10) + 6));
  });

  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${def.fileBase}.xlsx`,
  );
}
