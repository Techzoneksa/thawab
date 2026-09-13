import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { Combobox } from "@/components/erp/Combobox";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { listCashboxes, listBankAccounts } from "@/lib/api/cash-bank";
import { supplierLookup } from "@/lib/api/suppliers-finance";
import {
  getSupplierInvoice,
  getMatchableGrnLines,
  createSupplierInvoice,
  updateSupplierInvoice,
} from "@/lib/api/supplier-invoices";

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

/** Shared full-page supplier-invoice form for both create and draft-edit. */
export function SupplierInvoiceForm({ invoiceId }: { invoiceId?: string }) {
  const isEdit = !!invoiceId;
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canCreate = userCan(user, "finance.supplier_invoice.create");
  const canEdit = userCan(user, "finance.supplier_invoice.update_draft");
  const allowed = isEdit ? canEdit : canCreate;

  const acctQ = useQuery({ queryKey: ["accounts-all"], queryFn: () => getAccounts({}) });
  const allCashQ = useQuery({ queryKey: ["cashboxes", "all"], queryFn: () => listCashboxes(true) });
  const allBankQ = useQuery({ queryKey: ["banks", "all"], queryFn: () => listBankAccounts(true) });
  const detailQ = useQuery({
    queryKey: ["supplier-invoice", invoiceId, "edit"],
    queryFn: () => getSupplierInvoice(invoiceId!),
    enabled: isEdit,
  });

  const [f, setF] = useState<any>({
    supplierId: "",
    supplierInvoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    externalReference: "",
    description: "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [seeded, setSeeded] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

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

  if (isEdit && detailQ.data && !seeded) {
    setSeeded(true);
    const it = detailQ.data.item;
    setF({
      supplierId: it.supplierId,
      supplierInvoiceNumber: it.supplierInvoiceNumber || "",
      invoiceDate: it.invoiceDate,
      dueDate: it.dueDate || "",
      externalReference: it.externalReference || "",
      description: it.description || "",
    });
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

  const done = () => {
    if (isEdit) nav({ to: "/finance/supplier-invoices/$id", params: { id: invoiceId } as any });
    else nav({ to: "/finance/supplier-invoices" });
  };

  const mut = useMutation({
    mutationFn: async () => {
      const body: any = {
        id: invoiceId,
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
      return isEdit ? updateSupplierInvoice(body) : createSupplierInvoice(body);
    },
    onSuccess: () => {
      showToast(isEdit ? "تم حفظ المسودة" : "تم إنشاء الفاتورة", "success");
      qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
      qc.invalidateQueries({ queryKey: ["supplier-invoice", invoiceId] });
      done();
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

  const validLines = lines.filter(
    (l) =>
      (l.mode === "grn_matched" ? l.goodsReceiptLineId : l.accountId) &&
      Number(l.quantity) > 0 &&
      Number(l.unitPrice) > 0,
  );
  const canSubmit =
    !!f.supplierId && !!f.supplierInvoiceNumber.trim() && validLines.length > 0 && !mut.isPending;
  const notDraft = isEdit && detailQ.data && detailQ.data.item.status !== "draft";

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "فواتير الموردين", isEdit ? "تعديل" : "جديدة"]}
      title={isEdit ? "تعديل فاتورة مورد" : "فاتورة مورد جديدة"}
      actions={
        <Btn variant="ghost" onClick={done}>
          <ArrowRight size={15} /> رجوع
        </Btn>
      }
    >
      {!allowed ? (
        <EmptyState
          title="لا تملك صلاحية"
          description="تواصل مع مسؤول النظام لمنحك الصلاحية اللازمة"
        />
      ) : notDraft ? (
        <EmptyState
          title="لا يمكن تعديل فاتورة غير مسودة"
          description="الفواتير المُرسلة/المعتمدة/المُرحّلة لا تُعدّل — افتح صفحة الفاتورة لعرضها أو عكسها."
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 pb-6">
          <Card className="p-4 space-y-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">
                بنود الفاتورة — مباشر (مصروف/أصل) أو مطابقة استلام (إقفال GRNI) *
              </div>
              <Btn variant="ghost" onClick={addLine}>
                <Plus size={14} /> بند
              </Btn>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => {
                const g = l.mode === "grn_matched" ? matchById.get(l.goodsReceiptLineId) : null;
                return (
                  <div key={i} className="rounded-lg border p-3 space-y-2">
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
                        search={(query) =>
                          getMatchableGrnLines(f.supplierId, query).then((r) => ({
                            items: r.lines,
                          }))
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
                    <div className="grid grid-cols-3 gap-2">
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
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        صافي {fmtSAR(computed[i]?.sub || 0)} · ضريبة {fmtSAR(computed[i]?.tax || 0)}{" "}
                        · الإجمالي {fmtSAR(computed[i]?.total || 0)}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-muted text-destructive"
                          onClick={() => rmLine(i)}
                          title="حذف"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 space-y-1">
              <Row label="الصافي (قبل الضريبة)" value={subtotal} />
              <Row label="ضريبة القيمة المضافة (مدخلات)" value={taxTotal} />
              <Row label="الإجمالي المستحق للمورد" value={grand} bold />
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">
              الترحيل يُنشئ: مدين المصروف/الأصل + مدين ضريبة المدخلات / دائن الذمم الدائنة — ويُنسب
              الطرف الدائن لأستاذ المورد. القيم تُعاد حسابتها على الخادم.
            </div>
          </Card>

          <Card className="p-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">الإجمالي: </span>
              <span className="font-extrabold tabular-nums">{fmtSAR(grand)}</span>
            </div>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={done} disabled={mut.isPending}>
                إلغاء
              </Btn>
              <Btn variant="primary" onClick={() => mut.mutate()} disabled={!canSubmit}>
                {mut.isPending ? "جارٍ الحفظ…" : isEdit ? "حفظ المسودة" : "إنشاء"}
              </Btn>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
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
