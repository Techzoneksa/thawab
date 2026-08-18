-- Phase 3B.1 — Input VAT mapping safety (forward correction). Non-destructive & idempotent.
--
-- Migration 0022 (potentially already applied somewhere — production state cannot
-- be verified from here) seeded account code 110306 and silently assigned it the
-- `input_vat` system mapping, i.e. the migration itself decided the organization's
-- recoverable Input VAT account. That is not acceptable: the Input VAT GL account
-- must be an EXPLICIT, administrator-configured mapping.
--
-- This forward migration removes ONLY that auto-assigned mapping. It:
--   - does NOT delete or rewrite the 110306 account row (kept as an ordinary,
--     unmapped candidate account),
--   - does NOT touch any journal, journal line, balance, or supplier invoice,
--   - is idempotent (re-running finds no matching row and does nothing),
--   - is precise (matches only code 110306 still carrying system_key='input_vat',
--     which can only be the 0022 auto-seed — the admin mapping action did not
--     exist when 0022 ran).
--
-- After this runs, taxable supplier-invoice posting resolves the Input VAT account
-- purely by the configured `input_vat` system_key; if none is configured it fails
-- INPUT_VAT_ACCOUNT_MISSING. A Finance administrator assigns/changes the mapping
-- explicitly (finance.account_mapping.update), which atomically moves the key. Any
-- environment that had begun relying on the 0022 auto-map simply re-confirms its
-- Input VAT account once — surfaced by the VAT mapping preflight.
UPDATE "accounts"
   SET "system_key" = NULL
 WHERE "code" = '110306'
   AND "system_key" = 'input_vat';
