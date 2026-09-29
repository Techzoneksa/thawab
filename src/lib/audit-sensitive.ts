/**
 * "Sensitive operations" — the single definition shared by the audit API filter,
 * the dashboard card and the audit page, so they always agree.
 *
 * An audit action is sensitive when it deletes, cancels/voids/disables, unposts,
 * reverses, rejects/returns, reopens/restores or EDITS a record. Actions are
 * written either as plain verbs ("delete", "update", "cancel") or as
 * ENTITY_VERB workflow codes ("SALES_INVOICE_CANCELLED", "JOURNAL_UNPOSTED").
 */
export type SensitiveKind = "delete" | "cancel" | "unpost" | "reverse" | "reject" | "reopen" | "edit";

const EXACT: Record<string, SensitiveKind> = {
  delete: "delete",
  cancel: "cancel",
  void: "cancel",
  disable: "cancel",
  lock: "cancel",
  unpost: "unpost",
  reverse: "reverse",
  reject: "reject",
  return: "reject",
  return_to_draft: "reject",
  reopen: "reopen",
  unlock: "reopen",
  restore: "reopen",
  update: "edit",
};
const SUFFIX: Record<string, SensitiveKind> = {
  deleted: "delete",
  removed: "delete",
  cancelled: "cancel",
  canceled: "cancel",
  voided: "cancel",
  unposted: "unpost",
  reversed: "reverse",
  rejected: "reject",
  returned: "reject",
  restored: "reopen",
  reopened: "reopen",
  updated: "edit",
};

/** Plain-verb actions (lower-case) — for the server SQL filter. */
export const SENSITIVE_EXACT_ACTIONS = Object.keys(EXACT);
/** Regex (case-insensitive use) matching ENTITY_VERB codes, for SQL `~*`. */
export const SENSITIVE_SUFFIX_REGEX = `_(${Object.keys(SUFFIX).join("|")})$`;

export function classifyAuditAction(action: string | null | undefined): SensitiveKind | null {
  const a = String(action ?? "").toLowerCase();
  if (EXACT[a]) return EXACT[a];
  const m = a.match(/_([a-z]+)$/);
  return m && SUFFIX[m[1]] ? SUFFIX[m[1]] : null;
}

export const SENSITIVE_LABELS: Record<SensitiveKind, string> = {
  delete: "حذف",
  cancel: "إلغاء / تعطيل",
  unpost: "إلغاء ترحيل",
  reverse: "عكس",
  reject: "رفض / إرجاع",
  reopen: "إعادة فتح / استرجاع",
  edit: "تعديل",
};

/** Arabic names for the audited record types (falls back to the raw type). */
const ENTITY_LABELS: Record<string, string> = {
  journal_entry: "قيد يومية",
  account: "حساب",
  sales_invoice: "فاتورة مبيعات",
  supplier_invoice: "فاتورة مورد",
  receipt_voucher: "سند قبض",
  payment_voucher: "سند صرف",
  purchase_order: "أمر شراء",
  purchase_request: "طلب شراء",
  goods_receipt: "استلام بضاعة",
  purchase_return: "مرتجع مشتريات",
  supplier: "مورد",
  customer: "عميل",
  donor: "متبرع",
  donation: "تبرع",
  beneficiary: "مستفيد",
  budget: "موازنة",
  fiscal_period: "فترة مالية",
  org_settings: "إعدادات الجمعية",
  user: "مستخدم",
  role: "دور",
  payroll: "مسير رواتب",
  asset: "أصل",
  fixed_asset: "أصل ثابت",
};
export function auditEntityLabel(t: string | null | undefined): string {
  const k = String(t ?? "");
  return ENTITY_LABELS[k] ?? k;
}
