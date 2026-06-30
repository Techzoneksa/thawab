# ثواب

**نظام خاص لإدارة الجمعيات والجهات الخيرية** — وليس SaaS.

نظام ERP متكامل عربي أولاً، مُصمم للجمعيات الخيرية السعودية لإدارة المالية، المتبرعين، المستفيدين، المشاريع، المشتريات، المخزون، الموارد البشرية، والحوكمة.

## الحالة الحالية

- **الواجهة**: 47 صفحة وظيفية كاملة (UI Shell)
- **البيانات**: بيانات تجريبية (Mock Data) في `src/data/sample.ts`
- **Backend**: غير موجود بعد
- **Auth**: غير منفّذ
- **قاعدة بيانات**: غير موجودة

## التقنيات المستخدمة

| التقنية         | الإصدار                 |
| --------------- | ----------------------- |
| React           | 19.x                    |
| TanStack Start  | v1 (SSR-capable)        |
| TanStack Router | File-based routing      |
| TanStack Query  | v5                      |
| Tailwind CSS    | v4                      |
| shadcn/ui       | كامل (Radix Primitives) |
| Vite            | v8                      |
| Nitro           | Node.js server preset   |

## التشغيل محلياً

```bash
npm install
npm run dev     # تطوير على http://localhost:8080
```

## البناء

```bash
npm run build
```

## تشغيل الإنتاج

```bash
npm run start   # يشغل node .output/server/index.mjs
```

## النشر على Hostinger

راجع `HOSTINGER_DEPLOYMENT.md` للتعليمات الكاملة.

## هيكلة المشروع

```
src/
├── routes/              # 47 صفحة (TanStack Router file-based)
├── components/
│   ├── erp/             # مكونات مخصصة (AppShell, ListPage)
│   └── ui/              # shadcn/ui (45+ مكون)
├── data/
│   └── sample.ts        # بيانات تجريبية
├── lib/                 # أدوات مساعدة
├── styles.css           # نظام التصميم
└── router.tsx           # تهيئة Router
```

## الخطوات القادمة

1. بناء Backend (NestJS + PostgreSQL)
2. إضافة Auth
3. ربط API
4. نشر إنتاجي
