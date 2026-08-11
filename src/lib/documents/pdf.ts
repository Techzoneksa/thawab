/**
 * Named-file PDF export via pdfmake (dynamically imported, code-split).
 *
 * Arabic needs an embedded OpenType font (pdfmake ships Latin-only). Until an
 * Arabic font is registered via `registerArabicFont`, `hasPdfFont()` is false
 * and callers fall back to the browser print → "Save as PDF" path (which shapes
 * Arabic perfectly). Once a font is added, this produces a real downloadable
 * PDF file with the correct filename and page numbers.
 */
import type { DocumentDefinition } from "./types";
import { getOrg } from "./org";
import { currency } from "./types";

let FONT: { name: string; vfs: Record<string, string>; files: Record<string, string> } | null = null;

/** Register an Arabic OTF/TTF (base64) so PDF export uses a real file. */
export function registerArabicFont(name: string, regularBase64: string, boldBase64?: string) {
  FONT = {
    name,
    vfs: { [`${name}.ttf`]: regularBase64, ...(boldBase64 ? { [`${name}-Bold.ttf`]: boldBase64 } : {}) },
    files: { normal: `${name}.ttf`, bold: `${name}-Bold.ttf` || `${name}.ttf` },
  };
}

export function hasPdfFont() {
  return FONT !== null;
}

export async function exportPdf(def: DocumentDefinition) {
  if (!FONT) throw new Error("no-arabic-font");
  const pdfMake = (await import("pdfmake/build/pdfmake")).default;
  const org = getOrg();
  (pdfMake as any).vfs = { ...FONT.vfs };
  (pdfMake as any).fonts = {
    [FONT.name]: { normal: FONT.files.normal, bold: FONT.files.bold, italics: FONT.files.normal, bolditalics: FONT.files.bold },
  };

  const fmt = (v: unknown, type?: string) =>
    type === "money" ? currency(Number(v || 0)) : type === "number" ? new Intl.NumberFormat("ar-SA-u-nu-latn").format(Number(v || 0)) : type === "date" ? String(v ?? "").slice(0, 10) : String(v ?? "");

  const body = [
    def.columns.map((c) => ({ text: c.label, bold: true, color: "white", fillColor: "#1f2937", alignment: "center" })),
    ...def.rows.map((r) => def.columns.map((c) => ({ text: fmt(r[c.key], c.type), alignment: c.type === "money" || c.type === "number" ? "left" : "right" }))),
  ];

  const docDefinition: any = {
    pageSize: "A4",
    pageOrientation: def.orientation === "landscape" ? "landscape" : "portrait",
    pageMargins: [32, 90, 32, 48],
    defaultStyle: { font: FONT.name, fontSize: 9, alignment: "right" },
    header: {
      margin: [32, 20, 32, 0],
      columns: [
        { text: org.nameAr, bold: true, fontSize: 13 },
        { text: [org.vatNumber && `الرقم الضريبي: ${org.vatNumber}`, org.phone].filter(Boolean).join("\n"), alignment: "left", fontSize: 8 },
      ],
    },
    footer: (cur: number, total: number) => ({
      margin: [32, 10, 32, 0],
      columns: [
        { text: org.nameAr, fontSize: 7, color: "#9ca3af" },
        { text: `صفحة ${cur} من ${total}`, alignment: "left", fontSize: 7, color: "#9ca3af" },
      ],
    }),
    content: [
      { text: def.title, fontSize: 15, bold: true, alignment: "center", margin: [0, 0, 0, 4] },
      def.number || def.date ? { text: [def.number && `المستند: ${def.number}`, def.date && `التاريخ: ${def.date.slice(0, 10)}`].filter(Boolean).join("   "), alignment: "center", fontSize: 9, margin: [0, 0, 0, 6] } : {},
      ...(def.filters?.length || def.meta?.length ? [{ text: [...(def.meta ?? []), ...(def.filters ?? [])].map((m) => `${m.label}: ${m.value}`).join("   |   "), fontSize: 8, color: "#6b7280", margin: [0, 0, 0, 6] }] : []),
      { table: { headerRows: 1, widths: def.columns.map(() => "*"), body }, layout: { fillColor: (i: number) => (i > 0 && i % 2 === 0 ? "#f9fafb" : null) } },
      ...(def.totals?.length ? [{ margin: [0, 8, 0, 0], table: { widths: ["*", "auto"], body: def.totals.map((t) => [{ text: t.label, bold: t.strong }, { text: t.type === "number" ? new Intl.NumberFormat("ar-SA-u-nu-latn").format(t.value) : currency(t.value), alignment: "left", bold: t.strong }]) }, layout: "lightHorizontalLines" }] : []),
      ...(def.notes ? [{ text: `ملاحظات: ${def.notes}`, fontSize: 8, color: "#374151", margin: [0, 10, 0, 0] }] : []),
    ],
  };

  pdfMake.createPdf(docDefinition).download(`${def.fileBase}.pdf`);
}
