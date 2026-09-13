import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast, ConfirmDialog } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Send, CheckCircle, Lock, Trash2, Pencil } from "lucide-react";
import { useAuth } from "@/lib/api/auth";
import {
  getStocktake,
  submitStocktake,
  approveStocktake,
  closeStocktake,
  deleteStocktake,
} from "@/lib/api/stocktake";
import { getWarehouses } from "@/lib/api/warehouses";
import { getInventoryItems } from "@/lib/api/inventory-items";
import { StocktakeStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/inventory/stocktake_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الجرد — ثواب" }] }),
  component: StocktakeDetailPage,
});

type WorkflowAction = "submit" | "approve" | "close" | "delete";

function StocktakeDetailPage() {
  const { id } = useParams({ from: "/inventory/stocktake_/$id" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [confirm, setConfirm] = useState<WorkflowAction | null>(null);

  const q = useQuery({ queryKey: ["stocktakeDetail", id], queryFn: () => getStocktake(id) });
  const d = q.data;

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses-all"],
    queryFn: () => getWarehouses({}),
  });
  const { data: itemsData } = useQuery({
    queryKey: ["inventoryItems-all"],
    queryFn: () => getInventoryItems({}),
  });
  const warehouses = warehousesData?.items || [];
  const inventoryItems = itemsData?.items || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stocktakeDetail", id] });
    qc.invalidateQueries({ queryKey: ["stocktakes"] });
  };

  const submitMutation = useMutation({
    mutationFn: submitStocktake,
    onSuccess: () => {
      invalidate();
      showToast("تم إرسال الجرد للاعتماد", "success");
      setConfirm(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const approveMutation = useMutation({
    mutationFn: approveStocktake,
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["inventoryItems"] });
      showToast("تم اعتماد الجرد وإنشاء التسويات تلقائياً", "success");
      setConfirm(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const closeMutation = useMutation({
    mutationFn: closeStocktake,
    onSuccess: () => {
      invalidate();
      showToast("تم إغلاق الجرد", "success");
      setConfirm(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteStocktake,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stocktakes"] });
      showToast("تم حذف الجرد", "success");
      setConfirm(null);
      nav({ to: "/inventory/stocktake" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const back = () => nav({ to: "/inventory/stocktake" });
  const st = d?.item.status;
  const warehouseName =
    warehouses.find((w) => w.id === d?.item.warehouseId)?.name || "كل المستودعات";

  const buildDoc = (): DocumentDefinition => {
    const v = d!.item;
    const meta: DocMeta[] = [
      { label: "الحالة", value: label("stocktakeStatus", v.status) },
      { label: "المستودع", value: warehouseName },
      { label: "اعتمد بواسطة", value: v.approvedBy || "—" },
    ];
    const totalDiff = d!.lines.reduce((sum, l) => sum + (l.difference || 0), 0);
    return {
      title: "عملية جرد",
      number: v.name,
      date: v.date,
      orientation: "portrait",
      meta,
      columns: [
        { key: "item", label: "الصنف", width: "40%" },
        { key: "system", label: "بالنظام", type: "number" },
        { key: "counted", label: "معدود", type: "number" },
        { key: "difference", label: "الفرق", type: "number" },
      ],
      rows: d!.lines.map((l) => ({
        item: inventoryItems.find((it) => it.id === l.itemId)?.name || l.itemId,
        system: l.systemQuantity,
        counted: l.countedQuantity,
        difference: l.difference,
      })),
      totals: [{ label: "صافي الفرق", value: totalDiff, type: "number", strong: true }],
      notes: v.notes || undefined,
      signature: true,
      fileBase: `stocktake-${v.name}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `جرد ${d?.item?.name || ""}`;
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
      showToast("تم نسخ رابط الجرد", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  const runAction = (action: WorkflowAction) => {
    const opts = { id, userId: user?.id, userName: user?.name };
    if (action === "submit") submitMutation.mutate(opts);
    else if (action === "approve") approveMutation.mutate(opts);
    else if (action === "close") closeMutation.mutate(opts);
    else if (action === "delete") deleteMutation.mutate(opts);
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المخزون", "الجرد", d?.item?.name || "جرد"]}
      title={`جرد: ${d?.item?.name || ""}`}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          <Btn variant="ghost" onClick={share}>
            <Share2 size={15} /> مشاركة
          </Btn>
          <Btn variant="ghost" onClick={back}>
            <ArrowRight size={15} /> رجوع
          </Btn>
        </>
      }
    >
      {q.isLoading ? (
        <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : !d ? (
        <div className="p-8 text-center text-destructive">تعذّر جلب الجرد</div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-base">{d.item.name}</div>
              <Badge tone={statusTone(d.item.status)}>
                {label("stocktakeStatus", d.item.status)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <KV label="التاريخ" value={d.item.date} />
              <KV label="المستودع" value={warehouseName} />
              <KV label="اعتمد بواسطة" value={d.item.approvedBy || "—"} />
            </div>
            {d.item.notes ? (
              <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">{d.item.notes}</div>
            ) : null}
          </Card>

          <Card className="p-4">
            <div className="text-xs font-bold mb-2">سطور الجرد</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead className="text-muted-foreground text-right">
                  <tr>
                    <th className="py-1 pe-2">الصنف</th>
                    <th className="py-1 pe-2 text-left">بالنظام</th>
                    <th className="py-1 pe-2 text-left">معدود</th>
                    <th className="py-1 pe-2 text-left">الفرق</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 pe-2">
                        {inventoryItems.find((it) => it.id === l.itemId)?.name || l.itemId}
                        {l.notes ? (
                          <div className="text-muted-foreground text-[11px]">{l.notes}</div>
                        ) : null}
                      </td>
                      <td className="py-1 pe-2 text-left tabular-nums">
                        {fmtSAR(l.systemQuantity)}
                      </td>
                      <td className="py-1 pe-2 text-left tabular-nums">
                        {fmtSAR(l.countedQuantity)}
                      </td>
                      <td
                        className={`py-1 pe-2 text-left tabular-nums font-bold ${
                          l.difference > 0
                            ? "text-success"
                            : l.difference < 0
                              ? "text-destructive"
                              : "text-muted-foreground"
                        }`}
                      >
                        {l.difference > 0 ? "+" : ""}
                        {fmtSAR(l.difference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-3 flex flex-wrap gap-1.5">
            {st === StocktakeStatus.DRAFT && (
              <Btn
                variant="outline"
                onClick={() => nav({ to: "/inventory/stocktake/$id/edit", params: { id } as any })}
              >
                <Pencil size={14} /> تعديل
              </Btn>
            )}
            {st === StocktakeStatus.DRAFT && (
              <Btn variant="primary" onClick={() => setConfirm("submit")}>
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {st === StocktakeStatus.COUNTING && (
              <Btn variant="primary" onClick={() => setConfirm("approve")}>
                <CheckCircle size={14} /> اعتماد
              </Btn>
            )}
            {st === StocktakeStatus.COMPLETED && (
              <Btn variant="outline" onClick={() => setConfirm("close")}>
                <Lock size={14} /> إغلاق
              </Btn>
            )}
            {st === StocktakeStatus.DRAFT && (
              <Btn variant="outline" onClick={() => setConfirm("delete")}>
                <Trash2 size={14} /> حذف
              </Btn>
            )}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirm === "submit"}
        onClose={() => setConfirm(null)}
        onConfirm={() => runAction("submit")}
        title="إرسال للاعتماد"
        message={`هل تريد إرسال الجرد "${d?.item?.name || ""}" للاعتماد؟`}
        confirmText="إرسال"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={confirm === "approve"}
        onClose={() => setConfirm(null)}
        onConfirm={() => runAction("approve")}
        title="اعتماد الجرد"
        message={`هل تريد اعتماد الجرد "${d?.item?.name || ""}"؟ سيتم إنشاء تسويات تلقائية للأصناف التي بها فروق وتحديث المخزون.`}
        confirmText="اعتماد"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={confirm === "close"}
        onClose={() => setConfirm(null)}
        onConfirm={() => runAction("close")}
        title="إغلاق الجرد"
        message={`هل تريد إغلاق الجرد "${d?.item?.name || ""}"؟`}
        confirmText="إغلاق"
        cancelText="إلغاء"
      />

      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={() => runAction("delete")}
        title="تأكيد الحذف"
        message={`هل تريد حذف الجرد "${d?.item?.name || ""}"؟ يمكن حذف المسودات فقط.`}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
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
