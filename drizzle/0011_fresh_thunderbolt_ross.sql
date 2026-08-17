CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'journal' NOT NULL,
	"file_name" text DEFAULT '' NOT NULL,
	"file_hash" text DEFAULT '' NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"journal_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"error_summary" text DEFAULT '',
	"imported_by" text,
	"imported_at" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_hash_idx" ON "import_batches" USING btree ("file_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_source_unique_idx" ON "journal_entries" USING btree ("source_type","source_id") WHERE "status" = 'posted' AND "source_id" IS NOT NULL AND "source_type" NOT IN ('manual','journal_import','reversal');