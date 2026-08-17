CREATE OR REPLACE FUNCTION "fiscal_periods_no_overlap"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "fiscal_periods" p
    WHERE p."id" <> NEW."id"
      AND p."start_date" <= NEW."end_date"
      AND p."end_date" >= NEW."start_date"
  ) THEN
    RAISE EXCEPTION 'PERIOD_OVERLAP: fiscal period "%" overlaps an existing period', NEW."name"
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "fiscal_periods_no_overlap_trg" ON "fiscal_periods";
--> statement-breakpoint
CREATE TRIGGER "fiscal_periods_no_overlap_trg" BEFORE INSERT OR UPDATE ON "fiscal_periods" FOR EACH ROW EXECUTE FUNCTION "fiscal_periods_no_overlap"();
