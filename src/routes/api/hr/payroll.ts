import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { count, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { payrollRuns, payrollLines, employees } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { PayrollStatus, PayrollPayMethod, EmployeeStatus, JournalSource } from "@/lib/enums";
import {
  postBalancedEntry,
  resolveSystemAccountId,
  cashOrBankAccountId,
  SYS,
} from "@/server/db/gl";

// GET /api/hr/payroll?id=xxx — run + lines; else list of runs.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const run = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1))[0];
    if (!run) return err("مسير الرواتب غير موجود", 404, "NOT_FOUND");
    const lines = await db.select().from(payrollLines).where(eq(payrollLines.runId, id));
    return Response.json({ item: run, lines });
  }

  const [{ c: total }] = await db.select({ c: count() }).from(payrollRuns);
  const items = await db.select().from(payrollRuns).orderBy(desc(payrollRuns.createdAt));
  return Response.json({ items, total: Number(total) });
}

const createSchema = z.object({
  period: z.string().trim().min(1, "الفترة مطلوبة"),
  payMethod: z.nativeEnum(PayrollPayMethod).optional(),
  notes: z.string().optional(),
});

const linePatch = z.object({
  id: z.string(),
  allowances: z.coerce.number().min(0).optional(),
  deductions: z.coerce.number().min(0).optional(),
});

const postSchema = z.object({
  action: z.enum(["approve"]).optional(),
  id: z.string().optional(),
  period: z.string().optional(),
  payMethod: z.nativeEnum(PayrollPayMethod).optional(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, postSchema);

    // ---- Approve: post the payroll journal entry ----
    if (b.action === "approve") {
      if (!b.id) return err("معرف المسير مطلوب", 400, "BAD_REQUEST");
      const run = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, b.id)).limit(1))[0];
      if (!run) return err("مسير الرواتب غير موجود", 404, "NOT_FOUND");
      if (run.status === PayrollStatus.APPROVED)
        return err("المسير معتمد بالفعل", 400, "ALREADY_APPROVED");

      const lines = await db.select().from(payrollLines).where(eq(payrollLines.runId, b.id));
      const total = lines.reduce((s, l) => s + (l.net || 0), 0);
      if (total <= 0) return err("لا يمكن اعتماد مسير بقيمة صفر", 400, "EMPTY_PAYROLL");

      const ts = now();
      let journalEntryId = "";
      await db.transaction(async (tx) => {
        const salaries = await resolveSystemAccountId(tx as any, SYS.SALARIES_EXPENSE);
        // Paid now → cash/bank; otherwise accrue to salaries payable.
        const credit =
          run.payMethod === PayrollPayMethod.ACCRUE
            ? await resolveSystemAccountId(tx as any, SYS.SALARIES_PAYABLE)
            : await cashOrBankAccountId(tx as any, run.payMethod);
        journalEntryId = await postBalancedEntry(tx as any, {
          date: ts.slice(0, 10),
          description: `مسير رواتب — ${run.period}`,
          source: JournalSource.PAYROLL,
          sourceType: "payroll",
          sourceId: run.id,
          lines: [
            { accountId: salaries, debit: total },
            { accountId: credit, credit: total },
          ],
          userId: ctx.user.id,
        });
        await tx
          .update(payrollRuns)
          .set({
            status: PayrollStatus.APPROVED,
            totalAmount: total,
            journalEntryId,
            approvedBy: ctx.user.id,
            approvedAt: ts,
            updatedAt: ts,
          })
          .where(eq(payrollRuns.id, run.id));
      });

      await addAudit({
        action: "approve",
        entityType: "payroll_run",
        entityId: b.id,
        description: `اعتماد مسير رواتب: ${run.period} بإجمالي ${total} ر.س`,
        userId: ctx.user.id,
        userName: ctx.user.name,
        ip: ctx.ip,
      });

      const updated = (
        await db.select().from(payrollRuns).where(eq(payrollRuns.id, b.id)).limit(1)
      )[0];
      return Response.json({ item: updated });
    }

    // ---- Create: snapshot active employees into a draft run ----
    const parsed = createSchema.safeParse(b);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return err(msg || "بيانات غير صالحة", 422, "VALIDATION_ERROR");
    }
    const c = parsed.data;

    const active = await db
      .select()
      .from(employees)
      .where(eq(employees.status, EmployeeStatus.ACTIVE));
    if (active.length === 0) return err("لا يوجد موظفون نشطون لإنشاء المسير", 400, "NO_EMPLOYEES");

    const runId = genId("PR");
    const ts = now();
    const total = active.reduce((s, e) => s + (e.salary || 0), 0);

    await db.transaction(async (tx) => {
      await tx.insert(payrollRuns).values({
        id: runId,
        period: c.period,
        status: PayrollStatus.DRAFT,
        payMethod: c.payMethod ?? PayrollPayMethod.BANK,
        totalAmount: total,
        notes: c.notes ?? "",
        createdBy: ctx.user.id,
        createdAt: ts,
        updatedAt: ts,
      });
      for (const e of active) {
        await tx.insert(payrollLines).values({
          id: genId("PRL"),
          runId,
          employeeId: e.id,
          employeeName: e.name,
          department: e.department ?? "",
          salary: e.salary || 0,
          allowances: 0,
          deductions: 0,
          net: e.salary || 0,
          notes: "",
        });
      }
    });

    await addAudit({
      action: "create",
      entityType: "payroll_run",
      entityId: runId,
      description: `إنشاء مسير رواتب: ${c.period} (${active.length} موظف)`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (
      await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).limit(1)
    )[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const putSchema = z.object({
  id: z.string().min(1, "معرف المسير مطلوب"),
  payMethod: z.nativeEnum(PayrollPayMethod).optional(),
  notes: z.string().optional(),
  lines: z.array(linePatch).optional(),
});

// PUT /api/hr/payroll — adjust a draft run (pay method, notes, line allowances/deductions).
async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, putSchema);
    const run = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, b.id)).limit(1))[0];
    if (!run) return err("مسير الرواتب غير موجود", 404, "NOT_FOUND");
    if (run.status === PayrollStatus.APPROVED)
      return err("لا يمكن تعديل مسير معتمد", 400, "APPROVED");

    const ts = now();
    await db.transaction(async (tx) => {
      if (b.lines && b.lines.length) {
        const current = await tx.select().from(payrollLines).where(eq(payrollLines.runId, b.id));
        const map = new Map(current.map((l) => [l.id, l]));
        for (const patch of b.lines) {
          const line = map.get(patch.id);
          if (!line) continue;
          const allowances = patch.allowances ?? line.allowances;
          const deductions = patch.deductions ?? line.deductions;
          const net = (line.salary || 0) + allowances - deductions;
          await tx
            .update(payrollLines)
            .set({ allowances, deductions, net })
            .where(eq(payrollLines.id, patch.id));
        }
      }
      const lines = await tx.select().from(payrollLines).where(eq(payrollLines.runId, b.id));
      const total = lines.reduce((s, l) => s + (l.net || 0), 0);
      await tx
        .update(payrollRuns)
        .set({
          payMethod: b.payMethod ?? run.payMethod,
          notes: b.notes ?? run.notes,
          totalAmount: total,
          updatedAt: ts,
        })
        .where(eq(payrollRuns.id, b.id));
    });

    const updated = (
      await db.select().from(payrollRuns).where(eq(payrollRuns.id, b.id)).limit(1)
    )[0];
    return Response.json({ item: updated });
  });
}

// DELETE /api/hr/payroll?id=xxx — remove a draft run and its lines.
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف المسير مطلوب", 400, "BAD_REQUEST");
  const run = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1))[0];
  if (!run) return err("مسير الرواتب غير موجود", 404, "NOT_FOUND");
  if (run.status === PayrollStatus.APPROVED) return err("لا يمكن حذف مسير معتمد", 400, "APPROVED");

  await db.transaction(async (tx) => {
    await tx.delete(payrollLines).where(eq(payrollLines.runId, id));
    await tx.delete(payrollRuns).where(eq(payrollRuns.id, id));
  });
  await addAudit({
    action: "delete",
    entityType: "payroll_run",
    entityId: id,
    description: `حذف مسير رواتب: ${run.period}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/hr/payroll")({
  server: {
    handlers: {
      GET: authHandler("hr.view", GET),
      POST: authHandler("hr.create", POST),
      PUT: authHandler("hr.update", PUT),
      DELETE: authHandler("hr.delete", DELETE),
    },
  },
});
