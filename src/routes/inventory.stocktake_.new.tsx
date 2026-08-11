import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/erp/AppShell";
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
import { getWarehouses, type Warehouse } from "@/lib/api/warehouses";
import { getInventoryItems, type InventoryItem } from "@/lib/api/inventory-items";
import { createStocktake } from "@/lib/api/stocktake";
import { StocktakeStatus, WarehouseStatus } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";

export const Route = createFileRoute("/inventory/stocktake_/new")({
  head: () => ({ meta: [{ title: "جرد جديد — ثواب" }] }),
  component: NewStocktakePage,
});

interface DraftLine {
  key: string;
  itemId: string;
  systemQuantity: number;
  countedQuantity: number;
  notes: string;
}

function newLine(key: string, itemId = "", systemQuantity = 0): DraftLine {
  return { key, itemId, systemQuantity, countedQuantity: systemQuantity, notes: "" };
}

function NewStocktakePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const whQuery = useQuery({
    queryKey: ["warehouses-simple"],
    queryFn: () => getWarehouses({ limit: 1000 }),
  });
  const warehouses: Warehouse[] = (whQuery.data?.items || []).filter(
    (w) => w.status === WarehouseStatus.ACTIVE,
  );

  const itemsQuery = useQuery({
    queryKey: ["inventoryItems-simple"],
    queryFn: () => getInventoryItems({ limit: 1000 }),
  });
  const items: InventoryItem[] = itemsQuery.data?.items ?? [];

  const [name, setName] = useState(`جرد ${new Date().toISOString().slice(0, 10)}`);
  const [warehouseId, setWarehouseId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([newLine("l1")]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const stats = useMemo(() => {
    let sys = 0;
    let cnt = 0;
    let diff = 0;
    for (const l of lines) {
      if (!l.itemId) continue;
      sys += l.systemQuantity;
      cnt += l.countedQuantity;
      diff += l.countedQuantity - l.systemQuantity;
    }
    return { sys, cnt, diff, count: lines.filter((l) => l.itemId).length };
  }, [lines]);

  const addLine = () => setLines([...lines, newLine(`l${Date.now()}`)]);
  const removeLine = (key: string) => setLines(lines.filter((l) => l.key !== key));
  const updateLine = (key: string, patch: Partial<DraftLine>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const handleSave = async (andClose: boolean) => {
    const errs: string[] = [];
    if (!name.trim()) errs.push("اسم الجرد مطلوب");
    const validLines = lines.filter((l) => l.itemId);
    if (validLines.length === 0) errs.push("أضف صنفًا واحدًا على الأقل");
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const created = await createStocktake({
        name: name.trim(),
        warehouseId: warehouseId || undefined,
        date,
        notes: notes || undefined,
        lines: validLines.map((l) => ({
          itemId: l.itemId,
          countedQuantity: l.countedQuantity,
          notes: l.notes || undefined,
        })),
        userId: user?.id,
        userName: user?.name,
      });
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      showToast(`تم إنشاء الجرد`, "success");
      if (andClose) navigate({ to: "/inventory/stocktake" });
      else navigate({ to: "/inventory/stocktake/$id/edit", params: { id: created.id } });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "فشل الحفظ", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs: EnterpriseTab[] = [
    {
      id: "basic",
      label: "بيانات الجرد",
      content: (
        <FormSection title="بيانات الجرد">
          <FormRow>
            <FormField label="اسم الجرد" required error={errors[0]}>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: جرد المستودع الرئيسي لشهر شعبان"
              />
            </FormField>
            <FormField label="المستودع" hint="اختياري">
              <FormSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">— كل المستودعات —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>
          </FormRow>
          <FormField label="تاريخ الجرد">
            <FormInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              dir="ltr"
            />
          </FormField>
          <FormField label="ملاحظات">
            <FormTextarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </FormField>
        </FormSection>
      ),
    },
    {
      id: "lines",
      label: "بنود الجرد",
      badge: stats.count,
      content: (
        <FormSection title="بنود الجرد">
          {errors[1] && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              ⚠ {errors[1]}
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
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">
                      الكمية النظامية
                    </th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-28">
                      الكمية الفعلية
                    </th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-20">الفرق</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground">ملاحظات</th>
                    <th className="px-3 py-2 font-semibold text-muted-foreground w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const diff = l.countedQuantity - l.systemQuantity;
                    return (
                      <tr key={l.key} className="border-t">
                        <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          <select
                            value={l.itemId}
                            onChange={(e) => {
                              const it = items.find((x) => x.id === e.target.value);
                              const sys = it?.quantity || 0;
                              updateLine(l.key, {
                                itemId: e.target.value,
                                systemQuantity: sys,
                                countedQuantity: sys,
                              });
                            }}
                            className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px]"
                          >
                            <option value="">— اختر —</option>
                            {items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1.5 tabular-nums font-mono text-muted-foreground">
                          {l.systemQuantity}
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            value={l.countedQuantity || ""}
                            onChange={(e) =>
                              updateLine(l.key, {
                                countedQuantity: parseFloat(e.target.value) || 0,
                              })
                            }
                            dir="ltr"
                            className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm font-mono tabular-nums min-h-[36px]"
                          />
                        </td>
                        <td
                          className={`px-3 py-1.5 tabular-nums font-bold ${
                            diff === 0
                              ? "text-muted-foreground"
                              : diff > 0
                                ? "text-success"
                                : "text-destructive"
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            value={l.notes}
                            onChange={(e) => updateLine(l.key, { notes: e.target.value })}
                            className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm min-h-[36px]"
                            placeholder="ملاحظات..."
                          />
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
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-muted/30 px-3 py-3 flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors min-h-[36px]"
              >
                <Plus size={14} /> إضافة بند
              </button>
              <div className="text-xs flex items-center gap-3 flex-wrap">
                <span>
                  الأصناف: <b>{stats.count}</b>
                </span>
                <span>
                  نظامي: <b className="tabular-nums">{stats.sys}</b>
                </span>
                <span>
                  فعلي: <b className="tabular-nums">{stats.cnt}</b>
                </span>
                <span
                  className={
                    stats.diff === 0
                      ? ""
                      : stats.diff > 0
                        ? "text-success font-bold"
                        : "text-destructive font-bold"
                  }
                >
                  فرق:{" "}
                  <b className="tabular-nums">{stats.diff > 0 ? `+${stats.diff}` : stats.diff}</b>
                </span>
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
        <FormSection title="ملخص الجرد">
          <FormSummaryLine label="اسم الجرد" value={name} />
          <FormSummaryLine label="التاريخ" value={date} />
          <FormSummaryLine
            label="المستودع"
            value={warehouses.find((w) => w.id === warehouseId)?.name || "كل المستودعات"}
          />
          <FormSummaryLine label="عدد الأصناف" value={String(stats.count)} />
          <FormSummaryLine label="إجمالي النظامي" value={String(stats.sys)} />
          <FormSummaryLine label="إجمالي الفعلي" value={String(stats.cnt)} />
          <FormSummaryLine
            label="إجمالي الفرق"
            value={stats.diff > 0 ? `+${stats.diff}` : String(stats.diff)}
            tone={stats.diff === 0 ? "success" : stats.diff > 0 ? "success" : "destructive"}
          />
        </FormSection>
      ),
    },
  ];

  return (
    <AppShell title="الجرد" breadcrumb={["المخزون", "الجرد", "جديد"]}>
      <EnterpriseFormLayout
        breadcrumb={[
          { label: "المخزون", to: "/inventory/items" },
          { label: "الجرد", to: "/inventory/stocktake" },
          { label: "جرد جديد" },
        ]}
        title="جرد جديد"
        subtitle={`${name} · ${stats.count} صنف`}
        draftNumber="مسودة جديدة"
        status={{ label: label("stocktakeStatus", StocktakeStatus.DRAFT), tone: "muted" }}
        tabs={tabs}
        defaultTab="basic"
        loading={saving}
        validationErrors={errors}
        primaryLabel="حفظ ومتابعة"
        secondaryLabel="حفظ وإغلاق"
        showSecondary
        onPrimary={() => handleSave(false)}
        onSecondary={() => handleSave(true)}
        onCancel={() => navigate({ to: "/inventory/stocktake" })}
      />
    </AppShell>
  );
}
