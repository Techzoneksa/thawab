import { db as lazyDb, dialect, runRawSql, diagnose } from "./client";
import { auditLog } from "./schema";
import { SQLITE_DDL, SQLITE_MIGRATIONS, PG_DDL, PG_MIGRATIONS } from "./init";

export { dialect, runRawSql, diagnose };

let _dbReady = false;
let _initCalled = false;
let _initPromise: Promise<void> | null = null;

export async function ensureInit() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (_initCalled) return;
    _initCalled = true;
    try {
      const t0 = Date.now();
      await runRawSql(SQLITE_DDL);
      for (const migration of SQLITE_MIGRATIONS) {
        try { await runRawSql(migration); } catch { }
      }
      if (dialect === "postgres") {
        await runRawSql(PG_DDL);
        for (const migration of PG_MIGRATIONS) {
          try { await runRawSql(migration); } catch { }
        }
      }
      _dbReady = true;
      const d = await diagnose();
      console.log(`[db] init OK (${Date.now() - t0}ms)`, JSON.stringify(d));
    } catch (e) {
      console.error("[db] init failed:", e instanceof Error ? e.message : e);
    }
  })();
  return _initPromise;
}

export function isDbReady() {
  return _dbReady;
}

export const db = new Proxy({} as any, {
  get(_target, prop) {
    ensureInit().catch(() => {});
    return (lazyDb as any)[prop];
  },
});

export function now() {
  return new Date().toLocaleString("ar-SA", { hour12: false });
}

export function genId(prefix = "") {
  const num = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  return prefix ? `${prefix}-${num}` : num;
}

export async function addAudit(
  action: string,
  entityType: string,
  entityId: string,
  description: string,
  userId?: string,
  userName = "نظام",
  before?: string,
  after?: string,
) {
  await ensureInit();
  await db.insert(auditLog)
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
