import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { showToast, EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, Printer, RotateCcw, Send, Check, X, Undo2, BookCheck } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import { listPurchaseOrders } from "@/lib/api/governed-purchase-orders";
import {
  listGoodsReceipts,
  getGoodsReceipt,
  getReceivablePoLines,
  createGoodsReceipt,
  transitionGoodsReceipt,
  type GoodsReceipt,
  type ReceivablePoLine,
} from "@/lib/api/goods-receipts";

export const Route = createFileRoute("/procurement/goods-receipts")({
  head: () => ({ meta: [{ title: "سندات الاستلام — ثواب" }] }),
  component: Page,
});

export const GRN_STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "بانتظار الاعتماد", tone: "info" },
  approved: { label: "معتمد", tone: "info" },
  rejected: { label: "مرفوض", tone: "danger" },
  posted: { label: "مُرحَّل", tone: "success" },
  reversed: { label: "معكوس", tone: "warning" },
};

const GRNI_NOTE =
  "سند الاستلام يقيّد: مدين المستلَم (مخزون/مصروف/أصل) / دائن «بضاعة مستلمة لم تُفوتر (GRNI)». لا يمس الذمم الدائنة ولا رصيد المورد.";

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search]);
  const canCreate = userCan(user, "procurement.grn.create");

  const listQ = useQuery({
    queryKey: ["goods-receipts", search, page],
    queryFn: () => listGoodsReceipts({ search: search || undefined, page, pageSize: 25 }),
  });
  const items = listQ.data?.items || [];
  const summary = listQ.data?.summary;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["goods-receipts"] });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "سندات الاستلام"]}
      title="سندات الاستلام"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> إنشاء سند استلام
          </Btn>
        ) : null
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryCard
          label="مسودة/بانتظار"
          value={(summary?.draft ?? 0) + (summary?.submitted ?? 0)}
        />
        <SummaryCard label="مُرحَّلة" value={summary?.posted ?? 0} />
        <SummaryCard label="معكوسة" value={summary?.reversed ?? 0} />
        <SummaryCard label="قيمة GRNI المُرحَّلة" money value={summary?.grniValue ?? 0} />
      </div>

      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground mb-3">
        {GRNI_NOTE}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        <input
          className="inp !w-56 ms-auto"
          placeholder="بحث برقم السند…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState title="لا توجد سندات استلام" description="سجّل أول استلام من أمر شراء صادر" />
      ) : (
        <Table
          columns={["رقم السند", "التاريخ", "أمر الشراء", "القيمة (GRNI)", "الحالة", ""]}
          rows={items}
          renderRow={(v: GoodsReceipt) => (
            <>
              <Td className="font-mono text-xs font-semibold">{v.grnNumber}</Td>
              <Td className="text-xs tabular-nums">{v.receiptDate}</Td>
              <Td className="text-xs font-mono">{v.purchaseOrderId.slice(0, 10)}…</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(v.totalValue)}</Td>
              <Td>
                <Badge tone={GRN_STATUS[v.status]?.tone || "muted"}>
                  {GRN_STATUS[v.status]?.label || v.status}
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
        unit="سند"
        onPage={setPage}
      />

      {creating && (
        <CreateDrawer
          onClose={() => setCreating(false)}
          onSaved={() => {
            invalidate();
            setCreating(false);
          }}
        />
      )}
      {detailId && (
        <DetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={invalidate} />
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

function CreateDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [poId, setPoId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));

  const posQ = useQuery({
    queryKey: ["purchase-orders", "issued-for-grn"],
    queryFn: () => listPurchaseOrders({ status: "issued" }),
  });
  const linesQ = useQuery({
    queryKey: ["receivable-po-lines", poId],
    queryFn: () => getReceivablePoLines(poId),
    enabled: !!poId,
  });
  const lines = linesQ.data?.lines || [];

  const mut = useMutation({
    mutationFn: () =>
      createGoodsReceipt({
        purchaseOrderId: poId,
        receiptDate,
        notes,
        lines: lines
          .map((l) => ({ poLineId: l.poLineId, quantityReceived: Number(qty[l.poLineId]) || 0 }))
          .filter((l) => l.quantityReceived > 0),
      }),
    onSuccess: () => {
      showToast("تم إنشاء مسودة سند الاستلام", "success");
      onSaved();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const totalValue = lines.reduce((s, l) => s + (Number(qty[l.poLineId]) || 0) * l.unitPrice, 0);

  return (
    <EntityFormDrawer
      open
      onClose={onClose}
      title="إنشاء سند استلام (مسودة)"
      onSave={() => mut.mutate()}
      saveText="حفظ كمسودة"
      loading={mut.isPending}
    >
      <div className="space-y-3">
        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          {GRNI_NOTE}
        </div>
        <Field label="أمر الشراء (صادر) *">
          <select className="inp" value={poId} onChange={(e) => setPoId(e.target.value)}>
            <option value="">— اختر أمر شراء صادراً —</option>
            {(posQ.data?.items || []).map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.poNumber} — {p.subject}
              </option>
            ))}
          </select>
        </Field>
        <Field label="تاريخ الاستلام *">
          <input
            type="date"
            className="inp"
            value={receiptDate}
            onChange={(e) => setReceiptDate(e.target.value)}
          />
        </Field>

        {poId ? (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1">
              البنود القابلة للاستلام
            </div>
            <div className="space-y-2">
              {lines.map((l: ReceivablePoLine) => (
                <div key={l.poLineId} className="rounded-lg border p-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{l.description || "—"}</span>
                    <Badge tone="muted">{l.lineType}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                    مطلوب {l.orderedQuantity} · مستلم {l.receivedQuantity} · متبقٍ{" "}
                    {l.remainingQuantity} · سعر {fmtSAR(l.unitPrice)}
                  </div>
                  <input
                    className="inp mt-1.5"
                    type="number"
                    min="0"
                    max={l.remainingQuantity}
                    step="0.01"
                    placeholder={`كمية الاستلام (حد أقصى ${l.remainingQuantity})`}
                    value={qty[l.poLineId] || ""}
                    onChange={(e) => setQty((p) => ({ ...p, [l.poLineId]: e.target.value }))}
                    disabled={l.remainingQuantity <= 0}
                  />
                </div>
              ))}
              {lines.length === 0 ? (
                <div className="text-xs text-muted-foreground">لا توجد بنود.</div>
              ) : null}
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
              <span className="text-xs font-semibold">قيمة الاستلام (GRNI)</span>
              <span className="text-base font-extrabold tabular-nums">{fmtSAR(totalValue)}</span>
            </div>
          </div>
        ) : null}

        <Field label="ملاحظات">
          <textarea
            className="inp"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
    </EntityFormDrawer>
  );
}

function DetailDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [reasonAction, setReasonAction] = useState<null | "return" | "reject" | "reverse">(null);
  const [reason, setReason] = useState("");
  const q = useQuery({ queryKey: ["goods-receipt", id], queryFn: () => getGoodsReceipt(id) });
  const d = q.data;
  const status = d?.item.status;

  const act = useMutation({
    mutationFn: (vars: {
      action: "submit" | "approve" | "return" | "reject" | "post" | "reverse";
      reason?: string;
    }) => transitionGoodsReceipt(id, vars.action, vars.reason),
    onSuccess: (_r, vars) => {
      const msg: Record<string, string> = {
        submit: "تم الإرسال للاعتماد",
        approve: "تم اعتماد سند الاستلام",
        return: "تمت إعادة السند للمسودة",
        reject: "تم رفض السند",
        post: "تم ترحيل سند الاستلام",
        reverse: "تم عكس سند الاستلام",
      };
      showToast(msg[vars.action] || "تم", "success");
      qc.invalidateQueries({ queryKey: ["goods-receipt", id] });
      onChanged();
      setReasonAction(null);
      setReason("");
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const can = (p: string) => userCan(user, p);

  return (
    <EntityFormDrawer open onClose={onClose} title="سند استلام" onSave={onClose} saveText="إغلاق">
      {d && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-mono font-bold">{d.item.grnNumber}</div>
            <Badge tone={GRN_STATUS[d.item.status]?.tone || "muted"}>
              {GRN_STATUS[d.item.status]?.label || d.item.status}
            </Badge>
          </div>
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
            {GRNI_NOTE}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <KV label="أمر الشراء" value={d.po?.poNumber || d.item.purchaseOrderId} />
            <KV label="المورد" value={d.supplier?.name || "—"} />
            <KV label="تاريخ الاستلام" value={d.item.receiptDate} />
            <KV label="القيمة (GRNI)" value={fmtSAR(d.item.totalValue)} />
          </div>

          <Card className="p-3">
            <div className="text-xs font-bold mb-2">البنود المستلمة</div>
            <table className="w-full text-[12px]">
              <thead className="text-muted-foreground text-right">
                <tr>
                  <th className="py-1 pe-2">البند</th>
                  <th className="py-1 pe-2 text-left">كمية</th>
                  <th className="py-1 pe-2 text-left">سعر</th>
                  <th className="py-1 pe-2 text-left">القيمة</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1 pe-2">
                      {l.description || "—"}
                      <span className="text-[10px] text-muted-foreground"> ({l.lineType})</span>
                    </td>
                    <td className="py-1 pe-2 text-left tabular-nums">{l.quantityReceived}</td>
                    <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.unitPrice)}</td>
                    <td className="py-1 pe-2 text-left tabular-nums">{fmtSAR(l.lineValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {d.matchSummary ? (
            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px]">
              <div className="font-semibold text-muted-foreground mb-1">مطابقة الفوترة (GRNI)</div>
              <div className="grid grid-cols-3 gap-2 tabular-nums">
                <div>
                  <div className="text-[10px] text-muted-foreground">قيمة الاستلام</div>
                  <div className="font-bold">{fmtSAR(d.matchSummary.receivedValue)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">مفوتَر/مطابَق</div>
                  <div className="font-bold">{fmtSAR(d.matchSummary.invoicedValue)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">GRNI المتبقّي</div>
                  <div className="font-bold">{fmtSAR(d.matchSummary.remainingValue)}</div>
                </div>
              </div>
            </div>
          ) : null}

          {d.item.status === "reversed" && d.item.reversalReason ? (
            <div className="rounded-lg border bg-warning/5 px-3 py-2 text-xs">
              سبب العكس: {d.item.reversalReason}
            </div>
          ) : null}

          <Timeline history={d.history} />

          <div className="flex flex-wrap gap-1.5 pt-1">
            {status === "draft" && can("procurement.grn.submit") && (
              <Btn
                variant="primary"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "submit" })}
              >
                <Send size={14} /> إرسال للاعتماد
              </Btn>
            )}
            {status === "submitted" && can("procurement.grn.approve") && (
              <Btn
                variant="primary"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "approve" })}
              >
                <Check size={14} /> اعتماد
              </Btn>
            )}
            {status === "submitted" && can("procurement.grn.reject") && (
              <>
                <Btn
                  variant="outline"
                  disabled={act.isPending}
                  onClick={() => setReasonAction("return")}
                >
                  <Undo2 size={14} /> إعادة للمسودة
                </Btn>
                <Btn
                  variant="outline"
                  disabled={act.isPending}
                  onClick={() => setReasonAction("reject")}
                >
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {status === "approved" && can("procurement.grn.reject") && (
              <Btn
                variant="outline"
                disabled={act.isPending}
                onClick={() => setReasonAction("return")}
              >
                <Undo2 size={14} /> إعادة للمسودة
              </Btn>
            )}
            {status === "approved" && can("procurement.grn.post") && (
              <Btn
                variant="primary"
                disabled={act.isPending}
                onClick={() => act.mutate({ action: "post" })}
              >
                <BookCheck size={14} /> ترحيل
              </Btn>
            )}
            {status === "posted" && can("procurement.grn.reverse") && (
              <Btn
                variant="outline"
                disabled={act.isPending}
                onClick={() => setReasonAction("reverse")}
              >
                <RotateCcw size={14} /> عكس
              </Btn>
            )}
            <Btn
              variant="ghost"
              onClick={() =>
                nav({ to: "/procurement/goods-receipts/$id/print", params: { id } as any })
              }
            >
              <Printer size={14} /> طباعة
            </Btn>
          </div>
        </div>
      )}

      {reasonAction && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          dir="rtl"
        >
          <div className="w-full max-w-md rounded-xl bg-background p-4 shadow-xl border">
            <div className="font-bold mb-2">
              {reasonAction === "reverse"
                ? "عكس سند الاستلام"
                : reasonAction === "reject"
                  ? "رفض سند الاستلام"
                  : "إعادة السند للمسودة"}
            </div>
            <div className="text-[11px] text-muted-foreground mb-2">
              {reasonAction === "reverse"
                ? "سيتم عكس القيد وربط أستاذ GRNI وحركة المخزون معاً (لن يصبح المخزون سالباً)."
                : "يُرجى بيان السبب."}
            </div>
            <textarea
              className="inp"
              rows={3}
              placeholder="السبب (مطلوب)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <Btn
                variant="ghost"
                onClick={() => {
                  setReasonAction(null);
                  setReason("");
                }}
              >
                إلغاء
              </Btn>
              <Btn
                variant="primary"
                disabled={!reason.trim() || act.isPending}
                onClick={() => act.mutate({ action: reasonAction, reason })}
              >
                تأكيد
              </Btn>
            </div>
          </div>
        </div>
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
    create: "إنشاء مسودة",
    submit: "إرسال للاعتماد",
    approve: "اعتماد",
    return: "إعادة للمسودة",
    reject: "رفض",
    post: "ترحيل الاستلام",
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
