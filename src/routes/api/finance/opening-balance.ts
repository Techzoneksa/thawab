import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, addAudit } from "@/server/db/index";
import { journalEntries, journalLines } from "@/server/db/schema";
import { and, inArray } from "drizzle-orm";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { postBalancedEntry } from "@/server/db/gl";
import { AppError } from "@/server/db/errors";
import { JournalStatus } from "@/lib/enums";
import { FINANCE_PERMISSIONS } from "@/lib/finance-permissions";

const OPENING_SOURCE = "opening_balance";

// GET /api/finance/opening-balance — list posted opening-balance journals.
async function GET(_event: { request: Request }, _ctx: Ctx) {
  const items = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.sourceType, OPENING_SOURCE))
    .orderBy(desc(journalEntries.date));
  return Response.json({ items });
}

const lineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.coerce.number().min(0).default(0),
  credit: z.coerce.number().min(0).default(0),
});
const createSchema = z.object({
  date: z.string().trim().min(1, "التاريخ مطلوب"),
  lines: z.array(lineSchema).min(2, "يجب إدخال سطرين على الأقل"),
  notes: z.string().optional(),
});

// POST /api/finance/opening-balance — post ONE balanced opening journal for the
// fiscal year of `date`. Enforces: balanced, ≥2 real lines, accounts valid, the
// date's period must be OPEN, and only one opening journal per year (idempotent).
async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const date = b.date.slice(0, 10);
    const year = date.slice(0, 4);
    const sourceId = `OB-${year}`;

    const lines = b.lines.filter((l) => Number(l.debit || 0) > 0 || Number(l.credit || 0) > 0);
    if (lines.length < 2)
      return err("الرصيد الافتتاحي يحتاج سطرين فعليين على الأقل", 422, "TOO_FEW_LINES");

    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of lines) {
      const d = Number(l.debit || 0);
      const c = Number(l.credit || 0);
      if (d > 0 && c > 0)
        return err("السطر لا يمكن أن يكون مديناً ودائناً معاً", 422, "BOTH_SIDES");
      totalDebit += d;
      totalCredit += c;
    }
    if (Math.abs(totalDebit - totalCredit) > 0.005)
      return err(
        `الأرصدة الافتتاحية غير متوازنة — مدين ${totalDebit.toFixed(2)} ≠ دائن ${totalCredit.toFixed(2)}`,
        422,
        "UNBALANCED",
      );

    // Governance (Phase 1B): opening balances are created as DRAFT and must
    // pass through the SAME certified journal workflow (submit → approve →
    // post). Creating never posts, so no one can create-and-post in one step.
    const entryId = await db.transaction(async (tx) => {
      // One active opening journal per fiscal year (draft/submitted/approved/
      // posted). The DB unique index additionally guarantees one POSTED opening
      // per year at post time.
      const active = await tx
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.sourceType, OPENING_SOURCE),
            eq(journalEntries.sourceId, sourceId),
            inArray(journalEntries.status, [
              JournalStatus.DRAFT,
              JournalStatus.SUBMITTED,
              JournalStatus.APPROVED,
              JournalStatus.POSTED,
            ]),
          ),
        )
        .limit(1);
      if (active.length > 0)
        throw new AppError(`يوجد رصيد افتتاحي قائم بالفعل للسنة ${year}`, 409, "OPENING_EXISTS");
      return postBalancedEntry(tx as any, {
        date,
        description: `الأرصدة الافتتاحية — ${year}`,
        source: OPENING_SOURCE,
        sourceType: OPENING_SOURCE,
        sourceId,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
        })),
        userId: ctx.user.id,
        status: JournalStatus.DRAFT,
      });
    });

    await addAudit({
      action: "JOURNAL_CREATED",
      entityType: "opening_balance",
      entityId: entryId,
      description: `إنشاء مسودة أرصدة افتتاحية للسنة ${year} بإجمالي ${totalDebit} ر.س (تتطلب اعتماداً وترحيلاً)`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const item = (
      await db.select().from(journalEntries).where(eq(journalEntries.id, entryId)).limit(1)
    )[0];
    const entryLines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalEntryId, entryId));
    return Response.json({ item, lines: entryLines }, { status: 201 });
  });
}

export const Route = createFileRoute("/api/finance/opening-balance")({
  server: {
    handlers: {
      GET: authHandler("finance.view", GET),
      // Create draft only — approval & posting go through the journal workflow.
      POST: authHandler(FINANCE_PERMISSIONS.openingCreate, POST),
    },
  },
});
