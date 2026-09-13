import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, Pencil } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { listPurchaseOrders, type PurchaseOrder } from "@/lib/api/governed-purchase-orders";

export const Route = createFileRoute("/procurement/purchase-orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء — ثواب" }] }),
  component: Page,
});

export const PO_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمد — بانتظار الإصدار", tone: "primary" },
  issued: { label: "صادر", tone: "success" },
  rejected: { label: "مرفوض", tone: "destructive" },
  cancelled: { label: "ملغى", tone: "warning" },
};

const QUEUES = [
  { key: "", label: "الكل" },
  { key: "draft", label: "مسودات" },
  { key: "submitted", label: "بانتظار الاعتماد" },
  { key: "approved", label: "معتمدة" },
  { key: "issued", label: "صادرة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "cancelled", label: "ملغاة" },
];

const NO_ACCOUNTING = "هذا الأمر لا يُنشئ قيدًا محاسبيًا ولا يؤثر على المخزون أو ذمم الموردين.";

function Page() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [queue, setQueue] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [queue, search]);

  const canCreate = userCan(user, "procurement.po.create");
  const canEdit = userCan(user, "procurement.po.update_draft");

  const listQ = useQuery({
    queryKey: ["purchase-orders", queue, search, page],
    queryFn: () =>
      listPurchaseOrders({
        status: queue || undefined,
        search: search || undefined,
        page,
        pageSize: 25,
      }),
  });
  const items = listQ.data?.items || [];
  const summary = listQ.data?.summary;

  const openDetail = (id: string) =>
    nav({ to: "/procurement/purchase-orders/$id", params: { id } as any });
  const openEdit = (id: string) =>
    nav({ to: "/procurement/purchase-orders/$id/edit", params: { id } as any });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء"]}
      title="أوامر الشراء"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => nav({ to: "/procurement/purchase-orders/new" })}>
            <Plus size={15} /> أمر شراء جديد
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="مسودات" value={summary?.draft ?? 0} />
        <SummaryCard label="بانتظار الاعتماد" value={summary?.submitted ?? 0} />
        <SummaryCard label="صادرة" value={summary?.issued ?? 0} />
        <SummaryCard
          label="قيمة الالتزام (معتمد/صادر)"
          money
          value={summary?.committedValue ?? 0}
        />
      </div>

      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground mb-3">
        {NO_ACCOUNTING}
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
          placeholder="بحث برقم الأمر / الموضوع…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد أوامر شراء"
          description="أنشئ أول أمر شراء (التزام شرائي بدون أثر محاسبي)"
        />
      ) : (
        <Table
          columns={[
            "رقم الأمر",
            "التاريخ",
            "التسليم المتوقع",
            "الصافي",
            "الضريبة",
            "الإجمالي",
            "الحالة",
            "",
          ]}
          rows={items}
          renderRow={(v: PurchaseOrder) => (
            <>
              <Td
                className="font-mono text-xs font-semibold cursor-pointer hover:underline"
                onClick={() => openDetail(v.id)}
              >
                {v.poNumber}
              </Td>
              <Td className="text-xs tabular-nums">{v.date}</Td>
              <Td className="text-xs tabular-nums">{v.deliveryDate || "—"}</Td>
              <Td className="tabular-nums">{fmtSAR(v.subtotal)}</Td>
              <Td className="tabular-nums text-xs">{fmtSAR(v.taxAmount)}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(v.totalAmount)}</Td>
              <Td>
                <Badge tone={PO_STATUS[v.status]?.tone || "muted"}>
                  {PO_STATUS[v.status]?.label || v.status}
                </Badge>
              </Td>
              <Td>
                <div className="flex gap-1 justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="عرض"
                    onClick={() => openDetail(v.id)}
                  >
                    <Eye size={15} />
                  </button>
                  {canEdit && v.status === "draft" && (
                    <button
                      className="p-1.5 rounded hover:bg-muted"
                      title="تعديل المسودة"
                      onClick={() => openEdit(v.id)}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
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
        unit="أمر"
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
