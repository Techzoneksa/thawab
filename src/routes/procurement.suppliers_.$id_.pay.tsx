import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { showToast } from "@/components/erp/actions";
import { getSupplier, paySupplier, type Supplier } from "@/lib/api/suppliers";
import { fmtSAR } from "@/data/sample";

export const Route = createFileRoute("/procurement/suppliers_/$id_/pay")({
  head: () => ({ meta: [{ title: "سداد للمورد — ثواب" }] }),
  component: PaySupplierPage,
});

function PaySupplierPage() {
  const { id } = useParams({ from: "/procurement/suppliers_/$id_/pay" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["supplierDetail", id],
    queryFn: () => getSupplier(id),
  });

  const item: Supplier | undefined = detailQuery.data?.item;

  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "bank">("bank");
  // Stable payment-intent id — generated ONCE on mount, reused for every
  // submit/retry so a double-click/network-retry cannot create two payments.
  const [payIntentId] = useState(() => crypto.randomUUID());
  const [hydrated, setHydrated] = useState(false);

  if (item && !hydrated) {
    setPayAmount(item.balance > 0 ? String(item.balance) : "");
    setHydrated(true);
  }

  const back = () => navigate({ to: "/procurement/suppliers/$id", params: { id } as any });

  const payMut = useMutation({
    mutationFn: () =>
      paySupplier({
        id,
        amount: Number(payAmount) || 0,
        method: payMethod,
        paymentId: payIntentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      queryClient.invalidateQueries({ queryKey: ["supplierDetail", id] });
      queryClient.invalidateQueries({ queryKey: ["supplierAudit", id] });
      showToast("تم تسجيل السداد وترحيله للدفتر", "success");
      back();
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const submit = () => {
    if (!(Number(payAmount) > 0)) {
      showToast("أدخل مبلغاً صحيحاً", "error");
      return;
    }
    payMut.mutate();
  };

  if (detailQuery.isLoading) {
    return (
      <AppShell title="الموردين" breadcrumb={["المشتريات", "الموردين"]}>
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      </AppShell>
    );
  }

  if (!item) {
    return (
      <AppShell title="الموردين" breadcrumb={["المشتريات", "الموردين"]}>
        <div className="text-center py-12 text-muted-foreground">المورد غير موجود</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumb={["المشتريات", "الموردين", item.name, "سداد"]}
      title={`سداد للمورد: ${item.name}`}
      actions={
        <Btn variant="ghost" onClick={back}>
          <ArrowRight size={15} /> رجوع
        </Btn>
      }
    >
      <div className="mx-auto max-w-2xl space-y-4 pb-6">
        <Card className="p-4">
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
            الرصيد المستحق للمورد حالياً:{" "}
            <span className="font-bold">{fmtSAR(item.balance || 0)}</span>
            <br />
            سيُنشأ قيد تلقائي: مدين «ذمم دائنة — موردون» / دائن «النقد أو البنك».
          </div>
          <div className="mt-3">
            <label className="text-xs font-semibold text-muted-foreground">المبلغ</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              dir="ltr"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </div>
          <div className="mt-3">
            <label className="text-xs font-semibold text-muted-foreground">طريقة السداد</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as "cash" | "bank")}
            >
              <option value="bank">تحويل بنكي</option>
              <option value="cash">نقداً</option>
            </select>
          </div>
        </Card>

        <Card className="p-3 flex items-center justify-end gap-2">
          <Btn variant="ghost" onClick={back} disabled={payMut.isPending}>
            إلغاء
          </Btn>
          <Btn variant="primary" onClick={submit} disabled={payMut.isPending}>
            {payMut.isPending ? "جارٍ الحفظ…" : "تسجيل السداد"}
          </Btn>
        </Card>
      </div>
    </AppShell>
  );
}
