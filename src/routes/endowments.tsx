import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { label, options } from "@/lib/i18n/labels";
import {
  getEndowments,
  createEndowment,
  deleteEndowment,
  type Endowment,
} from "@/lib/api/endowments";
import { EndowmentType } from "@/lib/enums";
import { Landmark, Plus, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/endowments")({
  head: () => ({ meta: [{ title: "الأوقاف — ثواب" }] }),
  component: () => {
    const queryClient = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [formName, setFormName] = useState("");
    const [formType, setFormType] = useState<string>(EndowmentType.GENERAL);
    const [formValue, setFormValue] = useState("");

    const { data, isLoading, error } = useQuery({
      queryKey: ["endowments"],
      queryFn: () => getEndowments(),
    });
    const items: Endowment[] = data?.items ?? [];

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["endowments"] });

    const createMutation = useMutation({
      mutationFn: createEndowment,
      onSuccess: () => {
        invalidate();
        showToast("تم إضافة الوقف بنجاح", "success");
        setFormOpen(false);
        setFormName("");
        setFormType(EndowmentType.GENERAL);
        setFormValue("");
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const deleteMutation = useMutation({
      mutationFn: deleteEndowment,
      onSuccess: () => {
        invalidate();
        showToast("تم حذف الوقف", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم الوقف", "error");
        return;
      }
      createMutation.mutate({
        name: formName.trim(),
        type: formType,
        value: Number(formValue) || 0,
      });
    };

    const totalValue = items.reduce((a, e) => a + e.value, 0);
    const totalReturns = items.reduce((a, e) => a + e.returns, 0);

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المنح والأوقاف", "الأوقاف"]}
          title="إدارة الأوقاف"
          actions={
            <>
              <ExportButton
                data={items as unknown as Record<string, unknown>[]}
                filename="endowments.csv"
              />
              <Btn
                variant="primary"
                onClick={() => {
                  setFormName("");
                  setFormType(EndowmentType.GENERAL);
                  setFormValue("");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> إضافة وقف
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {[
              { l: "إجمالي قيمة الأوقاف", v: fmtSAR(totalValue) },
              { l: "عوائد متوقعة سنوياً", v: fmtSAR(totalReturns) },
              { l: "عدد الأوقاف", v: String(items.length) },
              {
                l: "نسبة العائد",
                v: totalValue > 0 ? `${Math.round((totalReturns / totalValue) * 100)}%` : "0%",
              },
            ].map((s) => (
              <Card key={s.l} className="p-4">
                <div className="text-xs text-muted-foreground">{s.l}</div>
                <div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div>
              </Card>
            ))}
          </div>
          <>
            <MobilePageHeader title="إدارة الأوقاف" count={`${items.length} وقف`} />
            {isLoading && (
              <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
            )}
            {error && (
              <div className="text-sm text-destructive py-8 text-center">فشل في تحميل الأوقاف</div>
            )}
            {!isLoading && !error && items.length === 0 && (
              <EmptyState title="لا توجد أوقاف" description="ابدأ بإضافة أول وقف" />
            )}
            <MobileTable
              columns={["الرقم", "اسم الوقف", "النوع", "القيمة", "العائد السنوي", "الحالة", ""]}
              rows={items}
              renderRow={(w) => (
                <>
                  <Td className="font-mono text-xs">{w.id}</Td>
                  <Td className="font-semibold">
                    <Landmark size={13} className="inline ms-1 text-primary" />
                    {w.name}
                  </Td>
                  <Td>
                    <Badge tone="info">{label("endowmentType", w.type)}</Badge>
                  </Td>
                  <Td className="tabular-nums font-bold">{fmtSAR(w.value)}</Td>
                  <Td className="tabular-nums text-success font-semibold">{fmtSAR(w.returns)}</Td>
                  <Td>
                    <Badge tone={statusTone(w.status)}>{label("endowmentStatus", w.status)}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        {
                          label: "عرض",
                          icon: Eye,
                          onClick: () => showToast(`${w.name} - ${fmtSAR(w.value)}`, "info"),
                        },
                        {
                          label: "حذف",
                          icon: Trash2,
                          variant: "destructive" as const,
                          onClick: () => setConfirmId(w.id),
                        },
                      ]}
                    />
                  </Td>
                </>
              )}
              mobileCard={(w) => (
                <Card key={w.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge tone={statusTone(w.status)}>{label("endowmentStatus", w.status)}</Badge>
                    <Badge tone="info">{label("endowmentType", w.type)}</Badge>
                  </div>
                  <div className="font-semibold">
                    <Landmark size={13} className="inline ms-1 text-primary" />
                    {w.name}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="tabular-nums font-bold">{fmtSAR(w.value)}</span>
                    <span className="tabular-nums text-success font-semibold text-sm">
                      {fmtSAR(w.returns)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">العائد السنوي</div>
                </Card>
              )}
            />
          </>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة وقف"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">اسم الوقف</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="اسم الوقف"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النوع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
            >
              {options("endowmentType").map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">القيمة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {confirmId !== null && (
          <ConfirmDialog
            open
            onClose={() => setConfirmId(null)}
            onConfirm={() => deleteMutation.mutate(confirmId)}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الوقف؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
