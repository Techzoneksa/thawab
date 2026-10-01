-- Real backups: each backup_records row now points at an actual server-side
-- dump file with an integrity hash and content stats. Additive & idempotent.
ALTER TABLE "backup_records" ADD COLUMN IF NOT EXISTS "file_name" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "backup_records" ADD COLUMN IF NOT EXISTS "size_bytes" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "backup_records" ADD COLUMN IF NOT EXISTS "sha256" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "backup_records" ADD COLUMN IF NOT EXISTS "tables_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "backup_records" ADD COLUMN IF NOT EXISTS "rows_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "backup_records" ADD COLUMN IF NOT EXISTS "error" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "backup_records" ADD COLUMN IF NOT EXISTS "restored_from" text DEFAULT '';
