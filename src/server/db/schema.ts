/**
 * ثواب — Canonical database schema (PostgreSQL only).
 *
 * All status/type/classification columns store ASCII enum keys from
 * `src/lib/enums.ts`. Arabic is applied at the UI layer only.
 *
 * Timestamps are stored as ISO-8601 strings (sortable) in text columns.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  doublePrecision,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql as drizzleSql } from "drizzle-orm";

// ============ USERS & AUTH ============

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    password: text("password").notNull(),
    phone: text("phone"),
    role: text("role").notNull().default("employee"),
    branchId: text("branch_id"),
    status: text("status").notNull().default("active"),
    avatar: text("avatar"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: text("created_at").notNull().default(""),
    lastLogin: text("last_login"),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

/**
 * One-time tokens for account setup / password reset sent by email. Only the
 * SHA-256 hash of the token is stored — the raw token lives only in the emailed
 * link. A token is single-use (usedAt) and time-bounded (expiresAt).
 */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull(), // 'invite' | 'reset'
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("auth_tokens_token_hash_idx").on(t.tokenHash),
    userIdx: index("auth_tokens_user_idx").on(t.userId),
  }),
);

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: text("permissions").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(""),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull().unique(),
    ip: text("ip").default(""),
    userAgent: text("user_agent").default(""),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    tokenIdx: uniqueIndex("sessions_token_idx").on(t.token),
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

// Failed-login tracking for rate limiting / lockout.
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().default(""),
    ip: text("ip").notNull().default(""),
    success: boolean("success").notNull().default(false),
    at: text("at").notNull().default(""),
  },
  (t) => ({
    emailIdx: index("login_attempts_email_idx").on(t.email),
    ipIdx: index("login_attempts_ip_idx").on(t.ip),
  }),
);

// ============ BRANCHES ============

export const branches = pgTable("branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  manager: text("manager"),
  phone: text("phone"),
  email: text("email"),
  status: text("status").notNull().default("active"),
  // National Address (العنوان الوطني السعودي) — city reused from above
  buildingNo: text("building_no").default(""),
  street: text("street").default(""),
  district: text("district").default(""),
  postalCode: text("postal_code").default(""),
  additionalNo: text("additional_no").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ DONORS ============

export const donors = pgTable(
  "donors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull().default("individual"),
    email: text("email"),
    phone: text("phone"),
    city: text("city").default(""),
    address: text("address").default(""),
    tag: text("tag").default("bronze"),
    totalDonations: doublePrecision("total_donations").notNull().default(0),
    donationCount: integer("donation_count").notNull().default(0),
    lastDonation: text("last_donation"),
    recurring: boolean("recurring").notNull().default(false),
    notes: text("notes").default(""),
    status: text("status").notNull().default("active"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    statusIdx: index("donors_status_idx").on(t.status),
  }),
);

// ============ CAMPAIGNS ============

export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  goal: doublePrecision("goal").notNull().default(0),
  raised: doublePrecision("raised").notNull().default(0),
  startDate: text("start_date").default(""),
  endDate: text("end_date").default(""),
  status: text("status").notNull().default("planned"),
  description: text("description").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

// ============ PROJECTS ============

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").default(""),
  type: text("type").default(""),
  category: text("category").default(""),
  branch: text("branch").default(""),
  manager: text("manager").notNull(),
  budget: doublePrecision("budget").notNull().default(0),
  spent: doublePrecision("spent").notNull().default(0),
  donations: doublePrecision("donations").notNull().default(0),
  beneficiaryCount: integer("beneficiary_count").notNull().default(0),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("planned"),
  fund: text("fund").notNull().default("unrestricted"),
  startDate: text("start_date").default(""),
  endDate: text("end_date").default(""),
  description: text("description").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ DONATIONS ============

export const donations = pgTable(
  "donations",
  {
    id: text("id").primaryKey(),
    donorId: text("donor_id")
      .notNull()
      .references(() => donors.id),
    projectId: text("project_id").references(() => projects.id),
    campaignId: text("campaign_id").references(() => campaigns.id),
    amount: doublePrecision("amount").notNull(),
    method: text("method").notNull().default("cash"),
    channel: text("channel").notNull().default("direct"),
    fund: text("fund").notNull().default("unrestricted"),
    status: text("status").notNull().default("draft"),
    receiptId: text("receipt_id"),
    journalEntryId: text("journal_entry_id"),
    notes: text("notes").default(""),
    date: text("date").notNull().default(""),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    donorIdx: index("donations_donor_idx").on(t.donorId),
    statusIdx: index("donations_status_idx").on(t.status),
  }),
);

// ============ BENEFICIARIES ============

export const beneficiaries = pgTable(
  "beneficiaries",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    fileNumber: text("file_number").default(""),
    idNumber: text("id_number").default(""),
    phone: text("phone"),
    city: text("city").default(""),
    address: text("address").default(""),
    category: text("category").notNull().default("needy_family"),
    status: text("status").notNull().default("new"),
    familyMembers: integer("family_members").notNull().default(1),
    monthlyIncome: doublePrecision("monthly_income").notNull().default(0),
    maritalStatus: text("marital_status").default(""),
    notes: text("notes").default(""),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    statusIdx: index("beneficiaries_status_idx").on(t.status),
  }),
);

// ============ AID RECORDS ============

export const aidRecords = pgTable("aid_records", {
  id: text("id").primaryKey(),
  beneficiaryId: text("beneficiary_id")
    .notNull()
    .references(() => beneficiaries.id),
  projectId: text("project_id").references(() => projects.id),
  type: text("type").notNull().default("urgent"),
  amount: doublePrecision("amount").notNull().default(0),
  fund: text("fund").notNull().default("unrestricted"),
  status: text("status").notNull().default("pending"),
  journalEntryId: text("journal_entry_id"),
  date: text("date").notNull().default(""),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: text("approved_at"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
  deliveredAt: text("delivered_at"),
  deliveredBy: text("delivered_by").references(() => users.id),
  deliveryMethod: text("delivery_method").default(""),
  deliveryNotes: text("delivery_notes").default(""),
});

// ============ RECEIPTS ============

export const receipts = pgTable("receipts", {
  id: text("id").primaryKey(),
  donationId: text("donation_id").references(() => donations.id),
  number: text("number").notNull().unique(),
  amount: doublePrecision("amount").notNull(),
  date: text("date").notNull().default(""),
  type: text("type").notNull().default("donation"),
  status: text("status").notNull().default("issued"),
  printed: boolean("printed").notNull().default(false),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

// ============ FINANCE ============

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    // Accounting nature (asset/liability/equity/revenue/expense).
    classification: text("classification").notNull(),
    // Hierarchy nature is expressed by `postable` (false = header/group).
    level: integer("level").notNull().default(1),
    parentId: text("parent_id"),
    // Stable key for special accounts the posting engine resolves
    // (e.g. "cash", "bank_main", "donations_revenue"). Nullable/unique.
    systemKey: text("system_key").unique(),
    currency: text("currency").notNull().default("SAR"),
    balance: doublePrecision("balance").notNull().default(0),
    postable: boolean("postable").notNull().default(true),
    status: text("status").notNull().default("active"),
    description: text("description").default(""),
    notes: text("notes").default(""),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    codeIdx: uniqueIndex("accounts_code_idx").on(t.code),
    classIdx: index("accounts_classification_idx").on(t.classification),
    parentIdx: index("accounts_parent_idx").on(t.parentId),
  }),
);

// Phase 3B.2 — explicit provenance for system-purpose GL account mappings. The
// mapping itself still lives in accounts.system_key; this table records that an
// authorized Finance administrator EXPLICITLY confirmed which account plays a
// purpose (e.g. INPUT_VAT), so a mapping of unknown provenance is never trusted
// for posting. Configuration only — carries NO financial amount, is NOT a chart
// of accounts. `purpose` is unique (one confirmation per purpose).
export const financeAccountMappingConfirmations = pgTable(
  "finance_account_mapping_confirmations",
  {
    id: text("id").primaryKey(),
    purpose: text("purpose").notNull().unique(), // e.g. "INPUT_VAT"
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    confirmedBy: text("confirmed_by").references(() => users.id),
    confirmedAt: text("confirmed_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    purposeIdx: uniqueIndex("finance_account_mapping_confirmations_purpose_idx").on(t.purpose),
  }),
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: text("id").primaryKey(),
    number: text("number").notNull().unique(),
    date: text("date").notNull().default(""),
    description: text("description").notNull().default(""),
    amount: doublePrecision("amount").notNull().default(0), // total debits = total credits
    fund: text("fund").notNull().default("unrestricted"),
    currency: text("currency").notNull().default("SAR"),
    periodId: text("period_id"),
    projectId: text("project_id").references(() => projects.id),
    source: text("source").notNull().default("manual"),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    status: text("status").notNull().default("draft"),
    // Phase 1B workflow actors (maker → checker → poster). Full chronological
    // history lives in finance_workflow_events; these are the latest-actor
    // convenience columns.
    submittedBy: text("submitted_by").references(() => users.id),
    submittedAt: text("submitted_at"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    postedBy: text("posted_by").references(() => users.id),
    postedAt: text("posted_at"),
    reversedBy: text("reversed_by"),
    reversedAt: text("reversed_at"),
    reversedOf: text("reversed_of"),
    notes: text("notes").default(""),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    statusIdx: index("journal_entries_status_idx").on(t.status),
    dateIdx: index("journal_entries_date_idx").on(t.date),
    periodIdx: index("journal_entries_period_idx").on(t.periodId),
  }),
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: text("id").primaryKey(),
    journalEntryId: text("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    description: text("description").default(""),
    debit: doublePrecision("debit").notNull().default(0),
    credit: doublePrecision("credit").notNull().default(0),
    fund: text("fund").notNull().default("unrestricted"),
    costCenterId: text("cost_center_id").references(() => costCenters.id),
    projectId: text("project_id").references(() => projects.id),
    notes: text("notes").default(""),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    entryIdx: index("journal_lines_entry_idx").on(t.journalEntryId),
    accountIdx: index("journal_lines_account_idx").on(t.accountId),
  }),
);

// Phase 1B — immutable financial workflow history. Every governance transition
// (submit/approve/return/reject/post/reverse/cancel, period close/reopen)
// appends one row; rows are never updated or deleted. Reason is required for
// return/reject/reverse/reopen. No PII beyond actor id/name.
export const financeWorkflowEvents = pgTable(
  "finance_workflow_events",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(), // journal_entry | fiscal_period
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(), // submit|approve|return|reject|post|reverse|cancel|close|reopen
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    userId: text("user_id").references(() => users.id),
    userName: text("user_name").default(""),
    reason: text("reason").default(""),
    metadata: text("metadata").default("{}"),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    entityIdx: index("finance_workflow_events_entity_idx").on(t.entityType, t.entityId),
    createdIdx: index("finance_workflow_events_created_idx").on(t.createdAt),
  }),
);

export const costCenters = pgTable("cost_centers", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  manager: text("manager").default(""),
  budget: doublePrecision("budget").notNull().default(0),
  spent: doublePrecision("spent").notNull().default(0),
  status: text("status").notNull().default("active"),
  description: text("description").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const budgets = pgTable("budgets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  year: text("year").notNull(),
  amount: doublePrecision("amount").notNull(),
  spent: doublePrecision("spent").notNull().default(0),
  department: text("department").default(""),
  status: text("status").notNull().default("draft"),
  currency: text("currency").notNull().default("SAR"),
  description: text("description").default(""),
  notes: text("notes").default(""),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: text("approved_at"),
  lockedBy: text("locked_by").references(() => users.id),
  lockedAt: text("locked_at"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const budgetLines = pgTable("budget_lines", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id")
    .notNull()
    .references(() => budgets.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  accountId: text("account_id").references(() => accounts.id),
  costCenterId: text("cost_center_id").references(() => costCenters.id),
  projectId: text("project_id").references(() => projects.id),
  plannedAmount: doublePrecision("planned_amount").notNull().default(0),
  actualAmount: doublePrecision("actual_amount").notNull().default(0),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ FISCAL PERIODS ============

export const fiscalPeriods = pgTable("fiscal_periods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  status: text("status").notNull().default("open"),
  closedAt: text("closed_at"),
  closedById: text("closed_by_id"),
  closedByName: text("closed_by_name"),
  reopenedAt: text("reopened_at"),
  reopenedById: text("reopened_by_id"),
  reopenedByName: text("reopened_by_name"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ IMPORT BATCHES ============
// Traceable identity for every Excel import; enables file-hash de-duplication
// and links imported journals back to their batch (source_id = batch id).
export const importBatches = pgTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull().default("journal"), // journal | budget
    fileName: text("file_name").notNull().default(""),
    fileHash: text("file_hash").notNull().default(""),
    rowCount: integer("row_count").notNull().default(0),
    journalCount: integer("journal_count").notNull().default(0),
    status: text("status").notNull().default("processing"), // processing | success | failed
    errorSummary: text("error_summary").default(""),
    importedBy: text("imported_by").references(() => users.id),
    importedAt: text("imported_at").notNull().default(""),
  },
  (t) => ({
    hashIdx: index("import_batches_hash_idx").on(t.fileHash),
  }),
);

// ============ FINANCE CERTIFICATIONS ============
// Immutable record of each Phase 1A production certification (insert + read
// only; never updated/deleted). Stores accounting-integrity metrics only — no
// secrets, no narration/PII.
export const financeCertifications = pgTable(
  "finance_certifications",
  {
    id: text("id").primaryKey(),
    phase: text("phase").notNull().default("FINANCE_PHASE_1A"),
    environment: text("environment").notNull().default("production"),
    status: text("status").notNull(), // PRODUCTION_READY | PRODUCTION_BLOCKED | PENDING_MIGRATIONS
    applicationCommit: text("application_commit").default(""),
    resultJson: text("result_json").notNull().default("{}"),
    certifiedBy: text("certified_by").references(() => users.id),
    certifiedByName: text("certified_by_name").default(""),
    certifiedAt: text("certified_at").notNull().default(""),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    // Idempotency: at most one certificate per (phase, environment, commit).
    // A second certify of the same deployed commit returns the existing record.
    uniqueCert: uniqueIndex("finance_certifications_phase_env_commit_idx").on(
      t.phase,
      t.environment,
      t.applicationCommit,
    ),
  }),
);

// ============ CASH & BANK (Phase 2A) ============
// Operational master records. They NEVER store an accounting balance — every
// displayed balance derives from the General Ledger of `linked_account_id`.
// One GL account maps to at most one operational identity (unique per table +
// cross-table check in the service). Mapping is immutable once the account has
// posted history.
export const cashboxes = pgTable(
  "cashboxes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    linkedAccountId: text("linked_account_id")
      .notNull()
      .references(() => accounts.id),
    currency: text("currency").notNull().default("SAR"),
    status: text("status").notNull().default("active"), // active | inactive
    branchId: text("branch_id").references(() => branches.id),
    notes: text("notes").default(""),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    // One GL account → at most one cashbox.
    linkedIdx: uniqueIndex("cashboxes_linked_account_idx").on(t.linkedAccountId),
    statusIdx: index("cashboxes_status_idx").on(t.status),
  }),
);

export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    bankName: text("bank_name").notNull(),
    accountName: text("account_name").notNull().default(""),
    accountNumber: text("account_number"),
    iban: text("iban"), // display form (as entered, normalized)
    ibanNormalized: text("iban_normalized"), // unique when present
    currency: text("currency").notNull().default("SAR"),
    linkedAccountId: text("linked_account_id")
      .notNull()
      .references(() => accounts.id),
    status: text("status").notNull().default("active"),
    branchId: text("branch_id").references(() => branches.id),
    notes: text("notes").default(""),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    linkedIdx: uniqueIndex("bank_accounts_linked_account_idx").on(t.linkedAccountId),
    ibanIdx: uniqueIndex("bank_accounts_iban_normalized_idx").on(t.ibanNormalized),
    statusIdx: index("bank_accounts_status_idx").on(t.status),
  }),
);

// ============ RECEIPT VOUCHERS (سندات القبض) — Phase 2B ============
//
// An operational money-in document. Debit = the selected Cashbox/Bank's linked
// GL account; credits = the voucher lines. NO stored accounting balance: every
// balance stays GL-derived (Phase 2A/1A). Exactly ONE of cashbox_id /
// bank_account_id is set (DB CHECK in migration 0018). journal_entry_id is set
// only on POST and is unique (one voucher → one journal).
export const receiptVouchers = pgTable(
  "receipt_vouchers",
  {
    id: text("id").primaryKey(),
    voucherNumber: text("voucher_number").notNull().unique(),
    voucherDate: text("voucher_date").notNull().default(""), // accounting date
    status: text("status").notNull().default("draft"),
    // Destination master — exactly one is set (enforced server-side + DB CHECK).
    cashboxId: text("cashbox_id").references(() => cashboxes.id),
    bankAccountId: text("bank_account_id").references(() => bankAccounts.id),
    // Counterparty — free-text payer always valid; optional typed reference to an
    // existing entity (donor/beneficiary/…) without requiring those modules.
    payerName: text("payer_name").notNull().default(""),
    payerReferenceType: text("payer_reference_type"),
    payerReferenceId: text("payer_reference_id"),
    externalReference: text("external_reference"),
    description: text("description").default(""),
    notes: text("notes").default(""),
    currency: text("currency").notNull().default("SAR"),
    totalAmount: doublePrecision("total_amount").notNull().default(0),
    // Set only on POST; unique so a voucher can never own two journals.
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    // Latest-actor convenience columns; full history in finance_workflow_events.
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
    submittedBy: text("submitted_by").references(() => users.id),
    submittedAt: text("submitted_at"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    postedBy: text("posted_by").references(() => users.id),
    postedAt: text("posted_at"),
    reversedBy: text("reversed_by").references(() => users.id),
    reversedAt: text("reversed_at"),
  },
  (t) => ({
    numberIdx: uniqueIndex("receipt_vouchers_number_idx").on(t.voucherNumber),
    journalIdx: uniqueIndex("receipt_vouchers_journal_entry_idx").on(t.journalEntryId),
    statusIdx: index("receipt_vouchers_status_idx").on(t.status),
    dateIdx: index("receipt_vouchers_date_idx").on(t.voucherDate),
    cashboxIdx: index("receipt_vouchers_cashbox_idx").on(t.cashboxId),
    bankIdx: index("receipt_vouchers_bank_idx").on(t.bankAccountId),
  }),
);

export const receiptVoucherLines = pgTable(
  "receipt_voucher_lines",
  {
    id: text("id").primaryKey(),
    receiptVoucherId: text("receipt_voucher_id")
      .notNull()
      .references(() => receiptVouchers.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull().default(1),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    amount: doublePrecision("amount").notNull().default(0),
    description: text("description").default(""),
    costCenterId: text("cost_center_id").references(() => costCenters.id),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    voucherIdx: index("receipt_voucher_lines_voucher_idx").on(t.receiptVoucherId),
    accountIdx: index("receipt_voucher_lines_account_idx").on(t.accountId),
  }),
);

// ============ PAYMENT VOUCHERS (سندات الصرف) — Phase 2C ============
//
// An operational money-out document. Debit = the payment allocation lines;
// credit = the selected Cashbox/Bank's linked GL account. NO stored accounting
// balance. Exactly ONE of cashbox_id / bank_account_id (DB CHECK in migration
// 0019). journal_entry_id is set only on POST and is unique. Cashbox payments
// additionally require sufficient book cash (checked under an advisory lock at
// posting) — see payment-voucher.ts.
export const paymentVouchers = pgTable(
  "payment_vouchers",
  {
    id: text("id").primaryKey(),
    voucherNumber: text("voucher_number").notNull().unique(),
    voucherDate: text("voucher_date").notNull().default(""), // accounting date
    status: text("status").notNull().default("draft"),
    cashboxId: text("cashbox_id").references(() => cashboxes.id),
    bankAccountId: text("bank_account_id").references(() => bankAccounts.id),
    payeeName: text("payee_name").notNull().default(""),
    payeeReferenceType: text("payee_reference_type"),
    payeeReferenceId: text("payee_reference_id"),
    externalReference: text("external_reference"),
    description: text("description").default(""),
    notes: text("notes").default(""),
    currency: text("currency").notNull().default("SAR"),
    totalAmount: doublePrecision("total_amount").notNull().default(0),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
    submittedBy: text("submitted_by").references(() => users.id),
    submittedAt: text("submitted_at"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    postedBy: text("posted_by").references(() => users.id),
    postedAt: text("posted_at"),
    reversedBy: text("reversed_by").references(() => users.id),
    reversedAt: text("reversed_at"),
  },
  (t) => ({
    numberIdx: uniqueIndex("payment_vouchers_number_idx").on(t.voucherNumber),
    journalIdx: uniqueIndex("payment_vouchers_journal_entry_idx").on(t.journalEntryId),
    statusIdx: index("payment_vouchers_status_idx").on(t.status),
    dateIdx: index("payment_vouchers_date_idx").on(t.voucherDate),
    cashboxIdx: index("payment_vouchers_cashbox_idx").on(t.cashboxId),
    bankIdx: index("payment_vouchers_bank_idx").on(t.bankAccountId),
  }),
);

export const paymentVoucherLines = pgTable(
  "payment_voucher_lines",
  {
    id: text("id").primaryKey(),
    paymentVoucherId: text("payment_voucher_id")
      .notNull()
      .references(() => paymentVouchers.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull().default(1),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    amount: doublePrecision("amount").notNull().default(0),
    description: text("description").default(""),
    costCenterId: text("cost_center_id").references(() => costCenters.id),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    voucherIdx: index("payment_voucher_lines_voucher_idx").on(t.paymentVoucherId),
    accountIdx: index("payment_voucher_lines_account_idx").on(t.accountId),
  }),
);

// ============ APPROVALS ============

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  requester: text("requester").notNull(),
  amount: doublePrecision("amount").notNull().default(0),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("medium"),
  level: integer("level").notNull().default(1),
  projectId: text("project_id").references(() => projects.id),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ SUPPLIERS ============

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  activity: text("activity").default(""),
  phone: text("phone"),
  email: text("email"),
  taxNumber: text("tax_number").default(""),
  contactPerson: text("contact_person").default(""),
  address: text("address").default(""),
  // National Address (العنوان الوطني السعودي)
  buildingNo: text("building_no").default(""),
  street: text("street").default(""),
  district: text("district").default(""),
  city: text("city").default(""),
  postalCode: text("postal_code").default(""),
  additionalNo: text("additional_no").default(""),
  rating: doublePrecision("rating").notNull().default(0),
  // LEGACY, non-authoritative (Phase 3A). Accounting payable is derived from the
  // GL via the supplier AP subledger (supplier_journal_links → journal_lines).
  // Kept only for pre-3A procurement compatibility; never shown as accounting truth.
  balance: doublePrecision("balance").notNull().default(0),
  notes: text("notes").default(""),
  status: text("status").notNull().default("active"),
  // Phase 3A — supplier financial identity (all non-destructive, optional).
  supplierCode: text("supplier_code"), // unique when present (SUP-000001)
  legalName: text("legal_name").default(""),
  commercialRegistration: text("commercial_registration"),
  currency: text("currency").notNull().default("SAR"),
  paymentTermsDays: integer("payment_terms_days"),
  bankName: text("bank_name"),
  iban: text("iban"), // sensitive — masked by default in responses
  ibanNormalized: text("iban_normalized"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// Phase 3A — Supplier AP subledger link. Maps a supplier to a SINGLE posted AP
// control-account journal line (the monetary amount lives ONLY in journal_lines).
// Supplier payable is derived by joining links → journal_lines → journal_entries
// (credit − debit, posted+reversed). journal_line_id is UNIQUE so one AP line can
// never belong to two suppliers. No independent debit/credit/balance is stored.
export const supplierJournalLinks = pgTable(
  "supplier_journal_links",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    journalLineId: text("journal_line_id")
      .notNull()
      .references(() => journalLines.id),
    sourceType: text("source_type"), // optional provenance (supplier_payment, supplier_invoice…)
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    lineIdx: uniqueIndex("supplier_journal_links_line_idx").on(t.journalLineId),
    supplierIdx: index("supplier_journal_links_supplier_idx").on(t.supplierId),
  }),
);

// Phase 3A.1 — Supplier payment event. Gives each supplier payment a STABLE
// business identity so the GL source_id is the payment id (not the supplier id):
// one supplier → many payments, one payment → exactly one journal. `id` (SPY-…)
// is the idempotency anchor; a retry with the same id reuses the existing result.
// journal_entry_id is UNIQUE (one payment → one journal). The money stays in the
// GL; this table holds no accounting balance.
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: text("id").primaryKey(), // stable payment-event id (SPY-…)
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    amount: doublePrecision("amount").notNull().default(0),
    paymentMethod: text("payment_method").notNull().default("bank"), // cash | bank (legacy)
    reference: text("reference"),
    paymentDate: text("payment_date").notNull().default(""),
    note: text("note").default(""),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    status: text("status").notNull().default("pending"), // pending | posted
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    journalIdx: uniqueIndex("supplier_payments_journal_entry_idx").on(t.journalEntryId),
    supplierIdx: index("supplier_payments_supplier_idx").on(t.supplierId),
  }),
);

// Phase 5A — Supplier Payment ↔ Invoice ALLOCATION (settlement metadata, NOT
// accounting). Each row records how much of ONE posted Supplier-Payment AP debit
// is attributed to ONE posted Supplier-Invoice AP credit. It stores NO balance:
// invoice outstanding and payment unapplied stay derived from real posted AP
// journal lines minus Σ active allocations. One effective row per (payment,
// invoice); amount strictly > 0 (a zero allocation is a removal). Creating/
// editing/removing a row produces NO journal, NO GL, NO cash/bank movement.
export const supplierPaymentAllocations = pgTable(
  "supplier_payment_allocations",
  {
    id: text("id").primaryKey(),
    supplierPaymentId: text("supplier_payment_id")
      .notNull()
      .references(() => supplierPayments.id),
    supplierInvoiceId: text("supplier_invoice_id")
      .notNull()
      .references(() => supplierInvoices.id),
    amount: doublePrecision("amount").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: text("updated_at"),
  },
  (t) => ({
    pairIdx: uniqueIndex("supplier_payment_allocations_pair_idx").on(
      t.supplierPaymentId,
      t.supplierInvoiceId,
    ),
    paymentIdx: index("supplier_payment_allocations_payment_idx").on(t.supplierPaymentId),
    invoiceIdx: index("supplier_payment_allocations_invoice_idx").on(t.supplierInvoiceId),
    amountPositive: check(
      "supplier_payment_allocations_amount_positive",
      drizzleSql`${t.amount} > 0`,
    ),
    // Phase 5A.1 — 2-decimal money guard (defense-in-depth; the service is the
    // authoritative check). Rejects sub-cent amounts while tolerating binary
    // float-noise on genuine 2dp doubles.
    amount2dp: check(
      "supplier_payment_allocations_amount_2dp",
      drizzleSql`abs(${t.amount} - round(${t.amount}::numeric, 2)) < 0.000001`,
    ),
  }),
);

// Phase 3B — Supplier Invoice (فاتورة مورد). A controlled financial DOCUMENT: its
// header/lines are NOT accounting truth. Only when POSTED does it create the
// certified accrual journal (Dr expense/asset + Dr input VAT / Cr accounts
// payable) and link the AP CREDIT line to the supplier subledger
// (supplier_journal_links). suppliers.balance is never read or written here.
export const supplierInvoices = pgTable(
  "supplier_invoices",
  {
    id: text("id").primaryKey(),
    // Internal system number (SI-2026-000001) — always unique, allocated on create.
    invoiceNumber: text("invoice_number").notNull().unique(),
    // Supplier's own invoice number as printed on their document.
    supplierInvoiceNumber: text("supplier_invoice_number").default(""),
    // Normalized (upper/trim) form used to detect duplicates per supplier.
    supplierInvoiceNumberNormalized: text("supplier_invoice_number_normalized").default(""),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    invoiceDate: text("invoice_date").notNull().default(""), // accounting date
    dueDate: text("due_date"),
    status: text("status").notNull().default("draft"),
    currency: text("currency").notNull().default("SAR"),
    subtotal: doublePrecision("subtotal").notNull().default(0),
    taxAmount: doublePrecision("tax_amount").notNull().default(0),
    totalAmount: doublePrecision("total_amount").notNull().default(0),
    externalReference: text("external_reference"),
    description: text("description").default(""),
    notes: text("notes").default(""),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
    submittedBy: text("submitted_by").references(() => users.id),
    submittedAt: text("submitted_at"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    postedBy: text("posted_by").references(() => users.id),
    postedAt: text("posted_at"),
    reversedBy: text("reversed_by").references(() => users.id),
    reversedAt: text("reversed_at"),
  },
  (t) => ({
    numberIdx: uniqueIndex("supplier_invoices_number_idx").on(t.invoiceNumber),
    journalIdx: uniqueIndex("supplier_invoices_journal_entry_idx").on(t.journalEntryId),
    // One supplier cannot have two invoices with the same (normalized) supplier
    // invoice number — duplicate-entry protection at the storage layer.
    supplierDocIdx: uniqueIndex("supplier_invoices_supplier_doc_idx").on(
      t.supplierId,
      t.supplierInvoiceNumberNormalized,
    ),
    supplierIdx: index("supplier_invoices_supplier_idx").on(t.supplierId),
    statusIdx: index("supplier_invoices_status_idx").on(t.status),
    dateIdx: index("supplier_invoices_date_idx").on(t.invoiceDate),
    dueIdx: index("supplier_invoices_due_idx").on(t.dueDate),
  }),
);

export const supplierInvoiceLines = pgTable(
  "supplier_invoice_lines",
  {
    id: text("id").primaryKey(),
    supplierInvoiceId: text("supplier_invoice_id")
      .notNull()
      .references(() => supplierInvoices.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull().default(1),
    description: text("description").default(""),
    // Phase 3E — line accounting mode. 'direct' = Phase 3B behavior (user picks a
    // valid expense/asset/liability debit). 'grn_matched' = clears GRNI for a
    // posted governed Goods Receipt line; the debit account is server-resolved to
    // the receipt's ACTUAL GRNI account (never chosen by the client).
    accountingMode: text("accounting_mode").notNull().default("direct"),
    // Debit target actually posted: the expense/asset for DIRECT lines, or the
    // matched receipt's GRNI control account for GRN_MATCHED lines (never AP/cash/bank).
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    quantity: doublePrecision("quantity").notNull().default(1),
    unitPrice: doublePrecision("unit_price").notNull().default(0),
    lineSubtotal: doublePrecision("line_subtotal").notNull().default(0),
    taxRate: doublePrecision("tax_rate").notNull().default(0), // percent, e.g. 15
    taxAmount: doublePrecision("tax_amount").notNull().default(0),
    lineTotal: doublePrecision("line_total").notNull().default(0),
    costCenterId: text("cost_center_id").references(() => costCenters.id),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    invoiceIdx: index("supplier_invoice_lines_invoice_idx").on(t.supplierInvoiceId),
    accountIdx: index("supplier_invoice_lines_account_idx").on(t.accountId),
  }),
);

// Phase 3E — Supplier Invoice ↔ Goods Receipt line-level matching allocation. A
// GRN_MATCHED invoice line consumes a quantity from a POSTED governed GRN line;
// this row records that ownership (the immutable matching evidence). It stores NO
// accounting balance — the GRNI clearing amount is DERIVED from the receipt's own
// posted line value under the exact-match rule. Invoiceable quantity per GRN line
// is GRN received qty − Σ matched_quantity over ACTIVE (POSTED) supplier invoices.
export const supplierInvoiceGrnAllocations = pgTable(
  "supplier_invoice_grn_allocations",
  {
    id: text("id").primaryKey(),
    supplierInvoiceId: text("supplier_invoice_id")
      .notNull()
      .references(() => supplierInvoices.id, { onDelete: "cascade" }),
    supplierInvoiceLineId: text("supplier_invoice_line_id")
      .notNull()
      .references(() => supplierInvoiceLines.id, { onDelete: "cascade" }),
    goodsReceiptId: text("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id),
    goodsReceiptLineId: text("goods_receipt_line_id")
      .notNull()
      .references(() => goodsReceiptLines.id),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id),
    purchaseOrderLineId: text("purchase_order_line_id").references(() => purchaseOrderLines.id),
    matchedQuantity: doublePrecision("matched_quantity").notNull().default(0),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    invoiceIdx: index("si_grn_alloc_invoice_idx").on(t.supplierInvoiceId),
    invoiceLineIdx: index("si_grn_alloc_invoice_line_idx").on(t.supplierInvoiceLineId),
    grnLineIdx: index("si_grn_alloc_grn_line_idx").on(t.goodsReceiptLineId),
    grnIdx: index("si_grn_alloc_grn_idx").on(t.goodsReceiptId),
  }),
);

// ============ SALES / ACCOUNTS RECEIVABLE (Phase Sales-1) ============

// Customer master (عميل) — the AR-side mirror of `suppliers`. A customer's
// receivable is NOT stored here as accounting truth; it is DERIVED from the GL
// via the customer AR subledger (customer_journal_links → journal_lines). There
// is deliberately no balance column.
export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    customerCode: text("customer_code"), // unique when present (CUST-000001)
    name: text("name").notNull(),
    legalName: text("legal_name").default(""),
    commercialRegistration: text("commercial_registration"),
    taxNumber: text("tax_number").default(""),
    phone: text("phone"),
    email: text("email"),
    contactPerson: text("contact_person").default(""),
    address: text("address").default(""),
    // National Address (العنوان الوطني السعودي)
    buildingNo: text("building_no").default(""),
    street: text("street").default(""),
    district: text("district").default(""),
    city: text("city").default(""),
    postalCode: text("postal_code").default(""),
    additionalNo: text("additional_no").default(""),
    currency: text("currency").notNull().default("SAR"),
    paymentTermsDays: integer("payment_terms_days"),
    notes: text("notes").default(""),
    status: text("status").notNull().default("active"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    codeIdx: uniqueIndex("customers_code_idx").on(t.customerCode),
    statusIdx: index("customers_status_idx").on(t.status),
  }),
);

// Customer AR subledger link — maps a customer to a SINGLE posted AR control
// journal line (the money lives ONLY in journal_lines). Receivable is derived by
// joining links → journal_lines → journal_entries (debit − credit, posted+reversed).
// journal_line_id is UNIQUE so one AR line can never belong to two customers.
export const customerJournalLinks = pgTable(
  "customer_journal_links",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    journalLineId: text("journal_line_id")
      .notNull()
      .references(() => journalLines.id),
    sourceType: text("source_type"), // optional provenance (sales_invoice, customer_receipt…)
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    lineIdx: uniqueIndex("customer_journal_links_line_idx").on(t.journalLineId),
    customerIdx: index("customer_journal_links_customer_idx").on(t.customerId),
  }),
);

// Sales Invoice (فاتورة مبيعات) — a controlled financial DOCUMENT. Its header/
// lines are NOT accounting truth: only POSTING creates the certified revenue
// journal (Dr accounts receivable / Cr revenue per line) and links the AR DEBIT
// line to the customer subledger (customer_journal_links) so the receivable
// rises automatically. Phase Sales-1 is revenue-only: no VAT, no inventory/COGS.
export const salesInvoices = pgTable(
  "sales_invoices",
  {
    id: text("id").primaryKey(),
    // Internal system number (SV-2026-000001) — always unique, allocated on create.
    invoiceNumber: text("invoice_number").notNull().unique(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    invoiceDate: text("invoice_date").notNull().default(""), // accounting date
    dueDate: text("due_date"),
    status: text("status").notNull().default("draft"),
    currency: text("currency").notNull().default("SAR"),
    subtotal: doublePrecision("subtotal").notNull().default(0),
    taxAmount: doublePrecision("tax_amount").notNull().default(0), // reserved; 0 in Sales-1
    totalAmount: doublePrecision("total_amount").notNull().default(0),
    // Net-asset fund + optional project — revenue is fund-tagged for charity funds.
    fund: text("fund").notNull().default("unrestricted"),
    projectId: text("project_id").references(() => projects.id),
    customerReference: text("customer_reference"), // customer's own PO/reference
    description: text("description").default(""),
    notes: text("notes").default(""),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
    submittedBy: text("submitted_by").references(() => users.id),
    submittedAt: text("submitted_at"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    postedBy: text("posted_by").references(() => users.id),
    postedAt: text("posted_at"),
    reversedBy: text("reversed_by").references(() => users.id),
    reversedAt: text("reversed_at"),
  },
  (t) => ({
    numberIdx: uniqueIndex("sales_invoices_number_idx").on(t.invoiceNumber),
    journalIdx: uniqueIndex("sales_invoices_journal_entry_idx").on(t.journalEntryId),
    customerIdx: index("sales_invoices_customer_idx").on(t.customerId),
    statusIdx: index("sales_invoices_status_idx").on(t.status),
    dateIdx: index("sales_invoices_date_idx").on(t.invoiceDate),
    dueIdx: index("sales_invoices_due_idx").on(t.dueDate),
  }),
);

export const salesInvoiceLines = pgTable(
  "sales_invoice_lines",
  {
    id: text("id").primaryKey(),
    salesInvoiceId: text("sales_invoice_id")
      .notNull()
      .references(() => salesInvoices.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull().default(1),
    description: text("description").default(""),
    // The REVENUE account credited when posted. Server-validated: revenue/postable/
    // active, never AR/cash/bank/control.
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    quantity: doublePrecision("quantity").notNull().default(1),
    unitPrice: doublePrecision("unit_price").notNull().default(0),
    lineSubtotal: doublePrecision("line_subtotal").notNull().default(0),
    taxRate: doublePrecision("tax_rate").notNull().default(0), // reserved; 0 in Sales-1
    taxAmount: doublePrecision("tax_amount").notNull().default(0),
    lineTotal: doublePrecision("line_total").notNull().default(0),
    costCenterId: text("cost_center_id").references(() => costCenters.id),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    invoiceIdx: index("sales_invoice_lines_invoice_idx").on(t.salesInvoiceId),
    accountIdx: index("sales_invoice_lines_account_idx").on(t.accountId),
  }),
);

// Phase Sales-2 — Customer Receipt event (تحصيل من عميل). The AR mirror of
// supplier_payments: a posted receipt journals Dr Cash|Bank / Cr AR and links the
// AR CREDIT line to the customer subledger (receivable falls). `id` (CRC-…) is the
// idempotency anchor; a retry with the same id reuses the existing journal.
// journal_entry_id is UNIQUE (one receipt → one journal). No stored balance.
export const customerReceipts = pgTable(
  "customer_receipts",
  {
    id: text("id").primaryKey(), // stable receipt-event id (CRC-…)
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    amount: doublePrecision("amount").notNull().default(0),
    receiptMethod: text("receipt_method").notNull().default("bank"), // cash | bank
    reference: text("reference"),
    receiptDate: text("receipt_date").notNull().default(""),
    note: text("note").default(""),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    status: text("status").notNull().default("pending"), // pending | posted
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => ({
    journalIdx: uniqueIndex("customer_receipts_journal_entry_idx").on(t.journalEntryId),
    customerIdx: index("customer_receipts_customer_idx").on(t.customerId),
  }),
);

// Phase Sales-2 — Customer Receipt ↔ Sales-Invoice ALLOCATION (settlement metadata,
// NOT accounting). Records how much of ONE posted receipt's AR credit is attributed
// to ONE posted sales invoice's AR debit. Stores NO balance: invoice outstanding
// and receipt unapplied stay derived from real posted AR journal lines minus Σ
// active allocations. One effective row per (receipt, invoice); amount strictly > 0.
// Creating/editing/removing a row produces NO journal, NO GL, NO cash/bank movement.
export const customerReceiptAllocations = pgTable(
  "customer_receipt_allocations",
  {
    id: text("id").primaryKey(),
    customerReceiptId: text("customer_receipt_id")
      .notNull()
      .references(() => customerReceipts.id),
    salesInvoiceId: text("sales_invoice_id")
      .notNull()
      .references(() => salesInvoices.id),
    amount: doublePrecision("amount").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: text("updated_at"),
  },
  (t) => ({
    pairIdx: uniqueIndex("customer_receipt_allocations_pair_idx").on(
      t.customerReceiptId,
      t.salesInvoiceId,
    ),
    receiptIdx: index("customer_receipt_allocations_receipt_idx").on(t.customerReceiptId),
    invoiceIdx: index("customer_receipt_allocations_invoice_idx").on(t.salesInvoiceId),
    amountPositive: check(
      "customer_receipt_allocations_amount_positive",
      drizzleSql`${t.amount} > 0`,
    ),
    // 2-decimal money guard (defense-in-depth; the service is authoritative).
    amount2dp: check(
      "customer_receipt_allocations_amount_2dp",
      drizzleSql`abs(${t.amount} - round(${t.amount}::numeric, 2)) < 0.000001`,
    ),
  }),
);

// ============ PURCHASES ============

export const purchaseRequests = pgTable("purchase_requests", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  department: text("department").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("draft"),
  requester: text("requester").default(""),
  amount: doublePrecision("amount").notNull().default(0),
  deliveryDate: text("delivery_date").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplierId: text("supplier_id").references(() => suppliers.id),
  requestId: text("request_id").references(() => purchaseRequests.id),
  subject: text("subject").notNull(),
  date: text("date").notNull().default(""),
  deliveryDate: text("delivery_date").default(""),
  status: text("status").notNull().default("draft"),
  total: doublePrecision("total").notNull().default(0),
  receivedAmount: doublePrecision("received_amount").notNull().default(0),
  journalEntryId: text("journal_entry_id"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
  // Phase 3C — governed Purchase Order fields (all additive; legacy rows keep
  // governance_mode='legacy' and NULL/zero here). A governed PO is a purchasing
  // COMMITMENT document with NO GL/AP/inventory effect; it never runs through the
  // legacy AP-posting receive flow. No journal_entry_id is used for governed POs.
  // Phase 3C.1 cutover: NEW rows default to 'governed' (a DB safety net so a direct
  // insert that omits the field can never fall back to the frozen legacy path).
  // Existing historical rows keep 'legacy' (never rewritten). The default is a
  // safety net, NOT authorization — the governed service remains the only supported
  // creation path and still enforces all mandatory governed fields/workflow.
  governanceMode: text("governance_mode").notNull().default("governed"), // legacy | governed
  poNumber: text("po_number"), // PO-2026-000001 (governed only; unique when present)
  currency: text("currency").notNull().default("SAR"),
  supplierReference: text("supplier_reference"),
  subtotal: doublePrecision("subtotal").notNull().default(0),
  taxAmount: doublePrecision("tax_amount").notNull().default(0),
  totalAmount: doublePrecision("total_amount").notNull().default(0),
  submittedBy: text("submitted_by").references(() => users.id),
  submittedAt: text("submitted_at"),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: text("approved_at"),
  issuedBy: text("issued_by").references(() => users.id),
  issuedAt: text("issued_at"),
  cancelledBy: text("cancelled_by").references(() => users.id),
  cancelledAt: text("cancelled_at"),
});

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  itemId: text("item_id").references(() => inventoryItems.id),
  description: text("description").notNull().default(""),
  quantity: doublePrecision("quantity").notNull().default(0),
  unitPrice: doublePrecision("unit_price").notNull().default(0),
  receivedQuantity: doublePrecision("received_quantity").notNull().default(0),
  unit: text("unit").default(""),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
  // Phase 3C — governed line fields (additive; commitment value only, no GL).
  lineType: text("line_type").notNull().default("ITEM"), // ITEM|SERVICE|ASSET|EXPENSE|OTHER
  accountId: text("account_id").references(() => accounts.id), // optional target (future receiving)
  costCenterId: text("cost_center_id").references(() => costCenters.id),
  lineSubtotal: doublePrecision("line_subtotal").notNull().default(0),
  taxRate: doublePrecision("tax_rate").notNull().default(0),
  taxAmount: doublePrecision("tax_amount").notNull().default(0),
  lineTotal: doublePrecision("line_total").notNull().default(0),
});

// Phase 3D — governed Goods Receipt (GRN). A receiving event against an ISSUED
// governed Purchase Order. On POST it books (atomically) Dr receipt/inventory/
// expense/asset per line / Cr GRNI accrual — NEVER Accounts Payable, NEVER
// suppliers.balance, NEVER supplier_journal_links, NEVER Input VAT. Governed
// received quantity is DERIVED by summing posted GRN lines (no competing truth).
export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: text("id").primaryKey(),
    grnNumber: text("grn_number").notNull().unique(), // GRN-2026-000001
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    supplierId: text("supplier_id").references(() => suppliers.id),
    receiptDate: text("receipt_date").notNull().default(""),
    // draft | submitted | approved | rejected | posted | reversed. Governance
    // lifecycle (Phase 3D.1): only POSTED/REVERSED touch the GL, GRNI subledger
    // and inventory; DRAFT/SUBMITTED/APPROVED/REJECTED have zero such effect.
    status: text("status").notNull().default("draft"),
    currency: text("currency").notNull().default("SAR"),
    totalValue: doublePrecision("total_value").notNull().default(0),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    reversalJournalEntryId: text("reversal_journal_entry_id").references(() => journalEntries.id),
    notes: text("notes").default(""),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
    submittedBy: text("submitted_by").references(() => users.id),
    submittedAt: text("submitted_at"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    postedBy: text("posted_by").references(() => users.id),
    postedAt: text("posted_at"),
    reversedBy: text("reversed_by").references(() => users.id),
    reversedAt: text("reversed_at"),
    reversalReason: text("reversal_reason"),
  },
  (t) => ({
    numberIdx: uniqueIndex("goods_receipts_number_idx").on(t.grnNumber),
    journalIdx: uniqueIndex("goods_receipts_journal_entry_idx").on(t.journalEntryId),
    poIdx: index("goods_receipts_po_idx").on(t.purchaseOrderId),
    statusIdx: index("goods_receipts_status_idx").on(t.status),
    dateIdx: index("goods_receipts_date_idx").on(t.receiptDate),
  }),
);

export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    id: text("id").primaryKey(),
    goodsReceiptId: text("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    poLineId: text("po_line_id")
      .notNull()
      .references(() => purchaseOrderLines.id),
    lineNumber: integer("line_number").notNull().default(1),
    lineType: text("line_type").notNull().default("ITEM"),
    description: text("description").default(""),
    itemId: text("item_id").references(() => inventoryItems.id),
    accountId: text("account_id").references(() => accounts.id), // debit target actually posted
    quantityReceived: doublePrecision("quantity_received").notNull().default(0),
    unitPrice: doublePrecision("unit_price").notNull().default(0),
    lineValue: doublePrecision("line_value").notNull().default(0),
    costCenterId: text("cost_center_id").references(() => costCenters.id),
    stockMovementId: text("stock_movement_id"), // set for ITEM receipts (one movement)
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    grnIdx: index("goods_receipt_lines_grn_idx").on(t.goodsReceiptId),
    poLineIdx: index("goods_receipt_lines_po_line_idx").on(t.poLineId),
  }),
);

// Phase 3D.1 — GRNI subledger link. Maps a goods receipt (and optionally a GRN
// line) to a SINGLE GRNI control-account journal line — the monetary amount
// lives ONLY in journal_lines (there is deliberately NO amount column here). The
// governed GRNI balance is derived by joining links → journal_lines →
// journal_entries (credit − debit, posted+reversed). journal_line_id is UNIQUE so
// one GRNI line can never be double-linked. link_type distinguishes the original
// receipt credit ('receipt') from the reversal debit mirror ('reversal').
export const grniJournalLinks = pgTable(
  "grni_journal_links",
  {
    id: text("id").primaryKey(),
    goodsReceiptId: text("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    goodsReceiptLineId: text("goods_receipt_line_id").references(() => goodsReceiptLines.id),
    journalLineId: text("journal_line_id")
      .notNull()
      .references(() => journalLines.id),
    linkType: text("link_type").notNull().default("receipt"), // receipt | reversal
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    lineIdx: uniqueIndex("grni_journal_links_line_idx").on(t.journalLineId),
    grnIdx: index("grni_journal_links_grn_idx").on(t.goodsReceiptId),
    // Phase 4A perf: the matching-position service filters by goods_receipt_line_id.
    grnLineIdx: index("grni_journal_links_grn_line_idx").on(t.goodsReceiptLineId),
  }),
);

// Phase 5B — governed Purchase Return (مرتجع مشتريات) of UNINVOICED received
// quantity against a POSTED governed GRN. On POST it books (atomically)
// Dr GRNI (the receipt's HISTORICAL GRNI account) / Cr the line's HISTORICAL
// actual receipt debit account, decrements inventory for ITEM lines, and links
// the GRNI debit line ('return') per receipt line. NEVER touches Accounts
// Payable, VAT, suppliers.balance, or supplier_journal_links. Returned quantity
// consumes the SAME receipt-line capacity as invoice matching
// (matched + returned ≤ received).
export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: text("id").primaryKey(),
    returnNumber: text("return_number").notNull().unique(), // PRET-2026-000001
    goodsReceiptId: text("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id),
    purchaseOrderId: text("purchase_order_id").references(() => purchaseOrders.id),
    supplierId: text("supplier_id").references(() => suppliers.id),
    returnDate: text("return_date").notNull().default(""),
    status: text("status").notNull().default("draft"),
    currency: text("currency").notNull().default("SAR"),
    totalValue: doublePrecision("total_value").notNull().default(0),
    reason: text("reason").default(""),
    journalEntryId: text("journal_entry_id").references(() => journalEntries.id),
    reversalJournalEntryId: text("reversal_journal_entry_id").references(() => journalEntries.id),
    createdBy: text("created_by").references(() => users.id),
    createdAt: text("created_at").notNull().default(""),
    updatedAt: text("updated_at").notNull().default(""),
    submittedBy: text("submitted_by").references(() => users.id),
    submittedAt: text("submitted_at"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    postedBy: text("posted_by").references(() => users.id),
    postedAt: text("posted_at"),
    reversedBy: text("reversed_by").references(() => users.id),
    reversedAt: text("reversed_at"),
    reversalReason: text("reversal_reason"),
  },
  (t) => ({
    numberIdx: uniqueIndex("purchase_returns_number_idx").on(t.returnNumber),
    journalIdx: uniqueIndex("purchase_returns_journal_entry_idx").on(t.journalEntryId),
    grnIdx: index("purchase_returns_grn_idx").on(t.goodsReceiptId),
    statusIdx: index("purchase_returns_status_idx").on(t.status),
    supplierIdx: index("purchase_returns_supplier_idx").on(t.supplierId),
  }),
);

export const purchaseReturnLines = pgTable(
  "purchase_return_lines",
  {
    id: text("id").primaryKey(),
    purchaseReturnId: text("purchase_return_id")
      .notNull()
      .references(() => purchaseReturns.id, { onDelete: "cascade" }),
    goodsReceiptLineId: text("goods_receipt_line_id")
      .notNull()
      .references(() => goodsReceiptLines.id),
    lineNumber: integer("line_number").notNull().default(1),
    lineType: text("line_type").notNull().default("ITEM"),
    description: text("description").default(""),
    itemId: text("item_id").references(() => inventoryItems.id),
    // The HISTORICAL actual receipt debit account credited back on the return.
    accountId: text("account_id").references(() => accounts.id),
    quantityReturned: doublePrecision("quantity_returned").notNull().default(0),
    // The GRNI value cleared by this return line (telescoped, never qty × price).
    lineValue: doublePrecision("line_value").notNull().default(0),
    costCenterId: text("cost_center_id").references(() => costCenters.id),
    stockMovementId: text("stock_movement_id"), // set for ITEM returns (one OUT movement)
    createdAt: text("created_at").notNull().default(""),
  },
  (t) => ({
    returnIdx: index("purchase_return_lines_return_idx").on(t.purchaseReturnId),
    grnLineIdx: index("purchase_return_lines_grn_line_idx").on(t.goodsReceiptLineId),
    qtyPositive: check("purchase_return_lines_qty_positive", drizzleSql`${t.quantityReturned} > 0`),
  }),
);

export const quotes = pgTable("quotes", {
  id: text("id").primaryKey(),
  requestId: text("request_id").references(() => purchaseRequests.id),
  supplierId: text("supplier_id").references(() => suppliers.id),
  supplier: text("supplier").notNull(),
  price: doublePrecision("price").notNull().default(0),
  delivery: text("delivery").default(""),
  warranty: text("warranty").default(""),
  rating: doublePrecision("rating").notNull().default(0),
  winner: boolean("winner").notNull().default(false),
  status: text("status").notNull().default("pending"),
  validUntil: text("valid_until").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ INVENTORY ============

export const inventoryItems = pgTable("inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").default(""),
  unit: text("unit").notNull().default("قطعة"),
  category: text("category").default(""),
  warehouseId: text("warehouse_id"),
  quantity: doublePrecision("quantity").notNull().default(0),
  minQuantity: doublePrecision("min_quantity").notNull().default(0),
  price: doublePrecision("price").notNull().default(0),
  status: text("status").notNull().default("active"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const warehouses = pgTable("warehouses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").default(""),
  manager: text("manager").default(""),
  capacity: doublePrecision("capacity").notNull().default(0),
  occupancy: doublePrecision("occupancy").notNull().default(0),
  status: text("status").notNull().default("active"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ STOCK MOVEMENTS ============

export const stockMovements = pgTable("stock_movements", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  warehouseId: text("warehouse_id").references(() => warehouses.id),
  type: text("type").notNull(),
  quantity: doublePrecision("quantity").notNull().default(0),
  balanceAfter: doublePrecision("balance_after").notNull().default(0),
  relatedWarehouseId: text("related_warehouse_id").references(() => warehouses.id),
  relatedStocktakeId: text("related_stocktake_id"),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  reference: text("reference").default(""),
  date: text("date").notNull().default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

// ============ STOCKTAKES ============

export const stocktakes = pgTable("stocktakes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  warehouseId: text("warehouse_id").references(() => warehouses.id),
  date: text("date").notNull().default(""),
  status: text("status").notNull().default("draft"),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: text("approved_at"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const stocktakeLines = pgTable("stocktake_lines", {
  id: text("id").primaryKey(),
  stocktakeId: text("stocktake_id")
    .notNull()
    .references(() => stocktakes.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  systemQuantity: doublePrecision("system_quantity").notNull().default(0),
  countedQuantity: doublePrecision("counted_quantity").notNull().default(0),
  difference: doublePrecision("difference").notNull().default(0),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ GRANTS & ENDOWMENTS ============

export const grants = pgTable("grants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  donor: text("donor").notNull(),
  amount: doublePrecision("amount").notNull().default(0),
  status: text("status").notNull().default("pending"),
  startDate: text("start_date").default(""),
  endDate: text("end_date").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

export const endowments = pgTable("endowments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("general"),
  value: doublePrecision("value").notNull().default(0),
  returns: doublePrecision("returns").notNull().default(0),
  status: text("status").notNull().default("active"),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// Investment returns realized/expected per endowment per period (عوائد الأوقاف)
export const endowmentReturns = pgTable("endowment_returns", {
  id: text("id").primaryKey(),
  endowmentId: text("endowment_id").references(() => endowments.id),
  endowmentName: text("endowment_name").default(""),
  period: text("period").notNull().default(""),
  amount: doublePrecision("amount").notNull().default(0),
  date: text("date").default(""),
  status: text("status").notNull().default("realized"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ DONOR ORGANIZATIONS (الجهات المانحة) ============

export const donorOrgs = pgTable("donor_orgs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("government"),
  contactPerson: text("contact_person").default(""),
  phone: text("phone").default(""),
  email: text("email").default(""),
  grantsCount: integer("grants_count").notNull().default(0),
  totalAmount: doublePrecision("total_amount").notNull().default(0),
  status: text("status").notNull().default("active"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ BACKUP (النسخ الاحتياطي) ============

// Single-row config (id = "default").
export const backupConfig = pgTable("backup_config", {
  id: text("id").primaryKey(),
  frequency: text("frequency").notNull().default("daily"),
  time: text("time").notNull().default("03:00"),
  retention: integer("retention").notNull().default(30),
  location: text("location").default("السعودية"),
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: text("updated_at").notNull().default(""),
});

export const backupRecords = pgTable("backup_records", {
  id: text("id").primaryKey(),
  type: text("type").notNull().default("manual"),
  status: text("status").notNull().default("success"),
  note: text("note").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdByName: text("created_by_name").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ INTEGRATIONS & WEBHOOKS (التكاملات) ============

export const integrations = pgTable("integrations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull().default("payments"),
  apiUrl: text("api_url").default(""),
  apiKey: text("api_key").default(""),
  status: text("status").notNull().default("active"),
  info: text("info").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const webhooks = pgTable("webhooks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  event: text("event").notNull().default("donation_created"),
  active: boolean("active").notNull().default(true),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ SAVED REPORTS (التقارير المحفوظة) ============

export const savedReports = pgTable("saved_reports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("financial"),
  period: text("period").notNull().default("monthly"),
  format: text("format").notNull().default("pdf"),
  scheduled: boolean("scheduled").notNull().default(false),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ NOTIFICATIONS (التنبيهات) ============

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").default(""),
  tone: text("tone").notNull().default("info"),
  link: text("link").default(""),
  read: boolean("read").notNull().default(false),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  readAt: text("read_at"),
});

// ============ RECURRING DONATIONS (التبرعات المتكررة) ============

export const recurringDonations = pgTable("recurring_donations", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  donorName: text("donor_name").notNull().default(""),
  donorId: text("donor_id").references(() => donors.id),
  amount: doublePrecision("amount").notNull().default(0),
  frequency: text("frequency").notNull().default("monthly"),
  projectId: text("project_id").references(() => projects.id),
  projectName: text("project_name").default(""),
  nextRunDate: text("next_run_date").default(""),
  startDate: text("start_date").default(""),
  status: text("status").notNull().default("active"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ MEMBERSHIPS ============

export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"),
  type: text("type").notNull().default("board"),
  phone: text("phone"),
  email: text("email"),
  status: text("status").notNull().default("active"),
  joinedAt: text("joined_at").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ MEETINGS ============

export const meetings = pgTable("meetings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  date: text("date").notNull().default(""),
  location: text("location").default(""),
  attendees: text("attendees").default("[]"),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

// ============ AUDIT LOG ============

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    userName: text("user_name").notNull().default(""),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    description: text("description").default(""),
    before: text("before"),
    after: text("after"),
    ip: text("ip").default(""),
    timestamp: text("timestamp").notNull().default(""),
  },
  (t) => ({
    entityIdx: index("audit_entity_idx").on(t.entityType, t.entityId),
    tsIdx: index("audit_ts_idx").on(t.timestamp),
  }),
);

// ============ FIXED ASSETS ============

export const fixedAssets = pgTable("fixed_assets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").default(""),
  category: text("category").default(""),
  location: text("location").default(""),
  cost: doublePrecision("cost").notNull().default(0),
  salvageValue: doublePrecision("salvage_value").notNull().default(0),
  usefulLifeMonths: integer("useful_life_months").notNull().default(60),
  accumulatedDepreciation: doublePrecision("accumulated_depreciation").notNull().default(0),
  depreciationMethod: text("depreciation_method").notNull().default("straight_line"),
  status: text("status").notNull().default("active"),
  condition: text("condition").default("good"),
  purchaseDate: text("purchase_date").default(""),
  supplierId: text("supplier_id").references(() => suppliers.id),
  serialNumber: text("serial_number").default(""),
  responsiblePerson: text("responsible_person").default(""),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const assetDepreciations = pgTable("asset_depreciations", {
  id: text("id").primaryKey(),
  assetId: text("asset_id")
    .notNull()
    .references(() => fixedAssets.id, { onDelete: "cascade" }),
  date: text("date").notNull().default(""),
  amount: doublePrecision("amount").notNull().default(0),
  bookValueAfter: doublePrecision("book_value_after").notNull().default(0),
  method: text("method").notNull().default("straight_line"),
  notes: text("notes").default(""),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

export const assetMovements = pgTable("asset_movements", {
  id: text("id").primaryKey(),
  assetId: text("asset_id")
    .notNull()
    .references(() => fixedAssets.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  fromLocation: text("from_location").default(""),
  toLocation: text("to_location").default(""),
  fromResponsible: text("from_responsible").default(""),
  toResponsible: text("to_responsible").default(""),
  cost: doublePrecision("cost").notNull().default(0),
  date: text("date").notNull().default(""),
  reason: text("reason").default(""),
  notes: text("notes").default(""),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

// ============ HR (EMPLOYEES) ============

export const employees = pgTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  department: text("department").default(""),
  title: text("title").default(""),
  salary: doublePrecision("salary").notNull().default(0),
  phone: text("phone").default(""),
  email: text("email").default(""),
  joinedAt: text("joined_at").default(""),
  status: text("status").notNull().default("active"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

// ============ PAYROLL (مسير الرواتب) ============

export const payrollRuns = pgTable("payroll_runs", {
  id: text("id").primaryKey(),
  period: text("period").notNull().default(""),
  status: text("status").notNull().default("draft"),
  payMethod: text("pay_method").notNull().default("bank"),
  totalAmount: doublePrecision("total_amount").notNull().default(0),
  journalEntryId: text("journal_entry_id"),
  notes: text("notes").default(""),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: text("approved_at"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const payrollLines = pgTable("payroll_lines", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => payrollRuns.id),
  employeeId: text("employee_id").references(() => employees.id),
  employeeName: text("employee_name").notNull().default(""),
  department: text("department").default(""),
  salary: doublePrecision("salary").notNull().default(0),
  allowances: doublePrecision("allowances").notNull().default(0),
  deductions: doublePrecision("deductions").notNull().default(0),
  net: doublePrecision("net").notNull().default(0),
  notes: text("notes").default(""),
});

// ============ ORG SETTINGS (single row, id = "org") ============

export const orgSettings = pgTable("org_settings", {
  id: text("id").primaryKey(),
  name: text("name").default(""),
  regNo: text("reg_no").default(""),
  taxNo: text("tax_no").default(""),
  email: text("email").default(""),
  phone: text("phone").default(""),
  ceo: text("ceo").default(""),
  fiscalYear: text("fiscal_year").default(""),
  currency: text("currency").default("SAR"),
  // National Address (العنوان الوطني السعودي)
  buildingNo: text("building_no").default(""),
  street: text("street").default(""),
  district: text("district").default(""),
  city: text("city").default(""),
  postalCode: text("postal_code").default(""),
  additionalNo: text("additional_no").default(""),
  updatedAt: text("updated_at").notNull().default(""),
});
