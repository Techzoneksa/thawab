import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { showToast, EmptyState } from "@/components/erp/actions";
import { ArrowRight } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  returnableGrnLines,
  eligibleGrnsForReturn,
  createPurchaseReturn,
} from "@/lib/api/purchase-returns";

/** Shared full-page purchase-return create form (mirrors the old CreateDrawer). */
export function PurchaseReturnForm() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canCreate = userCan(user, "procurement.purchase_return.create");

  const [grnSearch, setGrnSearch] = useState("");
  const [grnId, setGrnId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const grnsQ = useQuery({
    queryKey: ["eligible-grn-picker", grnSearch],
    queryFn: () => eligibleGrnsForReturn({ q: grnSearch || undefined, limit: 20 }),
    enabled: !grnId,
  });
  const returnableQ = useQuery({
    queryKey: ["returnable", grnId],
    queryFn: () => returnableGrnLines(grnId!),
    enabled: !!grnId,
  });

  const done = () => nav({ to: "/procurement/purchase-returns" });

  const createMut = useMutation({
    mutationFn: () => {
      const lines = Object.entries(qty)
        .map(([goodsReceiptLineId, v]) => ({ goodsReceiptLineId, quantity: Number(v) }))
        .filter((l) => l.quantity > 0);
      if (!grnId || lines.length === 0) throw new Error("حدّد كمية إرجاع واحدة على الأقل");
      return createPurchaseReturn({ goodsReceiptId: grnId, reason: reason || undefined, lines });
    },
    onSuccess: (r) => {
      showToast("تم إنشاء المرتجع (مسودة)", "success");
      qc.invalidateQueries({ queryKey: ["purchase-returns"] });
      nav({ to: "/procurement/purchase-returns/$id", params: { id: r.item.id } as any });
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const lines = returnableQ.data?.lines || [];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "مرتجعات المشتريات", "جديد"]}
      title="مرتجع مشتريات جديد"
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
        <div className="mx-auto max-w-3xl space-y-4 pb-6 text-sm">
          {!grnId ? (
            <Card className="p-4 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground">
                اختر سند استلام مُرحَّل
              </div>
              <input
                className="inp w-full"
                placeholder="بحث برقم الاستلام…"
                value={grnSearch}
                onChange={(e) => setGrnSearch(e.target.value)}
              />
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {(grnsQ.data?.items || []).map((g) => (
                  <button
                    key={g.goodsReceiptId}
                    className="w-full text-right rounded-lg border px-3 py-2 hover:bg-muted"
                    onClick={() => setGrnId(g.goodsReceiptId)}
                  >
                    <span className="font-mono text-xs font-semibold">{g.grnNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      — {g.receiptDate}
                      {g.poNumber ? ` — ${g.poNumber}` : ""} — {g.returnableLineCount} سطر قابل
                      للإرجاع
                    </span>
                  </button>
                ))}
                {(grnsQ.data?.items?.length ?? 0) === 0 && (
                  <div className="text-xs text-muted-foreground py-2">
                    لا توجد سندات استلام مؤهّلة للإرجاع
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <>
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-xs font-semibold">
                    {returnableQ.data?.grn.grnNumber}
                  </div>
                  <button className="text-xs text-primary" onClick={() => setGrnId(null)}>
                    تغيير السند
                  </button>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  أدخل الكمية المُرجَعة (لا تتجاوز المتبقّي غير المفوتر). الإرجاع يخفّض المخزون
                  ويقفل GRNI — لا يمس الذمم الدائنة.
                </div>
                {lines.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">
                    لا توجد كميات قابلة للإرجاع على هذا السند
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lines.map((l) => (
                      <div key={l.goodsReceiptLineId} className="rounded-lg border px-2.5 py-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium">
                            {l.description || l.goodsReceiptLineId}
                          </span>
                          <span className="ms-auto text-muted-foreground">
                            قابل للإرجاع <b className="tabular-nums">{l.returnableQuantity}</b>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <input
                            className="inp !h-8 text-sm"
                            inputMode="decimal"
                            placeholder="الكمية"
                            value={qty[l.goodsReceiptLineId] ?? ""}
                            onChange={(e) =>
                              setQty((p) => ({ ...p, [l.goodsReceiptLineId]: e.target.value }))
                            }
                          />
                          <button
                            className="text-[11px] text-primary whitespace-nowrap"
                            onClick={() =>
                              setQty((p) => ({
                                ...p,
                                [l.goodsReceiptLineId]: String(l.returnableQuantity),
                              }))
                            }
                          >
                            الأقصى
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                    السبب (اختياري)
                  </div>
                  <input
                    className="inp w-full"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </Card>

              <Card className="p-3 flex items-center justify-end gap-2">
                <Btn variant="ghost" onClick={done} disabled={createMut.isPending}>
                  إلغاء
                </Btn>
                <Btn
                  variant="primary"
                  onClick={() => createMut.mutate()}
                  disabled={createMut.isPending}
                >
                  {createMut.isPending ? "جارٍ الحفظ…" : "إنشاء مسودة"}
                </Btn>
              </Card>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
