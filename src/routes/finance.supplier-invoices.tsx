import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { listSupplierInvoices, type SupplierInvoice } from "@/lib/api/supplier-invoices";

export const Route = createFileRoute("/finance/supplier-invoices")({
  head: () => ({ meta: [{ title: "فواتير الموردين — ثواب" }] }),
  component: Page,
});

export const SI_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمدة — بانتظار الترحيل", tone: "primary" },
  posted: { label: "مُرحَّلة", tone: "success" },
  rejected: { label: "مرفوضة", tone: "destructive" },
  reversed: { label: "معكوسة", tone: "warning" },
};

const QUEUES = [
  { key: "", label: "الكل" },
  { key: "draft", label: "مسودات" },
  { key: "submitted", label: "بانتظار الاعتماد" },
  { key: "approved", label: "معتمدة بانتظار الترحيل" },
  { key: "posted", label: "مرحلة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "reversed", label: "معكوسة" },
];

function Page() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [queue, setQueue] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [queue, search]);

  const canCreate = userCan(user, "finance.supplier_invoice.create");

  const listQ = useQuery({
    queryKey: ["supplier-invoices", queue, search, page],
    queryFn: () =>
      listSupplierInvoices({
        status: queue || undefined,
        search: search || undefined,
        page,
        pageSize: 25,
      }),
  });
  const items = listQ.data?.items || [];
  const summary = listQ.data?.summary;

  const openDetail = (id: string) =>
    nav({ to: "/finance/supplier-invoices/$id", params: { id } as any });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "فواتير الموردين"]}
      title="فواتير الموردين"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => nav({ to: "/finance/supplier-invoices/new" })}>
            <Plus size={15} /> فاتورة مورد جديدة
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="مسودات" value={summary?.draft ?? 0} />
        <SummaryCard label="بانتظار الاعتماد" value={summary?.submitted ?? 0} />
        <SummaryCard label="بانتظار الترحيل" value={summary?.approved ?? 0} />
        <SummaryCard label="إجمالي المستحق المُرحَّل" money value={summary?.outstanding ?? 0} />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUEUES.map((q) => (
          <button
            key={q.key || "all"}
            onClick={() => setQueue(q.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${queue === q.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
          >
            {q.label}
          </button>
        ))}
        <input
          className="inp !w-56 ms-auto"
          placeholder="بحث برقم الفاتورة / رقم المورد…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد فواتير موردين"
          description="سجّل أول فاتورة مورد لإثبات ذمة دائنة (استحقاق) عند الترحيل"
        />
      ) : (
        <Table
          columns={[
            "رقم الفاتورة",
            "رقم المورد",
            "التاريخ",
            "الاستحقاق",
            "الصافي",
            "الضريبة",
            "الإجمالي",
            "الحالة",
            "القيد",
            "",
          ]}
          rows={items}
          renderRow={(v: SupplierInvoice) => (
            <>
              <Td
                className="font-mono text-xs font-semibold cursor-pointer hover:underline"
                onClick={() => openDetail(v.id)}
              >
                {v.invoiceNumber}
              </Td>
              <Td className="text-xs">{v.supplierInvoiceNumber || "—"}</Td>
              <Td className="text-xs tabular-nums">{v.invoiceDate}</Td>
              <Td className="text-xs tabular-nums">{v.dueDate || "—"}</Td>
              <Td className="tabular-nums">{fmtSAR(v.subtotal)}</Td>
              <Td className="tabular-nums text-xs">{fmtSAR(v.taxAmount)}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(v.totalAmount)}</Td>
              <Td>
                <Badge tone={SI_STATUS[v.status]?.tone || "muted"}>
                  {SI_STATUS[v.status]?.label || v.status}
                </Badge>
              </Td>
              <Td className="text-xs font-mono text-muted-foreground">
                {v.journalEntryId ? "✓" : "—"}
              </Td>
              <Td>
                <div className="flex gap-1 justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="عرض التفاصيل"
                    onClick={() => openDetail(v.id)}
                  >
                    <Eye size={15} />
                  </button>
                </div>
              </Td>
            </>
          )}
        />
      )}
      <Pager
        page={listQ.data?.page || page}
        totalPages={listQ.data?.totalPages || 1}
        total={listQ.data?.total || items.length}
        pageSize={listQ.data?.pageSize || 25}
        unit="فاتورة"
        onPage={setPage}
      />
    </AppShell>
  );
}

function SummaryCard({ label, value, money }: { label: string; value: number; money?: boolean }) {
  return (
    <Card className="p-3 lg:p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg lg:text-2xl font-extrabold mt-1 tabular-nums">
        {money ? fmtSAR(value) : value}
      </div>
    </Card>
  );
}

export function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${bold ? "font-bold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-base font-extrabold" : "font-semibold"}`}>
        {fmtSAR(value)}
      </span>
    </div>
  );
}

export function Timeline({
  history,
}: {
  history: {
    id: string;
    action: string;
    toStatus: string | null;
    userName: string;
    reason: string;
    createdAt: string;
  }[];
}) {
  const LABEL: Record<string, string> = {
    create: "إنشاء",
    submit: "إرسال للاعتماد",
    approve: "اعتماد",
    return: "إعادة للمسودة",
    reject: "رفض",
    post: "ترحيل",
    reverse: "عكس",
  };
  if (!history?.length) return null;
  return (
    <div>
      <div className="text-xs font-bold mb-2">سجل الإجراءات</div>
      <ol className="space-y-1.5">
        {history.map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-[11px]">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <div>
              <span className="font-semibold">{LABEL[e.action] || e.action}</span>
              <span className="text-muted-foreground"> — {e.userName} · </span>
              <span className="tabular-nums text-muted-foreground">
                {String(e.createdAt).slice(0, 16).replace("T", " ")}
              </span>
              {e.reason ? <div className="text-muted-foreground">السبب: {e.reason}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ReasonDialog({
  title,
  onCancel,
  onConfirm,
  loading,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}) {
  const [r, setR] = useState("");
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-xl bg-background p-4 shadow-xl border">
        <div className="font-bold mb-2">{title}</div>
        <textarea
          className="inp"
          rows={3}
          placeholder="اكتب السبب (مطلوب)…"
          value={r}
          onChange={(e) => setR(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <Btn variant="ghost" onClick={onCancel}>
            إلغاء
          </Btn>
          <Btn variant="primary" onClick={() => onConfirm(r)} disabled={!r.trim() || loading}>
            تأكيد
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
