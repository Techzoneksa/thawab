ALTER TABLE "branches" ADD COLUMN "building_no" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "street" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "district" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "postal_code" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "additional_no" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "building_no" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "street" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "district" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "city" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "postal_code" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "additional_no" text DEFAULT '';