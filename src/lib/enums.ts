/**
 * Canonical enum keys — SINGLE SOURCE OF TRUTH.
 *
 * All status/type/classification values are stored in the database as stable
 * ASCII keys (never Arabic). Arabic display text lives in `src/lib/i18n/labels.ts`
 * and is applied ONLY at the UI layer. This permanently prevents the encoding
 * corruption (mojibake) that previously broke every status comparison.
 *
 * This module is dependency-free and safe to import from both server and client.
 */

export const UserStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const BranchStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type BranchStatus = (typeof BranchStatus)[keyof typeof BranchStatus];

export const DonorType = {
  INDIVIDUAL: "individual",
  ORGANIZATION: "organization",
} as const;
export type DonorType = (typeof DonorType)[keyof typeof DonorType];

export const DonorTag = {
  BRONZE: "bronze",
  SILVER: "silver",
  GOLD: "gold",
  PLATINUM: "platinum",
} as const;
export type DonorTag = (typeof DonorTag)[keyof typeof DonorTag];

export const DonorStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type DonorStatus = (typeof DonorStatus)[keyof typeof DonorStatus];

export const CampaignStatus = {
  PLANNED: "planned",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const ProjectStatus = {
  PLANNED: "planned",
  ACTIVE: "active",
  ON_HOLD: "on_hold",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const DonationMethod = {
  CASH: "cash",
  TRANSFER: "transfer",
  POS: "pos",
  CHEQUE: "cheque",
  ONLINE: "online",
} as const;
export type DonationMethod = (typeof DonationMethod)[keyof typeof DonationMethod];

export const DonationChannel = {
  DIRECT: "direct",
  ONLINE: "online",
  CAMPAIGN: "campaign",
  BANK: "bank",
} as const;
export type DonationChannel = (typeof DonationChannel)[keyof typeof DonationChannel];

export const DonationStatus = {
  DRAFT: "draft",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
} as const;
export type DonationStatus = (typeof DonationStatus)[keyof typeof DonationStatus];

export const BeneficiaryCategory = {
  NEEDY_FAMILY: "needy_family",
  ORPHAN: "orphan",
  WIDOW: "widow",
  DISABLED: "disabled",
  ELDERLY: "elderly",
  OTHER: "other",
} as const;
export type BeneficiaryCategory = (typeof BeneficiaryCategory)[keyof typeof BeneficiaryCategory];

export const BeneficiaryStatus = {
  NEW: "new",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  ARCHIVED: "archived",
} as const;
export type BeneficiaryStatus = (typeof BeneficiaryStatus)[keyof typeof BeneficiaryStatus];

export const MaritalStatus = {
  SINGLE: "single",
  MARRIED: "married",
  DIVORCED: "divorced",
  WIDOWED: "widowed",
} as const;
export type MaritalStatus = (typeof MaritalStatus)[keyof typeof MaritalStatus];

export const AidType = {
  URGENT: "urgent",
  MONTHLY: "monthly",
  SEASONAL: "seasonal",
  MEDICAL: "medical",
  EDUCATIONAL: "educational",
  IN_KIND: "in_kind",
} as const;
export type AidType = (typeof AidType)[keyof typeof AidType];

export const AidStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
} as const;
export type AidStatus = (typeof AidStatus)[keyof typeof AidStatus];

export const ReceiptType = {
  DONATION: "donation",
  AID: "aid",
  MISC: "misc",
} as const;
export type ReceiptType = (typeof ReceiptType)[keyof typeof ReceiptType];

export const ReceiptStatus = {
  ISSUED: "issued",
  CANCELLED: "cancelled",
} as const;
export type ReceiptStatus = (typeof ReceiptStatus)[keyof typeof ReceiptStatus];

// ============ FINANCE ============

/** Account classification (nature of the account for reporting). */
export const AccountClassification = {
  ASSET: "asset",
  LIABILITY: "liability",
  EQUITY: "equity", // net assets for non-profits
  REVENUE: "revenue",
  EXPENSE: "expense",
} as const;
export type AccountClassification =
  (typeof AccountClassification)[keyof typeof AccountClassification];

/** Normal balance side of an account — derived from classification. */
export const NormalBalance = {
  DEBIT: "debit",
  CREDIT: "credit",
} as const;
export type NormalBalance = (typeof NormalBalance)[keyof typeof NormalBalance];

export function normalBalanceOf(c: AccountClassification): NormalBalance {
  return c === AccountClassification.ASSET || c === AccountClassification.EXPENSE
    ? NormalBalance.DEBIT
    : NormalBalance.CREDIT;
}

export const AccountStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const JournalStatus = {
  DRAFT: "draft",
  // Phase 1B governance lifecycle (maker → checker → poster). These sit BETWEEN
  // draft and posted and never touch the General Ledger (GL_STATES stays
  // [posted, reversed]). "returned" is expressed as a transition back to DRAFT,
  // so it needs no persistent status.
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  PENDING: "pending",
  POSTED: "posted",
  REVERSED: "reversed",
  CANCELLED: "cancelled",
} as const;
export type JournalStatus = (typeof JournalStatus)[keyof typeof JournalStatus];

/**
 * Phase 2B — Receipt Voucher (سند قبض) lifecycle. A DRAFT/SUBMITTED/APPROVED
 * voucher has NO General Ledger effect; only POSTED creates the journal, and
 * REVERSED nets it via the certified reversal engine. Values are shared with the
 * journal status strings so the same governance engine drives both.
 */
export const ReceiptVoucherStatus = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  POSTED: "posted",
  REVERSED: "reversed",
} as const;
export type ReceiptVoucherStatus = (typeof ReceiptVoucherStatus)[keyof typeof ReceiptVoucherStatus];

/**
 * Phase 2C — Payment Voucher (سند صرف) lifecycle. Mirrors the receipt voucher:
 * DRAFT/SUBMITTED/APPROVED/REJECTED have NO GL effect; only POSTED creates the
 * journal (Dr allocations / Cr cash/bank), REVERSED nets it via the certified
 * reversal engine. Shared status strings drive the same governance engine.
 */
export const PaymentVoucherStatus = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  POSTED: "posted",
  REVERSED: "reversed",
} as const;
export type PaymentVoucherStatus = (typeof PaymentVoucherStatus)[keyof typeof PaymentVoucherStatus];

/**
 * Phase 3B — Supplier Invoice (فاتورة مورد) lifecycle. A DRAFT/SUBMITTED/APPROVED
 * invoice has NO General Ledger effect; only POSTED creates the accrual journal
 * (Dr expense/asset + Dr input VAT / Cr accounts payable) and links the AP credit
 * line to the supplier subledger. REVERSED nets it via the certified reversal
 * engine. Shared status strings drive the same governance engine as journals.
 */
export const SupplierInvoiceStatus = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  POSTED: "posted",
  REVERSED: "reversed",
} as const;
export type SupplierInvoiceStatus =
  (typeof SupplierInvoiceStatus)[keyof typeof SupplierInvoiceStatus];

/** Net-asset fund classes — essential for charity restricted-funds tracking. */
export const Fund = {
  UNRESTRICTED: "unrestricted",
  RESTRICTED: "restricted",
  ENDOWMENT: "endowment",
} as const;
export type Fund = (typeof Fund)[keyof typeof Fund];

/** How a journal entry was created — manual vs auto-posted from an operation. */
export const JournalSource = {
  MANUAL: "manual",
  DONATION: "donation",
  AID: "aid",
  RECEIPT: "receipt",
  PURCHASE: "purchase",
  PAYROLL: "payroll",
  DEPRECIATION: "depreciation",
  ADJUSTMENT: "adjustment",
  DISTRIBUTION: "distribution",
  OPENING: "opening",
  CLOSING: "closing",
} as const;
export type JournalSource = (typeof JournalSource)[keyof typeof JournalSource];

export const CostCenterStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type CostCenterStatus = (typeof CostCenterStatus)[keyof typeof CostCenterStatus];

export const BudgetStatus = {
  DRAFT: "draft",
  APPROVED: "approved",
  LOCKED: "locked",
  CLOSED: "closed",
} as const;
export type BudgetStatus = (typeof BudgetStatus)[keyof typeof BudgetStatus];

export const FiscalPeriodStatus = {
  OPEN: "open",
  CLOSED: "closed",
} as const;
export type FiscalPeriodStatus = (typeof FiscalPeriodStatus)[keyof typeof FiscalPeriodStatus];

// ============ APPROVALS ============

export const ApprovalStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  RETURNED: "returned",
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const Priority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

// ============ PROCUREMENT ============

export const SupplierStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  BLACKLISTED: "blacklisted",
} as const;
export type SupplierStatus = (typeof SupplierStatus)[keyof typeof SupplierStatus];

export const PurchaseRequestStatus = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  ORDERED: "ordered",
  CANCELLED: "cancelled",
} as const;
export type PurchaseRequestStatus =
  (typeof PurchaseRequestStatus)[keyof typeof PurchaseRequestStatus];

export const PurchaseOrderStatus = {
  DRAFT: "draft",
  SENT: "sent",
  PARTIAL: "partial",
  RECEIVED: "received",
  CLOSED: "closed",
  CANCELLED: "cancelled",
} as const;
export type PurchaseOrderStatus = (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const QuoteStatus = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
} as const;
export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

// ============ INVENTORY ============

export const InventoryItemStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type InventoryItemStatus = (typeof InventoryItemStatus)[keyof typeof InventoryItemStatus];

export const WarehouseStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type WarehouseStatus = (typeof WarehouseStatus)[keyof typeof WarehouseStatus];

export const StockMovementType = {
  IN: "in",
  OUT: "out",
  TRANSFER: "transfer",
  ADJUSTMENT: "adjustment",
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

export const StocktakeStatus = {
  DRAFT: "draft",
  COUNTING: "counting",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type StocktakeStatus = (typeof StocktakeStatus)[keyof typeof StocktakeStatus];

// ============ GRANTS / ENDOWMENTS ============

export const GrantStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;
export type GrantStatus = (typeof GrantStatus)[keyof typeof GrantStatus];

export const EndowmentType = {
  GENERAL: "general",
  SPECIFIC: "specific",
  INVESTMENT: "investment",
} as const;
export type EndowmentType = (typeof EndowmentType)[keyof typeof EndowmentType];

export const EndowmentStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type EndowmentStatus = (typeof EndowmentStatus)[keyof typeof EndowmentStatus];

export const EndowmentReturnStatus = {
  REALIZED: "realized",
  EXPECTED: "expected",
} as const;
export type EndowmentReturnStatus =
  (typeof EndowmentReturnStatus)[keyof typeof EndowmentReturnStatus];

// ============ DONOR ORGANIZATIONS (الجهات المانحة) ============

export const DonorOrgCategory = {
  GOVERNMENT: "government",
  INTERNATIONAL: "international",
  PARTNER: "partner",
  PRIVATE: "private",
} as const;
export type DonorOrgCategory = (typeof DonorOrgCategory)[keyof typeof DonorOrgCategory];

export const DonorOrgStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type DonorOrgStatus = (typeof DonorOrgStatus)[keyof typeof DonorOrgStatus];

// ============ RECURRING DONATIONS (التبرعات المتكررة) ============

export const RecurringFrequency = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
} as const;
export type RecurringFrequency = (typeof RecurringFrequency)[keyof typeof RecurringFrequency];

export const RecurringStatus = {
  ACTIVE: "active",
  PAUSED: "paused",
} as const;
export type RecurringStatus = (typeof RecurringStatus)[keyof typeof RecurringStatus];

// ============ NOTIFICATIONS (التنبيهات) ============

export const NotificationTone = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
  SUCCESS: "success",
} as const;
export type NotificationTone = (typeof NotificationTone)[keyof typeof NotificationTone];

// ============ SAVED REPORTS (التقارير المحفوظة) ============

export const ReportType = {
  FINANCIAL: "financial",
  DONATIONS: "donations",
  PROJECTS: "projects",
  BENEFICIARIES: "beneficiaries",
  GRANTS: "grants",
  PROCUREMENT: "procurement",
  INVENTORY: "inventory",
} as const;
export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export const ReportPeriod = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  SEMIANNUAL: "semiannual",
  ANNUAL: "annual",
  CUSTOM: "custom",
} as const;
export type ReportPeriod = (typeof ReportPeriod)[keyof typeof ReportPeriod];

export const ReportFormat = {
  PDF: "pdf",
  EXCEL: "excel",
  CSV: "csv",
} as const;
export type ReportFormat = (typeof ReportFormat)[keyof typeof ReportFormat];

// ============ INTEGRATIONS & WEBHOOKS (التكاملات) ============

export const IntegrationCategory = {
  PAYMENTS: "payments",
  BANKS: "banks",
  GOVERNMENT: "government",
  TELECOM: "telecom",
  DEV: "dev",
} as const;
export type IntegrationCategory = (typeof IntegrationCategory)[keyof typeof IntegrationCategory];

export const IntegrationStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type IntegrationStatus = (typeof IntegrationStatus)[keyof typeof IntegrationStatus];

export const WebhookEvent = {
  DONATION_CREATED: "donation_created",
  BENEFICIARY_CREATED: "beneficiary_created",
  PROJECT_CREATED: "project_created",
  JOURNAL_ENTRY: "journal_entry",
  INVOICE: "invoice",
} as const;
export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent];

// ============ BACKUP (النسخ الاحتياطي) ============

export const BackupFrequency = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;
export type BackupFrequency = (typeof BackupFrequency)[keyof typeof BackupFrequency];

export const BackupType = {
  MANUAL: "manual",
  AUTO: "auto",
} as const;
export type BackupType = (typeof BackupType)[keyof typeof BackupType];

export const BackupStatus = {
  SUCCESS: "success",
  FAILED: "failed",
  RUNNING: "running",
} as const;
export type BackupStatus = (typeof BackupStatus)[keyof typeof BackupStatus];

// ============ PAYROLL (مسير الرواتب) ============

export const PayrollStatus = {
  DRAFT: "draft",
  APPROVED: "approved",
} as const;
export type PayrollStatus = (typeof PayrollStatus)[keyof typeof PayrollStatus];

export const PayrollPayMethod = {
  CASH: "cash",
  BANK: "bank",
  ACCRUE: "accrue",
} as const;
export type PayrollPayMethod = (typeof PayrollPayMethod)[keyof typeof PayrollPayMethod];

// ============ GOVERNANCE ============

export const MembershipRole = {
  MEMBER: "member",
  CHAIR: "chair",
  VICE_CHAIR: "vice_chair",
  TREASURER: "treasurer",
  SECRETARY: "secretary",
} as const;
export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

export const MembershipType = {
  BOARD: "board",
  GENERAL_ASSEMBLY: "general_assembly",
  COMMITTEE: "committee",
} as const;
export type MembershipType = (typeof MembershipType)[keyof typeof MembershipType];

export const MembershipStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
} as const;
export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus];

export const MeetingStatus = {
  SCHEDULED: "scheduled",
  HELD: "held",
  CANCELLED: "cancelled",
} as const;
export type MeetingStatus = (typeof MeetingStatus)[keyof typeof MeetingStatus];

// ============ FIXED ASSETS ============

export const AssetStatus = {
  ACTIVE: "active",
  DISPOSED: "disposed",
  UNDER_MAINTENANCE: "under_maintenance",
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const AssetCondition = {
  EXCELLENT: "excellent",
  GOOD: "good",
  FAIR: "fair",
  POOR: "poor",
} as const;
export type AssetCondition = (typeof AssetCondition)[keyof typeof AssetCondition];

export const DepreciationMethod = {
  STRAIGHT_LINE: "straight_line",
  DECLINING_BALANCE: "declining_balance",
} as const;
export type DepreciationMethod = (typeof DepreciationMethod)[keyof typeof DepreciationMethod];

export const AssetMovementType = {
  TRANSFER: "transfer",
  DISPOSAL: "disposal",
  MAINTENANCE: "maintenance",
  REVALUATION: "revaluation",
} as const;
export type AssetMovementType = (typeof AssetMovementType)[keyof typeof AssetMovementType];

// ============ HR ============

export const EmployeeStatus = {
  ACTIVE: "active",
  ON_LEAVE: "on_leave",
  TERMINATED: "terminated",
} as const;
export type EmployeeStatus = (typeof EmployeeStatus)[keyof typeof EmployeeStatus];
