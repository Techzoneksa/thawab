/**
 * Phase 3C — governed Purchase Order (أمر شراء) service, server-authoritative.
 *
 * A Purchase Order is a purchasing COMMITMENT / authorization document. It is NOT
 * an accounting journal and NOT a Supplier Invoice: at every state (DRAFT →
 * SUBMITTED → APPROVED → ISSUED, plus return/reject/cancel) it has
 *
 *     ZERO General Ledger effect
 *     ZERO supplier-payable effect (no AP credit, no supplier AP-subledger link,
 *          no legacy supplier-balance write)
 *     ZERO inventory quantity effect
 *
 * This module therefore NEVER imports the GL posting engine, the supplier AP
 * subledger, or inventory. Supplier Invoice (Phase 3B) remains the sole AP
 * recognition document; receiving accounting is deferred to Phase 3D.
 *
 * Reuse (never duplicated):
 *   - governance decisions  → evaluateTransition + PO_TRANSITIONS (shared engine)
 *   - workflow history       → recordWorkflowEvent (finance_workflow_events)
 *   - numbering              → nextCode (advisory-locked, concurrency-safe)
 */
import { and, desc, eq } from "drizzle-orm";
import { db, now, genId, addAudit } from "./index";
import { purchaseOrders, purchaseOrderLines, suppliers, financeWorkflowEvents } from "./schema";
import { hasPermission } from "./auth";
import { AppError } from "./errors";
import { nextCode } from "./numbering";
import { recordWorkflowEvent } from "./finance-workflow";
import {
  findTransition,
  evaluateTransition,
  decisionHttpStatus,
  type JournalAction,
} from "@/lib/finance-permissions";
import { PO_TRANSITIONS } from "@/lib/procurement-permissions";
import {
  PurchaseOrderGovernedStatus as S,
  PurchaseOrderGovernance,
  PurchaseOrderLineType,
  SupplierStatus,
} from "@/lib/enums";
import type { Ctx } from "./api-utils";

const AMOUNT_TOLERANCE = 0.005;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const GOVERNED = PurchaseOrderGovernance.GOVERNED;
const LINE_TYPES = new Set<string>(Object.values(PurchaseOrderLineType));

type Db = { select: (...a: any[]) => any };

export interface PurchaseOrderLineInput {
  description?: string;
  itemId?: string | null;
  accountId?: string | null;
  lineType?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxRate?: number;
  costCenterId?: string | null;
  notes?: string;
}
export interface PurchaseOrderInput {
  supplierId: string;
  subject: string; // PO title / description
  orderDate?: string;
  expectedDeliveryDate?: string | null;
  currency?: string;
  supplierReference?: string | null;
  notes?: string;
  lines: PurchaseOrderLineInput[];
}

interface ComputedLine {
  description: string;
  itemId: string | null;
  accountId: string | null;
  lineType: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  lineSubtotal: number;
  taxAmount: number;
  lineTotal: number;
  costCenterId: string | null;
  notes: string;
}
interface Computed {
  lines: ComputedLine[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

/**
 * Server-authoritative recompute — the client total is NEVER trusted. Tax on a
 * Purchase Order is informational/commitment value only (no Input VAT is posted).
 */
function computeTotals(lines: PurchaseOrderLineInput[]): Computed {
  const computed: ComputedLine[] = (lines || []).map((l) => {
    const quantity = Number(l.quantity || 0);
    const unitPrice = Number(l.unitPrice || 0);
    const taxRate = Number(l.taxRate || 0);
    const lineSubtotal = r2(quantity * unitPrice);
    const taxAmount = r2((lineSubtotal * taxRate) / 100);
    const lineTotal = r2(lineSubtotal + taxAmount);
    const lineType =
      l.lineType && LINE_TYPES.has(l.lineType) ? l.lineType : PurchaseOrderLineType.ITEM;
    return {
      description: l.description ?? "",
      itemId: l.itemId ?? null,
      accountId: l.accountId ?? null,
      lineType,
      quantity,
      unit: l.unit ?? "",
      unitPrice,
      taxRate,
      lineSubtotal,
      taxAmount,
      lineTotal,
      costCenterId: l.costCenterId ?? null,
      notes: l.notes ?? "",
    };
  });
  const subtotal = r2(computed.reduce((s, l) => s + l.lineSubtotal, 0));
  const taxAmount = r2(computed.reduce((s, l) => s + l.taxAmount, 0));
  const totalAmount = r2(subtotal + taxAmount);
  return { lines: computed, subtotal, taxAmount, totalAmount };
}

/**
 * Full server-side validation shared by create, update, submit and issue. Never
 * trusts client numbers. Enforces: supplier exists+active · ≥1 line · quantity>0 ·
 * unit price ≥ 0 · tax 0..100 · expected delivery ≥ order date. Returns the
 * recomputed totals. NO accounting account is required for item lines.
 */
export async function validatePurchaseOrder(dbh: Db, input: PurchaseOrderInput): Promise<Computed> {
  const sup = (
    await dbh.select().from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1)
  )[0] as any;
  if (!sup) throw new AppError("المورد غير موجود", 404, "SUPPLIER_NOT_FOUND");
  if (sup.status !== SupplierStatus.ACTIVE)
    throw new AppError("المورد غير نشط — لا يمكن إنشاء أمر شراء له", 400, "SUPPLIER_INACTIVE");

  if (!input.subject || !input.subject.trim())
    throw new AppError("موضوع أمر الشراء مطلوب", 400, "SUBJECT_REQUIRED");

  if (input.expectedDeliveryDate && input.orderDate && input.expectedDeliveryDate < input.orderDate)
    throw new AppError(
      "تاريخ التسليم المتوقع لا يمكن أن يسبق تاريخ الأمر",
      400,
      "DELIVERY_BEFORE_ORDER",
    );

  if (!input.lines || input.lines.length < 1)
    throw new AppError("يجب إضافة سطر واحد على الأقل", 400, "NO_LINES");

  for (const l of input.lines) {
    const quantity = Number(l.quantity || 0);
    const unitPrice = Number(l.unitPrice || 0);
    const taxRate = Number(l.taxRate || 0);
    if (!(quantity > 0)) throw new AppError("الكمية يجب أن تكون أكبر من صفر", 400, "QTY_INVALID");
    if (unitPrice < 0)
      throw new AppError("سعر الوحدة لا يمكن أن يكون سالباً", 400, "PRICE_INVALID");
    if (taxRate < 0 || taxRate > 100)
      throw new AppError("نسبة الضريبة غير صالحة", 400, "TAX_RATE_INVALID");
    if (l.lineType && !LINE_TYPES.has(l.lineType))
      throw new AppError("نوع السطر غير صالح", 400, "LINE_TYPE_INVALID");
  }

  return computeTotals(input.lines);
}

async function loadOrder(id: string) {
  const v = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).limit(1))[0];
  return (v as any) ?? null;
}
async function loadLines(dbh: Db, id: string) {
  return dbh
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.orderId, id))
    .orderBy(purchaseOrderLines.lineNumber);
}
/** Guard: a governed PO must never be touched by the legacy flow, and vice-versa. */
function assertGoverned(order: any) {
  if (!order || order.governanceMode !== GOVERNED)
    throw new AppError("أمر شراء غير محكوم (نظام قديم)", 409, "NOT_GOVERNED");
}
function linesToInput(o: any, lines: any[]): PurchaseOrderInput {
  return {
    supplierId: o.supplierId,
    subject: o.subject,
    orderDate: o.date,
    expectedDeliveryDate: o.deliveryDate,
    currency: o.currency,
    lines: lines.map((l) => ({
      description: l.description,
      itemId: l.itemId,
      accountId: l.accountId,
      lineType: l.lineType,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPrice: Number(l.unitPrice),
      taxRate: Number(l.taxRate),
      costCenterId: l.costCenterId,
      notes: l.notes,
    })),
  };
}

async function insertLines(tx: any, orderId: string, computed: Computed, ts: string) {
  let n = 0;
  for (const l of computed.lines) {
    await tx.insert(purchaseOrderLines).values({
      id: genId("POL"),
      orderId,
      lineNumber: ++n,
      itemId: l.itemId,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      receivedQuantity: 0,
      unit: l.unit,
      notes: l.notes,
      lineType: l.lineType,
      accountId: l.accountId,
      costCenterId: l.costCenterId,
      lineSubtotal: l.lineSubtotal,
      taxRate: l.taxRate,
      taxAmount: l.taxAmount,
      lineTotal: l.lineTotal,
      createdAt: ts,
    });
  }
}

// ------------------------------- Create --------------------------------

export async function createPurchaseOrder(ctx: Ctx, input: PurchaseOrderInput) {
  const computed = await validatePurchaseOrder(db, input);
  const id = genId("PO");
  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();

  await db.transaction(async (tx) => {
    const poNumber = await nextCode(tx as any, {
      table: "purchase_orders",
      column: "po_number",
      prefix: "PO-",
      year: true,
    });
    await tx.insert(purchaseOrders).values({
      id,
      governanceMode: GOVERNED,
      poNumber,
      supplierId: input.supplierId,
      subject: input.subject.trim(),
      date: input.orderDate || ts.slice(0, 10),
      deliveryDate: input.expectedDeliveryDate ?? "",
      status: S.DRAFT,
      currency: cur,
      supplierReference: input.supplierReference ?? null,
      subtotal: computed.subtotal,
      taxAmount: computed.taxAmount,
      totalAmount: computed.totalAmount,
      // Legacy columns kept inert for governed POs.
      total: computed.totalAmount,
      receivedAmount: 0,
      notes: input.notes ?? "",
      createdBy: ctx.user.id,
      createdAt: ts,
      updatedAt: ts,
    });
    await insertLines(tx as any, id, computed, ts);
    await recordWorkflowEvent(tx as any, {
      entityType: "purchase_order",
      entityId: id,
      action: "create",
      fromStatus: null,
      toStatus: S.DRAFT,
      userId: ctx.user.id,
      userName: ctx.user.name,
    });
  });

  const created = await loadOrder(id);
  await addAudit({
    action: "PURCHASE_ORDER_CREATED",
    entityType: "purchase_order",
    entityId: id,
    description: `إنشاء أمر شراء ${created?.poNumber} — ${input.subject} بقيمة ${computed.totalAmount}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });
  return created;
}

// ------------------------------- Update (draft only) --------------------

export async function updatePurchaseOrder(ctx: Ctx, id: string, input: PurchaseOrderInput) {
  const o = await loadOrder(id);
  if (!o) throw new AppError("أمر الشراء غير موجود", 404, "NOT_FOUND");
  assertGoverned(o);
  if (o.status !== S.DRAFT)
    throw new AppError("لا يمكن تعديل أمر الشراء إلا في حالة المسودة", 409, "NOT_DRAFT");

  const computed = await validatePurchaseOrder(db, input);
  const ts = now();
  const cur = (input.currency || "SAR").toUpperCase();

  await db.transaction(async (tx) => {
    await tx
      .update(purchaseOrders)
      .set({
        supplierId: input.supplierId,
        subject: input.subject.trim(),
        date: input.orderDate || o.date,
        deliveryDate: input.expectedDeliveryDate ?? "",
        currency: cur,
        supplierReference: input.supplierReference ?? null,
        subtotal: computed.subtotal,
        taxAmount: computed.taxAmount,
        totalAmount: computed.totalAmount,
        total: computed.totalAmount,
        notes: input.notes ?? "",
        updatedAt: ts,
      })
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.status, S.DRAFT)));
    await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.orderId, id));
    await insertLines(tx as any, id, computed, ts);
  });

  await addAudit({
    action: "PURCHASE_ORDER_UPDATED",
    entityType: "purchase_order",
    entityId: id,
    description: `تعديل مسودة أمر الشراء ${o.poNumber}`,
    userId: ctx.user.id,
    userName: ctx.user.name,
    before: JSON.stringify({ totalAmount: o.totalAmount }),
    ip: ctx.ip,
  });
  return loadOrder(id);
}

// ------------------------------- Workflow transitions -------------------

const AUDIT_ACTION: Record<JournalAction, string> = {
  submit: "PURCHASE_ORDER_SUBMITTED",
  approve: "PURCHASE_ORDER_APPROVED",
  return: "PURCHASE_ORDER_RETURNED",
  reject: "PURCHASE_ORDER_REJECTED",
  issue: "PURCHASE_ORDER_ISSUED",
  cancel: "PURCHASE_ORDER_CANCELLED",
  post: "PURCHASE_ORDER_POST", // unused (a PO never posts)
  reverse: "PURCHASE_ORDER_REVERSE", // unused
};

/**
 * Single choke point for every governed PO state change (except create and draft
 * edit). Governance via the shared engine + PO_TRANSITIONS. EVERY branch is a
 * pure, guarded status change — there is no posting, no AP, no inventory. Submit
 * and issue re-validate the supplier is still active and the totals are intact.
 */
export async function transitionPurchaseOrder(
  ctx: Ctx,
  id: string,
  action: JournalAction,
  reason?: string,
) {
  const o = await loadOrder(id);
  if (!o) throw new AppError("أمر الشراء غير موجود", 404, "NOT_FOUND");
  assertGoverned(o);

  const t = findTransition(o.status, action, PO_TRANSITIONS);
  const perm = t?.permission ?? null;
  const granted = perm ? await hasPermission(ctx.user.role, perm) : false;
  const decision = evaluateTransition({
    fromStatus: o.status,
    action,
    hasPerm: (p) => (perm ? p === perm && granted : false),
    createdBy: o.createdBy,
    currentUserId: ctx.user.id,
    reason,
    transitions: PO_TRANSITIONS,
  });
  if (!decision.ok || !t)
    throw new AppError(
      decision.message ?? "إجراء غير مسموح",
      decisionHttpStatus(decision.code),
      decision.code ?? "FORBIDDEN",
    );

  const cleanReason = (reason ?? "").trim();
  const ts = now();

  await db.transaction(async (tx) => {
    // Row lock + status guard (idempotent — concurrent actions can't double-apply).
    const locked = (
      await tx.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).for("update").limit(1)
    )[0] as any;
    if (!locked || locked.status !== t.from)
      throw new AppError("تعذّر تنفيذ الإجراء — تغيّرت حالة الأمر", 409, "STATE_CONFLICT");

    if (action === "submit" || action === "issue") {
      const lines = await loadLines(tx as any, id);
      // Re-validate supplier active + totals intact at submit and issue.
      await validatePurchaseOrder(tx as any, linesToInput(locked, lines));
    }

    const cols: Record<string, unknown> = { status: t.to, updatedAt: ts };
    if (action === "submit") {
      cols.submittedBy = ctx.user.id;
      cols.submittedAt = ts;
    } else if (action === "approve") {
      cols.approvedBy = ctx.user.id;
      cols.approvedAt = ts;
    } else if (action === "issue") {
      cols.issuedBy = ctx.user.id;
      cols.issuedAt = ts;
    } else if (action === "cancel") {
      cols.cancelledBy = ctx.user.id;
      cols.cancelledAt = ts;
    }
    const changed = await tx
      .update(purchaseOrders)
      .set(cols)
      .where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.status, t.from)))
      .returning({ id: purchaseOrders.id });
    if (changed.length === 0)
      throw new AppError("تعذّر تنفيذ الإجراء — تغيّرت حالة الأمر", 409, "STATE_CONFLICT");

    await recordWorkflowEvent(tx as any, {
      entityType: "purchase_order",
      entityId: id,
      action,
      fromStatus: o.status,
      toStatus: t.to,
      userId: ctx.user.id,
      userName: ctx.user.name,
      reason: cleanReason,
    });
  });

  await addAudit({
    action: AUDIT_ACTION[action],
    entityType: "purchase_order",
    entityId: id,
    description:
      `${AUDIT_ACTION[action]} — ${o.poNumber} (${o.status} → ${t.to})` +
      (cleanReason ? ` — ${cleanReason}` : ""),
    userId: ctx.user.id,
    userName: ctx.user.name,
    ip: ctx.ip,
  });

  return { item: await loadOrder(id) };
}

// ------------------------------- Reads ---------------------------------

export async function purchaseOrderWorkflowHistory(id: string) {
  return db
    .select()
    .from(financeWorkflowEvents)
    .where(
      and(
        eq(financeWorkflowEvents.entityType, "purchase_order"),
        eq(financeWorkflowEvents.entityId, id),
      ),
    )
    .orderBy(financeWorkflowEvents.createdAt);
}

export async function getPurchaseOrderDetail(id: string) {
  const item = await loadOrder(id);
  if (!item || item.governanceMode !== GOVERNED) return null;
  const lines = await loadLines(db, id);
  const history = await purchaseOrderWorkflowHistory(id);
  const supplier = item.supplierId
    ? (await db.select().from(suppliers).where(eq(suppliers.id, item.supplierId)).limit(1))[0]
    : null;
  return { item, lines, history, supplier };
}

export interface PurchaseOrderFilters {
  status?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listPurchaseOrders(filters: PurchaseOrderFilters = {}) {
  const rows = (await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.governanceMode, GOVERNED))
    .orderBy(desc(purchaseOrders.createdAt))) as any[];
  const q = (filters.search || "").trim().toLowerCase();
  const items = rows.filter((r) => {
    if (filters.status && r.status !== filters.status) return false;
    if (filters.supplierId && r.supplierId !== filters.supplierId) return false;
    if (filters.dateFrom && r.date < filters.dateFrom) return false;
    if (filters.dateTo && r.date > filters.dateTo) return false;
    if (q) {
      const hay = `${r.poNumber} ${r.subject} ${r.supplierReference || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const summary = {
    total: items.length,
    draft: items.filter((r) => r.status === S.DRAFT).length,
    submitted: items.filter((r) => r.status === S.SUBMITTED).length,
    approved: items.filter((r) => r.status === S.APPROVED).length,
    issued: items.filter((r) => r.status === S.ISSUED).length,
    rejected: items.filter((r) => r.status === S.REJECTED).length,
    cancelled: items.filter((r) => r.status === S.CANCELLED).length,
    committedValue: items
      .filter((r) => r.status === S.APPROVED || r.status === S.ISSUED)
      .reduce((s, r) => s + Number(r.totalAmount || 0), 0),
  };
  return { items, summary };
}
