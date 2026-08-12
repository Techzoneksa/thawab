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
} from "drizzle-orm/pg-core";

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
  balance: doublePrecision("balance").notNull().default(0),
  notes: text("notes").default(""),
  status: text("status").notNull().default("active"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

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
});

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
