-- migration_010_kra_etr_and_driver_editable.sql
-- Client feedback additions:
--   1. Invoices carry an optional KRA eTIMS/ETR code that staff paste in from
--      the KRA portal after the invoice is signed.
--   2. (No driver schema change needed — users.email already exists.)
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS kra_etr_code VARCHAR(64);

-- Index because we'll want to search invoices by ETR code eventually
CREATE INDEX IF NOT EXISTS idx_invoices_kra_etr_code
  ON invoices (kra_etr_code)
  WHERE kra_etr_code IS NOT NULL;

COMMIT;
