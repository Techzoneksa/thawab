import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Btn,
  Card,
  Badge,
  Td,
  statusTone,
  MobileTable,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { label } from "@/lib/i18n/labels";
import { getGrants, createGrant, deleteGrant, type Grant } from "@/lib/api/grants";
import { GrantStatus } from "@/lib/enums";
import { Plus, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/grants")({
  head: () => ({ meta: [{ title: "المنح — ثواب" }] }),
  component: () => {
    const queryClient = useQueryClient();
    const [formOpen, setFormOpen] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [formName, setFormName] = useState("");
    const [formDonor, setFormDonor] = useState("");
    const [formAmount, setFormAmount] = useState("");
    const [formEnd, setFormEnd] = useState("");

    const { data, isLoading, error } = useQuery({
      queryKey: ["grants"],
      queryFn: () => getGrants(),
    });
    const items: Grant[] = data?.items ?? [];

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["grants"] });

    const createMutation = useMutation({
      mutationFn: createGrant,
      onSuccess: () => {
        invalidate();
        showToast("تم إضافة المنحة بنجاح", "success");
        setFormOpen(false);
        setFormName("");
        setFormDonor("");
        setFormAmount("");
        setFormEnd("");
      },
      onError: (e: Error) => showToast(e.message, "error"),
    });

    const deleteMutation = useMutation({
      mutationFn: deleteGrant,
      onSuccess: () => {
        invalidate();
        showToast("تم حذف المنحة", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

    const handleSave = () => {
      if (!formName.trim() || !formDonor.trim()) {
        showToast("يرجى إدخال اسم المنحة والجهة المانحة", "error");
        return;
      }
      createMutation.mutate({
        name: formName.trim(),
        donor: formDonor.trim(),
        amount: Number(formAmount) || 0,
        endDate: formEnd || undefined,
        status: GrantStatus.ACTIVE,
      });
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المنح والأوقاف", "المنح"]}
          title="إدارة المنح"
          actions={
            <>
              <ExportButton
                data={items as unknown as Record<string, unknown>[]}
                filename="grants.csv"
              />
              <Btn
                variant="primary"
                onClick={() => {
                  setFormName("");
                  setFormDonor("");
                  setFormAmount("");
                  setFormEnd("");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> إضافة منحة
              </Btn>
            </>
          }
        >
          <>
            <MobilePageHeader title="إدارة المنح" count={`${items.length} منحة`} />
            {isLoading && (
              <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
            )}
            {error && (
              <div className="text-sm text-destructive py-8 text-center">فشل في تحميل المنح</div>
            )}
            {!isLoading && !error && items.length === 0 && (
              <EmptyState title="لا توجد منح" description="ابدأ بإضافة أول منحة" />
            )}
            <MobileTable
              columns={["الرقم", "اسم المنحة", "الجهة المانحة", "القيمة", "ينتهي في", "الحالة", ""]}
              rows={items}
              renderRow={(g) => (
                <>
                  <Td className="font-mono text-xs">{g.id}</Td>
                  <Td className="font-semibold">{g.name}</Td>
                  <Td>{g.donor}</Td>
                  <Td className="tabular-nums font-bold">{fmtSAR(g.amount)}</Td>
                  <Td className="text-muted-foreground">{g.endDate || "—"}</Td>
                  <Td>
                    <Badge tone={statusTone(g.status)}>{label("grantStatus", g.status)}</Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        {
                          label: "عرض",
                          icon: Eye,
                          onClick: () => showToast(`${g.name} - ${fmtSAR(g.amount)}`, "info"),
                        },
                        {
                          label: "حذف",
                          icon: Trash2,
                          variant: "destructive" as const,
                          onClick: () => setConfirmId(g.id),
                        },
                      ]}
                    />
                  </Td>
                </>
              )}
              mobileCard={(g) => (
                <Card key={g.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge tone={statusTone(g.status)}>{label("grantStatus", g.status)}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{g.id}</span>
                  </div>
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{g.donor}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="tabular-nums font-bold">{fmtSAR(g.amount)}</span>
                    <span className="text-xs text-muted-foreground">{g.endDate || "—"}</span>
                  </div>
                </Card>
              )}
            />
          </>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة منحة"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">اسم المنحة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="اسم المنحة"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الجهة المانحة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formDonor}
              onChange={(e) => setFormDonor(e.target.value)}
              placeholder="اسم الجهة"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">قيمة المنحة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">تاريخ الانتهاء</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="date"
              value={formEnd}
              onChange={(e) => setFormEnd(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {confirmId !== null && (
          <ConfirmDialog
            open
            onClose={() => setConfirmId(null)}
            onConfirm={() => deleteMutation.mutate(confirmId)}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف المنحة؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
