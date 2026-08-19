/** Phase 3D — governed Goods Receipt (GRN) client API. GRN credits GRNI, never AP. */

export interface GoodsReceipt {
  id: string;
  grnNumber: string;
  purchaseOrderId: string;
  supplierId: string | null;
  receiptDate: string;
  status: string;
  currency: string;
  totalValue: number;
  journalEntryId: string | null;
  reversalJournalEntryId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  reversedBy?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
}

export interface GoodsReceiptLine {
  id: string;
  goodsReceiptId: string;
  poLineId: string;
  lineNumber: number;
  lineType: string;
  description: string;
  itemId: string | null;
  accountId: string | null;
  quantityReceived: number;
  unitPrice: number;
  lineValue: number;
  stockMovementId: string | null;
}

export interface ReceivablePoLine {
  poLineId: string;
  lineNumber: number;
  description: string;
  lineType: string;
  itemId: string | null;
  accountId: string | null;
  unit: string | null;
  unitPrice: number;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
}

export interface WorkflowEvent {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  userName: string;
  reason: string;
  createdAt: string;
}

export interface GoodsReceiptDetail {
  item: GoodsReceipt;
  lines: GoodsReceiptLine[];
  history: WorkflowEvent[];
  po: { id: string; poNumber: string | null; subject: string; currency: string } | null;
  supplier: { id: string; name: string } | null;
}

async function j(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || fallback);
  return data;
}
function post(url: string, body: any) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface GoodsReceiptFilters {
  status?: string;
  purchaseOrderId?: string;
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export async function listGoodsReceipts(
  filters: GoodsReceiptFilters = {},
): Promise<{ items: GoodsReceipt[]; summary: any }> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) q.set(k, String(v));
  const qs = q.toString();
  return j(
    await fetch(`/api/procurement/goods-receipts${qs ? `?${qs}` : ""}`),
    "تعذّر جلب سندات الاستلام",
  );
}

export async function getGoodsReceipt(id: string): Promise<GoodsReceiptDetail> {
  return j(await fetch(`/api/procurement/goods-receipts?id=${id}`), "تعذّر جلب سند الاستلام");
}

export async function getReceivablePoLines(poId: string): Promise<{ lines: ReceivablePoLine[] }> {
  return j(
    await fetch(`/api/procurement/goods-receipts?poLines=${poId}`),
    "تعذّر جلب بنود الاستلام",
  );
}

export async function createGoodsReceipt(body: {
  purchaseOrderId: string;
  receiptDate?: string;
  notes?: string;
  lines: { poLineId: string; quantityReceived: number }[];
}): Promise<GoodsReceipt> {
  return (await j(await post("/api/procurement/goods-receipts", body), "تعذّر إنشاء سند الاستلام"))
    .item;
}

export async function updateGoodsReceipt(
  id: string,
  body: {
    receiptDate?: string;
    notes?: string;
    lines: { poLineId: string; quantityReceived: number }[];
  },
): Promise<GoodsReceipt> {
  return (
    await j(
      await post("/api/procurement/goods-receipts", { id, action: "update", ...body }),
      "تعذّر تعديل مسودة سند الاستلام",
    )
  ).item;
}

/** Governance transitions: submit | approve | return | reject | post | reverse. */
export async function transitionGoodsReceipt(
  id: string,
  action: "submit" | "approve" | "return" | "reject" | "post" | "reverse",
  reason?: string,
): Promise<GoodsReceipt> {
  return (
    await j(
      await post("/api/procurement/goods-receipts", { id, action, reason }),
      "تعذّر تنفيذ الإجراء على سند الاستلام",
    )
  ).item;
}

export async function reverseGoodsReceipt(id: string, reason: string): Promise<GoodsReceipt> {
  return transitionGoodsReceipt(id, "reverse", reason);
}
