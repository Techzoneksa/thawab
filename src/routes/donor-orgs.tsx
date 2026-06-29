import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, MobilePageHeader } from "@/components/erp/AppShell";
import { fmtSAR } from "@/data/sample";
import { Building2, Plus, Edit, Trash2, Eye } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type OrgItem = { n: string; cat: string; grants: number; total: number; status: string };

export const Route = createFileRoute("/donor-orgs")({
  head: () => ({ meta: [{ title: "الجهات المانحة — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<OrgItem[]>([
      { n: "الصندوق الخيري الوطني", cat: "حكومي", grants: 4, total: 4800000, status: "نشط" },
      { n: "صندوق الملك سلمان للإغاثة", cat: "حكومي", grants: 6, total: 8200000, status: "نشط" },
      { n: "بنك التنمية الإسلامي", cat: "دولي", grants: 2, total: 1400000, status: "نشط" },
      {
        n: "وزارة الموارد البشرية والتنمية الاجتماعية",
        cat: "حكومي",
        grants: 3,
        total: 1900000,
        status: "نشط",
      },
      { n: "هيئة الهلال الأحمر السعودي", cat: "شريك", grants: 1, total: 600000, status: "نشط" },
    ]);
    const [formOpen, setFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formName, setFormName] = useState("");
    const [formCat, setFormCat] = useState("حكومي");

    const handleSave = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم الجهة", "error");
        return;
      }
      setData([{ n: formName, cat: formCat, grants: 0, total: 0, status: "نشط" }, ...data]);
      showToast("تم إضافة الجهة المانحة بنجاح", "success");
      setFormOpen(false);
      setFormName("");
      setFormCat("حكومي");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف الجهة المانحة", "success");
      setConfirmIdx(-1);
    };

    return (
      <>
        <AppShell
          breadcrumb={["الرئيسية", "المنح والأوقاف", "الجهات المانحة"]}
          title="الجهات المانحة"
          actions={
            <>
              <ExportButton data={data} filename="donor-orgs.csv" />
              <Btn
                variant="primary"
                onClick={() => {
                  setFormName("");
                  setFormCat("حكومي");
                  setFormOpen(true);
                }}
              >
                <Plus size={15} /> إضافة جهة مانحة
              </Btn>
            </>
          }
        >
          <MobilePageHeader title="الجهات المانحة" count={`${data.length} جهة`} />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.map((r, idx) => (
              <Card key={r.n} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Building2 size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold truncate">{r.n}</h3>
                      <Badge tone="info">{r.cat}</Badge>
                    </div>
                  </div>
                  <ActionMenu
                    actions={[
                      { label: "عرض", icon: Eye, onClick: () => showToast(r.n, "info") },
                      {
                        label: "تعديل",
                        icon: Edit,
                        onClick: () => {
                          setFormName(r.n);
                          setFormCat(r.cat);
                          setFormOpen(true);
                        },
                      },
                      {
                        label: "حذف",
                        icon: Trash2,
                        variant: "destructive" as const,
                        onClick: () => setConfirmIdx(idx),
                      },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <div>
                    <div className="text-xs text-muted-foreground">عدد المنح</div>
                    <div className="font-bold">{r.grants}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">إجمالي القيمة</div>
                    <div className="font-bold tabular-nums">{fmtSAR(r.total)}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </AppShell>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة جهة مانحة"
          onSave={handleSave}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الفئة</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formCat}
              onChange={(e) => setFormCat(e.target.value)}
            >
              <option>حكومي</option>
              <option>دولي</option>
              <option>شريك</option>
              <option>خاص</option>
            </select>
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف الجهة المانحة؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </>
    );
  },
});
