// PDF generation for quotations and invoices.
// Uses pdfkit (pure JS, no Chrome / Puppeteer needed). Works on Render free
// tier, Windows laptops, and any other environment without browser deps.

const PDFDocument = require('pdfkit');

// ─── Real company contact details (must match emails) ─────────────────────────
const COMPANY = {
  name:    'Eleven Solutions Limited',
  tagline: 'Corporate Freight & Logistics',
  address: 'P.O. Box 1977-0203, Ruiru, Kenya',
  phones:  ['0717900400', '0711900400', '0716900400'],
  emails:  ['info@elevensolutions.co.ke', 'elevensolutionltd@gmail.com'],
};

const fmtKES = (n) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

// Brand colors
const PLUM   = '#0F1E2E';
const ORANGE = '#E8620A';
const MUTED  = '#666666';
const SOFT   = '#F4F6F9';

function buildHeader(doc, title) {
  // Dark plum banner
  doc.rect(50, 50, 500, 70).fill(PLUM);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(18).text(COMPANY.name, 70, 65);
  doc.font('Helvetica').fontSize(9).fillColor('#8fa3b8')
    .text(`${COMPANY.tagline} · ${COMPANY.address}`, 70, 88, { width: 460 })
    .text(`${COMPANY.phones.join(' · ')} · ${COMPANY.emails[0]}`, 70, 102, { width: 460 });

  // Document title in brand orange
  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(24).text(title, 50, 140);
}

function buildFooter(doc) {
  const y = 760;
  doc.moveTo(50, y).lineTo(550, y).strokeColor(ORANGE).lineWidth(1.5).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(`${COMPANY.name} · ${COMPANY.address}`, 50, y + 10, { align: 'center', width: 500 })
    .text(`${COMPANY.phones.join(' · ')} · ${COMPANY.emails.join(' · ')}`, 50, y + 24, { align: 'center', width: 500 });
}

// Two-column key/value grid
function buildGrid(doc, rows, startY) {
  let y = startY;
  const colW = 240;
  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i], right = rows[i + 1];
    const boxH = 40;
    doc.rect(50, y, colW, boxH).fill(SOFT);
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(left.label.toUpperCase(), 60, y + 7);
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(11).text(String(left.value ?? '—'), 60, y + 19, { width: colW - 20 });
    if (right) {
      doc.rect(310, y, colW, boxH).fill(SOFT);
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(right.label.toUpperCase(), 320, y + 7);
      doc.fillColor('#333').font('Helvetica-Bold').fontSize(11).text(String(right.value ?? '—'), 320, y + 19, { width: colW - 20 });
    }
    y += boxH + 8;
  }
  return y;
}

function bufferFromDoc(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// ─── Quote PDF ────────────────────────────────────────────────────────────────
const generateQuotePDF = async (quote) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  buildHeader(doc, 'QUOTATION');

  // Reference + status pill
  doc.fillColor(MUTED).font('Helvetica').fontSize(11)
    .text(`Reference: ${quote.reference}`, 50, 175);

  // Two-column grid
  const gridEnd = buildGrid(doc, [
    { label: 'Issued',      value: fmtDate(quote.created_at) },
    { label: 'Valid until', value: fmtDate(quote.valid_until) },
    { label: 'Client',      value: quote.company_name || quote.client_name || '—' },
    { label: 'Email',       value: quote.contact_email || '—' },
    { label: 'Origin',      value: quote.origin },
    { label: 'Destination', value: quote.destination },
    { label: 'Cargo',       value: quote.cargo_type || 'General Freight' },
    { label: 'Weight',      value: quote.weight_tons ? `${quote.weight_tons} tonnes` : '—' },
  ], 200);

  // Amount block
  doc.rect(50, gridEnd + 10, 500, 60).fill(PLUM);
  doc.fillColor('white').font('Helvetica').fontSize(10)
    .text('QUOTED AMOUNT (KES)', 70, gridEnd + 22);
  doc.font('Helvetica-Bold').fontSize(26).fillColor(ORANGE)
    .text(fmtKES(quote.amount), 70, gridEnd + 38);

  // Notes
  if (quote.notes) {
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(11).text('Notes', 50, gridEnd + 90);
    doc.font('Helvetica').fontSize(10).fillColor('#555')
      .text(quote.notes, 50, gridEnd + 105, { width: 500 });
  }

  // Acceptance line
  doc.fillColor('#444').font('Helvetica').fontSize(10)
    .text(`To accept this quotation, reply to ${COMPANY.emails[0]} or call us on ${COMPANY.phones[0]} or ${COMPANY.phones[1]}.`,
      50, 700, { width: 500 });

  buildFooter(doc);
  return bufferFromDoc(doc);
};

// ─── Invoice PDF ──────────────────────────────────────────────────────────────
const generateInvoicePDF = async (invoice) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  buildHeader(doc, 'INVOICE');

  doc.fillColor(MUTED).font('Helvetica').fontSize(11)
    .text(`Invoice No: ${invoice.reference}`, 50, 175);

  const gridEnd = buildGrid(doc, [
    { label: 'Issued',      value: fmtDate(invoice.created_at) },
    { label: 'Due',         value: fmtDate(invoice.due_date) },
    { label: 'Client',      value: invoice.company_name || invoice.client_name || '—' },
    { label: 'Email',       value: invoice.contact_email || invoice.client_email || '—' },
    { label: 'Status',      value: (invoice.status || 'pending').toUpperCase() },
    { label: 'Reference',   value: invoice.journey_reference || '—' },
  ], 200);

  doc.rect(50, gridEnd + 10, 500, 60).fill(PLUM);
  doc.fillColor('white').font('Helvetica').fontSize(10)
    .text('AMOUNT DUE (KES)', 70, gridEnd + 22);
  doc.font('Helvetica-Bold').fontSize(26).fillColor(ORANGE)
    .text(fmtKES(invoice.amount), 70, gridEnd + 38);

  doc.fillColor('#444').font('Helvetica').fontSize(10)
    .text(`Payment via M-Pesa Paybill or bank transfer. For queries, call ${COMPANY.phones[0]} or email ${COMPANY.emails[0]}.`,
      50, 700, { width: 500 });

  buildFooter(doc);
  return bufferFromDoc(doc);
};

module.exports = { generateQuotePDF, generateInvoicePDF };
