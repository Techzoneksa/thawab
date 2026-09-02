import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { Combobox } from "@/components/erp/Combobox";
import { showToast, EmptyState, EntityFormDrawer } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Link2, X, Plus } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { customerLookup } from "@/lib/api/customers-finance";
import {
  listCustomerReceipts,
  createCustomerReceipt,
  receiptSettlement,
  allocationCandidates,
  allocate,
  unallocate,
  type CustomerReceiptRow,
} from "@/lib/api/ar-allocation";

export const Route = createFileRoute("/finance/customer-receipts")({
  head: () => ({ meta: [{ title: "تحصيل العملاء والتخصيص — ثواب" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const canManage = userCan(user, "finance.customer_receipt_allocation.manage");
  const canCreate = userCan(user, "finance.customer_receipt.create");
  const [search, setSearch] = useState("");
  const [onlyUnapplied, setOnlyUnapplied] = useState(false);
  const [page, setPage] = useState(1);
  const [allocFor, setAllocFor] = useState<CustomerReceiptRow | null>(null);
  const [creating, setCreating] = useState(false);
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
          <Btn variant="primary" onClick={() => setCreating(true)}>
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
              <Td className="font-mono text-xs font-semibold">{p.id}</Td>
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
        unit="سند"
        onPage={setPage}
      />

      {creating && (
        <CreateReceiptDrawer
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            listQ.refetch();
          }}
        />
      )}
      {allocFor && (
        <AllocateDrawer
          receipt={allocFor}
          canManage={canManage}
          onClose={() => setAllocFor(null)}
          onChanged={() => listQ.refetch()}
        />
      )}
    </AppShell>
  );
}

function CreateReceiptDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>({
    customerId: "",
    amount: "",
    method: "bank",
    date: new Date().toISOString().slice(0, 10),
    reference: "",
    note: "",
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () =>
      createCustomerReceipt({
        customerId: f.customerId,
        amount: Number(f.amount),
        method: f.method,
        date: f.date || null,
        reference: f.reference || null,
        note: f.note || null,
      }),
    onSuccess: () => {
      showToast("تم تسجيل التحصيل وترحيله", "success");
      onSaved();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const valid = f.customerId && Number(f.amount) > 0;

  return (
    <EntityFormDrawer
      open
      onClose={onClose}
      title="تسجيل تحصيل من عميل"
      onSave={() => valid && mut.mutate()}
      saveText="ترحيل التحصيل"
      loading={mut.isPending}
    >
      <div className="space-y-3">
        <Field label="العميل *">
          <Combobox
            value={f.customerId}
            placeholder="ابحث عن عميل بالاسم أو الرمز…"
            search={(q) => customerLookup(q)}
            getId={(s: any) => s.id}
            getLabel={(s: any) =>
              `${s.customerCode ? `${s.customerCode} — ` : ""}${s.name} (${s.currency})`
            }
            onSelect={(s: any) => set("customerId", s?.id || "")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="المبلغ *">
            <input
              className="inp"
              inputMode="decimal"
              value={f.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="طريقة التحصيل">
            <select
              className="inp"
              value={f.method}
              onChange={(e) => set("method", e.target.value)}
            >
              <option value="bank">بنك</option>
              <option value="cash">نقد</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="التاريخ">
            <input
              type="date"
              className="inp"
              value={f.date}
              onChange={(e) => set("date", e.target.value)}
            />
          </Field>
          <Field label="المرجع">
            <input
              className="inp"
              value={f.reference}
              onChange={(e) => set("reference", e.target.value)}
              placeholder="رقم الحوالة / الإيصال…"
            />
          </Field>
        </div>
        <Field label="ملاحظات">
          <textarea
            className="inp"
            rows={2}
            value={f.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        <div className="text-[10px] text-muted-foreground">
          الترحيل يُنشئ قيداً: مدين النقد/البنك / دائن الذمم المدينة — ويُنسب الطرف الدائن لأستاذ
          العميل (الرصيد المدين ينخفض). ثم يمكن تخصيصه على فواتير العميل.
        </div>
      </div>
    </EntityFormDrawer>
  );
}

function AllocateDrawer({
  receipt,
  canManage,
  onClose,
  onChanged,
}: {
  receipt: CustomerReceiptRow;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const settleQ = useQuery({
    queryKey: ["receipt-settlement", receipt.id],
    queryFn: () => receiptSettlement(receipt.id),
  });
  const candQ = useQuery({
    queryKey: ["ar-alloc-candidates", receipt.id, q],
    queryFn: () => allocationCandidates(receipt.id, q || undefined),
  });

  const refresh = () => {
    settleQ.refetch();
    candQ.refetch();
    onChanged();
    qc.invalidateQueries({ queryKey: ["ar-aging"] });
  };

  const allocMut = useMutation({
    mutationFn: (v: { invoiceId: string; amount: number }) =>
      allocate(receipt.id, v.invoiceId, v.amount),
    onSuccess: () => {
      showToast("تم التخصيص", "success");
      setAmounts({});
      refresh();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const unallocMut = useMutation({
    mutationFn: (invoiceId: string) => unallocate(receipt.id, invoiceId),
    onSuccess: () => {
      showToast("تم إلغاء التخصيص", "success");
      refresh();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const s = settleQ.data;
  const unapplied = s?.unapplied ?? receipt.unapplied;

  return (
    <div className="fixed inset-0 z-50 flex justify-start" dir="rtl">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 h-full w-full max-w-lg overflow-y-auto bg-card shadow-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">تخصيص التحصيل {receipt.id}</h3>
          <button className="p-1.5 rounded hover:bg-muted" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <Card className="p-3 mb-3">
          <div className="grid grid-cols-3 gap-2 text-sm">
            <KV label="قيمة التحصيل" value={fmtSAR(s?.arCredit ?? receipt.arCredit)} />
            <KV label="المُخصَّص" value={fmtSAR(s?.allocated ?? receipt.allocated)} />
            <KV
              label="غير المُخصَّص"
              value={fmtSAR(unapplied)}
              tone={unapplied > 0.005 ? "warn" : "ok"}
            />
          </div>
          <div className="text-[11px] text-muted-foreground mt-2">
            التخصيص توزيعٌ للتحصيل على الفواتير — لا يُنشئ أي قيد محاسبي.
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
                    onClick={() => unallocMut.mutate(a.salesInvoiceId)}
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
              فواتير قابلة للتخصيص (نفس العميل، مُرحَّلة، عليها متبقٍ)
            </div>
            <input
              className="inp w-full mb-2"
              placeholder="ابحث برقم الفاتورة / مرجع العميل…"
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
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
