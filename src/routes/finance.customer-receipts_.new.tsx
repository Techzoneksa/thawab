import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { Combobox } from "@/components/erp/Combobox";
import { showToast, EmptyState } from "@/components/erp/actions";
import { ArrowRight } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { customerLookup } from "@/lib/api/customers-finance";
import { createCustomerReceipt } from "@/lib/api/ar-allocation";

export const Route = createFileRoute("/finance/customer-receipts_/new")({
  head: () => ({ meta: [{ title: "تسجيل تحصيل من عميل — ثواب" }] }),
  component: NewReceiptPage,
});

function NewReceiptPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canCreate = userCan(user, "finance.customer_receipt.create");

  const [f, setF] = useState<any>({
    customerId: "",
    amount: "",
    method: "bank",
    date: new Date().toISOString().slice(0, 10),
    reference: "",
    note: "",
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const done = () => nav({ to: "/finance/customer-receipts" });

  const mut = useMutation({
    mutationFn: () =>
      createCustomerReceipt({
        customerId: f.customerId,
        amount: Number(f.amount),
        method: f.method,
        date: f.date || null,
        reference: f.reference || null,
        note: f.note || null,
      }),
    onSuccess: (res: any) => {
      showToast("تم تسجيل التحصيل وترحيله", "success");
      qc.invalidateQueries({ queryKey: ["customer-receipts"] });
      qc.invalidateQueries({ queryKey: ["ar-aging"] });
      const id = res?.receipt?.id;
      if (id) nav({ to: "/finance/customer-receipts/$id", params: { id } as any });
      else done();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const valid = f.customerId && Number(f.amount) > 0 && !mut.isPending;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "تحصيل العملاء", "تسجيل تحصيل"]}
      title="تسجيل تحصيل من عميل"
      actions={
        <Btn variant="ghost" onClick={done}>
          <ArrowRight size={15} /> رجوع للقائمة
        </Btn>
      }
    >
      {!canCreate ? (
        <EmptyState
          title="لا تملك صلاحية تسجيل التحصيل"
          description="تواصل مع مسؤول النظام لمنحك صلاحية finance.customer_receipt.create"
        />
      ) : (
        <div className="mx-auto max-w-2xl space-y-4 pb-6">
          <Card className="p-4 space-y-3">
            <Field label="العميل *">
              <Combobox
                value={f.customerId}
                placeholder="ابحث عن عميل بالاسم أو الرمز…"
                search={(q) => customerLookup(q)}
                getId={(s: any) => s.id}
                getLabel={(s: any) =>
                  `${s.customerCode ? `${s.customerCode} — ` : ""}${s.name} (${s.currency})`
                }
                onSelect={(s: any) => set("customerId", s?.id || "")}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="المبلغ *">
                <input
                  className="inp"
                  inputMode="decimal"
                  value={f.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="طريقة التحصيل">
                <select
                  className="inp"
                  value={f.method}
                  onChange={(e) => set("method", e.target.value)}
                >
                  <option value="bank">بنك</option>
                  <option value="cash">نقد</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="التاريخ">
                <input
                  type="date"
                  className="inp"
                  value={f.date}
                  onChange={(e) => set("date", e.target.value)}
                />
              </Field>
              <Field label="المرجع">
                <input
                  className="inp"
                  value={f.reference}
                  onChange={(e) => set("reference", e.target.value)}
                  placeholder="رقم الحوالة / الإيصال…"
                />
              </Field>
            </div>
            <Field label="ملاحظات">
              <textarea
                className="inp"
                rows={2}
                value={f.note}
                onChange={(e) => set("note", e.target.value)}
              />
            </Field>
            <div className="text-[11px] text-muted-foreground">
              الترحيل يُنشئ قيداً: مدين النقد/البنك / دائن الذمم المدينة — ويُنسب الطرف الدائن
              لأستاذ العميل (الرصيد المدين ينخفض). ثم يمكن تخصيصه على فواتير العميل.
            </div>
          </Card>

          <Card className="p-3 flex items-center justify-end gap-2">
            <Btn variant="ghost" onClick={done} disabled={mut.isPending}>
              إلغاء
            </Btn>
            <Btn variant="primary" onClick={() => valid && mut.mutate()} disabled={!valid}>
              {mut.isPending ? "جارٍ الترحيل…" : "ترحيل التحصيل"}
            </Btn>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
