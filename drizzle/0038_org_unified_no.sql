-- Organization profile: الرقم الوطني الموحد للمنشأة (unified national number,
-- 7xxxxxxxxx). Printed on documents. Additive & idempotent.
ALTER TABLE "org_settings" ADD COLUMN IF NOT EXISTS "unified_no" text DEFAULT '';
