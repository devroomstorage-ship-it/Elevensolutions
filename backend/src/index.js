require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first');
// Also force IPv4 only for outbound sockets — Render doesn't route IPv6.
const dns = require('dns');
const _origLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') { callback = options; options = {}; }
  if (typeof options === 'number')   { options = { family: options }; }
  return _origLookup.call(dns, hostname, { ...options, family: 4 }, callback);
};
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes        = require('./routes/auth');
const trucksRoutes      = require('./routes/trucks');
const journeysRoutes    = require('./routes/journeys');
const quotesRoutes      = require('./routes/quotes');
const invoicesRoutes    = require('./routes/invoices');
const clientsRoutes     = require('./routes/clients');
const usersRoutes       = require('./routes/users');
const dashboardRoutes   = require('./routes/dashboard');
const qbRoutes          = require('./routes/quickbooks');
const driversRoutes     = require('./routes/drivers');      // NEW
const assignmentsRoutes = require('./routes/assignments');  // NEW
const contentRoutes     = require('./routes/content');      // NEW — CMS + public site content
const emailSettingsRoutes = require('./routes/emailSettings'); // NEW — sender email config
const analyticsRoutes   = require('./routes/analytics');    // NEW — BI refresh + summaries

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// ─── Rate limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
});

app.use(globalLimiter);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',        authLimiter, authRoutes);
app.use('/api/trucks',      trucksRoutes);
app.use('/api/journeys',    journeysRoutes);
app.use('/api/quotes',      quotesRoutes);
app.use('/api/invoices',    invoicesRoutes);
app.use('/api/clients',     clientsRoutes);
app.use('/api/users',       usersRoutes);
app.use('/api/dashboard',   dashboardRoutes);
app.use('/api/quickbooks',  qbRoutes);
app.use('/api/drivers',     driversRoutes);      // NEW
app.use('/api/assignments', assignmentsRoutes);  // NEW
app.use('/api/content',     contentRoutes);      // NEW
app.use('/api/email-settings', emailSettingsRoutes); // NEW
app.use('/api/analytics',   analyticsRoutes);    // NEW

// ─── Public quote submission (no auth required) ───────────────────────────────
app.use('/api/public', require('./routes/public'));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Eleven Solutions API running on port ${PORT} [${process.env.NODE_ENV}]`);
});
