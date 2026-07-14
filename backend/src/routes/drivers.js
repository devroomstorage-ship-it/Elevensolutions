// backend/src/routes/drivers.js
//
// FULL REPLACEMENT. Adds a proper PATCH endpoint so driver fields (name,
// email, phone, licence, status, notes, preferred truck, active flag) can
// all be edited from the portal.
//
// The important thing: driver identity lives across TWO tables — `users` for
// name/email/password/active/phone, `driver_profiles` for licence/status/notes.
// This route updates both in one transaction so the UI can send a flat body
// and not think about it.

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db');
const {
  authenticate,
  fleetOrAbove,
  allStaff,
  auditLog,
} = require('../middleware/auth');
const { normalizeKenyanPhone } = require('../services/phone');

const router = express.Router();
router.use(authenticate);

// Common SELECT — one row per driver joining users + driver_profiles + their
// currently assigned truck.
const DRIVER_SELECT = `
  SELECT
    u.id, u.full_name, u.email, dp.phone, u.is_active,
    dp.driver_status, dp.id_passport_number, dp.license_number,
    dp.license_expiry, dp.emergency_contact, dp.notes,
    dp.preferred_truck_id,
    t.registration AS current_truck,
    t.id          AS current_truck_id
  FROM users u
  LEFT JOIN driver_profiles dp ON dp.user_id = u.id
  LEFT JOIN driver_truck_assignments dta
      ON dta.driver_id = u.id AND dta.unassigned_at IS NULL
  LEFT JOIN trucks t ON t.id = dta.truck_id
  WHERE u.role = 'driver'
`;

// GET /api/drivers
router.get('/', allStaff, async (_req, res) => {
  try {
    const { rows } = await query(`${DRIVER_SELECT} ORDER BY u.full_name ASC`);
    res.json(rows);
  } catch (err) {
    console.error('driver list error:', err);
    res.status(500).json({ error: 'Could not load drivers.' });
  }
});

// GET /api/drivers/:id
router.get('/:id', allStaff, async (req, res) => {
  try {
    const { rows } = await query(`${DRIVER_SELECT} AND u.id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Driver not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('driver fetch error:', err);
    res.status(500).json({ error: 'Could not load driver.' });
  }
});

// GET /api/drivers/:id/journeys
router.get('/:id/journeys', allStaff, async (req, res) => {
  const { rows } = await query(
    `SELECT j.*, t.registration
       FROM journeys j
       LEFT JOIN trucks t ON t.id = j.truck_id
      WHERE j.driver_id = $1
      ORDER BY j.scheduled_date DESC
      LIMIT 100`,
    [req.params.id]
  );
  res.json(rows);
});

// POST /api/drivers — create user + profile in one go
router.post('/', fleetOrAbove, [
  body('fullName').trim().notEmpty().withMessage('Full name is required.'),
  body('email').isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('phone').optional({ checkFalsy: true }).isString().isLength({ max: 30 }),
  body('preferredTruckId').optional({ checkFalsy: true }).isUUID().withMessage('Invalid truck reference.'),
  body('licenseExpiry').optional({ checkFalsy: true }).isISO8601().withMessage('Licence expiry must be a date.'),
  body('driverStatus').optional({ checkFalsy: true }).isIn(['active', 'inactive', 'suspended']).withMessage('Status must be active, inactive or suspended.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ error: first.msg, field: first.path });
  }

  const {
    fullName, email, password, phone, idPassportNumber,
    licenseNumber, licenseExpiry, driverStatus, preferredTruckId,
    emergencyContact, notes,
  } = req.body;

  // Normalize phone
  const phoneNorm = phone ? normalizeKenyanPhone(phone) : null;
  if (phone && !phoneNorm) {
    return res.status(400).json({ error: 'Enter a valid Kenyan phone number.', field: 'phone' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await withTransaction(async (c) => {
      const { rows: uRow } = await c.query(
        `INSERT INTO users (email, full_name, role, password_hash, is_active)
         VALUES ($1, $2, 'driver', $3, TRUE) RETURNING id`,
        [email, fullName, hash]
      );
      const userId = uRow[0].id;
      await c.query(
        `INSERT INTO driver_profiles
          (user_id, phone, driver_status, id_passport_number, license_number, license_expiry,
           preferred_truck_id, emergency_contact, notes)
         VALUES ($1, $2, COALESCE($3, 'active'), $4, $5, $6, $7, $8, $9)`,
        [userId, phoneNorm, driverStatus, idPassportNumber || null, licenseNumber || null,
         licenseExpiry || null, preferredTruckId || null, emergencyContact || null, notes || null]
      );
      return userId;
    });
    await auditLog(req.user.id, 'driver.created', 'user', result, { email }, req.ip);
    res.status(201).json({ id: result });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists.', field: 'email' });
    }
    console.error('driver create error:', err);
    res.status(500).json({ error: 'Could not create driver.' });
  }
});

// PATCH /api/drivers/:id  ← the editable one
router.patch('/:id', fleetOrAbove, [
  body('fullName').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 200 }),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email.').normalizeEmail(),
  body('phone').optional({ checkFalsy: true }).isString().isLength({ max: 30 }),
  body('password').optional({ checkFalsy: true }).isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('isActive').optional().isBoolean(),
  body('driverStatus').optional({ checkFalsy: true }).isIn(['active', 'inactive', 'suspended']).withMessage('Status must be active, inactive or suspended.'),
  body('licenseExpiry').optional({ checkFalsy: true }).isISO8601().withMessage('Licence expiry must be a date.'),
  body('preferredTruckId').optional({ nullable: true }).custom(v => v === null || v === '' || /^[0-9a-f-]{36}$/i.test(v)),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ error: first.msg, field: first.path });
  }

  const b = req.body;
  // Normalize phone if given
  let phoneNorm;
  if (b.phone !== undefined) {
    if (b.phone === null || b.phone === '') phoneNorm = null;
    else {
      phoneNorm = normalizeKenyanPhone(b.phone);
      if (!phoneNorm) return res.status(400).json({ error: 'Enter a valid Kenyan phone number.', field: 'phone' });
    }
  }

  try {
    await withTransaction(async (c) => {
      // ── users table ─────────────────────────────────────────────────────────
      const userSets = [];
      const userVals = [];
      const addU = (col, val) => { userVals.push(val); userSets.push(`${col} = $${userVals.length}`); };
      if (b.fullName !== undefined) addU('full_name', b.fullName);
      if (b.email    !== undefined) addU('email', b.email);
      if (b.isActive !== undefined) addU('is_active', !!b.isActive);
      if (b.password) addU('password_hash', await bcrypt.hash(b.password, 12));
      if (userSets.length) {
        userVals.push(req.params.id);
        const { rowCount } = await c.query(
          `UPDATE users SET ${userSets.join(', ')} WHERE id = $${userVals.length} AND role = 'driver'`,
          userVals
        );
        if (!rowCount) throw Object.assign(new Error('Driver not found'), { status: 404 });
      }

      // ── driver_profiles table ───────────────────────────────────────────────
      // A driver_profiles row may or may not exist yet, so upsert.
      const profFields = {};
      if (phoneNorm           !== undefined) profFields.phone = phoneNorm;
      if (b.driverStatus     !== undefined) profFields.driver_status = b.driverStatus;
      if (b.idPassportNumber !== undefined) profFields.id_passport_number = b.idPassportNumber || null;
      if (b.licenseNumber    !== undefined) profFields.license_number = b.licenseNumber || null;
      if (b.licenseExpiry    !== undefined) profFields.license_expiry = b.licenseExpiry || null;
      if (b.emergencyContact !== undefined) profFields.emergency_contact = b.emergencyContact || null;
      if (b.notes            !== undefined) profFields.notes = b.notes || null;
      if (b.preferredTruckId !== undefined) profFields.preferred_truck_id = b.preferredTruckId || null;

      const keys = Object.keys(profFields);
      if (keys.length) {
        // Build: INSERT (user_id, k1, k2) VALUES ($1, $2, $3)
        //        ON CONFLICT (user_id) DO UPDATE SET k1 = EXCLUDED.k1, k2 = EXCLUDED.k2
        const cols = ['user_id', ...keys];
        const vals = [req.params.id, ...keys.map(k => profFields[k])];
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const updateSet = keys.map(k => `${k} = EXCLUDED.${k}`).join(', ');
        await c.query(
          `INSERT INTO driver_profiles (${cols.join(', ')})
           VALUES (${placeholders})
           ON CONFLICT (user_id) DO UPDATE SET ${updateSet}`,
          vals
        );
      }
    });

    // Return the fresh driver row
    const { rows } = await query(`${DRIVER_SELECT} AND u.id = $1`, [req.params.id]);
    await auditLog(req.user.id, 'driver.updated', 'user', req.params.id, b, req.ip);
    res.json(rows[0]);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That email is already in use by another user.', field: 'email' });
    }
    console.error('driver update error:', err);
    res.status(500).json({ error: 'Could not update driver.' });
  }
});

module.exports = router;
