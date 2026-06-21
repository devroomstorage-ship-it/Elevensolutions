const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db');
const { authenticate, fleetOrAbove, allStaff, auditLog } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// POST /api/assignments/driver-truck — set the current keeper of a truck.
// Closes any open assignment on the truck, opens a new one, and reflects the
// keeper on trucks.driver_id. The partial unique index on the table guarantees
// at most one open assignment per truck even under concurrency.
router.post('/driver-truck', fleetOrAbove, [
  body('driverId').isUUID(),
  body('truckId').isUUID(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { driverId, truckId, notes } = req.body;

  // Concurrency: two staff hitting "assign" at the same moment can both close
  // the previous open assignment and race to INSERT, hitting the partial unique
  // index. Postgres returns 23505 — retry once; the second attempt will see
  // the winner's open row and close it before its own INSERT.
  const attempt = async () => withTransaction(async (c) => {
      // Validate both sides exist and are the right kind.
      const { rows: drv } = await c.query(
        `SELECT id FROM users WHERE id = $1 AND role = 'driver' AND is_active = TRUE`,
        [driverId]
      );
      if (!drv.length) throw Object.assign(new Error('Active driver not found'), { status: 404 });

      const { rows: trk } = await c.query('SELECT id FROM trucks WHERE id = $1', [truckId]);
      if (!trk.length) throw Object.assign(new Error('Truck not found'), { status: 404 });

      // Lock the truck row so concurrent assigns serialize on it.
      await c.query('SELECT id FROM trucks WHERE id = $1 FOR UPDATE', [truckId]);

      // 1. close the truck's open assignment, if any
      await c.query(
        `UPDATE driver_truck_assignments SET unassigned_at = NOW()
          WHERE truck_id = $1 AND unassigned_at IS NULL`,
        [truckId]
      );
      // 2. open the new assignment
      const { rows } = await c.query(
        `INSERT INTO driver_truck_assignments (driver_id, truck_id, assigned_by, notes)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [driverId, truckId, req.user.id, notes || null]
      );
      // 3. reflect current keeper on the truck
      await c.query('UPDATE trucks SET driver_id = $1 WHERE id = $2', [driverId, truckId]);
      return rows[0];
    });

  try {
    let result;
    try {
      result = await attempt();
    } catch (e) {
      // 23505 = unique_violation. The FOR UPDATE lock above prevents this in
      // typical cases, but a previous crashed transaction could leave the
      // window open. Retry once and bail if it still fails.
      if (e.code === '23505') {
        result = await attempt();
      } else {
        throw e;
      }
    }

    await auditLog(req.user.id, 'assignment.created', 'truck', truckId, { driverId }, req.ip);
    res.status(201).json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Could not complete assignment. Please try again.' });
  }
});

// POST /api/assignments/unassign — close the open assignment for a truck
// without opening a new one. The truck is now keeper-less until next assign.
router.post('/unassign', fleetOrAbove, [
  body('truckId').isUUID(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { truckId, notes } = req.body;

  try {
    const result = await withTransaction(async (c) => {
      const { rows: trk } = await c.query('SELECT id, driver_id FROM trucks WHERE id = $1', [truckId]);
      if (!trk.length) throw Object.assign(new Error('Truck not found'), { status: 404 });

      const prevDriverId = trk[0].driver_id;

      // Close any open assignment, attach the close-reason note if provided.
      const { rows: closed } = await c.query(
        `UPDATE driver_truck_assignments
            SET unassigned_at = NOW(),
                notes = CASE WHEN $2::text IS NOT NULL
                             THEN COALESCE(notes || E'\n', '') || 'Unassigned: ' || $2
                             ELSE notes END
          WHERE truck_id = $1 AND unassigned_at IS NULL
        RETURNING *`,
        [truckId, notes || null]
      );

      // Clear keeper on the truck record (idempotent — null if already null).
      await c.query('UPDATE trucks SET driver_id = NULL WHERE id = $1', [truckId]);

      return { closedAssignment: closed[0] || null, previousDriverId: prevDriverId };
    });

    await auditLog(req.user.id, 'assignment.closed', 'truck', truckId, result, req.ip);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// GET /api/assignments/history — filter by driverId and/or truckId
router.get('/history', allStaff, async (req, res) => {
  const { driverId, truckId } = req.query;
  const cond = [];
  const params = [];
  if (driverId) { params.push(driverId); cond.push(`a.driver_id = $${params.length}`); }
  if (truckId)  { params.push(truckId);  cond.push(`a.truck_id  = $${params.length}`); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';

  const { rows } = await query(
    `SELECT a.*, u.full_name AS driver_name, t.registration, t.name AS truck_name,
            ab.full_name AS assigned_by_name
       FROM driver_truck_assignments a
       JOIN users u  ON a.driver_id = u.id
       JOIN trucks t ON a.truck_id  = t.id
       LEFT JOIN users ab ON a.assigned_by = ab.id
       ${where}
      ORDER BY a.assigned_at DESC
      LIMIT 300`,
    params
  );
  res.json(rows);
});

module.exports = router;
