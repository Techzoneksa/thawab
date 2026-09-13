import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Link2, Plus } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { listCustomerReceipts, type CustomerReceiptRow } from "@/lib/api/ar-allocation";

export const Route = createFileRoute("/finance/customer-receipts")({
  head: () => ({ meta: [{ title: "تحصيل العملاء والتخصيص — ثواب" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const nav = useNavigate();
  const canCreate = userCan(user, "finance.customer_receipt.create");
  const [search, setSearch] = useState("");
  const [onlyUnapplied, setOnlyUnapplied] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, onlyUnapplied]);

  const listQ = useQuery({
    queryKey: ["customer-receipts", search, onlyUnapplied, page],
    queryFn: () =>
      listCustomerReceipts({ search: search || undefined, onlyUnapplied, page, pageSize: 25 }),
  });
  const items = listQ.data?.items || [];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "تحصيل العملاء والتخصيص"]}
      title="تحصيل العملاء والتخصيص"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => nav({ to: "/finance/customer-receipts/new" })}>
            <Plus size={15} /> تسجيل تحصيل
          </Btn>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="inp !w-64"
          placeholder="بحث برقم السند / المرجع / العميل…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={onlyUnapplied}
            onChange={(e) => setOnlyUnapplied(e.target.checked)}
          />
          غير مُخصَّصة فقط
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد سندات قبض مُرحَّلة"
          description="سجّل تحصيلاً من عميل ليظهر هنا للتخصيص على فواتيره"
        />
      ) : (
        <Table
          columns={[
            "رقم السند",
            "التاريخ",
            "العميل",
            "قيمة التحصيل",
            "المُخصَّص",
            "غير المُخصَّص",
            "",
          ]}
          rows={items}
          renderRow={(p: CustomerReceiptRow) => (
            <>
              <Td
                className="font-mono text-xs font-semibold cursor-pointer hover:underline"
                onClick={() =>
                  nav({ to: "/finance/customer-receipts/$id", params: { id: p.id } as any })
                }
              >
                {p.id}
              </Td>
              <Td className="text-xs tabular-nums">{p.receiptDate}</Td>
              <Td className="text-xs">
                {p.customerCode ? `${p.customerCode} — ` : ""}
                {p.customerName}
              </Td>
              <Td className="tabular-nums font-bold">{fmtSAR(p.arCredit)}</Td>
              <Td className="tabular-nums text-xs">{fmtSAR(p.allocated)}</Td>
              <Td>
                <Badge tone={p.unapplied > 0.005 ? "warning" : "success"}>
                  {fmtSAR(p.unapplied)}
                </Badge>
              </Td>
              <Td>
                <div className="flex justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="تخصيص التحصيل"
                    onClick={() =>
                      nav({ to: "/finance/customer-receipts/$id", params: { id: p.id } as any })
                    }
                  >
                    <Link2 size={15} />
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
