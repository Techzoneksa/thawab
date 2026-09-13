import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Pencil } from "lucide-react";
import { getWarehouse } from "@/lib/api/warehouses";
import { label } from "@/lib/i18n/labels";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/inventory/warehouses_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل المستودع — ثواب" }] }),
  component: WarehouseDetailPage,
});

function WarehouseDetailPage() {
  const { id } = useParams({ from: "/inventory/warehouses_/$id" });
  const nav = useNavigate();

  const q = useQuery({
    queryKey: ["warehouseDetail", id],
    queryFn: () => getWarehouse(id),
  });
  const d = q.data;
  const back = () => nav({ to: "/inventory/warehouses" });

  const occupancyPct =
    d && d.item.capacity > 0 ? Math.round((d.totalQty / d.item.capacity) * 100) : 0;

  const buildDoc = (): DocumentDefinition => {
    const it = d!.item;
    return {
      title: "بطاقة مستودع",
      subtitle: it.name,
      date: new Date().toISOString().slice(0, 10),
      entity: {
        name: it.name,
        lines: [
          it.location ? `الموقع: ${it.location}` : "",
          it.manager ? `المسؤول: ${it.manager}` : "",
          `الحالة: ${label("warehouseStatus", it.status)}`,
        ].filter(Boolean),
      },
      meta: [
        { label: "السعة", value: fmtSAR(it.capacity) },
        { label: "عدد الأصناف", value: fmtSAR(d!.itemCount) },
        { label: "إجمالي الحركات", value: fmtSAR(d!.movementCount) },
        { label: "إجمالي الكمية", value: fmtSAR(d!.totalQty) },
        { label: "نسبة الإشغال", value: `${occupancyPct}%` },
      ],
      columns: [
        { key: "metric", label: "المؤشر" },
        { key: "value", label: "القيمة", type: "number", align: "end" },
      ],
      rows: [
        { metric: "السعة", value: it.capacity || 0 },
        { metric: "عدد الأصناف", value: d!.itemCount },
        { metric: "إجمالي الحركات", value: d!.movementCount },
        { metric: "إجمالي الكمية", value: d!.totalQty },
      ],
      notes: it.notes || undefined,
      signature: true,
      fileBase: `warehouse-${it.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `المستودع ${d?.item?.name || ""}`;
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
      showToast("تم نسخ رابط المستودع", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المخزون", "المستودعات", d?.item?.name || "مستودع"]}
      title={d?.item?.name || "المستودع"}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          {d && (
            <Btn
              variant="ghost"
              onClick={() => nav({ to: "/inventory/warehouses/$id/edit", params: { id } as any })}
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
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات المستودع</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-base">{d.item.name}</div>
              <Badge tone={statusTone(d.item.status)}>
                {label("warehouseStatus", d.item.status)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <KV label="الموقع" value={d.item.location || "—"} />
              <KV label="المسؤول" value={d.item.manager || "—"} />
              <KV label="السعة" value={fmtSAR(d.item.capacity)} />
              <KV label="الإشغال الحالي" value={fmtSAR(d.item.occupancy)} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              إحصائيات المستودع
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <KV label="عدد الأصناف" value={fmtSAR(d.itemCount)} />
              <KV label="إجمالي الحركات" value={fmtSAR(d.movementCount)} />
              <KV label="إجمالي الكمية" value={fmtSAR(d.totalQty)} />
              <KV label="نسبة الإشغال" value={`${occupancyPct}%`} />
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

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
