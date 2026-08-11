/**
 * One canonical document definition that drives Preview, Print, PDF and Excel
 * from a single source — so filters/data are always identical across outputs.
 */
export type ColType = "text" | "number" | "money" | "date";

export interface DocColumn {
  key: string;
  label: string;
  type?: ColType; // default "text"
  align?: "start" | "end" | "center";
  width?: string; // CSS width for print (e.g. "18%")
}

export interface DocTotal {
  label: string;
  value: number;
  type?: "money" | "number"; // default "money"
  strong?: boolean;
}

export interface DocMeta {
  label: string;
  value: string;
}

export interface DocEntity {
  name: string;
  lines?: string[]; // e.g. VAT, address, contact
}

export interface DocumentDefinition {
  /** Document/report title, e.g. "ميزان المراجعة". */
  title: string;
  subtitle?: string;
  /** Document number (INV-.., JV-..) when it is a numbered document. */
  number?: string;
  /** ISO date. */
  date?: string;
  orientation?: "portrait" | "landscape";
  /** Counterparty block (customer/supplier/donor/employee). */
  entity?: DocEntity;
  /** Applied filters — shown in the header AND honored by every export. */
  filters?: DocMeta[];
  /** Extra header key/values (period, currency, …). */
  meta?: DocMeta[];
  columns: DocColumn[];
  rows: Array<Record<string, unknown>>;
  totals?: DocTotal[];
  notes?: string;
  signature?: boolean;
  /** Base name for downloaded files, e.g. "trial-balance-2026-08-11". */
  fileBase: string;
}

export const currency = (n: number) =>
  new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(n || 0),
  );
