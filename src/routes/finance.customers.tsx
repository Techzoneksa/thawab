import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { showToast, ConfirmDialog, EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, Pencil, Power, Scale } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  listFinanceCustomers,
  getFinanceCustomer,
  getCustomerLedger,
  createFinanceCustomer,
  updateFinanceCustomer,
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
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, showAll]);
  const [editing, setEditing] = useState<{ item?: FinanceCustomer } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
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
            <Btn variant="primary" onClick={() => setEditing({})}>
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
              <Td className="font-semibold">{c.name}</Td>
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
                    onClick={() => setDetailId(c.id)}
                  >
                    <Eye size={15} />
                  </button>
                  {canUpdate && (
                    <button
                      className="p-1.5 rounded hover:bg-muted"
                      title="تعديل"
                      onClick={() => setEditing({ item: c })}
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

      {editing && (
        <EditDrawer
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {detailId && <DetailDrawer id={detailId} onClose={() => setDetailId(null)} />}

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

function EditDrawer({
  item,
  onClose,
  onSaved,
}: {
  item?: FinanceCustomer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<any>({
    name: item?.name || "",
    legalName: item?.legalName || "",
    vatNumber: item?.taxNumber || "",
    commercialRegistration: item?.commercialRegistration || "",
    phone: item?.phone || "",
    email: item?.email || "",
    currency: item?.currency || "SAR",
    paymentTermsDays: item?.paymentTermsDays ?? "",
    contactPerson: item?.contactPerson || "",
    address: item?.address || "",
    notes: item?.notes || "",
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      const body: any = {
        id: item?.id,
        name: f.name,
        legalName: f.legalName,
        vatNumber: f.vatNumber || null,
        commercialRegistration: f.commercialRegistration || null,
        phone: f.phone || null,
        email: f.email || "",
        currency: f.currency,
        paymentTermsDays: f.paymentTermsDays === "" ? null : Number(f.paymentTermsDays),
        contactPerson: f.contactPerson,
        address: f.address,
        notes: f.notes,
      };
      return item?.id ? updateFinanceCustomer(body) : createFinanceCustomer(body);
    },
    onSuccess: () => {
      showToast(item ? "تم الحفظ" : "تم الإنشاء", "success");
      onSaved();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  return (
    <EntityFormDrawer
      open
      onClose={onClose}
      title={item ? `تعديل العميل ${item.customerCode || ""}` : "عميل جديد"}
      onSave={() => mut.mutate()}
      saveText={item ? "حفظ" : "إنشاء"}
      loading={mut.isPending}
    >
      <div className="space-y-3">
        <Field label="اسم العميل *">
          <input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="الاسم القانوني">
          <input
            className="inp"
            value={f.legalName}
            onChange={(e) => set("legalName", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="الرقم الضريبي (VAT)">
            <input
              className="inp font-mono"
              value={f.vatNumber}
              onChange={(e) => set("vatNumber", e.target.value)}
            />
          </Field>
          <Field label="السجل التجاري">
            <input
              className="inp"
              value={f.commercialRegistration}
              onChange={(e) => set("commercialRegistration", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="الهاتف">
            <input className="inp" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="البريد">
            <input className="inp" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="العملة">
            <input
              className="inp"
              value={f.currency}
              onChange={(e) => set("currency", e.target.value)}
            />
          </Field>
          <Field label="مدة السداد (يوم)">
            <input
              className="inp"
              type="number"
              min="0"
              value={f.paymentTermsDays}
              onChange={(e) => set("paymentTermsDays", e.target.value)}
            />
          </Field>
        </div>
        <Field label="جهة الاتصال">
          <input
            className="inp"
            value={f.contactPerson}
            onChange={(e) => set("contactPerson", e.target.value)}
          />
        </Field>
        <Field label="العنوان">
          <input
            className="inp"
            value={f.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>
        <Field label="ملاحظات">
          <textarea
            className="inp"
            rows={2}
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </div>
    </EntityFormDrawer>
  );
}

function DetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<"overview" | "statement">("overview");
  const q = useQuery({ queryKey: ["fin-customer", id], queryFn: () => getFinanceCustomer(id) });
  const canLedger = userCan(user, "finance.customer.ledger.view");
  const ledgerQ = useQuery({
    queryKey: ["fin-customer-ledger", id],
    queryFn: () => getCustomerLedger(id),
    enabled: tab === "statement" && canLedger,
    retry: false,
  });
  const d = q.data;
  return (
    <EntityFormDrawer open onClose={onClose} title="العميل" onSave={onClose} saveText="إغلاق">
      {d && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-bold">{d.item.name}</div>
            <Badge tone={d.item.status === "active" ? "success" : "muted"}>
              {d.item.status === "active" ? "نشط" : "موقوف"}
            </Badge>
          </div>

          <Card className="p-3">
            <div className="grid grid-cols-3 gap-2">
              <KV label="الرصيد المدين" value={fmtSAR(d.balance.receivableBalance)} />
              <KV label="إجمالي المدين" value={fmtSAR(d.balance.periodDebit)} />
              <KV label="إجمالي الدائن" value={fmtSAR(d.balance.periodCredit)} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              الرصيد المدين محسوب من سطور الذمم المدينة المرتبطة بالعميل في الأستاذ العام
              (مُرحّلة/معكوسة) — لا رصيد مخزّن.
            </div>
          </Card>

          <div className="flex gap-1.5">
            {(["overview", "statement"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${tab === t ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
              >
                {t === "overview" ? "نظرة عامة" : "كشف الحساب"}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="grid grid-cols-2 gap-2">
              <KV label="الرمز" value={d.item.customerCode || "—"} />
              <KV label="الرقم الضريبي" value={d.item.taxNumber || "—"} />
              <KV label="السجل التجاري" value={d.item.commercialRegistration || "—"} />
              <KV label="العملة" value={d.item.currency} />
              <KV label="الهاتف" value={d.item.phone || "—"} />
              <KV
                label="مدة السداد"
                value={d.item.paymentTermsDays != null ? `${d.item.paymentTermsDays} يوم` : "—"}
              />
              <KV label="جهة الاتصال" value={d.item.contactPerson || "—"} />
              <KV label="العنوان" value={d.item.address || "—"} />
            </div>
          ) : !canLedger ? (
            <div className="text-xs text-destructive">لا تملك صلاحية عرض كشف الحساب</div>
          ) : ledgerQ.isLoading ? (
            <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
          ) : (ledgerQ.data?.movements.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground">لا توجد حركات على ذمم هذا العميل.</div>
          ) : (
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-[11px]">
                <thead className="text-muted-foreground text-right">
                  <tr>
                    <th className="py-1 pe-2">التاريخ</th>
                    <th className="py-1 pe-2">القيد</th>
                    <th className="py-1 pe-2">المصدر</th>
                    <th className="py-1 pe-2">مدين</th>
                    <th className="py-1 pe-2">دائن</th>
                    <th className="py-1 pe-2">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerQ.data!.movements.map((m) => (
                    <tr key={m.lineId} className="border-t">
                      <td className="py-1 pe-2 tabular-nums">{m.date}</td>
                      <td className="py-1 pe-2 font-mono">{m.number}</td>
                      <td className="py-1 pe-2">{m.source}</td>
                      <td className="py-1 pe-2 tabular-nums">{m.debit ? fmtSAR(m.debit) : "—"}</td>
                      <td className="py-1 pe-2 tabular-nums">
                        {m.credit ? fmtSAR(m.credit) : "—"}
                      </td>
                      <td className="py-1 pe-2 tabular-nums font-semibold">
                        {fmtSAR(m.receivableBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </EntityFormDrawer>
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
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
