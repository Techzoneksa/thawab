import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { Combobox } from "@/components/erp/Combobox";
import { showToast, EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, Printer, Send, Check, Undo2, X, Trash2, RotateCcw } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { listCashboxes, listBankAccounts } from "@/lib/api/cash-bank";
import { listFinanceSuppliers, supplierLookup } from "@/lib/api/suppliers-finance";
import { invoiceSettlement } from "@/lib/api/ap-allocation";
import {
  listSupplierInvoices,
  getSupplierInvoice,
  getMatchableGrnLines,
  createSupplierInvoice,
  updateSupplierInvoice,
  supplierInvoiceAction,
  type SupplierInvoice,
  type SupplierInvoiceAction,
} from "@/lib/api/supplier-invoices";

export const Route = createFileRoute("/finance/supplier-invoices")({
  head: () => ({ meta: [{ title: "فواتير الموردين — ثواب" }] }),
  component: Page,
});

export const SI_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمدة — بانتظار الترحيل", tone: "primary" },
  posted: { label: "مُرحَّلة", tone: "success" },
  rejected: { label: "مرفوضة", tone: "destructive" },
  reversed: { label: "معكوسة", tone: "warning" },
};

const QUEUES = [
  { key: "", label: "الكل" },
  { key: "draft", label: "مسودات" },
  { key: "submitted", label: "بانتظار الاعتماد" },
  { key: "approved", label: "معتمدة بانتظار الترحيل" },
  { key: "posted", label: "مرحلة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "reversed", label: "معكوسة" },
];

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [queue, setQueue] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ item?: SupplierInvoice } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [queue, search]);

  const canCreate = userCan(user, "finance.supplier_invoice.create");

  const listQ = useQuery({
    queryKey: ["supplier-invoices", queue, search, page],
    queryFn: () =>
      listSupplierInvoices({
        status: queue || undefined,
        search: search || undefined,
        page,
        pageSize: 25,
      }),
  });
  const items = listQ.data?.items || [];
  const summary = listQ.data?.summary;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["supplier-invoices"] });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "فواتير الموردين"]}
      title="فواتير الموردين"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => setEditing({})}>
            <Plus size={15} /> فاتورة مورد جديدة
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="مسودات" value={summary?.draft ?? 0} />
        <SummaryCard label="بانتظار الاعتماد" value={summary?.submitted ?? 0} />
        <SummaryCard label="بانتظار الترحيل" value={summary?.approved ?? 0} />
        <SummaryCard label="إجمالي المستحق المُرحَّل" money value={summary?.outstanding ?? 0} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUEUES.map((q) => (
          <button
            key={q.key || "all"}
            onClick={() => setQueue(q.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${queue === q.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
          >
            {q.label}
          </button>
        ))}
        <input
          className="inp !w-56 ms-auto"
          placeholder="بحث برقم الفاتورة / رقم المورد…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد فواتير موردين"
          description="سجّل أول فاتورة مورد لإثبات ذمة دائنة (استحقاق) عند الترحيل"
        />
      ) : (
        <Table
          columns={[
            "رقم الفاتورة",
            "رقم المورد",
            "التاريخ",
            "الاستحقاق",
            "الصافي",
            "الضريبة",
            "الإجمالي",
            "الحالة",
            "القيد",
            "",
          ]}
          rows={items}
          renderRow={(v: SupplierInvoice) => (
            <>
              <Td className="font-mono text-xs font-semibold">{v.invoiceNumber}</Td>
              <Td className="text-xs">{v.supplierInvoiceNumber || "—"}</Td>
              <Td className="text-xs tabular-nums">{v.invoiceDate}</Td>
              <Td className="text-xs tabular-nums">{v.dueDate || "—"}</Td>
              <Td className="tabular-nums">{fmtSAR(v.subtotal)}</Td>
              <Td className="tabular-nums text-xs">{fmtSAR(v.taxAmount)}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(v.totalAmount)}</Td>
              <Td>
                <Badge tone={SI_STATUS[v.status]?.tone || "muted"}>
                  {SI_STATUS[v.status]?.label || v.status}
                </Badge>
              </Td>
              <Td className="text-xs font-mono text-muted-foreground">
                {v.journalEntryId ? "✓" : "—"}
              </Td>
              <Td>
                <div className="flex gap-1 justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="عرض"
                    onClick={() => setDetailId(v.id)}
                  >
                    <Eye size={15} />
                  </button>
                </div>
              </Td>
            </>
          )}
        />
      )}
      <Pager
        page={listQ.data?.page || page}
        totalPages={listQ.data?.totalPages || 1}
        total={listQ.data?.total || items.length}
        pageSize={listQ.data?.pageSize || 25}
        unit="فاتورة"
        onPage={setPage}
      />

      {editing && (
        <CreateEditDrawer
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {detailId && (
        <DetailDrawer
          id={detailId}
          onClose={() => setDetailId(null)}
          onChanged={invalidate}
          onEdit={(item) => {
            setDetailId(null);
            setEditing({ item });
          }}
        />
      )}
    </AppShell>
  );
}

function SummaryCard({ label, value, money }: { label: string; value: number; money?: boolean }) {
  return (
    <Card className="p-3 lg:p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg lg:text-2xl font-extrabold mt-1 tabular-nums">
        {money ? fmtSAR(value) : value}
      </div>
    </Card>
  );
}

type LineForm = {
  mode: "direct" | "grn_matched";
  accountId: string;
  goodsReceiptLineId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};

const emptyLine = (): LineForm => ({
  mode: "direct",
  accountId: "",
  goodsReceiptLineId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "15",
});

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function CreateEditDrawer({
  item,
  onClose,
  onSaved,
}: {
  item?: SupplierInvoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const acctQ = useQuery({ queryKey: ["accounts-all"], queryFn: () => getAccounts({}) });
  // ALL cash/bank masters → exclude their linked accounts from the debit picker.
  const allCashQ = useQuery({ queryKey: ["cashboxes", "all"], queryFn: () => listCashboxes(true) });
  const allBankQ = useQuery({ queryKey: ["banks", "all"], queryFn: () => listBankAccounts(true) });
  const detailQ = useQuery({
    queryKey: ["supplier-invoice", item?.id, "edit"],
    queryFn: () => getSupplierInvoice(item!.id),
    enabled: !!item?.id,
  });

  const [f, setF] = useState<any>({
    supplierId: item?.supplierId || "",
    supplierInvoiceNumber: item?.supplierInvoiceNumber || "",
    invoiceDate: item?.invoiceDate || new Date().toISOString().slice(0, 10),
    dueDate: item?.dueDate || "",
    externalReference: item?.externalReference || "",
    description: item?.description || "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [seeded, setSeeded] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  // Matchable posted-GRN lines for the chosen supplier (remaining invoiceable > 0).
  const matchQ = useQuery({
    queryKey: ["matchable-grn", f.supplierId],
    queryFn: () => getMatchableGrnLines(f.supplierId),
    enabled: !!f.supplierId,
  });
  const matchLines = matchQ.data?.lines || [];
  const matchById = useMemo(() => {
    const m = new Map<string, any>();
    for (const g of matchLines) m.set(g.goodsReceiptLineId, g);
    return m;
  }, [matchLines]);

  if (item?.id && detailQ.data && !seeded) {
    setSeeded(true);
    const allocByLine = new Map<string, any>();
    for (const a of detailQ.data.allocations || []) allocByLine.set(a.supplierInvoiceLineId, a);
    setLines(
      detailQ.data.lines.map((l) => {
        const matched = l.accountingMode === "grn_matched";
        return {
          mode: matched ? "grn_matched" : "direct",
          accountId: matched ? "" : l.accountId,
          goodsReceiptLineId: matched ? (allocByLine.get(l.id)?.goodsReceiptLineId ?? "") : "",
          description: l.description || "",
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          taxRate: String(l.taxRate),
        };
      }),
    );
  }

  const mappedIds = useMemo(() => {
    const s = new Set<string>();
    (allCashQ.data?.items || []).forEach((c: any) => s.add(c.linkedAccountId));
    (allBankQ.data?.items || []).forEach((b: any) => s.add(b.linkedAccountId));
    return s;
  }, [allCashQ.data, allBankQ.data]);

  // Debit targets: postable, active, expense/asset, not cash/bank-mapped, not a
  // control account (AP / input VAT). The server re-enforces all of this.
  const debitAccounts = (acctQ.data?.items || []).filter((a: Account) => {
    const sys = (a as any).systemKey;
    return (
      a.postable &&
      a.status === "active" &&
      (a.classification === "expense" || a.classification === "asset") &&
      !mappedIds.has(a.id) &&
      sys !== "accounts_payable" &&
      sys !== "input_vat"
    );
  });

  const computed = lines.map((l) => {
    const sub = round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
    const tax = round2((sub * (Number(l.taxRate) || 0)) / 100);
    return { sub, tax, total: round2(sub + tax) };
  });
  const subtotal = round2(computed.reduce((s, c) => s + c.sub, 0));
  const taxTotal = round2(computed.reduce((s, c) => s + c.tax, 0));
  const grand = round2(subtotal + taxTotal);

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        id: item?.id,
        supplierId: f.supplierId,
        supplierInvoiceNumber: f.supplierInvoiceNumber.trim(),
        invoiceDate: f.invoiceDate,
        dueDate: f.dueDate || null,
        externalReference: f.externalReference || null,
        description: f.description,
        lines: lines
          .filter(
            (l) =>
              (l.mode === "grn_matched" ? l.goodsReceiptLineId : l.accountId) &&
              Number(l.quantity) > 0 &&
              Number(l.unitPrice) > 0,
          )
          .map((l) =>
            l.mode === "grn_matched"
              ? {
                  accountingMode: "grn_matched" as const,
                  goodsReceiptLineId: l.goodsReceiptLineId,
                  description: l.description || undefined,
                  quantity: Number(l.quantity),
                  unitPrice: Number(l.unitPrice),
                  taxRate: Number(l.taxRate) || 0,
                }
              : {
                  accountingMode: "direct" as const,
                  accountId: l.accountId,
                  description: l.description || undefined,
                  quantity: Number(l.quantity),
                  unitPrice: Number(l.unitPrice),
                  taxRate: Number(l.taxRate) || 0,
                },
          ),
      };
      return item?.id ? updateSupplierInvoice(body) : createSupplierInvoice(body);
    },
    onSuccess: () => {
      showToast(item ? "تم حفظ المسودة" : "تم إنشاء الفاتورة", "success");
      onSaved();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const rmLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i));
  const setLine = (i: number, k: keyof LineForm, v: string) =>
    setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const setLineMode = (i: number, mode: "direct" | "grn_matched") =>
    setLines((p) =>
      p.map((l, j) =>
        j === i
          ? {
              ...emptyLine(),
              mode,
              description: l.description,
              taxRate: l.taxRate,
              quantity: mode === "grn_matched" ? "" : "1",
            }
          : l,
      ),
    );
  // Selecting a matched GRN line defaults to the FULL remaining quantity and pins
  // the unit price so the line NET equals the EXACT remaining GRNI value
  // (remainingGrniValue ÷ remainingQuantity) — this clears the receipt to zero with
  // no rounding residual. The server re-derives the required clearing under lock.
  // Accepts the SELECTED match object directly (from the searchable Combobox) so a
  // GRN line found by search — even one outside the default recent set — carries
  // its own remaining qty/value; no dependency on the preloaded matchById map.
  const setLineMatch = (i: number, g: any | null) =>
    setLines((p) =>
      p.map((l, j) => {
        if (j !== i) return l;
        const unit = g && g.remainingQuantity > 0 ? g.remainingGrniValue / g.remainingQuantity : 0;
        return {
          ...l,
          goodsReceiptLineId: g?.goodsReceiptLineId || "",
          unitPrice: g ? String(unit) : "",
          quantity: g ? String(g.remainingQuantity) : l.quantity,
          description: l.description || (g ? g.description : ""),
        };
      }),
    );

  return (
    <EntityFormDrawer
      open
      onClose={onClose}
      title={item ? `تعديل مسودة ${item.invoiceNumber}` : "فاتورة مورد جديدة"}
      onSave={() => mut.mutate()}
      saveText={item ? "حفظ المسودة" : "إنشاء"}
      loading={mut.isPending}
    >
      <div className="space-y-3">
        <Field label="المورد *">
          <Combobox
            value={f.supplierId}
            displayValue={
              detailQ.data?.supplier
                ? `${detailQ.data.supplier.supplierCode ? `${detailQ.data.supplier.supplierCode} — ` : ""}${detailQ.data.supplier.name}`
                : undefined
            }
            placeholder="ابحث عن مورد بالاسم أو الرمز…"
            search={(q) => supplierLookup(q)}
            getId={(s: any) => s.id}
            getLabel={(s: any) =>
              `${s.supplierCode ? `${s.supplierCode} — ` : ""}${s.name} (${s.currency})`
            }
            onSelect={(s: any) => set("supplierId", s?.id || "")}
          />
        </Field>

        <Field label="رقم فاتورة المورد *">
          <input
            className="inp"
            value={f.supplierInvoiceNumber}
            onChange={(e) => set("supplierInvoiceNumber", e.target.value)}
            placeholder="الرقم المطبوع على فاتورة المورد"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="تاريخ الفاتورة *">
            <input
              type="date"
              className="inp"
              value={f.invoiceDate}
              onChange={(e) => set("invoiceDate", e.target.value)}
            />
          </Field>
          <Field label="تاريخ الاستحقاق">
            <input
              type="date"
              className="inp"
              value={f.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
            />
          </Field>
        </div>

        <Field label="مرجع خارجي">
          <input
            className="inp"
            value={f.externalReference}
            onChange={(e) => set("externalReference", e.target.value)}
            placeholder="رقم أمر شراء / عقد…"
          />
        </Field>
        <Field label="البيان">
          <textarea
            className="inp"
            rows={2}
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-semibold text-muted-foreground">
              بنود الفاتورة — مباشر (مصروف/أصل) أو مطابقة استلام (إقفال GRNI) *
            </div>
            <Btn variant="ghost" onClick={addLine}>
              <Plus size={13} /> بند
            </Btn>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const g = l.mode === "grn_matched" ? matchById.get(l.goodsReceiptLineId) : null;
              return (
                <div key={i} className="rounded-lg border p-2 space-y-1.5">
                  <div className="flex gap-1 text-[11px]">
                    <button
                      type="button"
                      className={`rounded px-2 py-0.5 border ${l.mode === "direct" ? "bg-primary text-primary-foreground" : ""}`}
                      onClick={() => setLineMode(i, "direct")}
                    >
                      مباشر
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-0.5 border ${l.mode === "grn_matched" ? "bg-primary text-primary-foreground" : ""}`}
                      onClick={() => setLineMode(i, "grn_matched")}
                    >
                      مطابقة استلام
                    </button>
                  </div>

                  {l.mode === "direct" ? (
                    <select
                      className="inp"
                      value={l.accountId}
                      onChange={(e) => setLine(i, "accountId", e.target.value)}
                    >
                      <option value="">— اختر حساب مصروف/أصل —</option>
                      {debitAccounts.map((a: Account) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Combobox
                      value={l.goodsReceiptLineId}
                      displayValue={
                        matchById.get(l.goodsReceiptLineId)
                          ? `${matchById.get(l.goodsReceiptLineId)!.grnNumber} · ${matchById.get(l.goodsReceiptLineId)!.description || matchById.get(l.goodsReceiptLineId)!.lineType}`
                          : undefined
                      }
                      placeholder="ابحث برقم الاستلام أو أمر الشراء…"
                      search={(q) =>
                        getMatchableGrnLines(f.supplierId, q).then((r) => ({ items: r.lines }))
                      }
                      getId={(m: any) => m.goodsReceiptLineId}
                      getLabel={(m: any) =>
                        `${m.grnNumber} · ${m.description || m.lineType} · متبقٍ ${m.remainingQuantity} × ${fmtSAR(m.unitPrice)}`
                      }
                      onSelect={(m: any) => setLineMatch(i, m || null)}
                    />
                  )}

                  <input
                    className="inp"
                    placeholder="وصف البند"
                    value={l.description}
                    onChange={(e) => setLine(i, "description", e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    <NumIn
                      placeholder="الكمية"
                      value={l.quantity}
                      onChange={(v) => setLine(i, "quantity", v)}
                    />
                    <NumIn
                      placeholder="سعر الوحدة"
                      value={l.unitPrice}
                      onChange={(v) => setLine(i, "unitPrice", v)}
                      disabled={l.mode === "grn_matched"}
                    />
                    <NumIn
                      placeholder="ضريبة %"
                      value={l.taxRate}
                      onChange={(v) => setLine(i, "taxRate", v)}
                    />
                  </div>
                  {l.mode === "grn_matched" && g ? (
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      يقفل GRNI للاستلام {g.grnNumber} — متبقٍ {g.remainingQuantity} (قيمة{" "}
                      {fmtSAR(g.remainingGrniValue)}). السعر مثبّت من الاستلام — فروق الأسعار غير
                      مدعومة.
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      صافي {fmtSAR(computed[i]?.sub || 0)} · ضريبة {fmtSAR(computed[i]?.tax || 0)} ·
                      الإجمالي {fmtSAR(computed[i]?.total || 0)}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-muted text-destructive"
                        onClick={() => rmLine(i)}
                        title="حذف"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 space-y-1">
            <Row label="الصافي (قبل الضريبة)" value={subtotal} />
            <Row label="ضريبة القيمة المضافة (مدخلات)" value={taxTotal} />
            <Row label="الإجمالي المستحق للمورد" value={grand} bold />
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            الترحيل يُنشئ: مدين المصروف/الأصل + مدين ضريبة المدخلات / دائن الذمم الدائنة — ويُنسب
            الطرف الدائن لأستاذ المورد. القيم تُعاد حسابتها على الخادم.
          </div>
        </div>
      </div>
    </EntityFormDrawer>
  );
}

function NumIn({
  placeholder,
  value,
  onChange,
  disabled,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      className="inp"
      type="number"
      min="0"
      step="0.01"
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${bold ? "font-bold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-base font-extrabold" : "font-semibold"}`}>
        {fmtSAR(value)}
      </span>
    </div>
  );
}

function DetailDrawer({
  id,
  onClose,
  onChanged,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (item: SupplierInvoice) => void;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [reason, setReason] = useState<{ action: SupplierInvoiceAction; title: string } | null>(
    null,
  );
  const q = useQuery({ queryKey: ["supplier-invoice", id], queryFn: () => getSupplierInvoice(id) });
  const d = q.data;
  const canAlloc = userCan(user, "finance.supplier_payment_allocation.view");
  const settleQ = useQuery({
    queryKey: ["invoice-settlement", id],
    queryFn: () => invoiceSettlement(id),
    enabled: canAlloc && d?.item.status === "posted",
    retry: false,
  });

  const actionMut = useMutation({
    mutationFn: (p: { action: SupplierInvoiceAction; reason?: string }) =>
      supplierInvoiceAction(id, p.action, p.reason),
    onSuccess: () => {
      showToast("تم تنفيذ الإجراء", "success");
      qc.invalidateQueries({ queryKey: ["supplier-invoice", id] });
      onChanged();
      setReason(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const st = d?.item.status;
  const can = (perm: string) => userCan(user, perm);
  const act = (action: SupplierInvoiceAction, needsReason: boolean, title: string) =>
    needsReason ? setReason({ action, title }) : actionMut.mutate({ action });

  return (
    <EntityFormDrawer open onClose={onClose} title="فاتورة مورد" onSave={onClose} saveText="إغلاق">
      {d && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-mono font-bold">{d.item.invoiceNumber}</div>
            <Badge tone={SI_STATUS[d.item.status]?.tone || "muted"}>
              {SI_STATUS[d.item.status]?.label || d.item.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <KV label="المورد" value={d.supplier?.name || d.item.supplierId} />
            <KV label="رقم فاتورة المورد" value={d.item.supplierInvoiceNumber || "—"} />
            <KV label="تاريخ الفاتورة" value={d.item.invoiceDate} />
            <KV label="تاريخ الاستحقاق" value={d.item.dueDate || "—"} />
            <KV label="العملة" value={d.item.currency} />
            <KV label="مرجع خارجي" value={d.item.externalReference || "—"} />
          </div>
          {d.item.description ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              {d.item.description}
            </div>
          ) : null}

          <Card className="p-3">
            <div className="text-xs font-bold mb-2">بنود الفاتورة</div>
            <table className="w-full text-[12px]">
              <thead className="text-muted-foreground text-right">
                <tr>
                  <th className="py-1 pe-2">الحساب</th>
                  <th className="py-1 pe-2 text-left">كمية</th>
                  <th className="py-1 pe-2 text-left">سعر</th>
                  <th className="py-1 pe-2 text-left">صافي</th>
                  <th className="py-1 pe-2 text-left">ضريبة</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => {
                  const alloc = (d.allocations || []).find((a) => a.supplierInvoiceLineId === l.id);
                  const matched = l.accountingMode === "grn_matched";
                  return (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 pe-2 font-mono text-[11px]">
                        {matched ? (
                          <span className="inline-block rounded bg-primary/10 px-1 text-[10px] font-sans">
                            مطابقة استلام {alloc?.grnNumber || ""}
                          </span>
                        ) : (
                          l.accountId
                        )}
                        {l.description ? (
                          <div className="text-muted-foreground font-sans">{l.description}</div>
                        ) : null}
                      </td>
                      <td className="py-1 pe-2 text-left tabular-nums">{l.quantity}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.unitPrice)}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.lineSubtotal)}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.taxAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-2 border-t pt-2 space-y-1">
              <Row label="الصافي" value={d.item.subtotal} />
              <Row label="الضريبة (مدخلات)" value={d.item.taxAmount} />
              <Row label="الإجمالي المستحق" value={d.item.totalAmount} bold />
            </div>
          </Card>

          {d.journal ? (
            <div className="rounded-lg border bg-success/5 px-3 py-2 text-xs flex items-center justify-between">
              <span>
                القيد المُرحَّل: <span className="font-mono font-semibold">{d.journal.number}</span>
              </span>
              <button
                className="text-primary underline"
                onClick={() => nav({ to: "/finance/suppliers" })}
              >
                أستاذ الموردين
              </button>
            </div>
          ) : null}

          {canAlloc && d.item.status === "posted" && settleQ.data ? (
            <Card className="p-3">
              <div className="text-xs font-bold mb-2">تسوية الدفعات (تخصيص)</div>
              <div className="grid grid-cols-3 gap-2">
                <KV label="الأصل" value={fmtSAR(settleQ.data.originalPayable)} />
                <KV label="المُخصَّص" value={fmtSAR(settleQ.data.allocated)} />
                <KV label="المتبقي" value={fmtSAR(settleQ.data.outstanding)} />
              </div>
              {(settleQ.data.allocations || []).length > 0 && (
                <table className="w-full text-[11px] mt-2">
                  <thead className="text-muted-foreground text-right">
                    <tr>
                      <th className="py-1 pe-2">الدفعة</th>
                      <th className="py-1 pe-2">التاريخ</th>
                      <th className="py-1 pe-2">المبلغ المُخصَّص</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settleQ.data.allocations.map((a: any) => (
                      <tr key={a.id} className="border-t">
                        <td className="py-1 pe-2 font-mono">{a.supplierPaymentId}</td>
                        <td className="py-1 pe-2 tabular-nums">{a.paymentDate}</td>
                        <td className="py-1 pe-2 tabular-nums font-semibold">{fmtSAR(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="text-[10px] text-muted-foreground mt-2">
                التخصيص بيانات تسوية — لا يُنشئ قيداً محاسبياً. المتبقي = الأصل − إجمالي التخصيصات.
              </div>
            </Card>
          ) : null}

          <Timeline history={d.history} />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {st === "draft" && can("finance.supplier_invoice.update_draft") && (
              <Btn variant="outline" onClick={() => onEdit(d.item)}>
                تعديل
              </Btn>
            )}
            {st === "draft" && can("finance.supplier_invoice.submit") && (
              <Btn variant="primary" onClick={() => act("submit", false, "")}>
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.supplier_invoice.approve") && (
              <Btn variant="primary" onClick={() => act("approve", false, "")}>
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.supplier_invoice.reject") && (
              <>
                <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                  <Undo2 size={14} /> إعادة
                </Btn>
                <Btn variant="outline" onClick={() => act("reject", true, "رفض الفاتورة")}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === "approved" && can("finance.supplier_invoice.post") && (
              <Btn variant="primary" onClick={() => act("post", false, "")}>
                <Check size={14} /> ترحيل
              </Btn>
            )}
            {st === "posted" && can("finance.supplier_invoice.reverse") && (
              <Btn variant="outline" onClick={() => act("reverse", true, "عكس الفاتورة")}>
                <RotateCcw size={14} /> عكس
              </Btn>
            )}
            {st !== "draft" && (
              <Btn
                variant="ghost"
                onClick={() =>
                  nav({ to: "/finance/supplier-invoices/$id/print", params: { id } as any })
                }
              >
                <Printer size={14} /> طباعة
              </Btn>
            )}
          </div>
        </div>
      )}

      {reason && (
        <ReasonDialog
          title={reason.title}
          onCancel={() => setReason(null)}
          onConfirm={(r) => actionMut.mutate({ action: reason.action, reason: r })}
          loading={actionMut.isPending}
        />
      )}
    </EntityFormDrawer>
  );
}

function Timeline({
  history,
}: {
  history: {
    id: string;
    action: string;
    toStatus: string | null;
    userName: string;
    reason: string;
    createdAt: string;
  }[];
}) {
  const LABEL: Record<string, string> = {
    create: "إنشاء",
    submit: "إرسال للاعتماد",
    approve: "اعتماد",
    return: "إعادة للمسودة",
    reject: "رفض",
    post: "ترحيل",
    reverse: "عكس",
  };
  if (!history?.length) return null;
  return (
    <Card className="p-3">
      <div className="text-xs font-bold mb-2">سجل الإجراءات</div>
      <ol className="space-y-1.5">
        {history.map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-[11px]">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <div>
              <span className="font-semibold">{LABEL[e.action] || e.action}</span>
              <span className="text-muted-foreground"> — {e.userName} · </span>
              <span className="tabular-nums text-muted-foreground">
                {String(e.createdAt).slice(0, 16).replace("T", " ")}
              </span>
              {e.reason ? <div className="text-muted-foreground">السبب: {e.reason}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ReasonDialog({
  title,
  onCancel,
  onConfirm,
  loading,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}) {
  const [r, setR] = useState("");
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-xl bg-background p-4 shadow-xl border">
        <div className="font-bold mb-2">{title}</div>
        <textarea
          className="inp"
          rows={3}
          placeholder="اكتب السبب (مطلوب)…"
          value={r}
          onChange={(e) => setR(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <Btn variant="ghost" onClick={onCancel}>
            إلغاء
          </Btn>
          <Btn variant="primary" onClick={() => onConfirm(r)} disabled={!r.trim() || loading}>
            تأكيد
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
