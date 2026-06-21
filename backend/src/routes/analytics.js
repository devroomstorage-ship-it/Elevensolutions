const express = require('express');
const { query } = require('../db');
const { authenticate, financeOrAdmin, adminOnly, auditLog } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// POST /api/analytics/refresh — run the ETL that rebuilds the star schema.
// Schedule this nightly in production (pg_cron / external scheduler) instead of
// calling it by hand; exposed here so staff can force a refresh on demand.
router.post('/refresh', adminOnly, async (req, res) => {
  const from = req.body?.from || '2024-01-01';
  try {
    await query('SELECT analytics.refresh_analytics($1)', [from]);
    await auditLog(req.user.id, 'analytics.refreshed', 'analytics', null, { from }, req.ip);
    res.json({ message: 'Analytics refreshed', from });
  } catch (err) {
    console.error('analytics refresh error:', err);
    res.status(500).json({ error: 'Refresh failed: ' + err.message });
  }
});

// GET /api/analytics/revenue-monthly
router.get('/revenue-monthly', financeOrAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM analytics.vw_revenue_monthly');
  res.json(rows);
});

// GET /api/analytics/route-performance
router.get('/route-performance', financeOrAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM analytics.vw_route_performance LIMIT 50');
  res.json(rows);
});

// GET /api/analytics/quote-conversion
router.get('/quote-conversion', financeOrAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM analytics.vw_quote_conversion');
  res.json(rows);
});

// GET /api/analytics/fleet-utilisation
router.get('/fleet-utilisation', financeOrAdmin, async (req, res) => {
  const { rows } = await query('SELECT * FROM analytics.vw_fleet_utilisation');
  res.json(rows);
});

// GET /api/analytics/revenue-daily — tidy series for charts/forecasting
router.get('/revenue-daily', financeOrAdmin, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM analytics.vw_revenue_daily WHERE date >= CURRENT_DATE - 180 ORDER BY date'
  );
  res.json(rows);
});

module.exports = router;
