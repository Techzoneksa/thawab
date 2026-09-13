import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/api/auth";
import {
  getInventoryItem,
  receiveInventoryItem,
  issueInventoryItem,
  adjustInventoryItem,
  transferInventoryItem,
} from "@/lib/api/inventory-items";
import { getWarehouses } from "@/lib/api/warehouses";

export const Route = createFileRoute("/inventory/items_/$id_/move")({
  head: () => ({ meta: [{ title: "حركة مخزون — ثواب" }] }),
  component: MoveItemPage,
});

interface MoveDraft {
  type: "receive" | "issue" | "adjust" | "transfer";
  quantity: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  notes: string;
}

function MoveItemPage() {
  const { id } = useParams({ from: "/inventory/items_/$id_/move" });
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["inventoryItemDetail", id],
    queryFn: () => getInventoryItem(id),
  });

  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses-all"],
    queryFn: () => getWarehouses({}),
  });
  const warehouses = warehousesData?.items || [];

  const item = q.data?.item;

  const [moveDraft, setMoveDraft] = useState<MoveDraft>({
    type: "receive",
    quantity: "",
    fromWarehouseId: "",
    toWarehouseId: "",
    notes: "",
  });
  const [seeded, setSeeded] = useState(false);

  if (item && !seeded) {
    setSeeded(true);
    setMoveDraft((p) => ({ ...p, fromWarehouseId: item.warehouseId || "" }));
  }

  const back = () => nav({ to: "/inventory/items/$id", params: { id } as any });

  const onSuccess = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ["inventoryItems"] });
    queryClient.invalidateQueries({ queryKey: ["inventoryItemDetail"] });
    showToast(message, "success");
    back();
  };

  const receiveMutation = useMutation({
    mutationFn: receiveInventoryItem,
    onSuccess: () => onSuccess("تم استلام الصنف وتحديث المخزون"),
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const issueMutation = useMutation({
    mutationFn: issueInventoryItem,
    onSuccess: () => onSuccess("تم صرف الصنف وتحديث المخزون"),
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const adjustMutation = useMutation({
    mutationFn: adjustInventoryItem,
    onSuccess: () => onSuccess("تم تسوية الصنف"),
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const transferMutation = useMutation({
    mutationFn: transferInventoryItem,
    onSuccess: () => onSuccess("تم تحويل الصنف بين المستودعات"),
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const loading =
    receiveMutation.isPending ||
    issueMutation.isPending ||
    adjustMutation.isPending ||
    transferMutation.isPending;

  const handleMove = () => {
    if (!item) return;
    const qty = parseFloat(moveDraft.quantity) || 0;
    if (qty <= 0) return showToast("يرجى إدخال كمية صحيحة", "error");

    const base = {
      id: item.id,
      quantity: qty,
      notes: moveDraft.notes,
      userId: user?.id,
      userName: user?.name,
    };

    if (moveDraft.type === "receive") {
      receiveMutation.mutate({ ...base, warehouseId: item.warehouseId || undefined });
    } else if (moveDraft.type === "issue") {
      issueMutation.mutate({ ...base, warehouseId: item.warehouseId || undefined });
    } else if (moveDraft.type === "adjust") {
      adjustMutation.mutate({ ...base, warehouseId: item.warehouseId || undefined });
    } else if (moveDraft.type === "transfer") {
      if (!moveDraft.fromWarehouseId || !moveDraft.toWarehouseId) {
        return showToast("يرجى تحديد المستودع المصدر والهدف", "error");
      }
      transferMutation.mutate({
        ...base,
        fromWarehouseId: moveDraft.fromWarehouseId,
        toWarehouseId: moveDraft.toWarehouseId,
      });
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المخزون", "الأصناف", item?.name || "صنف", "حركة مخزون"]}
      title={`${item?.name || "الصنف"} — حركة مخزون`}
      actions={
        <Btn variant="ghost" onClick={back}>
          <ArrowRight size={15} /> رجوع
        </Btn>
      }
    >
      {q.isLoading ? (
        <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : !item ? (
        <EmptyState title="تعذّر جلب بيانات الصنف" description="حدث خطأ أثناء جلب بيانات الصنف" />
      ) : (
        <div className="mx-auto max-w-2xl space-y-4 pb-6">
          <Card className="p-4 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {(["receive", "issue", "adjust", "transfer"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`rounded-lg border p-2 text-xs font-bold transition-colors ${
                    moveDraft.type === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted"
                  }`}
                  onClick={() => setMoveDraft({ ...moveDraft, type: t })}
                >
                  {t === "receive"
                    ? "استلام"
                    : t === "issue"
                      ? "صرف"
                      : t === "adjust"
                        ? "تسوية"
                        : "تحويل"}
                </button>
              ))}
            </div>
            <Card className="p-3 bg-info/10 text-sm">
              <div className="font-bold text-info mb-1">
                {moveDraft.type === "receive"
                  ? "📥 استلام"
                  : moveDraft.type === "issue"
                    ? "📤 صرف"
                    : moveDraft.type === "adjust"
                      ? "⚖ تسوية"
                      : "🔄 تحويل"}
              </div>
              <div className="text-xs">
                الرصيد الحالي: {fmtSAR(item.quantity)} {item.unit}
                {moveDraft.type === "issue" && item.quantity === 0 && (
                  <div className="text-destructive font-bold mt-1">
                    ⚠ لا يمكن الصرف — الرصيد صفر
                  </div>
                )}
              </div>
            </Card>
            {moveDraft.type === "transfer" ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    من المستودع *
                  </label>
                  <select
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={moveDraft.fromWarehouseId}
                    onChange={(e) =>
                      setMoveDraft({ ...moveDraft, fromWarehouseId: e.target.value })
                    }
                  >
                    <option value="">— اختر —</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    إلى المستودع *
                  </label>
                  <select
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={moveDraft.toWarehouseId}
                    onChange={(e) => setMoveDraft({ ...moveDraft, toWarehouseId: e.target.value })}
                  >
                    <option value="">— اختر —</option>
                    {warehouses
                      .filter((w) => w.id !== moveDraft.fromWarehouseId)
                      .map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                  </select>
                </div>
              </>
            ) : null}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {moveDraft.type === "adjust" ? "الرصيد الجديد *" : "الكمية *"}
              </label>
              <input
                type="number"
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                value={moveDraft.quantity}
                onChange={(e) => setMoveDraft({ ...moveDraft, quantity: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
              <textarea
                className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                rows={2}
                value={moveDraft.notes}
                onChange={(e) => setMoveDraft({ ...moveDraft, notes: e.target.value })}
              />
            </div>
          </Card>

          <Card className="p-3 flex items-center justify-end gap-2">
            <Btn variant="ghost" onClick={back} disabled={loading}>
              إلغاء
            </Btn>
            <Btn variant="primary" onClick={handleMove} disabled={loading}>
              {loading ? "جارٍ التنفيذ…" : "تنفيذ الحركة"}
            </Btn>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
