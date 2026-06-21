-- migration_005_quotation_workbench.sql
-- Adds the columns and indexes needed for:
--   1. Quotation workbench (status workflow, internal notes, staff assignment)
--   2. Confirmation flow (link a quote to the journey it became)
--   3. Customer 360° (mostly uses existing tables; nothing schema-level)
-- Idempotent: safe to re-run.

BEGIN;

-- 1. Internal notes thread on a quote (JSONB array of {author, body, ts})
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS internal_notes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Which staff member owns this quote? NULL = unassigned, anyone can pick up.
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

-- 3. The journey this quote became (NULL until accepted + converted)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES journeys(id) ON DELETE SET NULL;

-- 4. Backlink — record the quote a journey came from. Lets the customer 360
--    view group bookings by quote, and lets the booking page deep-link back.
ALTER TABLE journeys
  ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL;

-- 5. Indexes for the workbench inbox (status + age + owner filters)
CREATE INDEX IF NOT EXISTS idx_quotations_assigned_to
  ON quotations (assigned_to);
CREATE INDEX IF NOT EXISTS idx_quotations_journey_id
  ON quotations (journey_id);
CREATE INDEX IF NOT EXISTS idx_journeys_quotation_id
  ON journeys (quotation_id);
CREATE INDEX IF NOT EXISTS idx_journeys_client_id
  ON journeys (client_id);

-- 6. Helpful view: a flattened "customer summary" so the 360° page can fetch
--    everything in one query instead of joining client-side. Lifetime spend,
--    counts, last-touch dates.
CREATE OR REPLACE VIEW client_summary AS
SELECT
  c.id, c.company_name, c.email, c.phone, c.address, c.created_at,
  COALESCE(q.cnt, 0)            AS quote_count,
  COALESCE(j.cnt, 0)            AS journey_count,
  COALESCE(i.cnt, 0)            AS invoice_count,
  COALESCE(i.paid_total, 0)     AS lifetime_revenue_paid,
  COALESCE(i.outstanding, 0)    AS outstanding_balance,
  GREATEST(q.last_at, j.last_at, i.last_at) AS last_activity_at
FROM clients c
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at
    FROM quotations WHERE client_id = c.id
) q ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at
    FROM journeys WHERE client_id = c.id
) j ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt,
         MAX(created_at) AS last_at,
         SUM(CASE WHEN status = 'paid'    THEN amount ELSE 0 END) AS paid_total,
         SUM(CASE WHEN status <> 'paid'   THEN amount ELSE 0 END) AS outstanding
    FROM invoices WHERE client_id = c.id
) i ON TRUE;

COMMIT;
