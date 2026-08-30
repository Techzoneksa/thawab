-- Phase 5A.1 — DB defense-in-depth: an allocation amount must be a 2-decimal
-- monetary value (no fraction smaller than 0.01). The authoritative guard is the
-- service (it REJECTS sub-cent input rather than rounding it); this CHECK stops
-- any non-app writer from persisting a sub-cent amount.
--
-- The comparison expands the stored double to its exact decimal (::numeric) and
-- rejects only when it differs from its 2dp rounding by more than binary
-- float-noise (1e-6). A genuine 2dp value (e.g. 100.01, stored ~100.0100000000
-- 000016) differs from round(,2) by ~1e-15 and PASSES; a real sub-cent value
-- (100.001, 0.001) differs by >= 0.001 and is REJECTED. We keep double precision
-- (consistent with every other money column in the certified ledger) instead of
-- migrating one lone column to numeric — no project-wide monetary redesign.
--
-- Forward-only + idempotent. Preflight confirmed zero existing rows violate this
-- (0 sub-cent, 0 non-positive) before it was introduced.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_payment_allocations_amount_2dp'
  ) THEN
    ALTER TABLE "supplier_payment_allocations"
      ADD CONSTRAINT "supplier_payment_allocations_amount_2dp"
      CHECK (abs("amount" - round("amount"::numeric, 2)) < 0.000001);
  END IF;
END $$;
