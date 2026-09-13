import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { Combobox } from "@/components/erp/Combobox";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { purchaseOrderLookup } from "@/lib/api/governed-purchase-orders";
import {
  getReceivablePoLines,
  createGoodsReceipt,
  type ReceivablePoLine,
} from "@/lib/api/goods-receipts";

const GRNI_NOTE =
  "سند الاستلام يقيّد: مدين المستلَم (مخزون/مصروف/أصل) / دائن «بضاعة مستلمة لم تُفوتر (GRNI)». لا يمس الذمم الدائنة ولا رصيد المورد.";

/** Shared full-page goods-receipt create form. */
export function GoodsReceiptForm() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canCreate = userCan(user, "procurement.grn.create");

  const [poId, setPoId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));

  const linesQ = useQuery({
    queryKey: ["receivable-po-lines", poId],
    queryFn: () => getReceivablePoLines(poId),
    enabled: !!poId,
  });
  const lines = linesQ.data?.lines || [];

  const done = () => nav({ to: "/procurement/goods-receipts" });

  const mut = useMutation({
    mutationFn: () =>
      createGoodsReceipt({
        purchaseOrderId: poId,
        receiptDate,
        notes,
        lines: lines
          .map((l) => ({ poLineId: l.poLineId, quantityReceived: Number(qty[l.poLineId]) || 0 }))
          .filter((l) => l.quantityReceived > 0),
      }),
    onSuccess: (item) => {
      showToast("تم إنشاء مسودة سند الاستلام", "success");
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      nav({ to: "/procurement/goods-receipts/$id", params: { id: item.id } as any });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const totalValue = lines.reduce((s, l) => s + (Number(qty[l.poLineId]) || 0) * l.unitPrice, 0);
  const validLines = lines.filter((l) => Number(qty[l.poLineId]) > 0);
  const canSubmit = !!poId && !!receiptDate && validLines.length > 0 && !mut.isPending;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "سندات الاستلام", "جديد"]}
      title="إنشاء سند استلام (مسودة)"
      actions={
        <Btn variant="ghost" onClick={done}>
          <ArrowRight size={15} /> رجوع للقائمة
        </Btn>
      }
    >
      {!canCreate ? (
        <EmptyState
          title="لا تملك صلاحية"
          description="تواصل مع مسؤول النظام لمنحك الصلاحية اللازمة"
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 pb-6">
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            {GRNI_NOTE}
          </div>

          <Card className="p-4 space-y-3">
            <Field label="أمر الشراء (صادر) *">
              <Combobox
                value={poId}
                placeholder="ابحث برقم أمر الشراء أو اسم المورد…"
                search={(q) => purchaseOrderLookup(q)}
                getId={(p: any) => p.id}
                getLabel={(p: any) =>
                  `${p.poNumber}${p.supplierName ? ` — ${p.supplierName}` : ""}`
                }
                onSelect={(p: any) => setPoId(p?.id || "")}
              />
            </Field>
            <Field label="تاريخ الاستلام *">
              <input
                type="date"
                className="inp"
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </Field>
            <Field label="ملاحظات">
              <textarea
                className="inp"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </Card>

          {poId ? (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-2">البنود القابلة للاستلام</div>
              <div className="space-y-2">
                {lines.map((l: ReceivablePoLine) => (
                  <div key={l.poLineId} className="rounded-lg border p-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{l.description || "—"}</span>
                      <Badge tone="muted">{l.lineType}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                      مطلوب {l.orderedQuantity} · مستلم {l.receivedQuantity} · متبقٍ{" "}
                      {l.remainingQuantity} · سعر {fmtSAR(l.unitPrice)}
                    </div>
                    <input
                      className="inp mt-1.5"
                      type="number"
                      min="0"
                      max={l.remainingQuantity}
                      step="0.01"
                      placeholder={`كمية الاستلام (حد أقصى ${l.remainingQuantity})`}
                      value={qty[l.poLineId] || ""}
                      onChange={(e) => setQty((p) => ({ ...p, [l.poLineId]: e.target.value }))}
                      disabled={l.remainingQuantity <= 0}
                    />
                  </div>
                ))}
                {lines.length === 0 ? (
                  <div className="text-xs text-muted-foreground">لا توجد بنود.</div>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <span className="text-xs font-semibold">قيمة الاستلام (GRNI)</span>
                <span className="text-base font-extrabold tabular-nums">{fmtSAR(totalValue)}</span>
              </div>
            </Card>
          ) : null}

          <Card className="p-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">قيمة الاستلام: </span>
              <span className="font-extrabold tabular-nums">{fmtSAR(totalValue)}</span>
            </div>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={done} disabled={mut.isPending}>
                إلغاء
              </Btn>
              <Btn variant="primary" onClick={() => mut.mutate()} disabled={!canSubmit}>
                {mut.isPending ? "جارٍ الحفظ…" : "حفظ كمسودة"}
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
