const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db');
const { authenticate, plannerOrAbove, allStaff, auditLog } = require('../middleware/auth');
const { getRoute, geocode, directionsLink } = require('../services/maps');
const { calculateJourneyCost } = require('../services/costing');
const { createUniqueQuoteReference } = require('../utils/quoteReference');

const router = express.Router();
router.use(authenticate);

// GET /api/journeys
router.get('/', allStaff, async (req, res) => {
  const { status, date, truckId } = req.query;
  const conditions = [];
  const params = [];

  if (req.user.role === 'driver') {
    params.push(req.user.id);
    conditions.push(`j.driver_id = $${params.length}`);
  }
  if (status)  { params.push(status);  conditions.push(`j.status = $${params.length}`); }
  if (date)    { params.push(date);    conditions.push(`j.scheduled_date = $${params.length}`); }
  if (truckId) { params.push(truckId); conditions.push(`j.truck_id = $${params.length}`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { rows } = await query(`
    SELECT j.*,
      t.registration, t.name AS truck_name,
      u.full_name AS driver_name,
      c.company_name AS client_name
    FROM journeys j
    LEFT JOIN trucks t ON j.truck_id = t.id
    LEFT JOIN users u ON j.driver_id = u.id
    LEFT JOIN clients c ON j.client_id = c.id
    ${where}
    ORDER BY j.scheduled_date DESC, j.created_at DESC
    LIMIT 200
  `, params);
  res.json(rows);
});

// GET /api/journeys/:id — includes cost breakdown + directions link
router.get('/:id', allStaff, async (req, res) => {
  const { rows } = await query(`
    SELECT j.*,
      t.registration, t.name AS truck_name, t.type AS truck_type,
      t.default_cost_per_km, t.fixed_daily_cost,
      u.full_name AS driver_name, u.email AS driver_email,
      c.company_name AS client_name, c.email AS client_email
    FROM journeys j
    LEFT JOIN trucks t ON j.truck_id = t.id
    LEFT JOIN users u ON j.driver_id = u.id
    LEFT JOIN clients c ON j.client_id = c.id
    WHERE j.id = $1
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
  if (req.user.role === 'driver' && rows[0].driver_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const journey = rows[0];
  const { rows: costRows } = await query('SELECT * FROM journey_costs WHERE journey_id = $1', [journey.id]);
  journey.cost = costRows[0] || null;

  if (journey.pickup_lat && journey.dropoff_lat) {
    journey.directions_link = directionsLink(
      { lat: journey.pickup_lat, lng: journey.pickup_lng },
      { lat: journey.dropoff_lat, lng: journey.dropoff_lng }
    );
  }

  // Find a linked invoice if any (for the QB status badge).
  const { rows: inv } = await query(
    `SELECT id, reference, status, quickbooks_id, qb_sync_status
       FROM invoices WHERE journey_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [journey.id]
  );
  journey.invoice = inv[0] || null;

  // Find the linked quotation if any (journeys.quotation_id is set either by
  // the quote→journey convert flow, or by generate-quotation below).
  if (journey.quotation_id) {
    const { rows: quo } = await query(
      'SELECT id, reference, status, amount FROM quotations WHERE id = $1',
      [journey.quotation_id]
    );
    journey.quotation = quo[0] || null;
  } else {
    journey.quotation = null;
  }

  res.json(journey);
});

// POST /api/journeys — create. Freezes the historical driver/truck pairing.
router.post('/', plannerOrAbove, [
  body('truckId').isUUID(),
  body('driverId').isUUID(),
  body('origin').notEmpty(),
  body('destination').notEmpty(),
  body('scheduledDate').isDate(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    truckId, driverId, clientId, origin, destination,
    cargoType, cargoWeightTons, scheduledDate, distanceKm, notes,
    pickupLat, pickupLng, dropoffLat, dropoffLng,
    scheduledPickupAt, scheduledDeliveryAt,
  } = req.body;

  // Truck must be free on that date.
  const { rows: conflicts } = await query(`
    SELECT id FROM journeys
    WHERE truck_id = $1 AND scheduled_date = $2 AND status NOT IN ('delivered','cancelled')
  `, [truckId, scheduledDate]);
  if (conflicts.length) {
    return res.status(409).json({ error: 'Truck already scheduled on this date' });
  }

  const result = await withTransaction(async (c) => {
    const { rows: refRow } = await c.query(
      "SELECT 'JRN-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD((COUNT(*)+1)::text, 3, '0') AS ref FROM journeys"
    );
    const reference = refRow[0].ref;

    // Snapshot the truck registration + driver name so old journeys always
    // show the correct historical pairing.
    const { rows: snap } = await c.query(
      `SELECT t.registration, u.full_name
         FROM trucks t, users u WHERE t.id = $1 AND u.id = $2`,
      [truckId, driverId]
    );
    const reg = snap[0]?.registration || null;
    const driverName = snap[0]?.full_name || null;

    const { rows } = await c.query(`
      INSERT INTO journeys
        (reference, truck_id, driver_id, client_id, origin, destination,
         cargo_type, cargo_weight_tons, scheduled_date, distance_km, notes, created_by,
         pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
         scheduled_pickup_at, scheduled_delivery_at,
         truck_registration_snapshot, driver_name_snapshot)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *
    `, [
      reference, truckId, driverId, clientId || null, origin, destination,
      cargoType, cargoWeightTons, scheduledDate, distanceKm || null, notes, req.user.id,
      pickupLat || null, pickupLng || null, dropoffLat || null, dropoffLng || null,
      scheduledPickupAt || null, scheduledDeliveryAt || null,
      reg, driverName,
    ]);

    await c.query(
      "UPDATE trucks SET status = 'scheduled' WHERE id = $1 AND status = 'available'",
      [truckId]
    );
    return rows[0];
  });

  await auditLog(req.user.id, 'journey.created', 'journey', result.id, { reference: result.reference }, req.ip);
  res.status(201).json(result);
});

// PATCH /api/journeys/:id/status — existing status machine (kept)
router.patch('/:id/status', plannerOrAbove, async (req, res) => {
  const { status } = req.body;
  const valid = ['scheduled', 'loading', 'in_transit', 'delivered', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const result = await withTransaction(async (c) => {
    const { rows } = await c.query('UPDATE journeys SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
    if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });

    const journey = rows[0];
    const truckStatus = {
      loading: 'loading', in_transit: 'on_route',
      delivered: 'available', cancelled: 'available',
    }[status];
    if (truckStatus) await c.query('UPDATE trucks SET status = $1 WHERE id = $2', [truckStatus, journey.truck_id]);
    if (status === 'in_transit') await c.query('UPDATE journeys SET departure_time = NOW(), actual_pickup_at = NOW() WHERE id = $1', [journey.id]);
    if (status === 'delivered') await c.query('UPDATE journeys SET arrival_time = NOW(), actual_delivery_at = NOW() WHERE id = $1', [journey.id]);
    return journey;
  });

  await auditLog(req.user.id, `journey.${status}`, 'journey', result.id, {}, req.ip);
  res.json(result);
});

// POST /api/journeys/:id/calculate-route — Google distance + duration + polyline
router.post('/:id/calculate-route', plannerOrAbove, async (req, res) => {
  const { rows } = await query('SELECT * FROM journeys WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
  const journey = rows[0];

  try {
    // Resolve coordinates: prefer body, fall back to stored, else geocode text.
    let origin = pickCoords(req.body.pickupLat, req.body.pickupLng, journey.pickup_lat, journey.pickup_lng);
    let dest   = pickCoords(req.body.dropoffLat, req.body.dropoffLng, journey.dropoff_lat, journey.dropoff_lng);
    if (!origin) origin = await geocode(journey.origin);
    if (!dest)   dest   = await geocode(journey.destination);

    const route = await getRoute(origin, dest);

    const { rows: updated } = await query(`
      UPDATE journeys SET
        distance_km = $1, estimated_duration_min = $2,
        route_summary = $3, route_polyline = $4,
        pickup_lat = $5, pickup_lng = $6, dropoff_lat = $7, dropoff_lng = $8
      WHERE id = $9 RETURNING *
    `, [
      route.distance_km, route.duration_min, route.route_summary, route.route_polyline,
      origin.lat, origin.lng, dest.lat, dest.lng, journey.id,
    ]);

    await auditLog(req.user.id, 'journey.route_calculated', 'journey', journey.id, { distanceKm: route.distance_km, cached: route.cached }, req.ip);
    res.json({ ...updated[0], directions_link: directionsLink(origin, dest), cached: route.cached });
  } catch (err) {
    // Maps failure must not block the booking — surface a clear error so the
    // UI can offer manual distance entry.
    res.status(502).json({ error: `Route calculation failed: ${err.message}`, allowManual: true });
  }
});

// POST /api/journeys/:id/calculate-cost — run the costing model, upsert journey_costs
router.post('/:id/calculate-cost', plannerOrAbove, async (req, res) => {
  const { rows } = await query(`
    SELECT j.*, t.default_cost_per_km, t.fixed_daily_cost
      FROM journeys j JOIN trucks t ON j.truck_id = t.id
     WHERE j.id = $1
  `, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
  const journey = rows[0];

  const { extraCharges = 0, manualAdjustment = 0, days = 1, routeType = null, distanceKm } = req.body;

  const breakdown = calculateJourneyCost({
    distanceKm: distanceKm != null ? distanceKm : journey.distance_km,
    costPerKm: journey.default_cost_per_km,
    fixedDailyCost: journey.fixed_daily_cost,
    days,
    extraCharges,
    manualAdjustment,
  });

  const { rows: cost } = await query(`
    INSERT INTO journey_costs
      (journey_id, distance_km, cost_per_km, fixed_daily_cost, days,
       extra_charges, manual_adjustment, estimated_cost, route_type, calculated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (journey_id) DO UPDATE SET
      distance_km = EXCLUDED.distance_km,
      cost_per_km = EXCLUDED.cost_per_km,
      fixed_daily_cost = EXCLUDED.fixed_daily_cost,
      days = EXCLUDED.days,
      extra_charges = EXCLUDED.extra_charges,
      manual_adjustment = EXCLUDED.manual_adjustment,
      estimated_cost = EXCLUDED.estimated_cost,
      route_type = EXCLUDED.route_type,
      calculated_by = EXCLUDED.calculated_by,
      updated_at = NOW()
    RETURNING *
  `, [
    journey.id, breakdown.distanceKm, breakdown.costPerKm, breakdown.fixedDailyCost, breakdown.days,
    breakdown.extraCharges, breakdown.manualAdjustment, breakdown.estimatedCost, routeType, req.user.id,
  ]);

  await query('UPDATE journeys SET estimated_cost = $1 WHERE id = $2', [breakdown.estimatedCost, journey.id]);
  await auditLog(req.user.id, 'journey.cost_calculated', 'journey', journey.id, breakdown, req.ip);

  res.json({ breakdown, cost: cost[0] });
});

// POST /api/journeys/:id/approve-cost — lock in the final billable cost
router.post('/:id/approve-cost', plannerOrAbove, async (req, res) => {
  const { finalCost } = req.body;
  if (finalCost == null) return res.status(400).json({ error: 'finalCost is required' });

  const { rows } = await query(`
    UPDATE journey_costs
       SET final_cost = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
     WHERE journey_id = $3 RETURNING *
  `, [finalCost, req.user.id, req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Calculate a cost first' });

  await query('UPDATE journeys SET final_cost = $1 WHERE id = $2', [finalCost, req.params.id]);
  await auditLog(req.user.id, 'journey.cost_approved', 'journey', req.params.id, { finalCost }, req.ip);
  res.json(rows[0]);
});

// POST /api/journeys/:id/generate-quotation — create a matching quotation
// record from this journey's own data, for jobs booked directly (not from
// an existing quote). Marked 'accepted' immediately since the journey it
// documents already exists. One-shot: a journey can only have one linked
// quotation (mirrors the quote→journey 'convert' flow in quotes.js, which
// enforces the same relationship from the other direction).
router.post('/:id/generate-quotation', plannerOrAbove, async (req, res) => {
  const { rows } = await query('SELECT * FROM journeys WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
  const journey = rows[0];

  if (journey.quotation_id) {
    return res.status(409).json({ error: 'This journey already has a linked quotation.' });
  }
  if (!journey.client_id) {
    return res.status(400).json({ error: 'Assign a customer to this journey before generating a quotation.' });
  }
  const amount = journey.final_cost ?? journey.estimated_cost;
  if (amount == null) {
    return res.status(400).json({ error: 'Calculate a cost for this journey before generating a quotation.' });
  }

  try {
    const result = await withTransaction(async (c) => {
      const reference = await createUniqueQuoteReference(c.query.bind(c));
      const { rows: qRows } = await c.query(`
        INSERT INTO quotations
          (reference, client_id, origin, destination, cargo_type, weight_tons,
           amount, status, valid_until, journey_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'accepted',CURRENT_DATE + 30, $8, $9)
        RETURNING *
      `, [
        reference, journey.client_id, journey.origin, journey.destination,
        journey.cargo_type, journey.cargo_weight_tons, amount, journey.id, req.user.id,
      ]);
      await c.query('UPDATE journeys SET quotation_id = $1 WHERE id = $2', [qRows[0].id, journey.id]);
      return qRows[0];
    });

    await auditLog(req.user.id, 'journey.quotation_generated', 'journey', journey.id, { quotationId: result.id }, req.ip);
    res.status(201).json(result);
  } catch (err) {
    console.error('generate-quotation error:', err);
    res.status(500).json({ error: 'Could not generate quotation.' });
  }
});

// POST /api/journeys/:id/mark-delivered
router.post('/:id/mark-delivered', plannerOrAbove, async (req, res) => {
  const result = await withTransaction(async (c) => {
    const { rows } = await c.query(
      `UPDATE journeys SET status = 'delivered', arrival_time = NOW(), actual_delivery_at = NOW()
         WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) throw Object.assign(new Error('Journey not found'), { status: 404 });
    await c.query("UPDATE trucks SET status = 'available' WHERE id = $1", [rows[0].truck_id]);
    return rows[0];
  });

  await auditLog(req.user.id, 'journey.delivered', 'journey', result.id, {}, req.ip);
  res.json(result);
});

// helper: choose a coordinate pair from body or stored values
function pickCoords(bLat, bLng, sLat, sLng) {
  if (bLat != null && bLng != null) return { lat: Number(bLat), lng: Number(bLng) };
  if (sLat != null && sLng != null) return { lat: Number(sLat), lng: Number(sLng) };
  return null;
}

module.exports = router;
