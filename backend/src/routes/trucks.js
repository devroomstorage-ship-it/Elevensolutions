// backend/src/routes/trucks.js
//
// FULL REPLACEMENT. Adds a PATCH that accepts every editable truck field
// (registration, name, type, capacity, year, make, model, fuel, insurance
// expiry, inspection expiry, cost per km, fixed daily cost, odometer, notes,
// status). All fields optional — send only what you want to change.

const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, fleetOrAbove, allStaff, auditLog } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/trucks — supports optional ?status=available|on_route|maintenance filter
router.get('/', allStaff, async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.status) {
    params.push(req.query.status);
    where = 'WHERE t.status = $1';
  }
  const { rows } = await query(
    `SELECT t.*, u.full_name AS driver_name
       FROM trucks t
       LEFT JOIN users u ON u.id = t.driver_id
       ${where}
       ORDER BY t.registration ASC`,
    params
  );
  res.json(rows);
});

// GET /api/trucks/:id
router.get('/:id', allStaff, async (req, res) => {
  const { rows } = await query(
    `SELECT t.*, u.full_name AS driver_name
       FROM trucks t LEFT JOIN users u ON u.id = t.driver_id WHERE t.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Truck not found' });
  res.json(rows[0]);
});

// GET /api/trucks/:id/journeys
router.get('/:id/journeys', allStaff, async (req, res) => {
  const { rows } = await query(
    `SELECT j.*, u.full_name AS driver_name
       FROM journeys j LEFT JOIN users u ON u.id = j.driver_id
      WHERE j.truck_id = $1 ORDER BY j.scheduled_date DESC LIMIT 100`,
    [req.params.id]
  );
  res.json(rows);
});

// GET /api/trucks/:id/profitability — profitability view row
router.get('/:id/profitability', allStaff, async (req, res) => {
  const { rows } = await query('SELECT * FROM truck_profitability WHERE truck_id = $1', [req.params.id]);
  res.json(rows[0] || null);
});

// POST /api/trucks — create a truck
router.post('/', fleetOrAbove, [
  body('registration').trim().notEmpty().withMessage('Registration is required.'),
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('type').trim().notEmpty().withMessage('Type is required.'),
  body('capacityTons').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Capacity must be zero or positive.'),
  body('year').optional({ checkFalsy: true }).isInt({ min: 1980, max: 2100 }),
  body('odometerKm').optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage('Odometer must be zero or positive.'),
  body('defaultCostPerKm').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  body('fixedDailyCost').optional({ checkFalsy: true }).isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const f = errors.array()[0];
    return res.status(400).json({ error: f.msg, field: f.path });
  }
  const b = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO trucks
         (registration, name, type, capacity_tons, year, driver_id, notes,
          make, model, fuel_type, insurance_expiry, inspection_expiry,
          default_cost_per_km, fixed_daily_cost, odometer_km)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        b.registration.trim().toUpperCase(), b.name, b.type,
        b.capacityTons || null, b.year || null, b.driverId || null, b.notes || null,
        b.make || null, b.model || null, b.fuelType || null,
        b.insuranceExpiry || null, b.inspectionExpiry || null,
        b.defaultCostPerKm || 0, b.fixedDailyCost || 0, b.odometerKm || 0,
      ]
    );
    await auditLog(req.user.id, 'truck.created', 'truck', rows[0].id, { registration: b.registration }, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A truck with that registration already exists.', field: 'registration' });
    }
    console.error('truck create error:', err);
    res.status(500).json({ error: 'Could not create truck.' });
  }
});

// PATCH /api/trucks/:id — the editable one
router.patch('/:id', fleetOrAbove, [
  body('registration').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 30 }),
  body('name').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 100 }),
  body('type').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 50 }),
  body('capacityTons').optional({ nullable: true, checkFalsy: false }).isFloat({ min: 0 }).withMessage('Capacity must be zero or positive.'),
  body('year').optional({ nullable: true, checkFalsy: false }).isInt({ min: 1980, max: 2100 }),
  body('odometerKm').optional({ nullable: true, checkFalsy: false }).isInt({ min: 0 }).withMessage('Odometer must be zero or positive.'),
  body('defaultCostPerKm').optional({ nullable: true, checkFalsy: false }).isFloat({ min: 0 }),
  body('fixedDailyCost').optional({ nullable: true, checkFalsy: false }).isFloat({ min: 0 }),
  body('status').optional({ checkFalsy: true }).isIn(['available', 'on_route', 'maintenance', 'scheduled', 'loading']),
  body('insuranceExpiry').optional({ checkFalsy: true }).isISO8601(),
  body('inspectionExpiry').optional({ checkFalsy: true }).isISO8601(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const f = errors.array()[0];
    return res.status(400).json({ error: f.msg, field: f.path });
  }
  const b = req.body;
  const map = {
    registration:      'registration',
    name:              'name',
    type:              'type',
    capacityTons:      'capacity_tons',
    year:              'year',
    notes:             'notes',
    make:              'make',
    model:             'model',
    fuelType:          'fuel_type',
    insuranceExpiry:   'insurance_expiry',
    inspectionExpiry:  'inspection_expiry',
    defaultCostPerKm:  'default_cost_per_km',
    fixedDailyCost:    'fixed_daily_cost',
    odometerKm:        'odometer_km',
    status:            'status',
  };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (b[k] !== undefined) {
      // Normalise registration; treat empty strings as NULL for numerics
      let v = b[k];
      if (k === 'registration' && typeof v === 'string') v = v.trim().toUpperCase();
      if (v === '' && ['capacityTons','year','odometerKm','defaultCostPerKm','fixedDailyCost','insuranceExpiry','inspectionExpiry'].includes(k)) v = null;
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No editable fields supplied.' });
  vals.push(req.params.id);
  try {
    const { rows } = await query(
      `UPDATE trucks SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Truck not found' });
    await auditLog(req.user.id, 'truck.updated', 'truck', req.params.id, b, req.ip);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That registration is already used by another truck.', field: 'registration' });
    }
    console.error('truck update error:', err);
    res.status(500).json({ error: 'Could not update truck.' });
  }
});

module.exports = router;
