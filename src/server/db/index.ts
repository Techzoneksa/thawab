import { db, dialect, runRawSql } from "./client";
import { auditLog } from "./schema";
import { SQLITE_DDL, SQLITE_MIGRATIONS, PG_DDL, PG_MIGRATIONS } from "./init";

export { db, dialect, runRawSql };

let _dbReady = false;

export function initDB() {
  try {
    runRawSql(SQLITE_DDL);
    for (const migration of SQLITE_MIGRATIONS) {
      try {
        runRawSql(migration);
      } catch {
        // Column already exists, ignore
      }
    }
    if (dialect === "postgres") {
      runRawSql(PG_DDL);
      for (const migration of PG_MIGRATIONS) {
        try {
          runRawSql(migration);
        } catch {
          // Column already exists, ignore
        }
      }
    }
    _dbReady = true;
    console.log("[db] init OK");
  } catch (e) {
    console.error("[db] init failed:", e instanceof Error ? e.message : e);
  }
}

export function isDbReady() {
  return _dbReady;
}

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
  db.insert(auditLog)
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
