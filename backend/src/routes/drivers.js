const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db');
const { authenticate, fleetOrAbove, adminOnly, allStaff, auditLog } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Shared SELECT that joins a driver user to its profile and current truck.
const DRIVER_SELECT = `
  SELECT u.id, u.full_name, u.email, u.is_active, u.last_login,
         dp.phone, dp.id_passport_number, dp.license_number, dp.license_expiry,
         dp.driver_status, dp.preferred_truck_id, dp.emergency_contact, dp.notes,
         pt.registration AS preferred_truck,
         ct.registration AS current_truck,
         ct.id           AS current_truck_id
  FROM users u
  LEFT JOIN driver_profiles dp ON dp.user_id = u.id
  LEFT JOIN trucks pt ON dp.preferred_truck_id = pt.id
  LEFT JOIN trucks ct ON ct.driver_id = u.id
  WHERE u.role = 'driver'
`;

// GET /api/drivers — list all drivers with profile + truck info
router.get('/', allStaff, async (req, res) => {
  const { rows } = await query(`${DRIVER_SELECT} ORDER BY u.full_name ASC`);
  res.json(rows);
});

// GET /api/drivers/:id — single driver with summary stats
router.get('/:id', allStaff, async (req, res) => {
  const { rows } = await query(`${DRIVER_SELECT} AND u.id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Driver not found' });

  const { rows: stats } = await query(
    `SELECT COUNT(*)::int AS total_journeys,
            COALESCE(SUM(j.distance_km),0) AS total_distance_km,
            COALESCE(SUM(inv.total_amount),0) AS total_revenue
       FROM journeys j
       LEFT JOIN invoices inv ON inv.journey_id = j.id AND inv.status = 'paid'
      WHERE j.driver_id = $1 AND j.status = 'delivered'`,
    [req.params.id]
  );

  res.json({ ...rows[0], stats: stats[0] });
});

// GET /api/drivers/:id/journeys — full journey history for a driver
router.get('/:id/journeys', allStaff, async (req, res) => {
  const { rows } = await query(
    `SELECT j.*, t.registration, t.name AS truck_name, c.company_name AS client_name
       FROM journeys j
       LEFT JOIN trucks t ON j.truck_id = t.id
       LEFT JOIN clients c ON j.client_id = c.id
      WHERE j.driver_id = $1
      ORDER BY j.scheduled_date DESC, j.created_at DESC
      LIMIT 200`,
    [req.params.id]
  );
  res.json(rows);
});

// POST /api/drivers — create a driver user + profile in one transaction
router.post('/', fleetOrAbove, [
  body('fullName').trim().notEmpty().withMessage('Full name is required.'),
  body('email').isEmail().withMessage('Enter a valid email address.').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('phone').optional({ checkFalsy: true }).isString().isLength({ max: 30 }),
  body('preferredTruckId').optional({ checkFalsy: true }).isUUID().withMessage('Invalid truck reference.'),
  body('licenseExpiry').optional({ checkFalsy: true }).isISO8601().withMessage('Licence expiry must be a date.'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // Return a single, human-readable error so the form can show it directly
    const first = errors.array()[0];
    return res.status(400).json({ error: first.msg, field: first.path });
  }

  const {
    fullName, email, password,
    phone, idPassportNumber, licenseNumber, licenseExpiry,
    driverStatus, preferredTruckId, emergencyContact, notes,
  } = req.body;

  try {
    const result = await withTransaction(async (c) => {
      const hash = await bcrypt.hash(password, 12);
      const { rows: userRows } = await c.query(
        `INSERT INTO users (email, full_name, role, password_hash)
         VALUES ($1,$2,'driver',$3)
         RETURNING id, email, full_name, role, is_active`,
        [email, fullName, hash]
      );
      const user = userRows[0];

      await c.query(
        `INSERT INTO driver_profiles
           (user_id, phone, id_passport_number, license_number, license_expiry,
            driver_status, preferred_truck_id, emergency_contact, notes)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6,'active'),$7,$8,$9)`,
        [
          user.id, phone, idPassportNumber, licenseNumber, licenseExpiry || null,
          driverStatus, preferredTruckId || null, emergencyContact, notes,
        ]
      );
      return user;
    });

    await auditLog(req.user.id, 'driver.created', 'user', result.id, { email }, req.ip);
    res.status(201).json(result);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    throw err;
  }
});

// PUT /api/drivers/:id — update profile (and optionally name/email/active)
router.put('/:id', fleetOrAbove, async (req, res) => {
  const id = req.params.id;

  // Map camelCase body keys → driver_profiles columns.
  const profileMap = {
    phone: 'phone',
    idPassportNumber: 'id_passport_number',
    licenseNumber: 'license_number',
    licenseExpiry: 'license_expiry',
    driverStatus: 'driver_status',
    preferredTruckId: 'preferred_truck_id',
    emergencyContact: 'emergency_contact',
    notes: 'notes',
  };

  const profileUpdates = {};
  Object.entries(profileMap).forEach(([k, col]) => {
    if (req.body[k] !== undefined) profileUpdates[col] = req.body[k] === '' ? null : req.body[k];
  });

  const userUpdates = {};
  if (req.body.fullName !== undefined) userUpdates.full_name = req.body.fullName;
  if (req.body.isActive !== undefined) userUpdates.is_active = req.body.isActive;

  if (!Object.keys(profileUpdates).length && !Object.keys(userUpdates).length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  await withTransaction(async (c) => {
    // Ensure a profile row exists (driver may predate this feature).
    await c.query(
      `INSERT INTO driver_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [id]
    );

    if (Object.keys(profileUpdates).length) {
      const set = Object.keys(profileUpdates).map((col, i) => `${col} = $${i + 1}`).join(', ');
      const vals = [...Object.values(profileUpdates), id];
      await c.query(`UPDATE driver_profiles SET ${set} WHERE user_id = $${vals.length}`, vals);
    }
    if (Object.keys(userUpdates).length) {
      const set = Object.keys(userUpdates).map((col, i) => `${col} = $${i + 1}`).join(', ');
      const vals = [...Object.values(userUpdates), id];
      await c.query(`UPDATE users SET ${set} WHERE id = $${vals.length}`, vals);
    }
  });

  await auditLog(req.user.id, 'driver.updated', 'user', id, { ...profileUpdates, ...userUpdates }, req.ip);

  const { rows } = await query(`${DRIVER_SELECT} AND u.id = $1`, [id]);
  res.json(rows[0]);
});

// DELETE /api/drivers/:id — soft delete (never hard-delete a driver with journeys)
router.delete('/:id', adminOnly, async (req, res) => {
  const { rows } = await query(
    `UPDATE users SET is_active = FALSE WHERE id = $1 AND role = 'driver' RETURNING id`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Driver not found' });
  await query(`UPDATE driver_profiles SET driver_status = 'inactive' WHERE user_id = $1`, [req.params.id]);
  await auditLog(req.user.id, 'driver.deactivated', 'user', req.params.id, {}, req.ip);
  res.json({ message: 'Driver deactivated' });
});

module.exports = router;
