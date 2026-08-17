/**
 * Phase 1B — Finance governance: granular permission catalog + the canonical
 * journal state-transition matrix. Single source of truth shared by the server
 * (authorization + workflow enforcement) and the client (contextual actions,
 * roles admin UI). No authorization decision is duplicated elsewhere.
 *
 * Permission strings use the existing `finance.<area>.<action>` convention and
 * are checked by the existing hasPermission() engine (exact match, plus the
 * `finance.*` and `*` wildcards). They are deliberately granular so that, for
 * example, "create a journal" never implies "approve", "post", "reverse", or
 * "close a period".
 */
import { JournalStatus } from "./enums";

export const FINANCE_PERMISSIONS = {
  view: "finance.view",

  accountsView: "finance.accounts.view",
  accountsCreate: "finance.accounts.create",
  accountsUpdate: "finance.accounts.update",
  accountsDeactivate: "finance.accounts.deactivate",

  journalView: "finance.journal.view",
  journalCreate: "finance.journal.create",
  journalUpdateDraft: "finance.journal.update_draft",
  journalSubmit: "finance.journal.submit",
  journalApprove: "finance.journal.approve",
  journalReject: "finance.journal.reject",
  journalPost: "finance.journal.post",
  journalReverse: "finance.journal.reverse",

  importJournal: "finance.import.journal",

  openingView: "finance.opening_balance.view",
  openingCreate: "finance.opening_balance.create",
  openingApprove: "finance.opening_balance.approve",
  openingPost: "finance.opening_balance.post",

  periodView: "finance.period.view",
  periodManage: "finance.period.manage",
  periodClose: "finance.period.close",
  periodReopen: "finance.period.reopen",

  cashView: "finance.cash.view",
  cashCreate: "finance.cash.create",
  cashUpdate: "finance.cash.update",
  cashDeactivate: "finance.cash.deactivate",

  bankView: "finance.bank.view",
  bankCreate: "finance.bank.create",
  bankUpdate: "finance.bank.update",
  bankDeactivate: "finance.bank.deactivate",

  cashBankLedgerView: "finance.cash_bank.ledger.view",
  cashBankAuditView: "finance.cash_bank.audit.view",

  reportsView: "finance.reports.view",

  budgetView: "finance.budget.view",
  budgetCreate: "finance.budget.create",
  budgetApprove: "finance.budget.approve",
  budgetLock: "finance.budget.lock",

  auditView: "finance.audit.view",
} as const;

export type FinancePermission = (typeof FINANCE_PERMISSIONS)[keyof typeof FINANCE_PERMISSIONS];

/** Grouped catalog with Arabic labels for the Roles & Permissions admin UI. */
export interface FinancePermGroup {
  key: string;
  label: string; // Arabic group label
  perms: { key: string; label: string; desc?: string }[];
}

export const FINANCE_PERM_GROUPS: FinancePermGroup[] = [
  {
    key: "finance-general",
    label: "المالية — عام",
    perms: [{ key: FINANCE_PERMISSIONS.view, label: "الوصول للمالية", desc: "عرض قسم المالية" }],
  },
  {
    key: "finance-accounts",
    label: "المالية — دليل الحسابات",
    perms: [
      { key: FINANCE_PERMISSIONS.accountsView, label: "عرض الحسابات" },
      { key: FINANCE_PERMISSIONS.accountsCreate, label: "إضافة حساب" },
      { key: FINANCE_PERMISSIONS.accountsUpdate, label: "تعديل حساب" },
      { key: FINANCE_PERMISSIONS.accountsDeactivate, label: "إيقاف حساب" },
    ],
  },
  {
    key: "finance-journals",
    label: "المالية — القيود",
    perms: [
      { key: FINANCE_PERMISSIONS.journalView, label: "عرض القيود" },
      { key: FINANCE_PERMISSIONS.journalCreate, label: "إنشاء قيد" },
      { key: FINANCE_PERMISSIONS.journalUpdateDraft, label: "تعديل مسودة قيد" },
      { key: FINANCE_PERMISSIONS.journalSubmit, label: "إرسال للاعتماد" },
    ],
  },
  {
    key: "finance-approval",
    label: "المالية — الاعتماد والمراجعة",
    perms: [
      {
        key: FINANCE_PERMISSIONS.journalApprove,
        label: "اعتماد قيد",
        desc: "مراجعة واعتماد القيود المُرسَلة",
      },
      {
        key: FINANCE_PERMISSIONS.journalReject,
        label: "رفض/إعادة قيد",
        desc: "رفض القيد أو إعادته للتعديل",
      },
    ],
  },
  {
    key: "finance-posting",
    label: "المالية — الترحيل",
    perms: [
      {
        key: FINANCE_PERMISSIONS.journalPost,
        label: "ترحيل قيد",
        desc: "ترحيل القيود المعتمدة إلى الأستاذ",
      },
    ],
  },
  {
    key: "finance-reversal",
    label: "المالية — العكس",
    perms: [{ key: FINANCE_PERMISSIONS.journalReverse, label: "عكس قيد", desc: "عكس قيد مُرحَّل" }],
  },
  {
    key: "finance-periods",
    label: "المالية — الفترات المالية",
    perms: [
      { key: FINANCE_PERMISSIONS.periodView, label: "عرض الفترات" },
      {
        key: FINANCE_PERMISSIONS.periodManage,
        label: "إدارة الفترات",
        desc: "إنشاء/تعديل/حذف الفترات المفتوحة",
      },
      { key: FINANCE_PERMISSIONS.periodClose, label: "إغلاق فترة مالية" },
      { key: FINANCE_PERMISSIONS.periodReopen, label: "إعادة فتح فترة مالية" },
    ],
  },
  {
    key: "finance-opening",
    label: "المالية — الأرصدة الافتتاحية",
    perms: [
      { key: FINANCE_PERMISSIONS.openingView, label: "عرض الأرصدة الافتتاحية" },
      { key: FINANCE_PERMISSIONS.openingCreate, label: "إنشاء رصيد افتتاحي" },
      { key: FINANCE_PERMISSIONS.openingApprove, label: "اعتماد رصيد افتتاحي" },
      { key: FINANCE_PERMISSIONS.openingPost, label: "ترحيل رصيد افتتاحي" },
    ],
  },
  {
    key: "finance-imports",
    label: "المالية — الاستيراد",
    perms: [
      {
        key: FINANCE_PERMISSIONS.importJournal,
        label: "استيراد قيود (Excel)",
        desc: "ينشئ مسودات فقط",
      },
    ],
  },
  {
    key: "finance-cash",
    label: "المالية — الصناديق",
    perms: [
      { key: FINANCE_PERMISSIONS.cashView, label: "عرض الصناديق" },
      { key: FINANCE_PERMISSIONS.cashCreate, label: "إنشاء صندوق" },
      { key: FINANCE_PERMISSIONS.cashUpdate, label: "تعديل صندوق" },
      { key: FINANCE_PERMISSIONS.cashDeactivate, label: "تعطيل صندوق" },
    ],
  },
  {
    key: "finance-bank",
    label: "المالية — الحسابات البنكية",
    perms: [
      { key: FINANCE_PERMISSIONS.bankView, label: "عرض الحسابات البنكية" },
      { key: FINANCE_PERMISSIONS.bankCreate, label: "إضافة حساب بنكي" },
      { key: FINANCE_PERMISSIONS.bankUpdate, label: "تعديل حساب بنكي" },
      { key: FINANCE_PERMISSIONS.bankDeactivate, label: "تعطيل حساب بنكي" },
    ],
  },
  {
    key: "finance-cash-bank-shared",
    label: "المالية — النقد والبنوك (مشترك)",
    perms: [
      { key: FINANCE_PERMISSIONS.cashBankLedgerView, label: "عرض حركة النقد والبنوك" },
      { key: FINANCE_PERMISSIONS.cashBankAuditView, label: "عرض سجل تدقيق النقد والبنوك" },
    ],
  },
  {
    key: "finance-reports",
    label: "المالية — التقارير",
    perms: [{ key: FINANCE_PERMISSIONS.reportsView, label: "عرض التقارير المالية" }],
  },
  {
    key: "finance-budget",
    label: "المالية — الموازنة",
    perms: [
      { key: FINANCE_PERMISSIONS.budgetView, label: "عرض الموازنة" },
      { key: FINANCE_PERMISSIONS.budgetCreate, label: "إنشاء موازنة" },
      { key: FINANCE_PERMISSIONS.budgetApprove, label: "اعتماد موازنة" },
      { key: FINANCE_PERMISSIONS.budgetLock, label: "قفل موازنة" },
    ],
  },
  {
    key: "finance-audit",
    label: "المالية — سجل التدقيق",
    perms: [{ key: FINANCE_PERMISSIONS.auditView, label: "عرض سجل التدقيق المالي" }],
  },
];

export const ALL_FINANCE_PERMS: string[] = FINANCE_PERM_GROUPS.flatMap((g) =>
  g.perms.map((p) => p.key),
);

// ------------------------- Journal state machine -------------------------

export type JournalAction =
  | "submit"
  | "approve"
  | "return" // → back to DRAFT (maker fixes and resubmits)
  | "reject"
  | "post"
  | "reverse"
  | "cancel";

/** Allowed (fromStatus → action → toStatus). The ONLY source of truth. */
interface Transition {
  from: string;
  action: JournalAction;
  to: string;
  permission: string;
  reasonRequired?: boolean;
  makerCheckerBlocked?: boolean; // creator may not perform this action on own entry
}

export const JOURNAL_TRANSITIONS: Transition[] = [
  {
    from: JournalStatus.DRAFT,
    action: "submit",
    to: JournalStatus.SUBMITTED,
    permission: FINANCE_PERMISSIONS.journalSubmit,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "approve",
    to: JournalStatus.APPROVED,
    permission: FINANCE_PERMISSIONS.journalApprove,
    makerCheckerBlocked: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "return",
    to: JournalStatus.DRAFT,
    permission: FINANCE_PERMISSIONS.journalReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "reject",
    to: JournalStatus.REJECTED,
    permission: FINANCE_PERMISSIONS.journalReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.APPROVED,
    action: "post",
    to: JournalStatus.POSTED,
    permission: FINANCE_PERMISSIONS.journalPost,
  },
  {
    from: JournalStatus.POSTED,
    action: "reverse",
    to: JournalStatus.REVERSED,
    permission: FINANCE_PERMISSIONS.journalReverse,
    reasonRequired: true,
  },
  // Cancel a not-yet-posted entry (draft/submitted/approved) → cancelled.
  {
    from: JournalStatus.DRAFT,
    action: "cancel",
    to: JournalStatus.CANCELLED,
    permission: FINANCE_PERMISSIONS.journalUpdateDraft,
  },
];

/** Look up the single transition for (status, action), or null if illegal. */
export function findTransition(from: string, action: JournalAction): Transition | null {
  return JOURNAL_TRANSITIONS.find((t) => t.from === from && t.action === action) ?? null;
}

/**
 * Source-aware permission overrides. The journal workflow stays a SINGLE shared
 * engine, but authorization understands the journal's source: an opening-balance
 * journal is approved/posted with the dedicated opening-balance permissions, not
 * the generic journal ones. Normal manual/import journals use the base matrix
 * permission. Extend this table (not the engine) for future source-specific
 * governance.
 */
const SOURCE_PERMISSION_OVERRIDES: Record<string, Partial<Record<JournalAction, string>>> = {
  opening_balance: {
    approve: FINANCE_PERMISSIONS.openingApprove,
    post: FINANCE_PERMISSIONS.openingPost,
  },
};

/** Effective permission for (sourceType, action), falling back to the base. */
export function effectivePermission(
  sourceType: string | null | undefined,
  action: JournalAction,
  base: string,
): string {
  return SOURCE_PERMISSION_OVERRIDES[sourceType ?? ""]?.[action] ?? base;
}

export interface TransitionDecision {
  ok: boolean;
  toStatus?: string;
  permission?: string;
  code?: "ILLEGAL_TRANSITION" | "FORBIDDEN" | "SELF_APPROVAL" | "REASON_REQUIRED";
  message?: string;
}

/**
 * Pure authorization decision for a journal governance action — the single
 * source of truth reused by the server (finance-workflow) and by tests. Order:
 * state matrix → permission → maker≠checker → reason-required.
 */
export function evaluateTransition(input: {
  fromStatus: string;
  action: JournalAction;
  hasPerm: (perm: string) => boolean;
  createdBy?: string | null;
  currentUserId: string;
  reason?: string;
  sourceType?: string | null;
}): TransitionDecision {
  const t = findTransition(input.fromStatus, input.action);
  if (!t)
    return {
      ok: false,
      code: "ILLEGAL_TRANSITION",
      message: `انتقال غير مسموح: لا يمكن تنفيذ "${input.action}" على قيد بحالة "${input.fromStatus}"`,
    };
  // Source-aware permission (e.g. opening_balance.approve/post instead of the
  // generic journal permissions).
  const perm = effectivePermission(input.sourceType, input.action, t.permission);
  if (!input.hasPerm(perm))
    return {
      ok: false,
      permission: perm,
      code: "FORBIDDEN",
      message: "لا تملك صلاحية لهذا الإجراء المالي",
    };
  if (t.makerCheckerBlocked && input.createdBy && input.createdBy === input.currentUserId)
    return {
      ok: false,
      permission: perm,
      code: "SELF_APPROVAL",
      message: "لا يمكنك اعتماد قيد أنشأته بنفسك (فصل المهام)",
    };
  if (t.reasonRequired && !(input.reason ?? "").trim())
    return {
      ok: false,
      permission: perm,
      code: "REASON_REQUIRED",
      message: "السبب مطلوب لهذا الإجراء",
    };
  return { ok: true, toStatus: t.to, permission: perm };
}

/** HTTP status for a decision failure code. */
export function decisionHttpStatus(code: TransitionDecision["code"]): number {
  switch (code) {
    case "ILLEGAL_TRANSITION":
      return 409;
    case "FORBIDDEN":
    case "SELF_APPROVAL":
      return 403;
    case "REASON_REQUIRED":
      return 400;
    default:
      return 400;
  }
}

/** Actions structurally available from a status (before permission checks). */
export function actionsFor(from: string): JournalAction[] {
  return JOURNAL_TRANSITIONS.filter((t) => t.from === from).map((t) => t.action);
}
