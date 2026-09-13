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
  listFinanceSuppliers,
  setSupplierActive,
  getApReconciliation,
  type FinanceSupplier,
} from "@/lib/api/suppliers-finance";

export const Route = createFileRoute("/finance/suppliers")({
  head: () => ({ meta: [{ title: "الموردون والذمم الدائنة — ثواب" }] }),
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

  const canCreate = userCan(user, "finance.supplier.create");
  const canUpdate = userCan(user, "finance.supplier.update");
  const canDeact = userCan(user, "finance.supplier.deactivate");
  const canRecon = userCan(user, "finance.ap.reconciliation.view");

  const listQ = useQuery({
    queryKey: ["fin-suppliers", search, showAll, page],
    queryFn: () =>
      listFinanceSuppliers({ search: search || undefined, all: showAll, page, pageSize: 25 }),
  });
  const items = listQ.data?.items || [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fin-suppliers"] });

  const toggleMut = useMutation({
    mutationFn: (t: { id: string; active: boolean }) => setSupplierActive(t.id, t.active),
    onSuccess: () => {
      showToast("تم تحديث الحالة", "success");
      invalidate();
      setToggleTarget(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "الموردون"]}
      title="الموردون والذمم الدائنة"
      actions={
        <div className="flex gap-1.5">
          {canRecon && (
            <Btn variant="outline" onClick={() => setShowRecon((v) => !v)}>
              <Scale size={15} /> مطابقة الذمم
            </Btn>
          )}
          {canCreate && (
            <Btn variant="primary" onClick={() => nav({ to: "/finance/suppliers/new" })}>
              <Plus size={15} /> مورد جديد
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
        <EmptyState title="لا يوجد موردون" description="أضف أول مورد لإدارة الذمم الدائنة" />
      ) : (
        <Table
          columns={[
            "الرمز",
            "المورد",
            "الرقم الضريبي",
            "الهاتف",
            "مدة السداد",
            "الرصيد الدائن",
            "الحالة",
            "",
          ]}
          rows={items}
          renderRow={(s: FinanceSupplier) => (
            <>
              <Td className="font-mono text-xs">{s.supplierCode || "—"}</Td>
              <Td
                className="font-semibold cursor-pointer hover:underline"
                onClick={() => nav({ to: "/finance/suppliers/$id", params: { id: s.id } as any })}
              >
                {s.name}
              </Td>
              <Td className="text-xs font-mono">{s.taxNumber || "—"}</Td>
              <Td className="text-xs">{s.phone || "—"}</Td>
              <Td className="text-xs">
                {s.paymentTermsDays != null ? `${s.paymentTermsDays} يوم` : "—"}
              </Td>
              <Td className="tabular-nums font-bold">{fmtSAR(s.payableBalance ?? 0)}</Td>
              <Td>
                <Badge tone={s.status === "active" ? "success" : "muted"}>
                  {s.status === "active" ? "نشط" : "موقوف"}
                </Badge>
              </Td>
              <Td>
                <div className="flex gap-1 justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="عرض"
                    onClick={() =>
                      nav({ to: "/finance/suppliers/$id", params: { id: s.id } as any })
                    }
                  >
                    <Eye size={15} />
                  </button>
                  {canUpdate && (
                    <button
                      className="p-1.5 rounded hover:bg-muted"
                      title="تعديل"
                      onClick={() =>
                        nav({ to: "/finance/suppliers/$id/edit", params: { id: s.id } as any })
                      }
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {canDeact && (
                    <button
                      className={`p-1.5 rounded hover:bg-muted ${s.status === "active" ? "text-destructive" : "text-success"}`}
                      title={s.status === "active" ? "تعطيل" : "تفعيل"}
                      onClick={() =>
                        setToggleTarget({ id: s.id, active: s.status !== "active", label: s.name })
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
        unit="مورد"
        onPage={setPage}
      />

      <ConfirmDialog
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => toggleTarget && toggleMut.mutate(toggleTarget)}
        title={toggleTarget?.active ? "تفعيل المورد" : "تعطيل المورد"}
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
  const q = useQuery({ queryKey: ["ap-recon"], queryFn: getApReconciliation, retry: false });
  const d = q.data;
  return (
    <Card className="p-4 mb-4">
      <div className="text-sm font-bold mb-3 flex items-center gap-2">
        <Scale size={16} /> مطابقة الذمم الدائنة (الأستاذ العام مقابل أستاذ الموردين)
      </div>
      {q.isLoading ? (
        <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
      ) : q.error ? (
        <div className="text-xs text-destructive">{(q.error as Error).message}</div>
      ) : d ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <KV label="رصيد الذمم في الأستاذ" value={fmtSAR(d.apGl)} />
            <KV label="إجمالي أستاذ الموردين" value={fmtSAR(d.subledgerTotal)} />
            <KV label={`غير مخصّص (${d.unallocated.count})`} value={fmtSAR(d.unallocated.net)} />
            <KV label="الفرق" value={fmtSAR(d.difference)} />
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">
            المعادلة: رصيد الذمم في الأستاذ = إجمالي أستاذ الموردين + غير المخصّص. الفرق يجب أن يكون
            صفراً.
          </div>
          {d.unallocatedLines?.length > 0 && (
            <div className="mt-3 overflow-x-auto max-h-56">
              <div className="text-xs font-semibold mb-1">سطور ذمم غير مخصّصة لمورد</div>
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground text-right">
                  <tr>
                    <th className="py-1 pe-2">التاريخ</th>
                    <th className="py-1 pe-2">القيد</th>
                    <th className="py-1 pe-2">المصدر</th>
                    <th className="py-1 pe-2">مدين</th>
                    <th className="py-1 pe-2">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {d.unallocatedLines.map((l) => (
                    <tr key={l.lineId} className="border-t">
                      <td className="py-1 pe-2 tabular-nums">{l.date}</td>
                      <td className="py-1 pe-2 font-mono">{l.number}</td>
                      <td className="py-1 pe-2">{l.source}</td>
                      <td className="py-1 pe-2 tabular-nums">{l.debit ? fmtSAR(l.debit) : "—"}</td>
                      <td className="py-1 pe-2 tabular-nums">
                        {l.credit ? fmtSAR(l.credit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
