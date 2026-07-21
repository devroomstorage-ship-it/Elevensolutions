-- migration_014_analytics_and_view_fixes.sql
--
-- Three corrections found during a data-engineering review:
--
--   1. analytics.refresh_analytics() computed internal_cost from
--      trucks.default_cost_per_km / fixed_daily_cost — the per-km pricing
--      model migration_012 replaced with fuel-based costing. Those two
--      columns are never populated for the real fleet (migration_013), so
--      internal_cost was 0 for every real journey and margin_pct reported
--      100% across the board. Fix: stop re-deriving cost in the ETL at all —
--      read the authoritative cost the app already computed and stored on
--      the journey itself (journeys.final_cost, falling back to
--      estimated_cost), whichever pricing model produced it. The analytics
--      layer should consume costed truth, not re-implement pricing logic.
--
--   2. truck_profitability joined journeys -> invoices directly with no
--      uniqueness guarantee on invoices.journey_id. A second invoice on the
--      same journey would fan out the join and double-count journey_costs
--      .final_cost in the SUM. Fixed with a LATERAL subquery (same pattern
--      client_summary and the analytics loader already use elsewhere).
--
--   3. client_summary summed invoices.amount (pre-tax) for
--      lifetime_revenue_paid / outstanding_balance instead of total_amount,
--      undercounting real revenue by the VAT component on every paid
--      invoice.
--
-- All three are CREATE OR REPLACE (function/views) — no data is mutated,
-- safe to re-run.

BEGIN;

-- ── Fix 1: analytics ETL cost formula ───────────────────────────────────────
CREATE OR REPLACE FUNCTION analytics.refresh_analytics(p_from DATE DEFAULT '2024-01-01')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- 1. dim_date: fill the calendar spine up to today + 365 days.
  INSERT INTO analytics.dim_date
    (date_key, date, year, quarter, month, month_name, day,
     day_of_week, day_name, week_of_year, is_weekend, is_month_end)
  SELECT
    TO_CHAR(d,'YYYYMMDD')::INT, d::DATE,
    EXTRACT(YEAR FROM d), EXTRACT(QUARTER FROM d), EXTRACT(MONTH FROM d),
    TRIM(TO_CHAR(d,'Month')), EXTRACT(DAY FROM d),
    EXTRACT(DOW FROM d), TRIM(TO_CHAR(d,'Day')),
    EXTRACT(WEEK FROM d),
    EXTRACT(DOW FROM d) IN (0,6),
    (d = DATE_TRUNC('month', d) + INTERVAL '1 month' - INTERVAL '1 day')
  FROM generate_series(p_from, CURRENT_DATE + 365, INTERVAL '1 day') d
  ON CONFLICT (date_key) DO NOTHING;

  -- 2. dim_client
  INSERT INTO analytics.dim_client (client_id, company_name, email, has_quickbooks, first_seen)
  SELECT id, company_name, email, quickbooks_id IS NOT NULL, created_at::DATE
  FROM clients
  ON CONFLICT (client_id) DO UPDATE
    SET company_name = EXCLUDED.company_name,
        email        = EXCLUDED.email,
        has_quickbooks = EXCLUDED.has_quickbooks;

  -- 3. dim_truck
  INSERT INTO analytics.dim_truck
    (truck_id, registration, name, type, make, model, capacity_tons, fuel_type, cost_per_km, fixed_daily_cost)
  SELECT id, registration, name, type, make, model, capacity_tons, fuel_type,
         default_cost_per_km, fixed_daily_cost
  FROM trucks
  ON CONFLICT (truck_id) DO UPDATE
    SET registration = EXCLUDED.registration, name = EXCLUDED.name, type = EXCLUDED.type,
        make = EXCLUDED.make, model = EXCLUDED.model, capacity_tons = EXCLUDED.capacity_tons,
        fuel_type = EXCLUDED.fuel_type, cost_per_km = EXCLUDED.cost_per_km,
        fixed_daily_cost = EXCLUDED.fixed_daily_cost;

  -- 4. dim_driver
  INSERT INTO analytics.dim_driver (driver_id, full_name, driver_status)
  SELECT u.id, u.full_name, COALESCE(dp.driver_status,'active')
  FROM users u LEFT JOIN driver_profiles dp ON dp.user_id = u.id
  WHERE u.role = 'driver'
  ON CONFLICT (driver_id) DO UPDATE
    SET full_name = EXCLUDED.full_name, driver_status = EXCLUDED.driver_status;

  -- 5. dim_route (from journeys + quotations), typical_km = median observed
  INSERT INTO analytics.dim_route (route_key, origin, destination, typical_km)
  SELECT route_key, MAX(origin), MAX(destination),
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY km)
  FROM (
    SELECT LOWER(TRIM(origin))||'→'||LOWER(TRIM(destination)) AS route_key,
           origin, destination, distance_km AS km
    FROM journeys WHERE origin IS NOT NULL AND destination IS NOT NULL
    UNION ALL
    SELECT LOWER(TRIM(origin))||'→'||LOWER(TRIM(destination)),
           origin, destination, NULL
    FROM quotations WHERE origin IS NOT NULL AND destination IS NOT NULL
  ) r
  GROUP BY route_key
  ON CONFLICT (route_key) DO UPDATE SET typical_km = EXCLUDED.typical_km;

  -- 6. dim_service
  INSERT INTO analytics.dim_service (service_id, slug, title)
  SELECT id, slug, title FROM site_services
  ON CONFLICT (service_id) DO UPDATE SET slug = EXCLUDED.slug, title = EXCLUDED.title;

  -- 7. fct_journey (rebuild — small volumes; truncate keeps logic simple/correct)
  --    internal_cost now reads the journey's own stored cost (whichever
  --    pricing model produced it) instead of re-deriving from truck rate
  --    columns that the fuel-based costing engine no longer maintains.
  TRUNCATE analytics.fct_journey;
  INSERT INTO analytics.fct_journey (
    journey_id, reference, date_key, client_sk, truck_sk, driver_sk, route_sk, status,
    distance_km, cargo_weight_tons, estimated_cost, final_cost, invoice_amount,
    estimated_duration_min, actual_duration_min,
    revenue, internal_cost, margin, margin_pct, cost_per_km_effective,
    capacity_utilisation, is_on_time, is_delivered, is_cancelled, lead_time_days, day_of_week)
  SELECT
    j.id, j.reference,
    TO_CHAR(j.scheduled_date,'YYYYMMDD')::INT,
    dc.client_sk, dt.truck_sk, dd.driver_sk, dr.route_sk,
    j.status,
    j.distance_km, j.cargo_weight_tons, j.estimated_cost, j.final_cost,
    inv.total_amount,
    j.estimated_duration_min,
    CASE WHEN j.actual_pickup_at IS NOT NULL AND j.actual_delivery_at IS NOT NULL
         THEN EXTRACT(EPOCH FROM (j.actual_delivery_at - j.actual_pickup_at))/60 END::INT,
    -- revenue: paid invoice only
    COALESCE(CASE WHEN inv.status = 'paid' THEN inv.total_amount END, 0),
    -- internal cost: the journey's own costed value, not re-derived
    COALESCE(j.final_cost, j.estimated_cost, 0),
    -- margin
    COALESCE(CASE WHEN inv.status='paid' THEN inv.total_amount END,0)
      - COALESCE(j.final_cost, j.estimated_cost, 0),
    -- margin_pct (guard divide-by-zero)
    CASE WHEN COALESCE(CASE WHEN inv.status='paid' THEN inv.total_amount END,0) > 0
         THEN ROUND((COALESCE(CASE WHEN inv.status='paid' THEN inv.total_amount END,0)
              - COALESCE(j.final_cost, j.estimated_cost, 0))
              / NULLIF(CASE WHEN inv.status='paid' THEN inv.total_amount END,0), 3) END,
    CASE WHEN j.distance_km > 0 THEN ROUND(COALESCE(j.final_cost,j.estimated_cost,0)/j.distance_km,2) END,
    CASE WHEN t.capacity_tons > 0 THEN ROUND(j.cargo_weight_tons/t.capacity_tons,3) END,
    CASE WHEN j.actual_delivery_at IS NOT NULL AND j.scheduled_delivery_at IS NOT NULL
         THEN j.actual_delivery_at <= j.scheduled_delivery_at END,
    j.status = 'delivered',
    j.status = 'cancelled',
    (j.scheduled_date - j.created_at::DATE),
    EXTRACT(DOW FROM j.scheduled_date)
  FROM journeys j
  LEFT JOIN trucks t              ON j.truck_id = t.id
  LEFT JOIN analytics.dim_client dc ON dc.client_id = j.client_id
  LEFT JOIN analytics.dim_truck  dt ON dt.truck_id  = j.truck_id
  LEFT JOIN analytics.dim_driver dd ON dd.driver_id = j.driver_id
  LEFT JOIN analytics.dim_route  dr ON dr.route_key = LOWER(TRIM(j.origin))||'→'||LOWER(TRIM(j.destination))
  LEFT JOIN LATERAL (
    SELECT total_amount, status FROM invoices WHERE journey_id = j.id ORDER BY created_at DESC LIMIT 1
  ) inv ON TRUE;

  -- 8. fct_quotation
  TRUNCATE analytics.fct_quotation;
  INSERT INTO analytics.fct_quotation
    (quotation_id, reference, date_key, client_sk, route_sk, status, amount, weight_tons, is_accepted, is_from_web)
  SELECT q.id, q.reference, TO_CHAR(q.created_at,'YYYYMMDD')::INT,
         dc.client_sk, dr.route_sk, q.status, q.amount, q.weight_tons,
         q.status = 'accepted', q.contact_email IS NOT NULL
  FROM quotations q
  LEFT JOIN analytics.dim_client dc ON dc.client_id = q.client_id
  LEFT JOIN analytics.dim_route  dr ON dr.route_key = LOWER(TRIM(q.origin))||'→'||LOWER(TRIM(q.destination));

  -- 9. fct_invoice
  TRUNCATE analytics.fct_invoice;
  INSERT INTO analytics.fct_invoice
    (invoice_id, reference, date_key, client_sk, status, total_amount, is_paid, days_to_pay)
  SELECT i.id, i.reference, TO_CHAR(i.issue_date,'YYYYMMDD')::INT,
         dc.client_sk, i.status, i.total_amount, i.status = 'paid',
         CASE WHEN i.paid_date IS NOT NULL THEN (i.paid_date - i.issue_date) END
  FROM invoices i
  LEFT JOIN analytics.dim_client dc ON dc.client_id = i.client_id;

  -- 10. fct_fleet_daily snapshot (one row per truck per active day)
  TRUNCATE analytics.fct_fleet_daily;
  INSERT INTO analytics.fct_fleet_daily (date_key, truck_sk, journeys_count, km_driven, revenue, was_active)
  SELECT f.date_key, f.truck_sk, COUNT(*), COALESCE(SUM(f.distance_km),0),
         COALESCE(SUM(f.revenue),0), TRUE
  FROM analytics.fct_journey f
  WHERE f.truck_sk IS NOT NULL AND f.date_key IS NOT NULL
  GROUP BY f.date_key, f.truck_sk;
END;
$$;

-- ── Fix 2: truck_profitability — avoid invoice fan-out double-counting ──────
CREATE OR REPLACE VIEW truck_profitability AS
SELECT
  t.id                                   AS truck_id,
  t.registration,
  t.name,
  COUNT(j.id)                            AS total_journeys,
  COALESCE(SUM(j.distance_km), 0)        AS total_distance_km,
  COALESCE(SUM(inv.total_amount), 0)     AS total_revenue,
  COALESCE(SUM(jc.final_cost), 0)        AS total_cost,
  COALESCE(SUM(inv.total_amount), 0)
    - COALESCE(SUM(jc.final_cost), 0)    AS profit
FROM trucks t
LEFT JOIN journeys j       ON j.truck_id = t.id AND j.status = 'delivered'
LEFT JOIN journey_costs jc ON jc.journey_id = j.id
LEFT JOIN LATERAL (
  SELECT SUM(total_amount) AS total_amount
  FROM invoices WHERE journey_id = j.id AND status = 'paid'
) inv ON TRUE
GROUP BY t.id, t.registration, t.name;

-- ── Fix 3: client_summary — count full invoice total, not pre-tax amount ───
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
         SUM(CASE WHEN status = 'paid'    THEN total_amount ELSE 0 END) AS paid_total,
         SUM(CASE WHEN status <> 'paid'   THEN total_amount ELSE 0 END) AS outstanding
    FROM invoices WHERE client_id = c.id
) i ON TRUE;

COMMIT;
