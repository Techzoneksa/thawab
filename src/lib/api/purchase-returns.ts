/**
 * Phase 5B — governed Purchase Return client API. A return sends back UNINVOICED
 * received quantity: on POST it debits GRNI (historical) and credits the receipt's
 * original debit account, and reduces inventory — never AP or VAT.
 */
const API = "/api/procurement/purchase-returns";

async function j(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || fallback);
  return data;
}
function post(body: any) {
  return fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface PurchaseReturnRow {
  id: string;
  returnNumber: string;
  goodsReceiptId: string;
  grnNumber: string | null;
  supplierId: string | null;
  returnDate: string;
  status: string;
  totalValue: number;
  poNumber: string | null;
}

export async function listPurchaseReturns(
  opts: {
    status?: string;
    search?: string;
    goodsReceiptId?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{
  items: PurchaseReturnRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const p = new URLSearchParams();
  if (opts.status) p.set("status", opts.status);
  if (opts.search) p.set("search", opts.search);
  if (opts.goodsReceiptId) p.set("goodsReceiptId", opts.goodsReceiptId);
  p.set("page", String(opts.page ?? 1));
  p.set("pageSize", String(opts.pageSize ?? 25));
  return j(await fetch(`${API}?${p.toString()}`), "تعذّر جلب المرتجعات");
}

export async function getPurchaseReturn(id: string): Promise<any> {
  return j(await fetch(`${API}?id=${encodeURIComponent(id)}`), "تعذّر جلب المرتجع");
}

export interface ReturnableLine {
  goodsReceiptLineId: string;
  lineType: string;
  description: string;
  itemId: string | null;
  accountId: string | null;
  unitPrice: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  remainingGrniValue: number;
}
export async function returnableGrnLines(goodsReceiptId: string): Promise<{
  grn: { id: string; grnNumber: string; supplierId: string | null; status: string };
  lines: ReturnableLine[];
}> {
  return j(
    await fetch(`${API}?returnable=${encodeURIComponent(goodsReceiptId)}`),
    "تعذّر جلب سطور الاستلام القابلة للإرجاع",
  );
}

export interface EligibleGrn {
  goodsReceiptId: string;
  grnNumber: string;
  receiptDate: string;
  supplierId: string | null;
  poNumber: string | null;
  returnableLineCount: number;
}
export async function eligibleGrnsForReturn(
  opts: { supplierId?: string; q?: string; limit?: number } = {},
): Promise<{ items: EligibleGrn[] }> {
  const p = new URLSearchParams({ eligible: "1" });
  if (opts.supplierId) p.set("supplierId", opts.supplierId);
  if (opts.q) p.set("q", opts.q);
  if (opts.limit) p.set("limit", String(opts.limit));
  return j(await fetch(`${API}?${p.toString()}`), "تعذّر جلب سندات الاستلام المؤهّلة للإرجاع");
}

export async function createPurchaseReturn(input: {
  goodsReceiptId: string;
  returnDate?: string;
  reason?: string;
  lines: { goodsReceiptLineId: string; quantity: number }[];
}): Promise<{ item: any }> {
  return j(await post(input), "تعذّر إنشاء المرتجع");
}

export async function purchaseReturnAction(
  id: string,
  action: "submit" | "approve" | "return" | "reject" | "post" | "reverse",
  reason?: string,
): Promise<{ item: any }> {
  return j(await post({ id, action, reason }), "تعذّر تنفيذ الإجراء");
}
