import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Select,
  FilterBar,
  statusTone,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  Td,
} from "@/components/erp/AppShell";
import { fmtNum, fmtSAR } from "@/data/sample";
import { Repeat, Plus, Pencil, Trash2, Pause, Play, Search } from "lucide-react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  EmptyState,
  ExportButton,
} from "@/components/erp/actions";
import { label, options } from "@/lib/i18n/labels";
import { RecurringStatus } from "@/lib/enums";
import {
  getRecurring,
  deleteRecurring,
  setRecurringStatus,
  type RecurringDonation,
} from "@/lib/api/recurring";

export const Route = createFileRoute("/recurring")({
  head: () => ({ meta: [{ title: "التبرعات المتكررة — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [frequencyFilter, setFrequencyFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "recurring",
      { search: searchQuery, status: statusFilter, frequency: frequencyFilter },
    ],
    queryFn: () =>
      getRecurring({ search: searchQuery, status: statusFilter, frequency: frequencyFilter }),
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const activeMonthly = data?.activeMonthly || 0;

  const deleteMutation = useMutation({
    mutationFn: deleteRecurring,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      showToast("تم حذف التبرع المتكرر", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; action: "activate" | "pause" }) => setRecurringStatus(vars),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["recurring"] });
      showToast(
        vars.action === "pause" ? "تم إيقاف التبرع المتكرر" : "تم تفعيل التبرع المتكرر",
        "success",
      );
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => navigate({ to: "/recurring/new" });
  const openEdit = (r: RecurringDonation) =>
    navigate({ to: "/recurring/$id/edit", params: { id: r.id } });

  const activeCount = items.filter(
    (r: RecurringDonation) => r.status === RecurringStatus.ACTIVE,
  ).length;
  const retention = total > 0 ? Math.round((activeCount / total) * 100) : 0;

  const stats = [
    { label: "تبرعات متكررة نشطة", value: fmtNum(activeCount) },
    { label: "إيراد شهري متوقع", value: fmtSAR(activeMonthly) },
    { label: "نسبة الاستمرارية", value: `${retention}%` },
    { label: "عدد المشتركين", value: fmtNum(total) },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "التبرعات", "التبرعات المتكررة"]}
      title="التبرعات المتكررة"
      actions={
        <>
          <ExportButton
            data={items as unknown as Record<string, unknown>[]}
            filename="recurring.csv"
          />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} /> إضافة تبرع متكرر
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-3 lg:mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="text-xs text-muted-foreground truncate">{s.label}</div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums truncate">
              {s.value}
            </div>
          </Card>
        ))}
      </div>

      <FilterBar>
        <div className="relative flex-1 min-w-[200px] hidden lg:block">
          <Search
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
            placeholder="بحث بالمتبرع أو المشروع..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="التكرار"
          options={["الكل", ...options("recurringFrequency").map((o) => o.label)]}
          value={frequencyFilter ? label("recurringFrequency", frequencyFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setFrequencyFilter(
              v === "الكل"
                ? ""
                : (options("recurringFrequency").find((o) => o.label === v)?.value ?? ""),
            );
          }}
        />
        <Select
          label="الحالة"
          options={["الكل", ...options("recurringStatus").map((o) => o.label)]}
          value={statusFilter ? label("recurringStatus", statusFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(
              v === "الكل"
                ? ""
                : (options("recurringStatus").find((o) => o.label === v)?.value ?? ""),
            );
          }}
        />
      </FilterBar>

      <div className="lg:hidden flex items-center gap-2 mb-3">
        <MobileSearchInput
          placeholder="بحث..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <MobilePageHeader
        title="التبرعات المتكررة"
        count={`${fmtNum(total)} تبرع`}
        action={
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} />
          </Btn>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="خطأ في تحميل البيانات"
          description="حدث خطأ أثناء تحميل التبرعات المتكررة"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["recurring"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد تبرعات متكررة"
          description="ابدأ بإضافة أول تبرع متكرر"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة تبرع متكرر
            </Btn>
          }
        />
      ) : (
        <MobileTable
          columns={[
            "الرقم",
            "المتبرع",
            "المبلغ",
            "التكرار",
            "المشروع",
            "الخصم القادم",
            "الحالة",
            "",
          ]}
          rows={items}
          renderRow={(r: RecurringDonation) => (
            <>
              <Td className="font-mono text-xs">{r.code}</Td>
              <Td className="font-semibold">
                <button onClick={() => openEdit(r)} className="hover:text-primary text-right">
                  {r.donorName}
                </button>
              </Td>
              <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
              <Td>
                <Badge tone="info">
                  <Repeat size={11} className="inline ms-1" />
                  {label("recurringFrequency", r.frequency)}
                </Badge>
              </Td>
              <Td>{r.projectName}</Td>
              <Td className="text-muted-foreground">{r.nextRunDate}</Td>
              <Td>
                <Badge tone={statusTone(r.status)}>{label("recurringStatus", r.status)}</Badge>
              </Td>
              <Td>
                <ActionMenu
                  actions={[
                    { label: "تعديل", icon: Pencil, onClick: () => openEdit(r) },
                    r.status === RecurringStatus.ACTIVE
                      ? {
                          label: "إيقاف",
                          icon: Pause,
                          onClick: () => statusMutation.mutate({ id: r.id, action: "pause" }),
                        }
                      : {
                          label: "تفعيل",
                          icon: Play,
                          onClick: () => statusMutation.mutate({ id: r.id, action: "activate" }),
                        },
                    {
                      label: "حذف",
                      icon: Trash2,
                      variant: "destructive" as const,
                      onClick: () => setDeleteTarget(r.id),
                    },
                  ]}
                />
              </Td>
            </>
          )}
          mobileCard={(r: RecurringDonation) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <Badge tone={statusTone(r.status)}>{label("recurringStatus", r.status)}</Badge>
                <Badge tone="info">
                  <Repeat size={11} className="inline ms-1" />
                  {label("recurringFrequency", r.frequency)}
                </Badge>
              </div>
              <button
                onClick={() => openEdit(r)}
                className="font-semibold hover:text-primary text-right block w-full"
              >
                {r.donorName}
              </button>
              <div className="flex items-center justify-between mt-2">
                <span className="tabular-nums font-bold">{fmtSAR(r.amount)}</span>
                <span className="text-xs text-muted-foreground">{r.projectName}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                الخصم القادم: {r.nextRunDate}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() =>
                    statusMutation.mutate({
                      id: r.id,
                      action: r.status === RecurringStatus.ACTIVE ? "pause" : "activate",
                    })
                  }
                >
                  {r.status === RecurringStatus.ACTIVE ? "إيقاف" : "تفعيل"}
                </button>
                <button
                  className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                  onClick={() => openEdit(r)}
                >
                  تعديل
                </button>
              </div>
            </Card>
          )}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget })}
        title="حذف التبرع المتكرر"
        message="هل أنت متأكد من حذف التبرع المتكرر؟"
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
