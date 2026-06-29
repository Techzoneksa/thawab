import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Btn,
  Badge,
  Table,
  Td,
  MobileTable,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { INVENTORY_ITEMS } from "@/data/sample";
import { Plus, AlertTriangle, Edit, Trash2, ShoppingCart, ArrowRight, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type Item = {
  sku: string;
  name: string;
  warehouse: string;
  qty: number;
  unit: string;
  min: number;
  expiry: string;
  category: string;
  price: number;
};

export const Route = createFileRoute("/inventory/items")({
  head: () => ({ meta: [{ title: "الأصناف — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<Item[]>(
      INVENTORY_ITEMS.map((i) => ({ ...i, category: "مواد", price: 0 })),
    );
    const [formOpen, setFormOpen] = useState(false);
    const [editIdx, setEditIdx] = useState(-1);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formName, setFormName] = useState("");
    const [formSku, setFormSku] = useState("");
    const [formUnit, setFormUnit] = useState("قطعة");
    const [formCategory, setFormCategory] = useState("");
    const [formWarehouse, setFormWarehouse] = useState("المستودع الرئيسي");
    const [formQty, setFormQty] = useState("");
    const [formMin, setFormMin] = useState("");
    const [formPrice, setFormPrice] = useState("");

    const nextSku = () => `ITM-${String(data.length + 1).padStart(4, "0")}`;

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم الصنف", "error");
        return;
      }
      const newItem: Item = {
        sku: formSku || nextSku(),
        name: formName,
        unit: formUnit,
        category: formCategory || "مواد",
        warehouse: formWarehouse,
        qty: Number(formQty) || 0,
        min: Number(formMin) || 0,
        expiry: "—",
        price: Number(formPrice) || 0,
      };
      if (editIdx >= 0) {
        const d = [...data];
        d[editIdx] = {
          ...d[editIdx],
          name: formName,
          sku: formSku,
          unit: formUnit,
          category: formCategory,
          warehouse: formWarehouse,
          qty: Number(formQty) || 0,
          min: Number(formMin) || 0,
          price: Number(formPrice) || 0,
        };
        setData(d);
        showToast("تم تعديل الصنف بنجاح", "success");
      } else {
        setData([newItem, ...data]);
        showToast("تم إضافة الصنف بنجاح", "success");
      }
      setFormOpen(false);
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف الصنف", "success");
      setConfirmIdx(-1);
    };

    const stockTone = (qty: number, min: number) => {
      if (qty === 0) return "destructive" as const;
      if (qty < min) return "warning" as const;
      return "success" as const;
    };

    const stockLabel = (qty: number, min: number) => {
      if (qty === 0) return "نفذ";
      if (qty < min) return "منخفض";
      return "متوفر";
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المخزون", "الأصناف"]}
          title="الأصناف والمخزون"
          actions={
            <>
              <ExportButton data={data} filename="inventory-items.csv" />
              <Btn
                variant="primary"
                onClick={() => {
                  setEditIdx(-1);
                  setFormName("");
                  setFormSku("");
                  setFormUnit("قطعة");
                  setFormCategory("");
                  setFormWarehouse("المستودع الرئيسي");
                  setFormQty("");
                  setFormMin("");
                  setFormPrice("");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} />
                إضافة صنف
              </Btn>
            </>
          }
        >
          <MobilePageHeader title="الأصناف" count={`${data.length} صنف`} />

          <MobileTable
            columns={[
              "الكود",
              "الصنف",
              "المستودع",
              "الكمية",
              "الوحدة",
              "الحد الأدنى",
              "الحالة",
              "",
            ]}
            rows={data}
            renderRow={(it, idx) => (
              <>
                <Td className="font-mono text-xs">{it.sku}</Td>
                <Td className="font-semibold">{it.name}</Td>
                <Td className="text-muted-foreground">{it.warehouse}</Td>
                <Td
                  className={`tabular-nums font-bold ${it.qty < it.min ? "text-destructive" : ""}`}
                >
                  {it.qty}
                </Td>
                <Td>{it.unit}</Td>
                <Td className="tabular-nums text-muted-foreground">{it.min}</Td>
                <Td>
                  <Badge tone={stockTone(it.qty, it.min)}>{stockLabel(it.qty, it.min)}</Badge>
                </Td>
                <Td>
                  <ActionMenu
                    actions={[
                      {
                        label: "تعديل",
                        icon: Edit,
                        onClick: () => {
                          setEditIdx(idx);
                          setFormName(it.name);
                          setFormSku(it.sku);
                          setFormUnit(it.unit);
                          setFormCategory(it.category);
                          setFormWarehouse(it.warehouse);
                          setFormQty(String(it.qty));
                          setFormMin(String(it.min));
                          setFormPrice(String(it.price));
                          setFormOpen(true);
                        },
                      },
                      {
                        label: "صرف",
                        icon: ShoppingCart,
                        onClick: () => showToast("تم صرف الصنف", "success"),
                      },
                      {
                        label: "تحويل",
                        icon: ArrowRight,
                        onClick: () => showToast("تم تحويل الصنف", "info"),
                      },
                      {
                        label: "عرض الحركة",
                        icon: Eye,
                        onClick: () => showToast("عرض حركة الصنف", "info"),
                      },
                      {
                        label: "حذف",
                        icon: Trash2,
                        variant: "destructive" as const,
                        onClick: () => setConfirmIdx(idx),
                      },
                    ]}
                  />
                </Td>
              </>
            )}
            mobileCard={(it, idx) => {
              const low = it.qty < it.min;
              return (
                <div key={it.sku} className="rounded-xl border bg-card shadow-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{it.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.warehouse} · {it.unit}
                      </div>
                    </div>
                    <Badge tone={stockTone(it.qty, it.min)}>{stockLabel(it.qty, it.min)}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-muted/50 p-2 text-center">
                      <div className="text-muted-foreground">الكمية</div>
                      <div
                        className={`font-bold text-base tabular-nums ${low ? "text-destructive" : ""}`}
                      >
                        {it.qty}
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-2 text-center">
                      <div className="text-muted-foreground">الحد الأدنى</div>
                      <div className="font-bold text-base tabular-nums">{it.min}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{it.sku}</span>
                    <span className="text-muted-foreground">انتهاء: {it.expiry}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t flex gap-2">
                    <button
                      className="flex-1 rounded-lg border py-2 text-xs font-semibold min-h-[36px]"
                      onClick={() => showToast("تم صرف الصنف", "success")}
                    >
                      صرف
                    </button>
                    <button
                      className="flex-1 rounded-lg border py-2 text-xs font-semibold min-h-[36px]"
                      onClick={() => showToast("تم تحويل الصنف", "info")}
                    >
                      تحويل
                    </button>
                  </div>
                </div>
              );
            }}
          />
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editIdx >= 0 ? "تعديل صنف" : "إضافة صنف"}
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="اسم الصنف"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الكود</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formSku}
              onChange={(e) => setFormSku(e.target.value)}
              placeholder="رمز الصنف (اختياري)"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الوحدة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formUnit}
              onChange={(e) => setFormUnit(e.target.value)}
            >
              <option>قطعة</option>
              <option>كيس</option>
              <option>عبوة</option>
              <option>كرتون</option>
              <option>حزمة</option>
              <option>علبة</option>
              <option>لتر</option>
              <option>كيلو</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الفئة</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="مثال: مواد غذائية"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المستودع</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formWarehouse}
              onChange={(e) => setFormWarehouse(e.target.value)}
            >
              <option>المستودع الرئيسي</option>
              <option>مستودع كسوة الشتاء</option>
              <option>مستودع الأدوية</option>
              <option>مستودع الفرع - جدة</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الكمية</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formQty}
              onChange={(e) => setFormQty(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحد الأدنى</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formMin}
              onChange={(e) => setFormMin(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">السعر</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="number"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
            />
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الصنف؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
