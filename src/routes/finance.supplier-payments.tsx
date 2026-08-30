import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Link2, X } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  listSupplierPaymentsForAlloc,
  paymentSettlement,
  allocationCandidates,
  allocate,
  unallocate,
  type SupplierPaymentRow,
} from "@/lib/api/ap-allocation";

export const Route = createFileRoute("/finance/supplier-payments")({
  head: () => ({ meta: [{ title: "دفعات الموردين والتخصيص — ثواب" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const canManage = userCan(user, "finance.supplier_payment_allocation.manage");
  const [search, setSearch] = useState("");
  const [onlyUnapplied, setOnlyUnapplied] = useState(false);
  const [page, setPage] = useState(1);
  const [allocFor, setAllocFor] = useState<SupplierPaymentRow | null>(null);
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
              <Td className="font-mono text-xs font-semibold">{p.id}</Td>
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
                    onClick={() => setAllocFor(p)}
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

      {allocFor && (
        <AllocateDrawer
          payment={allocFor}
          canManage={canManage}
          onClose={() => setAllocFor(null)}
          onChanged={() => listQ.refetch()}
        />
      )}
    </AppShell>
  );
}

function AllocateDrawer({
  payment,
  canManage,
  onClose,
  onChanged,
}: {
  payment: SupplierPaymentRow;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const settleQ = useQuery({
    queryKey: ["payment-settlement", payment.id],
    queryFn: () => paymentSettlement(payment.id),
  });
  const candQ = useQuery({
    queryKey: ["alloc-candidates", payment.id, q],
    queryFn: () => allocationCandidates(payment.id, q || undefined),
  });

  const refresh = () => {
    settleQ.refetch();
    candQ.refetch();
    onChanged();
    qc.invalidateQueries({ queryKey: ["ap-aging"] });
  };

  const allocMut = useMutation({
    mutationFn: (v: { invoiceId: string; amount: number }) =>
      allocate(payment.id, v.invoiceId, v.amount),
    onSuccess: () => {
      showToast("تم التخصيص", "success");
      setAmounts({});
      refresh();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const unallocMut = useMutation({
    mutationFn: (invoiceId: string) => unallocate(payment.id, invoiceId),
    onSuccess: () => {
      showToast("تم إلغاء التخصيص", "success");
      refresh();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const s = settleQ.data;
  const unapplied = s?.unapplied ?? payment.unapplied;

  return (
    <div className="fixed inset-0 z-50 flex justify-start" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 h-full w-full max-w-lg overflow-y-auto bg-card shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">تخصيص الدفعة {payment.id}</h3>
          <button className="p-1.5 rounded hover:bg-muted" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <Card className="p-3 mb-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <KV label="قيمة الدفعة" value={fmtSAR(s?.apDebit ?? payment.apDebit)} />
            <KV label="المُخصَّص" value={fmtSAR(s?.allocated ?? payment.allocated)} />
            <KV
              label="غير المُخصَّص"
              value={fmtSAR(unapplied)}
              tone={unapplied > 0.005 ? "warn" : "ok"}
            />
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">
            التخصيص توزيعٌ للسداد على الفواتير — لا يُنشئ أي قيد محاسبي.
          </div>
        </Card>

        <div className="text-sm font-bold mb-1.5">التخصيصات الحالية</div>
        {(s?.allocations || []).length === 0 ? (
          <div className="text-xs text-muted-foreground mb-3">لا توجد تخصيصات بعد</div>
        ) : (
          <div className="space-y-1.5 mb-3">
            {(s?.allocations || []).map((a: any) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
              >
                <span className="font-mono text-xs">{a.invoiceNumber}</span>
                <span className="text-xs text-muted-foreground">{a.invoiceDate}</span>
                <span className="ms-auto tabular-nums font-semibold">{fmtSAR(a.amount)}</span>
                {canManage && (
                  <button
                    className="p-1 rounded hover:bg-destructive/10 text-destructive"
                    title="إلغاء التخصيص"
                    onClick={() => unallocMut.mutate(a.supplierInvoiceId)}
                    disabled={unallocMut.isPending}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {canManage && (
          <>
            <div className="text-sm font-bold mb-1.5">
              فواتير قابلة للتخصيص (نفس المورد، مُرحَّلة، عليها متبقٍ)
            </div>
            <input
              className="inp w-full mb-2"
              placeholder="ابحث برقم الفاتورة / الرقم الخارجي…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="space-y-1.5">
              {(candQ.data?.items || []).map((c: any) => (
                <div key={c.id} className="rounded-lg border px-2.5 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs font-semibold">{c.invoiceNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      استحقاق {c.dueDate || "—"}
                    </span>
                    <span className="ms-auto text-xs">
                      متبقٍ <b className="tabular-nums">{fmtSAR(c.outstanding)}</b>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      className="inp !h-8 text-sm"
                      inputMode="decimal"
                      placeholder="المبلغ"
                      value={amounts[c.id] ?? ""}
                      onChange={(e) => setAmounts((p) => ({ ...p, [c.id]: e.target.value }))}
                    />
                    <Btn
                      variant="outline"
                      onClick={() =>
                        allocMut.mutate({
                          invoiceId: c.id,
                          amount: Number(amounts[c.id] ?? Math.min(unapplied, c.outstanding)),
                        })
                      }
                      disabled={allocMut.isPending}
                    >
                      تخصيص
                    </Btn>
                    <button
                      className="text-[11px] text-primary whitespace-nowrap"
                      onClick={() =>
                        setAmounts((p) => ({
                          ...p,
                          [c.id]: String(Math.min(unapplied, c.outstanding)),
                        }))
                      }
                    >
                      الأقصى
                    </button>
                  </div>
                </div>
              ))}
              {(candQ.data?.items?.length ?? 0) === 0 && (
                <div className="text-xs text-muted-foreground py-2">
                  لا توجد فواتير قابلة للتخصيص
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KV({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`font-bold tabular-nums ${tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
