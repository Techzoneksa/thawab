import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { showToast, ConfirmDialog, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Landmark, Wallet, Plus, Eye, Pencil, Power } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  listCashboxes,
  listBankAccounts,
  setCashboxActive,
  setBankActive,
  type Cashbox,
  type BankAccount,
} from "@/lib/api/cash-bank";

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

  const openNew = (kind: Tab) => nav({ to: "/finance/cash-bank/new", search: { kind } as any });
  const openDetail = (kind: Tab, id: string) =>
    nav({ to: "/finance/cash-bank/$id", params: { id } as any, search: { kind } as any });
  const openEdit = (kind: Tab, id: string) =>
    nav({ to: "/finance/cash-bank/$id/edit", params: { id } as any, search: { kind } as any });

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
          <Btn variant="primary" onClick={() => openNew("cash")}>
            <Plus size={15} /> صندوق جديد
          </Btn>
        ) : tab === "bank" && canBankCreate ? (
          <Btn variant="primary" onClick={() => openNew("bank")}>
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
                    onView={() => openDetail("cash", c.id)}
                    onEdit={canCashUpdate ? () => openEdit("cash", c.id) : undefined}
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
                  onView={() => openDetail("bank", b.id)}
                  onEdit={canBankUpdate ? () => openEdit("bank", b.id) : undefined}
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
