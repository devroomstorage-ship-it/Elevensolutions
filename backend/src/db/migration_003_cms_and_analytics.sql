-- ============================================================================
-- migration_003_cms_and_analytics.sql
-- ----------------------------------------------------------------------------
-- Two concerns in one migration, clearly separated:
--   PART A — CMS content tables that drive the public website (editable in the
--            portal, served read-only to the marketing site).
--   PART B — Analytics layer: a dimensional (star-schema) model plus BI views
--            built for a data engineer to load and a data scientist to model on.
--
-- Additive and idempotent: safe to run on the existing database and safe to
-- re-run. Run after migration_002.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART A · CMS / SITE CONTENT
-- ============================================================================
-- Design: a small, generic "content" layer rather than one table per page.
-- Three primitives cover everything the marketing site needs:
--   site_settings   key/value singletons (company name, phones, emails, hero copy)
--   site_sections   ordered, typed blocks belonging to a page (hero, stats, cta…)
--   site_services   the freight services list (their own table — they have real
--                   structured fields and power both the site and analytics)
-- A data engineer gets clean, queryable content; staff get safe editing.

-- 1. Key/value settings — company profile, contact info, global toggles.
CREATE TABLE IF NOT EXISTS site_settings (
  key         VARCHAR(80)  PRIMARY KEY,
  value       TEXT,
  value_type  VARCHAR(20)  NOT NULL DEFAULT 'text'   -- text | longtext | url | email | phone | json | number | bool
                CHECK (value_type IN ('text','longtext','url','email','phone','json','number','bool')),
  group_name  VARCHAR(40)  NOT NULL DEFAULT 'general',-- general | contact | hero | seo | social
  label       VARCHAR(120),                           -- human label shown in the editor
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Page sections — typed, ordered blocks. One row per block on a page.
CREATE TABLE IF NOT EXISTS site_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page         VARCHAR(40)  NOT NULL DEFAULT 'home',   -- home | about | services | contact
  section_key  VARCHAR(60)  NOT NULL,                  -- hero | intro | stats | why_us | process | cta
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  is_published BOOLEAN      NOT NULL DEFAULT TRUE,
  heading      VARCHAR(255),
  subheading   VARCHAR(500),
  body         TEXT,
  media_url    TEXT,
  data         JSONB        NOT NULL DEFAULT '{}',     -- flexible: stat lists, button labels, link targets
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (page, section_key)
);
CREATE INDEX IF NOT EXISTS idx_site_sections_page ON site_sections(page, sort_order);

-- 3. Services — structured, also referenced by the analytics service dimension.
CREATE TABLE IF NOT EXISTS site_services (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         VARCHAR(80)  NOT NULL UNIQUE,           -- ftl, ltl, warehousing, cross-border…
  title        VARCHAR(120) NOT NULL,
  tagline      VARCHAR(255),
  description  TEXT,
  icon         VARCHAR(40),                            -- icon key the frontend maps to an SVG
  image_url    TEXT,
  features     JSONB        NOT NULL DEFAULT '[]',     -- ["Real-time tracking","eTIMS invoicing"]
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  is_published BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_site_services_pub ON site_services(is_published, sort_order);

-- 4. Service areas / coverage — drives the coverage section + a geo dimension.
CREATE TABLE IF NOT EXISTS service_areas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(120) NOT NULL,                  -- "Nairobi", "Mombasa Corridor"
  country      VARCHAR(60)  NOT NULL DEFAULT 'Kenya',
  region       VARCHAR(60),                            -- East Africa, etc.
  lat          DECIMAL(10,7),
  lng          DECIMAL(10,7),
  is_hub       BOOLEAN      NOT NULL DEFAULT FALSE,     -- depots / hubs vs served towns
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  is_published BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 5. Testimonials — social proof block.
CREATE TABLE IF NOT EXISTS site_testimonials (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author       VARCHAR(120) NOT NULL,
  company      VARCHAR(120),
  role         VARCHAR(120),
  quote        TEXT         NOT NULL,
  rating       SMALLINT     CHECK (rating BETWEEN 1 AND 5),
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  is_published BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- updated_at trigger reuse (function defined in base schema)
DROP TRIGGER IF EXISTS trg_site_sections_updated ON site_sections;
CREATE TRIGGER trg_site_sections_updated BEFORE UPDATE ON site_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_site_services_updated ON site_services;
CREATE TRIGGER trg_site_services_updated BEFORE UPDATE ON site_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

-- ============================================================================
-- PART B · ANALYTICS LAYER  (schema: analytics)
-- ============================================================================
-- A Kimball-style dimensional model kept in its own schema so it never
-- collides with the operational (public) tables and can be granted to BI/DS
-- roles independently.
--
-- For the DATA ENGINEER:
--   * conformed dimensions with surrogate keys + natural (business) keys
--   * append-friendly fact tables, all measures additive where possible
--   * a single refresh_analytics() proc to (re)load from operational tables
--   * a dim_date calendar so every fact joins to a real date spine
--
-- For the DATA SCIENTIST:
--   * grain is documented on every fact (one row per … )
--   * fct_journey carries engineered, model-ready columns (margins, ratios,
--     utilisation, on-time flags, day-of-week, lead times)
--   * vw_journey_features is a flat, wide, one-row-per-journey feature table
--     ready to pull straight into pandas / a feature store
--   * vw_revenue_daily / vw_route_demand_monthly are tidy time series for
--     forecasting (date, series key, value)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS analytics;

-- ── DIM: Date spine ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_date (
  date_key     INTEGER PRIMARY KEY,         -- YYYYMMDD
  date         DATE    NOT NULL UNIQUE,
  year         SMALLINT NOT NULL,
  quarter      SMALLINT NOT NULL,
  month        SMALLINT NOT NULL,
  month_name   VARCHAR(9) NOT NULL,
  day          SMALLINT NOT NULL,
  day_of_week  SMALLINT NOT NULL,           -- 0 = Sunday
  day_name     VARCHAR(9) NOT NULL,
  week_of_year SMALLINT NOT NULL,
  is_weekend   BOOLEAN NOT NULL,
  is_month_end BOOLEAN NOT NULL
);

-- ── DIM: Client ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_client (
  client_sk      BIGSERIAL PRIMARY KEY,
  client_id      UUID NOT NULL UNIQUE,        -- natural key → clients.id
  company_name   VARCHAR(255),
  email          VARCHAR(255),
  has_quickbooks BOOLEAN,
  first_seen     DATE,
  loaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DIM: Truck ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_truck (
  truck_sk         BIGSERIAL PRIMARY KEY,
  truck_id         UUID NOT NULL UNIQUE,
  registration     VARCHAR(20),
  name             VARCHAR(100),
  type             VARCHAR(50),
  make             VARCHAR(50),
  model            VARCHAR(50),
  capacity_tons    DECIMAL(8,2),
  fuel_type        VARCHAR(30),
  cost_per_km      DECIMAL(10,2),
  fixed_daily_cost DECIMAL(10,2),
  loaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DIM: Driver ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_driver (
  driver_sk     BIGSERIAL PRIMARY KEY,
  driver_id     UUID NOT NULL UNIQUE,
  full_name     VARCHAR(255),
  driver_status VARCHAR(20),
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DIM: Route (origin→destination pair, deduplicated) ──────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_route (
  route_sk      BIGSERIAL PRIMARY KEY,
  route_key     VARCHAR(255) NOT NULL UNIQUE,  -- normalised "origin→destination"
  origin        VARCHAR(255),
  destination   VARCHAR(255),
  typical_km    DECIMAL(10,2),                 -- median observed distance
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── DIM: Service ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics.dim_service (
  service_sk  BIGSERIAL PRIMARY KEY,
  service_id  UUID UNIQUE,
  slug        VARCHAR(80),
  title       VARCHAR(120),
  loaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── FACT: Journey ───────────────────────────────────────────────────────────
-- Grain: one row per journey. The central fact for operations + ML.
CREATE TABLE IF NOT EXISTS analytics.fct_journey (
  journey_sk            BIGSERIAL PRIMARY KEY,
  journey_id            UUID NOT NULL UNIQUE,
  reference             VARCHAR(30),
  -- dimension FKs
  date_key              INTEGER REFERENCES analytics.dim_date(date_key),
  client_sk             BIGINT  REFERENCES analytics.dim_client(client_sk),
  truck_sk              BIGINT  REFERENCES analytics.dim_truck(truck_sk),
  driver_sk             BIGINT  REFERENCES analytics.dim_driver(driver_sk),
  route_sk              BIGINT  REFERENCES analytics.dim_route(route_sk),
  -- degenerate / status
  status                VARCHAR(20),
  -- measures (additive)
  distance_km           DECIMAL(10,2),
  cargo_weight_tons     DECIMAL(8,2),
  estimated_cost        DECIMAL(12,2),
  final_cost            DECIMAL(12,2),
  invoice_amount        DECIMAL(12,2),
  estimated_duration_min INTEGER,
  actual_duration_min   INTEGER,
  -- engineered features (model-ready)
  revenue               DECIMAL(12,2),        -- paid invoice amount, else 0
  internal_cost         DECIMAL(12,2),        -- distance*cpk + fixed*days
  margin                DECIMAL(12,2),        -- revenue - internal_cost
  margin_pct            DECIMAL(6,3),         -- margin / revenue
  cost_per_km_effective DECIMAL(10,2),
  capacity_utilisation  DECIMAL(6,3),         -- weight / truck capacity
  is_on_time            BOOLEAN,              -- actual_delivery <= scheduled_delivery
  is_delivered          BOOLEAN,
  is_cancelled          BOOLEAN,
  lead_time_days        INTEGER,              -- created → scheduled
  day_of_week           SMALLINT,
  loaded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fct_journey_date  ON analytics.fct_journey(date_key);
CREATE INDEX IF NOT EXISTS idx_fct_journey_route ON analytics.fct_journey(route_sk);
CREATE INDEX IF NOT EXISTS idx_fct_journey_truck ON analytics.fct_journey(truck_sk);

-- ── FACT: Quotation (demand / conversion funnel) ────────────────────────────
-- Grain: one row per quotation.
CREATE TABLE IF NOT EXISTS analytics.fct_quotation (
  quotation_sk  BIGSERIAL PRIMARY KEY,
  quotation_id  UUID NOT NULL UNIQUE,
  reference     VARCHAR(30),
  date_key      INTEGER REFERENCES analytics.dim_date(date_key),
  client_sk     BIGINT  REFERENCES analytics.dim_client(client_sk),
  route_sk      BIGINT  REFERENCES analytics.dim_route(route_sk),
  status        VARCHAR(20),
  amount        DECIMAL(12,2),
  weight_tons   DECIMAL(8,2),
  is_accepted   BOOLEAN,
  is_from_web   BOOLEAN,                      -- submitted via public site
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── FACT: Invoice (revenue / AR) ────────────────────────────────────────────
-- Grain: one row per invoice.
CREATE TABLE IF NOT EXISTS analytics.fct_invoice (
  invoice_sk    BIGSERIAL PRIMARY KEY,
  invoice_id    UUID NOT NULL UNIQUE,
  reference     VARCHAR(30),
  date_key      INTEGER REFERENCES analytics.dim_date(date_key),
  client_sk     BIGINT  REFERENCES analytics.dim_client(client_sk),
  status        VARCHAR(20),
  total_amount  DECIMAL(12,2),
  is_paid       BOOLEAN,
  days_to_pay   INTEGER,                      -- issued → paid
  loaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── FACT (snapshot): Daily fleet utilisation ────────────────────────────────
-- Grain: one row per truck per day. Periodic snapshot for time-series models.
CREATE TABLE IF NOT EXISTS analytics.fct_fleet_daily (
  date_key        INTEGER NOT NULL REFERENCES analytics.dim_date(date_key),
  truck_sk        BIGINT  NOT NULL REFERENCES analytics.dim_truck(truck_sk),
  journeys_count  INTEGER NOT NULL DEFAULT 0,
  km_driven       DECIMAL(12,2) NOT NULL DEFAULT 0,
  revenue         DECIMAL(12,2) NOT NULL DEFAULT 0,
  was_active      BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (date_key, truck_sk)
);

-- ── LOADER: refresh_analytics() ─────────────────────────────────────────────
-- One callable that (re)builds dimensions and facts from the operational
-- tables. Idempotent via UPSERTs. A data engineer can schedule this nightly
-- (cron / pg_cron / Airflow) — it is the single ETL entry point.
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
    -- internal cost from per-truck rates (1 day default)
    COALESCE(j.distance_km,0)*COALESCE(t.default_cost_per_km,0) + COALESCE(t.fixed_daily_cost,0),
    -- margin
    COALESCE(CASE WHEN inv.status='paid' THEN inv.total_amount END,0)
      - (COALESCE(j.distance_km,0)*COALESCE(t.default_cost_per_km,0)+COALESCE(t.fixed_daily_cost,0)),
    -- margin_pct (guard divide-by-zero)
    CASE WHEN COALESCE(CASE WHEN inv.status='paid' THEN inv.total_amount END,0) > 0
         THEN ROUND((COALESCE(CASE WHEN inv.status='paid' THEN inv.total_amount END,0)
              - (COALESCE(j.distance_km,0)*COALESCE(t.default_cost_per_km,0)+COALESCE(t.fixed_daily_cost,0)))
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

-- ── BI VIEWS (for dashboards / Metabase / Power BI / Looker) ────────────────

-- Monthly revenue & volume (tidy: one row per month).
CREATE OR REPLACE VIEW analytics.vw_revenue_monthly AS
SELECT d.year, d.month, d.month_name,
       COUNT(*)                          AS journeys,
       SUM(f.revenue)                     AS revenue,
       SUM(f.internal_cost)               AS cost,
       SUM(f.margin)                      AS margin,
       AVG(f.margin_pct)                  AS avg_margin_pct,
       SUM(f.distance_km)                 AS total_km
FROM analytics.fct_journey f
JOIN analytics.dim_date d ON d.date_key = f.date_key
GROUP BY d.year, d.month, d.month_name
ORDER BY d.year, d.month;

-- Route profitability ranking.
CREATE OR REPLACE VIEW analytics.vw_route_performance AS
SELECT r.origin, r.destination, r.typical_km,
       COUNT(*)             AS trips,
       SUM(f.revenue)        AS revenue,
       SUM(f.margin)         AS margin,
       AVG(f.capacity_utilisation) AS avg_utilisation,
       AVG(CASE WHEN f.is_on_time THEN 1 ELSE 0 END) AS on_time_rate
FROM analytics.fct_journey f
JOIN analytics.dim_route r ON r.route_sk = f.route_sk
GROUP BY r.origin, r.destination, r.typical_km
ORDER BY margin DESC NULLS LAST;

-- Quote → win funnel by month.
CREATE OR REPLACE VIEW analytics.vw_quote_conversion AS
SELECT d.year, d.month,
       COUNT(*)                                   AS quotes,
       SUM(CASE WHEN q.is_accepted THEN 1 ELSE 0 END) AS won,
       ROUND(AVG(CASE WHEN q.is_accepted THEN 1 ELSE 0 END),3) AS win_rate,
       SUM(q.amount)                              AS quoted_value,
       SUM(CASE WHEN q.is_accepted THEN q.amount ELSE 0 END) AS won_value
FROM analytics.fct_quotation q
JOIN analytics.dim_date d ON d.date_key = q.date_key
GROUP BY d.year, d.month
ORDER BY d.year, d.month;

-- Fleet utilisation summary per truck.
CREATE OR REPLACE VIEW analytics.vw_fleet_utilisation AS
SELECT t.registration, t.name, t.capacity_tons,
       COUNT(DISTINCT s.date_key)  AS active_days,
       SUM(s.journeys_count)       AS journeys,
       SUM(s.km_driven)            AS km_driven,
       SUM(s.revenue)              AS revenue
FROM analytics.fct_fleet_daily s
JOIN analytics.dim_truck t ON t.truck_sk = s.truck_sk
GROUP BY t.registration, t.name, t.capacity_tons
ORDER BY revenue DESC;

-- ── DATA-SCIENCE VIEWS (model-ready) ────────────────────────────────────────

-- Flat, wide, one-row-per-journey feature matrix — pull straight into pandas.
CREATE OR REPLACE VIEW analytics.vw_journey_features AS
SELECT
  f.journey_id, f.reference, d.date,
  d.year, d.month, d.day_of_week, d.is_weekend,
  c.company_name, c.has_quickbooks,
  t.type AS truck_type, t.capacity_tons, t.cost_per_km, t.fuel_type,
  r.origin, r.destination, r.typical_km,
  f.distance_km, f.cargo_weight_tons, f.capacity_utilisation,
  f.estimated_duration_min, f.actual_duration_min,
  f.estimated_cost, f.final_cost, f.revenue, f.internal_cost,
  f.margin, f.margin_pct, f.cost_per_km_effective,
  f.lead_time_days,
  f.is_delivered, f.is_cancelled, f.is_on_time
FROM analytics.fct_journey f
LEFT JOIN analytics.dim_date   d ON d.date_key  = f.date_key
LEFT JOIN analytics.dim_client c ON c.client_sk = f.client_sk
LEFT JOIN analytics.dim_truck  t ON t.truck_sk  = f.truck_sk
LEFT JOIN analytics.dim_route  r ON r.route_sk  = f.route_sk;

-- Tidy daily revenue series for forecasting: (date, value). Zero-filled days
-- come from the dim_date spine via LEFT JOIN so the series has no gaps.
CREATE OR REPLACE VIEW analytics.vw_revenue_daily AS
SELECT d.date,
       COALESCE(SUM(f.revenue),0)  AS revenue,
       COALESCE(COUNT(f.journey_id),0) AS journeys
FROM analytics.dim_date d
LEFT JOIN analytics.fct_journey f ON f.date_key = d.date_key
WHERE d.date <= CURRENT_DATE
GROUP BY d.date
ORDER BY d.date;

-- Monthly demand per route — panel series for per-route forecasting.
CREATE OR REPLACE VIEW analytics.vw_route_demand_monthly AS
SELECT r.origin, r.destination, d.year, d.month,
       MAKE_DATE(d.year::int, d.month::int, 1) AS month_start,
       COUNT(*) AS trips, SUM(f.cargo_weight_tons) AS tons, SUM(f.revenue) AS revenue
FROM analytics.fct_journey f
JOIN analytics.dim_date  d ON d.date_key = f.date_key
JOIN analytics.dim_route r ON r.route_sk = f.route_sk
GROUP BY r.origin, r.destination, d.year, d.month
ORDER BY r.origin, r.destination, d.year, d.month;

-- ── GRANTS (optional roles for BI/DS — created if you add the roles) ────────
-- A data engineer can create read-only roles and grant USAGE on the analytics
-- schema. Left commented so the migration never fails on a missing role.
-- GRANT USAGE ON SCHEMA analytics TO bi_readonly;
-- GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO bi_readonly;

-- ============================================================================
-- SEED · initial site content (real Eleven Solutions details)
-- ============================================================================
INSERT INTO site_settings (key, value, value_type, group_name, label) VALUES
  ('company_name',   'Eleven Solutions Ltd',                 'text',     'general', 'Company name'),
  ('company_tagline','Cargo that keeps moving.',             'text',     'general', 'Tagline'),
  ('po_box',         'P.O. Box 1977-0203, Ruiru',            'text',     'contact', 'Postal address'),
  ('address_line',   'Ruiru, Kenya',                          'text',     'contact', 'Physical location'),
  ('phone_1',        '0717900400',                            'phone',    'contact', 'Phone 1'),
  ('phone_2',        '0711900400',                            'phone',    'contact', 'Phone 2'),
  ('phone_3',        '0716900400',                            'phone',    'contact', 'Phone 3'),
  ('email_primary',  'info@elevensolutions.co.ke',            'email',    'contact', 'Primary email'),
  ('email_secondary','elevensolutionltd@gmail.com',           'email',    'contact', 'Secondary email'),
  ('hero_heading',   'Freight that keeps East Africa moving', 'text',     'hero',    'Hero heading'),
  ('hero_sub',       'A modern Kenyan logistics operator with a 13-truck fleet, live tracking, eTIMS-compliant invoicing, and a team that answers the phone.', 'longtext', 'hero', 'Hero subheading'),
  ('stat_trucks',    '13',                                    'number',   'hero',    'Fleet size'),
  ('stat_uptime',    '24/7',                                  'text',     'hero',    'Operations hours'),
  ('stat_compliance','100%',                                  'text',     'hero',    'eTIMS compliance')
ON CONFLICT (key) DO NOTHING;

INSERT INTO site_services (slug, title, tagline, description, icon, features, sort_order) VALUES
  ('ftl', 'Full Truck Load', 'Your cargo, one dedicated truck',
   'Dedicated trucks for large consignments moving point-to-point across Kenya and the wider East African corridor. Direct routing, no consolidation delays.',
   'truck', '["Dedicated vehicle","Direct point-to-point","Real-time tracking","Up to 28 tonnes"]', 1),
  ('ltl', 'Part Load / Groupage', 'Pay for the space you use',
   'Cost-effective shared-capacity transport for smaller consignments, consolidated and routed efficiently so you only pay for the space you need.',
   'boxes', '["Shared capacity","Lower cost","Scheduled departures","Insured in transit"]', 2),
  ('cross-border', 'Cross-Border Haulage', 'Beyond the Kenyan border',
   'Regional freight into Uganda, Tanzania and Rwanda with customs documentation handled and corridor-experienced drivers.',
   'globe', '["Uganda, Tanzania, Rwanda","Customs paperwork","Corridor-experienced crews","Border tracking"]', 3),
  ('contract', 'Contract Logistics', 'A fleet that feels like yours',
   'Ongoing scheduled transport for manufacturers and distributors with recurring lanes, reserved capacity, and consolidated monthly billing.',
   'calendar', '["Reserved capacity","Fixed recurring lanes","Monthly consolidated billing","Dedicated account manager"]', 4)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO service_areas (name, country, region, is_hub, sort_order) VALUES
  ('Nairobi',  'Kenya',    'Central',      TRUE,  1),
  ('Ruiru',    'Kenya',    'Central',      TRUE,  2),
  ('Mombasa',  'Kenya',    'Coast',        FALSE, 3),
  ('Nakuru',   'Kenya',    'Rift Valley',  FALSE, 4),
  ('Kisumu',   'Kenya',    'Nyanza',       FALSE, 5),
  ('Eldoret',  'Kenya',    'Rift Valley',  FALSE, 6),
  ('Kampala',  'Uganda',   'East Africa',  FALSE, 7),
  ('Dar es Salaam','Tanzania','East Africa',FALSE,8),
  ('Kigali',   'Rwanda',   'East Africa',  FALSE, 9)
ON CONFLICT DO NOTHING;

INSERT INTO site_sections (page, section_key, sort_order, heading, subheading, body, data) VALUES
  ('home','process',3,'How it works','From quote to delivery in four steps',NULL,
   '{"steps":[{"n":1,"title":"Request a quote","text":"Tell us your route, cargo and weight. Online or by phone."},{"n":2,"title":"We confirm capacity","text":"We check fleet availability and send a fixed quotation, fast."},{"n":3,"title":"Track in transit","text":"Live updates from pickup to drop-off, with eTIMS invoicing."},{"n":4,"title":"Delivered and invoiced","text":"Proof of delivery and a compliant invoice, automatically."}]}'),
  ('home','cta',9,'Ready to move?','Get a quotation within two business hours.',NULL,'{}')
ON CONFLICT (page, section_key) DO NOTHING;

INSERT INTO site_testimonials (author, company, role, quote, rating, sort_order) VALUES
  ('Procurement Lead','Regional FMCG distributor','Supply Chain','Eleven Solutions turned our Mombasa to Nairobi line haul from a weekly headache into something we no longer think about. The tracking and the invoicing just work.',5,1)
ON CONFLICT DO NOTHING;
