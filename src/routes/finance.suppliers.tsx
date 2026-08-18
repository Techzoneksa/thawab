import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { showToast, ConfirmDialog, EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, Pencil, Power, Scale } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  listFinanceSuppliers,
  getFinanceSupplier,
  getSupplierLedger,
  createFinanceSupplier,
  updateFinanceSupplier,
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
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ item?: FinanceSupplier } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
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
    queryKey: ["fin-suppliers", search, showAll],
    queryFn: () => listFinanceSuppliers({ search: search || undefined, all: showAll }),
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
            <Btn variant="primary" onClick={() => setEditing({})}>
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
              <Td className="font-semibold">{s.name}</Td>
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
                    onClick={() => setDetailId(s.id)}
                  >
                    <Eye size={15} />
                  </button>
                  {canUpdate && (
                    <button
                      className="p-1.5 rounded hover:bg-muted"
                      title="تعديل"
                      onClick={() => setEditing({ item: s })}
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

function EditDrawer({
  item,
  onClose,
  onSaved,
}: {
  item?: FinanceSupplier;
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
    bankName: item?.bankName || "",
    iban: "",
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
        bankName: f.bankName || null,
        notes: f.notes,
      };
      if (f.iban) body.iban = f.iban; // only send when entering/replacing
      return item?.id ? updateFinanceSupplier(body) : createFinanceSupplier(body);
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
      title={item ? `تعديل المورد ${item.supplierCode || ""}` : "مورد جديد"}
      onSave={() => mut.mutate()}
      saveText={item ? "حفظ" : "إنشاء"}
      loading={mut.isPending}
    >
      <div className="space-y-3">
        <Field label="اسم المورد *">
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
        <Field label="اسم البنك">
          <input
            className="inp"
            value={f.bankName}
            onChange={(e) => set("bankName", e.target.value)}
          />
        </Field>
        <Field label={item?.ibanMasked ? `الآيبان (الحالي: ${item.ibanMasked})` : "الآيبان (IBAN)"}>
          <input
            className="inp font-mono"
            value={f.iban}
            onChange={(e) => set("iban", e.target.value)}
            placeholder={item ? "اترك فارغاً للإبقاء على الحالي" : "SA.."}
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
  const q = useQuery({ queryKey: ["fin-supplier", id], queryFn: () => getFinanceSupplier(id) });
  const canLedger = userCan(user, "finance.supplier.ledger.view");
  const ledgerQ = useQuery({
    queryKey: ["fin-supplier-ledger", id],
    queryFn: () => getSupplierLedger(id),
    enabled: tab === "statement" && canLedger,
    retry: false,
  });
  const d = q.data;
  return (
    <EntityFormDrawer open onClose={onClose} title="المورد" onSave={onClose} saveText="إغلاق">
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
              <KV label="الرصيد الدائن" value={fmtSAR(d.balance.payableBalance)} />
              <KV label="إجمالي المدين" value={fmtSAR(d.balance.periodDebit)} />
              <KV label="إجمالي الدائن" value={fmtSAR(d.balance.periodCredit)} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              الرصيد الدائن محسوب من سطور الذمم الدائنة المرتبطة بالمورد في الأستاذ العام
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
              <KV label="الرمز" value={d.item.supplierCode || "—"} />
              <KV label="الرقم الضريبي" value={d.item.taxNumber || "—"} />
              <KV label="السجل التجاري" value={d.item.commercialRegistration || "—"} />
              <KV label="العملة" value={d.item.currency} />
              <KV label="الهاتف" value={d.item.phone || "—"} />
              <KV
                label="مدة السداد"
                value={d.item.paymentTermsDays != null ? `${d.item.paymentTermsDays} يوم` : "—"}
              />
              <KV label="البنك" value={d.item.bankName || "—"} />
              <KV label="الآيبان" value={d.item.ibanMasked || "—"} />
            </div>
          ) : !canLedger ? (
            <div className="text-xs text-destructive">لا تملك صلاحية عرض كشف الحساب</div>
          ) : ledgerQ.isLoading ? (
            <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
          ) : (ledgerQ.data?.movements.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground">لا توجد حركات على ذمم هذا المورد.</div>
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
                        {fmtSAR(m.payableBalance)}
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
