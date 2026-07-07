# نشر ثواب على Hostinger

## ⚠️ تنبيه مهم جداً — ليس Next.js

> **هذا المشروع مبني على TanStack Start (React + Vite + Nitro SSR)، وليس Next.js.**
>
> لذلك:
>
> - **لا** تستخدم "Next.js" preset في Hostinger
> - **لا** تضبط Output directory إلى `.next`
> - استخدم الإعدادات في الجدول أدناه حرفياً

إذا استخدمت Next.js preset، سيفشل build لأن Hostinger سيبحث عن `.next/` ولن يجده.

---

## الإعدادات النهائية لـ Hostinger

| الإعداد              | القيمة المطلوبة                                 |
| -------------------- | ----------------------------------------------- |
| **Framework preset** | **Node.js** (من قائمة frameworks وليس Next.js)  |
| **Branch**           | `nextjs-migration`                              |
| **Node version**     | `22.x`                                          |
| **Root directory**   | `./`                                            |
| **Package manager**  | `npm`                                           |
| **Build command**    | `npm run build`                                 |
| **Start command**    | `node server/index.mjs` (أو `npm run start`)    |

> **Output directory:** اتركه فارغاً أو `./` — لا يحتاج Hostinger لمجلد output
> منفصل لأن `npm run build` يكتب الـ entry إلى `server/index.mjs` في جذر
> المشروع (وهو الـ entry الذي تتوقعه Hostinger Node.js preset افتراضياً).

---

## entry point — كيف يعمل الـ build

```
vite build                  ← يكتب SSR bundle في .output/server/
                            ← يكتب static assets في .output/public/
                            ← يكتب metadata في .output/nitro.json
npm run postbuild (تلقائي) ← ينسخ .output/server/   → server/   (في جذر المشروع)
                            ← ينسخ .output/public/  → public/   (في جذر المشروع)
```

`npm run postbuild` يُشغَّل **تلقائياً** بواسطة npm بعد `npm run build` (لاحقة
`postbuild` هي npm hook مدمج — لا حاجة لاستدعائه يدوياً).

بعد البناء، الملفات الناتجة في جذر المشروع:

| الملف / المجلد       | المصدر                | الوصف                                  |
| -------------------- | --------------------- | -------------------------------------- |
| `server/index.mjs`   | `.output/server/`     | SSR server entry (يشغّل `npm run start`) |
| `server/_chunks/`    | `.output/server/`     | JavaScript chunks للـ SSR              |
| `server/_libs/`      | `.output/server/`     | Vendor libraries (h3, nitro, ...)      |
| `server/_ssr/`       | `.output/server/`     | Per-route SSR bundles                  |
| `public/assets/`     | `.output/public/`     | CSS + hashed client JS chunks          |
| `node_modules/`      | npm install           | Dependencies                           |

كل من `server/` و `public/` مضافان إلى `.gitignore` لأنهما يُولَّدان من كل
`npm run build` ولا يجب تعديلهما يدوياً.

---

## خطوات النشر خطوة بخطوة

### المرحلة 1: تحضير المشروع محلياً

```bash
# 1. تأكد من أنك على الفرع الصحيح
git checkout nextjs-migration

# 2. تثبيت الاعتماديات
npm install

# 3. بناء المشروع (يكتب entry تلقائياً في server/index.mjs)
npm run build

# 4. تأكد من وجود الملفات الناتجة
ls server/index.mjs        # ← SSR entry point
ls public/assets/          # ← static client assets

# 5. اختبر تشغيل الخادم محلياً (اختياري)
npm run start
# ثم افتح http://localhost:3000
# إذا ظهرت الواجهة ← كل شيء يعمل
```

### المرحلة 2: رفع المشروع إلى GitHub

```bash
git push origin nextjs-migration
```

### المرحلة 3: الإعداد في لوحة Hostinger

1. سجّل الدخول إلى Hostinger → Websites → الموقع الجديد
2. اختر **Git** كمصدر للنشر (وليس FTP)
3. اربط مستودع GitHub: `https://github.com/Techzoneksa/thawab.git`
4. اختر الفرع: `nextjs-migration`
5. اضبط الإعدادات التالية:

   | الحقل            | القيمة                                |
   | ---------------- | ------------------------------------- |
   | Framework        | **Node.js** (ابحث عنه في القائمة)     |
   | Node version     | **22.x**                              |
   | Root directory   | `./` (اتركها افتراضية)                |
   | Build command    | `npm run build`                       |
   | Start command    | `node server/index.mjs`               |
   | Output directory | اتركها فارغة أو `./`                 |

6. احفظ الإعدادات
7. اضغط **Deploy** (أو انتظر الدفع التلقائي)

> **ملاحظة:** لا تضبط Output directory على `.output` ولا `.next` — السيرفر يقرأ
> `server/index.mjs` من جذر المشروع، وليس من مجلد output.

### المرحلة 4: التحقق من النشر

بعد اكتمال النشر (يتوقع 2-5 دقائق)، تحقق من العناصر التالية:

#### الصفحات الأساسية

- [ ] `https://<domain>/` ← لوحة المعلومات الرئيسية
- [ ] `https://<domain>/finance/accounts` ← دليل الحسابات
- [ ] `https://<domain>/donors` ← المتبرعون
- [ ] `https://<domain>/donations` ← التبرعات
- [ ] `https://<domain>/beneficiaries` ← المستفيدون
- [ ] `https://<domain>/projects` ← المشاريع
- [ ] `https://<domain>/settings/system` ← الإعدادات

#### التحقق من الهوية

- [ ] شعار "ثواب" يظهر في أعلى القائمة الجانبية
- [ ] لا يوجد نص "CharityCloud" في أي صفحة
- [ ] لا يوجد نص "SaaS" في أي صفحة
- [ ] وصف المشروع: "نظام خاص لإدارة الجمعيات والجهات الخيرية"

#### التحقق من المظهر

- [ ] الاتجاه RTL صحيح (نص من اليمين لليسار)
- [ ] خط Tajawal يظهر بشكل صحيح
- [ ] القائمة الجانبية تعمل
- [ ] الألوان والتصميم سليم

#### التحقق من الأخطاء

- [ ] لا يوجد 404 في أي صفحة
- [ ] لا يوجد 500 (Server Error)
- [ ] Console خالٍ من الأخطاء (اضغط F12 → Console)
- [ ] الشبكة (Network tab) لا تظهر أخطاء

---

## الأخطاء المتوقعة وحلولها

### 1. Build يفشل مع "Cannot find module"

**السبب**: لم يتم تثبيت node_modules بشكل صحيح.

**الحل**: في Hostinger، اذهب إلى Settings → Advanced → Delete cache ثم أعد النشر. أو أعد تشغيل npm install محلياً وادفع مرة أخرى.

### 2. Build ينجح ولكن الصفحة تظهر 502/503

**السبب**: Start command غير صحيح أو خادم Node.js لم يبدأ.

**الحل**: تأكد من:
- Start command = `node server/index.mjs` (وليس `node .output/server/index.mjs`)
- Build command = `npm run build` (وليس `npm run build:dev`)
- Node version = `22.x`

### 3. Hostinger يقول "Build failed: ENOENT server/index.mjs"

**السبب**: `npm run build` لم يكتب `server/index.mjs` بعد — إما بسبب فشل
`vite build` نفسه، أو فشل خطوة `postbuild` (التي تنسخ من `.output/` إلى
`server/`).

**الحل**:
1. شغّل `npm run build` محلياً وراقب المخرجات — يجب أن تظهر:
   ```
   ✓ built in <ms>
   Generated .output/nitro.json
   [postbuild] mirrored server bundle to ...\server/
   [postbuild] mirrored static assets to ...\public/
   ```
2. تأكد أن `server/index.mjs` موجود بعد البناء (`ls server/`).
3. إذا فشل `postbuild`، فحص صلاحيات الكتابة على `server/`.

### 4. خطوط Tajawal لا تظهر

**السبب**: Hostinger قد يمنع Google Fonts عبر CSP.

**الحل**: أضف `fonts.googleapis.com` إلى قائمة المحتوى المسموح في إعدادات Hostinger → SSL/CSP.

### 5. الصفحات تظهر فارغة أو بيضاء

**السبب**: خطأ في JavaScript أو الـ SSR.

**الحل**: افتح Console في المتصفح (F12). ابحث عن رسائل الخطأ. إذا كان الخطأ من الـ Mock Data، فقط التحديث قد يحله.

### 6. جميع الصفحات تعمل ما عدا صفحة واحدة

**السبب**: قد يكون رابط المسار خطأ أو اسم الملف.

**الحل**: تحقق من أن اسم المسار يطابق اسم الملف في `src/routes/`. مثال: `/finance/accounts` يقابل `finance.accounts.tsx`.

---

## بعد النشر — التحقق النهائي

```bash
# أسرع طريقة للتحقق من استجابة الخادم
curl -I https://<domain>/
# يجب أن يعيد 200 OK مع content-type: text/html

# تحقق من عدم وجود صفحات 404
curl -s -o /dev/null -w "%{http_code}" https://<domain>/finance/accounts
# يجب أن يعيد 200
```

إذا ظهرت لك واجهة ثواب بعد النشر ← الترحيل تم بنجاح.

---

## متغيرات البيئة

المشروع حالياً لا يحتاج متغيرات بيئة لأنه يعمل على بيانات تجريبية (Mock Data).
عند إضافة Backend مستقبلاً، راجع `.env.example` في جذر المشروع.

---

## تحديث المشروع بعد التعديلات

```bash
git add .
git commit -m "وصف التغيير"
git push origin nextjs-migration
# Hostinger سيكتشف التغيير ويعيد النشر تلقائياً
```
