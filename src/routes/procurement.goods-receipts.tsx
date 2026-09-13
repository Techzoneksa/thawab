import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { listGoodsReceipts, type GoodsReceipt } from "@/lib/api/goods-receipts";

export const Route = createFileRoute("/procurement/goods-receipts")({
  head: () => ({ meta: [{ title: "سندات الاستلام — ثواب" }] }),
  component: Page,
});

export const GRN_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمد", tone: "info" },
  rejected: { label: "مرفوض", tone: "danger" },
  posted: { label: "مُرحَّل", tone: "success" },
  reversed: { label: "معكوس", tone: "warning" },
};

const GRNI_NOTE =
  "سند الاستلام يقيّد: مدين المستلَم (مخزون/مصروف/أصل) / دائن «بضاعة مستلمة لم تُفوتر (GRNI)». لا يمس الذمم الدائنة ولا رصيد المورد.";

function Page() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search]);
  const canCreate = userCan(user, "procurement.grn.create");

  const listQ = useQuery({
    queryKey: ["goods-receipts", search, page],
    queryFn: () => listGoodsReceipts({ search: search || undefined, page, pageSize: 25 }),
  });
  const items = listQ.data?.items || [];
  const summary = listQ.data?.summary;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "سندات الاستلام"]}
      title="سندات الاستلام"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => nav({ to: "/procurement/goods-receipts/new" })}>
            <Plus size={15} /> إنشاء سند استلام
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard
          label="مسودة/بانتظار"
          value={(summary?.draft ?? 0) + (summary?.submitted ?? 0)}
        />
        <SummaryCard label="مُرحَّلة" value={summary?.posted ?? 0} />
        <SummaryCard label="معكوسة" value={summary?.reversed ?? 0} />
        <SummaryCard label="قيمة GRNI المُرحَّلة" money value={summary?.grniValue ?? 0} />
      </div>

      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground mb-3">
        {GRNI_NOTE}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <input
          className="inp !w-56 ms-auto"
          placeholder="بحث برقم السند…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState title="لا توجد سندات استلام" description="سجّل أول استلام من أمر شراء صادر" />
      ) : (
        <Table
          columns={["رقم السند", "التاريخ", "أمر الشراء", "القيمة (GRNI)", "الحالة", ""]}
          rows={items}
          renderRow={(v: GoodsReceipt) => (
            <>
              <Td className="font-mono text-xs font-semibold">{v.grnNumber}</Td>
              <Td className="text-xs tabular-nums">{v.receiptDate}</Td>
              <Td className="text-xs font-mono">{v.purchaseOrderId.slice(0, 10)}…</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(v.totalValue)}</Td>
              <Td>
                <Badge tone={GRN_STATUS[v.status]?.tone || "muted"}>
                  {GRN_STATUS[v.status]?.label || v.status}
                </Badge>
              </Td>
              <Td>
                <div className="flex gap-1 justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="عرض"
                    onClick={() =>
                      nav({ to: "/procurement/goods-receipts/$id", params: { id: v.id } as any })
                    }
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
