import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fmtSAR } from "@/data/sample";
import { getPurchaseOrder } from "@/lib/api/governed-purchase-orders";
import { PO_STATUS } from "./procurement.purchase-orders";

export const Route = createFileRoute("/procurement/purchase-orders_/$id/print")({
  head: () => ({ meta: [{ title: "طباعة أمر شراء — ثواب" }] }),
  component: PrintPage,
});

function actor(history: any[], action: string): string {
  return history?.find((e) => e.action === action)?.userName || "—";
}

function PrintPage() {
  const { id } = useParams({ from: "/procurement/purchase-orders_/$id/print" });
  const q = useQuery({
    queryKey: ["purchase-order", id, "print"],
    queryFn: () => getPurchaseOrder(id),
  });
  const d = q.data;

  useEffect(() => {
    if (d) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [d]);

  if (q.isLoading) return <div className="p-8 text-center">جارٍ التحميل…</div>;
  if (!d) return <div className="p-8 text-center text-red-600">تعذّر جلب أمر الشراء</div>;

  const v = d.item;
  return (
    <div
      dir="rtl"
      className="mx-auto max-w-2xl bg-white text-black p-8 print:p-0"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <style>{`@media print { body { background: #fff; } .no-print { display: none !important; } @page { margin: 16mm; } }`}</style>

      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="rounded border px-4 py-1.5 text-sm">
          طباعة
        </button>
      </div>

      <div className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <div className="text-2xl font-extrabold">أمر شراء</div>
          <div className="text-xs text-gray-600 mt-1">PURCHASE ORDER</div>
          <div className="text-[10px] text-gray-500 mt-1">مستند شرائي — ليس فاتورة ضريبية</div>
        </div>
        <div className="text-left text-sm">
          <div>
            رقم الأمر: <span className="font-mono font-bold">{v.poNumber}</span>
          </div>
          <div>
            التاريخ: <span className="tabular-nums">{v.date}</span>
          </div>
          <div>
            التسليم المتوقع: <span className="tabular-nums">{v.deliveryDate || "—"}</span>
          </div>
          <div className="mt-1 inline-block rounded border px-2 py-0.5 text-xs">
            {PO_STATUS[v.status]?.label || v.status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 text-sm">
        <Row label="المورد" value={d.supplier?.name || v.supplierId || "—"} />
        <Row label="الرقم الضريبي للمورد" value={d.supplier?.taxNumber || "—"} />
        <Row label="عنوان المورد" value={d.supplier?.address || "—"} />
        <Row label="مرجع المورد" value={v.supplierReference || "—"} />
        <Row label="العملة" value={v.currency} />
        <Row label="الموضوع" value={v.subject} />
      </div>

      <table className="w-full mt-5 text-sm border border-black border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-1.5 text-right">البند</th>
            <th className="border border-black p-1.5 text-left">كمية</th>
            <th className="border border-black p-1.5 text-left">الوحدة</th>
            <th className="border border-black p-1.5 text-left">سعر</th>
            <th className="border border-black p-1.5 text-left">صافي</th>
            <th className="border border-black p-1.5 text-left">ضريبة</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.id}>
              <td className="border border-black p-1.5">{l.description || "—"}</td>
              <td className="border border-black p-1.5 text-left tabular-nums">{l.quantity}</td>
              <td className="border border-black p-1.5 text-left">{l.unit || "—"}</td>
              <td className="border border-black p-1.5 text-left tabular-nums">
                {fmtSAR(l.unitPrice)}
              </td>
              <td className="border border-black p-1.5 text-left tabular-nums">
                {fmtSAR(l.lineSubtotal)}
              </td>
              <td className="border border-black p-1.5 text-left tabular-nums">
                {fmtSAR(l.taxAmount)}
              </td>
            </tr>
          ))}
          <tr className="font-bold bg-gray-50">
            <td className="border border-black p-1.5 text-left" colSpan={4}>
              الصافي
            </td>
            <td className="border border-black p-1.5 text-left tabular-nums" colSpan={2}>
              {fmtSAR(v.subtotal)}
            </td>
          </tr>
          <tr className="font-bold bg-gray-50">
            <td className="border border-black p-1.5 text-left" colSpan={4}>
              الضريبة (قيمة تعاقدية)
            </td>
            <td className="border border-black p-1.5 text-left tabular-nums" colSpan={2}>
              {fmtSAR(v.taxAmount)}
            </td>
          </tr>
          <tr className="font-bold bg-gray-100">
            <td className="border border-black p-1.5 text-left" colSpan={4}>
              إجمالي قيمة الالتزام
            </td>
            <td className="border border-black p-1.5 text-left tabular-nums" colSpan={2}>
              {fmtSAR(v.totalAmount)}
            </td>
          </tr>
        </tbody>
      </table>

      {v.notes ? (
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-600 mb-1">الشروط / ملاحظات</div>
          <div className="rounded border p-2 text-sm min-h-[2.5rem]">{v.notes}</div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 mt-10 text-center text-xs">
        <Sign label="أعدّه" name={actor(d.history, "create")} />
        <Sign label="اعتمده" name={actor(d.history, "approve")} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
function Sign({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <div className="text-gray-500 mb-8">{label}</div>
      <div className="border-t border-black pt-1">{name}</div>
    </div>
  );
}
