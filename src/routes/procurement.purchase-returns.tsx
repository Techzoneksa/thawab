import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { listPurchaseReturns, type PurchaseReturnRow } from "@/lib/api/purchase-returns";

export const Route = createFileRoute("/procurement/purchase-returns")({
  head: () => ({ meta: [{ title: "مرتجعات المشتريات — جاد كلاود" }] }),
  component: Page,
});

const STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "مُرسَل", tone: "info" },
  approved: { label: "معتمد", tone: "primary" },
  rejected: { label: "مرفوض", tone: "destructive" },
  posted: { label: "مُرحَّل", tone: "success" },
  reversed: { label: "معكوس", tone: "warning" },
};

function Page() {
  const { user } = useAuth();
  const nav = useNavigate();
  const canCreate = userCan(user, "procurement.purchase_return.create");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search]);

  const listQ = useQuery({
    queryKey: ["purchase-returns", search, page],
    queryFn: () => listPurchaseReturns({ search: search || undefined, page, pageSize: 25 }),
  });
  const items = listQ.data?.items || [];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "مرتجعات المشتريات"]}
      title="مرتجعات المشتريات"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => nav({ to: "/procurement/purchase-returns/new" })}>
            <Plus size={15} /> مرتجع جديد
          </Btn>
        ) : null
      }
    >
      <div className="mb-3">
        <input
          className="inp !w-72"
          placeholder="بحث برقم المرتجع…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد مرتجعات"
          description="أنشئ مرتجعاً للكمية المستلمة غير المفوترة"
        />
      ) : (
        <Table
          columns={["رقم المرتجع", "التاريخ", "سند الاستلام", "أمر الشراء", "القيمة", "الحالة", ""]}
          rows={items}
          renderRow={(r: PurchaseReturnRow) => (
            <>
              <Td className="font-mono text-xs font-semibold">{r.returnNumber}</Td>
              <Td className="text-xs tabular-nums">{r.returnDate}</Td>
              <Td className="text-xs font-mono">{r.grnNumber || "—"}</Td>
              <Td className="text-xs font-mono">{r.poNumber || "—"}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(r.totalValue)}</Td>
              <Td>
                <Badge tone={STATUS[r.status]?.tone || "muted"}>
                  {STATUS[r.status]?.label || r.status}
                </Badge>
              </Td>
              <Td>
                <div className="flex justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="عرض"
                    onClick={() =>
                      nav({ to: "/procurement/purchase-returns/$id", params: { id: r.id } as any })
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
        unit="مرتجع"
        onPage={setPage}
      />
    </AppShell>
  );
}
