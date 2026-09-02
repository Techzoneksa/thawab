import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { Combobox } from "@/components/erp/Combobox";
import { showToast, EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, Printer, Send, Check, Undo2, X, Trash2, RotateCcw } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { customerLookup } from "@/lib/api/customers-finance";
import { invoiceSettlement } from "@/lib/api/ar-allocation";
import {
  listSalesInvoices,
  getSalesInvoice,
  createSalesInvoice,
  updateSalesInvoice,
  salesInvoiceAction,
  type SalesInvoice,
  type SalesInvoiceAction,
} from "@/lib/api/sales-invoices";

export const Route = createFileRoute("/finance/sales-invoices")({
  head: () => ({ meta: [{ title: "فواتير المبيعات — ثواب" }] }),
  component: Page,
});

export const SV_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمدة — بانتظار الترحيل", tone: "primary" },
  posted: { label: "مُرحَّلة", tone: "success" },
  rejected: { label: "مرفوضة", tone: "destructive" },
  reversed: { label: "معكوسة", tone: "warning" },
};

const FUND_OPTIONS = [
  { value: "unrestricted", label: "غير مقيّد" },
  { value: "restricted", label: "مقيّد" },
  { value: "endowment", label: "وقف" },
];

const QUEUES = [
  { key: "", label: "الكل" },
  { key: "draft", label: "مسودات" },
  { key: "submitted", label: "بانتظار الاعتماد" },
  { key: "approved", label: "معتمدة بانتظار الترحيل" },
  { key: "posted", label: "مرحلة" },
  { key: "rejected", label: "مرفوضة" },
  { key: "reversed", label: "معكوسة" },
];

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [queue, setQueue] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ item?: SalesInvoice } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [queue, search]);

  const canCreate = userCan(user, "finance.sales_invoice.create");

  const listQ = useQuery({
    queryKey: ["sales-invoices", queue, search, page],
    queryFn: () =>
      listSalesInvoices({
        status: queue || undefined,
        search: search || undefined,
        page,
        pageSize: 25,
      }),
  });
  const items = listQ.data?.items || [];
  const summary = listQ.data?.summary;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sales-invoices"] });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "فواتير المبيعات"]}
      title="فواتير المبيعات"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => setEditing({})}>
            <Plus size={15} /> فاتورة مبيعات جديدة
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="مسودات" value={summary?.draft ?? 0} />
        <SummaryCard label="بانتظار الاعتماد" value={summary?.submitted ?? 0} />
        <SummaryCard label="بانتظار الترحيل" value={summary?.approved ?? 0} />
        <SummaryCard label="إجمالي المُرحَّل" money value={summary?.outstanding ?? 0} />
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
          placeholder="بحث برقم الفاتورة / مرجع العميل…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد فواتير مبيعات"
          description="أصدر أول فاتورة مبيعات لإثبات إيراد وذمة مدينة (استحقاق) عند الترحيل"
        />
      ) : (
        <Table
          columns={[
            "رقم الفاتورة",
            "مرجع العميل",
            "التاريخ",
            "الاستحقاق",
            "الإجمالي",
            "الحالة",
            "القيد",
            "",
          ]}
          rows={items}
          renderRow={(v: SalesInvoice) => (
            <>
              <Td className="font-mono text-xs font-semibold">{v.invoiceNumber}</Td>
              <Td className="text-xs">{v.customerReference || "—"}</Td>
              <Td className="text-xs tabular-nums">{v.invoiceDate}</Td>
              <Td className="text-xs tabular-nums">{v.dueDate || "—"}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(v.totalAmount)}</Td>
              <Td>
                <Badge tone={SV_STATUS[v.status]?.tone || "muted"}>
                  {SV_STATUS[v.status]?.label || v.status}
                </Badge>
              </Td>
              <Td className="text-xs font-mono text-muted-foreground">
                {v.journalEntryId ? "✓" : "—"}
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
        unit="فاتورة"
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
  accountId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const emptyLine = (): LineForm => ({
  accountId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
});

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function CreateEditDrawer({
  item,
  onClose,
  onSaved,
}: {
  item?: SalesInvoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const acctQ = useQuery({ queryKey: ["accounts-all"], queryFn: () => getAccounts({}) });
  const detailQ = useQuery({
    queryKey: ["sales-invoice", item?.id, "edit"],
    queryFn: () => getSalesInvoice(item!.id),
    enabled: !!item?.id,
  });

  const [f, setF] = useState<any>({
    customerId: item?.customerId || "",
    invoiceDate: item?.invoiceDate || new Date().toISOString().slice(0, 10),
    dueDate: item?.dueDate || "",
    fund: item?.fund || "unrestricted",
    customerReference: item?.customerReference || "",
    description: item?.description || "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [seeded, setSeeded] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  if (item?.id && detailQ.data && !seeded) {
    setSeeded(true);
    setLines(
      detailQ.data.lines.map((l) => ({
        accountId: l.accountId,
        description: l.description || "",
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
      })),
    );
  }

  // Revenue accounts: postable, active, classification 'revenue' (never AR/cash/
  // bank/control). The server re-enforces the full rule.
  const revenueAccounts = (acctQ.data?.items || []).filter(
    (a: Account) => a.postable && a.status === "active" && a.classification === "revenue",
  );

  const computed = lines.map((l) => round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)));
  const grand = round2(computed.reduce((s, c) => s + c, 0));

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        id: item?.id,
        customerId: f.customerId,
        invoiceDate: f.invoiceDate,
        dueDate: f.dueDate || null,
        fund: f.fund,
        customerReference: f.customerReference || null,
        description: f.description,
        lines: lines
          .filter((l) => l.accountId && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
          .map((l) => ({
            accountId: l.accountId,
            description: l.description || undefined,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
          })),
      };
      return item?.id ? updateSalesInvoice(body) : createSalesInvoice(body);
    },
    onSuccess: () => {
      showToast(item ? "تم حفظ المسودة" : "تم إنشاء الفاتورة", "success");
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
      title={item ? `تعديل مسودة ${item.invoiceNumber}` : "فاتورة مبيعات جديدة"}
      onSave={() => mut.mutate()}
      saveText={item ? "حفظ المسودة" : "إنشاء"}
      loading={mut.isPending}
    >
      <div className="space-y-3">
        <Field label="العميل *">
          <Combobox
            value={f.customerId}
            displayValue={
              detailQ.data?.customer
                ? `${detailQ.data.customer.customerCode ? `${detailQ.data.customer.customerCode} — ` : ""}${detailQ.data.customer.name}`
                : undefined
            }
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
          <Field label="تاريخ الفاتورة *">
            <input
              type="date"
              className="inp"
              value={f.invoiceDate}
              onChange={(e) => set("invoiceDate", e.target.value)}
            />
          </Field>
          <Field label="تاريخ الاستحقاق">
            <input
              type="date"
              className="inp"
              value={f.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Field label="الصندوق">
            <select className="inp" value={f.fund} onChange={(e) => set("fund", e.target.value)}>
              {FUND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="مرجع العميل">
            <input
              className="inp"
              value={f.customerReference}
              onChange={(e) => set("customerReference", e.target.value)}
              placeholder="رقم أمر شراء العميل…"
            />
          </Field>
        </div>

        <Field label="البيان">
          <textarea
            className="inp"
            rows={2}
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-semibold text-muted-foreground">
              بنود الفاتورة — حساب الإيراد المدين للعميل *
            </div>
            <Btn variant="ghost" onClick={addLine}>
              <Plus size={13} /> بند
            </Btn>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border p-2 space-y-1.5">
                <select
                  className="inp"
                  value={l.accountId}
                  onChange={(e) => setLine(i, "accountId", e.target.value)}
                >
                  <option value="">— اختر حساب الإيراد —</option>
                  {revenueAccounts.map((a: Account) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                <input
                  className="inp"
                  placeholder="وصف البند"
                  value={l.description}
                  onChange={(e) => setLine(i, "description", e.target.value)}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <NumIn
                    placeholder="الكمية"
                    value={l.quantity}
                    onChange={(v) => setLine(i, "quantity", v)}
                  />
                  <NumIn
                    placeholder="سعر الوحدة"
                    value={l.unitPrice}
                    onChange={(v) => setLine(i, "unitPrice", v)}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="tabular-nums">الإجمالي {fmtSAR(computed[i] || 0)}</span>
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
            <Row label="الإجمالي المستحق على العميل" value={grand} bold />
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            الترحيل يُنشئ: مدين الذمم المدينة / دائن الإيراد — ويُنسب الطرف المدين لأستاذ العميل. لا
            ضريبة في هذه المرحلة. القيم تُعاد حسابتها على الخادم.
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
  onEdit: (item: SalesInvoice) => void;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [reason, setReason] = useState<{ action: SalesInvoiceAction; title: string } | null>(null);
  const q = useQuery({ queryKey: ["sales-invoice", id], queryFn: () => getSalesInvoice(id) });
  const d = q.data;
  const canAlloc = userCan(user, "finance.customer_receipt_allocation.view");
  const settleQ = useQuery({
    queryKey: ["sales-invoice-settlement", id],
    queryFn: () => invoiceSettlement(id),
    enabled: canAlloc && d?.item.status === "posted",
    retry: false,
  });

  const actionMut = useMutation({
    mutationFn: (p: { action: SalesInvoiceAction; reason?: string }) =>
      salesInvoiceAction(id, p.action, p.reason),
    onSuccess: () => {
      showToast("تم تنفيذ الإجراء", "success");
      qc.invalidateQueries({ queryKey: ["sales-invoice", id] });
      onChanged();
      setReason(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const st = d?.item.status;
  const can = (perm: string) => userCan(user, perm);
  const act = (action: SalesInvoiceAction, needsReason: boolean, title: string) =>
    needsReason ? setReason({ action, title }) : actionMut.mutate({ action });

  return (
    <EntityFormDrawer
      open
      onClose={onClose}
      title="فاتورة مبيعات"
      onSave={onClose}
      saveText="إغلاق"
    >
      {d && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-mono font-bold">{d.item.invoiceNumber}</div>
            <Badge tone={SV_STATUS[d.item.status]?.tone || "muted"}>
              {SV_STATUS[d.item.status]?.label || d.item.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <KV label="العميل" value={d.customer?.name || d.item.customerId} />
            <KV label="مرجع العميل" value={d.item.customerReference || "—"} />
            <KV label="تاريخ الفاتورة" value={d.item.invoiceDate} />
            <KV label="تاريخ الاستحقاق" value={d.item.dueDate || "—"} />
            <KV label="العملة" value={d.item.currency} />
            <KV
              label="الصندوق"
              value={FUND_OPTIONS.find((o) => o.value === d.item.fund)?.label || d.item.fund}
            />
          </div>
          {d.item.description ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              {d.item.description}
            </div>
          ) : null}

          <Card className="p-3">
            <div className="text-xs font-bold mb-2">بنود الفاتورة</div>
            <table className="w-full text-[12px]">
              <thead className="text-muted-foreground text-right">
                <tr>
                  <th className="py-1 pe-2">حساب الإيراد</th>
                  <th className="py-1 pe-2 text-left">كمية</th>
                  <th className="py-1 pe-2 text-left">سعر</th>
                  <th className="py-1 pe-2 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1 pe-2 font-mono text-[11px]">
                      {l.accountId}
                      {l.description ? (
                        <div className="text-muted-foreground font-sans">{l.description}</div>
                      ) : null}
                    </td>
                    <td className="py-1 pe-2 text-left tabular-nums">{l.quantity}</td>
                    <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.unitPrice)}</td>
                    <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 border-t pt-2 space-y-1">
              <Row label="الإجمالي المستحق" value={d.item.totalAmount} bold />
            </div>
          </Card>

          {d.journal ? (
            <div className="rounded-lg border bg-success/5 px-3 py-2 text-xs flex items-center justify-between">
              <span>
                القيد المُرحَّل: <span className="font-mono font-semibold">{d.journal.number}</span>
              </span>
              <button
                className="text-primary underline"
                onClick={() => nav({ to: "/finance/customers" })}
              >
                أستاذ العملاء
              </button>
            </div>
          ) : null}

          {canAlloc && d.item.status === "posted" && settleQ.data ? (
            <Card className="p-3">
              <div className="text-xs font-bold mb-2">تسوية التحصيل (تخصيص)</div>
              <div className="grid grid-cols-3 gap-2">
                <KV label="الأصل" value={fmtSAR(settleQ.data.originalReceivable)} />
                <KV label="المُخصَّص" value={fmtSAR(settleQ.data.allocated)} />
                <KV label="المتبقي" value={fmtSAR(settleQ.data.outstanding)} />
              </div>
              {(settleQ.data.allocations || []).length > 0 && (
                <table className="mt-2 w-full text-[11px]">
                  <thead className="text-right text-muted-foreground">
                    <tr>
                      <th className="py-1 pe-2">سند القبض</th>
                      <th className="py-1 pe-2">التاريخ</th>
                      <th className="py-1 pe-2">المبلغ المُخصَّص</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settleQ.data.allocations.map((a: any) => (
                      <tr key={a.id} className="border-t">
                        <td className="py-1 pe-2 font-mono">{a.customerReceiptId}</td>
                        <td className="py-1 pe-2 tabular-nums">{a.receiptDate}</td>
                        <td className="py-1 pe-2 tabular-nums font-semibold">{fmtSAR(a.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-2 text-[10px] text-muted-foreground">
                التخصيص بيانات تسوية — لا يُنشئ قيداً محاسبياً. المتبقي = الأصل − إجمالي التخصيصات.
              </div>
            </Card>
          ) : null}

          <Timeline history={d.history} />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {st === "draft" && can("finance.sales_invoice.update_draft") && (
              <Btn variant="outline" onClick={() => onEdit(d.item)}>
                تعديل
              </Btn>
            )}
            {st === "draft" && can("finance.sales_invoice.submit") && (
              <Btn variant="primary" onClick={() => act("submit", false, "")}>
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.sales_invoice.approve") && (
              <Btn variant="primary" onClick={() => act("approve", false, "")}>
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.sales_invoice.reject") && (
              <>
                <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                  <Undo2 size={14} /> إعادة
                </Btn>
                <Btn variant="outline" onClick={() => act("reject", true, "رفض الفاتورة")}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === "approved" && can("finance.sales_invoice.post") && (
              <Btn variant="primary" onClick={() => act("post", false, "")}>
                <Check size={14} /> ترحيل
              </Btn>
            )}
            {st === "posted" && can("finance.sales_invoice.reverse") && (
              <Btn variant="outline" onClick={() => act("reverse", true, "عكس الفاتورة")}>
                <RotateCcw size={14} /> عكس
              </Btn>
            )}
            {st !== "draft" && (
              <Btn
                variant="ghost"
                onClick={() =>
                  nav({ to: "/finance/sales-invoices/$id/print", params: { id } as any })
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
  history: {
    id: string;
    action: string;
    toStatus: string | null;
    userName: string;
    reason: string;
    createdAt: string;
  }[];
}) {
  const LABEL: Record<string, string> = {
    create: "إنشاء",
    submit: "إرسال للاعتماد",
    approve: "اعتماد",
    return: "إعادة للمسودة",
    reject: "رفض",
    post: "ترحيل",
    reverse: "عكس",
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
