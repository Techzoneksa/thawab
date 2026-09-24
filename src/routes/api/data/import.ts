import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { accounts, costCenters, budgets, budgetLines, importBatches } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { postBalancedEntry } from "@/server/db/gl";
import { JournalStatus, Fund, BudgetStatus, AccountClassification, AccountStatus } from "@/lib/enums";

const journalLineSchema = z.object({
  accountCode: z.string().trim().min(1),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
  costCenter: z.string().trim().optional(),
  notes: z.string().optional(),
});

const journalEntrySchema = z.object({
  number: z.string().optional(),
  date: z.string().optional(),
  description: z.string().trim().min(1),
  fund: z.string().optional(),
  lines: z.array(journalLineSchema).min(2),
});

const budgetLineSchema = z.object({
  accountCode: z.string().trim().optional(),
  plannedAmount: z.coerce.number().default(0),
  notes: z.string().optional(),
});

const budgetSchema = z.object({
  name: z.string().trim().min(1),
  year: z.string().trim().min(1),
  department: z.string().optional(),
  lines: z.array(budgetLineSchema).min(1),
});

const accountImportSchema = z.object({
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  classification: z.nativeEnum(AccountClassification),
  parentCode: z.string().trim().optional(),
  postable: z.boolean().default(true),
  currency: z.string().trim().default("SAR"),
  description: z.string().optional(),
});

const importSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("journal"),
    entries: z.array(journalEntrySchema).min(1),
    fileName: z.string().optional(),
    fileHash: z.string().optional(),
  }),
  z.object({ type: z.literal("budget"), budgets: z.array(budgetSchema).min(1) }),
  z.object({
    type: z.literal("accounts"),
    accounts: z.array(accountImportSchema).min(1),
    fileName: z.string().optional(),
    fileHash: z.string().optional(),
  }),
]);

const BALANCE_TOLERANCE = 0.005;
const validFund = (f?: string): f is (typeof Fund)[keyof typeof Fund] =>
  !!f && (Object.values(Fund) as string[]).includes(f);

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await parseBody(event.request, importSchema);

    // Governance (Phase 1B): journal import requires the dedicated import
    // permission — which never implies posting (imported journals are created
    // as DRAFT and must pass submit → approve → post like any manual journal).
    const needed =
      body.type === "journal"
        ? "finance.import.journal"
        : body.type === "accounts"
          ? "finance.accounts.create"
          : "finance.budget.create";
    if (!(await hasPermission(ctx.user.role, needed)))
      return err("لا تملك صلاحية لهذا الاستيراد", 403, "FORBIDDEN");

    // Resolve account codes → ids (shared by the flows).
    const accs = await db.select().from(accounts);
    const accByCode = new Map(accs.map((a) => [String(a.code).trim(), a]));

    // ---------------- Chart-of-accounts import ----------------
    if (body.type === "accounts") {
      const fileByCode = new Map(body.accounts.map((a) => [a.code, a]));
      const errors: string[] = [];

      // Validate parent references (must exist in the file or already in the DB).
      for (const a of body.accounts) {
        if (a.parentCode && !fileByCode.has(a.parentCode) && !accByCode.has(a.parentCode))
          errors.push(`حساب ${a.code}: الحساب الأب "${a.parentCode}" غير موجود`);
      }
      if (errors.length)
        return Response.json(
          { ok: false, created: 0, errors: errors.slice(0, 50), errorCount: errors.length },
          { status: 422 },
        );

      // Order parents before children (file-internal parents), guarding cycles.
      const ordered: typeof body.accounts = [];
      const placed = new Set<string>();
      const visiting = new Set<string>();
      const place = (a: (typeof body.accounts)[number]) => {
        if (placed.has(a.code) || visiting.has(a.code)) return;
        visiting.add(a.code);
        if (a.parentCode && fileByCode.has(a.parentCode)) place(fileByCode.get(a.parentCode)!);
        visiting.delete(a.code);
        placed.add(a.code);
        ordered.push(a);
      };
      body.accounts.forEach(place);

      // code → {id, level} for existing accounts and ones created in this batch.
      const codeToId = new Map<string, { id: string; level: number }>();
      for (const [code, row] of accByCode) codeToId.set(code, { id: row.id, level: row.level || 1 });

      let created = 0;
      let skipped = 0;
      const ts = now();
      await db.transaction(async (tx) => {
        for (const a of ordered) {
          if (accByCode.has(a.code)) {
            skipped++;
            continue; // never overwrite an existing account
          }
          let parentId: string | null = null;
          let level = 1;
          if (a.parentCode) {
            const p = codeToId.get(a.parentCode);
            if (p) {
              parentId = p.id;
              level = p.level + 1;
            }
          }
          const accId = genId("ACC");
          await tx.insert(accounts).values({
            id: accId,
            code: a.code,
            name: a.name,
            classification: a.classification,
            level,
            parentId,
            currency: a.currency || "SAR",
            balance: 0,
            postable: a.postable,
            status: AccountStatus.ACTIVE,
            description: a.description ?? "",
            notes: "مستوردة من Excel",
            createdBy: ctx.user.id,
            createdAt: ts,
            updatedAt: ts,
          });
          codeToId.set(a.code, { id: accId, level });
          created++;
        }
      });

      await addAudit({
        action: "import",
        entityType: "account",
        entityId: "bulk",
        description: `استيراد دليل الحسابات: ${created} حساب جديد${skipped ? `، تم تجاهل ${skipped} موجود مسبقاً` : ""}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        ip: ctx.ip,
      });
      return Response.json({ ok: true, created, skipped });
    }

    // ---------------- Journal import ----------------
    if (body.type === "journal") {
      // Duplicate-file detection: an identical file already imported
      // successfully is rejected (checksum, not filename).
      if (body.fileHash) {
        const prior = (
          await db
            .select()
            .from(importBatches)
            .where(
              and(eq(importBatches.fileHash, body.fileHash), eq(importBatches.status, "success")),
            )
            .orderBy(desc(importBatches.importedAt))
            .limit(1)
        )[0];
        if (prior) {
          return Response.json(
            {
              ok: false,
              duplicate: true,
              created: 0,
              batch: {
                id: prior.id,
                fileName: prior.fileName,
                importedAt: prior.importedAt,
                importedBy: prior.importedBy,
                journalCount: prior.journalCount,
              },
            },
            { status: 409 },
          );
        }
      }

      const ccs = await db.select().from(costCenters);
      const ccByKey = new Map<string, string>();
      for (const c of ccs) {
        ccByKey.set(String(c.name).trim(), c.id);
        if (c.code) ccByKey.set(String(c.code).trim(), c.id);
      }

      // Pre-validate everything; import is all-or-nothing so the file can be
      // fixed and re-uploaded without half-created entries.
      const errors: string[] = [];
      const prepared = body.entries.map((entry, i) => {
        const rowLabel = entry.number || `#${i + 1}`;
        let debit = 0;
        let credit = 0;
        const lines = entry.lines.map((l) => {
          const acc = accByCode.get(String(l.accountCode).trim());
          if (!acc) errors.push(`قيد ${rowLabel}: رمز الحساب "${l.accountCode}" غير موجود`);
          else if (!acc.postable)
            errors.push(`قيد ${rowLabel}: الحساب "${acc.code}" غير قابل للترحيل عليه`);
          else if (acc.status !== "active")
            errors.push(`قيد ${rowLabel}: الحساب "${acc.code}" غير نشط`);
          debit += Number(l.debit || 0);
          credit += Number(l.credit || 0);
          if (l.debit && l.credit)
            errors.push(`قيد ${rowLabel}: السطر مدين ودائن معاً (${l.accountCode})`);
          return {
            accountId: acc?.id || "",
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            description: l.notes || "",
            costCenterId: l.costCenter ? ccByKey.get(String(l.costCenter).trim()) || null : null,
          };
        });
        if (Math.abs(debit - credit) > BALANCE_TOLERANCE)
          errors.push(
            `قيد ${rowLabel}: غير متوازن (مدين ${debit.toFixed(2)} ≠ دائن ${credit.toFixed(2)})`,
          );
        return {
          date: (entry.date || now()).slice(0, 10),
          description: entry.description,
          fund: validFund(entry.fund) ? entry.fund : Fund.UNRESTRICTED,
          lines,
        };
      });

      const rowCount = body.entries.reduce((s, e) => s + e.lines.length, 0);
      const ts = now();
      const batchId = genId("IMP");

      // All-or-nothing: any validation error → no journals, batch recorded FAILED.
      if (errors.length) {
        await db.insert(importBatches).values({
          id: batchId,
          kind: "journal",
          fileName: body.fileName ?? "",
          fileHash: body.fileHash ?? "",
          rowCount,
          journalCount: 0,
          status: "failed",
          errorSummary: errors.slice(0, 20).join(" | "),
          importedBy: ctx.user.id,
          importedAt: ts,
        });
        return Response.json(
          {
            ok: false,
            created: 0,
            errors: errors.slice(0, 50),
            errorCount: errors.length,
            batchId,
          },
          { status: 422 },
        );
      }

      await db.insert(importBatches).values({
        id: batchId,
        kind: "journal",
        fileName: body.fileName ?? "",
        fileHash: body.fileHash ?? "",
        rowCount,
        journalCount: 0,
        status: "processing",
        importedBy: ctx.user.id,
        importedAt: ts,
      });

      let created = 0;
      try {
        await db.transaction(async (tx) => {
          for (const e of prepared) {
            await postBalancedEntry(tx as any, {
              date: e.date,
              description: e.description,
              fund: e.fund,
              // Imported journals are traceable back to their batch.
              source: "journal_import",
              sourceType: "journal_import",
              sourceId: batchId,
              lines: e.lines,
              userId: ctx.user.id,
              status: JournalStatus.DRAFT,
            });
            created++;
          }
        });
      } catch (e) {
        await db
          .update(importBatches)
          .set({ status: "failed", journalCount: 0, errorSummary: (e as Error).message })
          .where(eq(importBatches.id, batchId));
        throw e;
      }

      await db
        .update(importBatches)
        .set({ status: "success", journalCount: created })
        .where(eq(importBatches.id, batchId));

      await addAudit({
        action: "import",
        entityType: "import_batch",
        entityId: batchId,
        description: `استيراد ${created} قيد محاسبي (مسودة) — دفعة ${batchId}`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        ip: ctx.ip,
      });
      return Response.json({ ok: true, created, batchId });
    }

    // ---------------- Budget import ----------------
    const errors: string[] = [];
    const prepared = body.budgets.map((bud, i) => {
      const rowLabel = `${bud.name} (${bud.year})` || `#${i + 1}`;
      const lines = bud.lines.map((l) => {
        let accountId: string | null = null;
        if (l.accountCode) {
          const acc = accByCode.get(String(l.accountCode).trim());
          if (!acc) errors.push(`موازنة ${rowLabel}: رمز الحساب "${l.accountCode}" غير موجود`);
          else accountId = acc.id;
        }
        return { accountId, plannedAmount: Number(l.plannedAmount || 0), notes: l.notes || "" };
      });
      return { name: bud.name, year: bud.year, department: bud.department || "", lines };
    });

    if (errors.length)
      return Response.json(
        { ok: false, created: 0, errors: errors.slice(0, 50), errorCount: errors.length },
        { status: 422 },
      );

    let created = 0;
    const ts = now();
    await db.transaction(async (tx) => {
      for (const bud of prepared) {
        const budgetId = genId("BUD");
        const total = bud.lines.reduce((s, l) => s + l.plannedAmount, 0);
        await tx.insert(budgets).values({
          id: budgetId,
          name: bud.name,
          year: bud.year,
          amount: total,
          department: bud.department,
          status: BudgetStatus.DRAFT,
          currency: "SAR",
          description: "",
          notes: "مستوردة من Excel",
          createdBy: ctx.user.id,
          createdAt: ts,
          updatedAt: ts,
        });
        let n = 0;
        for (const l of bud.lines) {
          await tx.insert(budgetLines).values({
            id: genId("BL"),
            budgetId,
            lineNumber: ++n,
            accountId: l.accountId,
            costCenterId: null,
            projectId: null,
            plannedAmount: l.plannedAmount,
            actualAmount: 0,
            notes: l.notes,
            createdAt: ts,
          });
        }
        created++;
      }
    });

    await addAudit({
      action: "import",
      entityType: "budget",
      entityId: "bulk",
      description: `استيراد ${created} موازنة (مسودة) من ملف Excel`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });
    return Response.json({ ok: true, created });
  });
}

export const Route = createFileRoute("/api/data/import")({
  server: { handlers: { POST: authHandler("finance.view", POST) } },
});
