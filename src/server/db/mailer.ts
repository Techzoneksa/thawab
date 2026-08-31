/**
 * Outbound email (SMTP) — env-driven, never throws to the caller.
 *
 * Configure via environment (e.g. Hostinger mailbox):
 *   SMTP_HOST=smtp.hostinger.com
 *   SMTP_PORT=465            # 465 (SSL) or 587 (STARTTLS)
 *   SMTP_SECURE=true         # true for 465, false for 587
 *   SMTP_USER=no-reply@jaadpro.com
 *   SMTP_PASS=********
 *   SMTP_FROM="جاد كلاود <no-reply@jaadpro.com>"   # optional, defaults to SMTP_USER
 *   APP_URL=https://thawab.jaadpro.com              # base URL for links in emails
 *
 * When SMTP is not configured, sendMail() is a no-op that reports { sent:false,
 * reason:"not_configured" } so callers can fall back (e.g. show the link to the
 * admin) instead of failing the whole request.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface MailResult {
  sent: boolean;
  reason?: string;
}

function env(k: string): string | undefined {
  const v = process.env[k];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function isMailerConfigured(): boolean {
  return !!(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS"));
}

/** Public base URL for links in emails (no trailing slash). */
export function appUrl(): string {
  return (env("APP_URL") || "https://thawab.jaadpro.com").replace(/\/+$/, "");
}

let _tx: Transporter | null = null;
function transport(): Transporter | null {
  if (!isMailerConfigured()) return null;
  if (_tx) return _tx;
  const port = Number(env("SMTP_PORT") || 465);
  // Default: secure (SSL) on 465, STARTTLS otherwise. SMTP_SECURE overrides.
  const secureEnv = env("SMTP_SECURE");
  const secure = secureEnv != null ? secureEnv === "true" : port === 465;
  _tx = nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port,
    secure,
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
  });
  return _tx;
}

function fromAddress(): string {
  return env("SMTP_FROM") || env("SMTP_USER") || "no-reply@jaadpro.com";
}

/** Send an email. Never throws — returns a status the caller can act on. */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<MailResult> {
  const tx = transport();
  if (!tx) return { sent: false, reason: "not_configured" };
  try {
    await tx.sendMail({
      from: fromAddress(),
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? opts.html.replace(/<[^>]+>/g, " "),
    });
    return { sent: true };
  } catch (e) {
    console.error("[mailer] send failed:", e instanceof Error ? e.message : e);
    return { sent: false, reason: "send_error" };
  }
}

/** RTL Arabic wrapper so every email renders consistently. */
function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f5f7;font-family:Tahoma,Arial,sans-serif;color:#1f2937">
    <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#4f46e5;color:#fff;padding:18px 24px;font-size:18px;font-weight:bold">جاد كلاود · JAAD CLOUD</div>
      <div style="padding:24px">
        <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:14px 24px;background:#f9fafb;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb">
        هذه رسالة آلية من نظام جاد كلاود — لا تردّ عليها.
      </div>
    </div></body></html>`;
}

/** Invitation email carrying a one-time set-password link (no password inside). */
export async function sendInvitationEmail(opts: {
  to: string;
  name: string;
  setupUrl: string;
  expiresHours: number;
}): Promise<MailResult> {
  const html = wrap(
    `مرحباً ${opts.name}،`,
    `<p style="margin:0 0 16px;line-height:1.9">تمت دعوتك لاستخدام نظام <b>جاد كلاود</b>. لإكمال إنشاء حسابك، عيّن كلمة المرور الخاصة بك عبر الزر التالي:</p>
     <p style="text-align:center;margin:24px 0">
       <a href="${opts.setupUrl}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">تعيين كلمة المرور</a>
     </p>
     <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.8">أو انسخ الرابط التالي في المتصفح:</p>
     <p style="word-break:break-all;background:#f3f4f6;padding:10px;border-radius:6px;font-size:12px;direction:ltr;text-align:left">${opts.setupUrl}</p>
     <p style="margin:16px 0 0;color:#9ca3af;font-size:12px">ينتهي هذا الرابط خلال ${opts.expiresHours} ساعة. إن لم تطلب هذه الدعوة، تجاهل الرسالة.</p>`,
  );
  return sendMail({ to: opts.to, subject: "دعوة لإنشاء حسابك في جاد كلاود", html });
}

/** Password-reset email carrying a one-time reset link. */
export async function sendResetEmail(opts: {
  to: string;
  name: string;
  setupUrl: string;
  expiresHours: number;
}): Promise<MailResult> {
  const html = wrap(
    `مرحباً ${opts.name}،`,
    `<p style="margin:0 0 16px;line-height:1.9">وردنا طلب إعادة تعيين كلمة المرور لحسابك في <b>جاد كلاود</b>. اضغط الزر التالي لتعيين كلمة مرور جديدة:</p>
     <p style="text-align:center;margin:24px 0">
       <a href="${opts.setupUrl}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">إعادة تعيين كلمة المرور</a>
     </p>
     <p style="margin:16px 0 0;color:#9ca3af;font-size:12px">ينتهي هذا الرابط خلال ${opts.expiresHours} ساعة. إن لم تطلب ذلك، تجاهل الرسالة وستبقى كلمة مرورك كما هي.</p>`,
  );
  return sendMail({ to: opts.to, subject: "إعادة تعيين كلمة المرور — جاد كلاود", html });
}
