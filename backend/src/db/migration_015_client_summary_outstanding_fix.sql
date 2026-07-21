-- migration_015_client_summary_outstanding_fix.sql
-- client_summary.outstanding_balance previously summed every invoice with
-- status <> 'paid', which counted draft invoices as money owed. Since
-- migration_014_stored_quote_suggestion.sql auto-generates a draft invoice
-- the moment a quote is priced, this made every priced-but-unsent quote
-- inflate the client's shown balance on the Clients list / 360 view before
-- anything was ever billed.
--
-- invoices.js's own /api/invoices/stats endpoint already treats only
-- 'sent'/'overdue' as real receivables (draft and cancelled excluded) — this
-- brings the view in line with that existing, correct definition.
--
-- NOTE: migration_014_analytics_and_view_fixes.sql (applied earlier
-- alphabetically) already fixed this same view to sum total_amount
-- (post-tax) instead of amount (pre-tax) for paid_total/outstanding. This
-- migration runs after it, so it must carry that fix forward too — it is
-- NOT reintroducing the pre-tax amount column, just adding the sent/overdue
-- restriction on top of it.
-- Idempotent: safe to re-run.

BEGIN;

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
         SUM(CASE WHEN status = 'paid'             THEN total_amount ELSE 0 END) AS paid_total,
         SUM(CASE WHEN status IN ('sent','overdue') THEN total_amount ELSE 0 END) AS outstanding
    FROM invoices WHERE client_id = c.id
) i ON TRUE;

COMMIT;
