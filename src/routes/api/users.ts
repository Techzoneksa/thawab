import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { and, count, desc, eq, like, ne, or } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db, now, genId, addAudit } from "@/server/db/index";
import { users, roles, sessions } from "@/server/db/schema";
import { hashPassword } from "@/server/db/auth";
import { createSetupToken, INVITE_TTL_HOURS } from "@/server/db/invitations";
import { sendInvitationEmail, appUrl } from "@/server/db/mailer";
import { authHandler, parseBody, guard, err, type Ctx } from "@/server/db/api-utils";
import { UserStatus } from "@/lib/enums";

const PERM = "users";

function safe(u: any) {
  const { password, ...rest } = u;
  return rest;
}

async function GET({ request }: { request: Request }, _ctx: Ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const u = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    if (!u) return err("المستخدم غير موجود", 404, "NOT_FOUND");
    return Response.json({ item: safe(u), roles: await db.select().from(roles) });
  }

  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const role = url.searchParams.get("role") || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1") || 1);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50") || 50));

  const conditions = [];
  if (search)
    conditions.push(or(like(users.name, `%${search}%`), like(users.email, `%${search}%`)));
  if (status) conditions.push(eq(users.status, status));
  if (role) conditions.push(eq(users.role, role));
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ c: total }] = await db.select({ c: count() }).from(users).where(where);
  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return Response.json({
    items: rows.map(safe),
    total: Number(total),
    page,
    limit,
    roles: await db.select().from(roles),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب"),
  email: z.string().trim().email("بريد إلكتروني غير صحيح"),
  role: z.string().min(1, "الدور مطلوب"),
  phone: z.string().nullish(),
  // If omitted, a temporary password is generated and returned (invitation flow).
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل").optional(),
  mustChangePassword: z.boolean().optional(),
});

async function POST(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, createSchema);
    const email = b.email.toLowerCase();

    const exists = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (exists) return err("البريد الإلكتروني مستخدم بالفعل", 409, "EMAIL_TAKEN");

    const role = (await db.select().from(roles).where(eq(roles.id, b.role)).limit(1))[0];
    if (!role) return err("الدور غير موجود", 400, "BAD_ROLE");

    // Invite flow (no password): create with an unusable random password, then
    // email a one-time set-password link so the user chooses their own password.
    // Admin-provided password → set as-is (optionally forcing a first-login change).
    const isInvite = !b.password;
    const plain = b.password ?? randomBytes(24).toString("base64url"); // unknown → unusable until link is used
    const mustChange = b.password ? (b.mustChangePassword ?? false) : false;

    const id = genId("USR");
    await db.insert(users).values({
      id,
      name: b.name,
      email,
      password: hashPassword(plain),
      role: b.role,
      phone: b.phone || null,
      status: UserStatus.ACTIVE,
      mustChangePassword: mustChange,
      createdAt: now(),
    });

    await addAudit({
      action: "create",
      entityType: "user",
      entityId: id,
      description: `إنشاء مستخدم: ${b.name} (${email})`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    // Send the invitation link. If SMTP is not configured or the send fails, the
    // link is returned to the (trusted) admin as a fallback to share manually.
    let emailSent = false;
    let setupUrl: string | undefined;
    if (isInvite) {
      const { token } = await createSetupToken(id, "invite");
      setupUrl = `${appUrl()}/set-password?token=${token}`;
      const r = await sendInvitationEmail({
        to: email,
        name: b.name,
        setupUrl,
        expiresHours: INVITE_TTL_HOURS,
      });
      emailSent = r.sent;
    }

    const created = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    return Response.json(
      { item: safe(created), emailSent, setupUrl: emailSent ? undefined : setupUrl },
      { status: 201 },
    );
  });
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).optional(),
  role: z.string().min(1).optional(),
  phone: z.string().nullish(),
  status: z.nativeEnum(UserStatus).optional(),
  // Admin password reset.
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل").optional(),
  mustChangePassword: z.boolean().optional(),
});

async function PUT(event: { request: Request }, ctx: Ctx) {
  return guard(async () => {
    const b = await parseBody(event.request, updateSchema);
    const existing = (await db.select().from(users).where(eq(users.id, b.id)).limit(1))[0];
    if (!existing) return err("المستخدم غير موجود", 404, "NOT_FOUND");

    if (b.role) {
      const role = (await db.select().from(roles).where(eq(roles.id, b.role)).limit(1))[0];
      if (!role) return err("الدور غير موجود", 400, "BAD_ROLE");
    }
    // Prevent an admin from locking themselves out.
    if (b.id === ctx.user.id && b.status && b.status !== UserStatus.ACTIVE) {
      return err("لا يمكنك تعطيل حسابك الحالي", 400, "SELF_LOCK");
    }

    const set: Record<string, unknown> = {};
    if (b.name !== undefined) set.name = b.name;
    if (b.role !== undefined) set.role = b.role;
    if (b.phone !== undefined) set.phone = b.phone || null;
    if (b.status !== undefined) set.status = b.status;
    if (b.password) {
      set.password = hashPassword(b.password);
      set.mustChangePassword = b.mustChangePassword ?? false;
    } else if (b.mustChangePassword !== undefined) {
      set.mustChangePassword = b.mustChangePassword;
    }

    await db.update(users).set(set).where(eq(users.id, b.id));

    // If password changed, invalidate that user's other sessions.
    if (b.password) await db.delete(sessions).where(eq(sessions.userId, b.id));

    await addAudit({
      action: "update",
      entityType: "user",
      entityId: b.id,
      description: b.password ? `إعادة تعيين كلمة مرور المستخدم` : `تحديث بيانات المستخدم`,
      userId: ctx.user.id,
      userName: ctx.user.name,
      ip: ctx.ip,
    });

    const updated = (await db.select().from(users).where(eq(users.id, b.id)).limit(1))[0];
    return Response.json({ item: safe(updated) });
  });
}

// Soft-disable (never hard-delete users; they are referenced across the ledger/audit).
async function DELETE({ request }: { request: Request }, ctx: Ctx) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return err("معرف المستخدم مطلوب", 400, "BAD_REQUEST");
  if (id === ctx.user.id) return err("لا يمكنك تعطيل حسابك الحالي", 400, "SELF_LOCK");
  const existing = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!existing) return err("المستخدم غير موجود", 404, "NOT_FOUND");

  await db.update(users).set({ status: UserStatus.INACTIVE }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  await addAudit({
    action: "disable",
    entityType: "user",
    entityId: id,
    description: `تعطيل المستخدم: ${existing.name}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return Response.json({ success: true });
}

export const Route = createFileRoute("/api/users")({
  server: {
    handlers: {
      GET: authHandler(`${PERM}.view`, GET),
      POST: authHandler(`${PERM}.create`, POST),
      PUT: authHandler(`${PERM}.update`, PUT),
      DELETE: authHandler(`${PERM}.delete`, DELETE),
    },
  },
});
