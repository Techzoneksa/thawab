import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fmtSAR } from "@/data/sample";
import { getSalesInvoice } from "@/lib/api/sales-invoices";
import { SV_STATUS } from "./finance.sales-invoices";

export const Route = createFileRoute("/finance/sales-invoices_/$id/print")({
  head: () => ({ meta: [{ title: "طباعة فاتورة مبيعات — ثواب" }] }),
  component: PrintPage,
});

function actor(history: any[], action: string): string {
  return history?.find((e) => e.action === action)?.userName || "—";
}

function PrintPage() {
  const { id } = useParams({ from: "/finance/sales-invoices_/$id/print" });
  const q = useQuery({
    queryKey: ["sales-invoice", id, "print"],
    queryFn: () => getSalesInvoice(id),
  });
  const d = q.data;

  useEffect(() => {
    if (d) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [d]);

  if (q.isLoading) return <div className="p-8 text-center">جارٍ التحميل…</div>;
  if (!d) return <div className="p-8 text-center text-red-600">تعذّر جلب فاتورة المبيعات</div>;

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
          <div className="text-2xl font-extrabold">فاتورة مبيعات</div>
          <div className="text-xs text-gray-600 mt-1">SALES INVOICE</div>
        </div>
        <div className="text-left text-sm">
          <div>
            رقم الفاتورة: <span className="font-mono font-bold">{v.invoiceNumber}</span>
          </div>
          <div>
            التاريخ: <span className="tabular-nums">{v.invoiceDate}</span>
          </div>
          <div className="mt-1 inline-block rounded border px-2 py-0.5 text-xs">
            {SV_STATUS[v.status]?.label || v.status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 text-sm">
        <Row label="العميل" value={d.customer?.name || v.customerId} />
        <Row label="مرجع العميل" value={v.customerReference || "—"} />
        <Row label="تاريخ الاستحقاق" value={v.dueDate || "—"} />
        <Row label="العملة" value={v.currency} />
        <Row label="القيد المحاسبي" value={d.journal?.number || "—"} />
      </div>

      {v.description ? (
        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-600 mb-1">البيان</div>
          <div className="rounded border p-2 text-sm min-h-[2.5rem]">{v.description}</div>
        </div>
      ) : null}

      <table className="w-full mt-5 text-sm border border-black border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-1.5 text-right">الحساب / البند</th>
            <th className="border border-black p-1.5 text-left">كمية</th>
            <th className="border border-black p-1.5 text-left">سعر</th>
            <th className="border border-black p-1.5 text-left">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.id}>
              <td className="border border-black p-1.5 text-xs">
                <span className="font-mono">{l.accountId}</span>
                {l.description ? <div>{l.description}</div> : null}
              </td>
              <td className="border border-black p-1.5 text-left tabular-nums">{l.quantity}</td>
              <td className="border border-black p-1.5 text-left tabular-nums">
                {fmtSAR(l.unitPrice)}
              </td>
              <td className="border border-black p-1.5 text-left tabular-nums">
                {fmtSAR(l.lineTotal)}
              </td>
            </tr>
          ))}
          <tr className="font-bold bg-gray-100">
            <td className="border border-black p-1.5 text-left" colSpan={3}>
              الإجمالي المستحق على العميل
            </td>
            <td className="border border-black p-1.5 text-left tabular-nums">
              {fmtSAR(v.totalAmount)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-3 gap-4 mt-10 text-center text-xs">
        <Sign label="أعدّها" name={actor(d.history, "create")} />
        <Sign label="اعتمدها" name={actor(d.history, "approve")} />
        <Sign label="رحّلها" name={actor(d.history, "post")} />
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
