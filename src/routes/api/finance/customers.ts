/**
 * Phase Sales-1 — Customers & Accounts-Receivable (Finance) API.
 *
 * Reads under finance.customer.view. Master mutations are granular
 * (create/update/deactivate). Customer receivable + ledger are GL-derived (never
 * a stored balance). AR reconciliation requires finance.ar.reconciliation.view.
 * Customer master changes never touch the GL.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db } from "@/server/db/index";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { hasPermission } from "@/server/db/auth";
import { FINANCE_PERMISSIONS as P } from "@/lib/finance-permissions";
import {
  createCustomer,
  updateCustomer,
  setCustomerStatus,
  listCustomers,
  customerLookup,
  getCustomerDetail,
  customerLedger,
  arReconciliation,
  unallocatedArLines,
} from "@/server/db/customer";

const baseSchema = z.object({
  name: z.string().trim().min(1, "اسم العميل مطلوب"),
  legalName: z.string().optional(),
  commercialRegistration: z.string().nullish(),
  vatNumber: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal("")),
  currency: z.string().trim().optional(),
  paymentTermsDays: z.coerce.number().int().nonnegative().nullish(),
  contactPerson: z.string().optional(),
  address: z.string().optional(),
  buildingNo: z.string().optional(),
  street: z.string().optional(),
  district: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  additionalNo: z.string().optional(),
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
    if (!(await hasPermission(ctx.user.role, P.arReconciliationView)))
      return err("لا تملك صلاحية عرض مطابقة الذمم المدينة", 403, "FORBIDDEN");
    const [rec, unallocated] = await Promise.all([arReconciliation(db), unallocatedArLines(db)]);
    return Response.json({ ...rec, unallocatedLines: unallocated });
  }

  if (url.searchParams.get("lookup") === "1") {
    return Response.json(
      await customerLookup({
        search: url.searchParams.get("q") || undefined,
        limit: Number(url.searchParams.get("limit")) || undefined,
      }),
    );
  }

  const id = url.searchParams.get("id");
  if (id) {
    const detail = await getCustomerDetail(id);
    if (!detail) return err("العميل غير موجود", 404, "NOT_FOUND");
    if (url.searchParams.get("ledger") === "1") {
      if (!(await hasPermission(ctx.user.role, P.customerLedgerView)))
        return err("لا تملك صلاحية عرض كشف حساب العميل", 403, "FORBIDDEN");
      const ledger = await customerLedger(db, id, {
        dateFrom: url.searchParams.get("dateFrom") || undefined,
        dateTo: url.searchParams.get("dateTo") || undefined,
      });
      return Response.json({ item: detail.item, ...ledger });
    }
    return Response.json(detail);
  }

  return Response.json(
    await listCustomers({
      search: url.searchParams.get("search") || undefined,
      status: url.searchParams.get("status") || undefined,
      all: url.searchParams.get("all") === "1",
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
    }),
  );
}

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const body = await event.request.json().catch(() => ({}));
    if (body && typeof body === "object" && "action" in body) {
      const b = actionSchema.parse(body);
      if (!(await hasPermission(ctx.user.role, P.customerDeactivate)))
        return err("لا تملك صلاحية تغيير حالة العميل", 403, "FORBIDDEN");
      const item = await setCustomerStatus(ctx, b.id, b.action === "reactivate");
      return Response.json({ item });
    }
    if (!(await hasPermission(ctx.user.role, P.customerCreate)))
      return err("لا تملك صلاحية إنشاء عميل", 403, "FORBIDDEN");
    const b = baseSchema.parse(body);
    const item = await createCustomer(ctx, b);
    return Response.json({ item }, { status: 201 });
  });
}

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const item = await updateCustomer(ctx, b.id, b);
    return Response.json({ item });
  });
}

export const Route = createFileRoute("/api/finance/customers")({
  server: {
    handlers: {
      GET: authHandler(P.customerView, GET),
      POST: authHandler(P.customerView, POST), // create/deactivate checked inside
      PUT: authHandler(P.customerUpdate, PUT),
    },
  },
});
