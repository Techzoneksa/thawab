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
  idNumber: text("id_number").default(""),
  phone: text("phone"),
  city: text("city").default(""),
  address: text("address").default(""),
  category: text("category").notNull().default("أسر محتاجة"),
  status: text("status").notNull().default("فعال"),
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
  parentId: text("parent_id"),
  currency: text("currency").notNull().default("SAR"),
  balance: real("balance").notNull().default(0),
  status: text("status").notNull().default("نشط"),
  createdAt: text("created_at").notNull().default(""),
});

export const journalEntries = sqliteTable("journal_entries", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  date: text("date").notNull().default(""),
  description: text("description").notNull().default(""),
  debitAccount: text("debit_account").notNull(),
  creditAccount: text("credit_account").notNull(),
  amount: real("amount").notNull(),
  fund: text("fund").notNull().default("مقيد"),
  projectId: text("project_id").references(() => projects.id),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  status: text("status").notNull().default("مسودة"),
  postedBy: text("posted_by").references(() => users.id),
  postedAt: text("posted_at"),
  reversedBy: text("reversed_by"),
  reversedAt: text("reversed_at"),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
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
  createdAt: text("created_at").notNull().default(""),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  year: text("year").notNull(),
  amount: real("amount").notNull(),
  spent: real("spent").notNull().default(0),
  department: text("department").default(""),
  status: text("status").notNull().default("مخطط"),
  notes: text("notes").default(""),
  createdAt: text("created_at").notNull().default(""),
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
  status: text("status").notNull().default("نشط"),
  createdAt: text("created_at").notNull().default(""),
});

// ============ PURCHASES ============

export const purchaseRequests = sqliteTable("purchase_requests", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  department: text("department").notNull(),
  priority: text("priority").notNull().default("متوسطة"),
  status: text("status").notNull().default("طلب جديد"),
  deliveryDate: text("delivery_date").default(""),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: text("id").primaryKey(),
  supplierId: text("supplier_id").references(() => suppliers.id),
  subject: text("subject").notNull(),
  date: text("date").notNull().default(""),
  deliveryDate: text("delivery_date").default(""),
  status: text("status").notNull().default("جديد"),
  total: real("total").notNull().default(0),
  notes: text("notes").default(""),
  createdBy: text("created_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(""),
});

export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  requestId: text("request_id").references(() => purchaseRequests.id),
  supplier: text("supplier").notNull(),
  price: real("price").notNull().default(0),
  delivery: text("delivery").default(""),
  warranty: text("warranty").default(""),
  rating: real("rating").notNull().default(0),
  winner: integer("winner", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("بانتظار"),
  createdAt: text("created_at").notNull().default(""),
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
  status: text("status").notNull().default("متوفر"),
  createdAt: text("created_at").notNull().default(""),
});

export const warehouses = sqliteTable("warehouses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").default(""),
  manager: text("manager").default(""),
  capacity: text("capacity").default(""),
  status: text("status").notNull().default("نشط"),
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
  category: text("category").default(""),
  location: text("location").default(""),
  cost: real("cost").notNull().default(0),
  accumulatedDepreciation: real("accumulated_depreciation").notNull().default(0),
  status: text("status").notNull().default("تشغيل"),
  purchaseDate: text("purchase_date").default(""),
  createdAt: text("created_at").notNull().default(""),
});
