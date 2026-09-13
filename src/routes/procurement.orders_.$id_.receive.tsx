import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { showToast, EmptyState } from "@/components/erp/actions";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/api/auth";
import {
  getPurchaseOrder,
  receivePurchaseOrder,
  type PurchaseOrderLine,
} from "@/lib/api/purchase-orders";

export const Route = createFileRoute("/procurement/orders_/$id_/receive")({
  head: () => ({ meta: [{ title: "تسجيل الاستلام — ثواب" }] }),
  component: ReceivePurchaseOrderPage,
});

function ReceivePurchaseOrderPage() {
  const { id } = useParams({ from: "/procurement/orders_/$id_/receive" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [receiveLines, setReceiveLines] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["purchaseOrderDetail", id],
    queryFn: () => getPurchaseOrder(id),
  });

  const item = q.data?.item;
  const lines: PurchaseOrderLine[] = q.data?.lines ?? [];

  const back = () => nav({ to: "/procurement/orders/$id", params: { id } as any });

  const receiveMutation = useMutation({
    mutationFn: receivePurchaseOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
      qc.invalidateQueries({ queryKey: ["purchaseOrderDetail"] });
      qc.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم تسجيل الاستلام وتحديث المخزون", "success");
      back();
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handleReceive = () => {
    if (!lines.length) return;
    const receipts = lines
      .filter((l) => {
        const qty = parseFloat(receiveLines[l.id] || "0");
        return qty > 0;
      })
      .map((l) => ({
        lineId: l.id,
        receivedQty: parseFloat(receiveLines[l.id] || "0"),
      }));
    if (receipts.length === 0) {
      return showToast("يرجى إدخال كمية واحدة على الأقل للاستلام", "error");
    }
    receiveMutation.mutate({
      id,
      receipts,
      userId: user?.id,
      userName: user?.name,
    });
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء", item?.subject || "أمر شراء", "استلام"]}
      title={`تسجيل الاستلام: ${item?.subject || item?.id || ""}`}
      actions={
        <Btn variant="ghost" onClick={back}>
          <ArrowRight size={15} /> رجوع
        </Btn>
      }
    >
      {q.isLoading ? (
        <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : !item ? (
        <EmptyState
          title="تعذّر جلب أمر الشراء"
          description="حدث خطأ أثناء جلب بيانات أمر الشراء"
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 pb-6">
          <div className="rounded-lg bg-info/10 p-3 text-sm">
            <div className="font-bold text-info mb-1">📦 تسجيل الاستلام</div>
            <p className="text-xs">
              أدخل الكميات المستلمة. سيتم تحديث المخزون تلقائياً وإنشاء حركة استلام لكل صنف.
            </p>
          </div>

          <Card className="p-4">
            <div className="text-xs font-semibold mb-2">سطور الأمر</div>
            {lines.map((l) => {
              const remaining = l.quantity - (l.receivedQuantity || 0);
              return (
                <div key={l.id} className="text-xs py-2 border-b last:border-0">
                  <div className="flex justify-between mb-1">
                    <span className="font-semibold">{l.description}</span>
                    <span className="text-muted-foreground">
                      متبقي: {remaining} {l.unit}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      className="flex-1 rounded-lg border bg-background p-2 text-sm"
                      value={receiveLines[l.id] || ""}
                      onChange={(e) => setReceiveLines({ ...receiveLines, [l.id]: e.target.value })}
                      placeholder="0"
                      max={remaining}
                    />
                    <span className="text-xs text-muted-foreground">{l.unit}</span>
                  </div>
                </div>
              );
            })}
          </Card>

          <Card className="p-3 flex items-center justify-end gap-2">
            <Btn variant="ghost" onClick={back} disabled={receiveMutation.isPending}>
              إلغاء
            </Btn>
            <Btn variant="primary" onClick={handleReceive} disabled={receiveMutation.isPending}>
              {receiveMutation.isPending ? "جارٍ الحفظ…" : "تأكيد الاستلام"}
            </Btn>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
