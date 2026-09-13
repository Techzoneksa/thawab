import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Pencil, ArrowRightLeft } from "lucide-react";
import { getInventoryItem } from "@/lib/api/inventory-items";
import { getWarehouses } from "@/lib/api/warehouses";
import { InventoryItemStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/inventory/items_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الصنف — ثواب" }] }),
  component: ItemDetailPage,
});

function ItemDetailPage() {
  const { id } = useParams({ from: "/inventory/items_/$id" });
  const nav = useNavigate();

  const q = useQuery({
    queryKey: ["inventoryItemDetail", id],
    queryFn: () => getInventoryItem(id),
  });
  const { data: warehousesData } = useQuery({
    queryKey: ["warehouses-all"],
    queryFn: () => getWarehouses({}),
  });
  const warehouses = warehousesData?.items || [];
  const d = q.data;
  const back = () => nav({ to: "/inventory/items" });

  const buildDoc = (): DocumentDefinition => {
    const it = d!.item;
    const today = new Date().toISOString().slice(0, 10);
    const warehouseName = warehouses.find((w) => w.id === it.warehouseId)?.name || "—";
    return {
      title: "بطاقة صنف",
      subtitle: it.name,
      date: today,
      orientation: "landscape",
      entity: {
        name: it.name,
        lines: [
          it.sku ? `SKU: ${it.sku}` : "",
          it.category ? `الفئة: ${it.category}` : "",
          `المستودع: ${warehouseName}`,
        ].filter(Boolean),
      },
      meta: [
        { label: "الحالة", value: label("inventoryItemStatus", it.status) },
        { label: "حركات المخزون", value: fmtSAR(d!.movementCount) },
        { label: "سطور أوامر شراء", value: fmtSAR(d!.poLineCount) },
      ],
      columns: [
        { key: "unit", label: "الوحدة" },
        { key: "quantity", label: "الكمية", type: "number" },
        { key: "minQuantity", label: "الحد الأدنى", type: "number" },
        { key: "price", label: "السعر", type: "money" },
        { key: "value", label: "قيمة المخزون", type: "money" },
      ],
      rows: [
        {
          unit: it.unit,
          quantity: it.quantity,
          minQuantity: it.minQuantity,
          price: it.price,
          value: (it.quantity || 0) * (it.price || 0),
        },
      ],
      totals: [
        {
          label: "قيمة المخزون",
          value: (it.quantity || 0) * (it.price || 0),
          type: "money",
          strong: true,
        },
      ],
      signature: true,
      fileBase: `inventory-item-${it.sku || it.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `الصنف ${d?.item?.name || ""}`;
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
      showToast("تم نسخ رابط الصنف", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المخزون", "الأصناف", d?.item?.name || "صنف"]}
      title={d?.item?.name || "الصنف"}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          {d && (
            <Btn
              variant="ghost"
              onClick={() => nav({ to: "/inventory/items/$id/move", params: { id } as any })}
            >
              <ArrowRightLeft size={15} /> حركة مخزون
            </Btn>
          )}
          {d && (
            <Btn
              variant="ghost"
              onClick={() => nav({ to: "/inventory/items/$id/edit", params: { id } as any })}
            >
              <Pencil size={15} /> تعديل
            </Btn>
          )}
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
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات الصنف</div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-base">{d.item.name}</div>
              <Badge tone={statusTone(d.item.status)}>
                {label("inventoryItemStatus", d.item.status)}
              </Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <KV
                label="الكمية"
                value={`${fmtSAR(d.item.quantity)} ${d.item.unit}`}
                tone={stockTone(d.item.quantity, d.item.minQuantity)}
              />
              <KV label="الحد الأدنى" value={`${fmtSAR(d.item.minQuantity)} ${d.item.unit}`} />
              <KV
                label="قيمة المخزون"
                value={fmtSAR((d.item.quantity || 0) * (d.item.price || 0))}
              />
            </div>
          </Card>

          <Card className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <KV label="SKU" value={d.item.sku || "—"} />
              <KV label="الفئة" value={d.item.category || "—"} />
              <KV label="الوحدة" value={d.item.unit} />
              <KV label="السعر" value={fmtSAR(d.item.price)} />
              <KV
                label="المستودع"
                value={warehouses.find((w) => w.id === d.item.warehouseId)?.name || "—"}
              />
              <KV label="الحالة" value={label("inventoryItemStatus", d.item.status)} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2">ارتباطات الصنف</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <KV label="حركات المخزون" value={fmtSAR(d.movementCount)} />
              <KV label="سطور أوامر شراء" value={fmtSAR(d.poLineCount)} />
            </div>
          </Card>

          {d.item.notes && (
            <Card className="p-4">
              <div className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</div>
              <div className="text-sm">{d.item.notes}</div>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}

function stockTone(qty: number, min: number): string {
  if (qty === 0) return "text-destructive";
  if (qty <= min) return "text-warning";
  return "";
}

function statusTone(s: string): "success" | "muted" | "destructive" | "warning" {
  if (s === InventoryItemStatus.ACTIVE) return "success";
  if (s === InventoryItemStatus.INACTIVE) return "destructive";
  return "muted";
}

function KV({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${tone || ""}`}>{value}</div>
    </div>
  );
}
