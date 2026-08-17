/**
 * Import/Export helpers for journal entries and budgets via real .xlsx files.
 * ExcelJS is dynamically imported (code-split) on both the read and write path.
 */

export type IoType = "journal" | "budget";

// Header (Arabic) ↔ payload key. Order defines the template column order.
const JOURNAL_COLUMNS: { header: string; key: string; type?: "number" }[] = [
  { header: "رقم القيد", key: "number" },
  { header: "التاريخ", key: "date" },
  { header: "الوصف", key: "description" },
  { header: "رمز الحساب", key: "accountCode" },
  { header: "مدين", key: "debit", type: "number" },
  { header: "دائن", key: "credit", type: "number" },
  { header: "مركز التكلفة", key: "costCenter" },
  { header: "ملاحظات", key: "notes" },
];

const BUDGET_COLUMNS: { header: string; key: string; type?: "number" }[] = [
  { header: "اسم الموازنة", key: "name" },
  { header: "السنة", key: "year" },
  { header: "القسم", key: "department" },
  { header: "رمز الحساب", key: "accountCode" },
  { header: "المبلغ المخطط", key: "plannedAmount", type: "number" },
  { header: "ملاحظات", key: "notes" },
];

const HEADER_MAP: Record<IoType, Record<string, string>> = {
  journal: Object.fromEntries(JOURNAL_COLUMNS.map((c) => [c.header, c.key])),
  budget: Object.fromEntries(BUDGET_COLUMNS.map((c) => [c.header, c.key])),
};

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

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as any;
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    if (o.richText) return o.richText.map((r: any) => r.text).join("");
    if (o instanceof Date) return o.toISOString().slice(0, 10);
    return "";
  }
  return String(v);
}
function cellNum(v: unknown): number {
  const n = parseFloat(cellText(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** SHA-256 of the raw file bytes, hex — stable identity for duplicate detection. */
async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function writeSheet(
  columns: { header: string; type?: "number" }[],
  rows: Record<string, unknown>[],
  keyByHeader: Record<string, string>,
  title: string,
  filename: string,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(title, { views: [{ rightToLeft: true }] });

  const headerRow = ws.getRow(1);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.alignment = { horizontal: "center" };
  });
  headerRow.commit();

  rows.forEach((r, ri) => {
    const dataRow = ws.getRow(ri + 2);
    columns.forEach((c, i) => {
      const key = keyByHeader[c.header];
      const v = r[key];
      const cell = dataRow.getCell(i + 1);
      if (c.type === "number") {
        cell.value = v == null || v === "" ? 0 : Number(v);
        cell.numFmt = "#,##0.00";
      } else {
        cell.value = v == null ? "" : String(v);
      }
    });
    dataRow.commit();
  });

  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(12, Math.min(40, c.header.length + 8));
  });

  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}

const stamp = () => new Date().toISOString().slice(0, 10);

// ---------- Export (live data) ----------
export async function exportData(type: IoType) {
  const res = await fetch(`/api/data/export?type=${type}`);
  if (!res.ok) throw new Error("فشل في جلب البيانات للتصدير");
  const { rows } = (await res.json()) as { rows: Record<string, unknown>[] };
  const columns = type === "journal" ? JOURNAL_COLUMNS : BUDGET_COLUMNS;
  const title = type === "journal" ? "القيود المحاسبية" : "الموازنات";
  await writeSheet(columns, rows, HEADER_MAP[type], title, `${title}-${stamp()}.xlsx`);
}

// ---------- Template (empty, with examples) ----------
export async function downloadTemplate(type: IoType) {
  const columns = type === "journal" ? JOURNAL_COLUMNS : BUDGET_COLUMNS;
  const example: Record<string, unknown>[] =
    type === "journal"
      ? [
          {
            number: "JV-1",
            date: stamp(),
            description: "قيد افتتاحي",
            accountCode: "1101",
            debit: 1000,
            credit: 0,
            costCenter: "",
            notes: "",
          },
          {
            number: "JV-1",
            date: stamp(),
            description: "قيد افتتاحي",
            accountCode: "3101",
            debit: 0,
            credit: 1000,
            costCenter: "",
            notes: "",
          },
        ]
      : [
          {
            name: "موازنة 2026",
            year: "2026",
            department: "الإدارة",
            accountCode: "5101",
            plannedAmount: 50000,
            notes: "",
          },
          {
            name: "موازنة 2026",
            year: "2026",
            department: "الإدارة",
            accountCode: "5102",
            plannedAmount: 25000,
            notes: "",
          },
        ];
  const title = type === "journal" ? "قالب القيود" : "قالب الموازنة";
  await writeSheet(columns, example, HEADER_MAP[type], title, `${title}.xlsx`);
}

// ---------- Parse an uploaded workbook into keyed rows ----------
async function parseRows(file: File, type: IoType): Promise<Record<string, string>[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("الملف لا يحتوي على أوراق عمل");

  const map = HEADER_MAP[type];
  const colKey: Record<number, string> = {};
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell, col) => {
    const key = map[cellText(cell.value).trim()];
    if (key) colKey[col] = key;
  });
  if (Object.keys(colKey).length === 0)
    throw new Error("لم يتم التعرف على الأعمدة — استخدم القالب المرفق");

  const out: Record<string, string>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: Record<string, string> = {};
    let any = false;
    for (const [colStr, key] of Object.entries(colKey)) {
      const v = cellText(row.getCell(Number(colStr)).value).trim();
      obj[key] = v;
      if (v) any = true;
    }
    if (any) out.push(obj);
  }
  return out;
}

export interface JournalPreview {
  entries: {
    number: string;
    date: string;
    description: string;
    lines: {
      accountCode: string;
      debit: number;
      credit: number;
      costCenter?: string;
      notes?: string;
    }[];
  }[];
  entryCount: number;
  lineCount: number;
  totalDebit: number;
  totalCredit: number;
  warnings: string[];
  fileName: string;
  fileHash: string;
}

export async function parseJournalFile(file: File): Promise<JournalPreview> {
  const fileHash = await sha256Hex(await file.arrayBuffer());
  const rows = await parseRows(file, "journal");
  const groups = new Map<string, JournalPreview["entries"][number]>();
  const warnings: string[] = [];
  let order = 0;

  for (const row of rows) {
    const number = (row.number || "").trim();
    if (!number) {
      warnings.push("سطر بدون «رقم القيد» تم تجاهله");
      continue;
    }
    if (!row.accountCode) {
      warnings.push(`قيد ${number}: سطر بدون رمز حساب`);
      continue;
    }
    let g = groups.get(number);
    if (!g) {
      g = {
        number: `${++order}::${number}`,
        date: row.date || "",
        description: row.description || "",
        lines: [],
      };
      groups.set(number, g);
    }
    if (!g.description && row.description) g.description = row.description;
    if (!g.date && row.date) g.date = row.date;
    g.lines.push({
      accountCode: row.accountCode,
      debit: cellNum(row.debit),
      credit: cellNum(row.credit),
      costCenter: row.costCenter || undefined,
      notes: row.notes || undefined,
    });
  }

  const entries = [...groups.values()].map((g) => ({ ...g, number: g.number.split("::")[1] }));
  let totalDebit = 0;
  let totalCredit = 0;
  let lineCount = 0;
  for (const e of entries) {
    const d = e.lines.reduce((s, l) => s + l.debit, 0);
    const c = e.lines.reduce((s, l) => s + l.credit, 0);
    totalDebit += d;
    totalCredit += c;
    lineCount += e.lines.length;
    if (e.lines.length < 2) warnings.push(`قيد ${e.number}: يحتاج سطرين على الأقل`);
    if (Math.abs(d - c) > 0.005)
      warnings.push(`قيد ${e.number}: غير متوازن (مدين ${d.toFixed(2)} ≠ دائن ${c.toFixed(2)})`);
    if (!e.description) warnings.push(`قيد ${e.number}: بدون وصف`);
  }
  return {
    entries,
    entryCount: entries.length,
    lineCount,
    totalDebit,
    totalCredit,
    warnings,
    fileName: file.name,
    fileHash,
  };
}

export interface BudgetPreview {
  budgets: {
    name: string;
    year: string;
    department?: string;
    lines: { accountCode?: string; plannedAmount: number; notes?: string }[];
  }[];
  budgetCount: number;
  lineCount: number;
  totalPlanned: number;
  warnings: string[];
}

export async function parseBudgetFile(file: File): Promise<BudgetPreview> {
  const rows = await parseRows(file, "budget");
  const groups = new Map<string, BudgetPreview["budgets"][number]>();
  const warnings: string[] = [];

  for (const row of rows) {
    const name = (row.name || "").trim();
    const year = (row.year || "").trim();
    if (!name || !year) {
      warnings.push("سطر بدون «اسم الموازنة» أو «السنة» تم تجاهله");
      continue;
    }
    const key = `${name}__${year}`;
    let g = groups.get(key);
    if (!g) {
      g = { name, year, department: row.department || undefined, lines: [] };
      groups.set(key, g);
    }
    g.lines.push({
      accountCode: row.accountCode || undefined,
      plannedAmount: cellNum(row.plannedAmount),
      notes: row.notes || undefined,
    });
  }

  const budgets = [...groups.values()];
  let totalPlanned = 0;
  let lineCount = 0;
  for (const b of budgets) {
    lineCount += b.lines.length;
    totalPlanned += b.lines.reduce((s, l) => s + l.plannedAmount, 0);
  }
  return { budgets, budgetCount: budgets.length, lineCount, totalPlanned, warnings };
}

// ---------- Submit import ----------
export interface ImportResult {
  ok: boolean;
  created: number;
  errors?: string[];
  errorCount?: number;
  batchId?: string;
  duplicate?: boolean;
  batch?: {
    id: string;
    fileName: string;
    importedAt: string;
    importedBy: string | null;
    journalCount: number;
  };
}

export async function runImport(
  payload:
    | {
        type: "journal";
        entries: JournalPreview["entries"];
        fileName?: string;
        fileHash?: string;
      }
    | { type: "budget"; budgets: BudgetPreview["budgets"] },
): Promise<ImportResult> {
  const res = await fetch("/api/data/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  // 422 = validation errors, 409 = duplicate file — both return a structured
  // ImportResult the UI renders; other non-OK statuses are hard failures.
  if (!res.ok && res.status !== 422 && res.status !== 409) {
    throw new Error(data.message || data.error || "فشل الاستيراد");
  }
  return data as ImportResult;
}
