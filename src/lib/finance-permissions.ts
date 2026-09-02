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
  bankSensitiveView: "finance.bank.sensitive.view",

  cashBankLedgerView: "finance.cash_bank.ledger.view",
  cashBankAuditView: "finance.cash_bank.audit.view",

  // Phase 2B — Receipt Vouchers (سندات القبض). Granular so submit ≠ approve ≠
  // post ≠ reverse, and none imply Cash/Bank master mutation or journal actions.
  receiptView: "finance.receipt.view",
  receiptCreate: "finance.receipt.create",
  receiptUpdateDraft: "finance.receipt.update_draft",
  receiptSubmit: "finance.receipt.submit",
  receiptApprove: "finance.receipt.approve",
  receiptReject: "finance.receipt.reject",
  receiptPost: "finance.receipt.post",
  receiptReverse: "finance.receipt.reverse",
  receiptAuditView: "finance.receipt.audit.view",

  // Phase 2C — Payment Vouchers (سندات الصرف). Granular so submit ≠ approve ≠
  // post ≠ reverse, and none imply Cash/Bank master mutation or journal actions.
  paymentView: "finance.payment.view",
  paymentCreate: "finance.payment.create",
  paymentUpdateDraft: "finance.payment.update_draft",
  paymentSubmit: "finance.payment.submit",
  paymentApprove: "finance.payment.approve",
  paymentReject: "finance.payment.reject",
  paymentPost: "finance.payment.post",
  paymentReverse: "finance.payment.reverse",
  paymentAuditView: "finance.payment.audit.view",

  // Phase 3A — Suppliers & Accounts Payable. Granular so master view/create/
  // update/deactivate, subledger ledger view, audit, sensitive banking view and
  // AP reconciliation are separate; none imply another.
  supplierView: "finance.supplier.view",
  supplierCreate: "finance.supplier.create",
  supplierUpdate: "finance.supplier.update",
  supplierDeactivate: "finance.supplier.deactivate",
  supplierLedgerView: "finance.supplier.ledger.view",
  supplierAuditView: "finance.supplier.audit.view",
  supplierSensitiveView: "finance.supplier.sensitive.view",
  apReconciliationView: "finance.ap.reconciliation.view",

  // Phase 5A — Supplier Payment Allocation & AP Aging. Allocation is SETTLEMENT
  // METADATA (never accounting): view is read-only drill-down; manage is the
  // authority to create/edit/remove allocation attribution and is deliberately
  // SEPARATE from payment-posting authority. Aging is a read-only report.
  supplierPaymentAllocationView: "finance.supplier_payment_allocation.view",
  supplierPaymentAllocationManage: "finance.supplier_payment_allocation.manage",
  apAgingView: "finance.ap_aging.view",

  // Phase 3B — Supplier Invoices (فواتير الموردين). Granular so create ≠ submit ≠
  // approve ≠ post ≠ reverse; none imply supplier-master mutation, payment, or a
  // raw journal action. Posting accrues Dr expense/asset + Dr input VAT / Cr AP.
  supplierInvoiceView: "finance.supplier_invoice.view",
  supplierInvoiceCreate: "finance.supplier_invoice.create",
  supplierInvoiceUpdateDraft: "finance.supplier_invoice.update_draft",
  supplierInvoiceSubmit: "finance.supplier_invoice.submit",
  supplierInvoiceApprove: "finance.supplier_invoice.approve",
  supplierInvoiceReject: "finance.supplier_invoice.reject",
  supplierInvoicePost: "finance.supplier_invoice.post",
  supplierInvoiceReverse: "finance.supplier_invoice.reverse",
  supplierInvoiceAuditView: "finance.supplier_invoice.audit.view",

  // Phase Sales-1 — Customers & Accounts Receivable. Granular so master view/
  // create/update/deactivate, subledger ledger view, audit and AR reconciliation
  // are separate; none imply another. AR is the mirror of the supplier/AP set.
  customerView: "finance.customer.view",
  customerCreate: "finance.customer.create",
  customerUpdate: "finance.customer.update",
  customerDeactivate: "finance.customer.deactivate",
  customerLedgerView: "finance.customer.ledger.view",
  customerAuditView: "finance.customer.audit.view",
  arReconciliationView: "finance.ar.reconciliation.view",
  arAgingView: "finance.ar_aging.view",

  // Phase Sales-2 — Customer Receipts & AR settlement allocation. Receipt view/
  // create post cash-in against AR; allocation is SETTLEMENT METADATA (never
  // accounting): view is read-only drill-down; manage creates/edits/removes
  // allocation attribution, separate from receipt-posting authority. Mirror of
  // the supplier payment/allocation set on the AR side.
  customerReceiptView: "finance.customer_receipt.view",
  customerReceiptCreate: "finance.customer_receipt.create",
  customerReceiptAllocationView: "finance.customer_receipt_allocation.view",
  customerReceiptAllocationManage: "finance.customer_receipt_allocation.manage",

  // Phase Sales-1 — Sales Invoices (فواتير المبيعات). Granular so create ≠ submit
  // ≠ approve ≠ post ≠ reverse; none imply customer-master mutation or a raw
  // journal action. Posting recognizes revenue: Dr accounts receivable / Cr revenue.
  salesInvoiceView: "finance.sales_invoice.view",
  salesInvoiceCreate: "finance.sales_invoice.create",
  salesInvoiceUpdateDraft: "finance.sales_invoice.update_draft",
  salesInvoiceSubmit: "finance.sales_invoice.submit",
  salesInvoiceApprove: "finance.sales_invoice.approve",
  salesInvoiceReject: "finance.sales_invoice.reject",
  salesInvoicePost: "finance.sales_invoice.post",
  salesInvoiceReverse: "finance.sales_invoice.reverse",
  salesInvoiceAuditView: "finance.sales_invoice.audit.view",

  // Phase 3B.1 — configuring system-purpose GL account mappings (e.g. the
  // recoverable Input VAT control account). High-authority Finance/CoA admin
  // action — never granted to ordinary document creators.
  accountMappingUpdate: "finance.account_mapping.update",

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
      {
        key: FINANCE_PERMISSIONS.bankSensitiveView,
        label: "عرض بيانات بنكية حسّاسة (IBAN كامل)",
        desc: "صلاحية عالية — إظهار رقم الآيبان/الحساب الكامل بدل المُقنّع",
      },
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
    key: "finance-receipt-vouchers",
    label: "المالية — سندات القبض",
    perms: [
      { key: FINANCE_PERMISSIONS.receiptView, label: "عرض سندات القبض" },
      { key: FINANCE_PERMISSIONS.receiptCreate, label: "إنشاء سند قبض" },
      { key: FINANCE_PERMISSIONS.receiptUpdateDraft, label: "تعديل مسودة سند قبض" },
      { key: FINANCE_PERMISSIONS.receiptSubmit, label: "إرسال سند قبض للاعتماد" },
      {
        key: FINANCE_PERMISSIONS.receiptApprove,
        label: "اعتماد سند قبض",
        desc: "مراجعة واعتماد سندات القبض المُرسَلة",
      },
      {
        key: FINANCE_PERMISSIONS.receiptReject,
        label: "إعادة / رفض سند قبض",
        desc: "إعادة السند للمسودة أو رفضه بسبب",
      },
      {
        key: FINANCE_PERMISSIONS.receiptPost,
        label: "ترحيل سند قبض",
        desc: "ترحيل سند القبض المعتمد إلى الأستاذ",
      },
      {
        key: FINANCE_PERMISSIONS.receiptReverse,
        label: "عكس سند قبض",
        desc: "عكس سند قبض مُرحَّل",
      },
      { key: FINANCE_PERMISSIONS.receiptAuditView, label: "عرض سجل تدقيق سندات القبض" },
    ],
  },
  {
    key: "finance-payment-vouchers",
    label: "المالية — سندات الصرف",
    perms: [
      { key: FINANCE_PERMISSIONS.paymentView, label: "عرض سندات الصرف" },
      { key: FINANCE_PERMISSIONS.paymentCreate, label: "إنشاء سند صرف" },
      { key: FINANCE_PERMISSIONS.paymentUpdateDraft, label: "تعديل مسودة سند صرف" },
      { key: FINANCE_PERMISSIONS.paymentSubmit, label: "إرسال سند صرف للاعتماد" },
      {
        key: FINANCE_PERMISSIONS.paymentApprove,
        label: "اعتماد سند صرف",
        desc: "مراجعة واعتماد سندات الصرف المُرسَلة",
      },
      {
        key: FINANCE_PERMISSIONS.paymentReject,
        label: "إعادة / رفض سند صرف",
        desc: "إعادة السند للمسودة أو رفضه بسبب",
      },
      {
        key: FINANCE_PERMISSIONS.paymentPost,
        label: "ترحيل سند صرف",
        desc: "ترحيل سند الصرف المعتمد إلى الأستاذ",
      },
      {
        key: FINANCE_PERMISSIONS.paymentReverse,
        label: "عكس سند صرف",
        desc: "عكس سند صرف مُرحَّل",
      },
      { key: FINANCE_PERMISSIONS.paymentAuditView, label: "عرض سجل تدقيق سندات الصرف" },
    ],
  },
  {
    key: "finance-suppliers",
    label: "المالية — الموردون والذمم الدائنة",
    perms: [
      { key: FINANCE_PERMISSIONS.supplierView, label: "عرض الموردين" },
      { key: FINANCE_PERMISSIONS.supplierCreate, label: "إنشاء مورد" },
      { key: FINANCE_PERMISSIONS.supplierUpdate, label: "تعديل مورد" },
      { key: FINANCE_PERMISSIONS.supplierDeactivate, label: "تعطيل مورد" },
      { key: FINANCE_PERMISSIONS.supplierLedgerView, label: "عرض كشف حساب المورد" },
      {
        key: FINANCE_PERMISSIONS.supplierSensitiveView,
        label: "عرض بيانات بنكية حسّاسة للمورد (IBAN كامل)",
        desc: "صلاحية عالية — إظهار آيبان المورد الكامل بدل المُقنّع",
      },
      { key: FINANCE_PERMISSIONS.supplierAuditView, label: "عرض سجل تدقيق الموردين" },
      {
        key: FINANCE_PERMISSIONS.apReconciliationView,
        label: "عرض مطابقة الذمم الدائنة",
        desc: "مطابقة رصيد أستاذ الموردين مع حساب الذمم الدائنة في الأستاذ العام",
      },
    ],
  },
  {
    key: "finance-supplier-invoices",
    label: "المالية — فواتير الموردين",
    perms: [
      { key: FINANCE_PERMISSIONS.supplierInvoiceView, label: "عرض فواتير الموردين" },
      { key: FINANCE_PERMISSIONS.supplierInvoiceCreate, label: "إنشاء فاتورة مورد" },
      { key: FINANCE_PERMISSIONS.supplierInvoiceUpdateDraft, label: "تعديل مسودة فاتورة مورد" },
      { key: FINANCE_PERMISSIONS.supplierInvoiceSubmit, label: "إرسال فاتورة مورد للاعتماد" },
      {
        key: FINANCE_PERMISSIONS.supplierInvoiceApprove,
        label: "اعتماد فاتورة مورد",
        desc: "مراجعة واعتماد فواتير الموردين المُرسَلة",
      },
      {
        key: FINANCE_PERMISSIONS.supplierInvoiceReject,
        label: "إعادة / رفض فاتورة مورد",
        desc: "إعادة الفاتورة للمسودة أو رفضها بسبب",
      },
      {
        key: FINANCE_PERMISSIONS.supplierInvoicePost,
        label: "ترحيل فاتورة مورد",
        desc: "ترحيل الفاتورة المعتمدة (استحقاق الذمم الدائنة) إلى الأستاذ",
      },
      {
        key: FINANCE_PERMISSIONS.supplierInvoiceReverse,
        label: "عكس فاتورة مورد",
        desc: "عكس فاتورة مورد مُرحَّلة",
      },
      { key: FINANCE_PERMISSIONS.supplierInvoiceAuditView, label: "عرض سجل تدقيق فواتير الموردين" },
    ],
  },
  {
    key: "finance-customers",
    label: "المالية — العملاء والذمم المدينة",
    perms: [
      { key: FINANCE_PERMISSIONS.customerView, label: "عرض العملاء" },
      { key: FINANCE_PERMISSIONS.customerCreate, label: "إنشاء عميل" },
      { key: FINANCE_PERMISSIONS.customerUpdate, label: "تعديل عميل" },
      { key: FINANCE_PERMISSIONS.customerDeactivate, label: "تعطيل عميل" },
      { key: FINANCE_PERMISSIONS.customerLedgerView, label: "عرض كشف حساب العميل" },
      { key: FINANCE_PERMISSIONS.customerAuditView, label: "عرض سجل تدقيق العملاء" },
      {
        key: FINANCE_PERMISSIONS.arReconciliationView,
        label: "عرض مطابقة الذمم المدينة",
        desc: "مطابقة رصيد أستاذ العملاء مع حساب الذمم المدينة في الأستاذ العام",
      },
      {
        key: FINANCE_PERMISSIONS.arAgingView,
        label: "عرض أعمار الذمم المدينة",
        desc: "تقرير أعمار الذمم المدينة للعملاء (قابل للقراءة فقط)",
      },
    ],
  },
  {
    key: "finance-sales-invoices",
    label: "المالية — فواتير المبيعات",
    perms: [
      { key: FINANCE_PERMISSIONS.salesInvoiceView, label: "عرض فواتير المبيعات" },
      { key: FINANCE_PERMISSIONS.salesInvoiceCreate, label: "إنشاء فاتورة مبيعات" },
      { key: FINANCE_PERMISSIONS.salesInvoiceUpdateDraft, label: "تعديل مسودة فاتورة مبيعات" },
      { key: FINANCE_PERMISSIONS.salesInvoiceSubmit, label: "إرسال فاتورة مبيعات للاعتماد" },
      {
        key: FINANCE_PERMISSIONS.salesInvoiceApprove,
        label: "اعتماد فاتورة مبيعات",
        desc: "مراجعة واعتماد فواتير المبيعات المُرسَلة",
      },
      {
        key: FINANCE_PERMISSIONS.salesInvoiceReject,
        label: "إعادة / رفض فاتورة مبيعات",
        desc: "إعادة الفاتورة للمسودة أو رفضها بسبب",
      },
      {
        key: FINANCE_PERMISSIONS.salesInvoicePost,
        label: "ترحيل فاتورة مبيعات",
        desc: "ترحيل الفاتورة المعتمدة (إثبات الإيراد والذمم المدينة) إلى الأستاذ",
      },
      {
        key: FINANCE_PERMISSIONS.salesInvoiceReverse,
        label: "عكس فاتورة مبيعات",
        desc: "عكس فاتورة مبيعات مُرحَّلة",
      },
      { key: FINANCE_PERMISSIONS.salesInvoiceAuditView, label: "عرض سجل تدقيق فواتير المبيعات" },
    ],
  },
  {
    key: "finance-ar-allocation",
    label: "المالية — تحصيل العملاء والتخصيص",
    perms: [
      {
        key: FINANCE_PERMISSIONS.customerReceiptView,
        label: "عرض سندات القبض من العملاء",
      },
      {
        key: FINANCE_PERMISSIONS.customerReceiptCreate,
        label: "تسجيل سند قبض من عميل",
        desc: "إثبات تحصيل نقدي/بنكي من عميل وتخفيض الذمم المدينة",
      },
      {
        key: FINANCE_PERMISSIONS.customerReceiptAllocationView,
        label: "عرض تخصيص التحصيل على الفواتير",
      },
      {
        key: FINANCE_PERMISSIONS.customerReceiptAllocationManage,
        label: "إدارة تخصيص التحصيل على الفواتير",
        desc: "تخصيص/تعديل/إلغاء توزيع مبلغ التحصيل على فواتير العميل — بيانات تسوية لا تُنشئ قيوداً",
      },
    ],
  },
  {
    key: "finance-account-mapping",
    label: "المالية — ربط الحسابات النظامية",
    perms: [
      {
        key: FINANCE_PERMISSIONS.accountMappingUpdate,
        label: "تهيئة ربط الحسابات النظامية (ضريبة المدخلات)",
        desc: "صلاحية إدارية عالية — تحديد/تغيير حساب ضريبة القيمة المضافة (المدخلات) وغيره",
      },
    ],
  },
  {
    key: "finance-ap-allocation",
    label: "المالية — تخصيص دفعات الموردين وأعمار الذمم",
    perms: [
      {
        key: FINANCE_PERMISSIONS.supplierPaymentAllocationView,
        label: "عرض تخصيص دفعات الموردين",
        desc: "عرض توزيع الدفعات على الفواتير والمبالغ المتبقية (بدون أي أثر محاسبي)",
      },
      {
        key: FINANCE_PERMISSIONS.supplierPaymentAllocationManage,
        label: "إدارة تخصيص دفعات الموردين",
        desc: "تخصيص/تعديل/إلغاء توزيع الدفعات على الفواتير — لا يُنشئ أي قيد محاسبي",
      },
      {
        key: FINANCE_PERMISSIONS.apAgingView,
        label: "عرض أعمار الذمم الدائنة",
        desc: "تقرير أعمار الذمم الدائنة (المتبقي حسب تاريخ الاستحقاق)",
      },
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
  | "issue" // Phase 3C — release an approved Purchase Order (no accounting effect)
  | "cancel";

/** Allowed (fromStatus → action → toStatus). The ONLY source of truth. */
export interface Transition {
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

/**
 * Phase 2B — Receipt Voucher (سند قبض) state matrix. Same governance engine and
 * the same JournalAction verbs as journals, but its own transitions and its own
 * granular receipt permissions. DRAFT→POSTED and SUBMITTED→POSTED are absent by
 * construction, so direct posting is impossible; approval (maker-checker-blocked)
 * and posting are separate actions with separate permissions.
 */
export const RECEIPT_TRANSITIONS: Transition[] = [
  {
    from: JournalStatus.DRAFT,
    action: "submit",
    to: JournalStatus.SUBMITTED,
    permission: FINANCE_PERMISSIONS.receiptSubmit,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "approve",
    to: JournalStatus.APPROVED,
    permission: FINANCE_PERMISSIONS.receiptApprove,
    makerCheckerBlocked: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "return",
    to: JournalStatus.DRAFT,
    permission: FINANCE_PERMISSIONS.receiptReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "reject",
    to: JournalStatus.REJECTED,
    permission: FINANCE_PERMISSIONS.receiptReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.APPROVED,
    action: "post",
    to: JournalStatus.POSTED,
    permission: FINANCE_PERMISSIONS.receiptPost,
  },
  {
    from: JournalStatus.POSTED,
    action: "reverse",
    to: JournalStatus.REVERSED,
    permission: FINANCE_PERMISSIONS.receiptReverse,
    reasonRequired: true,
  },
];

/**
 * Phase 2C — Payment Voucher (سند صرف) state matrix. Same governance engine and
 * JournalAction verbs as journals/receipts, its own transitions and its own
 * granular payment permissions. DRAFT→POSTED and SUBMITTED→POSTED are absent by
 * construction; approval (maker-checker-blocked) and posting are separate.
 */
export const PAYMENT_TRANSITIONS: Transition[] = [
  {
    from: JournalStatus.DRAFT,
    action: "submit",
    to: JournalStatus.SUBMITTED,
    permission: FINANCE_PERMISSIONS.paymentSubmit,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "approve",
    to: JournalStatus.APPROVED,
    permission: FINANCE_PERMISSIONS.paymentApprove,
    makerCheckerBlocked: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "return",
    to: JournalStatus.DRAFT,
    permission: FINANCE_PERMISSIONS.paymentReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "reject",
    to: JournalStatus.REJECTED,
    permission: FINANCE_PERMISSIONS.paymentReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.APPROVED,
    action: "post",
    to: JournalStatus.POSTED,
    permission: FINANCE_PERMISSIONS.paymentPost,
  },
  {
    from: JournalStatus.POSTED,
    action: "reverse",
    to: JournalStatus.REVERSED,
    permission: FINANCE_PERMISSIONS.paymentReverse,
    reasonRequired: true,
  },
];

/**
 * Phase 3B — Supplier Invoice (فاتورة مورد) state matrix. Same governance engine
 * and JournalAction verbs, its own transitions and its own granular supplier-
 * invoice permissions. DRAFT→POSTED and SUBMITTED→POSTED are absent by
 * construction; approval (maker-checker-blocked) and posting are separate.
 */
export const SUPPLIER_INVOICE_TRANSITIONS: Transition[] = [
  {
    from: JournalStatus.DRAFT,
    action: "submit",
    to: JournalStatus.SUBMITTED,
    permission: FINANCE_PERMISSIONS.supplierInvoiceSubmit,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "approve",
    to: JournalStatus.APPROVED,
    permission: FINANCE_PERMISSIONS.supplierInvoiceApprove,
    makerCheckerBlocked: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "return",
    to: JournalStatus.DRAFT,
    permission: FINANCE_PERMISSIONS.supplierInvoiceReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "reject",
    to: JournalStatus.REJECTED,
    permission: FINANCE_PERMISSIONS.supplierInvoiceReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.APPROVED,
    action: "post",
    to: JournalStatus.POSTED,
    permission: FINANCE_PERMISSIONS.supplierInvoicePost,
  },
  {
    from: JournalStatus.POSTED,
    action: "reverse",
    to: JournalStatus.REVERSED,
    permission: FINANCE_PERMISSIONS.supplierInvoiceReverse,
    reasonRequired: true,
  },
];

/**
 * Phase Sales-1 — Sales Invoice (فاتورة مبيعات) state matrix. Same governance
 * engine and JournalAction verbs as journals/supplier invoices, its own
 * transitions and its own granular sales-invoice permissions. DRAFT→POSTED and
 * SUBMITTED→POSTED are absent by construction; approval (maker-checker-blocked)
 * and posting are separate.
 */
export const SALES_INVOICE_TRANSITIONS: Transition[] = [
  {
    from: JournalStatus.DRAFT,
    action: "submit",
    to: JournalStatus.SUBMITTED,
    permission: FINANCE_PERMISSIONS.salesInvoiceSubmit,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "approve",
    to: JournalStatus.APPROVED,
    permission: FINANCE_PERMISSIONS.salesInvoiceApprove,
    makerCheckerBlocked: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "return",
    to: JournalStatus.DRAFT,
    permission: FINANCE_PERMISSIONS.salesInvoiceReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.SUBMITTED,
    action: "reject",
    to: JournalStatus.REJECTED,
    permission: FINANCE_PERMISSIONS.salesInvoiceReject,
    reasonRequired: true,
  },
  {
    from: JournalStatus.APPROVED,
    action: "post",
    to: JournalStatus.POSTED,
    permission: FINANCE_PERMISSIONS.salesInvoicePost,
  },
  {
    from: JournalStatus.POSTED,
    action: "reverse",
    to: JournalStatus.REVERSED,
    permission: FINANCE_PERMISSIONS.salesInvoiceReverse,
    reasonRequired: true,
  },
];

/**
 * Look up the single transition for (status, action), or null if illegal.
 * The transitions table defaults to the journal matrix; other governed entities
 * (e.g. receipt vouchers) pass their own matrix so the SAME evaluation engine —
 * state → permission → maker≠checker → reason — is reused, never duplicated.
 */
export function findTransition(
  from: string,
  action: JournalAction,
  transitions: Transition[] = JOURNAL_TRANSITIONS,
): Transition | null {
  return transitions.find((t) => t.from === from && t.action === action) ?? null;
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
  /** Optional state matrix (defaults to the journal one) so other governed
   *  entities reuse this exact decision engine with their own transitions. */
  transitions?: Transition[];
}): TransitionDecision {
  const t = findTransition(input.fromStatus, input.action, input.transitions);
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
export function actionsFor(
  from: string,
  transitions: Transition[] = JOURNAL_TRANSITIONS,
): JournalAction[] {
  return transitions.filter((t) => t.from === from).map((t) => t.action);
}
