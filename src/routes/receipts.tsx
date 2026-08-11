import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  FilterBar,
  Select,
  Table,
  Td,
  MobileTable,
  MobilePageHeader,
  MobileSearchInput,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Printer, Download, Plus, Eye, CheckCircle, XCircle, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import {
  showToast,
  ConfirmDialog,
  ActionMenu,
  ExportButton,
  PrintButton,
  EmptyState,
  PrintStyle,
} from "@/components/erp/actions";
import { useAuth } from "@/lib/api/auth";
import {
  getReceipts,
  printReceipt,
  voidReceipt,
  deleteReceipt,
  type Receipt,
  type ReceiptFilters,
} from "@/lib/api/receipts";
import { ReceiptStatus } from "@/lib/enums";
import { label, options } from "@/lib/i18n/labels";

export const Route = createFileRoute("/receipts")({
  head: () => ({ meta: [{ title: "الإيصالات الإلكترونية — ثواب" }] }),
  component: Page,
});

function statusToneLocal(s: string) {
  if (s === ReceiptStatus.ISSUED) return "success";
  if (s === ReceiptStatus.CANCELLED) return "error";
  return "muted";
}

function Page() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [filterOpen, setFilterOpen] = useState(false);
  const [printTarget, setPrintTarget] = useState<Receipt | null>(null);
  const [voidTarget, setVoidTarget] = useState<Receipt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState("الكل");

  const [apiFilters, setApiFilters] = useState<ReceiptFilters>({
    search: "",
    status: "",
    type: "",
    page: 1,
    limit: 50,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["receipts", apiFilters],
    queryFn: () => getReceipts(apiFilters),
  });

  const receipts = data?.items || [];
  const totalCount = data?.total || 0;

  useEffect(() => {
    const statusKey = options("receiptStatus").find((o) => o.label === statusFilter)?.value ?? "";
    const typeKey = options("receiptType").find((o) => o.label === typeFilter)?.value ?? "";
    setApiFilters((f) => ({
      ...f,
      search: searchQuery,
      status: statusKey,
      type: typeKey,
    }));
  }, [searchQuery, statusFilter, typeFilter]);

  const printMutation = useMutation({
    mutationFn: printReceipt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      showToast("تم تجهيز الإيصال للطباعة", "success");
      setPrintTarget(null);
      window.print();
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const voidMutation = useMutation({
    mutationFn: voidReceipt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      showToast("تم إلغاء الإيصال بنجاح", "success");
      setVoidTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteReceipt,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receipts"] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
      showToast("تم حذف الإيصال بنجاح", "success");
      setDeleteTarget(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const handlePrint = (r: Receipt) => {
    printMutation.mutate({ id: r.id, userId: user?.id, userName: user?.name });
  };

  const handleVoid = () => {
    if (voidTarget) {
      voidMutation.mutate({ id: voidTarget.id, userId: user?.id, userName: user?.name });
    }
  };

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate({ id: deleteTarget, userId: user?.id, userName: user?.name });
    }
  };

  const stats = [
    { label: "إجمالي الإيصالات", value: fmtSAR(receipts.reduce((s, r) => s + r.amount, 0)) },
    { label: "مرحّل", value: receipts.filter((r: Receipt) => r.status === ReceiptStatus.ISSUED).length },
    { label: "طباعة", value: receipts.filter((r: Receipt) => r.printed).length },
    { label: "ملغي", value: receipts.filter((r: Receipt) => r.status === ReceiptStatus.CANCELLED).length },
  ];

  return (
    <>
      <AppShell
        breadcrumb={["الرئيسية", "التبرعات", "الإيصالات"]}
        title="الإيصالات الإلكترونية"
        actions={
          <>
            <ExportButton data={receipts} filename="الإيصالات.csv" />
            <PrintButton label="طباعة دفعية" />
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
            <Printer
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              className="w-full rounded-lg border bg-background py-1.5 pr-9 pl-3 text-sm"
              placeholder="بحث برقم الإيصال، اسم المتبرع..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select
            label="الحالة"
            options={["الكل", ...options("receiptStatus").map((o) => o.label)]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
          <Select
            label="النوع"
            options={["الكل", ...options("receiptType").map((o) => o.label)]}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          />
          <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
            <Printer size={15} /> تصفية
          </Btn>
        </FilterBar>

        <div className="lg:hidden flex items-center gap-2 mb-3">
          <MobileSearchInput
            placeholder="بحث عن إيصال..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <MobilePageHeader title="الإيصالات الإلكترونية" count={`${receipts.length} إيصال`} />

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <EmptyState
            title="خطأ في تحميل البيانات"
            description="حدث خطأ أثناء تحميل قائمة الإيصالات"
            action={
              <Btn
                variant="primary"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["receipts"] })}
              >
                إعادة المحاولة
              </Btn>
            }
          />
        ) : receipts.length === 0 ? (
          <EmptyState
            title="لا توجد إيصالات"
            description="الإيصالات ستظهر هنا عند إصدارها من التبرعات"
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <Table
                columns={[
                  "رقم الإيصال",
                  "المتبرع",
                  "المشروع",
                  "المبلغ",
                  "التاريخ",
                  "الحالة",
                  "مطبوع",
                  "",
                ]}
                rows={receipts}
                renderRow={(r: Receipt) => (
                  <>
                    <Td className="font-mono text-xs">{r.number}</Td>
                    <Td className="font-semibold">{r.donorName || "—"}</Td>
                    <Td className="text-muted-foreground text-xs">{r.projectName || "—"}</Td>
                    <Td className="tabular-nums font-bold text-success">{fmtSAR(r.amount)}</Td>
                    <Td className="text-muted-foreground text-xs">{r.date}</Td>
                    <Td>
                      <Badge tone={statusToneLocal(r.status)}>{label("receiptStatus", r.status)}</Badge>
                    </Td>
                    <Td>
                      {r.printed ? (
                        <Badge tone="success">نعم</Badge>
                      ) : (
                        <Badge tone="muted">لا</Badge>
                      )}
                    </Td>
                    <Td>
                      <ActionMenu actions={getReceiptActions(r)} />
                    </Td>
                  </>
                )}
              />
            </div>

            <div className="lg:hidden space-y-2">
              {receipts.map((r: Receipt) => (
                <Card key={r.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{r.donorName || "—"}</span>
                    <span className="font-mono text-xs text-muted-foreground">{r.number}</span>
                  </div>
                  <div className="text-lg font-bold text-success">{fmtSAR(r.amount)}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">{r.date}</span>
                    <Badge tone={statusToneLocal(r.status)}>{label("receiptStatus", r.status)}</Badge>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      className="flex-1 rounded-lg bg-primary text-primary-foreground text-xs font-semibold py-2 min-h-[36px] flex items-center justify-center gap-1"
                      onClick={() => handlePrint(r)}
                    >
                      <Printer size={13} /> طباعة
                    </button>
                    <button
                      onClick={() => handlePrint(r)}
                      className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px] flex items-center justify-center gap-1"
                    >
                      <FileText size={13} /> PDF
                    </button>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
              <span>
                عرض {receipts.length} من {totalCount} إيصال
              </span>
            </div>
          </>
        )}
      </AppShell>

      {/* Print Receipt Modal/Drawer */}
      {printTarget && (
        <ReceiptPrintDrawer receipt={printTarget} onClose={() => setPrintTarget(null)} />
      )}

      <ConfirmDialog
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        onConfirm={handleVoid}
        title="إلغاء الإيصال"
        message={`هل أنت متأكد من إلغاء إيصال ${voidTarget?.number}؟ سيتم تحديث حالة التبرع المرتبطة.`}
        confirmText="إلغاء"
        cancelText="التراجع"
        variant="destructive"
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف الإيصال"
        message="هل أنت متأكد من حذف هذا الإيصال؟"
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option>الكل</option>
              {options("receiptStatus").map((o) => (
                <option key={o.value} value={o.label}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النوع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option>الكل</option>
              {options("receiptType").map((o) => (
                <option key={o.value} value={o.label}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </MobileFilterDrawer>

      <PrintStyle />
    </>
  );

  function getReceiptActions(r: Receipt) {
    const actions: any[] = [
      {
        label: "طباعة",
        icon: Printer,
        onClick: () => handlePrint(r),
      },
      {
        label: "عرض",
        icon: Eye,
        onClick: () => showToast(`${r.number}: ${r.donorName} - ${fmtSAR(r.amount)}`, "info"),
      },
    ];

    if (r.status !== ReceiptStatus.CANCELLED) {
      actions.push({
        label: "إلغاء",
        icon: XCircle,
        variant: "destructive" as const,
        onClick: () => setVoidTarget(r),
      });
    }

    return actions;
  }
}

// Receipt Print Drawer Component
function ReceiptPrintDrawer({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  useEffect(() => {
    window.print();
    onClose();
  }, []);

  return (
    <div className="print-only">
      <div className="p-8" dir="rtl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">ثواب — نظام إدارة الجمعيات الخيرية</h1>
          <h2 className="text-xl font-semibold mt-2">إيصال استلام تبرع</h2>
        </div>
        <div className="space-y-4">
          <div className="flex justify-between">
            <span>رقم الإيصال:</span>
            <span className="font-bold">{receipt.number}</span>
          </div>
          <div className="flex justify-between">
            <span>التاريخ:</span>
            <span>{receipt.date}</span>
          </div>
          <div className="flex justify-between">
            <span>المتبرع:</span>
            <span className="font-semibold">{receipt.donorName}</span>
          </div>
          <div className="flex justify-between">
            <span>المشروع:</span>
            <span>{receipt.projectName || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span>المبلغ:</span>
            <span className="font-bold text-lg text-success">{fmtSAR(receipt.amount)}</span>
          </div>
          <div className="flex justify-between">
            <span>طريقة الدفع:</span>
            <span>{label("receiptType", receipt.type)}</span>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t text-center text-sm text-muted-foreground">
          هذا إيصال رسمي صادر من جمعية ثواب الخيرية
        </div>
      </div>
    </div>
  );
}
