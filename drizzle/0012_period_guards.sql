ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_valid_range" CHECK ("start_date" <= "end_date");
