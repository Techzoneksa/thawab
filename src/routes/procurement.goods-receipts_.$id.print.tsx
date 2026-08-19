import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fmtSAR } from "@/data/sample";
import { getGoodsReceipt } from "@/lib/api/goods-receipts";
import { GRN_STATUS } from "./procurement.goods-receipts";

export const Route = createFileRoute("/procurement/goods-receipts_/$id/print")({
  head: () => ({ meta: [{ title: "طباعة سند استلام — ثواب" }] }),
  component: PrintPage,
});

function actor(history: any[], action: string): string {
  return history?.find((e) => e.action === action)?.userName || "—";
}

function PrintPage() {
  const { id } = useParams({ from: "/procurement/goods-receipts_/$id/print" });
  const q = useQuery({
    queryKey: ["goods-receipt", id, "print"],
    queryFn: () => getGoodsReceipt(id),
  });
  const d = q.data;

  useEffect(() => {
    if (d) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [d]);

  if (q.isLoading) return <div className="p-8 text-center">جارٍ التحميل…</div>;
  if (!d) return <div className="p-8 text-center text-red-600">تعذّر جلب سند الاستلام</div>;

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
          <div className="text-2xl font-extrabold">سند استلام بضاعة</div>
          <div className="text-xs text-gray-600 mt-1">GOODS RECEIPT NOTE</div>
          <div className="text-[10px] text-gray-500 mt-1">مستند استلام — ليس فاتورة ضريبية</div>
        </div>
        <div className="text-left text-sm">
          <div>
            رقم السند: <span className="font-mono font-bold">{v.grnNumber}</span>
          </div>
          <div>
            التاريخ: <span className="tabular-nums">{v.receiptDate}</span>
          </div>
          <div className="mt-1 inline-block rounded border px-2 py-0.5 text-xs">
            {GRN_STATUS[v.status]?.label || v.status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 text-sm">
        <Row label="أمر الشراء" value={d.po?.poNumber || v.purchaseOrderId} />
        <Row label="المورد" value={d.supplier?.name || "—"} />
        <Row label="العملة" value={v.currency} />
        <Row label="القيد المحاسبي" value={v.journalEntryId || "—"} />
      </div>

      <table className="w-full mt-5 text-sm border border-black border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-1.5 text-right">البند</th>
            <th className="border border-black p-1.5 text-left">النوع</th>
            <th className="border border-black p-1.5 text-left">كمية</th>
            <th className="border border-black p-1.5 text-left">سعر</th>
            <th className="border border-black p-1.5 text-left">القيمة</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.id}>
              <td className="border border-black p-1.5">{l.description || "—"}</td>
              <td className="border border-black p-1.5 text-left">{l.lineType}</td>
              <td className="border border-black p-1.5 text-left tabular-nums">
                {l.quantityReceived}
              </td>
              <td className="border border-black p-1.5 text-left tabular-nums">
                {fmtSAR(l.unitPrice)}
              </td>
              <td className="border border-black p-1.5 text-left tabular-nums">
                {fmtSAR(l.lineValue)}
              </td>
            </tr>
          ))}
          <tr className="font-bold bg-gray-100">
            <td className="border border-black p-1.5 text-left" colSpan={4}>
              إجمالي القيمة (GRNI)
            </td>
            <td className="border border-black p-1.5 text-left tabular-nums">
              {fmtSAR(v.totalValue)}
            </td>
          </tr>
        </tbody>
      </table>

      {v.notes ? (
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-600 mb-1">ملاحظات</div>
          <div className="rounded border p-2 text-sm min-h-[2.5rem]">{v.notes}</div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 mt-10 text-center text-xs">
        <Sign label="المستلِم" name={actor(d.history, "post")} />
        <Sign label="المخزن / المستودع" name="—" />
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
