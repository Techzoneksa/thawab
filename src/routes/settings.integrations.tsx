import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  statusTone,
  MobilePageHeader,
  MobileActionRow,
} from "@/components/erp/AppShell";
import { INTEGRATIONS as INTEGRATIONS_DATA } from "@/data/sample";
import { showToast, EntityFormDrawer, ActionMenu } from "@/components/erp/actions";
import { Plug, Pencil, Ban, CheckCircle2, Network, Eye, KeyRound, Webhook } from "lucide-react";

export const Route = createFileRoute("/settings/integrations")({
  head: () => ({ meta: [{ title: "التكاملات — ثواب" }] }),
  component: Page,
});

function Page() {
  const [integrations, setIntegrations] = useState(INTEGRATIONS_DATA);

  const [addOpen, setAddOpen] = useState(false);
  const [addWebhookOpen, setAddWebhookOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);

  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("مدفوعات");
  const [formApi, setFormApi] = useState("");
  const [formKey, setFormKey] = useState("");
  const [formStatus, setFormStatus] = useState("نشط");
  const [formInfo, setFormInfo] = useState("");
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvent, setWebhookEvent] = useState("تبرع جديد");

  const categories = ["مدفوعات", "بنوك", "حكومي", "اتصالات", "تطوير"];
  const events = ["تبرع جديد", "مستفيد جديد", "مشروع جديد", "قيد يومية", "فاتورة"];

  function resetForm() {
    setFormName("");
    setFormCategory("مدفوعات");
    setFormApi("");
    setFormKey("");
    setFormStatus("نشط");
    setFormInfo("");
  }

  function handleAdd() {
    if (!formName.trim()) {
      showToast("يرجى إدخال اسم التكامل", "error");
      return;
    }
    const newInt = {
      name: formName,
      category: formCategory,
      status: formStatus,
      info: formInfo || "تمت الإضافة حديثاً",
    };
    setIntegrations([...integrations, newInt]);
    showToast(`تم إضافة التكامل ${formName} بنجاح`, "success");
    setAddOpen(false);
    resetForm();
  }

  function handleEdit(i: number) {
    const it = integrations[i];
    setEditIdx(i);
    setFormName(it.name);
    setFormCategory(it.category);
    setFormStatus(it.status);
    setFormInfo(it.info);
    setFormApi("");
    setFormKey("");
    setEditOpen(true);
  }

  function handleSaveEdit() {
    if (editIdx === null) return;
    const updated = [...integrations];
    updated[editIdx] = {
      ...updated[editIdx],
      name: formName,
      category: formCategory,
      status: formStatus,
      info: formInfo,
    };
    setIntegrations(updated);
    showToast(`تم تعديل التكامل ${formName} بنجاح`, "success");
    setEditOpen(false);
    setEditIdx(null);
    resetForm();
  }

  function toggleStatus(i: number) {
    const updated = [...integrations];
    updated[i] = {
      ...updated[i],
      status: updated[i].status === "نشط" || updated[i].status === "متصل" ? "موقوف" : "نشط",
    };
    setIntegrations(updated);
    showToast(
      `تم ${updated[i].status === "نشط" ? "تفعيل" : "تعطيل"} ${updated[i].name}`,
      "success",
    );
  }

  function testConnection(i: number) {
    showToast(`اختبار الاتصال بـ ${integrations[i].name}: تم الاتصال بنجاح ✓`, "success");
  }

  function showKeys(i: number) {
    showToast(
      `المفاتيح الخاصة بـ ${integrations[i].name}: sk_test_••••${Math.random().toString(36).slice(2, 8)}`,
      "info",
    );
  }

  function handleAddWebhook() {
    if (!webhookName.trim() || !webhookUrl.trim()) {
      showToast("يرجى تعبئة الحقول المطلوبة", "error");
      return;
    }
    showToast(`تم إضافة Webhook "${webhookName}" بنجاح`, "success");
    setAddWebhookOpen(false);
    setWebhookName("");
    setWebhookUrl("");
    setWebhookEvent("تبرع جديد");
  }

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الإعدادات", "التكاملات"]}
      title="مركز التكاملات"
      actions={
        <div className="flex items-center gap-2">
          <Btn
            variant="outline"
            onClick={() => {
              setWebhookName("");
              setWebhookUrl("");
              setWebhookEvent("تبرع جديد");
              setAddWebhookOpen(true);
            }}
          >
            <Webhook size={15} />
            <span className="hidden md:inline">إضافة Webhook</span>
          </Btn>
          <Btn
            variant="primary"
            onClick={() => {
              resetForm();
              setAddOpen(true);
            }}
          >
            <Plug size={15} />
            تكامل جديد
          </Btn>
        </div>
      }
    >
      <MobilePageHeader title="مركز التكاملات" count={`${integrations.length} تكامل`} />
      <MobileActionRow>
        <Btn
          variant="outline"
          onClick={() => {
            setWebhookName("");
            setWebhookUrl("");
            setWebhookEvent("تبرع جديد");
            setAddWebhookOpen(true);
          }}
        >
          <Webhook size={15} /> إضافة Webhook
        </Btn>
        <Btn
          variant="primary"
          onClick={() => {
            resetForm();
            setAddOpen(true);
          }}
        >
          <Plug size={15} /> إضافة تكامل
        </Btn>
      </MobileActionRow>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3 lg:mt-0">
        {integrations.map((it, i) => (
          <Card key={it.name} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Plug size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold truncate">{it.name}</h3>
                  <div className="text-xs text-muted-foreground">{it.category}</div>
                </div>
              </div>
              <Badge tone={statusTone(it.status)}>{it.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-3">{it.info}</p>
            <div className="flex items-center justify-between mt-4">
              <ActionMenu
                actions={[
                  { label: "تعديل", icon: Pencil, onClick: () => handleEdit(i) },
                  {
                    label: it.status === "نشط" || it.status === "متصل" ? "تعطيل" : "تفعيل",
                    icon: it.status === "نشط" || it.status === "متصل" ? Ban : CheckCircle2,
                    onClick: () => toggleStatus(i),
                  },
                  { label: "اختبار الاتصال", icon: Network, onClick: () => testConnection(i) },
                  { label: "عرض المفاتيح", icon: Eye, onClick: () => showKeys(i) },
                ]}
              />
            </div>
          </Card>
        ))}
      </div>

      <EntityFormDrawer
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          resetForm();
        }}
        title="إضافة تكامل جديد"
        onSave={handleAdd}
        saveText="إضافة"
      >
        <div>
          <label className="text-xs text-muted-foreground">الاسم *</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">النوع</label>
          <select
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">رابط API</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formApi}
            onChange={(e) => setFormApi(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">المفتاح</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formKey}
            onChange={(e) => setFormKey(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">الحالة</label>
          <select
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formStatus}
            onChange={(e) => setFormStatus(e.target.value)}
          >
            <option>نشط</option>
            <option>موقوف</option>
          </select>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={addWebhookOpen}
        onClose={() => setAddWebhookOpen(false)}
        title="إضافة Webhook"
        onSave={handleAddWebhook}
        saveText="إضافة"
      >
        <div>
          <label className="text-xs text-muted-foreground">الاسم *</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={webhookName}
            onChange={(e) => setWebhookName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">رابط Webhook URL *</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">الحدث</label>
          <select
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={webhookEvent}
            onChange={(e) => setWebhookEvent(e.target.value)}
          >
            {events.map((ev) => (
              <option key={ev}>{ev}</option>
            ))}
          </select>
        </div>
      </EntityFormDrawer>

      <EntityFormDrawer
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setEditIdx(null);
          resetForm();
        }}
        title="تعديل التكامل"
        onSave={handleSaveEdit}
        saveText="حفظ التغييرات"
      >
        <div>
          <label className="text-xs text-muted-foreground">الاسم</label>
          <input
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">النوع</label>
          <select
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">الحالة</label>
          <select
            className="mt-1 w-full rounded-lg border bg-background p-2 text-sm"
            value={formStatus}
            onChange={(e) => setFormStatus(e.target.value)}
          >
            <option>نشط</option>
            <option>موقوف</option>
          </select>
        </div>
      </EntityFormDrawer>
    </AppShell>
  );
}
