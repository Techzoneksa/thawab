import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AppShell,
  Card,
  Badge,
  Btn,
  statusTone,
  MobilePageHeader,
  MobileActionRow,
} from "@/components/erp/AppShell";
import { showToast, ConfirmDialog, ActionMenu, EmptyState } from "@/components/erp/actions";
import { Plug, Pencil, Ban, CheckCircle2, Webhook, Trash2, Power } from "lucide-react";
import { useState } from "react";
import { label } from "@/lib/i18n/labels";
import { IntegrationStatus } from "@/lib/enums";
import {
  getIntegrations,
  setIntegrationStatus,
  deleteIntegration,
  getWebhooks,
  toggleWebhook,
  deleteWebhook,
  type Integration,
  type Webhook as WebhookRow,
} from "@/lib/api/integrations";

export const Route = createFileRoute("/settings/integrations")({
  head: () => ({ meta: [{ title: "التكاملات — ثواب" }] }),
  component: Page,
});

function Page() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [delInt, setDelInt] = useState<Integration | null>(null);
  const [delHook, setDelHook] = useState<WebhookRow | null>(null);

  const { data: intData, isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: getIntegrations,
  });
  const integrations = intData?.items ?? [];

  const { data: hookData } = useQuery({ queryKey: ["webhooks"], queryFn: getWebhooks });
  const hooks = hookData?.items ?? [];

  const invInt = () => queryClient.invalidateQueries({ queryKey: ["integrations"] });
  const invHook = () => queryClient.invalidateQueries({ queryKey: ["webhooks"] });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; action: "activate" | "deactivate" }) =>
      setIntegrationStatus(v.id, v.action),
    onSuccess: invInt,
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const delIntMut = useMutation({
    mutationFn: deleteIntegration,
    onSuccess: () => {
      invInt();
      showToast("تم حذف التكامل", "success");
      setDelInt(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const toggleHookMut = useMutation({
    mutationFn: toggleWebhook,
    onSuccess: invHook,
    onError: (e: Error) => showToast(e.message, "error"),
  });
  const delHookMut = useMutation({
    mutationFn: deleteWebhook,
    onSuccess: () => {
      invHook();
      showToast("تم حذف الـ Webhook", "success");
      setDelHook(null);
    },
    onError: (e: Error) => showToast(e.message, "error"),
  });

  return (
    <AppShell
      breadcrumb={["الرئيسية", "الإعدادات", "التكاملات"]}
      title="مركز التكاملات"
      actions={
        <div className="flex items-center gap-2">
          <Btn variant="outline" onClick={() => navigate({ to: "/settings/webhooks/new" })}>
            <Webhook size={15} />
            <span className="hidden md:inline">إضافة Webhook</span>
          </Btn>
          <Btn variant="primary" onClick={() => navigate({ to: "/settings/integrations/new" })}>
            <Plug size={15} /> تكامل جديد
          </Btn>
        </div>
      }
    >
      <MobilePageHeader title="مركز التكاملات" count={`${integrations.length} تكامل`} />
      <MobileActionRow>
        <Btn variant="outline" onClick={() => navigate({ to: "/settings/webhooks/new" })}>
          <Webhook size={15} /> إضافة Webhook
        </Btn>
        <Btn variant="primary" onClick={() => navigate({ to: "/settings/integrations/new" })}>
          <Plug size={15} /> إضافة تكامل
        </Btn>
      </MobileActionRow>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : integrations.length === 0 ? (
        <Card className="p-2 mt-3 lg:mt-0">
          <EmptyState
            icon={<Plug size={40} />}
            title="لا توجد تكاملات مُفعّلة"
            description="لم تتم إضافة أي تكامل بعد. استخدم زر «تكامل جديد» لإضافة أول تكامل"
            action={
              <Btn variant="primary" onClick={() => navigate({ to: "/settings/integrations/new" })}>
                <Plug size={15} /> تكامل جديد
              </Btn>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3 lg:mt-0">
          {integrations.map((it: Integration) => (
            <Card key={it.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Plug size={20} />
                  </div>
                  <div className="min-w-0">
                    <button
                      onClick={() =>
                        navigate({ to: "/settings/integrations/$id/edit", params: { id: it.id } })
                      }
                      className="font-bold truncate hover:text-primary text-right block w-full"
                    >
                      {it.name}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      {label("integrationCategory", it.category)}
                    </div>
                  </div>
                </div>
                <Badge tone={statusTone(it.status)}>{label("integrationStatus", it.status)}</Badge>
              </div>
              {it.info && <p className="text-sm text-muted-foreground mt-3">{it.info}</p>}
              <div className="flex items-center justify-between mt-4">
                <ActionMenu
                  actions={[
                    {
                      label: "تعديل",
                      icon: Pencil,
                      onClick: () =>
                        navigate({ to: "/settings/integrations/$id/edit", params: { id: it.id } }),
                    },
                    it.status === IntegrationStatus.ACTIVE
                      ? {
                          label: "تعطيل",
                          icon: Ban,
                          onClick: () => statusMut.mutate({ id: it.id, action: "deactivate" }),
                        }
                      : {
                          label: "تفعيل",
                          icon: CheckCircle2,
                          onClick: () => statusMut.mutate({ id: it.id, action: "activate" }),
                        },
                    {
                      label: "حذف",
                      icon: Trash2,
                      variant: "destructive" as const,
                      onClick: () => setDelInt(it),
                    },
                  ]}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <section className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-muted-foreground flex items-center gap-1.5">
            <Webhook size={14} /> الـ Webhooks ({hooks.length})
          </h2>
          <button
            onClick={() => navigate({ to: "/settings/webhooks/new" })}
            className="text-primary text-xs font-semibold hover:underline"
          >
            + Webhook جديد
          </button>
        </div>
        {hooks.length === 0 ? (
          <Card className="p-2">
            <EmptyState
              icon={<Webhook size={32} />}
              title="لا توجد Webhooks"
              description="أضف Webhook لإرسال إشعارات لأنظمة خارجية عند وقوع أحداث"
            />
          </Card>
        ) : (
          <Card className="p-2">
            <ul className="divide-y">
              {hooks.map((h: WebhookRow) => (
                <li key={h.id} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{h.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate" dir="ltr">
                      {h.url}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {label("webhookEvent", h.event)}
                    </div>
                  </div>
                  <Badge tone={h.active ? "success" : "muted"}>
                    {h.active ? "مفعّل" : "موقوف"}
                  </Badge>
                  <ActionMenu
                    actions={[
                      {
                        label: h.active ? "تعطيل" : "تفعيل",
                        icon: Power,
                        onClick: () => toggleHookMut.mutate(h.id),
                      },
                      {
                        label: "حذف",
                        icon: Trash2,
                        variant: "destructive" as const,
                        onClick: () => setDelHook(h),
                      },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <ConfirmDialog
        open={!!delInt}
        onClose={() => setDelInt(null)}
        onConfirm={() => delInt && delIntMut.mutate(delInt.id)}
        title="حذف التكامل"
        message={delInt ? `هل تريد حذف التكامل "${delInt.name}"؟` : ""}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
      <ConfirmDialog
        open={!!delHook}
        onClose={() => setDelHook(null)}
        onConfirm={() => delHook && delHookMut.mutate(delHook.id)}
        title="حذف الـ Webhook"
        message={delHook ? `هل تريد حذف الـ Webhook "${delHook.name}"؟` : ""}
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />
    </AppShell>
  );
}
