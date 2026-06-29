# نشر ثواب على Hostinger

> **ملاحظة مهمة**: هذا المشروع مبني على **TanStack Start** (وليس Next.js).
> إعدادات Hostinger يجب أن تكون "Node.js" وليس "Next.js".

## الإعدادات المطلوبة في Hostinger

| الإعداد | القيمة |
|---------|--------|
| Framework preset | **Node.js** (وليس Next.js) |
| Branch | `nextjs-migration` |
| Node version | **22.x** (أو أحدث) |
| Root directory | `./` |
| Build command | `npm run build` |
| Package manager | npm |
| Output directory | `.output` (وليس `.next`) |
| Start command | `node .output/server/index.mjs` (أو `npm run start`) |

> **السبب**: المشروع مبني على TanStack Start الذي يستخدم Nitro كخادم SSR.
> Nitro ينتج ملفات في `.output/` وليس `.next/`.

## خطوات النشر

### 1. التحضير الأولي

```bash
# تثبيت الاعتماديات
npm install

# بناء المشروع
npm run build

# اختبار تشغيل الإنتاج محلياً
npm run start
```

### 2. الرفع إلى GitHub

```bash
git checkout nextjs-migration
git add .
git commit -m "chore: prepare for hostinger deployment"
git push origin nextjs-migration
```

### 3. الإعداد في Hostinger

1. إنشاء موقع جديد في Hostinger
2. اختيار **Git** كمصدر deployment
3. ربط مستودع GitHub: `https://github.com/Techzoneksa/thawab.git`
4. اختيار الفرع: `nextjs-migration`
5. ضبط الإعدادات كما في الجدول أعلاه
6. تفعيل Auto-deployment (اختياري)

### 4. التحقق من النشر

بعد أول نشر، تحقق من:
- [ ] الصفحة الرئيسية تعمل
- [ ] جميع المسارات (47 صفحة) تعمل
- [ ] لا يوجد 404 خطأ
- [ ] خطوط Tajawal تظهر بشكل صحيح
- [ ] RTL يعمل
- [ ] Mock data تظهر

## الأخطاء المحتملة

### Build يفشل
- تأكد من أن `node_modules` محذوفة وأعد تشغيل `npm install`
- تأكد من Node.js 22.x
- تحقق من logs في Hostinger

### 404 بعد النشر
- تأكد من أن Output directory هو `.output/` وليس `.next/`
- تأكد من أن Start command صحيح

### خطوط غير ظاهرة
- قد يحتاج Hostinger إلى إضافة Google Fonts domain إلى Content Security Policy

## متغيرات البيئة

لا يحتاج المشروع حالياً لأي متغيرات بيئة لأنه يعمل على Mock Data.
عند إضافة Backend مستقبلاً، راجع `.env.example`.

## تحديث المشروع

```bash
# سحب آخر التغييرات
git pull origin nextjs-migration

# إعادة البناء
npm install
npm run build

# الدفع إلى GitHub (Hostinger سيتولى الباقي تلقائياً)
git push origin nextjs-migration
```
