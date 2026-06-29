import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Table,
  Td,
  statusTone,
  FilterBar,
  Select,
  MobileTable,
  MobilePageHeader,
  MobileFilterDrawer,
} from "@/components/erp/AppShell";
import { PURCHASE_REQUESTS, fmtSAR } from "@/data/sample";
import {
  Plus,
  ClipboardList,
  Filter,
  Eye,
  Edit,
  Trash2,
  XCircle,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type RequestItem = {
  id: string;
  subject: string;
  requester: string;
  project: string;
  amount: number;
  status: string;
  date: string;
};

function ProcurementRequestsPage() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [data, setData] = useState<RequestItem[]>(PURCHASE_REQUESTS as RequestItem[]);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  const [editIdx, setEditIdx] = useState(-1);
  const [confirmDlg, setConfirmDlg] = useState<{ idx: number; action: string } | null>(null);
  const [detailIdx, setDetailIdx] = useState(-1);
  const [formSubject, setFormSubject] = useState("");
  const [formDept, setFormDept] = useState("إدارة المساعدات");
  const [formPriority, setFormPriority] = useState("متوسطة");
  const [formDelivery, setFormDelivery] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const nextId = () => `PR-${1446}-${String(100 + data.length + 1).slice(-4)}`;

  const resetForm = () => {
    setFormSubject("");
    setFormDept("إدارة المساعدات");
    setFormPriority("متوسطة");
    setFormDelivery("");
    setFormNotes("");
  };

  const handleSave = () => {
    if (!formSubject.trim()) {
      showToast("يرجى إدخال اسم الطلب", "error");
      return;
    }
    if (formMode === "add") {
      setData([
        {
          id: nextId(),
          subject: formSubject,
          requester: formDept,
          project: "—",
          amount: 0,
          status: "بانتظار الموافقة",
          date: new Date().toLocaleDateString("ar-SA"),
        },
        ...data,
      ]);
      showToast("تم إنشاء طلب الشراء بنجاح", "success");
    } else {
      const d = [...data];
      d[editIdx] = {
        ...d[editIdx],
        subject: formSubject,
        requester: formDept,
        date: formDelivery || d[editIdx].date,
      };
      setData(d);
      showToast("تم تعديل طلب الشراء بنجاح", "success");
    }
    setFormOpen(false);
    resetForm();
  };

  const handleDelete = (idx: number) => {
    const d = data.filter((_, i) => i !== idx);
    setData(d);
    showToast("تم حذف طلب الشراء بنجاح", "success");
    setConfirmDlg(null);
  };

  const handleStatus = (idx: number, newStatus: string) => {
    const d = [...data];
    d[idx] = { ...d[idx], status: newStatus };
    setData(d);
    showToast(`تم تغيير الحالة إلى ${newStatus}`, "success");
  };

  const statusSteps = ["بانتظار الموافقة", "معتمد", "تم التحويل لأمر شراء", "مستلم", "مغلق"];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "طلبات الشراء"]}
      title="طلبات الشراء"
      actions={
        <>
          <ExportButton data={data} filename="purchase-requests.csv" />
          <Btn
            variant="primary"
            onClick={() => {
              setFormMode("add");
              resetForm();
              setFormOpen(true);
            }}
          >
            <Plus size={15} />
            إنشاء طلب شراء
          </Btn>
        </>
      }
    >
      <FilterBar>
        <Select
          label="الحالة"
          options={["الكل", "بانتظار الموافقة", "معتمد", "مرفوض", "تم التحويل لأمر شراء"]}
        />
        <Select
          label="الإدارة"
          options={["الكل", "إدارة المساعدات", "تقنية المعلومات", "إدارة المشاريع"]}
        />
        <Select label="المشروع" options={["الكل", "PRJ-016", "PRJ-017", "PRJ-018"]} />
        <Btn variant="ghost" className="lg:hidden" onClick={() => setFilterOpen(true)}>
          <Filter size={15} />
        </Btn>
      </FilterBar>

      <MobilePageHeader title="طلبات الشراء" count={`${data.length} طلب`} />

      <MobileTable
        columns={["الرقم", "الموضوع", "مقدم الطلب", "المشروع", "المبلغ", "التاريخ", "الحالة", ""]}
        rows={data}
        renderRow={(r, idx) => (
          <>
            <Td className="font-mono text-xs">{r.id}</Td>
            <Td className="font-semibold">
              <ClipboardList size={13} className="inline ms-1 text-primary" />
              {r.subject}
            </Td>
            <Td className="text-muted-foreground">{r.requester}</Td>
            <Td className="font-mono text-xs">{r.project}</Td>
            <Td className="tabular-nums font-bold">{fmtSAR(r.amount)}</Td>
            <Td className="text-muted-foreground">{r.date}</Td>
            <Td>
              <Badge tone={statusTone(r.status)}>{r.status}</Badge>
            </Td>
            <Td>
              <ActionMenu
                actions={[
                  { label: "عرض", icon: Eye, onClick: () => setDetailIdx(idx) },
                  {
                    label: "تعديل",
                    icon: Edit,
                    onClick: () => {
                      setFormMode("edit");
                      setEditIdx(idx);
                      setFormSubject(r.subject);
                      setFormDept(r.requester);
                      setFormDelivery(r.date);
                      setFormOpen(true);
                    },
                  },
                  ...statusSteps
                    .filter(
                      (s) =>
                        s !== r.status && statusSteps.indexOf(s) > statusSteps.indexOf(r.status),
                    )
                    .map((s) => ({
                      label: `تحويل إلى ${s}`,
                      icon: ArrowRight,
                      onClick: () => handleStatus(idx, s),
                    })),
                  { label: "إلغاء", icon: XCircle, onClick: () => handleStatus(idx, "ملغي") },
                  {
                    label: "حذف",
                    icon: Trash2,
                    variant: "destructive" as const,
                    onClick: () => setConfirmDlg({ idx, action: "delete" }),
                  },
                ]}
              />
            </Td>
          </>
        )}
        mobileCard={(r, idx) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate">{r.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {r.requester} · {r.date}
                </div>
              </div>
              <Badge tone={statusTone(r.status)}>{r.status}</Badge>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <div className="text-base font-bold tabular-nums">{fmtSAR(r.amount)}</div>
                <div className="text-xs text-muted-foreground font-mono">{r.id}</div>
              </div>
              <div className="text-xs text-muted-foreground">{r.project}</div>
            </div>
            <div className="mt-2 pt-2 border-t flex gap-2">
              <button
                className="flex-1 rounded-lg bg-success/15 text-success py-2 text-xs font-semibold min-h-[36px]"
                onClick={() => handleStatus(idx, "معتمد")}
              >
                اعتماد
              </button>
              <button
                className="flex-1 rounded-lg border py-2 text-xs font-semibold min-h-[36px]"
                onClick={() => setDetailIdx(idx)}
              >
                تفاصيل
              </button>
            </div>
          </Card>
        )}
      />

      <MobileFilterDrawer open={filterOpen} onClose={() => setFilterOpen(false)}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]">
              <option>الكل</option>
              <option>بانتظار الموافقة</option>
              <option>معتمد</option>
              <option>مرفوض</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الإدارة</label>
            <select className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[44px]">
              <option>الكل</option>
              <option>إدارة المساعدات</option>
            </select>
          </div>
        </div>
      </MobileFilterDrawer>

      <EntityFormDrawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={formMode === "add" ? "إنشاء طلب شراء" : "تعديل طلب شراء"}
        onSave={handleSave}
      >
        <div>
          <label className="text-xs font-semibold text-muted-foreground">اسم الطلب</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formSubject}
            onChange={(e) => setFormSubject(e.target.value)}
            placeholder="مستلزمات سلال غذائية"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">القسم</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formDept}
            onChange={(e) => setFormDept(e.target.value)}
          >
            <option>إدارة المساعدات</option>
            <option>تقنية المعلومات</option>
            <option>إدارة المشاريع</option>
            <option>الإدارة المالية</option>
            <option>المشتريات</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">الأولوية</label>
          <select
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            value={formPriority}
            onChange={(e) => setFormPriority(e.target.value)}
          >
            <option>منخفضة</option>
            <option>متوسطة</option>
            <option>عالية</option>
            <option>عاجلة</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">تاريخ التوريد</label>
          <input
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
            type="date"
            value={formDelivery}
            onChange={(e) => setFormDelivery(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
          <textarea
            className="w-full rounded-lg border bg-background p-3 text-sm mt-1 min-h-[80px]"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="ملاحظات..."
          />
        </div>
      </EntityFormDrawer>

      {confirmDlg && (
        <ConfirmDialog
          open
          onClose={() => setConfirmDlg(null)}
          onConfirm={() => handleDelete(confirmDlg.idx)}
          title="تأكيد الحذف"
          message="هل أنت متأكد من حذف طلب الشراء هذا؟"
          confirmText="حذف"
          cancelText="إلغاء"
          variant="destructive"
        />
      )}

      {detailIdx >= 0 && (
        <ConfirmDialog
          open
          onClose={() => setDetailIdx(-1)}
          onConfirm={() => setDetailIdx(-1)}
          title={data[detailIdx]?.subject || ""}
          message={`الرقم: ${data[detailIdx]?.id}\nمقدم الطلب: ${data[detailIdx]?.requester}\nالحالة: ${data[detailIdx]?.status}\nالتاريخ: ${data[detailIdx]?.date}`}
          confirmText="إغلاق"
          cancelText=""
        />
      )}
    </AppShell>
  );
}

export const Route = createFileRoute("/procurement/requests")({
  head: () => ({ meta: [{ title: "طلبات الشراء — ثواب" }] }),
  component: ProcurementRequestsPage,
});
