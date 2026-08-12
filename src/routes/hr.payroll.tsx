import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { fmtNum, fmtSAR } from "@/data/sample";
import { showToast, ConfirmDialog, ActionMenu, EmptyState } from "@/components/erp/actions";
import { Wallet, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { label } from "@/lib/i18n/labels";
import { PayrollStatus } from "@/lib/enums";
import { getPayrollRuns, deletePayrollRun, type PayrollRun } from "@/lib/api/payroll";

export const Route = createFileRoute("/hr/payroll")({
  head: () => ({ meta: [{ title: "مسير الرواتب — ثواب" }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [delTarget, setDelTarget] = useState<PayrollRun | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["payroll"],
    queryFn: getPayrollRuns,
  });
  const runs = data?.items ?? [];

  const approvedTotal = runs
    .filter((r: PayrollRun) => r.status === PayrollStatus.APPROVED)
    .reduce((s: number, r: PayrollRun) => s + r.totalAmount, 0);

  const deleteMut = useMutation({
    mutationFn: deletePayrollRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      showToast("تم حذف المسير", "success");
      setDelTarget(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const openEdit = (r: PayrollRun) =>
    navigate({ to: "/hr/payroll/$id/edit", params: { id: r.id } });

  const stats = [
    { label: "عدد المسيرات", value: fmtNum(runs.length) },
    {
      label: "مسيرات معتمدة",
      value: fmtNum(runs.filter((r: PayrollRun) => r.status === PayrollStatus.APPROVED).length),
    },
    { label: "إجمالي المعتمد", value: fmtSAR(approvedTotal) },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الموارد", "مسير الرواتب"]}
      title="مسير الرواتب"
      actions={
        <Btn variant="primary" onClick={() => navigate({ to: "/hr/payroll/new" })}>
          <Plus size={15} /> مسير جديد
        </Btn>
      }
    >
      <div className="grid grid-cols-3 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums truncate">
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      <MobilePageHeader
        title="مسير الرواتب"
        count={`${fmtNum(runs.length)} مسير`}
        action={
          <Btn variant="primary" onClick={() => navigate({ to: "/hr/payroll/new" })}>
            <Plus size={15} />
          </Btn>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <Card className="p-2">
          <EmptyState
            icon={<Wallet size={40} />}
            title="خطأ في تحميل المسيرات"
            description="حدث خطأ أثناء الجلب"
            action={
              <Btn
                variant="primary"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["payroll"] })}
              >
                إعادة المحاولة
              </Btn>
            }
          />
        </Card>
      ) : runs.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={<Wallet size={40} />}
            title="لا توجد مسيرات رواتب"
            description="أنشئ مسيراً جديداً لإدراج الموظفين النشطين واعتماد قيد الرواتب"
            action={
              <Btn variant="primary" onClick={() => navigate({ to: "/hr/payroll/new" })}>
                <Plus size={15} /> مسير جديد
              </Btn>
            }
          />
        </Card>
      ) : (
        <MobileTable
          columns={["الفترة", "طريقة الصرف", "الإجمالي", "الحالة", ""]}
          rows={runs}
          renderRow={(r: PayrollRun) => (
            <>
              <Td className="font-semibold">
                <button onClick={() => openEdit(r)} className="hover:text-primary text-right">
                  {r.period}
                </button>
              </Td>
              <Td>{label("payrollPayMethod", r.payMethod)}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(r.totalAmount)}</Td>
              <Td>
                <Badge tone={statusTone(r.status)}>{label("payrollStatus", r.status)}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={[
                    {
                      label: r.status === PayrollStatus.APPROVED ? "عرض" : "تعديل",
                      icon: r.status === PayrollStatus.APPROVED ? Eye : Pencil,
                      onClick: () => openEdit(r),
                    },
                    ...(r.status === PayrollStatus.DRAFT
                      ? [
                          {
                            label: "حذف",
                            icon: Trash2,
                            variant: "destructive" as const,
                            onClick: () => setDelTarget(r),
                          },
                        ]
                      : []),
                  ]}
                />
              </Td>
            </>
          )}
          mobileCard={(r: PayrollRun) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => openEdit(r)}
                  className="font-bold hover:text-primary text-right"
                >
                  {r.period}
                </button>
                <Badge tone={statusTone(r.status)}>{label("payrollStatus", r.status)}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground text-xs">
                  {label("payrollPayMethod", r.payMethod)}
                </span>
                <span className="font-bold tabular-nums">{fmtSAR(r.totalAmount)}</span>
              </div>
            </Card>
          )}
        />
      )}

      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={() => delTarget && deleteMut.mutate(delTarget.id)}
        title="حذف مسير الرواتب"
        message={delTarget ? `هل تريد حذف مسير "${delTarget.period}"؟` : ""}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
