const express = require('express');
const { query } = require('../db');
const { authenticate, allStaff } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, allStaff);

// GET /api/dashboard/summary
router.get('/summary', async (req, res) => {
  const [trucks, trips, revenue, openInvoices, recentActivity] = await Promise.all([
    query(`SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'available') AS available,
      COUNT(*) FILTER (WHERE status IN ('on_route','loading')) AS active,
      COUNT(*) FILTER (WHERE status = 'maintenance') AS maintenance
    FROM trucks`),

    query(`SELECT COUNT(*) AS count FROM journeys
      WHERE scheduled_date >= date_trunc('month', NOW())`),

    query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM invoices
      WHERE status = 'paid' AND paid_date >= date_trunc('month', NOW())`),

    query(`SELECT COUNT(*) AS count, COALESCE(SUM(total_amount),0) AS amount
      FROM invoices WHERE status IN ('sent','overdue')`),

    query(`
      (SELECT 'journey' AS type, j.reference, j.origin || ' → ' || j.destination AS detail,
              t.name AS truck, j.created_at
       FROM journeys j LEFT JOIN trucks t ON j.truck_id = t.id
       ORDER BY j.created_at DESC LIMIT 5)
      UNION ALL
      (SELECT 'quote' AS type, reference, company_name AS detail, NULL, created_at
       FROM quotations ORDER BY created_at DESC LIMIT 5)
      UNION ALL
      (SELECT 'invoice' AS type, reference, c.company_name AS detail, NULL, i.created_at
       FROM invoices i JOIN clients c ON i.client_id = c.id ORDER BY i.created_at DESC LIMIT 5)
      ORDER BY created_at DESC LIMIT 10
    `),
  ]);

  res.json({
    trucks: trucks.rows[0],
    tripsThisMonth: parseInt(trips.rows[0].count),
    revenueThisMonth: parseFloat(revenue.rows[0].total),
    openInvoices: {
      count: parseInt(openInvoices.rows[0].count),
      amount: parseFloat(openInvoices.rows[0].amount),
    },
    recentActivity: recentActivity.rows,
  });
});

module.exports = router;
