import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Card,
  Btn,
  Badge,
  Table,
  Td,
  MobileTable,
  MobilePageHeader,
} from "@/components/erp/AppShell";
import { SUPPLIERS, fmtSAR } from "@/data/sample";
import { Plus, Star, Edit, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type SupplierItem = {
  id: string;
  name: string;
  category: string;
  phone: string;
  balance: number;
  rating: number;
  active: boolean;
  email: string;
  taxNo: string;
};

export const Route = createFileRoute("/procurement/suppliers")({
  head: () => ({ meta: [{ title: "الموردون — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<SupplierItem[]>(
      SUPPLIERS.map((s) => ({ ...s, active: true, email: "", taxNo: "" })),
    );
    const [formOpen, setFormOpen] = useState(false);
    const [editIdx, setEditIdx] = useState(-1);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formName, setFormName] = useState("");
    const [formCategory, setFormCategory] = useState("");
    const [formPhone, setFormPhone] = useState("");
    const [formEmail, setFormEmail] = useState("");
    const [formTaxNo, setFormTaxNo] = useState("");
    const [formActive, setFormActive] = useState(true);

    const nextId = () => `SUP-${String(data.length + 1).padStart(3, "0")}`;

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم المورد", "error");
        return;
      }
      const newSupplier = {
        id: nextId(),
        name: formName,
        category: formCategory || "خدمات",
        phone: formPhone,
        balance: 0,
        rating: 0,
        active: formActive,
        email: formEmail,
        taxNo: formTaxNo,
      };
      if (editIdx >= 0) {
        const d = [...data];
        d[editIdx] = {
          ...d[editIdx],
          name: formName,
          category: formCategory,
          phone: formPhone,
          email: formEmail,
          taxNo: formTaxNo,
          active: formActive,
        };
        setData(d);
        showToast("تم تعديل المورد بنجاح", "success");
      } else {
        setData([newSupplier, ...data]);
        showToast("تم إضافة المورد بنجاح", "success");
      }
      setFormOpen(false);
    };

    const handleToggle = (idx: number) => {
      const d = [...data];
      d[idx] = { ...d[idx], active: !d[idx].active };
      setData(d);
      showToast(`تم ${d[idx].active ? "تفعيل" : "تعطيل"} المورد`, "success");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف المورد", "success");
      setConfirmIdx(-1);
    };

    const openEdit = (idx: number) => {
      const s = data[idx];
      setEditIdx(idx);
      setFormName(s.name);
      setFormCategory(s.category);
      setFormPhone(s.phone);
      setFormEmail(s.email);
      setFormTaxNo(s.taxNo);
      setFormActive(s.active);
      setFormOpen(true);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المشتريات", "الموردون"]}
          title="سجل الموردين"
          actions={
            <>
              <ExportButton
                data={data.map(
                  ({ id, name, category, phone, email, taxNo, active, balance, rating }) => ({
                    id,
                    name,
                    category,
                    phone,
                    email,
                    taxNo,
                    active: active ? "نشط" : "غير نشط",
                    balance,
                    rating,
                  }),
                )}
                filename="suppliers.csv"
              />
              <Btn
                variant="primary"
                onClick={() => {
                  setEditIdx(-1);
                  setFormName("");
                  setFormCategory("");
                  setFormPhone("");
                  setFormEmail("");
                  setFormTaxNo("");
                  setFormActive(true);
                  setFormOpen(true);
                }}
              >
                <Plus size={15} />
                إضافة مورد
              </Btn>
            </>
          }
        >
          <>
            <MobilePageHeader title="سجل الموردين" count={`${data.length} مورد`} />
            <MobileTable
              columns={[
                "الرقم",
                "اسم المورد",
                "الفئة",
                "الجوال",
                "الرصيد",
                "التقييم",
                "الحالة",
                "",
              ]}
              rows={data}
              renderRow={(s, idx) => (
                <>
                  <Td className="font-mono text-xs">{s.id}</Td>
                  <Td className="font-semibold">{s.name}</Td>
                  <Td>
                    <Badge tone="info">{s.category}</Badge>
                  </Td>
                  <Td className="font-mono text-xs text-muted-foreground">{s.phone}</Td>
                  <Td className="tabular-nums">{fmtSAR(s.balance)}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-1 text-warning-foreground">
                      <Star size={14} className="fill-warning text-warning" />
                      {s.rating}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={s.active ? "success" : "muted"}>
                      {s.active ? "نشط" : "غير نشط"}
                    </Badge>
                  </Td>
                  <Td>
                    <ActionMenu
                      actions={[
                        { label: "تعديل", icon: Edit, onClick: () => openEdit(idx) },
                        {
                          label: s.active ? "تعطيل" : "تفعيل",
                          icon: s.active ? ToggleLeft : ToggleRight,
                          onClick: () => handleToggle(idx),
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
              mobileCard={(s, idx) => (
                <Card key={s.id} className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge tone={s.active ? "success" : "muted"}>
                      {s.active ? "نشط" : "غير نشط"}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{s.id}</span>
                  </div>
                  <div className="font-semibold">{s.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.phone}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="tabular-nums">{fmtSAR(s.balance)}</span>
                    <span className="inline-flex items-center gap-1 text-warning-foreground">
                      <Star size={14} className="fill-warning text-warning" />
                      {s.rating}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => openEdit(idx)}
                    >
                      تعديل
                    </button>
                    <button
                      className="flex-1 rounded-lg border text-xs font-semibold py-2 min-h-[36px]"
                      onClick={() => handleToggle(idx)}
                    >
                      {s.active ? "تعطيل" : "تفعيل"}
                    </button>
                  </div>
                </Card>
              )}
            />
          </>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title={editIdx >= 0 ? "تعديل مورد" : "إضافة مورد"}
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="اسم المورد"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">النشاط</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="مثال: مواد غذائية"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الجوال</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="05xxxxxxxx"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">البريد الإلكتروني</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="supplier@example.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الرقم الضريبي</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formTaxNo}
              onChange={(e) => setFormTaxNo(e.target.value)}
              placeholder="1234567890"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الحالة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formActive ? "نشط" : "غير نشط"}
              onChange={(e) => setFormActive(e.target.value === "نشط")}
            >
              <option>نشط</option>
              <option>غير نشط</option>
            </select>
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف المورد؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
