import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  FilterBar,
  Select,
  Btn,
  statusTone,
  MobileTabBar,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { label, options } from "@/lib/i18n/labels";
import {
  getApprovals,
  actOnApproval,
  deleteApproval,
  type Approval,
  type ApprovalAction,
} from "@/lib/api/approvals";
import { ApprovalStatus, Priority } from "@/lib/enums";
import { CheckCircle2, XCircle, RotateCcw, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ExportButton,
  EmptyState,
} from "@/components/erp/actions";

// Approval "type" is free text; these are the standard request categories.
const TYPE_OPTIONS = ["قيد يومية", "طلب شراء", "مساعدة", "ميزانية مشروع", "فاتورة مورد", "أخرى"];

const STATUS_TABS = [
  { name: "بانتظار الموافقة", status: ApprovalStatus.PENDING },
  { name: "معتمدة", status: ApprovalStatus.APPROVED },
  { name: "مرفوضة", status: ApprovalStatus.REJECTED },
  { name: "مُعادة للتصحيح", status: ApprovalStatus.RETURNED },
];

export const Route = createFileRoute("/approvals")({
  head: () => ({ meta: [{ title: "صندوق الموافقات — ثواب" }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tabStatus, setTabStatus] = useState<string>(ApprovalStatus.PENDING);
  const [typeFilter, setTypeFilter] = useState("الكل");
  const [priorityFilter, setPriorityFilter] = useState("الكل");

  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Pending reject/return awaiting an optional note.
  const [noteAction, setNoteAction] = useState<{ id: string; action: ApprovalAction } | null>(null);
  const [noteText, setNoteText] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["approvals"],
    queryFn: () => getApprovals(),
  });
  const all: Approval[] = data?.items ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["approvals"] });

  const countByStatus = (s: string) => all.filter((a) => a.status === s).length;

  const filtered = all.filter((a) => {
    if (a.status !== tabStatus) return false;
    if (typeFilter !== "الكل" && a.type !== typeFilter) return false;
    if (priorityFilter !== "الكل" && a.priority !== priorityFilter) return false;
    return true;
  });

  const actMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: ApprovalAction; note?: string }) =>
      actOnApproval(id, action, note),
    onSuccess: (_r, v) => {
      invalidate();
      const msg =
        v.action === "approve"
          ? "تم اعتماد الطلب"
          : v.action === "reject"
            ? "تم رفض الطلب"
            : "تم إرجاع الطلب للتصحيح";
      showToast(msg, v.action === "reject" ? "info" : "success");
      setNoteAction(null);
      setNoteText("");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteApproval,
    onSuccess: () => {
      invalidate();
      showToast("تم حذف الطلب", "success");
      setConfirmId(null);
    },
    onError: (e: Error) => {
      showToast(e.message, "error");
      setConfirmId(null);
    },
  });

  const tabNames = STATUS_TABS.map((t) => `${t.name} (${countByStatus(t.status)})`);
  const activeTabName = `${STATUS_TABS.find((t) => t.status === tabStatus)!.name} (${countByStatus(tabStatus)})`;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الموافقات"]}
      title="صندوق الموافقات"
      actions={
        <>
          <ExportButton
            data={all as unknown as Record<string, unknown>[]}
            filename="approvals.csv"
          />
          <Btn variant="primary" onClick={() => navigate({ to: "/approvals/new" })}>
            <Plus size={15} /> طلب موافقة
          </Btn>
        </>
      }
    >
      <div className="hidden lg:flex flex-wrap items-center gap-1 border-b mb-4">
        {STATUS_TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => setTabStatus(t.status)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tabStatus === t.status ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.name}{" "}
            <span className="mr-1 text-xs rounded-full bg-muted px-2 py-0.5">
              {countByStatus(t.status)}
            </span>
          </button>
        ))}
      </div>

      <MobilePageHeader title="صندوق الموافقات" />

      <div className="lg:hidden mb-3">
        <MobileTabBar
          tabs={tabNames}
          active={activeTabName}
          onChange={(name) => {
            const t = STATUS_TABS.find((x) => name.startsWith(x.name));
            if (t) setTabStatus(t.status);
          }}
        />
      </div>

      <FilterBar>
        <Select
          label="النوع"
          options={["الكل", ...TYPE_OPTIONS]}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        />
        <Select
          label="الأولوية"
          options={["الكل", ...options("priority").map((o) => o.label)]}
          value={priorityFilter === "الكل" ? "الكل" : label("priority", priorityFilter)}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "الكل") return setPriorityFilter("الكل");
            const match = options("priority").find((o) => o.label === v);
            setPriorityFilter(match?.value ?? "الكل");
          }}
        />
      </FilterBar>

      <div className="space-y-3">
        {isLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</div>
        )}
        {error && (
          <div className="text-sm text-destructive py-8 text-center">فشل في تحميل الموافقات</div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <EmptyState title="لا توجد طلبات" description="لا توجد طلبات في هذه الحالة" />
        )}
        {filtered.map((a) => (
          <Card key={a.id} className="p-3 lg:p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] text-muted-foreground">{a.id}</span>
              <Badge tone="primary">{a.type}</Badge>
              <Badge
                tone={
                  a.priority === Priority.HIGH || a.priority === Priority.URGENT
                    ? "destructive"
                    : a.priority === Priority.MEDIUM
                      ? "warning"
                      : "muted"
                }
              >
                {label("priority", a.priority)}
              </Badge>
              <Badge tone={statusTone(a.status)}>{label("approvalStatus", a.status)}</Badge>
            </div>
            <h4 className="mt-1 font-semibold text-sm">{a.subject}</h4>
            <div className="mt-1 text-xs text-muted-foreground">
              {a.requester} · المستوى: {a.level}
            </div>
            {a.notes && (
              <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
                📝 {a.notes}
              </div>
            )}
            <div className="mt-2 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              <span className="tabular-nums font-bold text-base lg:text-lg">
                {fmtSAR(a.amount)}
              </span>
              {a.status === ApprovalStatus.PENDING ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => actMutation.mutate({ id: a.id, action: "approve" })}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-success/15 text-success px-3 py-1.5 text-xs font-semibold hover:bg-success/25 min-h-[32px]"
                  >
                    <CheckCircle2 size={14} /> اعتماد
                  </button>
                  <button
                    onClick={() => {
                      setNoteAction({ id: a.id, action: "return" });
                      setNoteText("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-warning/20 text-warning-foreground px-3 py-1.5 text-xs font-semibold hover:bg-warning/30 min-h-[32px]"
                  >
                    <RotateCcw size={14} /> إعادة
                  </button>
                  <button
                    onClick={() => {
                      setNoteAction({ id: a.id, action: "reject" });
                      setNoteText("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/15 text-destructive px-3 py-1.5 text-xs font-semibold hover:bg-destructive/25 min-h-[32px]"
                  >
                    <XCircle size={14} /> رفض
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(a.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted min-h-[32px] text-destructive"
                >
                  <Trash2 size={14} /> حذف
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Note-carrying reject / return */}
      <EntityFormDrawer
        open={noteAction !== null}
        onClose={() => setNoteAction(null)}
        title={noteAction?.action === "reject" ? "رفض الطلب" : "إرجاع الطلب للتصحيح"}
        onSave={() => {
          if (noteAction)
            actMutation.mutate({ id: noteAction.id, action: noteAction.action, note: noteText });
        }}
        saveText="تأكيد"
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الملاحظة (اختياري)</label>
          <textarea
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            rows={4}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="سبب الرفض أو ملاحظات التصحيح..."
          />
        </div>
      </EntityFormDrawer>

      {confirmId !== null && (
        <ConfirmDialog
          open
          onClose={() => setConfirmId(null)}
          onConfirm={() => deleteMutation.mutate(confirmId)}
          title="تأكيد الحذف"
          message="هل أنت متأكد من حذف هذا الطلب؟"
          confirmText="حذف"
          variant="destructive"
        />
      )}
    </AppShell>
  );
}
