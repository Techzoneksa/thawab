import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { showToast, ConfirmDialog, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, Pencil, Power, Scale } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  listFinanceCustomers,
  setCustomerActive,
  getArReconciliation,
  type FinanceCustomer,
} from "@/lib/api/customers-finance";

export const Route = createFileRoute("/finance/customers")({
  head: () => ({ meta: [{ title: "العملاء والذمم المدينة — ثواب" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, showAll]);
  const [showRecon, setShowRecon] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<{
    id: string;
    active: boolean;
    label: string;
  } | null>(null);

  const canCreate = userCan(user, "finance.customer.create");
  const canUpdate = userCan(user, "finance.customer.update");
  const canDeact = userCan(user, "finance.customer.deactivate");
  const canRecon = userCan(user, "finance.ar.reconciliation.view");

  const listQ = useQuery({
    queryKey: ["fin-customers", search, showAll, page],
    queryFn: () =>
      listFinanceCustomers({ search: search || undefined, all: showAll, page, pageSize: 25 }),
  });
  const items = listQ.data?.items || [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fin-customers"] });

  const toggleMut = useMutation({
    mutationFn: (t: { id: string; active: boolean }) => setCustomerActive(t.id, t.active),
    onSuccess: () => {
      showToast("تم تحديث الحالة", "success");
      invalidate();
      setToggleTarget(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "العملاء"]}
      title="العملاء والذمم المدينة"
      actions={
        <div className="flex gap-1.5">
          {canRecon && (
            <Btn variant="outline" onClick={() => setShowRecon((v) => !v)}>
              <Scale size={15} /> مطابقة الذمم
            </Btn>
          )}
          {canCreate && (
            <Btn variant="primary" onClick={() => nav({ to: "/finance/customers/new" })}>
              <Plus size={15} /> عميل جديد
            </Btn>
          )}
        </div>
      }
    >
      {showRecon && canRecon && <ReconPanel />}

      <div className="flex flex-wrap gap-1.5 mb-3 items-center">
        <input
          className="inp !w-64"
          placeholder="بحث بالاسم / الرمز / الرقم الضريبي…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          إظهار غير النشطين
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState title="لا يوجد عملاء" description="أضف أول عميل لإدارة الذمم المدينة" />
      ) : (
        <Table
          columns={[
            "الرمز",
            "العميل",
            "الرقم الضريبي",
            "الهاتف",
            "مدة السداد",
            "الرصيد المدين",
            "الحالة",
            "",
          ]}
          rows={items}
          renderRow={(c: FinanceCustomer) => (
            <>
              <Td className="font-mono text-xs">{c.customerCode || "—"}</Td>
              <Td
                className="font-semibold cursor-pointer hover:underline"
                onClick={() => nav({ to: "/finance/customers/$id", params: { id: c.id } as any })}
              >
                {c.name}
              </Td>
              <Td className="text-xs font-mono">{c.taxNumber || "—"}</Td>
              <Td className="text-xs">{c.phone || "—"}</Td>
              <Td className="text-xs">
                {c.paymentTermsDays != null ? `${c.paymentTermsDays} يوم` : "—"}
              </Td>
              <Td className="tabular-nums font-bold">{fmtSAR(c.receivableBalance ?? 0)}</Td>
              <Td>
                <Badge tone={c.status === "active" ? "success" : "muted"}>
                  {c.status === "active" ? "نشط" : "موقوف"}
                </Badge>
              </Td>
              <Td>
                <div className="flex gap-1 justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="عرض"
                    onClick={() =>
                      nav({ to: "/finance/customers/$id", params: { id: c.id } as any })
                    }
                  >
                    <Eye size={15} />
                  </button>
                  {canUpdate && (
                    <button
                      className="p-1.5 rounded hover:bg-muted"
                      title="تعديل"
                      onClick={() =>
                        nav({ to: "/finance/customers/$id/edit", params: { id: c.id } as any })
                      }
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {canDeact && (
                    <button
                      className={`p-1.5 rounded hover:bg-muted ${c.status === "active" ? "text-destructive" : "text-success"}`}
                      title={c.status === "active" ? "تعطيل" : "تفعيل"}
                      onClick={() =>
                        setToggleTarget({ id: c.id, active: c.status !== "active", label: c.name })
                      }
                    >
                      <Power size={15} />
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
        unit="عميل"
        onPage={setPage}
      />

      <ConfirmDialog
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => toggleTarget && toggleMut.mutate(toggleTarget)}
        title={toggleTarget?.active ? "تفعيل العميل" : "تعطيل العميل"}
        message={
          toggleTarget?.active
            ? `تفعيل "${toggleTarget?.label}"؟`
            : `تعطيل "${toggleTarget?.label}"؟ يبقى السجل والذمم والحركة ظاهرة، ولا يُتاح اختياره لمستندات جديدة. لا يُنشأ أي قيد محاسبي.`
        }
        confirmText={toggleTarget?.active ? "تفعيل" : "تعطيل"}
        cancelText="إلغاء"
        variant={toggleTarget?.active ? "default" : "destructive"}
      />
    </AppShell>
  );
}

function ReconPanel() {
  const q = useQuery({ queryKey: ["ar-recon"], queryFn: getArReconciliation, retry: false });
  const d = q.data;
  return (
    <Card className="p-4 mb-4">
      <div className="text-sm font-bold mb-3 flex items-center gap-2">
        <Scale size={16} /> مطابقة الذمم المدينة (الأستاذ العام مقابل أستاذ العملاء)
      </div>
      {q.isLoading ? (
        <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
      ) : q.error ? (
        <div className="text-xs text-destructive">{(q.error as Error).message}</div>
      ) : d ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <KV label="رصيد الذمم في الأستاذ" value={fmtSAR(d.arGl)} />
            <KV label="إجمالي أستاذ العملاء" value={fmtSAR(d.subledgerTotal)} />
            <KV label={`غير مخصّص (${d.unallocated.count})`} value={fmtSAR(d.unallocated.net)} />
            <KV label="الفرق" value={fmtSAR(d.difference)} />
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">
            المعادلة: رصيد الذمم في الأستاذ = إجمالي أستاذ العملاء + غير المخصّص. الفرق يجب أن يكون
            صفراً.
          </div>
        </>
      ) : null}
    </Card>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
