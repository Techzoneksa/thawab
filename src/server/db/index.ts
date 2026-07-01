import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = "./data/thawab.db";

// Ensure data directory exists
const dir = dirname(DB_PATH);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Initialize tables
export function initDB() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'employee',
      branch_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      avatar TEXT,
      created_at TEXT NOT NULL DEFAULT '',
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      permissions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      manager TEXT,
      phone TEXT,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS donors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'فرد',
      email TEXT,
      phone TEXT,
      city TEXT DEFAULT '',
      address TEXT DEFAULT '',
      tag TEXT DEFAULT 'برونزي',
      total_donations REAL NOT NULL DEFAULT 0,
      donation_count INTEGER NOT NULL DEFAULT 0,
      last_donation TEXT,
      recurring INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'نشط',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      goal REAL NOT NULL DEFAULT 0,
      raised REAL NOT NULL DEFAULT 0,
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'مخطط',
      description TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT DEFAULT '',
      type TEXT DEFAULT '',
      category TEXT DEFAULT '',
      branch TEXT DEFAULT '',
      manager TEXT NOT NULL,
      budget REAL NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      donations REAL NOT NULL DEFAULT 0,
      beneficiary_count INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'مخطط',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      description TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY,
      donor_id TEXT NOT NULL REFERENCES donors(id),
      project_id TEXT REFERENCES projects(id),
      campaign_id TEXT REFERENCES campaigns(id),
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'نقدي',
      channel TEXT NOT NULL DEFAULT 'مباشر',
      status TEXT NOT NULL DEFAULT 'مسودة',
      receipt_id TEXT,
      notes TEXT DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS beneficiaries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      file_number TEXT DEFAULT '',
      id_number TEXT DEFAULT '',
      phone TEXT,
      city TEXT DEFAULT '',
      address TEXT DEFAULT '',
      category TEXT NOT NULL DEFAULT 'أسر محتاجة',
      status TEXT NOT NULL DEFAULT 'جديد',
      family_members INTEGER NOT NULL DEFAULT 1,
      monthly_income REAL NOT NULL DEFAULT 0,
      marital_status TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS aid_records (
      id TEXT PRIMARY KEY,
      beneficiary_id TEXT NOT NULL REFERENCES beneficiaries(id),
      project_id TEXT REFERENCES projects(id),
      type TEXT NOT NULL DEFAULT 'مساعدة عاجلة',
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'بانتظار الموافقة',
      date TEXT NOT NULL DEFAULT '',
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      donation_id TEXT REFERENCES donations(id),
      number TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'تبرع',
      status TEXT NOT NULL DEFAULT 'مرحّل',
      printed INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'تفصيلي',
      level INTEGER NOT NULL DEFAULT 1,
      parent_id TEXT,
      currency TEXT NOT NULL DEFAULT 'SAR',
      balance REAL NOT NULL DEFAULT 0,
      postable INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'نشط',
      description TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      debit_account TEXT NOT NULL DEFAULT '',
      credit_account TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      fund TEXT NOT NULL DEFAULT 'مقيد',
      currency TEXT NOT NULL DEFAULT 'SAR',
      project_id TEXT REFERENCES projects(id),
      source_type TEXT,
      source_id TEXT,
      status TEXT NOT NULL DEFAULT 'مسودة',
      posted_by TEXT REFERENCES users(id),
      posted_at TEXT,
      reversed_by TEXT,
      reversed_at TEXT,
      reversed_of TEXT,
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      description TEXT DEFAULT '',
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      cost_center_id TEXT REFERENCES cost_centers(id),
      project_id TEXT REFERENCES projects(id),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS cost_centers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      manager TEXT DEFAULT '',
      budget REAL NOT NULL DEFAULT 0,
      spent REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'نشط',
      description TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year TEXT NOT NULL,
      amount REAL NOT NULL,
      spent REAL NOT NULL DEFAULT 0,
      department TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'مخطط',
      currency TEXT NOT NULL DEFAULT 'SAR',
      description TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      locked_by TEXT REFERENCES users(id),
      locked_at TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS budget_lines (
      id TEXT PRIMARY KEY,
      budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      account_id TEXT REFERENCES accounts(id),
      cost_center_id TEXT REFERENCES cost_centers(id),
      project_id TEXT REFERENCES projects(id),
      planned_amount REAL NOT NULL DEFAULT 0,
      actual_amount REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      requester TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'بانتظار موافقتي',
      priority TEXT NOT NULL DEFAULT 'متوسطة',
      level INTEGER NOT NULL DEFAULT 1,
      project_id TEXT REFERENCES projects(id),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      activity TEXT DEFAULT '',
      phone TEXT,
      email TEXT,
      tax_number TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'نشط',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS purchase_requests (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      department TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'متوسطة',
      status TEXT NOT NULL DEFAULT 'طلب جديد',
      delivery_date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      supplier_id TEXT REFERENCES suppliers(id),
      subject TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      delivery_date TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'جديد',
      total REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      request_id TEXT REFERENCES purchase_requests(id),
      supplier TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      delivery TEXT DEFAULT '',
      warranty TEXT DEFAULT '',
      rating REAL NOT NULL DEFAULT 0,
      winner INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'بانتظار',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT DEFAULT '',
      unit TEXT NOT NULL DEFAULT 'قطعة',
      category TEXT DEFAULT '',
      warehouse_id TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      min_quantity REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'متوفر',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT DEFAULT '',
      manager TEXT DEFAULT '',
      capacity TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'نشط',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS grants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      donor TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'معلق',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS endowments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'وقف عام',
      value REAL NOT NULL DEFAULT 0,
      returns REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'نشط',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'عضو',
      type TEXT NOT NULL DEFAULT 'مجلس إدارة',
      phone TEXT,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'نشط',
      joined_at TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      location TEXT DEFAULT '',
      attendees TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'مجدول',
      notes TEXT DEFAULT '',
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      user_name TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      description TEXT DEFAULT '',
      before TEXT,
      after TEXT,
      ip TEXT DEFAULT '',
      timestamp TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS fixed_assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      location TEXT DEFAULT '',
      cost REAL NOT NULL DEFAULT 0,
      accumulated_depreciation REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'تشغيل',
      purchase_date TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    );
  `);

  // Migration: Add missing columns to existing tables
  const migrations = [
    `ALTER TABLE aid_records ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE aid_records ADD COLUMN delivered_at TEXT`,
    `ALTER TABLE aid_records ADD COLUMN delivered_by TEXT REFERENCES users(id)`,
    `ALTER TABLE aid_records ADD COLUMN delivery_method TEXT DEFAULT ''`,
    `ALTER TABLE aid_records ADD COLUMN delivery_notes TEXT DEFAULT ''`,
    `ALTER TABLE projects ADD COLUMN code TEXT DEFAULT ''`,
    `ALTER TABLE projects ADD COLUMN type TEXT DEFAULT ''`,
    `ALTER TABLE projects ADD COLUMN category TEXT DEFAULT ''`,
    `ALTER TABLE projects ADD COLUMN branch TEXT DEFAULT ''`,
    `ALTER TABLE projects ADD COLUMN notes TEXT DEFAULT ''`,
    `ALTER TABLE beneficiaries ADD COLUMN file_number TEXT DEFAULT ''`,
    `ALTER TABLE beneficiaries ADD COLUMN family_members INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE beneficiaries ADD COLUMN monthly_income REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE beneficiaries ADD COLUMN marital_status TEXT DEFAULT ''`,
    `ALTER TABLE accounts ADD COLUMN level INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE accounts ADD COLUMN postable INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE accounts ADD COLUMN description TEXT DEFAULT ''`,
    `ALTER TABLE accounts ADD COLUMN notes TEXT DEFAULT ''`,
    `ALTER TABLE accounts ADD COLUMN created_by TEXT REFERENCES users(id)`,
    `ALTER TABLE accounts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE journal_entries ADD COLUMN currency TEXT NOT NULL DEFAULT 'SAR'`,
    `ALTER TABLE journal_entries ADD COLUMN reversed_of TEXT`,
    `ALTER TABLE journal_entries ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE cost_centers ADD COLUMN description TEXT DEFAULT ''`,
    `ALTER TABLE cost_centers ADD COLUMN notes TEXT DEFAULT ''`,
    `ALTER TABLE cost_centers ADD COLUMN created_by TEXT REFERENCES users(id)`,
    `ALTER TABLE cost_centers ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE budgets ADD COLUMN currency TEXT NOT NULL DEFAULT 'SAR'`,
    `ALTER TABLE budgets ADD COLUMN description TEXT DEFAULT ''`,
    `ALTER TABLE budgets ADD COLUMN approved_by TEXT REFERENCES users(id)`,
    `ALTER TABLE budgets ADD COLUMN approved_at TEXT`,
    `ALTER TABLE budgets ADD COLUMN locked_by TEXT REFERENCES users(id)`,
    `ALTER TABLE budgets ADD COLUMN locked_at TEXT`,
    `ALTER TABLE budgets ADD COLUMN created_by TEXT REFERENCES users(id)`,
    `ALTER TABLE budgets ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
  ];

  for (const migration of migrations) {
    try {
      sqlite.exec(migration);
    } catch {
      // Column already exists, ignore
    }
  }
}

// Auto-init on import
initDB();

export function now() {
  return new Date().toLocaleString("ar-SA", { hour12: false });
}

export function genId(prefix = "") {
  const num = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  return prefix ? `${prefix}-${num}` : num;
}

export function addAudit(
  action: string,
  entityType: string,
  entityId: string,
  description: string,
  userId?: string,
  userName = "نظام",
  before?: string,
  after?: string,
) {
  const { audit_log } = db._;
  db.insert(audit_log)
    .values({
      id: genId("AUD"),
      userId: userId || null,
      userName,
      action,
      entityType,
      entityId,
      description,
      before: before || null,
      after: after || null,
      timestamp: now(),
    })
    .run();
}
