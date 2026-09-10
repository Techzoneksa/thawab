import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn } from "@/components/erp/AppShell";
import { Combobox } from "@/components/erp/Combobox";
import { showToast, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { customerLookup } from "@/lib/api/customers-finance";
import { createSalesInvoice } from "@/lib/api/sales-invoices";

export const Route = createFileRoute("/finance/sales-invoices_/new")({
  head: () => ({ meta: [{ title: "فاتورة مبيعات جديدة — ثواب" }] }),
  component: NewSalesInvoicePage,
});

const FUND_OPTIONS = [
  { value: "unrestricted", label: "غير مقيّد" },
  { value: "restricted", label: "مقيّد" },
  { value: "endowment", label: "وقف" },
];

type LineForm = {
  accountId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
};
const emptyLine = (): LineForm => ({
  accountId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  taxRate: "15",
});
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function NewSalesInvoicePage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canCreate = userCan(user, "finance.sales_invoice.create");

  const acctQ = useQuery({ queryKey: ["accounts-all"], queryFn: () => getAccounts({}) });

  const [f, setF] = useState<any>({
    customerId: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    fund: "unrestricted",
    customerReference: "",
    description: "",
  });
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  // Revenue accounts: postable, active, classification 'revenue'. The server
  // re-enforces the full rule.
  const revenueAccounts = (acctQ.data?.items || []).filter(
    (a: Account) => a.postable && a.status === "active" && a.classification === "revenue",
  );

  const lineNet = lines.map((l) => round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)));
  const lineTax = lines.map((l, i) => round2((lineNet[i] * (Number(l.taxRate) || 0)) / 100));
  const lineGross = lines.map((l, i) => round2(lineNet[i] + lineTax[i]));
  const subtotal = round2(lineNet.reduce((s, c) => s + c, 0));
  const vatTotal = round2(lineTax.reduce((s, c) => s + c, 0));
  const grand = round2(subtotal + vatTotal);

  const backToList = () => nav({ to: "/finance/sales-invoices" });

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
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
            taxRate: Number(l.taxRate) || 0,
          })),
      };
      return createSalesInvoice(body);
    },
    onSuccess: () => {
      showToast("تم إنشاء الفاتورة", "success");
      qc.invalidateQueries({ queryKey: ["sales-invoices"] });
      backToList();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const rmLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i));
  const setLine = (i: number, k: keyof LineForm, v: string) =>
    setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const validLines = lines.filter(
    (l) => l.accountId && Number(l.quantity) > 0 && Number(l.unitPrice) > 0,
  );
  const canSubmit = !!f.customerId && !!f.invoiceDate && validLines.length > 0 && !mut.isPending;

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "فواتير المبيعات", "جديدة"]}
      title="فاتورة مبيعات جديدة"
      actions={
        <Btn variant="ghost" onClick={backToList}>
          <ArrowRight size={15} /> رجوع للقائمة
        </Btn>
      }
    >
      {!canCreate ? (
        <EmptyState
          title="لا تملك صلاحية إنشاء فواتير المبيعات"
          description="تواصل مع مسؤول النظام لمنحك صلاحية finance.sales_invoice.create"
        />
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 pb-28">
          <Card className="p-4 space-y-3">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label="الصندوق">
                <select
                  className="inp"
                  value={f.fund}
                  onChange={(e) => set("fund", e.target.value)}
                >
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
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">
                بنود الفاتورة — حساب الإيراد المدين للعميل *
              </div>
              <Btn variant="ghost" onClick={addLine}>
                <Plus size={14} /> بند
              </Btn>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
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
                  <div className="grid grid-cols-3 gap-2">
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
                    <label className="relative">
                      <NumIn
                        placeholder="الضريبة %"
                        value={l.taxRate}
                        onChange={(v) => setLine(i, "taxRate", v)}
                      />
                      <span className="pointer-events-none absolute inset-y-0 start-2 flex items-center text-[10px] text-muted-foreground">
                        ض%
                      </span>
                    </label>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      صافي {fmtSAR(lineNet[i] || 0)} · ضريبة {fmtSAR(lineTax[i] || 0)} · الإجمالي{" "}
                      {fmtSAR(lineGross[i] || 0)}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className="p-1 rounded hover:bg-muted text-destructive"
                        onClick={() => rmLine(i)}
                        title="حذف"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-lg bg-muted/40 px-3 py-2 space-y-1">
              <Row label="الصافي (قبل الضريبة)" value={subtotal} />
              <Row label="ضريبة القيمة المضافة" value={vatTotal} />
              <Row label="الإجمالي المستحق على العميل" value={grand} bold />
            </div>
            <div className="text-[11px] text-muted-foreground mt-2">
              الترحيل يُنشئ: مدين الذمم المدينة (شامل الضريبة) / دائن الإيراد (الصافي) / دائن ضريبة
              المخرجات. القيم تُعاد حسابتها على الخادم. الفواتير الخاضعة للضريبة تتطلب تأكيد حساب
              ضريبة المخرجات من إعدادات ربط الحسابات.
            </div>
          </Card>

          {/* Inline action row (normal flow — no fixed bar, so the page scrolls
              freely and never collides with the mobile bottom nav). */}
          <Card className="p-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">الإجمالي: </span>
              <span className="font-extrabold tabular-nums">{fmtSAR(grand)}</span>
            </div>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={backToList} disabled={mut.isPending}>
                إلغاء
              </Btn>
              <Btn variant="primary" onClick={() => mut.mutate()} disabled={!canSubmit}>
                {mut.isPending ? "جارٍ الإنشاء…" : "إنشاء"}
              </Btn>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
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
