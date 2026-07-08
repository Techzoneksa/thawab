import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { EnterpriseFormLayout, type EnterpriseTab } from "@/components/erp/EnterpriseFormLayout";
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  FormRow,
  FormSection,
  FormSummaryLine,
} from "@/components/erp/FormFields";
import { showToast } from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import { getSuppliers, type Supplier } from "@/lib/api/suppliers";
import { getInventoryItems, type InventoryItem } from "@/lib/api/inventory-items";
import { createPurchaseOrder } from "@/lib/api/purchase-orders";

export const Route = createFileRoute("/procurement/orders/new")({
  head: () => ({ meta: [{ title: "أمر شراء جديد — ثواب" }] }),
  component: NewOrderPage,
});

interface DraftLine {
  key: string;
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  notes: string;
}

function newLine(key: string): DraftLine {
  return { key, itemId: "", description: "", quantity: 0, unitPrice: 0, unit: "", notes: "" };
}

function NewOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const supQuery = useQuery({
    queryKey: ["suppliers-simple"],
    queryFn: () => getSuppliers({ limit: 1000 }),
  });
  const suppliers: Supplier[] = (supQuery.data?.items || []).filter((s) => s.status === "نشط");

  const itemsQuery = useQuery({
    queryKey: ["inventoryItems-simple"],
    queryFn: () => getInventoryItems({ limit: 1000 }),
  });
  const items: InventoryItem[] = (itemsQuery.data?.items || []).filter((i) => i.status === "نشط");

  const [supplierId, setSupplierId] = useState("");
  const [subject, setSubject] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine("l1")]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + (l.quantity || 0) * (l.unitPrice || 0), 0),
    [lines],
  );

  const addLine = () => setLines([...lines, newLine(`l${Date.now()}`)]);
  const removeLine = (key: string) => setLines(lines.filter((l) => l.key !== key));
  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const handleSave = async (andClose: boolean) => {
    const errs: string[] = [];
    if (!supplierId) errs.push("يجب اختيار المورد");
    if (!subject.trim()) errs.push("موضوع أمر الشراء مطلوب");
    const validLines = lines.filter((l) => l.description.trim() && l.quantity > 0);
    if (validLines.length === 0) errs.push("أضف سطرًا واحدًا على الأقل بوصف وكمية");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const created = await createPurchaseOrder({
        supplierId,
        subject: subject.trim(),
        date,
        deliveryDate: deliveryDate || undefined,
        notes: notes || undefined,
        lines: validLines.map((l) => ({
          itemId: l.itemId || undefined,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unit: l.unit || undefined,
          notes: l.notes || undefined,
        })),
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["purchaseOrders"] });
      showToast(`تم إنشاء أمر الشراء`, "success");
      if (andClose) navigate({ to: "/procurement/orders" });
      else navigate({ to: "/procurement/orders/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الأمر",
      content: (
        <FormSection title="بيانات أمر الشراء">
          <FormRow>
            <FormField label="المورد" required error={errors[0]}>
              <FormSelect value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— اختر المورد —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="موضوع أمر الشراء" required error={errors[1]}>
              <FormInput
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="مثال: توريد سلال غذائية لشهر شعبان"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="تاريخ الأمر">
              <FormInput
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
            <FormField label="تاريخ التوريد المتوقع">
              <FormInput
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                dir="ltr"
              />
            </FormField>
          </FormRow>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "lines",
      label: "بنود الأمر",
      badge: lines.length,
      content: (
        <FormSection title="بنود أمر الشراء">
          {errors[2] && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              ⚠ {errors[2]}
            </div>
          )}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-right">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-10">#</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground min-w-[180px]">
                      الصنف
                    </th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground min-w-[200px]">
                      الوصف
                    </th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-24">الكمية</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-20">الوحدة</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">السعر</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-32">الإجمالي</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.key} className="border-t">
                      <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={l.itemId}
                          onChange={(e) => {
                            const it = items.find((x) => x.id === e.target.value);
                            updateLine(l.key, {
                              itemId: e.target.value,
                              unit: it?.unit || l.unit,
                              description: l.description || it?.name || "",
                            });
                          }}
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px]"
                        >
                          <option value="">— لا يوجد —</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={l.description}
                          onChange={(e) => updateLine(l.key, { description: e.target.value })}
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px]"
                          placeholder="وصف البند"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.quantity || ""}
                          onChange={(e) =>
                            updateLine(l.key, { quantity: parseFloat(e.target.value) || 0 })
                          }
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={l.unit}
                          onChange={(e) => updateLine(l.key, { unit: e.target.value })}
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px]"
                          placeholder="قطعة"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.unitPrice || ""}
                          onChange={(e) =>
                            updateLine(l.key, { unitPrice: parseFloat(e.target.value) || 0 })
                          }
                          dir="ltr"
                          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px]"
                        />
                      </td>
                      <td className="px-3 py-1.5 font-bold tabular-nums text-foreground">
                        {fmtSAR((l.quantity || 0) * (l.unitPrice || 0))}
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => removeLine(l.key)}
                          disabled={lines.length <= 1}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="حذف السطر"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-muted/30 px-3 py-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors min-h-[36px]"
              >
                <Plus size={14} /> إضافة بند
              </button>
              <div className="text-sm font-bold tabular-nums">
                الإجمالي: <span className="text-foreground">{fmtSAR(total)}</span>
              </div>
            </div>
          </div>
        </FormSection>
      ),
    },
    {
      id: "summary",
      label: "ملخص",
      content: (
        <FormSection title="ملخص أمر الشراء">
          <FormSummaryLine
            label="المورد"
            value={suppliers.find((s) => s.id === supplierId)?.name || "—"}
          />
          <FormSummaryLine label="الموضوع" value={subject || "—"} />
          <FormSummaryLine label="تاريخ الأمر" value={date} />
          <FormSummaryLine label="تاريخ التوريد" value={deliveryDate || "—"} />
          <FormSummaryLine
            label="عدد البنود"
            value={String(lines.filter((l) => l.description.trim()).length)}
          />
          <FormSummaryLine label="الإجمالي" value={fmtSAR(total)} tone="success" />
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="أوامر الشراء" breadcrumb={["المشتريات", "أوامر الشراء", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المشتريات", to: "/procurement/requests" },
          { label: "أوامر الشراء", to: "/procurement/orders" },
          { label: "أمر جديد" },
        ]}
        title="أمر شراء جديد"
        subtitle={`${suppliers.find((s) => s.id === supplierId)?.name || "—"} · ${fmtSAR(total)}`}
        draftNumber="مسودة جديدة"
        status={{ label: "مسودة", tone: "muted" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/procurement/orders" })}
      />
    </AppShell>
  );
}
