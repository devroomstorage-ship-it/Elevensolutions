// Email sender — uses nodemailer (SMTP), with both the FROM addresses AND the
// SMTP server credentials read from site_settings at send-time. Switching from
// Gmail to Safaricom SMTP later is a config change in the portal, no code.
//
// Why not SendGrid: account access is unreliable for new African signups.
// Gmail + App Password works reliably for up to 500 sends/day.

const nodemailer = require('nodemailer');
const dns = require('dns');
const { query } = require('../db');

// Force IPv4 when resolving SMTP hostnames. Render's network (and many other
// cloud hosts) doesn't route IPv6 outbound on default tiers — without this,
// Node's DNS resolver may return Google's IPv6 address first and we get
// ENETUNREACH on connect. family:4 makes the resolver only return IPv4.
const ipv4Lookup = (hostname, options, callback) => {
  // Handle both callback signatures dns.lookup uses.
  if (typeof options === 'function') { callback = options; options = {}; }
  return dns.lookup(hostname, { ...options, family: 4 }, callback);
};

// ─── Settings cache (30s) ─────────────────────────────────────────────────────
let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 30_000;

const KEYS = [
  'email_from_address', 'email_from_name', 'email_reply_to',
  'email_from_quotes', 'email_from_invoices', 'email_from_ack',
  'email_smtp_host', 'email_smtp_port', 'email_smtp_user', 'email_smtp_pass',
];

async function getEmailSettings() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_MS) return _cache;
  try {
    const { rows } = await query(
      "SELECT key, value FROM site_settings WHERE key = ANY($1::text[])",
      [KEYS]
    );
    const m = Object.fromEntries(rows.map(r => [r.key, r.value || '']));
    _cache = {
      defaultAddress: (m.email_from_address || process.env.EMAIL_FROM || '').trim(),
      defaultName:    (m.email_from_name    || process.env.EMAIL_FROM_NAME || 'Eleven Solutions').trim(),
      replyTo:        (m.email_reply_to || '').trim(),
      perPurpose: {
        quotes:   (m.email_from_quotes   || '').trim(),
        invoices: (m.email_from_invoices || '').trim(),
        ack:      (m.email_from_ack      || '').trim(),
      },
      smtp: {
        host: (m.email_smtp_host || process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
        port: Number(m.email_smtp_port || process.env.SMTP_PORT || 465),
        user: (m.email_smtp_user || process.env.SMTP_USER || '').trim(),
        pass: (m.email_smtp_pass || process.env.SMTP_PASS || '').trim(),
      },
    };
    _cacheAt = now;
    return _cache;
  } catch (err) {
    // DB unavailable — fall back to env vars so emails still work in dev
    return {
      defaultAddress: (process.env.EMAIL_FROM || '').trim(),
      defaultName:    (process.env.EMAIL_FROM_NAME || 'Eleven Solutions').trim(),
      replyTo: '',
      perPurpose: { quotes: '', invoices: '', ack: '' },
      smtp: {
        host: (process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
        port: Number(process.env.SMTP_PORT || 465),
        user: (process.env.SMTP_USER || '').trim(),
        pass: (process.env.SMTP_PASS || '').trim(),
      },
    };
  }
}
function invalidateEmailSettingsCache() { _cache = null; _cacheAt = 0; _transporter = null; }

// ─── nodemailer transporter (cached per settings) ─────────────────────────────
let _transporter = null;
let _transporterKey = '';
async function getTransporter() {
  const s = await getEmailSettings();
  const key = `${s.smtp.host}:${s.smtp.port}:${s.smtp.user}`;
  if (_transporter && _transporterKey === key) return _transporter;
  if (!s.smtp.host || !s.smtp.user || !s.smtp.pass) {
    throw new Error('SMTP not configured. Set host, user and password in Settings → Email.');
  }
  _transporter = nodemailer.createTransport({
    host: s.smtp.host,
    port: s.smtp.port,
    secure: s.smtp.port === 465,  // 465 = SSL, 587 = STARTTLS
    auth: { user: s.smtp.user, pass: s.smtp.pass },
    // Force IPv4 — see ipv4Lookup definition above for why.
    // Both options needed: connection itself + TLS upgrade for port 587.
    dnsTimeout: 10000,
    connectionTimeout: 15000,
    socketTimeout: 30000,
    tls: { servername: s.smtp.host },
    lookup: ipv4Lookup,
  });
  _transporterKey = key;
  return _transporter;
}

async function resolveFrom(purpose) {
  const s = await getEmailSettings();
  const override = s.perPurpose[purpose] || '';
  const fromEmail = override || s.defaultAddress || s.smtp.user;
  return {
    from: `"${s.defaultName}" <${fromEmail}>`,
    replyTo: s.replyTo || undefined,
  };
}

// ─── Company contact details (single source of truth for email content) ───────
const COMPANY = {
  name:    'Eleven Solutions Limited',
  address: 'P.O. Box 1977-0203, Ruiru, Kenya',
  phones:  ['0717900400', '0711900400', '0716900400'],
  emails:  ['info@elevensolutions.co.ke', 'elevensolutionltd@gmail.com'],
};
const formatKES = (n) => new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const callOnLine = `Call us on <strong>${COMPANY.phones.join('</strong> or <strong>')}</strong>`;
const footerLine = `${COMPANY.name} · ${COMPANY.address} · ${COMPANY.phones.join(' · ')} · ${COMPANY.emails[0]}`;

// ─── Send: formal PDF quotation ───────────────────────────────────────────────
async function sendQuoteEmail(to, companyName, quote, pdfBuffer) {
  const t = await getTransporter();
  const { from, replyTo } = await resolveFrom('quotes');
  await t.sendMail({
    to, from, replyTo,
    subject: `Quotation ${quote.reference} — ${COMPANY.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:20px;">${COMPANY.name}</h2>
          <p style="color:#8fa3b8;margin:6px 0 0;font-size:13px;">Corporate Freight &amp; Logistics</p>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">Thank you for your enquiry. Please find your quotation attached.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;width:140px;">Reference</td><td style="padding:8px 12px;font-size:13px;color:#333;font-weight:bold;">${quote.reference}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Issued</td><td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(quote.created_at)}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Valid until</td><td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(quote.valid_until)}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Route</td><td style="padding:8px 12px;font-size:13px;color:#333;">${quote.origin} → ${quote.destination}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Cargo</td><td style="padding:8px 12px;font-size:13px;color:#333;">${quote.cargo_type || 'General Freight'}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Amount</td><td style="padding:8px 12px;font-size:14px;color:#E8620A;font-weight:bold;">${formatKES(quote.amount)}</td></tr>
          </table>
          <p style="color:#444;font-size:13px;">To accept this quotation, please reply to this email or ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;border-radius:0 0 8px 8px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
    attachments: [{ filename: `Quotation-${quote.reference}.pdf`, content: pdfBuffer }],
  });
}

// ─── Send: acknowledgement (instant on form submit) ───────────────────────────
async function sendQuoteAcknowledgement(to, companyName, reference) {
  // If SMTP isn't configured, silently skip — don't break the public form.
  try { await getTransporter(); } catch { return; }
  const t = await getTransporter();
  const { from, replyTo } = await resolveFrom('ack');
  await t.sendMail({
    to, from, replyTo,
    subject: `We received your request [${reference}] — ${COMPANY.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;"><h2 style="color:#fff;margin:0;">${COMPANY.name}</h2></div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">We have received your quotation request <strong>${reference}</strong> and our team is preparing your quote.</p>
          <p style="color:#444;">You will receive a formal quotation with pricing within <strong>2 business hours</strong>.</p>
          <p style="color:#444;">If you need urgent assistance, ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
  });
}

// ─── Send: invoice PDF ────────────────────────────────────────────────────────
async function sendInvoiceEmail(to, companyName, invoice, pdfBuffer) {
  const t = await getTransporter();
  const { from, replyTo } = await resolveFrom('invoices');
  await t.sendMail({
    to, from, replyTo,
    subject: `Invoice ${invoice.reference} — ${COMPANY.name}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0F1E2E;padding:24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;">${COMPANY.name}</h2>
          <p style="color:#8fa3b8;margin:6px 0 0;font-size:13px;">Invoice</p>
        </div>
        <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;">
          <p style="color:#444;">Dear <strong>${companyName}</strong>,</p>
          <p style="color:#444;">Please find your invoice attached.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;width:140px;">Invoice No.</td><td style="padding:8px 12px;font-size:13px;font-weight:bold;color:#333;">${invoice.reference}</td></tr>
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Issued</td><td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(invoice.created_at)}</td></tr>
            ${invoice.due_date ? `<tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Due</td><td style="padding:8px 12px;font-size:13px;color:#333;">${formatDate(invoice.due_date)}</td></tr>` : ''}
            <tr><td style="padding:8px 12px;background:#f4f6f9;font-size:13px;color:#666;">Amount</td><td style="padding:8px 12px;font-size:14px;color:#E8620A;font-weight:bold;">${formatKES(invoice.amount)}</td></tr>
          </table>
          <p style="color:#444;font-size:13px;">For any questions about this invoice, ${callOnLine.toLowerCase()}.</p>
        </div>
        <div style="background:#f4f6f9;padding:16px;border-radius:0 0 8px 8px;text-align:center;">
          <p style="color:#888;font-size:11px;margin:0;">${footerLine}</p>
        </div>
      </div>`,
    attachments: [{ filename: `Invoice-${invoice.reference}.pdf`, content: pdfBuffer }],
  });
}

// ─── Test send (used by the settings page "Send test" button) ─────────────────
async function sendTestEmail(to, purpose = 'quotes') {
  const t = await getTransporter();
  const { from, replyTo } = await resolveFrom(purpose);
  await t.sendMail({
    to, from, replyTo,
    subject: `Test email from ${COMPANY.name}`,
    text: `This is a test email sent from ${from} for purpose "${purpose}". If you received this, your email settings are working.`,
    html: `<p>This is a test email sent from <strong>${from}</strong> for purpose <code>${purpose}</code>.<br>If you received this, your email settings are working.</p>`,
  });
}

// ─── Verify SMTP credentials without sending anything ─────────────────────────
async function verifySmtp() {
  const t = await getTransporter();
  await t.verify();
  return true;
}

module.exports = {
  sendQuoteEmail,
  sendQuoteAcknowledgement,
  sendInvoiceEmail,
  sendTestEmail,
  getEmailSettings,
  invalidateEmailSettingsCache,
  verifySmtp,
};
