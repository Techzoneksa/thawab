import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { Combobox } from "@/components/erp/Combobox";
import { showToast, EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, Printer, Send, Check, Undo2, X, Trash2, Ban } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { supplierLookup } from "@/lib/api/suppliers-finance";
import {
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  purchaseOrderAction,
  type PurchaseOrder,
  type PurchaseOrderAction,
} from "@/lib/api/governed-purchase-orders";

export const Route = createFileRoute("/procurement/purchase-orders")({
  head: () => ({ meta: [{ title: "أوامر الشراء — ثواب" }] }),
  component: Page,
});

export const PO_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمد — بانتظار الإصدار", tone: "primary" },
  issued: { label: "صادر", tone: "success" },
  rejected: { label: "مرفوض", tone: "destructive" },
  cancelled: { label: "ملغى", tone: "warning" },
};

const QUEUES = [
  { key: "", label: "الكل" },
  { key: "draft", label: "مسودات" },
  { key: "submitted", label: "بانتظار الاعتماد" },
  { key: "approved", label: "معتمدة" },
  { key: "issued", label: "صادرة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "cancelled", label: "ملغاة" },
];

const NO_ACCOUNTING = "هذا الأمر لا يُنشئ قيدًا محاسبيًا ولا يؤثر على المخزون أو ذمم الموردين.";

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [queue, setQueue] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ item?: PurchaseOrder } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [queue, search]);

  const canCreate = userCan(user, "procurement.po.create");

  const listQ = useQuery({
    queryKey: ["purchase-orders", queue, search, page],
    queryFn: () =>
      listPurchaseOrders({
        status: queue || undefined,
        search: search || undefined,
        page,
        pageSize: 25,
      }),
  });
  const items = listQ.data?.items || [];
  const summary = listQ.data?.summary;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["purchase-orders"] });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "أوامر الشراء"]}
      title="أوامر الشراء"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => setEditing({})}>
            <Plus size={15} /> أمر شراء جديد
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="مسودات" value={summary?.draft ?? 0} />
        <SummaryCard label="بانتظار الاعتماد" value={summary?.submitted ?? 0} />
        <SummaryCard label="صادرة" value={summary?.issued ?? 0} />
        <SummaryCard
          label="قيمة الالتزام (معتمد/صادر)"
          money
          value={summary?.committedValue ?? 0}
        />
      </div>

      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground mb-3">
        {NO_ACCOUNTING}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUEUES.map((q) => (
          <button
            key={q.key || "all"}
            onClick={() => setQueue(q.key)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${queue === q.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
          >
            {q.label}
          </button>
        ))}
        <input
          className="inp !w-56 ms-auto"
          placeholder="بحث برقم الأمر / الموضوع…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد أوامر شراء"
          description="أنشئ أول أمر شراء (التزام شرائي بدون أثر محاسبي)"
        />
      ) : (
        <Table
          columns={[
            "رقم الأمر",
            "التاريخ",
            "التسليم المتوقع",
            "الصافي",
            "الضريبة",
            "الإجمالي",
            "الحالة",
            "",
          ]}
          rows={items}
          renderRow={(v: PurchaseOrder) => (
            <>
              <Td className="font-mono text-xs font-semibold">{v.poNumber}</Td>
              <Td className="text-xs tabular-nums">{v.date}</Td>
              <Td className="text-xs tabular-nums">{v.deliveryDate || "—"}</Td>
              <Td className="tabular-nums">{fmtSAR(v.subtotal)}</Td>
              <Td className="tabular-nums text-xs">{fmtSAR(v.taxAmount)}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(v.totalAmount)}</Td>
              <Td>
                <Badge tone={PO_STATUS[v.status]?.tone || "muted"}>
                  {PO_STATUS[v.status]?.label || v.status}
                </Badge>
              </Td>
              <Td>
                <div className="flex gap-1 justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="عرض"
                    onClick={() => setDetailId(v.id)}
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
        unit="أمر"
        onPage={setPage}
      />

      {editing && (
        <CreateEditDrawer
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}
      {detailId && (
        <DetailDrawer
          id={detailId}
          onClose={() => setDetailId(null)}
          onChanged={invalidate}
          onEdit={(item) => {
            setDetailId(null);
            setEditing({ item });
          }}
        />
      )}
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

type LineForm = {
  description: string;
  lineType: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxRate: string;
};
const emptyLine = (): LineForm => ({
  description: "",
  lineType: "ITEM",
  quantity: "1",
  unit: "",
  unitPrice: "",
  taxRate: "15",
});
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const LINE_TYPES = [
  { k: "ITEM", l: "صنف مخزني" },
  { k: "SERVICE", l: "خدمة" },
  { k: "ASSET", l: "أصل" },
  { k: "EXPENSE", l: "مصروف" },
  { k: "OTHER", l: "أخرى" },
];

function CreateEditDrawer({
  item,
  onClose,
  onSaved,
}: {
  item?: PurchaseOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detailQ = useQuery({
    queryKey: ["purchase-order", item?.id, "edit"],
    queryFn: () => getPurchaseOrder(item!.id),
    enabled: !!item?.id,
  });

  const [f, setF] = useState<any>({
    supplierId: item?.supplierId || "",
    subject: item?.subject || "",
    orderDate: item?.date || new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: item?.deliveryDate || "",
    supplierReference: item?.supplierReference || "",
    notes: item?.notes || "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [seeded, setSeeded] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  if (item?.id && detailQ.data && !seeded) {
    setSeeded(true);
    setLines(
      detailQ.data.lines.map((l) => ({
        description: l.description || "",
        lineType: l.lineType || "ITEM",
        quantity: String(l.quantity),
        unit: l.unit || "",
        unitPrice: String(l.unitPrice),
        taxRate: String(l.taxRate),
      })),
    );
  }

  const computed = lines.map((l) => {
    const sub = round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0));
    const tax = round2((sub * (Number(l.taxRate) || 0)) / 100);
    return { sub, tax, total: round2(sub + tax) };
  });
  const subtotal = round2(computed.reduce((s, c) => s + c.sub, 0));
  const taxTotal = round2(computed.reduce((s, c) => s + c.tax, 0));
  const grand = round2(subtotal + taxTotal);

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        id: item?.id,
        supplierId: f.supplierId,
        subject: f.subject.trim(),
        orderDate: f.orderDate,
        expectedDeliveryDate: f.expectedDeliveryDate || null,
        supplierReference: f.supplierReference || null,
        notes: f.notes,
        lines: lines
          .filter((l) => Number(l.quantity) > 0)
          .map((l) => ({
            description: l.description || undefined,
            lineType: l.lineType,
            quantity: Number(l.quantity),
            unit: l.unit || undefined,
            unitPrice: Number(l.unitPrice) || 0,
            taxRate: Number(l.taxRate) || 0,
          })),
      };
      return item?.id ? updatePurchaseOrder(body) : createPurchaseOrder(body);
    },
    onSuccess: () => {
      showToast(item ? "تم حفظ المسودة" : "تم إنشاء أمر الشراء", "success");
      onSaved();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const rmLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i));
  const setLine = (i: number, k: keyof LineForm, v: string) =>
    setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return (
    <EntityFormDrawer
      open
      onClose={onClose}
      title={item ? `تعديل مسودة ${item.poNumber}` : "أمر شراء جديد"}
      onSave={() => mut.mutate()}
      saveText={item ? "حفظ المسودة" : "إنشاء"}
      loading={mut.isPending}
    >
      <div className="space-y-3">
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          {NO_ACCOUNTING}
        </div>
        <Field label="المورد *">
          <Combobox
            value={f.supplierId}
            displayValue={
              detailQ.data?.supplier
                ? `${detailQ.data.supplier.supplierCode ? `${detailQ.data.supplier.supplierCode} — ` : ""}${detailQ.data.supplier.name}`
                : undefined
            }
            placeholder="ابحث عن مورد بالاسم أو الرمز…"
            search={(q) => supplierLookup(q)}
            getId={(s: any) => s.id}
            getLabel={(s: any) =>
              `${s.supplierCode ? `${s.supplierCode} — ` : ""}${s.name} (${s.currency})`
            }
            onSelect={(s: any) => set("supplierId", s?.id || "")}
          />
        </Field>
        <Field label="الموضوع *">
          <input
            className="inp"
            value={f.subject}
            onChange={(e) => set("subject", e.target.value)}
            placeholder="وصف مختصر لأمر الشراء"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="تاريخ الأمر *">
            <input
              type="date"
              className="inp"
              value={f.orderDate}
              onChange={(e) => set("orderDate", e.target.value)}
            />
          </Field>
          <Field label="التسليم المتوقع">
            <input
              type="date"
              className="inp"
              value={f.expectedDeliveryDate}
              onChange={(e) => set("expectedDeliveryDate", e.target.value)}
            />
          </Field>
        </div>
        <Field label="مرجع المورد">
          <input
            className="inp"
            value={f.supplierReference}
            onChange={(e) => set("supplierReference", e.target.value)}
            placeholder="عرض سعر / عقد…"
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

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-semibold text-muted-foreground">بنود أمر الشراء *</div>
            <Btn variant="ghost" onClick={addLine}>
              <Plus size={13} /> بند
            </Btn>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border p-2 space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    className="inp"
                    placeholder="وصف البند"
                    value={l.description}
                    onChange={(e) => setLine(i, "description", e.target.value)}
                  />
                  <select
                    className="inp !w-32"
                    value={l.lineType}
                    onChange={(e) => setLine(i, "lineType", e.target.value)}
                  >
                    {LINE_TYPES.map((t) => (
                      <option key={t.k} value={t.k}>
                        {t.l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  <NumIn
                    placeholder="الكمية"
                    value={l.quantity}
                    onChange={(v) => setLine(i, "quantity", v)}
                  />
                  <input
                    className="inp"
                    placeholder="الوحدة"
                    value={l.unit}
                    onChange={(e) => setLine(i, "unit", e.target.value)}
                  />
                  <NumIn
                    placeholder="سعر الوحدة"
                    value={l.unitPrice}
                    onChange={(v) => setLine(i, "unitPrice", v)}
                  />
                  <NumIn
                    placeholder="ضريبة %"
                    value={l.taxRate}
                    onChange={(v) => setLine(i, "taxRate", v)}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="tabular-nums">
                    صافي {fmtSAR(computed[i]?.sub || 0)} · ضريبة {fmtSAR(computed[i]?.tax || 0)} ·
                    الإجمالي {fmtSAR(computed[i]?.total || 0)}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-muted text-destructive"
                      onClick={() => rmLine(i)}
                      title="حذف"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2 space-y-1">
            <Row label="الصافي" value={subtotal} />
            <Row label="الضريبة (قيمة تعاقدية فقط)" value={taxTotal} />
            <Row label="إجمالي قيمة الالتزام" value={grand} bold />
          </div>
        </div>
      </div>
    </EntityFormDrawer>
  );
}

function NumIn({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      className="inp"
      type="number"
      min="0"
      step="0.01"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${bold ? "font-bold" : "text-muted-foreground"}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "text-base font-extrabold" : "font-semibold"}`}>
        {fmtSAR(value)}
      </span>
    </div>
  );
}

function DetailDrawer({
  id,
  onClose,
  onChanged,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (item: PurchaseOrder) => void;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [reason, setReason] = useState<{ action: PurchaseOrderAction; title: string } | null>(null);
  const q = useQuery({ queryKey: ["purchase-order", id], queryFn: () => getPurchaseOrder(id) });
  const d = q.data;

  const actionMut = useMutation({
    mutationFn: (p: { action: PurchaseOrderAction; reason?: string }) =>
      purchaseOrderAction(id, p.action, p.reason),
    onSuccess: () => {
      showToast("تم تنفيذ الإجراء", "success");
      qc.invalidateQueries({ queryKey: ["purchase-order", id] });
      onChanged();
      setReason(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const st = d?.item.status;
  const can = (perm: string) => userCan(user, perm);
  const act = (action: PurchaseOrderAction, needsReason: boolean, title: string) =>
    needsReason ? setReason({ action, title }) : actionMut.mutate({ action });

  return (
    <EntityFormDrawer open onClose={onClose} title="أمر شراء" onSave={onClose} saveText="إغلاق">
      {d && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-mono font-bold">{d.item.poNumber}</div>
            <Badge tone={PO_STATUS[d.item.status]?.tone || "muted"}>
              {PO_STATUS[d.item.status]?.label || d.item.status}
            </Badge>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            {NO_ACCOUNTING}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <KV label="المورد" value={d.supplier?.name || d.item.supplierId || "—"} />
            <KV label="الموضوع" value={d.item.subject} />
            <KV label="تاريخ الأمر" value={d.item.date} />
            <KV label="التسليم المتوقع" value={d.item.deliveryDate || "—"} />
            <KV label="العملة" value={d.item.currency} />
            <KV label="مرجع المورد" value={d.item.supplierReference || "—"} />
          </div>

          <Card className="p-3">
            <div className="text-xs font-bold mb-2">البنود</div>
            <table className="w-full text-[12px]">
              <thead className="text-muted-foreground text-right">
                <tr>
                  <th className="py-1 pe-2">البند</th>
                  <th className="py-1 pe-2 text-left">كمية</th>
                  <th className="py-1 pe-2 text-left">سعر</th>
                  <th className="py-1 pe-2 text-left">صافي</th>
                  <th className="py-1 pe-2 text-left">ضريبة</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1 pe-2">{l.description || "—"}</td>
                    <td className="py-1 pe-2 text-left tabular-nums">
                      {l.quantity} {l.unit || ""}
                    </td>
                    <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.unitPrice)}</td>
                    <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.lineSubtotal)}</td>
                    <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.taxAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 border-t pt-2 space-y-1">
              <Row label="الصافي" value={d.item.subtotal} />
              <Row label="الضريبة" value={d.item.taxAmount} />
              <Row label="إجمالي الالتزام" value={d.item.totalAmount} bold />
            </div>
          </Card>

          <Timeline history={d.history} />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {st === "draft" && can("procurement.po.update_draft") && (
              <Btn variant="outline" onClick={() => onEdit(d.item)}>
                تعديل
              </Btn>
            )}
            {st === "draft" && can("procurement.po.submit") && (
              <Btn variant="primary" onClick={() => act("submit", false, "")}>
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {st === "submitted" && can("procurement.po.approve") && (
              <Btn variant="primary" onClick={() => act("approve", false, "")}>
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {st === "submitted" && can("procurement.po.reject") && (
              <>
                <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                  <Undo2 size={14} /> إعادة
                </Btn>
                <Btn variant="outline" onClick={() => act("reject", true, "رفض الأمر")}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === "approved" && can("procurement.po.reject") && (
              <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                <Undo2 size={14} /> إعادة للمسودة
              </Btn>
            )}
            {st === "approved" && can("procurement.po.issue") && (
              <Btn variant="primary" onClick={() => act("issue", false, "")}>
                <Check size={14} /> إصدار
              </Btn>
            )}
            {st === "issued" && can("procurement.po.cancel") && (
              <Btn variant="outline" onClick={() => act("cancel", true, "إلغاء الأمر الصادر")}>
                <Ban size={14} /> إلغاء
              </Btn>
            )}
            {st !== "draft" && (
              <Btn
                variant="ghost"
                onClick={() =>
                  nav({ to: "/procurement/purchase-orders/$id/print", params: { id } as any })
                }
              >
                <Printer size={14} /> طباعة
              </Btn>
            )}
          </div>
        </div>
      )}

      {reason && (
        <ReasonDialog
          title={reason.title}
          onCancel={() => setReason(null)}
          onConfirm={(r) => actionMut.mutate({ action: reason.action, reason: r })}
          loading={actionMut.isPending}
        />
      )}
    </EntityFormDrawer>
  );
}

function Timeline({
  history,
}: {
  history: { id: string; action: string; userName: string; reason: string; createdAt: string }[];
}) {
  const LABEL: Record<string, string> = {
    create: "إنشاء",
    submit: "إرسال للاعتماد",
    approve: "اعتماد",
    return: "إعادة للمسودة",
    reject: "رفض",
    issue: "إصدار",
    cancel: "إلغاء",
  };
  if (!history?.length) return null;
  return (
    <Card className="p-3">
      <div className="text-xs font-bold mb-2">سجل الإجراءات</div>
      <ol className="space-y-1.5">
        {history.map((e) => (
          <li key={e.id} className="flex items-start gap-2 text-[11px]">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
            <div>
              <span className="font-semibold">{LABEL[e.action] || e.action}</span>
              <span className="text-muted-foreground"> — {e.userName} · </span>
              <span className="tabular-nums text-muted-foreground">
                {String(e.createdAt).slice(0, 16).replace("T", " ")}
              </span>
              {e.reason ? <div className="text-muted-foreground">السبب: {e.reason}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ReasonDialog({
  title,
  onCancel,
  onConfirm,
  loading,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  loading?: boolean;
}) {
  const [r, setR] = useState("");
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-xl bg-background p-4 shadow-xl border">
        <div className="font-bold mb-2">{title}</div>
        <textarea
          className="inp"
          rows={3}
          placeholder="اكتب السبب (مطلوب)…"
          value={r}
          onChange={(e) => setR(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <Btn variant="ghost" onClick={onCancel}>
            إلغاء
          </Btn>
          <Btn variant="primary" onClick={() => onConfirm(r)} disabled={!r.trim() || loading}>
            تأكيد
          </Btn>
        </div>
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
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
