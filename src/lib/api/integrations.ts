import {
  IntegrationCategory as CatEnum,
  IntegrationStatus as StatusEnum,
  WebhookEvent as EventEnum,
} from "@/lib/enums";

const INTG = "/api/settings/integrations";
const WHK = "/api/settings/webhooks";

export const INTEGRATION_CATEGORIES = Object.values(CatEnum);
export const INTEGRATION_STATUSES = Object.values(StatusEnum);
export const WEBHOOK_EVENTS = Object.values(EventEnum);
export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory | string;
  apiUrl: string;
  hasKey: boolean;
  status: IntegrationStatus | string;
  info: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntegrationInput {
  name: string;
  category?: IntegrationCategory;
  apiUrl?: string;
  apiKey?: string;
  status?: IntegrationStatus;
  info?: string;
}

export type UpdateIntegrationInput = Partial<CreateIntegrationInput> & { id: string };

export interface Webhook {
  id: string;
  name: string;
  url: string;
  event: WebhookEvent | string;
  active: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  event?: WebhookEvent;
  active?: boolean;
}

async function json(res: Response, fallback: string) {
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || e.error || fallback);
  }
  return res.json();
}

// ---- Integrations ----
export async function getIntegrations(): Promise<{ items: Integration[]; total: number }> {
  return json(await fetch(INTG), "فشل في جلب التكاملات");
}
export async function getIntegration(id: string): Promise<{ item: Integration }> {
  return json(await fetch(`${INTG}?id=${id}`), "فشل في جلب التكامل");
}
export async function createIntegration(data: CreateIntegrationInput): Promise<Integration> {
  return (
    await json(
      await fetch(INTG, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      "فشل في إضافة التكامل",
    )
  ).item;
}
export async function updateIntegration(data: UpdateIntegrationInput): Promise<Integration> {
  return (
    await json(
      await fetch(INTG, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      "فشل في تحديث التكامل",
    )
  ).item;
}
export async function setIntegrationStatus(
  id: string,
  action: "activate" | "deactivate",
): Promise<Integration> {
  return (
    await json(
      await fetch(INTG, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      }),
      "فشل في تغيير حالة التكامل",
    )
  ).item;
}
export async function deleteIntegration(id: string): Promise<void> {
  await json(await fetch(`${INTG}?id=${id}`, { method: "DELETE" }), "فشل في حذف التكامل");
}

// ---- Webhooks ----
export async function getWebhooks(): Promise<{ items: Webhook[]; total: number }> {
  return json(await fetch(WHK), "فشل في جلب الـ Webhooks");
}
export async function createWebhook(data: CreateWebhookInput): Promise<Webhook> {
  return (
    await json(
      await fetch(WHK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      "فشل في إضافة الـ Webhook",
    )
  ).item;
}
export async function toggleWebhook(id: string): Promise<Webhook> {
  return (
    await json(
      await fetch(WHK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id }),
      }),
      "فشل في تغيير حالة الـ Webhook",
    )
  ).item;
}
export async function deleteWebhook(id: string): Promise<void> {
  await json(await fetch(`${WHK}?id=${id}`, { method: "DELETE" }), "فشل في حذف الـ Webhook");
}
