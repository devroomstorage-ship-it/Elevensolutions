const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db');
const { authenticate, financeOrAdmin, plannerOrAbove, allStaff, auditLog } = require('../middleware/auth');
const { sendQuoteEmail } = require('../services/email');
const { generateQuotePDF } = require('../services/pdf');
const { calculateJourneyCost } = require('../services/costing');
const { getRoute, geocode } = require('../services/maps');

const router = express.Router();
router.use(authenticate);

// Common SELECT — adds the assigned-staff name and the journey reference (if any).
const QUOTE_SELECT = `
  SELECT q.*,
         c.company_name AS client_company_name,
         c.email        AS client_email,
         c.phone        AS client_phone,
         u.full_name    AS assigned_to_name,
         j.reference    AS journey_reference
  FROM quotations q
  LEFT JOIN clients  c ON q.client_id   = c.id
  LEFT JOIN users    u ON q.assigned_to = u.id
  LEFT JOIN journeys j ON q.journey_id  = j.id
`;

// GET /api/quotes — workbench list. Supports status= filter and ?q= search.
router.get('/', allStaff, async (req, res) => {
  const { status, q: search, assignedTo } = req.query;
  const params = [];
  const cond = [];
  if (status)     { params.push(status);     cond.push(`q.status = $${params.length}`); }
  if (assignedTo) {
    if (assignedTo === 'unassigned') cond.push('q.assigned_to IS NULL');
    else if (assignedTo === 'me')    { params.push(req.user.id); cond.push(`q.assigned_to = $${params.length}`); }
    else                              { params.push(assignedTo);  cond.push(`q.assigned_to = $${params.length}`); }
  }
  if (search) {
    params.push(`%${search}%`);
    cond.push(`(q.reference ILIKE $${params.length} OR q.company_name ILIKE $${params.length} OR q.contact_email ILIKE $${params.length} OR c.company_name ILIKE $${params.length} OR q.origin ILIKE $${params.length} OR q.destination ILIKE $${params.length})`);
  }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const { rows } = await query(
    `${QUOTE_SELECT} ${where} ORDER BY q.created_at DESC LIMIT 200`,
    params
  );
  res.json(rows);
});

// GET /api/quotes/stats — counts per status, used for tab badges
router.get('/stats', allStaff, async (_req, res) => {
  const { rows } = await query(`
    SELECT status, COUNT(*)::int AS count
      FROM quotations
     WHERE created_at > NOW() - INTERVAL '180 days'
     GROUP BY status
  `);
  const map = Object.fromEntries(rows.map(r => [r.status, r.count]));
  const total = rows.reduce((s, r) => s + r.count, 0);
  res.json({ ...map, total });
});

// GET /api/quotes/:id
router.get('/:id', allStaff, async (req, res) => {
  const { rows } = await query(`${QUOTE_SELECT} WHERE q.id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
  res.json(rows[0]);
});

// PATCH /api/quotes/:id — update amount, status, validity, notes
router.patch('/:id', financeOrAdmin, async (req, res) => {
  const { amount, status, validUntil, notes } = req.body;
  const { rows } = await query(
    `UPDATE quotations
     SET amount      = COALESCE($1, amount),
         status      = COALESCE($2, status),
         valid_until = COALESCE($3, valid_until),
         notes       = COALESCE($4, notes)
     WHERE id = $5 RETURNING *`,
    [amount, status, validUntil, notes, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
  await auditLog(req.user.id, 'quote.updated', 'quotation', req.params.id, { amount, status }, req.ip);
  res.json(rows[0]);
});

// POST /api/quotes/:id/assign — assign to a staff member (or unassign with assignedTo=null)
router.post('/:id/assign', plannerOrAbove, [
  body('assignedTo').optional({ nullable: true }).custom(v => v === null || /^[0-9a-f-]{36}$/i.test(v)).withMessage('assignedTo must be a uuid or null'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  const { assignedTo } = req.body;
  const { rows } = await query(
    `UPDATE quotations SET assigned_to = $1 WHERE id = $2 RETURNING *`,
    [assignedTo, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
  await auditLog(req.user.id, 'quote.assigned', 'quotation', req.params.id, { assignedTo }, req.ip);
  res.json(rows[0]);
});

// POST /api/quotes/:id/note — append an internal note to the thread
router.post('/:id/note', allStaff, [
  body('body').trim().notEmpty().withMessage('Note body is required.').isLength({ max: 2000 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const note = {
    author_id:   req.user.id,
    author_name: req.user.full_name || req.user.email,
    body:        req.body.body.trim(),
    ts:          new Date().toISOString(),
  };
  const { rows } = await query(
    `UPDATE quotations
        SET internal_notes = internal_notes || $1::jsonb
      WHERE id = $2 RETURNING internal_notes`,
    [JSON.stringify([note]), req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
  res.status(201).json({ notes: rows[0].internal_notes });
});

// POST /api/quotes/:id/convert — accept the quote and create the booking journey.
// All three of truckId, driverId and scheduledDate are required because the
// journeys table requires them and a "booking" without a truck or driver
// isn't useful operationally.
router.post('/:id/convert', plannerOrAbove, [
  body('truckId').isUUID().withMessage('Pick a truck for the booking.'),
  body('driverId').isUUID().withMessage('Pick a driver for the booking.'),
  body('scheduledDate').isISO8601().withMessage('Pick a scheduled date for the booking.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { truckId, driverId, scheduledDate } = req.body;
  try {
    const result = await withTransaction(async (c) => {
      const { rows: qs } = await c.query('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
      if (!qs.length) throw Object.assign(new Error('Quote not found'), { status: 404 });
      const quote = qs[0];
      if (quote.journey_id) throw Object.assign(new Error('This quote has already been converted to a booking.'), { status: 409 });

      // Generate next journey reference (J-001 etc.)
      const { rows: refRow } = await c.query(
        "SELECT 'J-' || LPAD((COUNT(*)+1)::text, 3, '0') AS ref FROM journeys"
      );

      // Snapshot truck registration and driver name at creation time
      const { rows: trk } = await c.query('SELECT registration FROM trucks WHERE id = $1', [truckId]);
      if (!trk.length) throw Object.assign(new Error('Truck not found'), { status: 404 });

      const { rows: drv } = await c.query("SELECT full_name FROM users WHERE id = $1 AND role = 'driver' AND is_active = TRUE", [driverId]);
      if (!drv.length) throw Object.assign(new Error('Active driver not found'), { status: 404 });

      const { rows: jRow } = await c.query(`
        INSERT INTO journeys
          (reference, client_id, quotation_id, origin, destination,
           cargo_type, cargo_weight_tons, scheduled_date,
           truck_id, driver_id,
           truck_registration_snapshot, driver_name_snapshot,
           status, estimated_cost, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'scheduled',$13,$14)
        RETURNING *`,
        [refRow[0].ref, quote.client_id, quote.id, quote.origin, quote.destination,
         quote.cargo_type, quote.weight_tons, scheduledDate,
         truckId, driverId,
         trk[0].registration, drv[0].full_name,
         quote.amount || null, req.user.id]
      );

      // Mark the quote accepted and link the new journey
      await c.query(
        `UPDATE quotations SET status = 'accepted', journey_id = $1 WHERE id = $2`,
        [jRow[0].id, quote.id]
      );
      return { quote: { ...quote, status: 'accepted', journey_id: jRow[0].id }, journey: jRow[0] };
    });

    await auditLog(req.user.id, 'quote.converted', 'quotation', req.params.id, { journeyId: result.journey.id }, req.ip);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('convert error', err);
    res.status(500).json({ error: 'Could not convert quote to a booking.' });
  }
});

// POST /api/quotes/:id/send — generate PDF and email to client
// GET /api/quotes/:id/route-distance — auto-resolve the quote's own route
// distance (geocode origin/destination + Google route, cache-backed) so the
// price calculator's distance field can prefill without a click.
router.get('/:id/route-distance', allStaff, async (req, res) => {
  const { rows } = await query('SELECT origin, destination FROM quotations WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
  try {
    const [o, d] = await Promise.all([geocode(rows[0].origin), geocode(rows[0].destination)]);
    const route = await getRoute(o, d);
    res.json({ distanceKm: route.distance_km, durationMin: route.duration_min });
  } catch (err) {
    res.status(400).json({ error: `Could not resolve the route automatically: ${err.message}`, allowManual: true });
  }
});

// POST /api/quotes/:id/calculate-price — suggest a price for the quote using
// the fuel-based costing engine (same maths as the journey planner):
//   fuel (billable km ÷ truck km/L × global fuel price) + daily rate
//   + extra days × extra-day rate + extras.
// Distance comes from the request if supplied, otherwise it is geocoded and
// routed via Google (cache-backed). The result is a SUGGESTION — the staff
// member edits/saves the final amount separately via PATCH /:id.
// allStaff (not financeOrAdmin): the workbench auto-shows the suggestion to
// anyone who can view quotes; saving the amount / sending stays financeOrAdmin.
router.post('/:id/calculate-price', allStaff, [
  body('truckId').isUUID().withMessage('Pick a truck to price with.'),
  body('days').optional({ checkFalsy: true }).isInt({ min: 1, max: 60 }),
  body('roundTrip').optional().isBoolean(),
  body('distanceKm').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('extraCharges').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('manualAdjustment').optional({ checkFalsy: true }).isFloat(),
  // Per-quotation rate overrides — used for THIS calculation only, the
  // truck's saved rates are not touched.
  body('dailyRate').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('extraDayRate').optional({ checkFalsy: true }).isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

  const { rows: qs } = await query('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
  if (!qs.length) return res.status(404).json({ error: 'Quote not found' });
  const quote = qs[0];

  const { rows: ts } = await query(
    'SELECT registration, fuel_efficiency_km_per_l, daily_rate, extra_day_rate FROM trucks WHERE id = $1',
    [req.body.truckId]
  );
  if (!ts.length) return res.status(404).json({ error: 'Truck not found' });
  const truck = ts[0];
  if (!Number(truck.fuel_efficiency_km_per_l)) {
    return res.status(400).json({ error: `${truck.registration} has no fuel efficiency set — add its rates in Settings → Pricing first.` });
  }

  const { rows: fp } = await query("SELECT value FROM site_settings WHERE key = 'fuel_price_per_litre'");
  const fuelPricePerL = Number(fp[0]?.value) || 200;

  // Distance: manual value wins; otherwise geocode the quote's own route.
  let distanceKm = req.body.distanceKm != null && req.body.distanceKm !== '' ? Number(req.body.distanceKm) : null;
  if (distanceKm == null) {
    try {
      const [o, d] = await Promise.all([geocode(quote.origin), geocode(quote.destination)]);
      const route = await getRoute(o, d);
      distanceKm = route.distance_km;
    } catch (err) {
      return res.status(400).json({
        error: `Could not calculate the route distance automatically (${err.message}). Enter the distance manually.`,
        allowManual: true,
      });
    }
  }

  const breakdown = calculateJourneyCost({
    distanceKm,
    fuelEfficiencyKmPerL: truck.fuel_efficiency_km_per_l,
    fuelPricePerL,
    dailyRate: req.body.dailyRate != null && req.body.dailyRate !== '' ? req.body.dailyRate : truck.daily_rate,
    extraDayRate: req.body.extraDayRate != null && req.body.extraDayRate !== '' ? req.body.extraDayRate : truck.extra_day_rate,
    days: req.body.days || 1,
    roundTrip: req.body.roundTrip !== false,
    extraCharges: req.body.extraCharges || 0,
    manualAdjustment: req.body.manualAdjustment || 0,
  });

  res.json({
    truck: truck.registration,
    breakdown,
    overrides: {
      dailyRate: req.body.dailyRate != null && req.body.dailyRate !== '',
      extraDayRate: req.body.extraDayRate != null && req.body.extraDayRate !== '',
    },
  });
});

router.post('/:id/send', financeOrAdmin, async (req, res) => {
  const { rows } = await query(`${QUOTE_SELECT} WHERE q.id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Quote not found' });
  const quote = rows[0];

  if (!quote.amount) return res.status(400).json({ error: 'Set a quote amount before sending' });
  const recipientEmail = quote.client_email || quote.contact_email;
  if (!recipientEmail) return res.status(400).json({ error: 'No client email on record' });

  // Optional personal note from staff, shown in the email body above the table.
  const note = String(req.body.note || '').trim().slice(0, 1000);

  try {
    const pdfBuffer = await generateQuotePDF(quote);
    await sendQuoteEmail(recipientEmail, quote.client_company_name || quote.company_name, quote, pdfBuffer, note);
    await query("UPDATE quotations SET status = 'sent', sent_at = NOW() WHERE id = $1", [quote.id]);
    await auditLog(req.user.id, 'quote.sent', 'quotation', quote.id, { recipient: recipientEmail, note: note || undefined }, req.ip);
    res.json({ message: 'Quote emailed successfully', recipient: recipientEmail });
  } catch (err) {
    console.error('Quote send error:', err);
    res.status(500).json({ error: 'Failed to send quote email' });
  }
});

module.exports = router;
