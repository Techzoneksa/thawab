import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, Landmark, Wallet } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { listPaymentVouchers, type PaymentVoucher } from "@/lib/api/payment-vouchers";

export const Route = createFileRoute("/finance/payment-vouchers")({
  head: () => ({ meta: [{ title: "سندات الصرف — ثواب" }] }),
  component: Page,
});

export const PV_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمد — بانتظار الترحيل", tone: "primary" },
  posted: { label: "مُرحَّل", tone: "success" },
  rejected: { label: "مرفوض", tone: "destructive" },
  reversed: { label: "معكوس", tone: "warning" },
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

  const canCreate = userCan(user, "finance.payment.create");
  const openDetail = (id: string) =>
    nav({ to: "/finance/payment-vouchers/$id", params: { id } as any });

  const listQ = useQuery({
    queryKey: ["payment-vouchers", queue, search, page],
    queryFn: () =>
      listPaymentVouchers({
        status: queue || undefined,
        search: search || undefined,
        page,
        pageSize: 25,
      }),
  });
  const items = listQ.data?.items || [];
  const summary = listQ.data?.summary;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "سندات الصرف"]}
      title="سندات الصرف"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => nav({ to: "/finance/payment-vouchers/new" })}>
            <Plus size={15} /> سند صرف جديد
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="مسودات" value={summary?.draft ?? 0} />
        <SummaryCard label="بانتظار الاعتماد" value={summary?.submitted ?? 0} />
        <SummaryCard label="بانتظار الترحيل" value={summary?.approved ?? 0} />
        <SummaryCard label="مُرحَّلة" value={summary?.posted ?? 0} />
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
          placeholder="بحث برقم السند / المستفيد…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد سندات صرف"
          description="أنشئ أول سند صرف لدفع مبلغ من صندوق أو حساب بنكي"
        />
      ) : (
        <Table
          columns={["رقم السند", "التاريخ", "المستفيد", "المصدر", "المبلغ", "الحالة", "القيد", ""]}
          rows={items}
          renderRow={(v: PaymentVoucher) => (
            <>
              <Td
                className="font-mono text-xs font-semibold cursor-pointer hover:underline"
                onClick={() => openDetail(v.id)}
              >
                {v.voucherNumber}
              </Td>
              <Td className="text-xs tabular-nums">{v.voucherDate}</Td>
              <Td className="font-medium">{v.payeeName || "—"}</Td>
              <Td className="text-xs">
                {v.cashboxId ? (
                  <span className="inline-flex items-center gap-1">
                    <Wallet size={12} /> صندوق
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Landmark size={12} /> بنك
                  </span>
                )}
              </Td>
              <Td className="tabular-nums font-bold">{fmtSAR(v.totalAmount)}</Td>
              <Td>
                <Badge tone={PV_STATUS[v.status]?.tone || "muted"}>
                  {PV_STATUS[v.status]?.label || v.status}
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
        unit="سند"
        onPage={setPage}
      />
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3 lg:p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg lg:text-2xl font-extrabold mt-1 tabular-nums">{value}</div>
    </Card>
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
