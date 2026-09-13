import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { showToast, EmptyState } from "@/components/erp/actions";
import { ArrowRight } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  getFinanceSupplier,
  createFinanceSupplier,
  updateFinanceSupplier,
} from "@/lib/api/suppliers-finance";

/** Shared full-page supplier form for both create and edit. */
export function SupplierForm({ supplierId }: { supplierId?: string }) {
  const isEdit = !!supplierId;
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canCreate = userCan(user, "finance.supplier.create");
  const canUpdate = userCan(user, "finance.supplier.update");
  const allowed = isEdit ? canUpdate : canCreate;

  const detailQ = useQuery({
    queryKey: ["fin-supplier", supplierId, "edit"],
    queryFn: () => getFinanceSupplier(supplierId!),
    enabled: isEdit,
  });

  const [f, setF] = useState<any>({
    name: "",
    legalName: "",
    vatNumber: "",
    commercialRegistration: "",
    phone: "",
    email: "",
    currency: "SAR",
    paymentTermsDays: "",
    bankName: "",
    iban: "",
    notes: "",
  });
  const [seeded, setSeeded] = useState(false);
  const [ibanMasked, setIbanMasked] = useState<string | null>(null);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  if (isEdit && detailQ.data && !seeded) {
    setSeeded(true);
    const it = detailQ.data.item;
    setIbanMasked(it.ibanMasked);
    setF({
      name: it.name || "",
      legalName: it.legalName || "",
      vatNumber: it.taxNumber || "",
      commercialRegistration: it.commercialRegistration || "",
      phone: it.phone || "",
      email: it.email || "",
      currency: it.currency || "SAR",
      paymentTermsDays: it.paymentTermsDays ?? "",
      bankName: it.bankName || "",
      iban: "",
      notes: it.notes || "",
    });
  }

  const done = () => {
    if (isEdit) nav({ to: "/finance/suppliers/$id", params: { id: supplierId } as any });
    else nav({ to: "/finance/suppliers" });
  };

  const mut = useMutation({
    mutationFn: async () => {
      const body: any = {
        id: supplierId,
        name: f.name,
        legalName: f.legalName,
        vatNumber: f.vatNumber || null,
        commercialRegistration: f.commercialRegistration || null,
        phone: f.phone || null,
        email: f.email || "",
        currency: f.currency,
        paymentTermsDays: f.paymentTermsDays === "" ? null : Number(f.paymentTermsDays),
        bankName: f.bankName || null,
        notes: f.notes,
      };
      if (f.iban) body.iban = f.iban; // only send when entering/replacing
      return isEdit ? updateFinanceSupplier(body) : createFinanceSupplier(body);
    },
    onSuccess: () => {
      showToast(isEdit ? "تم الحفظ" : "تم الإنشاء", "success");
      qc.invalidateQueries({ queryKey: ["fin-suppliers"] });
      qc.invalidateQueries({ queryKey: ["fin-supplier", supplierId] });
      done();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const canSubmit = !!f.name.trim() && !mut.isPending;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "الموردون", isEdit ? "تعديل" : "جديد"]}
      title={isEdit ? "تعديل مورد" : "مورد جديد"}
      actions={
        <Btn variant="ghost" onClick={done}>
          <ArrowRight size={15} /> رجوع
        </Btn>
      }
    >
      {!allowed ? (
        <EmptyState
          title="لا تملك صلاحية"
          description="تواصل مع مسؤول النظام لمنحك الصلاحية اللازمة"
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 pb-6">
          <Card className="p-4 space-y-3">
            <Field label="اسم المورد *">
              <input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field label="الاسم القانوني">
              <input
                className="inp"
                value={f.legalName}
                onChange={(e) => set("legalName", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="الرقم الضريبي (VAT)">
                <input
                  className="inp font-mono"
                  value={f.vatNumber}
                  onChange={(e) => set("vatNumber", e.target.value)}
                />
              </Field>
              <Field label="السجل التجاري">
                <input
                  className="inp"
                  value={f.commercialRegistration}
                  onChange={(e) => set("commercialRegistration", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="الهاتف">
                <input
                  className="inp"
                  value={f.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label="البريد">
                <input
                  className="inp"
                  value={f.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="العملة">
                <input
                  className="inp"
                  value={f.currency}
                  onChange={(e) => set("currency", e.target.value)}
                />
              </Field>
              <Field label="مدة السداد (يوم)">
                <input
                  className="inp"
                  type="number"
                  min="0"
                  value={f.paymentTermsDays}
                  onChange={(e) => set("paymentTermsDays", e.target.value)}
                />
              </Field>
            </div>
            <Field label="اسم البنك">
              <input
                className="inp"
                value={f.bankName}
                onChange={(e) => set("bankName", e.target.value)}
              />
            </Field>
            <Field label={ibanMasked ? `الآيبان (الحالي: ${ibanMasked})` : "الآيبان (IBAN)"}>
              <input
                className="inp font-mono"
                value={f.iban}
                onChange={(e) => set("iban", e.target.value)}
                placeholder={isEdit ? "اترك فارغاً للإبقاء على الحالي" : "SA.."}
              />
            </Field>
            <Field label="ملاحظات">
              <textarea
                className="inp"
                rows={2}
                value={f.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </Card>

          <Card className="p-3 flex items-center justify-end gap-2">
            <Btn variant="ghost" onClick={done} disabled={mut.isPending}>
              إلغاء
            </Btn>
            <Btn variant="primary" onClick={() => mut.mutate()} disabled={!canSubmit}>
              {mut.isPending ? "جارٍ الحفظ…" : isEdit ? "حفظ" : "إنشاء"}
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
