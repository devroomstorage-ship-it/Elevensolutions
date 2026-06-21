// ─── users.js ────────────────────────────────────────────────────────────────
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, adminOnly, allStaff, auditLog } = require('../middleware/auth');

const usersRouter = express.Router();
usersRouter.use(authenticate);

// GET /api/users
usersRouter.get('/', allStaff, async (req, res) => {
  const { role } = req.query;
  const sql = role
    ? 'SELECT id, email, full_name, role, is_active, last_login, created_at FROM users WHERE role = $1 ORDER BY full_name'
    : 'SELECT id, email, full_name, role, is_active, last_login, created_at FROM users ORDER BY full_name';
  const { rows } = await query(sql, role ? [role] : []);
  res.json(rows);
});

// POST /api/users
usersRouter.post('/', adminOnly, [
  body('email').isEmail().normalizeEmail(),
  body('fullName').notEmpty().trim(),
  body('role').isIn(['super_admin','fleet_manager','finance','planner','driver']),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, fullName, role, password } = req.body;
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await query(
      'INSERT INTO users (email, full_name, role, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, email, full_name, role, is_active',
      [email, fullName, role, hash]
    );
    await auditLog(req.user.id, 'user.created', 'user', rows[0].id, { email, role }, req.ip);
    res.status(201).json(rows[0]);
  } catch(err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    throw err;
  }
});

// PATCH /api/users/:id
usersRouter.patch('/:id', adminOnly, async (req, res) => {
  const { role, isActive } = req.body;
  const setClauses = [];
  const params = [];
  if (role !== undefined)     { params.push(role);     setClauses.push(`role = $${params.length}`); }
  if (isActive !== undefined) { params.push(isActive); setClauses.push(`is_active = $${params.length}`); }
  if (!setClauses.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  const { rows } = await query(
    `UPDATE users SET ${setClauses.join(',')} WHERE id = $${params.length} RETURNING id, email, full_name, role, is_active`,
    params
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  await auditLog(req.user.id, 'user.updated', 'user', rows[0].id, req.body, req.ip);
  res.json(rows[0]);
});

module.exports = usersRouter;
