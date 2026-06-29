# التقرير التقني الشامل — CharityCloud ERP

> منصة سحابية متكاملة لإدارة الجمعيات الخيرية والمنظمات غير الربحية في المملكة العربية السعودية.
> هذا التقرير مبني على الكود الفعلي الموجود داخل المشروع وقت التسليم، وليس وصفاً نظرياً.

---

## 1. مقدمة عن المشروع

| البند | التفاصيل |
|------|----------|
| **اسم المشروع** | CharityCloud ERP (نظام إدارة الجمعيات الخيرية) |
| **الهدف** | توفير نظام ERP عربي أولاً، مخصص للجمعيات الخيرية السعودية لإدارة المالية، المتبرعين، المستفيدين، المشاريع، المشتريات، المخزون، الموارد البشرية، والحوكمة، مع جاهزية لمتطلبات الجهات التنظيمية (الفاتورة الإلكترونية / فاتورة، أموال مقيدة، إلخ). |
| **المشكلة التي يحلها** | تشتت العمليات داخل الجمعيات بين Excel وأنظمة منفصلة، وغياب نظام واحد متوافق مع المحاسبة الخيرية (Fund Accounting) واللغة العربية والـ RTL. |
| **المستخدمون المستهدفون** | المدير المالي، المحاسب، مدير المشاريع، مدير المتبرعين، مدير المستفيدين، مسؤول المشتريات، الإدارة التنفيذية، المراجع الداخلي. |
| **نوع المشروع** | Demo / Prototype عالي الجودة (UI-Complete SaaS Shell) — جاهز كنواة لمنتج SaaS متعدد المستأجرين. |
| **نطاق المشروع الحالي** | واجهة أمامية كاملة (Frontend Shell) بـ 47 صفحة وظيفية، بيانات تجريبية واقعية، بدون Backend مربوط بعد. |

---

## 2. ماذا تم بناؤه بالكامل؟

تم بناء **47 صفحة (route)** موزعة على 9 مجموعات وظيفية، بالإضافة إلى الـ AppShell الرئيسي (Sidebar + Topbar + AI Panel).

### 2.1 الرئيسية
| الميزة | الوصف | الموقع | الحالة | البيانات |
|--------|-------|--------|--------|----------|
| لوحة المعلومات التنفيذية | KPIs + رسوم تدفق نقدي + توزيع التبرعات + صندوق الموافقات | `src/routes/index.tsx` | مكتملة UI | تجريبية |
| التنبيهات | قائمة إشعارات النظام | `src/routes/notifications.tsx` | مكتملة UI | تجريبية |
| الموافقات | صندوق وارد للموافقات متعددة المستويات | `src/routes/approvals.tsx` | مكتملة UI | تجريبية |

### 2.2 المالية
| الميزة | الموقع | الحالة |
|--------|--------|--------|
| دليل الحسابات الهرمي | `finance.accounts.tsx` | UI مكتمل |
| قيود اليومية (مع دعم الأموال المقيدة) | `finance.journal.tsx` | UI مكتمل |
| دفتر الأستاذ | `finance.ledger.tsx` | UI مكتمل |
| الموازنات | `finance.budgets.tsx` | UI مكتمل |
| مراكز التكلفة | `finance.cost-centers.tsx` | UI مكتمل |
| الإقفال المالي | `finance.closing.tsx` | UI مكتمل |
| القوائم المالية (الميزانية + قائمة النشاط) | `finance.statements.tsx` | UI مكتمل |

### 2.3 التبرعات والمتبرعون (CRM)
| الميزة | الموقع | الحالة |
|--------|--------|--------|
| المتبرعون + ملف المتبرع | `donors.tsx`, `donors.$id.tsx` | UI مكتمل |
| التبرعات | `donations.tsx` | UI مكتمل |
| الإيصالات | `receipts.tsx` | UI مكتمل |
| التبرعات المتكررة | `recurring.tsx` | UI مكتمل |
| الحملات | `campaigns.tsx` | UI مكتمل |

### 2.4 المشاريع والمستفيدون
| الميزة | الموقع | الحالة |
|--------|--------|--------|
| المشاريع والبرامج + ملف المشروع | `projects.tsx`, `projects.$id.tsx` | UI مكتمل |
| المستفيدون | `beneficiaries.tsx` | UI مكتمل |
| المساعدات | `aid.tsx` | UI مكتمل |
| تقارير التوزيع | `distribution.tsx` | UI مكتمل |

### 2.5 المنح والأوقاف
| الميزة | الموقع | الحالة |
|--------|--------|--------|
| المنح | `grants.tsx` | UI مكتمل |
| الجهات المانحة | `donor-orgs.tsx` | UI مكتمل |
| الأوقاف | `endowments.tsx` | UI مكتمل |
| عوائد الأوقاف | `endowment-returns.tsx` | UI مكتمل |

### 2.6 المشتريات والمخزون
| الميزة | الموقع | الحالة |
|--------|--------|--------|
| طلبات الشراء / عروض الأسعار / أوامر الشراء / الموردون | `procurement.*.tsx` | UI مكتمل |
| المستودعات / الأصناف / الجرد | `inventory.*.tsx` | UI مكتمل |

### 2.7 الموارد
| الميزة | الموقع | الحالة |
|--------|--------|--------|
| الأصول الثابتة | `assets.tsx` | UI مكتمل |
| الموارد البشرية (موظفين + رواتب) | `hr.tsx` | UI مكتمل |
| العضويات | `memberships.tsx` | UI مكتمل |
| الاجتماعات | `meetings.tsx` | UI مكتمل |

### 2.8 التقارير والحوكمة
| الميزة | الموقع | الحالة |
|--------|--------|--------|
| مركز التقارير | `reports.tsx` | UI مكتمل |
| سجل التدقيق (Audit Trail) | `audit.tsx` | UI مكتمل |
| الصلاحيات والأدوار | `permissions.tsx` | UI مكتمل (بدون فرض فعلي) |
| سير العمل (Workflows) | `workflows.tsx` | UI مكتمل |

### 2.9 الإعدادات
| الميزة | الموقع | الحالة |
|--------|--------|--------|
| إعدادات الجمعية / الفروع / المستخدمون / التكاملات / النسخ الاحتياطي / النظام | `settings.*.tsx` | UI مكتمل |

### 2.10 الميزات المشتركة
- **AppShell** كامل بالـ RTL (`src/components/erp/AppShell.tsx`).
- **AI Assistant Panel** (Drawer جانبي) — تصميم فقط، غير مربوط بأي مزود LLM.
- **بحث ذكي** (مربع البحث في الـ Topbar) — UI فقط.
- **خط Tajawal** + نظام تصميم OKLCH (Navy/White Enterprise) في `src/styles.css`.

---

## 3. التقنيات المستخدمة

### 3.1 Frontend
- **Framework:** TanStack Start v1 (React 19 + SSR-capable على Vite 7).
- **Routing:** TanStack Router (File-based) — يولّد `routeTree.gen.ts` تلقائياً.
- **State/Data:** TanStack Query v5 (مهيأ، لكن البيانات حالياً ثابتة من `src/data/sample.ts`).
- **Styling:** Tailwind CSS v4 (عبر `@tailwindcss/vite`) + متغيرات OKLCH في `src/styles.css`.
- **UI Library:** shadcn/ui كامل (Radix Primitives) — مدمجة جميعها تحت `src/components/ui/`.
- **Forms:** react-hook-form + zod + @hookform/resolvers.
- **Charts:** Recharts.
- **Icons:** lucide-react.
- **Fonts:** Tajawal + IBM Plex Sans Arabic (Google Fonts).
- **اللغة:** عربي فقط حالياً، RTL مفروض على مستوى `<html dir="rtl">`.
- **Design System:** نظام Tokens دلالية (primary / nav / surface / muted / success / warning / destructive / info) — لا توجد ألوان hardcoded.

### 3.2 Backend / Data Layer
- **حالياً:** **لا يوجد Backend مربوط**.
- جميع البيانات تأتي من ملف ثابت `src/data/sample.ts` (Mock Data بالعربية).
- **Lovable Cloud / Supabase:** غير مفعّل في هذا المشروع.
- **Authentication:** غير منفّذ.
- **Authorization / RLS:** صفحة الصلاحيات موجودة كـ UI فقط.
- **API Layer:** غير موجود (لا `createServerFn` ولا API routes).
- **Edge Functions:** غير موجودة.
- **Database Schema:** غير موجود (لا migrations).

---

## 4. قاعدة البيانات المستخدمة

**الواقع الحالي:** **لا توجد قاعدة بيانات.** المشروع يعمل بالكامل على بيانات in-memory من `src/data/sample.ts`.

| البند | الحالة |
|------|--------|
| Supabase | غير مستخدم |
| Neon | غير مستخدم |
| Lovable Cloud | غير مفعّل |
| Local Storage | غير مستخدم |
| Mock Data | ✅ هو المصدر الوحيد |
| Migration Files | غير موجودة |
| Seed Data | الـ Mock نفسه يلعب دور الـ Seed |
| RLS / Policies | غير موجودة |
| جاهزية للإنتاج | **0% — يلزم بناء قاعدة البيانات من الصفر** |

راجع `DATABASE_SCHEMA.md` للـ Schema المقترح.

---

## 5. هيكلة المشروع

```
src/
├── routes/              # 47 ملف صفحة (File-based routing)
│   ├── __root.tsx       # الـ Shell الجذري (HTML + Head + Fonts + RTL)
│   ├── index.tsx        # لوحة المعلومات
│   ├── finance.*.tsx    # وحدة المالية
│   ├── donors.*.tsx     # المتبرعون
│   ├── projects.*.tsx   # المشاريع
│   └── settings.*.tsx   # الإعدادات
├── components/
│   ├── erp/             # مكونات مخصصة (AppShell, ListPage)
│   └── ui/              # shadcn/ui (45+ مكون)
├── data/
│   └── sample.ts        # جميع البيانات التجريبية العربية
├── hooks/               # use-mobile.tsx
├── lib/                 # utils + error reporting
├── styles.css           # نظام التصميم Tailwind v4 + OKLCH tokens
├── router.tsx           # تهيئة Router + QueryClient
├── start.ts             # نقطة بدء TanStack Start (Middleware)
├── server.ts            # نقطة بدء SSR
└── routeTree.gen.ts     # مولّد تلقائياً — لا يُعدّل يدوياً
```

| المجلد | الوظيفة |
|--------|---------|
| `routes/` | كل ملف = صفحة، يدعم Layout عبر `__root.tsx` |
| `components/erp/` | المكونات الخاصة بالـ ERP (AppShell, Badge, Card, Table, ListPage) |
| `components/ui/` | مكتبة shadcn/ui الكاملة (لا تُعدَّل عادة) |
| `data/` | البيانات التجريبية العربية الموحدة |
| `lib/` | أدوات مساعدة (cn, error capture) |
| `styles.css` | متغيرات الـ Design System + RTL + Tailwind v4 |

---

## 6. طريقة تشغيل المشروع محلياً

### المتطلبات
- **Node.js** ≥ 20.x
- **bun** (مُفضّل، المشروع يستخدم `bun.lock`) أو npm/pnpm.

### التثبيت
```bash
bun install
# أو
npm install
```

### التشغيل
```bash
bun dev          # تطوير على http://localhost:8080
bun run build    # بناء الإنتاج
bun run preview  # معاينة الإنتاج
bun run lint     # فحص الكود
```

### النشر
المشروع مُهيأ لـ **Cloudflare Workers / Edge** عبر TanStack Start. يمكن نشره أيضاً على:
- Vercel (Edge Runtime)
- Netlify
- Node.js Server (راجع `MIGRATION_PLAN_TO_NODEJS.md`)

---

## 7. متغيرات البيئة

**حالياً المشروع لا يتطلب أي متغيرات بيئة** لأنه يعمل بـ Mock Data.

عند ربط Backend مستقبلاً، المتغيرات المتوقعة (راجع `.env.example`):

| المتغير | الوصف |
|---------|-------|
| `VITE_SUPABASE_URL` | رابط مشروع Supabase (إن استُخدم) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | المفتاح العام |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح الخدمة (Server-only) |
| `DATABASE_URL` | اتصال PostgreSQL (Neon/Supabase Direct) |
| `JWT_SECRET` | لتوقيع JWT في حال Backend مخصص |
| `LOVABLE_API_KEY` | لاستخدام AI Gateway في المساعد الذكي |
| `SMS_PROVIDER_KEY` | لتكامل الرسائل النصية |
| `WHATSAPP_API_KEY` | لتكامل واتساب |
| `ZATCA_CERT` | شهادة الفاتورة الإلكترونية السعودية |

> **مهم:** لا تضع أي مفتاح حقيقي داخل الكود. استخدم `.env` فقط مع `.env.example` في Repo.

---

## 8. ما تم وما لم يتم — جدول الحالة

| القسم | الحالة | الملاحظات |
|------|--------|-----------|
| Dashboard | ✅ مكتمل (UI) | بيانات تجريبية |
| Authentication | ❌ غير منفذ | لا توجد صفحة Login |
| Authorization / RBAC | ⚠️ UI فقط | صفحة الصلاحيات بدون فرض |
| Database | ❌ غير موجودة | Mock فقط |
| Users Management | ⚠️ UI فقط | لا يوجد CRUD حقيقي |
| Donors / Donations | ✅ مكتمل (UI) | يحتاج Backend |
| Finance / Accounting | ✅ مكتمل (UI) | يحتاج محرك قيود حقيقي |
| Projects / Beneficiaries | ✅ مكتمل (UI) | يحتاج Backend |
| Procurement / Inventory | ✅ مكتمل (UI) | يحتاج Backend |
| HR / Payroll | ✅ مكتمل (UI) | يحتاج Backend |
| Reports | ⚠️ UI فقط | بدون توليد PDF/Excel فعلي |
| Settings | ✅ مكتمل (UI) | لا تُحفظ |
| API Layer | ❌ غير منفذ | يحتاج بناء كامل |
| AI Assistant | ⚠️ UI فقط | غير مربوط بـ LLM |
| Integrations (Bank/SMS/WhatsApp/Fatoora) | ❌ غير منفذ | شاشات إعداد فقط |
| Audit Logs | ⚠️ UI فقط | لا تُولَّد فعلياً |
| Notifications | ⚠️ UI فقط | بدون realtime |
| Deployment | ⚠️ جاهز للنشر كـ Frontend | لكن بلا Backend |

**نسبة الاكتمال الإجمالية: ~35%** (الواجهة 100%، الـ Backend 0%، البيانات 0%، الأمان 0%).

---

## 9. المراحل المتبقية (Roadmap)

### Phase 1 — Cleanup & Code Review (3-5 أيام، سهل)
- مراجعة المكونات وفك أي تكرار.
- توحيد أنماط الـ ListPage.
- إضافة ESLint Rules صارمة.
- **مخاطر:** منخفضة.

### Phase 2 — Backend Foundation (2-3 أسابيع، متوسط)
- اختيار التقنية (انظر القسم 11).
- بناء Database Schema (انظر `DATABASE_SCHEMA.md`).
- بناء REST/RPC API لكل وحدة.
- **مخاطر:** تصميم خاطئ للـ Schema يكلف لاحقاً.

### Phase 3 — Authentication & Permissions (1-2 أسبوع، متوسط)
- تسجيل الدخول (Email + OTP، اختيارياً Nafath).
- إدارة الأدوار (Admin / Finance / Donor Mgr / Auditor / Viewer).
- جدول `user_roles` منفصل + `has_role()` SECURITY DEFINER.
- حماية كل صفحة عبر `_authenticated` layout.
- **مخاطر:** ثغرات صلاحيات.

### Phase 4 — Production Database (1 أسبوع، متوسط)
- Migrations + Seed + RLS Policies + Indexes.
- نسخ احتياطي يومي.
- **مخاطر:** فقدان بيانات بسبب RLS خاطئ.

### Phase 5 — Deployment (3-5 أيام، سهل-متوسط)
- اختيار Staging + Production.
- CI/CD عبر GitHub Actions.
- Domain + SSL + CDN.
- **مخاطر:** Misconfiguration للـ Env Vars.

### Phase 6 — QA & Testing (2 أسبوع، متوسط)
- Unit (Vitest) + E2E (Playwright).
- اختبار الصلاحيات.
- اختبار الأداء (k6).
- اختبار الترجمة العربية والـ RTL.
- **مخاطر:** قصور في تغطية الحالات الحرجة (محاسبة).

### Phase 7 — Compliance (1-2 أسبوع، صعب)
- ربط الفاتورة الإلكترونية (ZATCA).
- تقارير الجهات الرقابية (المركز الوطني للقطاع غير الربحي).
- **مخاطر:** متطلبات تنظيمية متغيرة.

---

## 10. كيف يمكن تحويل المشروع بالكامل إلى Node.js؟

راجع `MIGRATION_PLAN_TO_NODEJS.md` للتفاصيل الكاملة. الخلاصة:

### الإطار المُوصى به: **NestJS**
**لماذا NestJS وليس Express؟**
- المشروع كبير ومتعدد الوحدات (15+ Module) → NestJS مصمم لهذا الحجم.
- يدعم Decorators + DI + Modules بشكل أصلي → كود قابل للصيانة.
- تكامل ممتاز مع TypeORM/Prisma + Passport + Class-Validator.
- يولّد Swagger تلقائياً (مهم للحوكمة).
- Express أفضل فقط للمشاريع الصغيرة (<5 endpoints).

### خطوات التحويل
1. **Audit** للمشروع الحالي (تم في هذا التقرير).
2. **Extract Frontend** إلى Repo منفصل (Vite + React + TanStack Router Client-only).
3. **Build NestJS Backend** بـ Modules مطابقة للوحدات (Finance, Donors, Projects, HR…).
4. **Database Migration** إلى PostgreSQL (Prisma أو TypeORM).
5. **Connect Frontend ↔ Backend** عبر API Client مولّد من OpenAPI.
6. **Security Hardening:** JWT + RBAC + Helmet + Rate Limit + Audit.
7. **Deployment:** Backend على Fly.io/Railway/AWS، Frontend على Vercel/Cloudflare Pages.

---

## 11. الخيار الأفضل للبيانات — تقييم محايد

### Supabase
- **+** يجمع Auth + DB + Storage + Realtime + Edge Functions في منصة واحدة.
- **+** RLS قوي ومناسب للـ Multi-Tenancy.
- **+** سهل الإقلاع.
- **−** ربط مباشر من Frontend قد يكشف منطق الأعمال.
- **−** RLS معقد للنماذج المحاسبية المتشعبة (قيود + تدقيق).
- **مناسب الآن** كحل سريع لـ MVP/Staging.

### Neon (PostgreSQL Serverless)
- **+** PostgreSQL خالص بدون قيود، Branching ممتاز، Scale-to-zero.
- **+** الأنسب مع Backend Node.js (NestJS + Prisma).
- **−** يحتاج بناء Auth منفصل (Clerk/Auth0/Lucia) + Storage منفصل (S3/R2).
- **مناسب** للنسخة الإنتاجية بعد تحويل المشروع لـ Node.js.

### Lovable Cloud
- **+** صفر إعداد، مدمج بالمنصة، يستخدم Supabase تحت الغطاء.
- **+** ممتاز للنماذج الأولية والاختبار السريع.
- **−** يربطك بمنصة Lovable.
- **−** غير مناسب للمنتج النهائي طويل الأمد.
- **استراتيجية الخروج:** Lovable Cloud = Supabase → يمكن استخراج DB Dump ونقلها لـ Neon/Self-hosted.

### التوصية النهائية
| المرحلة | الخيار الأفضل |
|---------|---------------|
| الآن (MVP/Demo) | **Lovable Cloud** أو **Supabase Self-managed** |
| بعد التحويل لـ Node.js | **Neon + NestJS + Prisma + Clerk للـ Auth** |
| الأكثر استقراراً وأماناً | **Neon (DB) + Self-hosted NestJS + Cloudflare R2 (Storage)** |
| الأسهل صيانة | **Supabase** (كل شيء في مكان واحد) |

**توصيتنا:** ابدأ بـ Supabase للوصول السريع للإنتاج، وخطّط للهجرة إلى Neon + NestJS خلال 6-12 شهراً عند نضوج المنتج.

---

## 12. خطة الخروج الآمنة من Lovable

1. تنزيل **ZIP كامل** للمشروع (هذا الملف).
2. توثيق كل الصفحات والمكونات (تم في هذا التقرير).
3. تصدير قاعدة البيانات (`pg_dump`) إن كانت Lovable Cloud مفعّلة.
4. تصدير Environment Variables.
5. حفظ التصميم (تم في `src/styles.css` + `tailwind`).
6. تشغيل المشروع محلياً (`bun install && bun dev`).
7. رفعه إلى GitHub.
8. تنظيف أي اعتماد على Lovable (لا يوجد حالياً اعتماد مباشر).
9. بناء Backend مستقل (Phase 2 أعلاه).
10. اختبار كل صفحة.
11. نشر نسخة Staging.
12. مراجعة نهائية + إطلاق Production.

### المخاطر وكيفية تجنبها
| الخطر | الوقاية |
|-------|---------|
| فقدان البيانات التجريبية | الـ Seed محفوظ في `src/data/sample.ts` داخل ZIP |
| اختلاف بيئة التشغيل (Worker vs Node) | استخدم Adapter محايد، تجنّب APIs خاصة بـ Cloudflare |
| مشاكل في الـ Build | اختبر `bun run build` بعد كل تغيير |
| فقدان الـ Auth | لا يوجد Auth حالياً → لا خطر |
| تعارض مع المكتبات | جميع المكتبات Open Source قياسية |

---

## 13. خطة الحذف الآمن من Lovable

⚠️ **لا تحذف قبل التحقق من جميع النقاط:**
- [ ] نسخة ZIP محفوظة في 3 أماكن (Local + GitHub + Cloud Backup).
- [ ] المشروع يعمل محلياً.
- [ ] المشروع منشور على Staging مستقل.
- [ ] قاعدة البيانات منقولة ومختبرة.
- [ ] المتغيرات محفوظة بأمان (Vault/1Password).
- [ ] لا توجد أسرار داخل الكود (تم Audit).
- [ ] الفريق دُرّب على البيئة الجديدة.
- [ ] نسخ احتياطي للمستخدمين/البيانات الإنتاجية إن وُجدت.

عند اكتمال الـ Checklist فقط، يمكن تعطيل/حذف مشروع Lovable.

---

## 14. Security Checklist

- [ ] جميع الـ Secrets في `.env` وليس داخل Repo (`.gitignore` يشمل `.env`).
- [ ] HTTPS مفروض على جميع الـ Endpoints.
- [ ] CORS مقيد لـ Origins معروفة.
- [ ] JWT بـ Expiry قصير + Refresh Token.
- [ ] RBAC على مستوى الـ API وليس فقط الـ UI.
- [ ] RLS مفعّل على كل جدول حساس.
- [ ] Validation عبر Zod/class-validator في كل Endpoint.
- [ ] Sanitization للمدخلات (DOMPurify للنصوص الغنية).
- [ ] Rate Limiting (مثل `express-rate-limit` أو Cloudflare).
- [ ] Audit Logs لكل عملية مالية (إنشاء/تعديل/حذف).
- [ ] Backups يومية + اختبار الاسترجاع شهرياً.
- [ ] Helmet/CSP Headers.
- [ ] حذف بيانات Demo قبل الإنتاج.
- [ ] 2FA للأدوار الإدارية.
- [ ] Logs مركزية (Sentry / Logtail) بدون PII.
- [ ] مراجعة أمنية خارجية (Penetration Test) قبل Go-Live.

---

## 15. توصيات المطوّر النهائية

| السؤال | الجواب |
|--------|--------|
| هل المشروع جاهز للإنتاج؟ | ❌ لا، الواجهة فقط جاهزة. |
| ما الذي يحتاج تحسين أولاً؟ | بناء Backend + Auth + DB. |
| ما أخطر نقطة حالياً؟ | غياب كامل لأي طبقة أمان أو بيانات حقيقية. |
| ما أسهل مسار للتطوير؟ | تفعيل **Lovable Cloud (Supabase)** والبدء بربط الـ CRUD وحدة وحدة (ابدأ بالمتبرعين). |
| Supabase أم Node.js؟ | **Supabase للمرحلة الحالية**، Node.js (NestJS + Neon) للمرحلة الناضجة. |
| NestJS أم Express؟ | **NestJS** بلا تردد لحجم هذا المشروع. |
| Neon أم Supabase؟ | **Supabase** الآن، **Neon** بعد التحويل. |
| الخطوة التالية الأفضل؟ | (1) تفعيل Lovable Cloud → (2) بناء Auth → (3) ربط وحدة المتبرعين كـ PoC → (4) تكرار النمط لباقي الوحدات. |

---

## 17. الملخص التنفيذي للإدارة

- **ما تم إنجازه:** بُنيت واجهة كاملة لنظام ERP عربي خيري بـ **47 صفحة** متكاملة بصرياً، بنظام تصميم Enterprise احترافي (Microsoft Dynamics-inspired)، RTL أصلي، خط Tajawal، ومكونات shadcn/ui كاملة.
- **أين وصل المشروع:** مرحلة **UI Prototype عالي الجودة** — جاهز للعرض على أصحاب القرار وللاختبار البصري مع المستخدمين النهائيين.
- **هل المشروع جاهز للتسليم؟** نعم كـ **Demo / Prototype**. لا كـ **منتج إنتاجي**.
- **ما المتبقي:** كل ما يخص الـ Backend (قاعدة بيانات، API، Authentication، Authorization، Audit، التكاملات، النشر الإنتاجي).
- **نسبة الاكتمال:** **~35%** (واجهة 100%، خلفية 0%، تكاملات 0%).
- **أفضل قرار قادم:** تفعيل Lovable Cloud وبدء ربط البيانات وحدة وحدة، بالتوازي مع التخطيط لهجرة لـ NestJS + Neon خلال 6-12 شهراً.
- **التوصية النهائية:** المشروع أساس ممتاز. لا تبدأ من الصفر. ابنِ على ما هو موجود، وابدأ بـ **المتبرعين + التبرعات + المصادقة** كأول 3 وحدات لربطها بقاعدة بيانات حقيقية.

---

*أُعدّ هذا التقرير في 29 يونيو 2026 بناءً على الحالة الفعلية للكود المصدري في وقت التسليم.*
