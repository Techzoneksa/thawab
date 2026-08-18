/**
 * Phase 3C — Procurement (Purchase Order) governance: granular permission catalog
 * + the governed Purchase Order state-transition matrix.
 *
 * Reuses the SAME certified governance engine as Finance (evaluateTransition /
 * findTransition / Transition) — no authorization architecture is duplicated. A
 * Purchase Order creates NO accounting, so none of these transitions post; they
 * are pure, guarded status changes with maker≠checker on approval and separate
 * approve vs issue authority.
 *
 * Permission strings use `procurement.po.<action>` and are checked by the
 * existing hasPermission() engine (exact, plus `procurement.*` and `*` wildcards
 * and `*.action`). They are deliberately granular so submit ≠ approve ≠ issue ≠
 * cancel, and none imply supplier-master mutation or Supplier Invoice posting.
 */
import { PurchaseOrderGovernedStatus as S } from "./enums";
import type { Transition } from "./finance-permissions";

export const PROCUREMENT_PERMISSIONS = {
  poView: "procurement.po.view",
  poCreate: "procurement.po.create",
  poUpdateDraft: "procurement.po.update_draft",
  poSubmit: "procurement.po.submit",
  poApprove: "procurement.po.approve",
  poReject: "procurement.po.reject",
  poIssue: "procurement.po.issue",
  poCancel: "procurement.po.cancel",
  poAuditView: "procurement.po.audit.view",
} as const;

export type ProcurementPermission =
  (typeof PROCUREMENT_PERMISSIONS)[keyof typeof PROCUREMENT_PERMISSIONS];

export interface ProcurementPermGroup {
  key: string;
  label: string;
  perms: { key: string; label: string; desc?: string }[];
}

export const PROCUREMENT_PERM_GROUPS: ProcurementPermGroup[] = [
  {
    key: "procurement-purchase-orders",
    label: "المشتريات — أوامر الشراء",
    perms: [
      { key: PROCUREMENT_PERMISSIONS.poView, label: "عرض أوامر الشراء" },
      { key: PROCUREMENT_PERMISSIONS.poCreate, label: "إنشاء أمر شراء" },
      { key: PROCUREMENT_PERMISSIONS.poUpdateDraft, label: "تعديل مسودة أمر شراء" },
      { key: PROCUREMENT_PERMISSIONS.poSubmit, label: "إرسال أمر شراء للاعتماد" },
      {
        key: PROCUREMENT_PERMISSIONS.poApprove,
        label: "اعتماد أمر شراء",
        desc: "مراجعة واعتماد أوامر الشراء المُرسَلة (لا يُنشئ قيداً محاسبياً)",
      },
      {
        key: PROCUREMENT_PERMISSIONS.poReject,
        label: "إعادة / رفض أمر شراء",
        desc: "إعادة الأمر للمسودة أو رفضه بسبب",
      },
      {
        key: PROCUREMENT_PERMISSIONS.poIssue,
        label: "إصدار أمر شراء",
        desc: "إصدار/إطلاق الأمر المعتمد للمورد (لا يُنشئ قيداً محاسبياً)",
      },
      {
        key: PROCUREMENT_PERMISSIONS.poCancel,
        label: "إلغاء أمر شراء",
        desc: "إلغاء أمر شراء صادر ضمن ضوابط وبسبب",
      },
      { key: PROCUREMENT_PERMISSIONS.poAuditView, label: "عرض سجل تدقيق أوامر الشراء" },
    ],
  },
];

export const ALL_PROCUREMENT_PERMS: string[] = PROCUREMENT_PERM_GROUPS.flatMap((g) =>
  g.perms.map((p) => p.key),
);

/**
 * Governed Purchase Order state matrix. DRAFT→SUBMITTED→APPROVED→ISSUED, with
 * return/reject from SUBMITTED and controlled cancel of an ISSUED order. Approval
 * is maker-checker-blocked; approve and issue are distinct actions/permissions.
 * There is NO transition that posts anything.
 */
export const PO_TRANSITIONS: Transition[] = [
  {
    from: S.DRAFT,
    action: "submit",
    to: S.SUBMITTED,
    permission: PROCUREMENT_PERMISSIONS.poSubmit,
  },
  {
    from: S.SUBMITTED,
    action: "approve",
    to: S.APPROVED,
    permission: PROCUREMENT_PERMISSIONS.poApprove,
    makerCheckerBlocked: true,
  },
  {
    from: S.SUBMITTED,
    action: "return",
    to: S.DRAFT,
    permission: PROCUREMENT_PERMISSIONS.poReject,
    reasonRequired: true,
  },
  {
    from: S.SUBMITTED,
    action: "reject",
    to: S.REJECTED,
    permission: PROCUREMENT_PERMISSIONS.poReject,
    reasonRequired: true,
  },
  // Policy: an approved (not-yet-issued) PO may be returned to draft for edits.
  {
    from: S.APPROVED,
    action: "return",
    to: S.DRAFT,
    permission: PROCUREMENT_PERMISSIONS.poReject,
    reasonRequired: true,
  },
  {
    from: S.APPROVED,
    action: "issue",
    to: S.ISSUED,
    permission: PROCUREMENT_PERMISSIONS.poIssue,
  },
  {
    from: S.ISSUED,
    action: "cancel",
    to: S.CANCELLED,
    permission: PROCUREMENT_PERMISSIONS.poCancel,
    reasonRequired: true,
  },
];
