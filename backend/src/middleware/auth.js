const jwt = require('jsonwebtoken');
const { query } = require('../db');

// Verify access token
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Fetch fresh user record to catch deactivated accounts
    const { rows } = await query(
      'SELECT id, email, full_name, role, is_active FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'Account not found or deactivated' });
    }
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based access control
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Shorthand role guards
const adminOnly    = requireRole('super_admin');
const financeOrAdmin = requireRole('super_admin', 'finance');
const plannerOrAbove = requireRole('super_admin', 'fleet_manager', 'planner');
const fleetOrAbove   = requireRole('super_admin', 'fleet_manager');
const allStaff       = requireRole('super_admin', 'fleet_manager', 'finance', 'planner', 'driver');

// Audit logging helper
const auditLog = async (userId, action, entityType, entityId, details, ip) => {
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entityType, entityId, details ? JSON.stringify(details) : null, ip]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
};

module.exports = {
  authenticate,
  requireRole,
  adminOnly,
  financeOrAdmin,
  plannerOrAbove,
  fleetOrAbove,
  allStaff,
  auditLog,
};
