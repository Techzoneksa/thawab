import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, desc, eq, like, or } from "drizzle-orm";
import { db, now, genId, addAudit } from "@/server/db/index";
import { employees } from "@/server/db/schema";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { EmployeeStatus } from "@/lib/enums";

// GET /api/hr?id=xxx — single employee; else list with optional search/status/dept.
async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const item = (await db.select().from(employees).where(eq(employees.id, id)).limit(1))[0];
    if (!item) return err("الموظف غير موجود", 404, "NOT_FOUND");
    return Response.json({ item });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const department = url.searchParams.get("department") || "";
  const conditions = [];
  if (search)
    conditions.push(or(like(employees.name, `%${search}%`), like(employees.title, `%${search}%`)));
  if (status) conditions.push(eq(employees.status, status));
  if (department) conditions.push(eq(employees.department, department));
  const where = conditions.length ? and(...conditions) : undefined;

  const items = await db.select().from(employees).where(where).orderBy(desc(employees.createdAt));
  return Response.json({ items, total: items.length });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "اسم الموظف مطلوب"),
  department: z.string().optional(),
  title: z.string().optional(),
  salary: z.coerce.number().min(0, "الراتب لا يمكن أن يكون سالباً").optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  joinedAt: z.string().optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  notes: z.string().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const id = genId("EMP");
    const ts = now();

    await db.insert(employees).values({
      id,
      name: b.name,
      department: b.department ?? "",
      title: b.title ?? "",
      salary: b.salary ?? 0,
      phone: b.phone ?? "",
      email: b.email ?? "",
      joinedAt: b.joinedAt ?? ts.slice(0, 10),
      status: b.status ?? EmployeeStatus.ACTIVE,
      notes: b.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
    });

    await addAudit({
      action: "create",
      entityType: "employee",
      entityId: id,
      description: `إضافة موظف: ${b.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const created = (await db.select().from(employees).where(eq(employees.id, id)).limit(1))[0];
    return Response.json({ item: created }, { status: 201 });
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  salary: z.coerce.number().min(0).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  joinedAt: z.string().optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  notes: z.string().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(employees).where(eq(employees.id, b.id)).limit(1))[0];
    if (!existing) return err("الموظف غير موجود", 404, "NOT_FOUND");

    const before = JSON.stringify(existing);
    await db
      .update(employees)
      .set({
        name: b.name ?? existing.name,
        department: b.department ?? existing.department,
        title: b.title ?? existing.title,
        salary: b.salary ?? existing.salary,
        phone: b.phone ?? existing.phone,
        email: b.email ?? existing.email,
        joinedAt: b.joinedAt ?? existing.joinedAt,
        status: b.status ?? existing.status,
        notes: b.notes ?? existing.notes,
      })
      .where(eq(employees.id, b.id));

    await addAudit({
      action: "update",
      entityType: "employee",
      entityId: b.id,
      description: `تحديث بيانات الموظف: ${existing.name}`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      before,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(employees).where(eq(employees.id, b.id)).limit(1))[0];
    return Response.json({ item: updated });
  });
}

async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف الموظف مطلوب", 400, "BAD_REQUEST");
  const existing = (await db.select().from(employees).where(eq(employees.id, id)).limit(1))[0];
  if (!existing) return err("الموظف غير موجود", 404, "NOT_FOUND");

  const before = JSON.stringify(existing);
  await db.delete(employees).where(eq(employees.id, id));
  await addAudit({
    action: "delete",
    entityType: "employee",
    entityId: id,
    description: `حذف الموظف: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/hr")({
  server: {
    handlers: {
      GET: authHandler("hr.view", GET),
      POST: authHandler("hr.create", POST),
      PUT: authHandler("hr.update", PUT),
      DELETE: authHandler("hr.delete", DELETE),
    },
  },
});
