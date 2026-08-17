import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { showToast, ConfirmDialog, EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Landmark, Wallet, Plus, Eye, Pencil, Power, BookOpen } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { getAccounts, type Account } from "@/lib/api/accounts";
import {
  listCashboxes,
  listBankAccounts,
  createCashbox,
  updateCashbox,
  setCashboxActive,
  createBankAccount,
  updateBankAccount,
  setBankActive,
  getCashbox,
  getBankAccount,
  getCashboxLedger,
  getBankLedger,
  type Cashbox,
  type BankAccount,
} from "@/lib/api/cash-bank";
import { maskIban } from "@/lib/iban";

export const Route = createFileRoute("/finance/cash-bank")({
  head: () => ({ meta: [{ title: "النقد والبنوك — ثواب" }] }),
  component: Page,
});

type Tab = "cash" | "bank";

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("cash");
  const [editing, setEditing] = useState<any | null>(null); // {kind, item?}
  const [detailId, setDetailId] = useState<{ kind: Tab; id: string } | null>(null);
  const [toggleTarget, setToggleTarget] = useState<{
    kind: Tab;
    id: string;
    active: boolean;
    label: string;
  } | null>(null);

  const canCashCreate = userCan(user, "finance.cash.create");
  const canCashUpdate = userCan(user, "finance.cash.update");
  const canCashDeact = userCan(user, "finance.cash.deactivate");
  const canBankCreate = userCan(user, "finance.bank.create");
  const canBankUpdate = userCan(user, "finance.bank.update");
  const canBankDeact = userCan(user, "finance.bank.deactivate");

  const cashQ = useQuery({ queryKey: ["cashboxes"], queryFn: () => listCashboxes(true) });
  const bankQ = useQuery({ queryKey: ["bank-accounts"], queryFn: () => listBankAccounts(true) });
  const acctQ = useQuery({ queryKey: ["accounts-for-mapping"], queryFn: () => getAccounts({}) });

  const eligibleAccounts = (acctQ.data?.items || []).filter(
    (a: Account) => a.classification === "asset" && a.postable && a.status === "active",
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cashboxes"] });
    qc.invalidateQueries({ queryKey: ["bank-accounts"] });
  };

  const toggleMut = useMutation({
    mutationFn: (t: { kind: Tab; id: string; active: boolean }) =>
      t.kind === "cash" ? setCashboxActive(t.id, t.active) : setBankActive(t.id, t.active),
    onSuccess: () => {
      showToast("تم تحديث الحالة", "success");
      invalidate();
      setToggleTarget(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const cashItems = cashQ.data?.items || [];
  const bankItems = bankQ.data?.items || [];

  const summary = [
    {
      label: "إجمالي أرصدة الصناديق",
      value: fmtSAR(cashQ.data?.summary?.totalBalance ?? 0),
      icon: Wallet,
    },
    {
      label: "الصناديق النشطة",
      value: String(cashQ.data?.summary?.activeCount ?? 0),
      icon: Wallet,
    },
    {
      label: "إجمالي أرصدة البنوك",
      value: fmtSAR(bankQ.data?.summary?.totalBalance ?? 0),
      icon: Landmark,
    },
    {
      label: "الحسابات البنكية النشطة",
      value: String(bankQ.data?.summary?.activeCount ?? 0),
      icon: Landmark,
    },
  ];

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المالية", "النقد والبنوك"]}
      title="النقد والبنوك"
      actions={
        tab === "cash" && canCashCreate ? (
          <Btn variant="primary" onClick={() => setEditing({ kind: "cash" })}>
            <Plus size={15} /> صندوق جديد
          </Btn>
        ) : tab === "bank" && canBankCreate ? (
          <Btn variant="primary" onClick={() => setEditing({ kind: "bank" })}>
            <Plus size={15} /> حساب بنكي جديد
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {summary.map((s) => (
          <Card key={s.label} className="p-3 lg:p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <s.icon size={14} /> {s.label}
            </div>
            <div className="text-base lg:text-xl font-extrabold mt-1 tabular-nums">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="flex gap-1.5 mb-3">
        <button
          onClick={() => setTab("cash")}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium ${tab === "cash" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
        >
          الصناديق
        </button>
        <button
          onClick={() => setTab("bank")}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium ${tab === "bank" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
        >
          الحسابات البنكية
        </button>
      </div>

      {tab === "cash" ? (
        cashItems.length === 0 ? (
          <EmptyState
            title="لا توجد صناديق"
            description="أضف أول صندوق نقدي مرتبط بحساب أصول قابل للترحيل"
          />
        ) : (
          <Table
            columns={[
              "الرمز",
              "الاسم",
              "الحساب المرتبط",
              "العملة",
              "الرصيد (من الأستاذ)",
              "الحالة",
              "",
            ]}
            rows={cashItems}
            renderRow={(c: Cashbox) => (
              <>
                <Td className="font-mono text-xs">{c.code}</Td>
                <Td className="font-semibold">{c.name}</Td>
                <Td className="text-xs font-mono">{c.linkedAccountId}</Td>
                <Td className="text-xs">{c.currency}</Td>
                <Td
                  className={`tabular-nums font-bold ${(c.glBalance ?? 0) < 0 ? "text-destructive" : ""}`}
                >
                  {fmtSAR(c.glBalance ?? 0)}
                </Td>
                <Td>
                  <Badge tone={c.status === "active" ? "success" : "muted"}>
                    {c.status === "active" ? "نشط" : "معطّل"}
                  </Badge>
                </Td>
                <Td>
                  <RowActions
                    onView={() => setDetailId({ kind: "cash", id: c.id })}
                    onEdit={canCashUpdate ? () => setEditing({ kind: "cash", item: c }) : undefined}
                    onToggle={
                      canCashDeact
                        ? () =>
                            setToggleTarget({
                              kind: "cash",
                              id: c.id,
                              active: c.status !== "active",
                              label: c.code,
                            })
                        : undefined
                    }
                    active={c.status === "active"}
                  />
                </Td>
              </>
            )}
          />
        )
      ) : bankItems.length === 0 ? (
        <EmptyState
          title="لا توجد حسابات بنكية"
          description="أضف أول حساب بنكي مرتبط بحساب أصول قابل للترحيل"
        />
      ) : (
        <Table
          columns={[
            "الرمز",
            "البنك",
            "اسم الحساب",
            "الآيبان",
            "العملة",
            "الرصيد (من الأستاذ)",
            "الحالة",
            "",
          ]}
          rows={bankItems}
          renderRow={(b: BankAccount) => (
            <>
              <Td className="font-mono text-xs">{b.code}</Td>
              <Td className="font-semibold">{b.bankName}</Td>
              <Td className="text-xs">{b.accountName}</Td>
              <Td className="font-mono text-xs tracking-wide">{b.ibanMasked || "—"}</Td>
              <Td className="text-xs">{b.currency}</Td>
              <Td
                className={`tabular-nums font-bold ${(b.glBalance ?? 0) < 0 ? "text-destructive" : ""}`}
              >
                {fmtSAR(b.glBalance ?? 0)}
              </Td>
              <Td>
                <Badge tone={b.status === "active" ? "success" : "muted"}>
                  {b.status === "active" ? "نشط" : "معطّل"}
                </Badge>
              </Td>
              <Td>
                <RowActions
                  onView={() => setDetailId({ kind: "bank", id: b.id })}
                  onEdit={canBankUpdate ? () => setEditing({ kind: "bank", item: b }) : undefined}
                  onToggle={
                    canBankDeact
                      ? () =>
                          setToggleTarget({
                            kind: "bank",
                            id: b.id,
                            active: b.status !== "active",
                            label: b.code,
                          })
                      : undefined
                  }
                  active={b.status === "active"}
                />
              </Td>
            </>
          )}
        />
      )}

      {editing && (
        <EditDrawer
          kind={editing.kind}
          item={editing.item}
          accounts={eligibleAccounts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate();
            setEditing(null);
          }}
        />
      )}

      {detailId && (
        <DetailDrawer
          kind={detailId.kind}
          id={detailId.id}
          onClose={() => setDetailId(null)}
          onOpenLedger={(accountId) => {
            setDetailId(null);
            nav({ to: "/finance/ledger", search: { accountId } as any });
          }}
        />
      )}

      <ConfirmDialog
        open={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => toggleTarget && toggleMut.mutate(toggleTarget)}
        title={toggleTarget?.active ? "تفعيل" : "تعطيل"}
        message={
          toggleTarget?.active
            ? `تفعيل "${toggleTarget?.label}"؟`
            : `تعطيل "${toggleTarget?.label}"؟ سيبقى السجل التاريخي والرصيد ظاهرين، ولن يُتاح اختياره للعمليات الجديدة. لا يُنشأ أي قيد محاسبي.`
        }
        confirmText={toggleTarget?.active ? "تفعيل" : "تعطيل"}
        cancelText="إلغاء"
        variant={toggleTarget?.active ? "default" : "destructive"}
      />
    </AppShell>
  );
}

function RowActions({
  onView,
  onEdit,
  onToggle,
  active,
}: {
  onView: () => void;
  onEdit?: () => void;
  onToggle?: () => void;
  active: boolean;
}) {
  return (
    <div className="flex gap-1 justify-end">
      <button className="p-1.5 rounded hover:bg-muted" title="عرض" onClick={onView}>
        <Eye size={15} />
      </button>
      {onEdit && (
        <button className="p-1.5 rounded hover:bg-muted" title="تعديل" onClick={onEdit}>
          <Pencil size={15} />
        </button>
      )}
      {onToggle && (
        <button
          className={`p-1.5 rounded hover:bg-muted ${active ? "text-destructive" : "text-success"}`}
          title={active ? "تعطيل" : "تفعيل"}
          onClick={onToggle}
        >
          <Power size={15} />
        </button>
      )}
    </div>
  );
}

function EditDrawer({
  kind,
  item,
  accounts,
  onClose,
  onSaved,
}: {
  kind: Tab;
  item?: any;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isBank = kind === "bank";
  const [f, setF] = useState<any>(
    item
      ? { ...item }
      : {
          code: "",
          name: "",
          bankName: "",
          accountName: "",
          iban: "",
          linkedAccountId: "",
          currency: "SAR",
          notes: "",
        },
  );
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      if (isBank) {
        const body = {
          id: item?.id,
          code: f.code,
          bankName: f.bankName,
          accountName: f.accountName,
          iban: f.iban || undefined,
          linkedAccountId: f.linkedAccountId,
          currency: f.currency,
          notes: f.notes,
        };
        return item ? updateBankAccount(body) : createBankAccount(body);
      }
      const body = {
        id: item?.id,
        code: f.code,
        name: f.name,
        linkedAccountId: f.linkedAccountId,
        currency: f.currency,
        notes: f.notes,
      };
      return item ? updateCashbox(body) : createCashbox(body);
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
      title={`${item ? "تعديل" : "إضافة"} ${isBank ? "حساب بنكي" : "صندوق"}`}
      onSave={() => mut.mutate()}
      saveText={item ? "حفظ" : "إنشاء"}
    >
      <div className="space-y-3">
        <Field label="الرمز *">
          <input className="inp" value={f.code} onChange={(e) => set("code", e.target.value)} />
        </Field>
        {isBank ? (
          <>
            <Field label="اسم البنك *">
              <input
                className="inp"
                value={f.bankName}
                onChange={(e) => set("bankName", e.target.value)}
              />
            </Field>
            <Field label="اسم الحساب">
              <input
                className="inp"
                value={f.accountName}
                onChange={(e) => set("accountName", e.target.value)}
              />
            </Field>
            <Field label="الآيبان (IBAN)">
              <input
                className="inp font-mono"
                value={f.iban}
                onChange={(e) => set("iban", e.target.value)}
                placeholder="SA.."
              />
              {f.iban ? (
                <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                  {maskIban(f.iban)}
                </div>
              ) : null}
            </Field>
          </>
        ) : (
          <Field label="الاسم *">
            <input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
        )}
        <Field label="الحساب المحاسبي المرتبط * (أصول قابل للترحيل)">
          <select
            className="inp"
            value={f.linkedAccountId}
            onChange={(e) => set("linkedAccountId", e.target.value)}
            disabled={!!item}
          >
            <option value="">— اختر حساباً —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          {item ? (
            <div className="text-[10px] text-warning-foreground mt-1">
              لا يمكن تغيير الحساب المرتبط بعد وجود حركة مُرحّلة. للتصحيح: عطّل الكيان وأنشئ آخر.
            </div>
          ) : null}
        </Field>
        <Field label="العملة">
          <input
            className="inp"
            value={f.currency}
            onChange={(e) => set("currency", e.target.value)}
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

function DetailDrawer({
  kind,
  id,
  onClose,
  onOpenLedger,
}: {
  kind: Tab;
  id: string;
  onClose: () => void;
  onOpenLedger: (accountId: string) => void;
}) {
  const [asOf, setAsOf] = useState("");
  const q = useQuery({
    queryKey: [kind, id, asOf],
    queryFn: () =>
      kind === "cash"
        ? getCashbox(id, asOf || undefined)
        : getBankAccount(id, { asOf: asOf || undefined }),
  });
  const d = q.data;
  return (
    <EntityFormDrawer open onClose={onClose} title="التفاصيل" onSave={onClose} saveText="إغلاق">
      {d && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <KV label="الرمز" value={d.item.code} />
            <KV label="الحالة" value={d.item.status === "active" ? "نشط" : "معطّل"} />
            <KV
              label={kind === "cash" ? "الاسم" : "البنك"}
              value={kind === "cash" ? d.item.name : d.item.bankName}
            />
            <KV label="العملة" value={d.item.currency} />
            <KV
              label="الحساب المرتبط"
              value={
                d.linkedAccount
                  ? `${d.linkedAccount.code} — ${d.linkedAccount.name}`
                  : d.item.linkedAccountId
              }
            />
            {kind === "bank" && <KV label="الآيبان" value={d.item.ibanMasked || "—"} />}
          </div>

          <Card className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold">الرصيد من دفتر الأستاذ</div>
              <input
                type="date"
                className="inp !w-auto !py-1 text-xs"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                title="الرصيد كما في تاريخ"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <KV label="رصيد أول المدة" value={fmtSAR(d.balance.openingBalance)} />
              <KV label="مدين الفترة" value={fmtSAR(d.balance.periodDebit)} />
              <KV label="دائن الفترة" value={fmtSAR(d.balance.periodCredit)} />
              <KV
                label={asOf ? `الرصيد كما في ${asOf}` : "الرصيد الختامي"}
                value={fmtSAR(d.balance.closingBalance)}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              كل الأرصدة محسوبة من القيود المُرحّلة/المعكوسة في الأستاذ العام — لا رصيد مخزّن.
            </div>
          </Card>

          {d.historyLocked ? (
            <div className="text-[11px] text-warning-foreground">
              يوجد حركة مُرحّلة على الحساب المرتبط — الربط المحاسبي مقفل ولا يمكن تغييره.
            </div>
          ) : null}

          <LedgerPanel
            kind={kind}
            id={id}
            onOpenFull={() => onOpenLedger(d.item.linkedAccountId)}
          />
        </div>
      )}
    </EntityFormDrawer>
  );
}

function LedgerPanel({ kind, id, onOpenFull }: { kind: Tab; id: string; onOpenFull: () => void }) {
  const q = useQuery({
    queryKey: [kind, id, "ledger"],
    queryFn: () => (kind === "cash" ? getCashboxLedger(id) : getBankLedger(id)),
    retry: false,
  });
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold">الحركة من دفتر الأستاذ</div>
        <Btn variant="ghost" onClick={onOpenFull} title="فتح دفتر الأستاذ الكامل">
          <BookOpen size={14} />
        </Btn>
      </div>
      {q.isLoading ? (
        <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
      ) : q.error ? (
        <div className="text-xs text-destructive">
          {(q.error as Error).message || "لا تملك صلاحية عرض الحركة"}
        </div>
      ) : (q.data?.movements.length ?? 0) === 0 ? (
        <div className="text-xs text-muted-foreground">لا توجد حركات مُرحّلة.</div>
      ) : (
        <div className="overflow-x-auto max-h-64">
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
              {q.data!.movements.map((m) => (
                <tr key={m.lineId} className="border-t">
                  <td className="py-1 pe-2 tabular-nums">{m.date}</td>
                  <td className="py-1 pe-2 font-mono">{m.number}</td>
                  <td className="py-1 pe-2">{m.source}</td>
                  <td className="py-1 pe-2 tabular-nums">{m.debit ? fmtSAR(m.debit) : "—"}</td>
                  <td className="py-1 pe-2 tabular-nums">{m.credit ? fmtSAR(m.credit) : "—"}</td>
                  <td className="py-1 pe-2 tabular-nums font-semibold">
                    {fmtSAR(m.runningBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
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
