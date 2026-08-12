import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { getGrants, deleteGrant, type Grant } from "@/lib/api/grants";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/grants")({
  head: () => ({ meta: [{ title: "المنح — ثواب" }] }),
  component: () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const { data, isLoading, error } = useQuery({
      queryKey: ["grants"],
      queryFn: () => getGrants(),
    });
    const items: Grant[] = data?.items ?? [];

    const deleteMutation = useMutation({
      mutationFn: deleteGrant,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["grants"] });
        showToast("تم حذف المنحة", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

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
              <Btn variant="primary" onClick={() => navigate({ to: "/grants/new" })}>
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
                          label: "تعديل",
                          icon: Pencil,
                          onClick: () => navigate({ to: "/grants/$id/edit", params: { id: g.id } }),
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
