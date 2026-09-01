import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell, Card, Btn, Badge, Table, Td } from "@/components/erp/AppShell";
import { Pager } from "@/components/erp/Pager";
import { showToast, EntityFormDrawer, EmptyState } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import { Plus, Eye, X } from "lucide-react";
import { useAuth, userCan } from "@/lib/api/auth";
import {
  listPurchaseReturns,
  getPurchaseReturn,
  returnableGrnLines,
  eligibleGrnsForReturn,
  createPurchaseReturn,
  purchaseReturnAction,
  type PurchaseReturnRow,
} from "@/lib/api/purchase-returns";

export const Route = createFileRoute("/procurement/purchase-returns")({
  head: () => ({ meta: [{ title: "مرتجعات المشتريات — جاد كلاود" }] }),
  component: Page,
});

const STATUS: Record<string, { label: string; tone: any }> = {
  draft: { label: "مسودة", tone: "muted" },
  submitted: { label: "مُرسَل", tone: "info" },
  approved: { label: "معتمد", tone: "primary" },
  rejected: { label: "مرفوض", tone: "destructive" },
  posted: { label: "مُرحَّل", tone: "success" },
  reversed: { label: "معكوس", tone: "warning" },
};

function Page() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canCreate = userCan(user, "procurement.purchase_return.create");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  useEffect(() => setPage(1), [search]);

  const listQ = useQuery({
    queryKey: ["purchase-returns", search, page],
    queryFn: () => listPurchaseReturns({ search: search || undefined, page, pageSize: 25 }),
  });
  const items = listQ.data?.items || [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["purchase-returns"] });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "المشتريات", "مرتجعات المشتريات"]}
      title="مرتجعات المشتريات"
      actions={
        canCreate ? (
          <Btn variant="primary" onClick={() => setCreating(true)}>
            <Plus size={15} /> مرتجع جديد
          </Btn>
        ) : null
      }
    >
      <div className="mb-3">
        <input
          className="inp !w-72"
          placeholder="بحث برقم المرتجع…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="لا توجد مرتجعات"
          description="أنشئ مرتجعاً للكمية المستلمة غير المفوترة"
        />
      ) : (
        <Table
          columns={["رقم المرتجع", "التاريخ", "سند الاستلام", "أمر الشراء", "القيمة", "الحالة", ""]}
          rows={items}
          renderRow={(r: PurchaseReturnRow) => (
            <>
              <Td className="font-mono text-xs font-semibold">{r.returnNumber}</Td>
              <Td className="text-xs tabular-nums">{r.returnDate}</Td>
              <Td className="text-xs font-mono">{r.grnNumber || "—"}</Td>
              <Td className="text-xs font-mono">{r.poNumber || "—"}</Td>
              <Td className="tabular-nums font-bold">{fmtSAR(r.totalValue)}</Td>
              <Td>
                <Badge tone={STATUS[r.status]?.tone || "muted"}>
                  {STATUS[r.status]?.label || r.status}
                </Badge>
              </Td>
              <Td>
                <div className="flex justify-end">
                  <button
                    className="p-1.5 rounded hover:bg-muted"
                    title="عرض"
                    onClick={() => setDetailId(r.id)}
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
        unit="مرتجع"
        onPage={setPage}
      />

      {creating && (
        <CreateDrawer
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            refresh();
            setDetailId(id);
          }}
        />
      )}
      {detailId && (
        <DetailDrawer id={detailId} onClose={() => setDetailId(null)} onChanged={refresh} />
      )}
    </AppShell>
  );
}

function CreateDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [grnSearch, setGrnSearch] = useState("");
  const [grnId, setGrnId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const grnsQ = useQuery({
    queryKey: ["eligible-grn-picker", grnSearch],
    queryFn: () => eligibleGrnsForReturn({ q: grnSearch || undefined, limit: 20 }),
    enabled: !grnId,
  });
  const returnableQ = useQuery({
    queryKey: ["returnable", grnId],
    queryFn: () => returnableGrnLines(grnId!),
    enabled: !!grnId,
  });

  const createMut = useMutation({
    mutationFn: () => {
      const lines = Object.entries(qty)
        .map(([goodsReceiptLineId, v]) => ({ goodsReceiptLineId, quantity: Number(v) }))
        .filter((l) => l.quantity > 0);
      if (!grnId || lines.length === 0) throw new Error("حدّد كمية إرجاع واحدة على الأقل");
      return createPurchaseReturn({ goodsReceiptId: grnId, reason: reason || undefined, lines });
    },
    onSuccess: (r) => {
      showToast("تم إنشاء المرتجع (مسودة)", "success");
      onCreated(r.item.id);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  const lines = returnableQ.data?.lines || [];

  return (
    <EntityFormDrawer
      open
      onClose={onClose}
      title="مرتجع مشتريات جديد"
      onSave={() => createMut.mutate()}
      saveText="إنشاء مسودة"
      loading={createMut.isPending}
    >
      <div className="space-y-3 text-sm">
        {!grnId ? (
          <>
            <div className="text-xs font-semibold text-muted-foreground">
              اختر سند استلام مُرحَّل
            </div>
            <input
              className="inp w-full"
              placeholder="بحث برقم الاستلام…"
              value={grnSearch}
              onChange={(e) => setGrnSearch(e.target.value)}
            />
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {(grnsQ.data?.items || []).map((g) => (
                <button
                  key={g.goodsReceiptId}
                  className="w-full text-right rounded-lg border px-3 py-2 hover:bg-muted"
                  onClick={() => setGrnId(g.goodsReceiptId)}
                >
                  <span className="font-mono text-xs font-semibold">{g.grnNumber}</span>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    — {g.receiptDate}
                    {g.poNumber ? ` — ${g.poNumber}` : ""} — {g.returnableLineCount} سطر قابل
                    للإرجاع
                  </span>
                </button>
              ))}
              {(grnsQ.data?.items?.length ?? 0) === 0 && (
                <div className="text-xs text-muted-foreground py-2">
                  لا توجد سندات استلام مؤهّلة للإرجاع
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs font-semibold">
                {returnableQ.data?.grn.grnNumber}
              </div>
              <button className="text-xs text-primary" onClick={() => setGrnId(null)}>
                تغيير السند
              </button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              أدخل الكمية المُرجَعة (لا تتجاوز المتبقّي غير المفوتر). الإرجاع يخفّض المخزون ويقفل
              GRNI — لا يمس الذمم الدائنة.
            </div>
            {lines.length === 0 ? (
              <div className="text-xs text-muted-foreground py-2">
                لا توجد كميات قابلة للإرجاع على هذا السند
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((l) => (
                  <div key={l.goodsReceiptLineId} className="rounded-lg border px-2.5 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">{l.description || l.goodsReceiptLineId}</span>
                      <span className="ms-auto text-muted-foreground">
                        قابل للإرجاع <b className="tabular-nums">{l.returnableQuantity}</b>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <input
                        className="inp !h-8 text-sm"
                        inputMode="decimal"
                        placeholder="الكمية"
                        value={qty[l.goodsReceiptLineId] ?? ""}
                        onChange={(e) =>
                          setQty((p) => ({ ...p, [l.goodsReceiptLineId]: e.target.value }))
                        }
                      />
                      <button
                        className="text-[11px] text-primary whitespace-nowrap"
                        onClick={() =>
                          setQty((p) => ({
                            ...p,
                            [l.goodsReceiptLineId]: String(l.returnableQuantity),
                          }))
                        }
                      >
                        الأقصى
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">
                السبب (اختياري)
              </div>
              <input
                className="inp w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </>
        )}
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
  const q = useQuery({ queryKey: ["purchase-return", id], queryFn: () => getPurchaseReturn(id) });
  const d = q.data;
  const can = (p: string) => userCan(user, p);

  const actMut = useMutation({
    mutationFn: (p: { action: any; reason?: string }) =>
      purchaseReturnAction(id, p.action, p.reason),
    onSuccess: () => {
      showToast("تم تنفيذ الإجراء", "success");
      q.refetch();
      onChanged();
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const act = (action: string, needsReason = false) => {
    const reason = needsReason ? window.prompt("السبب") || "" : undefined;
    if (needsReason && !reason) return;
    actMut.mutate({ action, reason });
  };

  const st = d?.item?.status;
  return (
    <EntityFormDrawer
      open
      onClose={onClose}
      title="مرتجع مشتريات"
      onSave={onClose}
      saveText="إغلاق"
    >
      {d && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-mono font-bold">{d.item.returnNumber}</div>
            <Badge tone={STATUS[st]?.tone || "muted"}>{STATUS[st]?.label || st}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <KV label="سند الاستلام" value={d.grn?.grnNumber || d.item.goodsReceiptId} />
            <KV label="التاريخ" value={d.item.returnDate} />
            <KV label="القيمة" value={fmtSAR(d.item.totalValue)} />
            <KV label="السبب" value={d.item.reason || "—"} />
          </div>

          <Card className="p-3">
            <div className="text-xs font-bold mb-2">سطور المرتجع</div>
            <table className="w-full text-[12px]">
              <thead className="text-muted-foreground text-right">
                <tr>
                  <th className="py-1 pe-2">الوصف</th>
                  <th className="py-1 pe-2">الكمية</th>
                  <th className="py-1 pe-2">قيمة GRNI</th>
                </tr>
              </thead>
              <tbody>
                {(d.lines || []).map((l: any) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1 pe-2">{l.description || l.goodsReceiptLineId}</td>
                    <td className="py-1 pe-2 tabular-nums">{l.quantityReturned}</td>
                    <td className="py-1 pe-2 tabular-nums">{fmtSAR(l.lineValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="text-[11px] text-muted-foreground">
            الترحيل: مدين بضاعة مستلمة لم تُفوتر (GRNI) / دائن حساب الاستلام الأصلي، ويخفّض المخزون
            — لا يمس الذمم الدائنة أو الضريبة.
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {st === "draft" && can("procurement.purchase_return.submit") && (
              <Btn variant="primary" onClick={() => act("submit")}>
                إرسال للاعتماد
              </Btn>
            )}
            {st === "submitted" && can("procurement.purchase_return.approve") && (
              <Btn variant="primary" onClick={() => act("approve")}>
                اعتماد
              </Btn>
            )}
            {st === "submitted" && can("procurement.purchase_return.reject") && (
              <>
                <Btn variant="outline" onClick={() => act("return", true)}>
                  إعادة
                </Btn>
                <Btn variant="outline" onClick={() => act("reject", true)}>
                  <X size={14} /> رفض
                </Btn>
              </>
            )}
            {st === "approved" && can("procurement.purchase_return.post") && (
              <Btn variant="primary" onClick={() => act("post")}>
                ترحيل
              </Btn>
            )}
            {st === "posted" && can("procurement.purchase_return.reverse") && (
              <Btn variant="outline" onClick={() => act("reverse", true)}>
                عكس
              </Btn>
            )}
          </div>
        </div>
      )}
    </EntityFormDrawer>
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
