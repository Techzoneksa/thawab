import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Pencil, Check, Lock, Ban, Archive, PackageCheck } from "lucide-react";
import { useAuth } from "@/lib/api/auth";
import { PurchaseOrderStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";
import {
  getPurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  closePurchaseOrder,
  deletePurchaseOrder,
  type PurchaseOrderLine,
} from "@/lib/api/purchase-orders";
import { getSuppliers } from "@/lib/api/suppliers";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/procurement/orders_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل أمر الشراء — ثواب" }] }),
  component: PurchaseOrderDetailPage,
});

type PoConfirmAction = "approve" | "cancel" | "close" | "delete";

function PurchaseOrderDetailPage() {
  const { id } = useParams({ from: "/procurement/orders_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["purchaseOrderDetail", id],
    queryFn: () => getPurchaseOrder(id),
  });
  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: () => getSuppliers({}),
  });

  const item = q.data?.item;
  const lines: PurchaseOrderLine[] = q.data?.lines ?? [];
  const suppliers = suppliersData?.items || [];
  const supplierName = item ? suppliers.find((s) => s.id === item.supplierId)?.name || "—" : "—";
  const st = item?.status;
  const total = lines.reduce((s, l) => s + (l.quantity || 0) * (l.unitPrice || 0), 0);
  const receivedAmount = item?.receivedAmount ?? 0;

  const canApprove = st === PurchaseOrderStatus.DRAFT;
  const canReceive = st === PurchaseOrderStatus.SENT || st === PurchaseOrderStatus.PARTIAL;
  const canClose = st === PurchaseOrderStatus.RECEIVED || st === PurchaseOrderStatus.PARTIAL;
  const canCancel =
    st !== PurchaseOrderStatus.CANCELLED && st !== PurchaseOrderStatus.CLOSED && !!st;
  const canEdit = st === PurchaseOrderStatus.DRAFT;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
    qc.invalidateQueries({ queryKey: ["purchaseOrderDetail", id] });
    qc.invalidateQueries({ queryKey: ["purchaseOrderAudit", id] });
  };

  const approveMut = useMutation({
    mutationFn: () => approvePurchaseOrder({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      invalidate();
      showToast("تم اعتماد أمر الشراء", "success");
      setConfirm(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });
  const cancelMut = useMutation({
    mutationFn: () => cancelPurchaseOrder({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم إلغاء أمر الشراء", "success");
      setConfirm(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });
  const closeMut = useMutation({
    mutationFn: () => closePurchaseOrder({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      invalidate();
      showToast("تم إغلاق أمر الشراء", "success");
      setConfirm(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });
  const deleteMut = useMutation({
    mutationFn: () => deletePurchaseOrder({ id, userId: user?.id, userName: user?.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
      qc.invalidateQueries({ queryKey: ["purchaseRequests"] });
      showToast("تم حذف أمر الشراء", "success");
      nav({ to: "/procurement/orders" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const back = () => nav({ to: "/procurement/orders" });
  const openEdit = () => nav({ to: "/procurement/orders/$id/edit", params: { id } as any });

  const buildDoc = (): DocumentDefinition => {
    const v = item!;
    return {
      title: "أمر شراء",
      number: v.id,
      date: v.date,
      orientation: "portrait",
      entity: { name: supplierName },
      meta: [
        { label: "الحالة", value: label("purchaseOrderStatus", v.status) },
        { label: "تاريخ التوريد", value: v.deliveryDate || "—" },
        { label: "المستلم", value: fmtSAR(receivedAmount) },
      ],
      columns: [
        { key: "description", label: "الوصف", width: "36%" },
        { key: "qty", label: "الكمية", type: "number" },
        { key: "unit", label: "الوحدة" },
        { key: "price", label: "السعر", type: "money" },
        { key: "total", label: "الإجمالي", type: "money" },
        { key: "received", label: "المستلم", type: "number" },
      ],
      rows: lines.map((l) => ({
        description: l.description,
        qty: l.quantity,
        unit: l.unit || "—",
        price: l.unitPrice,
        total: (l.quantity || 0) * (l.unitPrice || 0),
        received: l.receivedQuantity || 0,
      })),
      totals: [
        { label: "إجمالي الأمر", value: total, type: "money", strong: true },
        { label: "المستلم", value: receivedAmount, type: "money" },
      ],
      notes: v.notes || undefined,
      signature: true,
      fileBase: `purchase-order-${v.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `أمر شراء ${item?.id || ""}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("تم نسخ رابط أمر الشراء", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  const [confirm, setConfirm] = useState<PoConfirmAction | null>(null);

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء", item?.subject || "أمر شراء"]}
      title={`أمر شراء: ${item?.subject || ""}`}
      actions={
        <>
          {item && <DocumentActions document={buildDoc} />}
          <Btn variant="ghost" onClick={share}>
            <Share2 size={15} /> مشاركة
          </Btn>
          {canEdit && (
            <Btn variant="ghost" onClick={openEdit}>
              <Pencil size={15} /> تعديل
            </Btn>
          )}
          <Btn variant="ghost" onClick={back}>
            <ArrowRight size={15} /> رجوع
          </Btn>
        </>
      }
    >
      {q.isLoading ? (
        <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : !item ? (
        <div className="p-8 text-center text-destructive">تعذّر جلب أمر الشراء</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-mono font-bold text-base">{item.id}</div>
              <Badge tone={statusTone(item.status)}>
                {label("purchaseOrderStatus", item.status)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KV label="الموضوع" value={item.subject} />
              <KV label="المورد" value={supplierName} />
              <KV label="التاريخ" value={item.date} />
              <KV label="تاريخ التوريد" value={item.deliveryDate || "—"} />
              <KV label="الإجمالي" value={fmtSAR(item.total)} />
              <KV label="المستلم" value={fmtSAR(receivedAmount)} />
            </div>
            {item.notes ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs whitespace-pre-wrap">
                {item.notes}
              </div>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="text-xs font-bold mb-2">بنود الأمر</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-muted-foreground text-right">
                  <tr>
                    <th className="py-1 pe-2">الوصف</th>
                    <th className="py-1 pe-2 text-left">الكمية</th>
                    <th className="py-1 pe-2 text-left">الوحدة</th>
                    <th className="py-1 pe-2 text-left">السعر</th>
                    <th className="py-1 pe-2 text-left">الإجمالي</th>
                    <th className="py-1 pe-2 text-left">المستلم</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 pe-2">{l.description}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{l.quantity}</td>
                      <td className="py-1 pe-2 text-left text-muted-foreground">{l.unit || "—"}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.unitPrice)}</td>
                      <td className="py-1 pe-2 text-left tabular-nums">
                        {fmtSAR((l.quantity || 0) * (l.unitPrice || 0))}
                      </td>
                      <td className="py-1 pe-2 text-left tabular-nums">
                        <span
                          className={
                            l.receivedQuantity >= l.quantity
                              ? "text-success font-bold"
                              : l.receivedQuantity > 0
                                ? "text-warning font-semibold"
                                : "text-muted-foreground"
                          }
                        >
                          {l.receivedQuantity || 0} / {l.quantity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 border-t pt-2 space-y-1">
              <Row label="إجمالي الأمر" value={total} bold />
              <Row label="المستلم حتى الآن" value={receivedAmount} />
              <Row label="المتبقي" value={Math.max(0, total - receivedAmount)} />
            </div>
          </Card>

          <Card className="p-3 flex flex-wrap gap-1.5">
            {canEdit && (
              <Btn variant="outline" onClick={openEdit}>
                <Pencil size={14} /> تعديل
              </Btn>
            )}
            {canApprove && (
              <Btn variant="primary" onClick={() => setConfirm("approve")}>
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {canReceive && (
              <Btn variant="primary" onClick={openEdit}>
                <PackageCheck size={14} /> استلام
              </Btn>
            )}
            {canClose && (
              <Btn variant="outline" onClick={() => setConfirm("close")}>
                <Lock size={14} /> إغلاق
              </Btn>
            )}
            {canCancel && (
              <Btn variant="outline" onClick={() => setConfirm("cancel")}>
                <Ban size={14} /> إلغاء
              </Btn>
            )}
            {st === PurchaseOrderStatus.DRAFT && (
              <Btn variant="outline" onClick={() => setConfirm("delete")}>
                <Archive size={14} /> حذف
              </Btn>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirm === "approve"}
        onClose={() => setConfirm(null)}
        onConfirm={() => approveMut.mutate()}
        title="اعتماد أمر الشراء"
        message={`هل تريد اعتماد أمر الشراء "${item?.subject || ""}"؟ بعد الاعتماد يمكنك تسجيل الاستلام.`}
        confirmText="اعتماد"
        cancelText="تراجع"
      />
      <ConfirmDialog
        open={confirm === "close"}
        onClose={() => setConfirm(null)}
        onConfirm={() => closeMut.mutate()}
        title="إغلاق الأمر"
        message={`هل تريد إغلاق أمر الشراء "${item?.subject || ""}"؟`}
        confirmText="إغلاق"
        cancelText="تراجع"
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        onConfirm={() => cancelMut.mutate()}
        title="إلغاء أمر الشراء"
        message={`هل تريد إلغاء أمر الشراء "${item?.subject || ""}"؟`}
        confirmText="إلغاء"
        cancelText="تراجع"
        variant="destructive"
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={() => deleteMut.mutate()}
        title="حذف أمر الشراء"
        message={`هل تريد حذف أمر الشراء "${item?.subject || ""}" نهائيًا؟ لا يمكن حذف الأوامر التي تم استلامها.`}
        confirmText="حذف"
        cancelText="تراجع"
        variant="destructive"
      />
    </AppShell>
  );
}

// Local helpers -------------------------------------------------------------

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
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
