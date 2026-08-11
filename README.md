# ثواب

**نظام ERP لإدارة الجمعيات والجهات الخيرية السعودية** — عربي أولاً (RTL)، نظام خاص وليس SaaS.

يغطّي: المالية (محاسبة قيد مزدوج، شجرة حسابات، دفتر أستاذ، قوائم مالية، موازنات، فترات مالية)، المتبرعون والتبرعات، المستفيدون والمساعدات، المشاريع، المشتريات، المخزون، الأصول الثابتة، والحوكمة.

## التقنيات

| التقنية | الإصدار |
| --- | --- |
| React | 19 |
| TanStack Start / Router / Query | v1 / file-based / v5 |
| قاعدة البيانات | **PostgreSQL** (فقط) |
| ORM + الهجرات | Drizzle ORM + drizzle-kit |
| التحقق | Zod |
| الواجهة | Tailwind v4 + shadcn/ui (Radix) |
| المصادقة | جلسات في قاعدة البيانات + scrypt + كوكي httpOnly |
| الخادم | Nitro (node-server) |

## المعمارية والأمن

- **مصادقة إجبارية** على كل نقاط الـ API (عدا `/api/auth` و `/api/health`) عبر `authHandler` مع فحص صلاحيات (RBAC).
- كلمات المرور بـ **scrypt**، توكِن الجلسة عشوائي تشفيرياً، والهوية تُشتق من الجلسة فقط (سجل تدقيق غير قابل للتزوير).
- تحقق **Zod** على كل عمليات الكتابة، و**transactions** حول كل الكتابات المالية.
- محاسبة **قيد مزدوج حقيقي**: كل العمليات (تبرع/مساعدة/…) تُرحَّل تلقائياً لقيود متوازنة عبر خدمة الترحيل `src/server/db/gl.ts`، مع فرض **قفل الفترات المالية** وتتبّع **الأموال المقيّدة/غير المقيّدة/الأوقاف**.
- كل قيم الحالات/الأنواع تُخزَّن كمفاتيح إنجليزية ثابتة (`src/lib/enums.ts`) وتُترجَم للعربية في الواجهة فقط (`src/lib/i18n/labels.ts`).

## الإعداد والتشغيل

المتطلبات: Node.js 22+، PostgreSQL.

```bash
npm install
cp .env.example .env      # ثم عبّئ DATABASE_URL
npm run db:migrate        # تطبيق الهجرات
npm run seed              # بيانات أولية: الأدوار + شجرة الحسابات + مستخدم مدير (كلمة مرور تُطبع مرة واحدة)
npm run dev               # تطوير على http://localhost:8080
```

> الـ seed **لا يحتوي أي بيانات تجريبية** — فقط الأدوار وشجرة حسابات جمعية قياسية وحساب مدير واحد (يُجبر على تغيير كلمة المرور عند أول دخول).

## البناء والإنتاج

```bash
npm run build            # يكتب .output/ ويعكسها إلى server/ و public/
npm run start            # node server/index.mjs
```

راجع `HOSTINGER_DEPLOYMENT.md` للنشر (استخدم preset **Node.js** لا Next.js).

## أوامر مفيدة

| الأمر | الوظيفة |
| --- | --- |
| `npm run db:generate` | توليد هجرة من تعديلات الـ schema |
| `npm run db:migrate` | تطبيق الهجرات |
| `npm run db:studio` | واجهة Drizzle Studio |
| `npm run seed` | التهيئة الأولية (idempotent) |
| `npm run check:encoding` | حارس ضد تلف الترميز (mojibake) |
| `npm run lint` | ESLint |

## هيكلة المشروع

```
src/
├── routes/               # الصفحات + مسارات الـ API (routes/api/**)
├── server/db/
│   ├── schema.ts         # مخطط Postgres الموحّد
│   ├── client.ts         # اتصال drizzle/postgres-js
│   ├── auth.ts           # المصادقة (scrypt، جلسات، RBAC)
│   ├── api-utils.ts      # authHandler / parseBody / الصلاحيات
│   ├── gl.ts             # خدمة ترحيل القيد المزدوج
│   └── errors.ts         # AppError
├── lib/
│   ├── enums.ts          # مفاتيح الحالات/الأنواع (المصدر الوحيد)
│   ├── i18n/labels.ts    # الترجمة العربية للعرض
│   ├── format.ts         # دوال التنسيق
│   └── api/              # عملاء الـ API للواجهة
drizzle/                  # ملفات الهجرات المُولّدة
scripts/                  # seed / أدوات الصيانة
```

راجع `AUDIT_REPORT.md` لتقرير الفحص الأمني/المعماري/المحاسبي الكامل الذي بُني عليه هذا الإصلاح.
