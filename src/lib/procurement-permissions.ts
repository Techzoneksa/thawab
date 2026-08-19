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
import { PurchaseOrderGovernedStatus as S, GoodsReceiptStatus as G } from "./enums";
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

  // Phase 3D / 3D.1 — governed Goods Receipts (سندات الاستلام / GRN). Granular
  // full governance lifecycle so create (draft) ≠ submit ≠ approve ≠ reject ≠
  // post ≠ reverse. Only POST books Dr receipt / Cr GRNI + inventory + GRNI
  // subledger links; approval has ZERO accounting/inventory effect. None of
  // these imply PO mutation or any AP/payment/supplier action.
  grnView: "procurement.grn.view",
  grnCreate: "procurement.grn.create",
  grnUpdateDraft: "procurement.grn.update_draft",
  grnSubmit: "procurement.grn.submit",
  grnApprove: "procurement.grn.approve",
  grnReject: "procurement.grn.reject",
  grnPost: "procurement.grn.post",
  grnReverse: "procurement.grn.reverse",
  grnAuditView: "procurement.grn.audit.view",
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
  {
    key: "procurement-goods-receipts",
    label: "المشتريات — سندات الاستلام",
    perms: [
      { key: PROCUREMENT_PERMISSIONS.grnView, label: "عرض سندات الاستلام" },
      {
        key: PROCUREMENT_PERMISSIONS.grnCreate,
        label: "إنشاء سند استلام (مسودة)",
        desc: "إنشاء مسودة سند استلام بدون أي أثر محاسبي أو مخزني",
      },
      { key: PROCUREMENT_PERMISSIONS.grnUpdateDraft, label: "تعديل مسودة سند استلام" },
      { key: PROCUREMENT_PERMISSIONS.grnSubmit, label: "إرسال سند استلام للاعتماد" },
      {
        key: PROCUREMENT_PERMISSIONS.grnApprove,
        label: "اعتماد سند استلام",
        desc: "مراجعة واعتماد سند الاستلام المُرسَل (لا يُنشئ أي قيد أو حركة مخزون)",
      },
      {
        key: PROCUREMENT_PERMISSIONS.grnReject,
        label: "إعادة / رفض سند استلام",
        desc: "إعادة السند للمسودة أو رفضه بسبب",
      },
      {
        key: PROCUREMENT_PERMISSIONS.grnPost,
        label: "ترحيل سند استلام",
        desc: "ترحيل السند المعتمد: مدين المستلَم / دائن بضاعة مستلمة لم تُفوتر + حركة مخزون وربط أستاذ GRNI — لا يمس الذمم الدائنة",
      },
      {
        key: PROCUREMENT_PERMISSIONS.grnReverse,
        label: "عكس سند استلام",
        desc: "يعكس القيد وربط أستاذ GRNI وحركة المخزون معاً (لا يجعل المخزون سالباً)",
      },
      { key: PROCUREMENT_PERMISSIONS.grnAuditView, label: "عرض سجل تدقيق سندات الاستلام" },
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

/**
 * Phase 3D.1 — governed Goods Receipt (سند استلام / GRN) state matrix. Same
 * certified governance engine and JournalAction verbs as journals/vouchers, its
 * own transitions and its own granular grn permissions.
 *
 *   DRAFT → SUBMITTED → APPROVED → POSTED,  POSTED → REVERSED,
 *   SUBMITTED → DRAFT (return),  SUBMITTED → REJECTED.
 *
 * DRAFT→POSTED and SUBMITTED→POSTED are absent BY CONSTRUCTION, so a receipt can
 * never be posted without passing approval; approval (maker-checker-blocked) and
 * posting are separate actions with separate permissions. APPROVED has ZERO
 * accounting/inventory effect — only the POST transition books the GL, the GRNI
 * subledger links and inventory, and only REVERSE unwinds them.
 */
export const GRN_TRANSITIONS: Transition[] = [
  {
    from: G.DRAFT,
    action: "submit",
    to: G.SUBMITTED,
    permission: PROCUREMENT_PERMISSIONS.grnSubmit,
  },
  {
    from: G.SUBMITTED,
    action: "approve",
    to: G.APPROVED,
    permission: PROCUREMENT_PERMISSIONS.grnApprove,
    makerCheckerBlocked: true,
  },
  {
    from: G.SUBMITTED,
    action: "return",
    to: G.DRAFT,
    permission: PROCUREMENT_PERMISSIONS.grnReject,
    reasonRequired: true,
  },
  {
    from: G.SUBMITTED,
    action: "reject",
    to: G.REJECTED,
    permission: PROCUREMENT_PERMISSIONS.grnReject,
    reasonRequired: true,
  },
  // Policy: an approved (not-yet-posted) receipt may be returned to draft for edits.
  {
    from: G.APPROVED,
    action: "return",
    to: G.DRAFT,
    permission: PROCUREMENT_PERMISSIONS.grnReject,
    reasonRequired: true,
  },
  {
    from: G.APPROVED,
    action: "post",
    to: G.POSTED,
    permission: PROCUREMENT_PERMISSIONS.grnPost,
  },
  {
    from: G.POSTED,
    action: "reverse",
    to: G.REVERSED,
    permission: PROCUREMENT_PERMISSIONS.grnReverse,
    reasonRequired: true,
  },
];
