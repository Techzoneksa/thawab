import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AppShell, Card, Btn, Badge, statusTone } from "@/components/erp/AppShell";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { showToast } from "@/components/erp/actions";
import { fmtSAR } from "@/data/sample";
import {
  ArrowRight,
  Share2,
  Pencil,
  TrendingDown,
  ArrowRightLeft,
  Wrench,
  CheckCircle,
  ShoppingCart,
  Archive,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/api/auth";
import {
  getFixedAsset,
  transferFixedAsset,
  maintainFixedAsset,
  returnFromMaintenance,
  depreciateFixedAsset,
  disposeFixedAsset,
  sellFixedAsset,
} from "@/lib/api/assets";
import { getSuppliers } from "@/lib/api/suppliers";
import { AssetStatus as AssetStatusEnum } from "@/lib/enums";
import { label } from "@/lib/i18n/labels";
import type { DocumentDefinition } from "@/lib/documents/types";

export const Route = createFileRoute("/assets_/$id")({
  head: () => ({ meta: [{ title: "تفاصيل الأصل — ثواب" }] }),
  component: AssetDetailPage,
});

type ActionKind = "depreciate" | "transfer" | "maintain" | "returnMaintenance" | "dispose" | "sell";

function AssetDetailPage() {
  const { id } = useParams({ from: "/assets_/$id" });
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [openAction, setOpenAction] = useState<ActionKind | null>(null);
  const [depDraft, setDepDraft] = useState({
    amount: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [transferDraft, setTransferDraft] = useState({
    toLocation: "",
    toResponsible: "",
    reason: "",
    notes: "",
  });
  const [maintainDraft, setMaintainDraft] = useState({ cost: "", reason: "", notes: "" });
  const [sellDraft, setSellDraft] = useState({ salePrice: "", buyer: "", notes: "" });

  const detailQuery = useQuery({
    queryKey: ["fixedAssetDetail", id],
    queryFn: () => getFixedAsset(id),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: () => getSuppliers({}),
  });
  const suppliers = suppliersData?.items || [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["fixedAssets"] });
    queryClient.invalidateQueries({ queryKey: ["fixedAssetDetail", id] });
    queryClient.invalidateQueries({ queryKey: ["fixedAssetAudit", id] });
  };

  const transferMutation = useMutation({
    mutationFn: transferFixedAsset,
    onSuccess: () => {
      invalidate();
      showToast("تم نقل الأصل بنجاح", "success");
      setOpenAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const maintainMutation = useMutation({
    mutationFn: maintainFixedAsset,
    onSuccess: () => {
      invalidate();
      showToast("تم تسجيل الصيانة", "success");
      setOpenAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const returnMaintenanceMutation = useMutation({
    mutationFn: returnFromMaintenance,
    onSuccess: () => {
      invalidate();
      showToast("تم إنهاء الصيانة وإعادة الأصل للعمل", "success");
      setOpenAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const depreciateMutation = useMutation({
    mutationFn: depreciateFixedAsset,
    onSuccess: () => {
      invalidate();
      showToast("تم تسجيل الإهلاك بنجاح", "success");
      setOpenAction(null);
      setDepDraft({ amount: "", date: new Date().toISOString().split("T")[0], notes: "" });
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const disposeMutation = useMutation({
    mutationFn: disposeFixedAsset,
    onSuccess: () => {
      invalidate();
      showToast("تم استبعاد الأصل", "success");
      setOpenAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const sellMutation = useMutation({
    mutationFn: sellFixedAsset,
    onSuccess: () => {
      invalidate();
      showToast("تم تسجيل بيع الأصل", "success");
      setOpenAction(null);
    },
    onError: (err: Error) => showToast(err.message, "error"),
  });

  const d = detailQuery.data;
  const item = d?.item;
  const readOnly = !!item && item.status === AssetStatusEnum.DISPOSED;

  const back = () => nav({ to: "/assets" });
  const toggle = (a: ActionKind) => setOpenAction((cur) => (cur === a ? null : a));

  const buildDoc = (): DocumentDefinition => {
    const v = item!;
    const bookValue = d?.bookValue ?? 0;
    return {
      title: "الأصل الثابت",
      number: v.code || v.id,
      date: v.purchaseDate || new Date().toISOString().slice(0, 10),
      orientation: "portrait",
      entity: { name: v.name },
      meta: [
        { label: "الفئة", value: v.category || "—" },
        { label: "الحالة", value: label("assetStatus", v.status) },
        { label: "الحالة الفنية", value: v.condition ? label("assetCondition", v.condition) : "—" },
        { label: "الموقع", value: v.location || "—" },
        { label: "المسؤول", value: v.responsiblePerson || "—" },
        { label: "طريقة الإهلاك", value: label("depreciationMethod", v.depreciationMethod) },
        { label: "العمر الإنتاجي", value: `${v.usefulLifeMonths} شهر` },
        {
          label: "المورد",
          value: suppliers.find((s) => s.id === v.supplierId)?.name || "—",
        },
      ],
      columns: [
        { key: "band", label: "البند", width: "60%" },
        { key: "value", label: "القيمة", type: "money" },
      ],
      rows: [
        { band: "التكلفة", value: v.cost },
        { band: "الإهلاك المتراكم", value: v.accumulatedDepreciation },
        { band: "القيمة الدفترية", value: bookValue },
        { band: "القيمة المتبقية (الإنقاذ)", value: v.salvageValue },
      ],
      notes: v.notes || undefined,
      signature: true,
      fileBase: `fixed-asset-${v.code || v.id}`,
    };
  };

  const share = async () => {
    const url = window.location.href;
    const title = `الأصل ${item?.name || ""}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("تم نسخ رابط الأصل", "success");
    } catch {
      showToast("تعذّر النسخ — انسخ الرابط من شريط العنوان", "error");
    }
  };

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الأصول", item?.name || "أصل"]}
      title={`تفاصيل الأصل: ${item?.name || ""}`}
      actions={
        <>
          {item && <DocumentActions document={buildDoc} />}
          {item && !readOnly && (
            <Btn
              variant="outline"
              onClick={() => nav({ to: "/assets/$id/edit", params: { id } as any })}
            >
              <Pencil size={15} /> تعديل
            </Btn>
          )}
          <Btn variant="ghost" onClick={share}>
            <Share2 size={15} /> مشاركة
          </Btn>
          <Btn variant="ghost" onClick={back}>
            <ArrowRight size={15} /> رجوع
          </Btn>
        </>
      }
    >
      {detailQuery.isLoading ? (
        <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>
      ) : !item || !d ? (
        <div className="p-8 text-center text-destructive">تعذّر جلب بيانات الأصل</div>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4 text-sm">
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-base">{item.name}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {item.code || item.id}
                </div>
              </div>
              <Badge tone={statusTone(item.status)}>{label("assetStatus", item.status)}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <DetailRow label="الرمز" value={item.code || "—"} />
              <DetailRow label="الفئة" value={item.category || "—"} />
              <DetailRow label="الحالة" value={label("assetStatus", item.status)} />
              <DetailRow
                label="الحالة الفنية"
                value={item.condition ? label("assetCondition", item.condition) : "—"}
              />
              <DetailRow label="الموقع" value={item.location || "—"} />
              <DetailRow label="المسؤول" value={item.responsiblePerson || "—"} />
              <DetailRow label="التكلفة" value={fmtSAR(item.cost)} />
              <DetailRow label="الإهلاك المتراكم" value={fmtSAR(item.accumulatedDepreciation)} />
              <DetailRow label="القيمة الدفترية" value={fmtSAR(d.bookValue)} />
              <DetailRow label="العمر الإنتاجي" value={`${item.usefulLifeMonths} شهر`} />
              <DetailRow label="القيمة المتبقية" value={fmtSAR(item.salvageValue)} />
              <DetailRow
                label="طريقة الإهلاك"
                value={label("depreciationMethod", item.depreciationMethod)}
              />
              <DetailRow label="تاريخ الشراء" value={item.purchaseDate || "—"} />
              <DetailRow
                label="المورد"
                value={suppliers.find((s) => s.id === item.supplierId)?.name || "—"}
              />
            </div>
            {item.notes ? (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</div>
                <div className="text-sm">{item.notes}</div>
              </div>
            ) : null}
          </Card>

          <Card className="p-3 bg-primary/10">
            <div className="text-xs font-semibold text-muted-foreground mb-1">سجل الأصل</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-center">
                <div className="text-muted-foreground">قيود الإهلاك</div>
                <div className="font-bold text-base">{fmtSAR(d.depreciationCount)}</div>
              </div>
              <div className="text-center">
                <div className="text-muted-foreground">حركات/تحويلات</div>
                <div className="font-bold text-base">{fmtSAR(d.movementCount)}</div>
              </div>
            </div>
          </Card>

          {readOnly ? (
            <Card className="p-4 text-center text-sm text-muted-foreground">
              الأصل في حالة "{label("assetStatus", item.status)}" — لا يمكن تنفيذ عمليات إضافية.
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-bold text-muted-foreground">عمليات الأصل</div>

              {/* تسجيل إهلاك */}
              <ActionCard
                icon={<TrendingDown size={15} className="text-warning" />}
                title="تسجيل إهلاك"
                hint="إنقاص القيمة الدفترية بمبلغ الإهلاك"
                open={openAction === "depreciate"}
                onToggle={() => toggle("depreciate")}
              >
                <Card className="p-3 bg-warning/10">
                  <div className="text-xs font-bold text-warning mb-1">معلومات الإهلاك</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      التكلفة: <b>{fmtSAR(item.cost)}</b>
                    </div>
                    <div>
                      الإهلاك المتراكم: <b>{fmtSAR(item.accumulatedDepreciation)}</b>
                    </div>
                    <div>
                      القيمة الدفترية:{" "}
                      <b className="text-success">
                        {fmtSAR(item.cost - item.accumulatedDepreciation)}
                      </b>
                    </div>
                    <div>
                      القيمة المتبقية: <b>{fmtSAR(item.salvageValue)}</b>
                    </div>
                    <div className="col-span-2">
                      الحد الأقصى للإهلاك المتبقي:{" "}
                      <b>
                        {fmtSAR(
                          item.cost - item.accumulatedDepreciation - (item.salvageValue || 0),
                        )}
                      </b>
                    </div>
                  </div>
                </Card>
                <Field label="مبلغ الإهلاك *">
                  <input
                    type="number"
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={depDraft.amount}
                    onChange={(e) => setDepDraft({ ...depDraft, amount: e.target.value })}
                    placeholder="0"
                  />
                </Field>
                <Field label="تاريخ الإهلاك">
                  <input
                    type="date"
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={depDraft.date}
                    onChange={(e) => setDepDraft({ ...depDraft, date: e.target.value })}
                  />
                </Field>
                <Field label="ملاحظات">
                  <textarea
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    rows={2}
                    value={depDraft.notes}
                    onChange={(e) => setDepDraft({ ...depDraft, notes: e.target.value })}
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => setOpenAction(null)}>
                    إلغاء
                  </Btn>
                  <Btn
                    variant="primary"
                    disabled={depreciateMutation.isPending}
                    onClick={() => {
                      const amt = parseFloat(depDraft.amount) || 0;
                      if (amt <= 0) return showToast("يرجى إدخال مبلغ إهلاك صحيح", "error");
                      depreciateMutation.mutate({
                        id: item.id,
                        amount: amt,
                        date: depDraft.date,
                        notes: depDraft.notes,
                        userId: user?.id,
                        userName: user?.name,
                      });
                    }}
                  >
                    تأكيد الإهلاك
                  </Btn>
                </div>
              </ActionCard>

              {/* نقل الأصل */}
              <ActionCard
                icon={<ArrowRightLeft size={15} className="text-info" />}
                title="نقل الأصل"
                hint="نقل إلى موقع أو مسؤول جديد"
                open={openAction === "transfer"}
                onToggle={() => toggle("transfer")}
              >
                <Card className="p-3 bg-info/10 text-xs">
                  <div className="font-bold text-info mb-1">الموقع الحالي</div>
                  <div>الموقع: {item.location || "—"}</div>
                  <div>المسؤول: {item.responsiblePerson || "—"}</div>
                </Card>
                <Field label="الموقع الجديد">
                  <input
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={transferDraft.toLocation}
                    onChange={(e) =>
                      setTransferDraft({ ...transferDraft, toLocation: e.target.value })
                    }
                    placeholder="الموقع الجديد"
                  />
                </Field>
                <Field label="المسؤول الجديد">
                  <input
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={transferDraft.toResponsible}
                    onChange={(e) =>
                      setTransferDraft({ ...transferDraft, toResponsible: e.target.value })
                    }
                    placeholder="اسم المسؤول الجديد"
                  />
                </Field>
                <Field label="سبب النقل">
                  <input
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={transferDraft.reason}
                    onChange={(e) => setTransferDraft({ ...transferDraft, reason: e.target.value })}
                    placeholder="سبب النقل"
                  />
                </Field>
                <Field label="ملاحظات">
                  <textarea
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    rows={2}
                    value={transferDraft.notes}
                    onChange={(e) => setTransferDraft({ ...transferDraft, notes: e.target.value })}
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => setOpenAction(null)}>
                    إلغاء
                  </Btn>
                  <Btn
                    variant="primary"
                    disabled={transferMutation.isPending}
                    onClick={() =>
                      transferMutation.mutate({
                        id: item.id,
                        toLocation: transferDraft.toLocation,
                        toResponsible: transferDraft.toResponsible,
                        reason: transferDraft.reason,
                        notes: transferDraft.notes,
                        userId: user?.id,
                        userName: user?.name,
                      })
                    }
                  >
                    تأكيد النقل
                  </Btn>
                </div>
              </ActionCard>

              {/* تسجيل صيانة / إنهاء الصيانة */}
              {item.status !== AssetStatusEnum.UNDER_MAINTENANCE ? (
                <ActionCard
                  icon={<Wrench size={15} className="text-warning" />}
                  title="تسجيل صيانة"
                  hint='تحوّل الأصل إلى حالة "تحت الصيانة"'
                  open={openAction === "maintain"}
                  onToggle={() => toggle("maintain")}
                >
                  <Field label="تكلفة الصيانة">
                    <input
                      type="number"
                      className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                      value={maintainDraft.cost}
                      onChange={(e) => setMaintainDraft({ ...maintainDraft, cost: e.target.value })}
                      placeholder="0"
                    />
                  </Field>
                  <Field label="سبب/وصف الصيانة">
                    <textarea
                      className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                      rows={2}
                      value={maintainDraft.reason}
                      onChange={(e) =>
                        setMaintainDraft({ ...maintainDraft, reason: e.target.value })
                      }
                      placeholder="مثال: صيانة دورية، إصلاح عطل..."
                    />
                  </Field>
                  <Field label="ملاحظات">
                    <textarea
                      className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                      rows={2}
                      value={maintainDraft.notes}
                      onChange={(e) =>
                        setMaintainDraft({ ...maintainDraft, notes: e.target.value })
                      }
                    />
                  </Field>
                  <div className="flex justify-end gap-2">
                    <Btn variant="ghost" onClick={() => setOpenAction(null)}>
                      إلغاء
                    </Btn>
                    <Btn
                      variant="primary"
                      disabled={maintainMutation.isPending}
                      onClick={() =>
                        maintainMutation.mutate({
                          id: item.id,
                          cost: parseFloat(maintainDraft.cost) || 0,
                          reason: maintainDraft.reason,
                          notes: maintainDraft.notes,
                          userId: user?.id,
                          userName: user?.name,
                        })
                      }
                    >
                      تسجيل الصيانة
                    </Btn>
                  </div>
                </ActionCard>
              ) : (
                <ActionCard
                  icon={<CheckCircle size={15} className="text-success" />}
                  title="إنهاء الصيانة"
                  hint="إرجاع الأصل إلى حالة نشط"
                  open={openAction === "returnMaintenance"}
                  onToggle={() => toggle("returnMaintenance")}
                >
                  <div className="text-sm">
                    هل تريد إعادة الأصل "{item.name}" للعمل بعد الصيانة؟
                  </div>
                  <div className="flex justify-end gap-2">
                    <Btn variant="ghost" onClick={() => setOpenAction(null)}>
                      إلغاء
                    </Btn>
                    <Btn
                      variant="primary"
                      disabled={returnMaintenanceMutation.isPending}
                      onClick={() =>
                        returnMaintenanceMutation.mutate({
                          id: item.id,
                          condition: item.condition,
                          userId: user?.id,
                          userName: user?.name,
                        })
                      }
                    >
                      إعادة للعمل
                    </Btn>
                  </div>
                </ActionCard>
              )}

              {/* بيع الأصل */}
              <ActionCard
                icon={<ShoppingCart size={15} className="text-info" />}
                title="بيع الأصل"
                hint="تسجيل عملية بيع مع سعر البيع والمشتري"
                open={openAction === "sell"}
                onToggle={() => toggle("sell")}
              >
                <Card className="p-3 bg-warning/10 text-xs">
                  <div>
                    القيمة الدفترية الحالية:{" "}
                    <b>{fmtSAR(item.cost - item.accumulatedDepreciation)}</b>
                  </div>
                </Card>
                <Field label="سعر البيع">
                  <input
                    type="number"
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={sellDraft.salePrice}
                    onChange={(e) => setSellDraft({ ...sellDraft, salePrice: e.target.value })}
                    placeholder="0"
                  />
                </Field>
                <Field label="المشتري">
                  <input
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    value={sellDraft.buyer}
                    onChange={(e) => setSellDraft({ ...sellDraft, buyer: e.target.value })}
                    placeholder="اسم المشتري"
                  />
                </Field>
                <Field label="ملاحظات">
                  <textarea
                    className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
                    rows={2}
                    value={sellDraft.notes}
                    onChange={(e) => setSellDraft({ ...sellDraft, notes: e.target.value })}
                  />
                </Field>
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => setOpenAction(null)}>
                    إلغاء
                  </Btn>
                  <Btn
                    variant="primary"
                    disabled={sellMutation.isPending}
                    onClick={() =>
                      sellMutation.mutate({
                        id: item.id,
                        salePrice: parseFloat(sellDraft.salePrice) || 0,
                        buyer: sellDraft.buyer,
                        notes: sellDraft.notes,
                        userId: user?.id,
                        userName: user?.name,
                      })
                    }
                  >
                    تأكيد البيع
                  </Btn>
                </div>
              </ActionCard>

              {/* استبعاد الأصل */}
              <ActionCard
                icon={<Archive size={15} className="text-destructive" />}
                title="استبعاد الأصل"
                hint="إزالة الأصل بدون بيع (هالك / تالف نهائي)"
                open={openAction === "dispose"}
                onToggle={() => toggle("dispose")}
                destructive
              >
                <div className="text-sm">
                  هل تريد استبعاد الأصل "{item.name}"؟ سيصبح read-only ويحتفظ به النظام للسجل
                  التاريخي.
                </div>
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => setOpenAction(null)}>
                    تراجع
                  </Btn>
                  <button
                    className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[36px] bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                    disabled={disposeMutation.isPending}
                    onClick={() =>
                      disposeMutation.mutate({
                        id: item.id,
                        userId: user?.id,
                        userName: user?.name,
                      })
                    }
                  >
                    استبعاد
                  </button>
                </div>
              </ActionCard>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b pb-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ActionCard({
  icon,
  title,
  hint,
  open,
  onToggle,
  destructive,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={destructive ? "border-destructive/40 bg-destructive/5" : undefined}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-right p-3 flex items-center justify-between gap-2 hover:bg-muted/40 transition-colors rounded-xl"
      >
        <div>
          <div
            className={`flex items-center gap-2 font-semibold text-sm ${destructive ? "text-destructive" : ""}`}
          >
            {icon} {title}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{hint}</div>
        </div>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t p-3 space-y-3">{children}</div>}
    </Card>
  );
}
