import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { label } from "@/lib/i18n/labels";
import { getEmployees, deleteEmployee, type Employee } from "@/lib/api/hr";
import { EmployeeStatus } from "@/lib/enums";
import { Plus, Briefcase, Calendar, FileText, BarChart3, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

export const Route = createFileRoute("/hr")({
  head: () => ({ meta: [{ title: "الموارد البشرية — ثواب" }] }),
  component: () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const { data, isLoading, error } = useQuery({
      queryKey: ["employees"],
      queryFn: () => getEmployees(),
    });
    const items: Employee[] = data?.items ?? [];

    const deleteMutation = useMutation({
      mutationFn: deleteEmployee,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["employees"] });
        showToast("تم حذف الموظف", "success");
        setConfirmId(null);
      },
      onError: (e: Error) => {
        showToast(e.message, "error");
        setConfirmId(null);
      },
    });

    const goEdit = (id: string) => navigate({ to: "/hr/$id/edit", params: { id } });

    const totalSalary = items.reduce((a, e) => a + e.salary, 0);
    const onLeave = items.filter((e) => e.status === EmployeeStatus.ON_LEAVE).length;
    const avgSalary = items.length ? Math.round(totalSalary / items.length) : 0;

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "الموارد", "الموارد البشرية"]}
          title="الموارد البشرية"
          actions={
            <>
              <ExportButton
                data={items as unknown as Record<string, unknown>[]}
                filename="employees.csv"
              />
              <Btn variant="primary" onClick={() => navigate({ to: "/hr/new" })}>
                <Plus size={15} /> إضافة موظف
              </Btn>
            </>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3 lg:mb-4">
            {[
              { l: "إجمالي الموظفين", v: String(items.length), i: Briefcase },
              { l: "في إجازة", v: String(onLeave), i: Calendar },
              { l: "إجمالي الرواتب الشهرية", v: fmtSAR(totalSalary), i: FileText },
              { l: "متوسط الراتب", v: fmtSAR(avgSalary), i: BarChart3 },
            ].map((s) => (
              <Card key={s.l} className="p-3 lg:p-4 flex items-center gap-3">
                <div className="grid h-9 w-9 lg:h-10 lg:w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <s.i size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground truncate">{s.l}</div>
                  <div className="text-base lg:text-lg font-extrabold tabular-nums truncate">
                    {s.v}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <MobilePageHeader title="الموظفون" count={`${items.length} موظف`} />

          {isLoading && (
            <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
          )}
          {error && (
            <div className="text-sm text-destructive py-8 text-center">فشل في تحميل الموظفين</div>
          )}
          {!isLoading && !error && items.length === 0 && (
            <EmptyState title="لا يوجد موظفون" description="ابدأ بإضافة أول موظف" />
          )}

          <MobileTable
            columns={[
              "الرقم",
              "الموظف",
              "الإدارة",
              "المسمى الوظيفي",
              "الراتب",
              "تاريخ التعيين",
              "الحالة",
              "",
            ]}
            rows={items}
            renderRow={(e) => (
              <>
                <Td className="font-mono text-xs">{e.id}</Td>
                <Td className="font-semibold">{e.name}</Td>
                <Td>{e.department || "—"}</Td>
                <Td className="text-muted-foreground">{e.title || "—"}</Td>
                <Td className="tabular-nums font-bold">{fmtSAR(e.salary)}</Td>
                <Td className="text-muted-foreground">{e.joinedAt || "—"}</Td>
                <Td>
                  <Badge tone={statusTone(e.status)}>{label("employeeStatus", e.status)}</Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={[
                      { label: "تعديل", icon: Pencil, onClick: () => goEdit(e.id) },
                      {
                        label: "حذف",
                        icon: Trash2,
                        variant: "destructive" as const,
                        onClick: () => setConfirmId(e.id),
                      },
                    ]}
                  />
                </Td>
              </>
            )}
            mobileCard={(e) => (
              <div key={e.id} className="rounded-xl border bg-card shadow-card p-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                    {e.name.split(" ")[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold truncate">{e.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {e.title || "—"}
                        </div>
                      </div>
                      <Badge tone={statusTone(e.status)}>{label("employeeStatus", e.status)}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <span className="text-muted-foreground">الإدارة: </span>
                    <span className="font-semibold">{e.department || "—"}</span>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <span className="text-muted-foreground">الراتب: </span>
                    <span className="font-bold tabular-nums">{fmtSAR(e.salary)}</span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t flex gap-2">
                  <button
                    className="flex-1 rounded-lg border py-2 text-xs font-semibold min-h-[36px]"
                    onClick={() => goEdit(e.id)}
                  >
                    تعديل
                  </button>
                </div>
              </div>
            )}
          />
        </AppShell>

        {confirmId !== null && (
          <ConfirmDialog
            open
            onClose={() => setConfirmId(null)}
            onConfirm={() => deleteMutation.mutate(confirmId)}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الموظف؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
