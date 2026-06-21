# Eleven Solutions — Fleet, Costing, Maps & QuickBooks Update

This package contains **drop-in files** that extend your existing Next.js + Express +
PostgreSQL application. Every file mirrors the path it belongs to in your repo, so you
can copy the two top-level folders straight over your project root.

```
backend/   → copy over your backend/
frontend/  → copy over your frontend/
```

Nothing here deletes existing functionality — routes that already existed
(`journeys.js`, `trucks.js`, `quickbooks.js`) are **full replacements** that keep all
the original endpoints and add new ones. The rest are brand-new files.

---

## 1. What's included

### Backend (`backend/src/`)
| File | Status | Purpose |
|------|--------|---------|
| `db/migrate.js` | new | Dependency-free migration runner (`npm run migrate`) |
| `db/migration_002_fleet_costing_maps_qb.sql` | new | All new tables/columns/views (additive, idempotent) |
| `services/costing.js` | new | Pure journey-cost calculator |
| `services/maps.js` | new | Google Geocoding + Routes API with route caching |
| `services/quickbooks.js` | replace | Real OAuth refresh, idempotent customer/estimate/invoice push, sync logging + retry |
| `routes/drivers.js` | new | Driver CRUD over `users` + `driver_profiles`, stats, journey history |
| `routes/assignments.js` | new | Driver↔truck assignment with full history |
| `routes/journeys.js` | replace | Original endpoints **plus** calculate-route, calculate-cost, approve-cost, mark-delivered; freezes historical driver/truck snapshots |
| `routes/trucks.js` | replace | Original endpoints **plus** cost/compliance fields, `/journeys`, `/profitability` |
| `routes/quickbooks.js` | replace | Original OAuth **plus** sync-customer / create-estimate / create-invoice / retry-sync / logs |
| `index.js` | replace | Registers the two new routers |
| `.env.example` | replace | Adds `GOOGLE_MAPS_SERVER_KEY` |

### Frontend (`frontend/`)
| File | Status | Purpose |
|------|--------|---------|
| `components/admin/Sidebar.jsx` | replace | Adds **Drivers** and **Finance** nav items |
| `components/admin/PlacesAutocomplete.jsx` | new | Google Places autocomplete (degrades gracefully without a key) |
| `app/portal/drivers/page.js` | new | Driver list, search, licence-expiry warnings, add-driver modal |
| `app/portal/drivers/[id]/page.js` | new | Driver profile, stats, assign-truck, journey history |
| `app/portal/fleet/[id]/page.js` | new | Truck detail, profitability, assign-driver, journey history |
| `app/portal/schedule/page.js` | new | Journey planner: Maps autocomplete, distance + live cost preview |
| `app/portal/journeys/[id]/page.js` | new | Route map, cost breakdown, invoice + QuickBooks push |
| `app/portal/finance/page.js` | new | Revenue cards, QB connection, failed-sync retry, profit-by-truck |
| `.env.example` | replace | Adds `NEXT_PUBLIC_GOOGLE_MAPS_KEY` |

> If `app/portal/fleet/page.js` (the list page) already links rows somewhere,
> point each row to `/portal/fleet/{id}` to reach the new detail page.

---

## 2. Install steps

1. **Copy files** over your repo (back up first / commit a clean checkpoint).

2. **Run the database migration**
   ```bash
   cd backend
   npm run migrate
   ```
   This runs `migration_002_fleet_costing_maps_qb.sql`. It is additive and safe to
   re-run — it records applied files in a `schema_migrations` table.
   > Note: the migration's `ALTER TYPE truck_status ADD VALUE 'inactive'` runs
   > outside a transaction (Postgres requirement). If you are on PG < 12 and it
   > complains, run that single line manually once.

3. **Add the two Google Maps keys**
   - Backend `.env`: `GOOGLE_MAPS_SERVER_KEY` — server key, **IP-restricted**, with
     Geocoding API + Routes API enabled. Never exposed to the browser.
   - Frontend `.env`: `NEXT_PUBLIC_GOOGLE_MAPS_KEY` — browser key, **referrer-
     restricted** to your portal domain, with Maps JavaScript API + Places +
     Maps Embed enabled.

   Both features degrade gracefully: without the browser key the address fields
   become plain text inputs and the server geocodes the typed address; without
   the server key the route endpoint returns a clear error and you can enter the
   distance manually.

4. **QuickBooks** — your existing `QB_*` env vars are unchanged. The connect flow
   now redirects to `/portal/finance?qb=connected`. Use the **Finance** page to
   connect, monitor syncs, and retry failures.

5. **Restart** backend and frontend. The new nav items appear automatically based
   on role (Drivers: planner+; Finance: finance/super_admin).

---

## 3. The cost model

```
estimated_cost = (distance_km × cost_per_km)
               + (fixed_daily_cost × days)
               + extra_charges
               + manual_adjustment
```

`cost_per_km` and `fixed_daily_cost` are per-truck (`trucks.default_cost_per_km`,
`trucks.fixed_daily_cost`). The estimate is stored on `journey_costs`; a separate
**approve-cost** step writes `final_cost`, which is what invoices bill from.

---

## 4. Two things to confirm before go-live

1. **Pricing discrepancy in your source documents.** The signed agreement lists a
   monthly figure of **KES 200,000** (split 70k / 65k / 65k) while the pitch deck
   lists **KES 250,000** (split 83,400 / 83,300 / 83,300). Decide which is
   authoritative and set the per-truck rates accordingly.

2. **Verify the live Google Routes and QuickBooks field formats** against the
   current official API docs for your account/region before production — response
   field names and minor versions occasionally change, and the QuickBooks sandbox
   vs production base URLs are toggled by `QB_SANDBOX`.
```
```
# Elevensolutions
# Elevensolutions
