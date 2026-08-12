import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  AppShell,
  Card,
  SectionTitle,
  Btn,
  Badge,
  Select,
  FilterBar,
  statusTone,
  MobileTable,
  MobilePageHeader,
  Td,
} from "@/components/erp/AppShell";
import { fmtNum, fmtSAR } from "@/data/sample";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  EmptyState,
  ExportButton,
} from "@/components/erp/actions";
import { label, options } from "@/lib/i18n/labels";
import {
  getEndowmentReturns,
  deleteEndowmentReturn,
  type EndowmentReturn,
} from "@/lib/api/endowment-returns";

export const Route = createFileRoute("/endowment-returns")({
  head: () => ({ meta: [{ title: "عوائد الأوقاف — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["endowment-returns", { search: searchQuery, status: statusFilter }],
    queryFn: () => getEndowmentReturns({ search: searchQuery, status: statusFilter }),
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const realizedTotal = data?.realizedTotal || 0;

  const deleteMutation = useMutation({
    mutationFn: deleteEndowmentReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["endowment-returns"] });
      showToast("تم حذف عائد الوقف", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => navigate({ to: "/endowment-returns/new" });
  const openEdit = (r: EndowmentReturn) =>
    navigate({ to: "/endowment-returns/$id/edit", params: { id: r.id } });

  const max = Math.max(1, ...items.map((r: EndowmentReturn) => r.amount));

  const stats = [
    { label: "إجمالي محقق", value: fmtSAR(realizedTotal) },
    { label: "عدد السجلات", value: fmtNum(total) },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المنح والأوقاف", "عوائد الأوقاف"]}
      title="عوائد الأوقاف الاستثمارية"
      actions={
        <>
          <ExportButton
            data={items as unknown as Record<string, unknown>[]}
            filename="endowment-returns.csv"
          />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} /> إضافة عائد وقف
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:gap-4 mb-3 lg:mb-4">
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
            placeholder="بحث بالفترة أو الوقف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الحالة"
          options={["الكل", ...options("endowmentReturnStatus").map((o) => o.label)]}
          value={statusFilter ? label("endowmentReturnStatus", statusFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(
              v === "الكل"
                ? ""
                : (options("endowmentReturnStatus").find((o) => o.label === v)?.value ?? ""),
            );
          }}
        />
      </FilterBar>

      <MobilePageHeader
        title="عوائد الأوقاف الاستثمارية"
        count={`${fmtNum(total)} سجل`}
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
          description="حدث خطأ أثناء تحميل عوائد الأوقاف"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["endowment-returns"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد عوائد أوقاف"
          description="ابدأ بإضافة أول عائد وقف"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة عائد وقف
            </Btn>
          }
        />
      ) : (
        <>
          <Card className="p-5 mb-4">
            <SectionTitle title="العوائد الربعية" hint={`إجمالي محقق: ${fmtSAR(realizedTotal)}`} />
            <div className="overflow-x-auto">
              <div className="flex items-end gap-6 h-60 min-w-[400px]">
                {items.map((r: EndowmentReturn) => (
                  <div key={r.id} className="flex-1 flex flex-col items-center gap-2">
                    <div className="text-xs font-bold tabular-nums">{fmtSAR(r.amount)}</div>
                    <div
                      className={`w-full rounded-t ${
                        r.status === "realized"
                          ? "bg-gradient-to-t from-primary to-info/70"
                          : "bg-gradient-to-t from-warning to-warning/40"
                      }`}
                      style={{ height: `${(r.amount / max) * 90}%` }}
                    />
                    <div className="text-xs text-muted-foreground">{r.period}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <MobileTable
            columns={["الفترة", "اسم الوقف", "القيمة", "الحالة", ""]}
            rows={items}
            renderRow={(r: EndowmentReturn) => (
              <>
                <Td className="font-semibold">{r.period}</Td>
                <Td>{r.endowmentName || "—"}</Td>
                <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
                <Td>
                  <Badge tone={statusTone(r.status)}>
                    {label("endowmentReturnStatus", r.status)}
                  </Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={[
                      { label: "تعديل", icon: Pencil, onClick: () => openEdit(r) },
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
            mobileCard={(r: EndowmentReturn) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge tone={statusTone(r.status)}>
                    {label("endowmentReturnStatus", r.status)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{r.period}</span>
                </div>
                <div className="font-semibold">{r.endowmentName || "—"}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="tabular-nums font-bold">{fmtSAR(r.amount)}</span>
                  <ActionMenu
                    actions={[
                      { label: "تعديل", icon: Pencil, onClick: () => openEdit(r) },
                      {
                        label: "حذف",
                        icon: Trash2,
                        variant: "destructive" as const,
                        onClick: () => setDeleteTarget(r.id),
                      },
                    ]}
                  />
                </div>
              </Card>
            )}
          />
        </>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget })}
        title="حذف عائد الوقف"
        message="هل أنت متأكد من حذف عائد الوقف؟"
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
