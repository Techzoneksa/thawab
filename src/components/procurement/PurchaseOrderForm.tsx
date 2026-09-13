import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { Combobox } from "@/components/erp/Combobox";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { supplierLookup } from "@/lib/api/suppliers-finance";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  getPurchaseOrder,
} from "@/lib/api/governed-purchase-orders";

const NO_ACCOUNTING = "هذا الأمر لا يُنشئ قيدًا محاسبيًا ولا يؤثر على المخزون أو ذمم الموردين.";

type LineForm = {
  description: string;
  lineType: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate: string;
};
const emptyLine = (): LineForm => ({
  description: "",
  lineType: "ITEM",
  quantity: "1",
  unit: "",
  unitPrice: "",
  taxRate: "15",
});
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const LINE_TYPES = [
  { k: "ITEM", l: "صنف مخزني" },
  { k: "SERVICE", l: "خدمة" },
  { k: "ASSET", l: "أصل" },
  { k: "EXPENSE", l: "مصروف" },
  { k: "OTHER", l: "أخرى" },
];

/** Shared full-page purchase-order form for both create and edit (draft only). */
export function PurchaseOrderForm({ id }: { id?: string }) {
  const isEdit = !!id;
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canCreate = userCan(user, "procurement.po.create");
  const canEdit = userCan(user, "procurement.po.update_draft");
  const allowed = isEdit ? canEdit : canCreate;

  const detailQ = useQuery({
    queryKey: ["purchase-order", id, "edit"],
    queryFn: () => getPurchaseOrder(id!),
    enabled: isEdit,
  });

  const [f, setF] = useState<any>({
    supplierId: "",
    subject: "",
    orderDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: "",
    supplierReference: "",
    notes: "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [seeded, setSeeded] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  // Seed the form once from the loaded draft (edit mode).
  if (isEdit && detailQ.data && !seeded) {
    setSeeded(true);
    const it = detailQ.data.item;
    setF({
      supplierId: it.supplierId || "",
      subject: it.subject || "",
      orderDate: it.date,
      expectedDeliveryDate: it.deliveryDate || "",
      supplierReference: it.supplierReference || "",
      notes: it.notes || "",
    });
    setLines(
      detailQ.data.lines.map((l) => ({
        description: l.description || "",
        lineType: l.lineType || "ITEM",
        quantity: String(l.quantity),
        unit: l.unit || "",
        unitPrice: String(l.unitPrice),
        taxRate: String(l.taxRate),
      })),
    );
  }

  const computed = lines.map((l) => {
    const sub = round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
    const tax = round2((sub * (Number(l.taxRate) || 0)) / 100);
    return { sub, tax, total: round2(sub + tax) };
  });
  const subtotal = round2(computed.reduce((s, c) => s + c.sub, 0));
  const taxTotal = round2(computed.reduce((s, c) => s + c.tax, 0));
  const grand = round2(subtotal + taxTotal);

  const backToList = () => nav({ to: "/procurement/purchase-orders" });

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        id,
        supplierId: f.supplierId,
        subject: f.subject.trim(),
        orderDate: f.orderDate,
        expectedDeliveryDate: f.expectedDeliveryDate || null,
        supplierReference: f.supplierReference || null,
        notes: f.notes,
        lines: lines
          .filter((l) => Number(l.quantity) > 0)
          .map((l) => ({
            description: l.description || undefined,
            lineType: l.lineType,
            quantity: Number(l.quantity),
            unit: l.unit || undefined,
            unitPrice: Number(l.unitPrice) || 0,
            taxRate: Number(l.taxRate) || 0,
          })),
      };
      return isEdit ? updatePurchaseOrder(body) : createPurchaseOrder(body);
    },
    onSuccess: (res) => {
      showToast(isEdit ? "تم حفظ المسودة" : "تم إنشاء أمر الشراء", "success");
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      nav({ to: "/procurement/purchase-orders/$id", params: { id: res.id } as any });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const rmLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i));
  const setLine = (i: number, k: keyof LineForm, v: string) =>
    setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const validLines = lines.filter((l) => Number(l.quantity) > 0);
  const canSubmit =
    !!f.supplierId &&
    !!f.subject.trim() &&
    !!f.orderDate &&
    validLines.length > 0 &&
    !mut.isPending;
  const notDraft = isEdit && detailQ.data && detailQ.data.item.status !== "draft";

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء", isEdit ? "تعديل" : "جديد"]}
      title={isEdit ? "تعديل أمر شراء" : "أمر شراء جديد"}
      actions={
        <Btn variant="ghost" onClick={backToList}>
          <ArrowRight size={15} /> رجوع للقائمة
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
          title="لا يمكن تعديل أمر غير مسودة"
          description="الأوامر المُرسلة/المعتمدة/الصادرة لا تُعدّل — افتح صفحة الأمر لعرضه."
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 pb-6">
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            {NO_ACCOUNTING}
          </div>

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
            <Field label="الموضوع *">
              <input
                className="inp"
                value={f.subject}
                onChange={(e) => set("subject", e.target.value)}
                placeholder="وصف مختصر لأمر الشراء"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="تاريخ الأمر *">
                <input
                  type="date"
                  className="inp"
                  value={f.orderDate}
                  onChange={(e) => set("orderDate", e.target.value)}
                />
              </Field>
              <Field label="التسليم المتوقع">
                <input
                  type="date"
                  className="inp"
                  value={f.expectedDeliveryDate}
                  onChange={(e) => set("expectedDeliveryDate", e.target.value)}
                />
              </Field>
            </div>
            <Field label="مرجع المورد">
              <input
                className="inp"
                value={f.supplierReference}
                onChange={(e) => set("supplierReference", e.target.value)}
                placeholder="عرض سعر / عقد…"
              />
            </Field>
            <Field label="ملاحظات">
              <textarea
                className="inp"
                rows={2}
                value={f.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">بنود أمر الشراء *</div>
              <Btn variant="ghost" onClick={addLine}>
                <Plus size={14} /> بند
              </Btn>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      className="inp"
                      placeholder="وصف البند"
                      value={l.description}
                      onChange={(e) => setLine(i, "description", e.target.value)}
                    />
                    <select
                      className="inp !w-32"
                      value={l.lineType}
                      onChange={(e) => setLine(i, "lineType", e.target.value)}
                    >
                      {LINE_TYPES.map((t) => (
                        <option key={t.k} value={t.k}>
                          {t.l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <NumIn
                      placeholder="الكمية"
                      value={l.quantity}
                      onChange={(v) => setLine(i, "quantity", v)}
                    />
                    <input
                      className="inp"
                      placeholder="الوحدة"
                      value={l.unit}
                      onChange={(e) => setLine(i, "unit", e.target.value)}
                    />
                    <NumIn
                      placeholder="سعر الوحدة"
                      value={l.unitPrice}
                      onChange={(v) => setLine(i, "unitPrice", v)}
                    />
                    <NumIn
                      placeholder="ضريبة %"
                      value={l.taxRate}
                      onChange={(v) => setLine(i, "taxRate", v)}
                    />
                  </div>
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
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 space-y-1">
              <Row label="الصافي" value={subtotal} />
              <Row label="الضريبة (قيمة تعاقدية فقط)" value={taxTotal} />
              <Row label="إجمالي قيمة الالتزام" value={grand} bold />
            </div>
          </Card>

          <Card className="p-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">الإجمالي: </span>
              <span className="font-extrabold tabular-nums">{fmtSAR(grand)}</span>
            </div>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={backToList} disabled={mut.isPending}>
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
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      className="inp"
      type="number"
      min="0"
      step="0.01"
      placeholder={placeholder}
      value={value}
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
