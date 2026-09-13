import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { ArrowRight, Share2, Pencil } from "lucide-react";
import { label } from "@/lib/i18n/labels";
import { getSupplier } from "@/lib/api/suppliers";
import type { DocumentDefinition, DocMeta } from "@/lib/documents/types";

export const Route = createFileRoute("/procurement/suppliers_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل المورد — ثواب" }] }),
  component: SupplierDetailPage,
});

function SupplierDetailPage() {
  const { id } = useParams({ from: "/procurement/suppliers_/$id" });
  const nav = useNavigate();

  const q = useQuery({ queryKey: ["supplierDetail", id], queryFn: () => getSupplier(id) });
  const d = q.data;
  const back = () => nav({ to: "/procurement/suppliers" });

  const buildDoc = (): DocumentDefinition => {
    const it = d!.item;
    const meta: DocMeta[] = [
      { label: "الحالة", value: label("supplierStatus", it.status) },
      { label: "النشاط", value: it.activity || "—" },
      { label: "الجوال", value: it.phone || "—" },
      { label: "البريد", value: it.email || "—" },
      { label: "الرقم الضريبي", value: it.taxNumber || "—" },
      { label: "المسؤول", value: it.contactPerson || "—" },
      { label: "العنوان", value: it.address || "—" },
      { label: "الرصيد", value: fmtSAR(it.balance) },
      { label: "أوامر شراء مرتبطة", value: String(d!.orderCount) },
      { label: "أصول مرتبطة", value: String(d!.assetCount) },
    ];
    return {
      title: "بطاقة مورد",
      subtitle: it.name,
      date: new Date().toISOString().slice(0, 10),
      entity: {
        name: it.name,
        lines: [
          it.taxNumber ? `الرقم الضريبي: ${it.taxNumber}` : "",
          it.phone ? `الهاتف: ${it.phone}` : "",
          it.contactPerson ? `المسؤول: ${it.contactPerson}` : "",
        ].filter(Boolean),
      },
      meta,
      columns: [],
      rows: [],
      signature: true,
      fileBase: `supplier-${it.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `المورد ${d?.item?.name || ""}`;
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
      showToast("تم نسخ رابط المورد", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "الموردون", d?.item?.name || "مورد"]}
      title={d?.item?.name || "المورد"}
      actions={
        <>
          {d && <DocumentActions document={buildDoc} />}
          {d && (
            <Btn
              variant="ghost"
              onClick={() => nav({ to: "/procurement/suppliers/$id/edit", params: { id } as any })}
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
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات المورد</div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-base">{d.item.name}</div>
              <Badge tone={statusTone(d.item.status)}>
                {label("supplierStatus", d.item.status)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <KV label="النشاط" value={d.item.activity || "—"} />
              <KV label="الجوال" value={d.item.phone || "—"} />
              <KV label="البريد" value={d.item.email || "—"} />
              <KV label="الرقم الضريبي" value={d.item.taxNumber || "—"} />
              <KV label="المسؤول" value={d.item.contactPerson || "—"} />
            </div>
            {d.item.address && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">العنوان</div>
                <div className="text-sm">{d.item.address}</div>
              </div>
            )}
          </Card>

          <Card className="p-4 bg-primary/10">
            <div className="text-xs font-semibold text-muted-foreground mb-2">ارتباطات المورد</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatBox label="أوامر شراء" value={fmtSAR(d.orderCount)} />
              <StatBox label="أصول مرتبطة" value={fmtSAR(d.assetCount)} />
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
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-bold tabular-nums">{value}</div>
    </div>
  );
}
