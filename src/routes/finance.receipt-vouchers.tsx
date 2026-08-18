import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { showToast, EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import {
  Plus,
  Eye,
  Printer,
  Send,
  Check,
  Undo2,
  X,
  Trash2,
  RotateCcw,
  Landmark,
  Wallet,
} from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getAccounts, type Account } from "@/lib/api/accounts";
import { listCashboxes, listBankAccounts } from "@/lib/api/cash-bank";
import {
  listReceiptVouchers,
  getReceiptVoucher,
  createReceiptVoucher,
  updateReceiptVoucher,
  receiptVoucherAction,
  type ReceiptVoucher,
  type ReceiptAction,
} from "@/lib/api/receipt-vouchers";

export const Route = createFileRoute("/finance/receipt-vouchers")({
  head: () => ({ meta: [{ title: "سندات القبض — ثواب" }] }),
  component: Page,
});

export const RV_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمد — بانتظار الترحيل", tone: "primary" },
  posted: { label: "مُرحَّل", tone: "success" },
  rejected: { label: "مرفوض", tone: "destructive" },
  reversed: { label: "معكوس", tone: "warning" },
};

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
  const [editing, setEditing] = useState<{ item?: ReceiptVoucher } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const canCreate = userCan(user, "finance.receipt.create");

  const listQ = useQuery({
    queryKey: ["receipt-vouchers", queue, search],
    queryFn: () => listReceiptVouchers({ status: queue || undefined, search: search || undefined }),
  });
  const items = listQ.data?.items || [];
  const summary = listQ.data?.summary;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["receipt-vouchers"] });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "سندات القبض"]}
      title="سندات القبض"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => setEditing({})}>
            <Plus size={15} /> سند قبض جديد
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="مسودات" value={summary?.draft ?? 0} />
        <SummaryCard label="بانتظار الاعتماد" value={summary?.submitted ?? 0} />
        <SummaryCard label="بانتظار الترحيل" value={summary?.approved ?? 0} />
        <SummaryCard label="مُرحَّلة" value={summary?.posted ?? 0} />
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
          placeholder="بحث برقم السند / الدافع…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد سندات قبض"
          description="أنشئ أول سند قبض لاستلام مبلغ في صندوق أو حساب بنكي"
        />
      ) : (
        <Table
          columns={["رقم السند", "التاريخ", "الدافع", "الوجهة", "المبلغ", "الحالة", "القيد", ""]}
          rows={items}
          renderRow={(v: ReceiptVoucher) => (
            <>
              <Td className="font-mono text-xs font-semibold">{v.voucherNumber}</Td>
              <Td className="text-xs tabular-nums">{v.voucherDate}</Td>
              <Td className="font-medium">{v.payerName || "—"}</Td>
              <Td className="text-xs">
                {v.cashboxId ? (
                  <span className="inline-flex items-center gap-1">
                    <Wallet size={12} /> صندوق
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Landmark size={12} /> بنك
                  </span>
                )}
              </Td>
              <Td className="tabular-nums font-bold">{fmtSAR(v.totalAmount)}</Td>
              <Td>
                <Badge tone={RV_STATUS[v.status]?.tone || "muted"}>
                  {RV_STATUS[v.status]?.label || v.status}
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

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3 lg:p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg lg:text-2xl font-extrabold mt-1 tabular-nums">{value}</div>
    </Card>
  );
}

type LineForm = { accountId: string; amount: string; description: string };

function CreateEditDrawer({
  item,
  onClose,
  onSaved,
}: {
  item?: ReceiptVoucher;
  onClose: () => void;
  onSaved: () => void;
}) {
  const cashQ = useQuery({
    queryKey: ["cashboxes", "active"],
    queryFn: () => listCashboxes(false),
  });
  const bankQ = useQuery({ queryKey: ["banks", "active"], queryFn: () => listBankAccounts(false) });
  const acctQ = useQuery({ queryKey: ["accounts-all"], queryFn: () => getAccounts({}) });
  // Editing an existing draft → load its lines.
  const detailQ = useQuery({
    queryKey: ["receipt-voucher", item?.id, "edit"],
    queryFn: () => getReceiptVoucher(item!.id),
    enabled: !!item?.id,
  });

  const [destKind, setDestKind] = useState<"cash" | "bank">(item?.bankAccountId ? "bank" : "cash");
  const [f, setF] = useState<any>({
    voucherDate: item?.voucherDate || new Date().toISOString().slice(0, 10),
    cashboxId: item?.cashboxId || "",
    bankAccountId: item?.bankAccountId || "",
    payerName: item?.payerName || "",
    externalReference: item?.externalReference || "",
    description: item?.description || "",
  });
  const [lines, setLines] = useState<LineForm[]>([{ accountId: "", amount: "", description: "" }]);
  const [seededLines, setSeededLines] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  // Seed lines from the loaded draft detail once.
  if (item?.id && detailQ.data && !seededLines) {
    setSeededLines(true);
    setLines(
      detailQ.data.lines.map((l) => ({
        accountId: l.accountId,
        amount: String(l.amount),
        description: l.description || "",
      })),
    );
  }

  const activeLinkedIds = useMemo(() => {
    const s = new Set<string>();
    (cashQ.data?.items || []).forEach((c: any) => s.add(c.linkedAccountId));
    (bankQ.data?.items || []).forEach((b: any) => s.add(b.linkedAccountId));
    return s;
  }, [cashQ.data, bankQ.data]);

  // Credit accounts: postable, active, NOT mapped to an active cashbox/bank.
  const creditAccounts = (acctQ.data?.items || []).filter(
    (a: Account) => a.postable && a.status === "active" && !activeLinkedIds.has(a.id),
  );

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const destCurrency =
    destKind === "cash"
      ? (cashQ.data?.items || []).find((c: any) => c.id === f.cashboxId)?.currency || "SAR"
      : (bankQ.data?.items || []).find((b: any) => b.id === f.bankAccountId)?.currency || "SAR";

  const mut = useMutation({
    mutationFn: async () => {
      const body = {
        id: item?.id,
        voucherDate: f.voucherDate,
        cashboxId: destKind === "cash" ? f.cashboxId || null : null,
        bankAccountId: destKind === "bank" ? f.bankAccountId || null : null,
        payerName: f.payerName,
        externalReference: f.externalReference || null,
        description: f.description,
        currency: destCurrency,
        totalAmount: total,
        lines: lines
          .filter((l) => l.accountId && Number(l.amount) > 0)
          .map((l) => ({
            accountId: l.accountId,
            amount: Number(l.amount),
            description: l.description || undefined,
          })),
      };
      return item?.id ? updateReceiptVoucher(body) : createReceiptVoucher(body);
    },
    onSuccess: () => {
      showToast(item ? "تم حفظ المسودة" : "تم إنشاء السند", "success");
      onSaved();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const addLine = () => setLines((p) => [...p, { accountId: "", amount: "", description: "" }]);
  const rmLine = (i: number) => setLines((p) => p.filter((_, j) => j !== i));
  const setLine = (i: number, k: keyof LineForm, v: string) =>
    setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  return (
    <EntityFormDrawer
      open
      onClose={onClose}
      title={item ? `تعديل مسودة ${item.voucherNumber}` : "سند قبض جديد"}
      onSave={() => mut.mutate()}
      saveText={item ? "حفظ المسودة" : "إنشاء"}
      loading={mut.isPending}
    >
      <div className="space-y-3">
        <Field label="تاريخ السند *">
          <input
            type="date"
            className="inp"
            value={f.voucherDate}
            onChange={(e) => set("voucherDate", e.target.value)}
          />
        </Field>

        <Field label="استلام في *">
          <div className="flex gap-1.5 mb-2">
            <button
              type="button"
              onClick={() => setDestKind("cash")}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${destKind === "cash" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
            >
              صندوق
            </button>
            <button
              type="button"
              onClick={() => setDestKind("bank")}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${destKind === "bank" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
            >
              حساب بنكي
            </button>
          </div>
          {destKind === "cash" ? (
            <select
              className="inp"
              value={f.cashboxId}
              onChange={(e) => set("cashboxId", e.target.value)}
            >
              <option value="">— اختر صندوقاً —</option>
              {(cashQ.data?.items || []).map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name} ({c.currency})
                </option>
              ))}
            </select>
          ) : (
            <select
              className="inp"
              value={f.bankAccountId}
              onChange={(e) => set("bankAccountId", e.target.value)}
            >
              <option value="">— اختر حساباً بنكياً —</option>
              {(bankQ.data?.items || []).map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.bankName} · {b.ibanMasked || ""} ({b.currency})
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="استلمنا من (الدافع) *">
          <input
            className="inp"
            value={f.payerName}
            onChange={(e) => set("payerName", e.target.value)}
            placeholder="اسم الدافع"
          />
        </Field>
        <Field label="مرجع خارجي">
          <input
            className="inp"
            value={f.externalReference}
            onChange={(e) => set("externalReference", e.target.value)}
            placeholder="رقم شيك / حوالة / إيصال…"
          />
        </Field>
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
            <div className="text-xs font-semibold text-muted-foreground">حسابات الطرف الدائن *</div>
            <Btn variant="ghost" onClick={addLine}>
              <Plus size={13} /> سطر
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
                  <option value="">— اختر حساباً دائناً —</option>
                  {creditAccounts.map((a: Account) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <input
                    className="inp"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="المبلغ"
                    value={l.amount}
                    onChange={(e) => setLine(i, "amount", e.target.value)}
                  />
                  <input
                    className="inp"
                    placeholder="بيان السطر"
                    value={l.description}
                    onChange={(e) => setLine(i, "description", e.target.value)}
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="p-1.5 rounded hover:bg-muted text-destructive"
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
          <div className="flex items-center justify-between mt-2 rounded-lg bg-muted/40 px-3 py-2">
            <span className="text-xs font-semibold">الإجمالي (محسوب من السطور)</span>
            <span className="text-base font-extrabold tabular-nums">{fmtSAR(total)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            الترحيل: مدين = الحساب المرتبط بالصندوق/البنك، دائن = سطور السند. الرصيد يُحتسب من
            الأستاذ.
          </div>
        </div>
      </div>
    </EntityFormDrawer>
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
  onEdit: (item: ReceiptVoucher) => void;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [reason, setReason] = useState<{ action: ReceiptAction; title: string } | null>(null);
  const q = useQuery({ queryKey: ["receipt-voucher", id], queryFn: () => getReceiptVoucher(id) });
  const d = q.data;

  const actionMut = useMutation({
    mutationFn: (p: { action: ReceiptAction; reason?: string }) =>
      receiptVoucherAction(id, p.action, p.reason),
    onSuccess: (_r, p) => {
      showToast("تم تنفيذ الإجراء", "success");
      qc.invalidateQueries({ queryKey: ["receipt-voucher", id] });
      onChanged();
      setReason(null);
      if (p.action === "post" || p.action === "reverse") onChanged();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const st = d?.item.status;
  const can = (perm: string) => userCan(user, perm);
  const act = (action: ReceiptAction, needsReason: boolean, title: string) =>
    needsReason ? setReason({ action, title }) : actionMut.mutate({ action });

  return (
    <EntityFormDrawer open onClose={onClose} title="سند قبض" onSave={onClose} saveText="إغلاق">
      {d && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-mono font-bold">{d.item.voucherNumber}</div>
            <Badge tone={RV_STATUS[d.item.status]?.tone || "muted"}>
              {RV_STATUS[d.item.status]?.label || d.item.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <KV label="التاريخ" value={d.item.voucherDate} />
            <KV label="العملة" value={d.item.currency} />
            <KV label="الدافع" value={d.item.payerName || "—"} />
            <KV label="مرجع خارجي" value={d.item.externalReference || "—"} />
            <KV
              label="الوجهة"
              value={
                d.destination
                  ? `${d.destination.code} (${d.item.cashboxId ? "صندوق" : "بنك"})`
                  : d.item.cashboxId || d.item.bankAccountId || "—"
              }
            />
            <KV label="الحساب المرتبط" value={d.destination?.linkedAccountId || "—"} />
          </div>
          {d.item.description ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
              {d.item.description}
            </div>
          ) : null}

          <Card className="p-3">
            <div className="text-xs font-bold mb-2">سطور الطرف الدائن</div>
            <table className="w-full text-[12px]">
              <thead className="text-muted-foreground text-right">
                <tr>
                  <th className="py-1 pe-2">الحساب</th>
                  <th className="py-1 pe-2">البيان</th>
                  <th className="py-1 pe-2 text-left">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1 pe-2 font-mono text-xs">{l.accountId}</td>
                    <td className="py-1 pe-2">{l.description || "—"}</td>
                    <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t font-bold">
                  <td className="py-1 pe-2" colSpan={2}>
                    الإجمالي
                  </td>
                  <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(d.item.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          {d.journal ? (
            <div className="rounded-lg border bg-success/5 px-3 py-2 text-xs flex items-center justify-between">
              <span>
                القيد المُرحَّل: <span className="font-mono font-semibold">{d.journal.number}</span>
              </span>
              <button
                className="text-primary underline"
                onClick={() =>
                  nav({
                    to: "/finance/ledger",
                    search: { accountId: d.destination?.linkedAccountId } as any,
                  })
                }
              >
                عرض في الأستاذ
              </button>
            </div>
          ) : null}

          <Timeline history={d.history} />

          {/* Contextual actions — gated by permission; backend authoritative. */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {st === "draft" && can("finance.receipt.update_draft") && (
              <Btn variant="outline" onClick={() => onEdit(d.item)}>
                تعديل
              </Btn>
            )}
            {st === "draft" && can("finance.receipt.submit") && (
              <Btn variant="primary" onClick={() => act("submit", false, "")}>
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.receipt.approve") && (
              <Btn variant="primary" onClick={() => act("approve", false, "")}>
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {st === "submitted" && can("finance.receipt.reject") && (
              <>
                <Btn variant="outline" onClick={() => act("return", true, "إعادة للمسودة")}>
                  <Undo2 size={14} /> إعادة
                </Btn>
                <Btn variant="outline" onClick={() => act("reject", true, "رفض السند")}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === "approved" && can("finance.receipt.post") && (
              <Btn variant="primary" onClick={() => act("post", false, "")}>
                <Check size={14} /> ترحيل
              </Btn>
            )}
            {st === "posted" && can("finance.receipt.reverse") && (
              <Btn variant="outline" onClick={() => act("reverse", true, "عكس السند")}>
                <RotateCcw size={14} /> عكس
              </Btn>
            )}
            {st !== "draft" && (
              <Btn
                variant="ghost"
                onClick={() =>
                  nav({ to: "/finance/receipt-vouchers/$id/print", params: { id } as any })
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
