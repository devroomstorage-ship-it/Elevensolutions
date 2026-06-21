const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, fleetOrAbove, adminOnly, allStaff, financeOrAdmin, auditLog } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/trucks — list all trucks (drivers see only their own)
router.get('/', allStaff, async (req, res) => {
  if (req.user.role === 'driver') {
    const { rows } = await query(
      'SELECT t.*, u.full_name AS driver_name FROM trucks t LEFT JOIN users u ON t.driver_id = u.id WHERE t.driver_id = $1',
      [req.user.id]
    );
    return res.json(rows);
  }

  const { status } = req.query;
  const params = [];
  let sql = 'SELECT t.*, u.full_name AS driver_name FROM trucks t LEFT JOIN users u ON t.driver_id = u.id';
  if (status) { params.push(status); sql += ` WHERE t.status = $1`; }
  sql += ' ORDER BY t.name ASC';
  const { rows } = await query(sql, params);
  res.json(rows);
});

// GET /api/trucks/stats
router.get('/stats', allStaff, async (req, res) => {
  const { rows } = await query('SELECT status, COUNT(*) AS count FROM trucks GROUP BY status');
  const stats = { total: 0, available: 0, on_route: 0, maintenance: 0, scheduled: 0, loading: 0, inactive: 0 };
  rows.forEach(r => { stats[r.status] = parseInt(r.count); stats.total += parseInt(r.count); });
  res.json(stats);
});

// GET /api/trucks/:id
router.get('/:id', allStaff, async (req, res) => {
  const { rows } = await query(
    `SELECT t.*, u.full_name AS driver_name, u.email AS driver_email
       FROM trucks t LEFT JOIN users u ON t.driver_id = u.id WHERE t.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Truck not found' });
  if (req.user.role === 'driver' && rows[0].driver_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json(rows[0]);
});

// GET /api/trucks/:id/journeys
router.get('/:id/journeys', allStaff, async (req, res) => {
  const { rows } = await query(
    `SELECT j.*, u.full_name AS driver_name, c.company_name AS client_name
       FROM journeys j
       LEFT JOIN users u ON j.driver_id = u.id
       LEFT JOIN clients c ON j.client_id = c.id
      WHERE j.truck_id = $1
      ORDER BY j.scheduled_date DESC, j.created_at DESC LIMIT 200`,
    [req.params.id]
  );
  res.json(rows);
});

// GET /api/trucks/:id/profitability — reads the truck_profitability view
router.get('/:id/profitability', financeOrAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM truck_profitability WHERE truck_id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Truck not found' });
  res.json(rows[0]);
});

// POST /api/trucks — create
router.post('/', fleetOrAbove, [
  body('registration').notEmpty().trim().toUpperCase(),
  body('name').notEmpty().trim(),
  body('type').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    registration, name, type, capacityTons, year, driverId, notes,
    make, model, fuelType, insuranceExpiry, inspectionExpiry,
    defaultCostPerKm, fixedDailyCost, odometerKm,
  } = req.body;

  try {
    const { rows } = await query(
      `INSERT INTO trucks
         (registration, name, type, capacity_tons, year, driver_id, notes,
          make, model, fuel_type, insurance_expiry, inspection_expiry,
          default_cost_per_km, fixed_daily_cost, odometer_km)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        registration, name, type, capacityTons || null, year || null, driverId || null, notes,
        make || null, model || null, fuelType || null, insuranceExpiry || null, inspectionExpiry || null,
        defaultCostPerKm || 0, fixedDailyCost || 0, odometerKm || 0,
      ]
    );
    await auditLog(req.user.id, 'truck.created', 'truck', rows[0].id, { registration }, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Registration already exists' });
    throw err;
  }
});

// PATCH /api/trucks/:id — now includes cost/compliance fields in the allow-list
router.patch('/:id', fleetOrAbove, async (req, res) => {
  // Map camelCase → column for the allowed set.
  const map = {
    status: 'status',
    odometerKm: 'odometer_km',
    driverId: 'driver_id',
    notes: 'notes',
    make: 'make',
    model: 'model',
    fuelType: 'fuel_type',
    capacityTons: 'capacity_tons',
    year: 'year',
    insuranceExpiry: 'insurance_expiry',
    inspectionExpiry: 'inspection_expiry',
    defaultCostPerKm: 'default_cost_per_km',
    fixedDailyCost: 'fixed_daily_cost',
    // also accept snake_case directly (back-compat with existing fleet page)
    odometer_km: 'odometer_km',
    driver_id: 'driver_id',
  };

  const updates = {};
  Object.entries(map).forEach(([k, col]) => {
    if (req.body[k] !== undefined) updates[col] = req.body[k] === '' ? null : req.body[k];
  });

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields' });

  const cols = Object.keys(updates);
  const set = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const values = [...Object.values(updates), req.params.id];

  const { rows } = await query(
    `UPDATE trucks SET ${set} WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows.length) return res.status(404).json({ error: 'Truck not found' });

  await auditLog(req.user.id, 'truck.updated', 'truck', rows[0].id, updates, req.ip);
  res.json(rows[0]);
});

// DELETE /api/trucks/:id (super_admin only)
router.delete('/:id', adminOnly, async (req, res) => {
  const { rows } = await query('DELETE FROM trucks WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Truck not found' });
  res.json({ message: 'Truck deleted' });
});

module.exports = router;
