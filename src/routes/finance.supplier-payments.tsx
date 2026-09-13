import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Link2 } from "lucide-react";
import { listSupplierPaymentsForAlloc, type SupplierPaymentRow } from "@/lib/api/ap-allocation";

export const Route = createFileRoute("/finance/supplier-payments")({
  head: () => ({ meta: [{ title: "دفعات الموردين والتخصيص — ثواب" }] }),
  component: Page,
});

function Page() {
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [onlyUnapplied, setOnlyUnapplied] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, onlyUnapplied]);

  const listQ = useQuery({
    queryKey: ["supplier-payments-alloc", search, onlyUnapplied, page],
    queryFn: () =>
      listSupplierPaymentsForAlloc({
        search: search || undefined,
        onlyUnapplied,
        page,
        pageSize: 25,
      }),
  });
  const items = listQ.data?.items || [];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "دفعات الموردين والتخصيص"]}
      title="دفعات الموردين والتخصيص"
    >
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="inp !w-64"
          placeholder="بحث برقم الدفعة / المرجع / المورد…"
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
          title="لا توجد دفعات موردين مُرحَّلة"
          description="الدفعات المُرحَّلة تظهر هنا للتخصيص على الفواتير"
        />
      ) : (
        <Table
          columns={[
            "رقم الدفعة",
            "التاريخ",
            "المورد",
            "قيمة الدفعة",
            "المُخصَّص",
            "غير المُخصَّص",
            "",
          ]}
          rows={items}
          renderRow={(p: SupplierPaymentRow) => (
            <>
              <Td
                className="font-mono text-xs font-semibold cursor-pointer hover:underline"
                onClick={() =>
                  nav({ to: "/finance/supplier-payments/$id", params: { id: p.id } as any })
                }
              >
                {p.id}
              </Td>
              <Td className="text-xs tabular-nums">{p.paymentDate}</Td>
              <Td className="text-xs">
                {p.supplierCode ? `${p.supplierCode} — ` : ""}
                {p.supplierName}
              </Td>
              <Td className="tabular-nums font-bold">{fmtSAR(p.apDebit)}</Td>
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
                    title="تخصيص الدفعة"
                    onClick={() =>
                      nav({ to: "/finance/supplier-payments/$id", params: { id: p.id } as any })
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
        unit="دفعة"
        onPage={setPage}
      />
    </AppShell>
  );
}
