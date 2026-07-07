import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============ USERS & AUTH ============

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("employee"),
  branchId: text("branch_id"),
  status: text("status").notNull().default("active"),
  avatar: text("avatar"),
  createdAt: text("created_at").notNull().default(""),
  lastLogin: text("last_login"),
});

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: text("permissions").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(""),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(""),
});

// ============ BRANCHES ============

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  manager: text("manager"),
  phone: text("phone"),
  email: text("email"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().default(""),
});

// ============ DONORS ============

export const donors = sqliteTable("donors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("فرد"),
  email: text("email"),
  phone: text("phone"),
  city: text("city").default(""),
  address: text("address").default(""),
  tag: text("tag").default("برونزي"),
  totalDonations: real("total_donations").notNull().default(0),
  donationCount: integer("donation_count").notNull().default(0),
  lastDonation: text("last_donation"),
  recurring: integer("recurring", { mode: "boolean" }).notNull().default(false),
  notes: text("notes").default(""),
  status: text("status").notNull().default("نشط"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ CAMPAIGNS ============

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  goal: real("goal").notNull().default(0),
  raised: real("raised").notNull().default(0),
  startDate: text("start_date").default(""),
  endDate: text("end_date").default(""),
  status: text("status").notNull().default("مخطط"),
  description: text("description").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

// ============ PROJECTS ============

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").default(""),
  type: text("type").default(""),
  category: text("category").default(""),
  branch: text("branch").default(""),
  manager: text("manager").notNull(),
  budget: real("budget").notNull().default(0),
  spent: real("spent").notNull().default(0),
  donations: real("donations").notNull().default(0),
  beneficiaryCount: integer("beneficiary_count").notNull().default(0),
  progress: integer("progress").notNull().default(0),
  status: text("status").notNull().default("مخطط"),
  startDate: text("start_date").default(""),
  endDate: text("end_date").default(""),
  description: text("description").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ DONATIONS ============

export const donations = sqliteTable("donations", {
  id: text("id").primaryKey(),
  donorId: text("donor_id")
    .notNull()
    .references(() => donors.id),
  projectId: text("project_id").references(() => projects.id),
  campaignId: text("campaign_id").references(() => campaigns.id),
  amount: real("amount").notNull(),
  method: text("method").notNull().default("نقدي"),
  channel: text("channel").notNull().default("مباشر"),
  status: text("status").notNull().default("مسودة"),
  receiptId: text("receipt_id"),
  notes: text("notes").default(""),
  date: text("date").notNull().default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ BENEFICIARIES ============

export const beneficiaries = sqliteTable("beneficiaries", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  fileNumber: text("file_number").default(""),
  idNumber: text("id_number").default(""),
  phone: text("phone"),
  city: text("city").default(""),
  address: text("address").default(""),
  category: text("category").notNull().default("أسر محتاجة"),
  status: text("status").notNull().default("جديد"),
  familyMembers: integer("family_members").notNull().default(1),
  monthlyIncome: real("monthly_income").notNull().default(0),
  maritalStatus: text("marital_status").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ AID RECORDS ============

export const aidRecords = sqliteTable("aid_records", {
  id: text("id").primaryKey(),
  beneficiaryId: text("beneficiary_id")
    .notNull()
    .references(() => beneficiaries.id),
  projectId: text("project_id").references(() => projects.id),
  type: text("type").notNull().default("مساعدة عاجلة"),
  amount: real("amount").notNull().default(0),
  status: text("status").notNull().default("بانتظار الموافقة"),
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

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  donationId: text("donation_id").references(() => donations.id),
  number: text("number").notNull().unique(),
  amount: real("amount").notNull(),
  date: text("date").notNull().default(""),
  type: text("type").notNull().default("تبرع"),
  status: text("status").notNull().default("مرحّل"),
  printed: integer("printed", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

// ============ FINANCE ============

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("تفصيلي"),
  level: integer("level").notNull().default(1),
  parentId: text("parent_id"),
  currency: text("currency").notNull().default("SAR"),
  balance: real("balance").notNull().default(0),
  postable: integer("postable", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("نشط"),
  description: text("description").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  date: text("date").notNull().default(""),
  description: text("description").notNull().default(""),
  debitAccount: text("debit_account").notNull(),
  creditAccount: text("credit_account").notNull(),
  amount: real("amount").notNull().default(0),
  fund: text("fund").notNull().default("مقيد"),
  currency: text("currency").notNull().default("SAR"),
  projectId: text("project_id").references(() => projects.id),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  status: text("status").notNull().default("مسودة"),
  postedBy: text("posted_by").references(() => users.id),
  postedAt: text("posted_at"),
  reversedBy: text("reversed_by"),
  reversedAt: text("reversed_at"),
  reversedOf: text("reversed_of"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const journalLines = sqliteTable("journal_lines", {
  id: text("id").primaryKey(),
  journalEntryId: text("journal_entry_id")
    .notNull()
    .references(() => journalEntries.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  description: text("description").default(""),
  debit: real("debit").notNull().default(0),
  credit: real("credit").notNull().default(0),
  costCenterId: text("cost_center_id").references(() => costCenters.id),
  projectId: text("project_id").references(() => projects.id),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

export const costCenters = sqliteTable("cost_centers", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  manager: text("manager").default(""),
  budget: real("budget").notNull().default(0),
  spent: real("spent").notNull().default(0),
  status: text("status").notNull().default("نشط"),
  description: text("description").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  year: text("year").notNull(),
  amount: real("amount").notNull(),
  spent: real("spent").notNull().default(0),
  department: text("department").default(""),
  status: text("status").notNull().default("مخطط"),
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

export const budgetLines = sqliteTable("budget_lines", {
  id: text("id").primaryKey(),
  budgetId: text("budget_id")
    .notNull()
    .references(() => budgets.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  accountId: text("account_id").references(() => accounts.id),
  costCenterId: text("cost_center_id").references(() => costCenters.id),
  projectId: text("project_id").references(() => projects.id),
  plannedAmount: real("planned_amount").notNull().default(0),
  actualAmount: real("actual_amount").notNull().default(0),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ FISCAL PERIODS ============

export const fiscalPeriods = sqliteTable("fiscal_periods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  status: text("status").notNull().default("مفتوحة"),
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

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  requester: text("requester").notNull(),
  amount: real("amount").notNull().default(0),
  status: text("status").notNull().default("بانتظار موافقتي"),
  priority: text("priority").notNull().default("متوسطة"),
  level: integer("level").notNull().default(1),
  projectId: text("project_id").references(() => projects.id),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ SUPPLIERS ============

export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  activity: text("activity").default(""),
  phone: text("phone"),
  email: text("email"),
  taxNumber: text("tax_number").default(""),
  contactPerson: text("contact_person").default(""),
  address: text("address").default(""),
  rating: real("rating").notNull().default(0),
  balance: real("balance").notNull().default(0),
  notes: text("notes").default(""),
  status: text("status").notNull().default("نشط"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ PURCHASES ============

export const purchaseRequests = sqliteTable("purchase_requests", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  department: text("department").notNull(),
  priority: text("priority").notNull().default("متوسطة"),
  status: text("status").notNull().default("مسودة"),
  requester: text("requester").default(""),
  amount: real("amount").notNull().default(0),
  deliveryDate: text("delivery_date").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplierId: text("supplier_id").references(() => suppliers.id),
  requestId: text("request_id").references(() => purchaseRequests.id),
  subject: text("subject").notNull(),
  date: text("date").notNull().default(""),
  deliveryDate: text("delivery_date").default(""),
  status: text("status").notNull().default("مسودة"),
  total: real("total").notNull().default(0),
  receivedAmount: real("received_amount").notNull().default(0),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const purchaseOrderLines = sqliteTable("purchase_order_lines", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  lineNumber: integer("line_number").notNull(),
  itemId: text("item_id").references(() => inventoryItems.id),
  description: text("description").notNull().default(""),
  quantity: real("quantity").notNull().default(0),
  unitPrice: real("unit_price").notNull().default(0),
  receivedQuantity: real("received_quantity").notNull().default(0),
  unit: text("unit").default(""),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  requestId: text("request_id").references(() => purchaseRequests.id),
  supplierId: text("supplier_id").references(() => suppliers.id),
  supplier: text("supplier").notNull(),
  price: real("price").notNull().default(0),
  delivery: text("delivery").default(""),
  warranty: text("warranty").default(""),
  rating: real("rating").notNull().default(0),
  winner: integer("winner", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("بانتظار"),
  validUntil: text("valid_until").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ INVENTORY ============

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").default(""),
  unit: text("unit").notNull().default("قطعة"),
  category: text("category").default(""),
  warehouseId: text("warehouse_id"),
  quantity: real("quantity").notNull().default(0),
  minQuantity: real("min_quantity").notNull().default(0),
  price: real("price").notNull().default(0),
  status: text("status").notNull().default("نشط"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const warehouses = sqliteTable("warehouses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").default(""),
  manager: text("manager").default(""),
  capacity: real("capacity").notNull().default(0),
  occupancy: real("occupancy").notNull().default(0),
  status: text("status").notNull().default("نشط"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

// ============ STOCK MOVEMENTS ============

export const stockMovements = sqliteTable("stock_movements", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  warehouseId: text("warehouse_id").references(() => warehouses.id),
  type: text("type").notNull(),
  quantity: real("quantity").notNull().default(0),
  balanceAfter: real("balance_after").notNull().default(0),
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

export const stocktakes = sqliteTable("stocktakes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  warehouseId: text("warehouse_id").references(() => warehouses.id),
  date: text("date").notNull().default(""),
  status: text("status").notNull().default("مسودة"),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: text("approved_at"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(""),
});

export const stocktakeLines = sqliteTable("stocktake_lines", {
  id: text("id").primaryKey(),
  stocktakeId: text("stocktake_id")
    .notNull()
    .references(() => stocktakes.id, { onDelete: "cascade" }),
  itemId: text("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  systemQuantity: real("system_quantity").notNull().default(0),
  countedQuantity: real("counted_quantity").notNull().default(0),
  difference: real("difference").notNull().default(0),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ GRANTS & ENDOWMENTS ============

export const grants = sqliteTable("grants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  donor: text("donor").notNull(),
  amount: real("amount").notNull().default(0),
  status: text("status").notNull().default("معلق"),
  startDate: text("start_date").default(""),
  endDate: text("end_date").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

export const endowments = sqliteTable("endowments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull().default("وقف عام"),
  value: real("value").notNull().default(0),
  returns: real("returns").notNull().default(0),
  status: text("status").notNull().default("نشط"),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ MEMBERSHIPS ============

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("عضو"),
  type: text("type").notNull().default("مجلس إدارة"),
  phone: text("phone"),
  email: text("email"),
  status: text("status").notNull().default("نشط"),
  joinedAt: text("joined_at").default(""),
  createdAt: text("created_at").notNull().default(""),
});

// ============ MEETINGS ============

export const meetings = sqliteTable("meetings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  date: text("date").notNull().default(""),
  location: text("location").default(""),
  attendees: text("attendees").default("[]"),
  status: text("status").notNull().default("مجدول"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

// ============ AUDIT LOG ============

export const auditLog = sqliteTable("audit_log", {
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
});

// ============ FIXED ASSETS ============

export const fixedAssets = sqliteTable("fixed_assets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").default(""),
  category: text("category").default(""),
  location: text("location").default(""),
  cost: real("cost").notNull().default(0),
  salvageValue: real("salvage_value").notNull().default(0),
  usefulLifeMonths: integer("useful_life_months").notNull().default(60),
  accumulatedDepreciation: real("accumulated_depreciation").notNull().default(0),
  depreciationMethod: text("depreciation_method").notNull().default("قسط ثابت"),
  status: text("status").notNull().default("نشط"),
  condition: text("condition").default("جيد"),
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

export const assetDepreciations = sqliteTable("asset_depreciations", {
  id: text("id").primaryKey(),
  assetId: text("asset_id")
    .notNull()
    .references(() => fixedAssets.id, { onDelete: "cascade" }),
  date: text("date").notNull().default(""),
  amount: real("amount").notNull().default(0),
  bookValueAfter: real("book_value_after").notNull().default(0),
  method: text("method").notNull().default("قسط ثابت"),
  notes: text("notes").default(""),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

export const assetMovements = sqliteTable("asset_movements", {
  id: text("id").primaryKey(),
  assetId: text("asset_id")
    .notNull()
    .references(() => fixedAssets.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  fromLocation: text("from_location").default(""),
  toLocation: text("to_location").default(""),
  fromResponsible: text("from_responsible").default(""),
  toResponsible: text("to_responsible").default(""),
  cost: real("cost").notNull().default(0),
  date: text("date").notNull().default(""),
  reason: text("reason").default(""),
  notes: text("notes").default(""),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});
