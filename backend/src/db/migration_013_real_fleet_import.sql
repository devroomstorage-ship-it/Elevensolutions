-- migration_013_real_fleet_import.sql
-- Import the real Eleven Solutions fleet + drivers (source: client's
-- "11 Solutions.xlsx" roster) and retire the seed placeholder trucks.
--
--   * 13 real trucks upserted by registration, with fuel-based pricing
--     rates per size (source: "Truck Costing.xlsx"):
--       18T: 2 km/L · 16,000/day · 7,000/extra day
--       12T: 4 km/L ·  9,000/day · 5,000/extra day
--        7T: (10T rates per client decision) 4 km/L · 7,000/day · 3,000/extra day
--   * One driver user per truck (role='driver'), with an unusable random
--     bcrypt password — they cannot log in until an admin sets a password.
--     james.mwangi@ already exists from the seed and is reused.
--   * driver_profiles carry the roster phone + national ID.
--   * Placeholder trucks KDB 001G–013G are set to status='inactive' (kept
--     for history, hidden from planning). Seed driver Peter Ochieng (not in
--     the roster) is deactivated.
--
-- Idempotent: safe to re-run (ON CONFLICT / WHERE NOT EXISTS throughout).

BEGIN;

CREATE TEMP TABLE _fleet_roster (
  reg          VARCHAR(20),
  size_label   VARCHAR(10),
  capacity     DECIMAL(5,2),
  kmpl         DECIMAL(5,2),
  daily_rate   DECIMAL(10,2),
  extra_day    DECIMAL(10,2),
  driver_name  VARCHAR(255),
  email        VARCHAR(255),
  id_no        VARCHAR(50),
  phone        VARCHAR(50),
  truck_notes  TEXT
) ON COMMIT DROP;

INSERT INTO _fleet_roster VALUES
  -- 18T fleet
  ('KCC 111U', '18T', 18, 2, 16000, 7000, 'David Gichuki',         'david.gichuki@elevensolutions.co.ke',    '39753943', '+25474060790',  NULL),
  ('KDL 186U', '18T', 18, 2, 16000, 7000, 'Gilson Kimani',         'gilson.kimani@elevensolutions.co.ke',    '26594419', '0722653641',    NULL),
  ('KBV 958Y', '18T', 18, 2, 16000, 7000, 'Moses Muiruri',         'moses.muiruri@elevensolutions.co.ke',    '26543006', '0719430333',    NULL),
  ('KBS 437M', '18T', 18, 2, 16000, 7000, 'Joseph Muiru Mungai',   'joseph.mungai@elevensolutions.co.ke',    '32389149', '0706373326',    NULL),
  ('KBR 329S', '18T', 18, 2, 16000, 7000, 'Joseph Koigi',          'joseph.koigi@elevensolutions.co.ke',     '11250336', '0728951155',    NULL),
  ('KCP 055N', '18T', 18, 2, 16000, 7000, 'Francis Muriithi',      'francis.muriithi@elevensolutions.co.ke', '21111770', '0721898694',    NULL),
  -- 12T fleet
  ('KCY 065A', '12T', 12, 4,  9000, 5000, 'Michael Gichina Mwangi','michael.mwangi@elevensolutions.co.ke',   '13214800', '0722276646',    NULL),
  ('KCJ 843X', '12T', 12, 4,  9000, 5000, 'John Njoroge',          'john.njoroge@elevensolutions.co.ke',     '24080350', '+254710642237', NULL),
  ('KDB 257Q', '12T', 12, 4,  9000, 5000, 'Samuel Wachira Wagura', 'samuel.wagura@elevensolutions.co.ke',    '24635656', '+254780737844', NULL),
  ('KCF 067X', '12T', 12, 4,  9000, 5000, 'John Mbuthia Njeri',    'john.mbuthia@elevensolutions.co.ke',     '33930042', '+254708091272', NULL),
  ('KDC 167C', '12T', 12, 4,  9000, 5000, 'Lawrence Ngugi',        'lawrence.ngugi@elevensolutions.co.ke',   '28278526', '0714347630',    NULL),
  ('KDW 836X', '12T', 12, 4,  9000, 5000, 'Anthony Gitari',        'anthony.gitari@elevensolutions.co.ke',   '11803606', '0706501314',    NULL),
  -- 7T fleet (10T rates per client decision — confirm)
  ('KCG 408X', '7T',   7, 4,  7000, 3000, 'James Mwangi',          'james.mwangi@elevensolutions.co.ke',     '25198002', '0768755001',
   '7T — rates copied from 10T pending confirmation');

-- ── 1. Driver users — random unusable bcrypt password (pgcrypto bf) ──────────
INSERT INTO users (email, full_name, role, password_hash, is_active)
SELECT r.email, r.driver_name, 'driver',
       crypt(gen_random_uuid()::text, gen_salt('bf')), TRUE
FROM _fleet_roster r
ON CONFLICT (email) DO NOTHING;

-- ── 2. Driver profiles — roster phone + national ID ──────────────────────────
INSERT INTO driver_profiles (user_id, phone, id_passport_number, driver_status)
SELECT u.id, r.phone, r.id_no, 'active'
FROM _fleet_roster r
JOIN users u ON u.email = r.email
ON CONFLICT (user_id) DO UPDATE SET
  phone = EXCLUDED.phone,
  id_passport_number = EXCLUDED.id_passport_number;

-- ── 3. Trucks — upsert by registration with fuel-based rates ─────────────────
INSERT INTO trucks
  (registration, name, type, capacity_tons, status,
   fuel_efficiency_km_per_l, daily_rate, extra_day_rate, driver_id, notes)
SELECT r.reg, r.reg, r.size_label || ' Truck', r.capacity, 'available',
       r.kmpl, r.daily_rate, r.extra_day, u.id, r.truck_notes
FROM _fleet_roster r
JOIN users u ON u.email = r.email
ON CONFLICT (registration) DO UPDATE SET
  type                     = EXCLUDED.type,
  capacity_tons            = EXCLUDED.capacity_tons,
  fuel_efficiency_km_per_l = EXCLUDED.fuel_efficiency_km_per_l,
  daily_rate               = EXCLUDED.daily_rate,
  extra_day_rate           = EXCLUDED.extra_day_rate,
  driver_id                = EXCLUDED.driver_id,
  notes                    = COALESCE(EXCLUDED.notes, trucks.notes);

-- ── 4. Retire the seed placeholder trucks ────────────────────────────────────
-- Close any active assignments first, then hide from planning. Kept as rows
-- so historical journeys referencing them stay intact.
UPDATE driver_truck_assignments SET
  unassigned_at = NOW(),
  notes = COALESCE(notes || ' · ', '') || 'auto-unassigned: placeholder truck retired'
WHERE unassigned_at IS NULL
  AND truck_id IN (
    SELECT id FROM trucks WHERE registration IN
      ('KDB 001G','KDB 002G','KDB 003G','KDB 004G','KDB 005G','KDB 006G','KDB 007G',
       'KDB 008G','KDB 009G','KDB 010G','KDB 011G','KDB 012G','KDB 013G'));

UPDATE trucks SET status = 'inactive', driver_id = NULL
WHERE registration IN
  ('KDB 001G','KDB 002G','KDB 003G','KDB 004G','KDB 005G','KDB 006G','KDB 007G',
   'KDB 008G','KDB 009G','KDB 010G','KDB 011G','KDB 012G','KDB 013G');

-- ── 5. Active driver↔truck assignments from the roster ───────────────────────
INSERT INTO driver_truck_assignments (driver_id, truck_id, notes)
SELECT u.id, t.id, 'Imported from fleet roster'
FROM _fleet_roster r
JOIN users u  ON u.email = r.email
JOIN trucks t ON t.registration = r.reg
WHERE NOT EXISTS (
  SELECT 1 FROM driver_truck_assignments a
  WHERE a.truck_id = t.id AND a.unassigned_at IS NULL
);

-- ── 6. Deactivate the seed-only fake driver (not in the roster) ──────────────
UPDATE users SET is_active = FALSE
WHERE email = 'peter.ochieng@elevensolutions.co.ke';
UPDATE driver_profiles SET driver_status = 'inactive'
WHERE user_id = (SELECT id FROM users WHERE email = 'peter.ochieng@elevensolutions.co.ke');

COMMIT;
