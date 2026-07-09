import { createClient } from "@libsql/client";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dbDir = resolve(root, "data");
const dbPath = resolve(dbDir, "thawab.db");

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
  console.log(`[db-init] created directory: ${dbDir}`);
}

const url = `file:${dbPath.replace(/\\/g, "/")}`;
console.log(`[db-init] opening: ${url}`);

const client = createClient({ url });
await client.execute("PRAGMA journal_mode = WAL;");
await client.execute("PRAGMA foreign_keys = ON;");

// ============ SCHEMA DDL ============
const DDL = `
CREATE TABLE IF NOT EXISTS users ( id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, phone TEXT, role TEXT NOT NULL DEFAULT 'employee', branch_id TEXT, status TEXT NOT NULL DEFAULT 'active', avatar TEXT, created_at TEXT NOT NULL DEFAULT '', last_login TEXT );
CREATE TABLE IF NOT EXISTS roles ( id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, permissions TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS sessions ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS branches ( id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL, manager TEXT, phone TEXT, email TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS donors ( id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'فرد', email TEXT, phone TEXT, city TEXT DEFAULT '', address TEXT DEFAULT '', tag TEXT DEFAULT 'برونزي', total_donations REAL NOT NULL DEFAULT 0, donation_count INTEGER NOT NULL DEFAULT 0, last_donation TEXT, recurring INTEGER NOT NULL DEFAULT 0, notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'نشط', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS campaigns ( id TEXT PRIMARY KEY, name TEXT NOT NULL, goal REAL NOT NULL DEFAULT 0, raised REAL NOT NULL DEFAULT 0, start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'مخطط', description TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS projects ( id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT DEFAULT '', type TEXT DEFAULT '', category TEXT DEFAULT '', branch TEXT DEFAULT '', manager TEXT NOT NULL, budget REAL NOT NULL DEFAULT 0, spent REAL NOT NULL DEFAULT 0, donations REAL NOT NULL DEFAULT 0, beneficiary_count INTEGER NOT NULL DEFAULT 0, progress INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'مخطط', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', description TEXT DEFAULT '', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS donations ( id TEXT PRIMARY KEY, donor_id TEXT NOT NULL REFERENCES donors(id), project_id TEXT REFERENCES projects(id), campaign_id TEXT REFERENCES campaigns(id), amount REAL NOT NULL, method TEXT NOT NULL DEFAULT 'نقدي', channel TEXT NOT NULL DEFAULT 'مباشر', status TEXT NOT NULL DEFAULT 'مسودة', receipt_id TEXT, notes TEXT DEFAULT '', date TEXT NOT NULL DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS beneficiaries ( id TEXT PRIMARY KEY, name TEXT NOT NULL, file_number TEXT DEFAULT '', id_number TEXT DEFAULT '', phone TEXT, city TEXT DEFAULT '', address TEXT DEFAULT '', category TEXT NOT NULL DEFAULT 'أسر محتاجة', status TEXT NOT NULL DEFAULT 'جديد', family_members INTEGER NOT NULL DEFAULT 1, monthly_income REAL NOT NULL DEFAULT 0, marital_status TEXT DEFAULT '', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS aid_records ( id TEXT PRIMARY KEY, beneficiary_id TEXT NOT NULL REFERENCES beneficiaries(id), project_id TEXT REFERENCES projects(id), type TEXT NOT NULL DEFAULT 'مساعدة عاجلة', amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'بانتظار الموافقة', date TEXT NOT NULL DEFAULT '', approved_by TEXT REFERENCES users(id), approved_at TEXT, notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS receipts ( id TEXT PRIMARY KEY, donation_id TEXT REFERENCES donations(id), number TEXT NOT NULL UNIQUE, amount REAL NOT NULL, date TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'تبرع', status TEXT NOT NULL DEFAULT 'مرحّل', printed INTEGER NOT NULL DEFAULT 0, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS accounts ( id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'تفصيلي', level INTEGER NOT NULL DEFAULT 1, parent_id TEXT, currency TEXT NOT NULL DEFAULT 'SAR', balance REAL NOT NULL DEFAULT 0, postable INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'نشط', description TEXT DEFAULT '', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS journal_entries ( id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, date TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', debit_account TEXT NOT NULL DEFAULT '', credit_account TEXT NOT NULL DEFAULT '', amount REAL NOT NULL DEFAULT 0, fund TEXT NOT NULL DEFAULT 'مقيد', currency TEXT NOT NULL DEFAULT 'SAR', project_id TEXT REFERENCES projects(id), source_type TEXT, source_id TEXT, status TEXT NOT NULL DEFAULT 'مسودة', posted_by TEXT REFERENCES users(id), posted_at TEXT, reversed_by TEXT, reversed_at TEXT, reversed_of TEXT, notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS journal_lines ( id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE, line_number INTEGER NOT NULL, account_id TEXT NOT NULL REFERENCES accounts(id), description TEXT DEFAULT '', debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, cost_center_id TEXT REFERENCES cost_centers(id), project_id TEXT REFERENCES projects(id), notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS cost_centers ( id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, manager TEXT DEFAULT '', budget REAL NOT NULL DEFAULT 0, spent REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'نشط', description TEXT DEFAULT '', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS budgets ( id TEXT PRIMARY KEY, name TEXT NOT NULL, year TEXT NOT NULL, amount REAL NOT NULL, spent REAL NOT NULL DEFAULT 0, department TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'مخطط', currency TEXT NOT NULL DEFAULT 'SAR', description TEXT DEFAULT '', notes TEXT DEFAULT '', approved_by TEXT REFERENCES users(id), approved_at TEXT, locked_by TEXT REFERENCES users(id), locked_at TEXT, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS budget_lines ( id TEXT PRIMARY KEY, budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE, line_number INTEGER NOT NULL, account_id TEXT REFERENCES accounts(id), cost_center_id TEXT REFERENCES cost_centers(id), project_id TEXT REFERENCES projects(id), planned_amount REAL NOT NULL DEFAULT 0, actual_amount REAL NOT NULL DEFAULT 0, notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS fiscal_periods ( id TEXT PRIMARY KEY, name TEXT NOT NULL, start_date TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'مفتوحة', closed_at TEXT, closed_by_id TEXT, closed_by_name TEXT, reopened_at TEXT, reopened_by_id TEXT, reopened_by_name TEXT, notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS approvals ( id TEXT PRIMARY KEY, type TEXT NOT NULL, subject TEXT NOT NULL, requester TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'بانتظار موافقتي', priority TEXT NOT NULL DEFAULT 'متوسطة', level INTEGER NOT NULL DEFAULT 1, project_id TEXT REFERENCES projects(id), notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS suppliers ( id TEXT PRIMARY KEY, name TEXT NOT NULL, activity TEXT DEFAULT '', phone TEXT, email TEXT, tax_number TEXT DEFAULT '', contact_person TEXT DEFAULT '', address TEXT DEFAULT '', rating REAL NOT NULL DEFAULT 0, balance REAL NOT NULL DEFAULT 0, notes TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'نشط', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS purchase_requests ( id TEXT PRIMARY KEY, subject TEXT NOT NULL, department TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'متوسطة', status TEXT NOT NULL DEFAULT 'مسودة', requester TEXT DEFAULT '', amount REAL NOT NULL DEFAULT 0, delivery_date TEXT DEFAULT '', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS purchase_orders ( id TEXT PRIMARY KEY, supplier_id TEXT REFERENCES suppliers(id), request_id TEXT REFERENCES purchase_requests(id), subject TEXT NOT NULL, date TEXT NOT NULL DEFAULT '', delivery_date TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'مسودة', total REAL NOT NULL DEFAULT 0, received_amount REAL NOT NULL DEFAULT 0, notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS purchase_order_lines ( id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE, line_number INTEGER NOT NULL, item_id TEXT REFERENCES inventory_items(id), description TEXT NOT NULL DEFAULT '', quantity REAL NOT NULL DEFAULT 0, unit_price REAL NOT NULL DEFAULT 0, received_quantity REAL NOT NULL DEFAULT 0, unit TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS quotes ( id TEXT PRIMARY KEY, request_id TEXT REFERENCES purchase_requests(id), supplier_id TEXT REFERENCES suppliers(id), supplier TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, delivery TEXT DEFAULT '', warranty TEXT DEFAULT '', rating REAL NOT NULL DEFAULT 0, winner INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'بانتظار', valid_until TEXT DEFAULT '', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS inventory_items ( id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT DEFAULT '', unit TEXT NOT NULL DEFAULT 'قطعة', category TEXT DEFAULT '', warehouse_id TEXT, quantity REAL NOT NULL DEFAULT 0, min_quantity REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'نشط', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS warehouses ( id TEXT PRIMARY KEY, name TEXT NOT NULL, location TEXT DEFAULT '', manager TEXT DEFAULT '', capacity REAL NOT NULL DEFAULT 0, occupancy REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'نشط', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS stock_movements ( id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES inventory_items(id), warehouse_id TEXT REFERENCES warehouses(id), type TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0, balance_after REAL NOT NULL DEFAULT 0, related_warehouse_id TEXT REFERENCES warehouses(id), related_stocktake_id TEXT, source_type TEXT, source_id TEXT, reference TEXT DEFAULT '', date TEXT NOT NULL DEFAULT '', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS stocktakes ( id TEXT PRIMARY KEY, name TEXT NOT NULL, warehouse_id TEXT REFERENCES warehouses(id), date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'مسودة', approved_by TEXT REFERENCES users(id), approved_at TEXT, notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS stocktake_lines ( id TEXT PRIMARY KEY, stocktake_id TEXT NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE, item_id TEXT NOT NULL REFERENCES inventory_items(id), system_quantity REAL NOT NULL DEFAULT 0, counted_quantity REAL NOT NULL DEFAULT 0, difference REAL NOT NULL DEFAULT 0, notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS grants ( id TEXT PRIMARY KEY, name TEXT NOT NULL, donor TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'معلق', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS endowments ( id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'وقف عام', value REAL NOT NULL DEFAULT 0, returns REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'نشط', notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS memberships ( id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'عضو', type TEXT NOT NULL DEFAULT 'مجلس إدارة', phone TEXT, email TEXT, status TEXT NOT NULL DEFAULT 'نشط', joined_at TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS meetings ( id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL DEFAULT '', location TEXT DEFAULT '', attendees TEXT DEFAULT '[]', status TEXT NOT NULL DEFAULT 'مجدول', notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS audit_log ( id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), user_name TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, description TEXT DEFAULT '', before TEXT, after TEXT, ip TEXT DEFAULT '', timestamp TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS fixed_assets ( id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT DEFAULT '', category TEXT DEFAULT '', location TEXT DEFAULT '', cost REAL NOT NULL DEFAULT 0, salvage_value REAL NOT NULL DEFAULT 0, useful_life_months INTEGER NOT NULL DEFAULT 60, accumulated_depreciation REAL NOT NULL DEFAULT 0, depreciation_method TEXT NOT NULL DEFAULT 'قسط ثابت', status TEXT NOT NULL DEFAULT 'نشط', condition TEXT DEFAULT 'جيد', purchase_date TEXT DEFAULT '', supplier_id TEXT REFERENCES suppliers(id), serial_number TEXT DEFAULT '', responsible_person TEXT DEFAULT '', source_type TEXT, source_id TEXT, notes TEXT DEFAULT '', created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS asset_depreciations ( id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE, date TEXT NOT NULL DEFAULT '', amount REAL NOT NULL DEFAULT 0, book_value_after REAL NOT NULL DEFAULT 0, method TEXT NOT NULL DEFAULT 'قسط ثابت', notes TEXT DEFAULT '', source_type TEXT, source_id TEXT, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '' );
CREATE TABLE IF NOT EXISTS asset_movements ( id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE, type TEXT NOT NULL, from_location TEXT DEFAULT '', to_location TEXT DEFAULT '', from_responsible TEXT DEFAULT '', to_responsible TEXT DEFAULT '', cost REAL NOT NULL DEFAULT 0, date TEXT NOT NULL DEFAULT '', reason TEXT DEFAULT '', notes TEXT DEFAULT '', source_type TEXT, source_id TEXT, created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT '' );
`;

const MIGRATIONS = [
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
  `ALTER TABLE suppliers ADD COLUMN contact_person TEXT DEFAULT ''`,
  `ALTER TABLE suppliers ADD COLUMN address TEXT DEFAULT ''`,
  `ALTER TABLE suppliers ADD COLUMN rating REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE suppliers ADD COLUMN balance REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE suppliers ADD COLUMN notes TEXT DEFAULT ''`,
  `ALTER TABLE suppliers ADD COLUMN created_by TEXT REFERENCES users(id)`,
  `ALTER TABLE suppliers ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE purchase_requests ADD COLUMN requester TEXT DEFAULT ''`,
  `ALTER TABLE purchase_requests ADD COLUMN amount REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE purchase_requests ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE purchase_orders ADD COLUMN request_id TEXT REFERENCES purchase_requests(id)`,
  `ALTER TABLE purchase_orders ADD COLUMN received_amount REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE purchase_orders ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE quotes ADD COLUMN supplier_id TEXT REFERENCES suppliers(id)`,
  `ALTER TABLE quotes ADD COLUMN valid_until TEXT DEFAULT ''`,
  `ALTER TABLE quotes ADD COLUMN notes TEXT DEFAULT ''`,
  `ALTER TABLE quotes ADD COLUMN created_by TEXT REFERENCES users(id)`,
  `ALTER TABLE quotes ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE inventory_items ADD COLUMN notes TEXT DEFAULT ''`,
  `ALTER TABLE inventory_items ADD COLUMN created_by TEXT REFERENCES users(id)`,
  `ALTER TABLE inventory_items ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE warehouses ADD COLUMN capacity REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE warehouses ADD COLUMN occupancy REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE warehouses ADD COLUMN notes TEXT DEFAULT ''`,
  `ALTER TABLE warehouses ADD COLUMN created_by TEXT REFERENCES users(id)`,
  `ALTER TABLE warehouses ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE fixed_assets ADD COLUMN code TEXT DEFAULT ''`,
  `ALTER TABLE fixed_assets ADD COLUMN salvage_value REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE fixed_assets ADD COLUMN useful_life_months INTEGER NOT NULL DEFAULT 60`,
  `ALTER TABLE fixed_assets ADD COLUMN depreciation_method TEXT NOT NULL DEFAULT 'قسط ثابت'`,
  `ALTER TABLE fixed_assets ADD COLUMN condition TEXT DEFAULT 'جيد'`,
  `ALTER TABLE fixed_assets ADD COLUMN supplier_id TEXT REFERENCES suppliers(id)`,
  `ALTER TABLE fixed_assets ADD COLUMN serial_number TEXT DEFAULT ''`,
  `ALTER TABLE fixed_assets ADD COLUMN responsible_person TEXT DEFAULT ''`,
  `ALTER TABLE fixed_assets ADD COLUMN source_type TEXT`,
  `ALTER TABLE fixed_assets ADD COLUMN source_id TEXT`,
  `ALTER TABLE fixed_assets ADD COLUMN notes TEXT DEFAULT ''`,
  `ALTER TABLE fixed_assets ADD COLUMN created_by TEXT REFERENCES users(id)`,
  `ALTER TABLE fixed_assets ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
];

function splitStatements(text) {
  return text
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

console.log("[db-init] creating tables...");
try {
  const stmts = splitStatements(DDL);
  for (const stmt of stmts) {
    await client.execute(stmt);
  }
  console.log("[db-init] DDL executed successfully");
} catch (e) {
  console.error("[db-init] DDL failed:", e.message);
  process.exit(1);
}

console.log("[db-init] running migrations...");
for (const m of MIGRATIONS) {
  try {
    const stmts = splitStatements(m);
    for (const stmt of stmts) {
      await client.execute(stmt);
    }
  } catch {
    // ignore "duplicate column" errors
  }
}
console.log("[db-init] migrations done");

// ============ SEED DATA ============
const { rows: existing } = await client.execute("SELECT id FROM users LIMIT 1");
if (existing.length > 0) {
  console.log("[db-init] DB already has data, skipping seed");
} else {
  console.log("[db-init] seeding demo data...");

  const ts = new Date().toLocaleString("ar-SA", { hour12: false });

  // Roles
  await client.execute(
    "INSERT INTO roles (id,name,description,permissions,created_at) VALUES ('role-admin','مدير النظام','صلاحيات كاملة','[\"*\"]','" +
      ts +
      "')",
  );
  await client.execute(
    'INSERT INTO roles (id,name,description,permissions,created_at) VALUES (\'role-accountant\',\'محاسب\',\'محاسب مالي\',\'["donations.view","donations.create","journal.view","journal.create","accounts.view","reports.view"]\',\'' +
      ts +
      "')",
  );
  await client.execute(
    'INSERT INTO roles (id,name,description,permissions,created_at) VALUES (\'role-manager\',\'مدير\',\'مدير جمعية\',\'["donations.*","projects.*","beneficiaries.*","reports.*","users.view","finance.*"]\',\'' +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO roles (id,name,description,permissions,created_at) VALUES ('role-donations','موظف تبرعات','موظف قسم التبرعات','[\"donors.*\",\"donations.*\",\"receipts.*\",\"campaigns.*\"]','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO roles (id,name,description,permissions,created_at) VALUES ('role-projects','منسق مشاريع','منسق ومتابعة مشاريع','[\"projects.*\",\"beneficiaries.*\",\"aid.*\"]','" +
      ts +
      "')",
  );

  // Branches
  await client.execute(
    "INSERT INTO branches (id,name,city,manager,phone,email,status,created_at) VALUES ('BR-001','الفرع الرئيسي - الرياض','الرياض','سلطان العتيبي','0114567890','riyadh@albir.org.sa','نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO branches (id,name,city,manager,phone,email,status,created_at) VALUES ('BR-002','فرع جدة','جدة','نورة القحطاني','0126543210','jeddah@albir.org.sa','نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO branches (id,name,city,manager,phone,email,status,created_at) VALUES ('BR-003','فرع الدمام','الدمام','فهد الغامدي','0138234567','dammam@albir.org.sa','نشط','" +
      ts +
      "')",
  );

  // Users (simple base64 hash)
  const hash = (p) => Buffer.from(p).toString("base64");
  await client.execute(
    "INSERT INTO users (id,name,email,password,role,branch_id,status,created_at,last_login) VALUES ('USR-001','سعد الغامدي','saud@albir.org.sa','" +
      hash("admin123") +
      "','مدير النظام','BR-001','نشط','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO users (id,name,email,password,role,branch_id,status,created_at) VALUES ('USR-002','سارة الزهراني','sara@albir.org.sa','" +
      hash("acc123") +
      "','محاسب','BR-001','نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO users (id,name,email,password,role,branch_id,status,created_at) VALUES ('USR-003','محمد الغامدي','mohammed@albir.org.sa','" +
      hash("mgr123") +
      "','مدير','BR-002','نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO users (id,name,email,password,role,branch_id,status,created_at) VALUES ('USR-004','نورة القحطاني','noura@albir.org.sa','" +
      hash("don123") +
      "','موظف تبرعات','BR-001','نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO users (id,name,email,password,role,branch_id,status,created_at) VALUES ('USR-005','فهد العتيبي','fahad@albir.org.sa','" +
      hash("proj123") +
      "','منسق مشاريع','BR-003','نشط','" +
      ts +
      "')",
  );

  // Accounts
  await client.execute(
    "INSERT INTO accounts (id, code, name, type, currency, balance, status, created_at) VALUES ('ACC-CASH','1101','الصندوق','تفصيلي','SAR',125000,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO accounts (id, code, name, type, currency, balance, status, created_at) VALUES ('ACC-BANK','1102','البنك الإسلامي','تفصيلي','SAR',2450000,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO accounts (id, code, name, type, currency, balance, status, created_at) VALUES ('ACC-DEPOSITS','1103','ودائع استثمارية','تفصيلي','SAR',500000,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO accounts (id, code, name, type, currency, balance, status, created_at) VALUES ('ACC-DONATIONS','4101','إيرادات التبرعات','تفصيلي','SAR',0,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO accounts (id, code, name, type, currency, balance, status, created_at) VALUES ('ACC-CHARITY','5101','مساعدات مالية','تفصيلي','SAR',0,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO accounts (id, code, name, type, currency, balance, status, created_at) VALUES ('ACC-PROJECTS','5102','مشاريع خيرية','تفصيلي','SAR',0,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO accounts (id, code, name, type, currency, balance, status, created_at) VALUES ('ACC-SALARIES','5201','رواتب ومكافآت','تفصيلي','SAR',0,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO accounts (id, code, name, type, currency, balance, status, created_at) VALUES ('ACC-ASSETS','1501','أصول ثابتة','تفصيلي','SAR',850000,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO accounts (id, code, name, type, currency, balance, status, created_at) VALUES ('ACC-DEPR','1502','مجمع الإهلاك','تفصيلي','SAR',-120000,'نشط','" +
      ts +
      "')",
  );

  // Donors
  const donorIds = ["D-001", "D-002", "D-003", "D-004", "D-005", "D-006", "D-007", "D-008"];
  const donorNames = [
    "مؤسسة الراجحي الإنسانية",
    "شركة أرامكو السعودية",
    "عبدالله بن سليمان العتيبي",
    "مؤسسة محمد وفهد العتيبي",
    "نورة بنت محمد القحطاني",
    "شركة الاتصالات السعودية",
    "سلطان العتيبي",
    "شركة الزامل",
  ];
  const donorTypes = ["مؤسسة", "شركة", "فرد", "مؤسسة", "فرد", "شركة", "فرد", "شركة"];
  const donorTags = ["ذهبي", "ذهبي", "فضي", "ذهبي", "برونزي", "فضي", "فضي", "برونزي"];
  const donorTotals = [1200000, 850000, 420000, 680000, 220000, 180000, 95000, 65000];
  const donorEmails = [
    "info@rajihi.org",
    "csr@aramco.com",
    "abdullah@gmail.com",
    "info@alotaibi.org",
    "noura.q@email.com",
    "csr@stc.com.sa",
    "sultan@gmail.com",
    "info@zamil.com",
  ];
  const donorPhones = [
    "0114561234",
    "0134567890",
    "0551234567",
    "0119876543",
    "0559876543",
    "0115000000",
    "0554567890",
    "0137890123",
  ];
  const donorCities = ["الرياض", "الدمام", "الرياض", "جدة", "الرياض", "الرياض", "الدمام", "الدمام"];
  for (let i = 0; i < donorIds.length; i++) {
    await client.execute(
      "INSERT INTO donors (id,name,type,email,phone,city,tag,total_donations,donation_count,recurring,status,created_by,created_at,updated_at) VALUES ('" +
        donorIds[i] +
        "','" +
        donorNames[i] +
        "','" +
        donorTypes[i] +
        "','" +
        donorEmails[i] +
        "','" +
        donorPhones[i] +
        "','" +
        donorCities[i] +
        "','" +
        donorTags[i] +
        "'," +
        donorTotals[i] +
        ",0,1,'نشط','USR-004','" +
        ts +
        "','" +
        ts +
        "')",
    );
  }

  // Campaigns
  await client.execute(
    "INSERT INTO campaigns (id,name,goal,raised,status,description,created_by,created_at) VALUES ('CMP-001','كفالة الأيتام',1200000,1240000,'نشط','حملة كفالة الأيتام الشهرية','USR-004','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO campaigns (id,name,goal,raised,status,description,created_by,created_at) VALUES ('CMP-002','كسوة الشتاء',800000,620000,'نشط','حملة كسوة الشتاء للمحتاجين','USR-004','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO campaigns (id,name,goal,raised,status,description,created_by,created_at) VALUES ('CMP-003','إفطار صائم',600000,860000,'منتهية','حملة إفطار صائم خلال رمضان','USR-004','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO campaigns (id,name,goal,raised,status,description,created_by,created_at) VALUES ('CMP-004','علاج المرضى',1500000,380000,'نشط','حملة دعم علاج المرضى','USR-004','" +
      ts +
      "')",
  );

  // Projects
  await client.execute(
    "INSERT INTO projects (id,name,manager,budget,spent,donations,beneficiary_count,progress,status,description,created_by,created_at,updated_at) VALUES ('PRJ-001','كفالة الأيتام','فهد العتيبي',1200000,980000,1240000,340,82,'نشط','مشروع كفالة الأيتام الشهري','USR-005','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO projects (id,name,manager,budget,spent,donations,beneficiary_count,progress,status,description,created_by,created_at,updated_at) VALUES ('PRJ-002','السلال الغذائية','نورة القحطاني',600000,520000,540000,850,90,'نشط','توزيع سلال غذائية شهرية','USR-005','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO projects (id,name,manager,budget,spent,donations,beneficiary_count,progress,status,description,created_by,created_at,updated_at) VALUES ('PRJ-003','كسوة الشتاء','سلطان العتيبي',450000,380000,620000,420,84,'مكتمل','حملة كسوة الشتاء','USR-005','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO projects (id,name,manager,budget,spent,donations,beneficiary_count,progress,status,description,created_by,created_at,updated_at) VALUES ('PRJ-004','علاج المرضى','سارة الزهراني',2000000,350000,380000,25,18,'نشط','دعم علاج المرضى المحتاجين','USR-005','" +
      ts +
      "','" +
      ts +
      "')",
  );

  // Beneficiaries
  await client.execute(
    "INSERT INTO beneficiaries (id,name,id_number,phone,city,category,status,created_by,created_at,updated_at) VALUES ('BEN-001','أسرة أحمد العمري','1012345678','0551112233','الرياض','أسر محتاجة','فعال','USR-005','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO beneficiaries (id,name,id_number,phone,city,category,status,created_by,created_at,updated_at) VALUES ('BEN-002','فاطمة السلمي','1023456789','0552223344','جدة','أرملة','فعال','USR-005','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO beneficiaries (id,name,id_number,phone,city,category,status,created_by,created_at,updated_at) VALUES ('BEN-003','أسرة سعيد الغامدي','1034567890','0553334455','الدمام','أيتام','فعال','USR-005','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO beneficiaries (id,name,id_number,phone,city,category,status,created_by,created_at,updated_at) VALUES ('BEN-004','محمد العتيبي','1045678901','0554445566','الرياض','مريض','فعال','USR-005','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO beneficiaries (id,name,id_number,phone,city,category,status,created_by,created_at,updated_at) VALUES ('BEN-005','خالد القرني','1056789012','0555556677','مكة','عاطل','فعال','USR-005','" +
      ts +
      "','" +
      ts +
      "')",
  );

  // Donations
  await client.execute(
    "INSERT INTO donations (id,donor_id,project_id,campaign_id,amount,method,channel,status,date,created_by,created_at,updated_at) VALUES ('DN-001','D-001','PRJ-001','CMP-001',500000,'تحويل بنكي','مصرف الراجحي','مؤكد','1446/10/01','USR-004','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO donations (id,donor_id,project_id,campaign_id,amount,method,channel,status,date,created_by,created_at,updated_at) VALUES ('DN-002','D-002','PRJ-004','CMP-004',300000,'شيك','HSBC','مؤكد','1446/10/03','USR-004','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO donations (id,donor_id,project_id,campaign_id,amount,method,channel,status,date,created_by,created_at,updated_at) VALUES ('DN-003','D-003','PRJ-001','CMP-001',10000,'نقدي','مباشر','مؤكد','1446/10/05','USR-004','" +
      ts +
      "','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO donations (id,donor_id,project_id,campaign_id,amount,method,channel,status,date,created_by,created_at,updated_at) VALUES ('DN-004','D-004','PRJ-002','CMP-002',200000,'تحويل بنكي','مصرف الإنماء','مؤكد','1446/10/08','USR-004','" +
      ts +
      "','" +
      ts +
      "')",
  );

  // Inventory & Warehouses
  await client.execute(
    "INSERT INTO warehouses (id,name,location,manager,capacity,status,created_at) VALUES ('WH-001','المستودع الرئيسي - الرياض','حي المروة، الرياض','عبدالله السبيعي',500,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO warehouses (id,name,location,manager,capacity,status,created_at) VALUES ('WH-002','مستودع جدة','حي الصفا، جدة','أحمد الزهراني',300,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO inventory_items (id,name,sku,unit,category,warehouse_id,quantity,min_quantity,price,status,created_at) VALUES ('INV-001','سلة غذائية','FOOD-001','قطعة','مساعدات','WH-001',450,50,350,'متوفر','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO inventory_items (id,name,sku,unit,category,warehouse_id,quantity,min_quantity,price,status,created_at) VALUES ('INV-002','بطانية شتوية','BLANKET-001','قطعة','ملابس','WH-001',280,30,180,'متوفر','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO inventory_items (id,name,sku,unit,category,warehouse_id,quantity,min_quantity,price,status,created_at) VALUES ('INV-003','تمرة غذائية','DATE-001','كيس','مساعدات','WH-002',15,20,45,'منخفض','" +
      ts +
      "')",
  );

  // Suppliers
  await client.execute(
    "INSERT INTO suppliers (id,name,activity,phone,email,tax_number,status,created_at) VALUES ('SUP-001','شركة تموين السعودية','تموين غذائي','0112345678','info@supply.sa','300123456700001','نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO suppliers (id,name,activity,phone,email,tax_number,status,created_at) VALUES ('SUP-002','مؤسسة العلا للتجهيزات','تجهيزات مكتبية','0123456789','info@alaa.sa','300123456700002','نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO suppliers (id,name,activity,phone,email,tax_number,status,created_at) VALUES ('SUP-003','شركة الإمداد الذهبي','معدات وأنظمة','0134567890','info@goldsupply.sa','300123456700003','نشط','" +
      ts +
      "')",
  );

  // Cost Centers
  await client.execute(
    "INSERT INTO cost_centers (id,code,name,manager,budget,spent,status,created_at) VALUES ('CC-001','CC001','إدارة المساجد','سلطان العتيبي',200000,85000,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO cost_centers (id,code,name,manager,budget,spent,status,created_at) VALUES ('CC-002','CC002','إدارة التبرعات','نورة القحطاني',50000,22000,'نشط','" +
      ts +
      "')",
  );
  await client.execute(
    "INSERT INTO cost_centers (id,code,name,manager,budget,spent,status,created_at) VALUES ('CC-003','CC003','الإدارة المالية','سارة الزهراني',150000,95000,'نشط','" +
      ts +
      "')",
  );

  // Audit log entry
  await client.execute(
    "INSERT INTO audit_log (id,user_id,user_name,action,entity_type,entity_id,description,timestamp) VALUES ('AUD-INIT','USR-001','سعد الغامدي','نظام','التهيئة','INIT','تم تهيئة قاعدة البيانات التجريبية','" +
      ts +
      "')",
  );

  console.log("[db-init] seed data inserted successfully");
}

const { rows: countCheck } = await client.execute("SELECT COUNT(*) as cnt FROM users");
console.log(`[db-init] users in DB: ${countCheck[0].cnt}`);
const { rows: dbSize } = await client.execute(
  "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='table'",
);
console.log(`[db-init] tables created: ${dbSize[0].cnt}`);

client.close();
console.log("[db-init] DONE — database ready");
