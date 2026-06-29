# تقرير الفحص التقني — ثواب

## 1. معلومات المشروع

| البند | القيمة |
|-------|--------|
| اسم المشروع | ثواب |
| المسار | `D:/thawab` |
| مستودع GitHub | `https://github.com/Techzoneksa/thawab.git` |
| نوع المشروع | نظام خاص لإدارة الجمعيات والجهات الخيرية |
| تاريخ الفحص | 29 يونيو 2026 |

## 2. التقنية الفعلية

| البند | النتيجة |
|-------|---------|
| **Framework** | TanStack Start v1 (`@tanstack/react-start`) |
| **هل هو Next.js؟** | ❌ لا — TanStack Start (مبني على Vite/Nitro) |
| **React version** | 19.2.0 |
| **Routing** | TanStack Router (File-based) |
| **State/Data** | TanStack Query v5 |
| **Styling** | Tailwind CSS v4 + OKLCH tokens |
| **UI Library** | shadcn/ui (Radix Primitives) |
| **Server Engine** | Nitro v3 (مع Node.js preset) |
| **Bundler** | Vite 8 (Rolldown) |

## 3. الملفات المهمة

| الملف | الوظيفة |
|-------|---------|
| `package.json` | تعريف المشروع والاعتماديات |
| `vite.config.ts` | إعدادات Vite/Nitro |
| `src/routes/__root.tsx` | Shell جذري (HTML + Head + RTL) |
| `src/routes/index.tsx` | لوحة المعلومات الرئيسية |
| `src/components/erp/AppShell.tsx` | القائمة الجانبية + الشريط العلوي |
| `src/data/sample.ts` | جميع البيانات التجريبية (Mock) |
| `src/styles.css` | نظام التصميم |
| `src/router.tsx` | تهيئة Router + QueryClient |
| `src/server.ts` | نقطة بدء SSR |
| `src/start.ts` | Middleware |

## 4. حالة الواجهة

| البند | الحالة | ملاحظات |
|-------|--------|---------|
| Dashboard | ✅ UI مكتمل | بيانات تجريبية |
| 47 صفحة وظيفية | ✅ UI مكتمل | جميع الوحدات |
| RTL | ✅ يعمل | `dir="rtl"` في `<html>` |
| خطوط Tajawal | ✅ مضمنة | Google Fonts |
| نظام الألوان | ✅ OKLCH tokens | Navy/White Enterprise |
| Responsive | ✅ | يدعم الجوال |

## 5. حالة البيانات

| البند | الحالة |
|-------|--------|
| قاعدة بيانات | ❌ غير موجودة |
| Mock Data | ✅ مصدر البيانات الوحيد |
| Supabase | ❌ غير مفعّل |
| Neon | ❌ غير مستخدم |
| Lovable Cloud | ❌ غير مفعّل |
| API Layer | ❌ غير موجود |

## 6. حالة Backend

| البند | الحالة |
|-------|--------|
| Server Functions | ❌ غير موجودة |
| API Routes | ❌ غير موجودة |
| Edge Functions | ❌ غير موجودة |

## 7. حالة Auth

| البند | الحالة |
|-------|--------|
| تسجيل الدخول | ❌ غير منفذ |
| JWT | ❌ غير موجود |
| OAuth | ❌ غير موجود |

## 8. المشاكل المكتشفة

### تم إصلاحها
1. ✅ اسم المشروع — تم تصحيحه من "CharityCloud ERP" إلى "ثواب"
2. ✅ هوية SaaS — تم إزالة وصف "SaaS متعدد المستأجرين"
3. ✅ Metadata — تم تحديث جميع عناوين الصفحات ووصفها
4. ✅ Git — تم تهيئة مستودع جديد (بدلاً من worktree المعطوب)
5. ✅ Nitro preset — تم تغييره من `cloudflare-module` إلى `node-server`
6. ✅ Start script — تم إضافة `npm run start`

### قيد المراجعة
7. ⚠️ Output directory — `.output/` وليس `.next/` (يحتاج تعديل إعدادات Hostinger)

### لم تُحل (خارج النطاق الحالي)
8. ❌ لا يوجد Backend
9. ❌ لا يوجد Auth
10. ❌ لا توجد قاعدة بيانات حقيقية

## 9. إعدادات Hostinger المطلوبة

| الإعداد | الموصى به |
|---------|-----------|
| Framework preset | **Node.js** (وليس Next.js) |
| Output directory | `.output` (وليس `.next`) |
| Start command | `npm run start` |

> السبب: المشروع TanStack Start وليس Next.js.
> خيار "Next.js preset" في Hostinger يتوقع `.next/` output directory مما لن يعمل.
> بدلاً من ذلك، اختر "Node.js" كـ Framework preset وضبط الإعدادات أعلاه.
