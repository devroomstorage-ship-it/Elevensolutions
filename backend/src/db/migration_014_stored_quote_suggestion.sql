-- migration_014_stored_quote_suggestion.sql
-- Persist the fuel-based price suggestion on the quotation itself (so
-- opening a quote never re-triggers a Google/costing calculation — it just
-- reads what was last calculated), and link a companion draft invoice that
-- reflects the same figure for finance's visibility ahead of billing.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ── Stored suggestion — written once by POST /quotes/:id/calculate-price,
--    read thereafter with zero recomputation until an input changes ────────
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS suggested_price      DECIMAL(12,2);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS suggested_breakdown  JSONB;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS suggested_truck_id   UUID REFERENCES trucks(id);
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS suggested_at         TIMESTAMPTZ;

-- ── Draft invoice link — a quotation gets at most one auto-generated draft
--    invoice, kept in sync with the suggestion. Nullable + UNIQUE lets every
--    other invoice (journey-based, manually created) stay unaffected: only
--    one row per quotation is allowed, unlimited NULLs otherwise ──────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_quotation_id
  ON invoices (quotation_id) WHERE quotation_id IS NOT NULL;

COMMIT;
