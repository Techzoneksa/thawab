/**
 * Phase 1B — recommended finance role templates (segregation of duties).
 *
 * These are *recommendations* expressed purely as permission sets — the RBAC
 * engine authorizes by permission, never by role name. An org can assign any
 * combination; these templates encode the safe default separation:
 *   maker ≠ checker, approval ≠ posting, posting ≠ reversal, period admin apart.
 */
import { FINANCE_PERMISSIONS as P } from "./finance-permissions";

export interface FinanceRoleTemplate {
  key: string;
  name: string; // Arabic
  description: string;
  permissions: string[];
}

export const FINANCE_ROLE_TEMPLATES: FinanceRoleTemplate[] = [
  {
    key: "finance-viewer",
    name: "مطّلع مالي",
    description: "عرض فقط: الحسابات والقيود والأستاذ والتقارير. لا إنشاء/اعتماد/ترحيل/عكس.",
    permissions: [
      P.view,
      P.accountsView,
      P.journalView,
      P.reportsView,
      P.periodView,
      P.openingView,
      P.budgetView,
    ],
  },
  {
    key: "finance-accountant",
    name: "محاسب / موظف مالي",
    description: "إنشاء وتعديل مسودات القيود وإرسالها للاعتماد. لا يعتمد قيده ولا يرحّل ولا يعكس.",
    permissions: [
      P.view,
      P.accountsView,
      P.journalView,
      P.journalCreate,
      P.journalUpdateDraft,
      P.journalSubmit,
      P.importJournal,
      P.openingView,
      P.openingCreate,
      P.reportsView,
      P.periodView,
    ],
  },
  {
    key: "finance-reviewer",
    name: "مراجع / معتمد مالي",
    description: "مراجعة القيود المُرسَلة واعتمادها أو إعادتها/رفضها. لا يعدّل سطور القيد.",
    permissions: [P.view, P.journalView, P.journalApprove, P.journalReject, P.reportsView],
  },
  {
    key: "finance-poster",
    name: "مُرحِّل / مراقب مالي",
    description: "ترحيل القيود المعتمدة وعرض التقارير المحاسبية. لا اعتماد ولا عكس.",
    permissions: [P.view, P.journalView, P.journalPost, P.reportsView],
  },
  {
    key: "finance-manager",
    name: "مدير مالي",
    description:
      "صلاحيات موسّعة صريحة: اعتماد وترحيل وإغلاق الفترات وعكس القيود. تُسنَد بقرار المنشأة.",
    permissions: [
      P.view,
      P.accountsView,
      P.accountsCreate,
      P.accountsUpdate,
      P.accountsDeactivate,
      P.journalView,
      P.journalApprove,
      P.journalReject,
      P.journalPost,
      P.journalReverse,
      P.periodView,
      P.periodManage,
      P.periodClose,
      P.periodReopen,
      P.openingView,
      P.openingApprove,
      P.openingPost,
      P.reportsView,
      P.budgetView,
      P.budgetApprove,
      P.budgetLock,
      P.auditView,
    ],
  },
  {
    key: "finance-auditor",
    name: "مدقق داخلي",
    description: "قراءة فقط شاملة سجل التدقيق وتاريخ الاعتماد والترحيل والعكس. لا تعديل إطلاقاً.",
    permissions: [
      P.view,
      P.accountsView,
      P.journalView,
      P.reportsView,
      P.periodView,
      P.openingView,
      P.budgetView,
      P.auditView,
    ],
  },
];
