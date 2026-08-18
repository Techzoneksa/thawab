import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fmtSAR } from "@/data/sample";
import { getPaymentVoucher } from "@/lib/api/payment-vouchers";
import { PV_STATUS } from "./finance.payment-vouchers";

export const Route = createFileRoute("/finance/payment-vouchers_/$id/print")({
  head: () => ({ meta: [{ title: "طباعة سند صرف — ثواب" }] }),
  component: PrintPage,
});

function actor(history: any[], action: string): string {
  return history?.find((e) => e.action === action)?.userName || "—";
}

function PrintPage() {
  const { id } = useParams({ from: "/finance/payment-vouchers_/$id/print" });
  const q = useQuery({
    queryKey: ["payment-voucher", id, "print"],
    queryFn: () => getPaymentVoucher(id),
  });
  const d = q.data;

  useEffect(() => {
    if (d) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [d]);

  if (q.isLoading) return <div className="p-8 text-center">جارٍ التحميل…</div>;
  if (!d) return <div className="p-8 text-center text-red-600">تعذّر جلب سند الصرف</div>;

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
          <div className="text-2xl font-extrabold">سند صرف</div>
          <div className="text-xs text-gray-600 mt-1">PAYMENT VOUCHER</div>
        </div>
        <div className="text-left text-sm">
          <div>
            رقم السند: <span className="font-mono font-bold">{v.voucherNumber}</span>
          </div>
          <div>
            التاريخ: <span className="tabular-nums">{v.voucherDate}</span>
          </div>
          <div className="mt-1 inline-block rounded border px-2 py-0.5 text-xs">
            {PV_STATUS[v.status]?.label || v.status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 text-sm">
        <Row label="يُصرف إلى" value={v.payeeName || "—"} />
        <Row label="طريقة الصرف" value={v.cashboxId ? "صندوق نقدي" : "حساب بنكي"} />
        <Row label="المصدر" value={d.source ? d.source.code : "—"} />
        <Row label="العملة" value={v.currency} />
        <Row label="المرجع الخارجي" value={v.externalReference || "—"} />
        <Row label="القيد المحاسبي" value={d.journal?.number || "—"} />
      </div>

      <div className="mt-4">
        <div className="text-xs font-semibold text-gray-600 mb-1">وذلك عن</div>
        <div className="rounded border p-2 text-sm min-h-[2.5rem]">{v.description || "—"}</div>
      </div>

      <table className="w-full mt-5 text-sm border border-black border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-1.5 text-right">الحساب (الطرف المدين)</th>
            <th className="border border-black p-1.5 text-right">البيان</th>
            <th className="border border-black p-1.5 text-left">المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.id}>
              <td className="border border-black p-1.5 font-mono text-xs">{l.accountId}</td>
              <td className="border border-black p-1.5">{l.description || "—"}</td>
              <td className="border border-black p-1.5 text-left tabular-nums">
                {fmtSAR(l.amount)}
              </td>
            </tr>
          ))}
          <tr className="font-bold bg-gray-50">
            <td className="border border-black p-1.5" colSpan={2}>
              الإجمالي المصروف
            </td>
            <td className="border border-black p-1.5 text-left tabular-nums">
              {fmtSAR(v.totalAmount)}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-3 gap-4 mt-10 text-center text-xs">
        <Sign label="أعدّه" name={actor(d.history, "create")} />
        <Sign label="اعتمده" name={actor(d.history, "approve")} />
        <Sign label="رحّله" name={actor(d.history, "post")} />
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
