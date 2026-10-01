/**
 * Real database backup & restore for ONE association (tenant).
 *
 * BACKUP — a consistent snapshot (REPEATABLE READ, read-only transaction) of
 * every public table, taken with COPY … TO STDOUT, written as a gzip file:
 *   line 1: JSON header {format, version, tenant, createdAt, migrations[], tables[]}
 *   then:   each table's COPY text payload, concatenated (sizes in the header)
 * The file lives under $BACKUP_DIR/<tenant>/ (mode 0600) and is identified by
 * its SHA-256. Session/login/one-time-token tables are never backed up.
 *
 * RESTORE — one transaction, all-or-nothing:
 *   verify file hash + format + same tenant + identical migration set →
 *   keep the append-only history (audit_log, backup_records) aside →
 *   TRUNCATE every public table → COPY the backup back in FK order →
 *   put the kept history back (user links that no longer exist are nulled).
 * Sessions are cleared, so everyone signs in again afterwards.
 */
import postgres from "postgres";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getCurrentTenant } from "./tenant-context";
import { AppError } from "./errors";

export const BACKUP_FORMAT = "thawab-backup";
export const BACKUP_VERSION = 1;
/** Secrets/ephemeral auth state — never written to a backup file. */
const EXCLUDED = new Set(["sessions", "login_attempts", "auth_tokens"]);
/** Append-only history: survives a restore unchanged (the restore is recorded in it). */
const PRESERVED = ["audit_log", "backup_records"];

type Sql = postgres.Sql;
type TableInfo = { name: string; columns: string[] };
type HeaderTable = TableInfo & { rows: number; bytes: number };
export type BackupHeader = {
  format: string;
  version: number;
  tenant: string;
  createdAt: string;
  migrations: string[];
  tables: HeaderTable[];
};
export type BackupResult = {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  tablesCount: number;
  rowsCount: number;
};

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

function tenantSlug(): string {
  return (getCurrentTenant()?.id ?? "default").replace(/[^A-Za-z0-9_-]/g, "_");
}

function databaseUrl(): string {
  const url = getCurrentTenant()?.databaseUrl ?? process.env.DATABASE_URL;
  if (!url) throw new AppError("قاعدة البيانات غير مهيأة", 500, "NO_DATABASE");
  return url;
}

/** Per-tenant backup directory (created 0700). */
export function backupDir(): string {
  const base = resolve(process.env.BACKUP_DIR || "/var/lib/thawab/backups");
  const dir = join(base, tenantSlug());
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** Resolve a stored file name safely inside this tenant's directory. */
export function backupPath(fileName: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(fileName)) throw new AppError("اسم ملف غير صالح", 400, "BAD_FILE");
  return join(backupDir(), fileName);
}

function connect(): Sql {
  // Dedicated short-lived connection: COPY streams + one long transaction.
  return postgres(databaseUrl(), { max: 1, prepare: false, idle_timeout: 5, onnotice: () => {} });
}

/** Public base tables with their columns, ordered parents-before-children (FK). */
async function listTables(sql: Sql | postgres.TransactionSql): Promise<TableInfo[]> {
  const cols = await sql<{ table_name: string; column_name: string }[]>`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position`;
  const byTable = new Map<string, string[]>();
  for (const r of cols) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, []);
    byTable.get(r.table_name)!.push(r.column_name);
  }
  const fks = await sql<{ child: string; parent: string }[]>`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
    FROM pg_constraint c
    WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
      AND c.conrelid <> c.confrelid`;
  const strip = (n: string) => n.replace(/^public\./, "").replace(/^"|"$/g, "");
  const parents = new Map<string, Set<string>>();
  for (const name of byTable.keys()) parents.set(name, new Set());
  for (const f of fks) {
    const child = strip(f.child);
    const parent = strip(f.parent);
    if (parents.has(child) && parents.has(parent)) parents.get(child)!.add(parent);
  }
  // Kahn: emit a table once all its parents are emitted (stable by name).
  const order: string[] = [];
  const done = new Set<string>();
  const pending = [...parents.keys()].sort();
  while (pending.length) {
    const i = pending.findIndex((t) => [...parents.get(t)!].every((p) => done.has(p)));
    if (i < 0) throw new AppError("تعذّر ترتيب الجداول (اعتماد دائري)", 500, "FK_CYCLE");
    const [t] = pending.splice(i, 1);
    order.push(t);
    done.add(t);
  }
  return order.map((name) => ({ name, columns: byTable.get(name)! }));
}

async function migrationHashes(sql: Sql | postgres.TransactionSql): Promise<string[]> {
  try {
    const rows = await sql<{ hash: string }[]>`SELECT hash FROM drizzle."__drizzle_migrations"`;
    return rows.map((r) => r.hash).sort();
  } catch {
    return [];
  }
}

async function readAll(stream: AsyncIterable<Buffer | string>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

function countRows(buf: Buffer): number {
  // COPY text format: one row per line; embedded newlines are escaped (\n).
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++;
  return n;
}

/** Take a real, consistent backup of the current tenant database. */
export async function createBackup(): Promise<BackupResult> {
  const sql = connect();
  try {
    const { header, payloads } = await sql.begin(
      "isolation level repeatable read read only",
      async (tx) => {
        const tables = (await listTables(tx)).filter((t) => !EXCLUDED.has(t.name));
        const migrations = await migrationHashes(tx);
        const payloads: Buffer[] = [];
        const headerTables: HeaderTable[] = [];
        for (const t of tables) {
          const colList = t.columns.map(q).join(", ");
          const stream = await tx
            .unsafe(`COPY (SELECT ${colList} FROM ${q(t.name)}) TO STDOUT`)
            .readable();
          const buf = await readAll(stream);
          payloads.push(buf);
          headerTables.push({ ...t, rows: countRows(buf), bytes: buf.length });
        }
        const header: BackupHeader = {
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          tenant: tenantSlug(),
          createdAt: new Date().toISOString(),
          migrations,
          tables: headerTables,
        };
        return { header, payloads };
      },
    );

    const gz = gzipSync(Buffer.concat([Buffer.from(JSON.stringify(header) + "\n"), ...payloads]));
    const sha256 = createHash("sha256").update(gz).digest("hex");
    const stamp = header.createdAt.replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
    const fileName = `${header.tenant}-${stamp}-${sha256.slice(0, 8)}.thawab.gz`;
    const path = backupPath(fileName);
    writeFileSync(path, gz, { mode: 0o600 });
    chmodSync(path, 0o600);
    return {
      fileName,
      sizeBytes: gz.length,
      sha256,
      tablesCount: header.tables.length,
      rowsCount: header.tables.reduce((s, t) => s + t.rows, 0),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Read + verify a backup file (hash, format, tenant). Returns header + payload. */
export function readBackupFile(fileName: string, expectedSha?: string) {
  const path = backupPath(fileName);
  if (!existsSync(path)) throw new AppError("ملف النسخة غير موجود على الخادم", 404, "FILE_MISSING");
  const gz = readFileSync(path);
  const sha = createHash("sha256").update(gz).digest("hex");
  if (expectedSha && sha !== expectedSha)
    throw new AppError("ملف النسخة تالف أو معدّل (البصمة لا تطابق)", 409, "CHECKSUM_MISMATCH");
  const raw = gunzipSync(gz);
  const nl = raw.indexOf(10);
  const header = JSON.parse(raw.subarray(0, nl).toString("utf8")) as BackupHeader;
  if (header.format !== BACKUP_FORMAT || header.version !== BACKUP_VERSION)
    throw new AppError("صيغة ملف النسخة غير مدعومة", 400, "BAD_FORMAT");
  if (header.tenant !== tenantSlug())
    throw new AppError("هذه النسخة تخص جمعية أخرى — لا يمكن استعادتها هنا", 403, "WRONG_TENANT");
  return { header, body: raw.subarray(nl + 1), sha };
}

/** Restore the tenant database from a verified backup file (all-or-nothing). */
export async function restoreBackup(fileName: string, expectedSha: string): Promise<{ rows: number }> {
  const { header, body } = readBackupFile(fileName, expectedSha);
  const sql = connect();
  try {
    let restoredRows = 0;
    await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL lock_timeout = '15s'");
      const current = await listTables(tx);
      const migrations = await migrationHashes(tx);
      if (JSON.stringify(migrations) !== JSON.stringify(header.migrations))
        throw new AppError(
          "بنية قاعدة البيانات تغيّرت منذ هذه النسخة — لا يمكن استعادتها بأمان",
          409,
          "SCHEMA_MISMATCH",
        );
      const backupSet = new Set(header.tables.map((t) => t.name));
      const restorable = current.filter((t) => !EXCLUDED.has(t.name));
      for (const t of restorable)
        if (!backupSet.has(t.name))
          throw new AppError(`الجدول ${t.name} غير موجود في النسخة`, 409, "SCHEMA_MISMATCH");

      // Locate each table's payload in the file.
      const slices = new Map<string, { buf: Buffer; columns: string[]; rows: number }>();
      let off = 0;
      for (const t of header.tables) {
        slices.set(t.name, { buf: body.subarray(off, off + t.bytes), columns: t.columns, rows: t.rows });
        off += t.bytes;
      }

      // 1) keep append-only history aside
      for (const p of PRESERVED)
        await tx.unsafe(`CREATE TEMP TABLE ${q("_keep_" + p)} ON COMMIT DROP AS SELECT * FROM ${q(p)}`);

      // 2) empty every table in one statement (FK-safe; sessions are cleared too)
      await tx.unsafe(`TRUNCATE ${current.map((t) => q(t.name)).join(", ")}`);

      // 3) load the backup, parents before children
      for (const t of restorable) {
        if (PRESERVED.includes(t.name)) continue;
        const s = slices.get(t.name)!;
        if (!s.buf.length) continue;
        const w = await tx
          .unsafe(`COPY ${q(t.name)} (${s.columns.map(q).join(", ")}) FROM STDIN`)
          .writable();
        await new Promise<void>((ok, fail) => {
          w.on("error", fail);
          w.on("finish", () => ok());
          w.end(s.buf);
        });
        restoredRows += s.rows;
      }

      // 4) put the history back; null user links that no longer exist
      for (const p of PRESERVED) {
        const refs = await tx<{ col: string; parent: string; pcol: string }[]>`
          SELECT a.attname AS col, c.confrelid::regclass::text AS parent, pa.attname AS pcol
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
          JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
          WHERE c.contype = 'f' AND c.conrelid = ${p}::regclass`;
        for (const r of refs) {
          const parent = r.parent.replace(/^public\./, "").replace(/^"|"$/g, "");
          await tx.unsafe(
            `UPDATE ${q("_keep_" + p)} SET ${q(r.col)} = NULL WHERE ${q(r.col)} IS NOT NULL AND ${q(r.col)} NOT IN (SELECT ${q(r.pcol)} FROM ${q(parent)})`,
          );
        }
        await tx.unsafe(`INSERT INTO ${q(p)} SELECT * FROM ${q("_keep_" + p)}`);
      }
    });
    return { rows: restoredRows };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Remove a backup file (record deletion). Missing file is not an error. */
export function deleteBackupFile(fileName: string) {
  if (!fileName) return;
  const path = backupPath(fileName);
  if (existsSync(path)) unlinkSync(path);
}
