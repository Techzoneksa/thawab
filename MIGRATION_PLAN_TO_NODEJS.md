# خطة تحويل ثواب إلى Node.js Backend

> هذه خطة مستقبلية — لا تنفذ الآن بدون موافقة.

## الإطار المُوصى به: **NestJS**

نظراً لكبر المشروع وتعدد وحداته (15+)، NestJS هو الخيار الأفضل:

- Decorators + DI + Modules
- تكامل مع Prisma + Passport + Class-Validator
- Swagger تلقائي
- مناسب لحجم هذا المشروع

## المراحل

### Phase 1 — Foundation
- NestJS project scaffold
- Prisma Schema لجميع الجداول
- PostgreSQL على Neon
- JWT Auth (Access + Refresh Tokens)

### Phase 2 — Core Modules
- Authentication (Email + OTP)
- RBAC (Admin / Finance / Donor Mgr / Auditor / Viewer)
- دليل الحسابات (Chart of Accounts)
- قيود اليومية (Journal Entries)
- المتبرعون والتبرعات

### Phase 3 — All Modules
- المشاريع والمستفيدون
- المشتريات والمخزون
- المنح والأوقاف
- الأصول الثابتة
- الموارد البشرية
- التقارير

### Phase 4 — Production Hardening
- Audit Logs
- Rate Limiting
- HTTPS/CORS/Helmet
- Backups
- Monitoring (Sentry)

## التوصية

ابدأ بـ Supabase للوصول السريع، ثم هاجر إلى Neon + NestJS عند نضوج المنتج.
