import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Card, Btn, Badge, MobilePageHeader } from "@/components/erp/AppShell";
import { BOARD_MEMBERS } from "@/data/sample";
import { UsersRound, Plus, Edit, Trash2, Eye, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  showToast,
  ConfirmDialog,
  EntityFormDrawer,
  ActionMenu,
  ExportButton,
} from "@/components/erp/actions";

type MemberItem = {
  name: string;
  role: string;
  since: string;
  attendance: number;
  phone: string;
  active: boolean;
};

export const Route = createFileRoute("/memberships")({
  head: () => ({ meta: [{ title: "العضويات — ثواب" }] }),
  component: () => {
    const [data, setData] = useState<MemberItem[]>(
      BOARD_MEMBERS.map((m) => ({ ...m, phone: "05xxxxxxxx", active: true })),
    );
    const [formOpen, setFormOpen] = useState(false);
    const [subFormOpen, setSubFormOpen] = useState(false);
    const [confirmIdx, setConfirmIdx] = useState(-1);
    const [formName, setFormName] = useState("");
    const [formRole, setFormRole] = useState("");
    const [formPhone, setFormPhone] = useState("");
    const [subName, setSubName] = useState("");
    const [subType, setSubType] = useState("سنوي");

    const handleAddMember = () => {
      if (!formName.trim()) {
        showToast("يرجى إدخال اسم العضو", "error");
        return;
      }
      setData([
        {
          name: formName,
          role: formRole || "عضو",
          since: "1446",
          attendance: 0,
          phone: formPhone,
          active: true,
        },
        ...data,
      ]);
      showToast("تم إضافة العضو بنجاح", "success");
      setFormOpen(false);
      setFormName("");
      setFormRole("");
      setFormPhone("");
    };

    const handleAddSub = () => {
      if (!subName.trim()) {
        showToast("يرجى إدخال الاسم", "error");
        return;
      }
      showToast(`تم إضافة اشتراك ${subType} للعضو ${subName}`, "success");
      setSubFormOpen(false);
      setSubName("");
      setSubType("سنوي");
    };

    const handleDelete = () => {
      setData(data.filter((_, i) => i !== confirmIdx));
      showToast("تم حذف العضو", "success");
      setConfirmIdx(-1);
    };

    return (
      <AppShell
        breadcrumb={["الرئيسية", "الموارد", "العضويات"]}
        title="العضويات ومجلس الإدارة"
        actions={
          <>
            <ExportButton data={data} filename="memberships.csv" />
            <Btn
              variant="outline"
              onClick={() => {
                setSubName("");
                setSubType("سنوي");
                setSubFormOpen(true);
              }}
            >
              <UserPlus size={15} /> إضافة اشتراك
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                setFormName("");
                setFormRole("");
                setFormPhone("");
                setFormOpen(true);
              }}
            >
              <Plus size={15} /> إضافة عضو
            </Btn>
          </>
        }
      >
        <MobilePageHeader title="العضويات ومجلس الإدارة" count={`${data.length} عضو مجلس`} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {[
            { l: "أعضاء الجمعية العمومية", v: "84" },
            { l: "مجلس الإدارة", v: String(data.length) },
            { l: "اشتراكات نشطة", v: "78" },
            { l: "حضور آخر اجتماع", v: "92%" },
          ].map((s) => (
            <Card key={s.l} className="p-4">
              <div className="text-xs text-muted-foreground">{s.l}</div>
              <div className="text-lg font-extrabold mt-1 tabular-nums">{s.v}</div>
            </Card>
          ))}
        </div>
        <Card className="p-5">
          <h3 className="font-bold mb-3">مجلس الإدارة الحالي</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.map((m, idx) => (
              <div key={m.name} className="flex items-center gap-3 rounded-xl border p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <UsersRound size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.role} · منذ {m.since}هـ
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge tone="success">{m.attendance}%</Badge>
                  <ActionMenu
                    actions={[
                      {
                        label: "عرض",
                        icon: Eye,
                        onClick: () => showToast(`${m.name} - ${m.role}`, "info"),
                      },
                      {
                        label: "تعديل",
                        icon: Edit,
                        onClick: () => {
                          setFormName(m.name);
                          setFormRole(m.role);
                          setFormPhone(m.phone);
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
              </div>
            ))}
          </div>
        </Card>

        <EntityFormDrawer
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="إضافة عضو"
          onSave={handleAddMember}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">الاسم</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="الاسم الكامل"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">المنصب</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              placeholder="المسمى الوظيفي"
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
        </EntityFormDrawer>

        <EntityFormDrawer
          open={subFormOpen}
          onClose={() => setSubFormOpen(false)}
          title="إضافة اشتراك"
          onSave={handleAddSub}
        >
          <div>
            <label className="text-xs font-semibold text-muted-foreground">اسم العضو</label>
            <input
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="الاسم"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">نوع الاشتراك</label>
            <select
              className="w-full rounded-lg border bg-background p-3 text-sm mt-1"
              value={subType}
              onChange={(e) => setSubType(e.target.value)}
            >
              <option>سنوي</option>
              <option>شهري</option>
              <option>دائم</option>
            </select>
          </div>
        </EntityFormDrawer>

        {confirmIdx >= 0 && (
          <ConfirmDialog
            open
            onClose={() => setConfirmIdx(-1)}
            onConfirm={handleDelete}
            title="تأكيد الحذف"
            message="هل أنت متأكد من حذف العضو؟"
            confirmText="حذف"
            variant="destructive"
          />
        )}
      </AppShell>
    );
  },
});
