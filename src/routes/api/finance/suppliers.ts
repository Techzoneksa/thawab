/**
 * Phase 3A — Suppliers & Accounts-Payable (Finance) API.
 *
 * Reads under finance.supplier.view. Master mutations are granular
 * (create/update/deactivate). Supplier payable + ledger are GL-derived (never
 * the legacy suppliers.balance). Full IBAN requires finance.supplier.sensitive.view;
 * default responses are masked. AP reconciliation + preflight require
 * finance.ap.reconciliation.view. Supplier master changes never touch the GL.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/server/db/index";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import {
  createSupplier,
  updateSupplier,
  setSupplierStatus,
  listSuppliers,
  getSupplierDetail,
  supplierLedger,
  apReconciliation,
  unallocatedApLines,
  apPreflight,
} from "@/server/db/supplier";

const baseSchema = z.object({
  name: z.string().trim().min(1, "اسم المورد مطلوب"),
  legalName: z.string().optional(),
  commercialRegistration: z.string().nullish(),
  vatNumber: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal("")),
  currency: z.string().trim().optional(),
  paymentTermsDays: z.coerce.number().int().nonnegative().nullish(),
  bankName: z.string().nullish(),
  iban: z.string().nullish(),
  activity: z.string().optional(),
  contactPerson: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
const updateSchema = baseSchema.partial().extend({ id: z.string().min(1) });
const actionSchema = z.object({
  action: z.enum(["deactivate", "reactivate"]),
  id: z.string().min(1),
});

async function GET({ request }: { request: Request }, ctx: Ctx) {
  const url = new URL(request.url);

  if (url.searchParams.get("reconciliation") === "1") {
    if (!(await hasPermission(ctx.user.role, P.apReconciliationView)))
      return err("لا تملك صلاحية عرض مطابقة الذمم الدائنة", 403, "FORBIDDEN");
    const [rec, unallocated] = await Promise.all([apReconciliation(db), unallocatedApLines(db)]);
    return Response.json({ ...rec, unallocatedLines: unallocated });
  }
  if (url.searchParams.get("preflight") === "1") {
    if (!(await hasPermission(ctx.user.role, P.apReconciliationView)))
      return err("لا تملك صلاحية عرض تشخيص الذمم الدائنة", 403, "FORBIDDEN");
    return Response.json(await apPreflight(db));
  }

  const id = url.searchParams.get("id");
  if (id) {
    const full =
      url.searchParams.get("full") === "1" &&
      (await hasPermission(ctx.user.role, P.supplierSensitiveView));
    const detail = await getSupplierDetail(id, { full });
    if (!detail) return err("المورد غير موجود", 404, "NOT_FOUND");
    if (url.searchParams.get("ledger") === "1") {
      if (!(await hasPermission(ctx.user.role, P.supplierLedgerView)))
        return err("لا تملك صلاحية عرض كشف حساب المورد", 403, "FORBIDDEN");
      const ledger = await supplierLedger(db, id, {
        dateFrom: url.searchParams.get("dateFrom") || undefined,
        dateTo: url.searchParams.get("dateTo") || undefined,
      });
      return Response.json({ item: detail.item, ...ledger });
    }
    return Response.json(detail);
  }

  return Response.json(
    await listSuppliers({
      search: url.searchParams.get("search") || undefined,
      status: url.searchParams.get("status") || undefined,
      all: url.searchParams.get("all") === "1",
    }),
  );
}

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await event.request.json().catch(() => ({}));
    if (body && typeof body === "object" && "action" in body) {
      const b = actionSchema.parse(body);
      if (!(await hasPermission(ctx.user.role, P.supplierDeactivate)))
        return err("لا تملك صلاحية تغيير حالة المورد", 403, "FORBIDDEN");
      const item = await setSupplierStatus(ctx, b.id, b.action === "reactivate");
      return Response.json({ item });
    }
    if (!(await hasPermission(ctx.user.role, P.supplierCreate)))
      return err("لا تملك صلاحية إنشاء مورد", 403, "FORBIDDEN");
    const b = baseSchema.parse(body);
    const item = await createSupplier(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const item = await updateSupplier(ctx, b.id, b);
    return Response.json({ item });
  });
}

export const Route = createFileRoute("/api/finance/suppliers")({
  server: {
    handlers: {
      GET: authHandler(P.supplierView, GET),
      POST: authHandler(P.supplierView, POST), // create/deactivate checked inside
      PUT: authHandler(P.supplierUpdate, PUT),
    },
  },
});
