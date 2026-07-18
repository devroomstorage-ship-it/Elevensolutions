const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, adminOnly, financeOrAdmin, allStaff, auditLog } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC (no auth) — consumed by the marketing site
//   GET /api/content/site   → everything the public site needs in one payload
// ─────────────────────────────────────────────────────────────────────────────
router.get('/site', async (req, res) => {
  try {
    const [settings, sections, services, areas, testimonials] = await Promise.all([
      // Never expose SMTP credentials or internal pricing inputs on the
      // public payload — everything else in site_settings is site content.
      query(`SELECT key, value, value_type, group_name FROM site_settings
             WHERE key NOT IN ('email_smtp_host','email_smtp_port','email_smtp_user','email_smtp_pass')
               AND group_name <> 'pricing'`),
      query("SELECT page, section_key, heading, subheading, body, media_url, data, sort_order FROM site_sections WHERE is_published = TRUE ORDER BY sort_order"),
      query('SELECT slug, title, tagline, description, icon, image_url, features, sort_order FROM site_services WHERE is_published = TRUE ORDER BY sort_order'),
      query('SELECT name, country, region, lat, lng, is_hub FROM service_areas WHERE is_published = TRUE ORDER BY sort_order'),
      query('SELECT author, company, role, quote, rating FROM site_testimonials WHERE is_published = TRUE ORDER BY sort_order'),
    ]);

    // Fold settings into a flat key→value object for easy frontend use.
    const settingsObj = {};
    settings.rows.forEach(r => { settingsObj[r.key] = r.value; });

    res.json({
      settings: settingsObj,
      sections: sections.rows,
      services: services.rows,
      areas: areas.rows,
      testimonials: testimonials.rows,
    });
  } catch (err) {
    console.error('content/site error:', err);
    res.status(500).json({ error: 'Could not load site content' });
  }
});

// GET /api/content/pricing — global pricing inputs for the journey planner
router.get('/pricing', authenticate, allStaff, async (req, res) => {
  const { rows } = await query(
    "SELECT value FROM site_settings WHERE key = 'fuel_price_per_litre'"
  );
  res.json({ fuelPricePerLitre: Number(rows[0]?.value) || 200 });
});

// GET /api/content/service/:slug — single service detail page
router.get('/service/:slug', async (req, res) => {
  const { rows } = await query(
    'SELECT slug, title, tagline, description, icon, image_url, features FROM site_services WHERE slug = $1 AND is_published = TRUE',
    [req.params.slug]
  );
  if (!rows.length) return res.status(404).json({ error: 'Service not found' });
  res.json(rows[0]);
});

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL (auth) — CMS editor. Staff read everything (incl. unpublished),
// finance/admin write. All edits audit-logged.
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/content/admin/all — full editable content set
router.get('/admin/all', authenticate, allStaff, async (req, res) => {
  const [settings, sections, services, areas, testimonials] = await Promise.all([
    query('SELECT * FROM site_settings ORDER BY group_name, key'),
    query('SELECT * FROM site_sections ORDER BY page, sort_order'),
    query('SELECT * FROM site_services ORDER BY sort_order'),
    query('SELECT * FROM service_areas ORDER BY sort_order'),
    query('SELECT * FROM site_testimonials ORDER BY sort_order'),
  ]);
  res.json({
    settings: settings.rows, sections: sections.rows, services: services.rows,
    areas: areas.rows, testimonials: testimonials.rows,
  });
});

// PUT /api/content/admin/settings — bulk upsert key/value settings
router.patch('/admin/settings', authenticate, financeOrAdmin, async (req, res) => {
  const { settings } = req.body; // [{ key, value }]
  if (!Array.isArray(settings)) return res.status(400).json({ error: 'settings must be an array' });

  for (const s of settings) {
    await query(
      `UPDATE site_settings SET value = $1, updated_by = $2, updated_at = NOW() WHERE key = $3`,
      [s.value, req.user.id, s.key]
    );
  }
  await auditLog(req.user.id, 'content.settings_updated', 'site_settings', null, { count: settings.length }, req.ip);
  res.json({ message: 'Settings saved', count: settings.length });
});

// PUT /api/content/admin/section/:id — update a page section
router.patch('/admin/section/:id', authenticate, financeOrAdmin, async (req, res) => {
  const { heading, subheading, body: bodyText, mediaUrl, data, isPublished } = req.body;
  const { rows } = await query(
    `UPDATE site_sections SET
       heading = COALESCE($1, heading),
       subheading = COALESCE($2, subheading),
       body = COALESCE($3, body),
       media_url = COALESCE($4, media_url),
       data = COALESCE($5, data),
       is_published = COALESCE($6, is_published),
       updated_by = $7
     WHERE id = $8 RETURNING *`,
    [heading, subheading, bodyText, mediaUrl, data ? JSON.stringify(data) : null,
     isPublished, req.user.id, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Section not found' });
  await auditLog(req.user.id, 'content.section_updated', 'site_sections', req.params.id, {}, req.ip);
  res.json(rows[0]);
});

// POST /api/content/admin/service — create a service
router.post('/admin/service', authenticate, financeOrAdmin, [
  body('slug').notEmpty().trim().toLowerCase(),
  body('title').notEmpty().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { slug, title, tagline, description, icon, imageUrl, features, sortOrder } = req.body;
  try {
    const { rows } = await query(
      `INSERT INTO site_services (slug, title, tagline, description, icon, image_url, features, sort_order, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [slug, title, tagline, description, icon, imageUrl,
       JSON.stringify(features || []), sortOrder || 0, req.user.id]
    );
    await auditLog(req.user.id, 'content.service_created', 'site_services', rows[0].id, { slug }, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A service with that slug exists' });
    throw err;
  }
});

// PUT /api/content/admin/service/:id — update a service
router.patch('/admin/service/:id', authenticate, financeOrAdmin, async (req, res) => {
  const { title, tagline, description, icon, imageUrl, features, sortOrder, isPublished } = req.body;
  const { rows } = await query(
    `UPDATE site_services SET
       title = COALESCE($1, title),
       tagline = COALESCE($2, tagline),
       description = COALESCE($3, description),
       icon = COALESCE($4, icon),
       image_url = COALESCE($5, image_url),
       features = COALESCE($6, features),
       sort_order = COALESCE($7, sort_order),
       is_published = COALESCE($8, is_published),
       updated_by = $9
     WHERE id = $10 RETURNING *`,
    [title, tagline, description, icon, imageUrl,
     features ? JSON.stringify(features) : null, sortOrder, isPublished, req.user.id, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Service not found' });
  await auditLog(req.user.id, 'content.service_updated', 'site_services', req.params.id, {}, req.ip);
  res.json(rows[0]);
});

// DELETE /api/content/admin/service/:id
router.delete('/admin/service/:id', authenticate, adminOnly, async (req, res) => {
  const { rows } = await query('DELETE FROM site_services WHERE id = $1 RETURNING id', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Service not found' });
  await auditLog(req.user.id, 'content.service_deleted', 'site_services', req.params.id, {}, req.ip);
  res.json({ message: 'Service deleted' });
});

module.exports = router;
