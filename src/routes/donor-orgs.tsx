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
  MobilePageHeader,
  MobileSearchInput,
} from "@/components/erp/AppShell";
import { fmtNum, fmtSAR } from "@/data/sample";
import { Building2, Plus, Pencil, Trash2, Pause, Play, Search } from "lucide-react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  EmptyState,
  ExportButton,
} from "@/components/erp/actions";
import { label, options } from "@/lib/i18n/labels";
import { DonorOrgStatus } from "@/lib/enums";
import {
  getDonorOrgs,
  deleteDonorOrg,
  setDonorOrgStatus,
  type DonorOrg,
} from "@/lib/api/donor-orgs";

export const Route = createFileRoute("/donor-orgs")({
  head: () => ({ meta: [{ title: "الجهات المانحة — ثواب" }] }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "donor-orgs",
      { search: searchQuery, status: statusFilter, category: categoryFilter },
    ],
    queryFn: () =>
      getDonorOrgs({ search: searchQuery, status: statusFilter, category: categoryFilter }),
  });

  const items = data?.items || [];
  const total = data?.total || 0;

  const deleteMutation = useMutation({
    mutationFn: deleteDonorOrg,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["donor-orgs"] });
      showToast("تم حذف الجهة المانحة", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: string; action: "activate" | "deactivate" }) =>
      setDonorOrgStatus(vars),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["donor-orgs"] });
      showToast(vars.action === "deactivate" ? "تم إيقاف الجهة" : "تم تفعيل الجهة", "success");
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const openAdd = () => navigate({ to: "/donor-orgs/new" });
  const openEdit = (r: DonorOrg) => navigate({ to: "/donor-orgs/$id/edit", params: { id: r.id } });

  const activeCount = items.filter((r: DonorOrg) => r.status === DonorOrgStatus.ACTIVE).length;
  const grantsTotal = items.reduce((s: number, r: DonorOrg) => s + r.grantsCount, 0);
  const amountTotal = items.reduce((s: number, r: DonorOrg) => s + r.totalAmount, 0);

  const stats = [
    { label: "إجمالي الجهات", value: fmtNum(total) },
    { label: "جهات نشطة", value: fmtNum(activeCount) },
    { label: "إجمالي المنح", value: fmtNum(grantsTotal) },
    { label: "إجمالي القيمة", value: fmtSAR(amountTotal) },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المنح والأوقاف", "الجهات المانحة"]}
      title="الجهات المانحة"
      actions={
        <>
          <ExportButton
            data={items as unknown as Record<string, unknown>[]}
            filename="donor-orgs.csv"
          />
          <Btn variant="primary" onClick={openAdd}>
            <Plus size={15} /> إضافة جهة مانحة
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
            placeholder="بحث بالاسم أو المسؤول..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select
          label="الفئة"
          options={["الكل", ...options("donorOrgCategory").map((o) => o.label)]}
          value={categoryFilter ? label("donorOrgCategory", categoryFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setCategoryFilter(
              v === "الكل"
                ? ""
                : (options("donorOrgCategory").find((o) => o.label === v)?.value ?? ""),
            );
          }}
        />
        <Select
          label="الحالة"
          options={["الكل", ...options("donorOrgStatus").map((o) => o.label)]}
          value={statusFilter ? label("donorOrgStatus", statusFilter) : "الكل"}
          onChange={(e) => {
            const v = e.target.value;
            setStatusFilter(
              v === "الكل"
                ? ""
                : (options("donorOrgStatus").find((o) => o.label === v)?.value ?? ""),
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
        title="الجهات المانحة"
        count={`${fmtNum(total)} جهة`}
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
          description="حدث خطأ أثناء تحميل الجهات المانحة"
          action={
            <Btn
              variant="primary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["donor-orgs"] })}
            >
              إعادة المحاولة
            </Btn>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="لا توجد جهات مانحة"
          description="ابدأ بإضافة أول جهة مانحة"
          action={
            <Btn variant="primary" onClick={openAdd}>
              إضافة جهة
            </Btn>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((r: DonorOrg) => (
            <Card key={r.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Building2 size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => openEdit(r)}
                      className="font-bold truncate hover:text-primary text-right block w-full"
                    >
                      {r.name}
                    </button>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge tone="info">{label("donorOrgCategory", r.category)}</Badge>
                      <Badge tone={statusTone(r.status)}>{label("donorOrgStatus", r.status)}</Badge>
                    </div>
                  </div>
                </div>
                <ActionMenu
                  actions={[
                    { label: "تعديل", icon: Pencil, onClick: () => openEdit(r) },
                    r.status === DonorOrgStatus.ACTIVE
                      ? {
                          label: "إيقاف",
                          icon: Pause,
                          onClick: () => statusMutation.mutate({ id: r.id, action: "deactivate" }),
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
              </div>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <div>
                  <div className="text-xs text-muted-foreground">عدد المنح</div>
                  <div className="font-bold tabular-nums">{r.grantsCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">إجمالي القيمة</div>
                  <div className="font-bold tabular-nums">{fmtSAR(r.totalAmount)}</div>
                </div>
              </div>
              {r.contactPerson && (
                <div className="mt-3 text-xs text-muted-foreground truncate">
                  مسؤول التواصل: {r.contactPerson}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget })}
        title="حذف الجهة المانحة"
        message="هل أنت متأكد من حذف الجهة المانحة؟"
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
