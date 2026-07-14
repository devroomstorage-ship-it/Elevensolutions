// PDF generation for quotations and invoices.
// Uses pdfkit (pure JS, no Chrome / Puppeteer needed).
//
// Invoices carry a diagonal "Eleven Solutions Limited" watermark under the
// content for anti-forgery / brand reinforcement, plus the KRA ETR code if
// staff have pasted one in from the KRA portal.

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
const WATER  = '#E5E9EF';   // very light grey for watermark

// ─── Diagonal watermark ───────────────────────────────────────────────────────
// Draws a subtle repeating watermark diagonally across the page.
// Uses lineBreak:false + a large height option to prevent pdfkit's LineWrapper
// from thinking it needs to advance to a new page during the text() calls.
function drawWatermark(doc, text = COMPANY.name.toUpperCase()) {
  doc.save();
  doc.opacity(0.05);
  doc.fillColor(PLUM).font('Helvetica-Bold').fontSize(38);
  // Diagonal-band feel: 5 repetitions offset step-wise across the page.
  const positions = [
    { x: -80,  y: 130 },
    { x:  40,  y: 260 },
    { x: 160,  y: 390 },
    { x: -80,  y: 520 },
    { x:  40,  y: 650 },
  ];
  for (const p of positions) {
    doc.text(text, p.x, p.y, {
      lineBreak: false,
      width: 700,
      height: 2000,   // trick: tell pdfkit there's plenty of vertical room
    });
  }
  doc.restore();
}

function buildHeader(doc, title) {
  doc.rect(50, 50, 500, 70).fill(PLUM);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(18)
    .text(COMPANY.name, 70, 65, { lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor('#8fa3b8')
    .text(`${COMPANY.tagline} · ${COMPANY.address}`, 70, 88, { width: 460, lineBreak: false })
    .text(`${COMPANY.phones.join(' · ')} · ${COMPANY.emails[0]}`, 70, 102, { width: 460, lineBreak: false });
  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(24)
    .text(title, 50, 140, { lineBreak: false });
}

function buildFooter(doc, extraLine) {
  const y = 760;
  const pageW = 500;
  const leftM = 50;
  doc.moveTo(leftM, y).lineTo(leftM + pageW, y).strokeColor(ORANGE).lineWidth(1.5).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);

  // Center each line manually by measuring width — bypasses LineWrapper
  // which is what causes phantom page breaks with align:'center'.
  const centered = (str, yy) => {
    const w = doc.widthOfString(str);
    doc.text(str, leftM + (pageW - w) / 2, yy, { lineBreak: false, height: 2000 });
  };
  centered(`${COMPANY.name} · ${COMPANY.address}`, y + 10);
  centered(`${COMPANY.phones.join(' · ')} · ${COMPANY.emails.join(' · ')}`, y + 24);
  if (extraLine) centered(extraLine, y + 38);
}

function buildGrid(doc, rows, startY) {
  let y = startY;
  const colW = 240;
  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i], right = rows[i + 1];
    const boxH = 40;
    doc.rect(50, y, colW, boxH).fill(SOFT);
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(left.label.toUpperCase(), 60, y + 7, { lineBreak: false });
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(11)
      .text(String(left.value ?? '—'), 60, y + 19, { width: colW - 20, lineBreak: false });
    if (right) {
      doc.rect(310, y, colW, boxH).fill(SOFT);
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text(right.label.toUpperCase(), 320, y + 7, { lineBreak: false });
      doc.fillColor('#333').font('Helvetica-Bold').fontSize(11)
        .text(String(right.value ?? '—'), 320, y + 19, { width: colW - 20, lineBreak: false });
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
  doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(`Reference: ${quote.reference}`, 50, 175);

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

  doc.rect(50, gridEnd + 10, 500, 60).fill(PLUM);
  doc.fillColor('white').font('Helvetica').fontSize(10).text('QUOTED AMOUNT (KES)', 70, gridEnd + 22);
  doc.font('Helvetica-Bold').fontSize(26).fillColor(ORANGE).text(fmtKES(quote.amount), 70, gridEnd + 38);

  if (quote.notes) {
    doc.fillColor('#333').font('Helvetica-Bold').fontSize(11).text('Notes', 50, gridEnd + 90);
    doc.font('Helvetica').fontSize(10).fillColor('#555').text(quote.notes, 50, gridEnd + 105, { width: 500 });
  }

  doc.fillColor('#444').font('Helvetica').fontSize(10)
    .text(`To accept this quotation, reply to ${COMPANY.emails[0]} or call us on ${COMPANY.phones[0]} or ${COMPANY.phones[1]}.`,
      50, 700, { width: 500 });

  buildFooter(doc);
  return bufferFromDoc(doc);
};

// ─── Invoice PDF (with watermark + optional KRA ETR code) ────────────────────
const generateInvoicePDF = async (invoice) => {
  // bufferPages:true lets us go back to page 0 at the end to overlay the
  // watermark. Without it, pdfkit auto-advances and the watermark ends up
  // pushed onto a new page.
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

  buildHeader(doc, 'INVOICE');
  doc.fillColor(MUTED).font('Helvetica').fontSize(11)
    .text(`Invoice No: ${invoice.reference}`, 50, 175, { lineBreak: false });

  const gridRows = [
    { label: 'Issued',      value: fmtDate(invoice.created_at) },
    { label: 'Due',         value: fmtDate(invoice.due_date) },
    { label: 'Client',      value: invoice.company_name || invoice.client_name || '—' },
    { label: 'Email',       value: invoice.contact_email || invoice.client_email || '—' },
    { label: 'Status',      value: (invoice.status || 'pending').toUpperCase() },
    { label: 'Reference',   value: invoice.journey_reference || '—' },
  ];
  if (invoice.kra_etr_code) {
    gridRows.push({ label: 'KRA ETR Code', value: invoice.kra_etr_code });
  }
  const gridEnd = buildGrid(doc, gridRows, 200);

  doc.rect(50, gridEnd + 10, 500, 60).fill(PLUM);
  doc.fillColor('white').font('Helvetica').fontSize(10)
    .text('AMOUNT DUE (KES)', 70, gridEnd + 22, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(26).fillColor(ORANGE)
    .text(fmtKES(invoice.total_amount ?? invoice.amount), 70, gridEnd + 38, { lineBreak: false });

  doc.fillColor('#444').font('Helvetica').fontSize(10)
    .text(`Payment via M-Pesa Paybill or bank transfer. For queries, call ${COMPANY.phones[0]} or email ${COMPANY.emails[0]}.`,
      50, 700, { width: 500, lineBreak: false });

  buildFooter(doc, invoice.kra_etr_code
    ? `KRA ETR Verification Code: ${invoice.kra_etr_code}`
    : null);

  // Watermark last — switch back to page 0 and overlay so pdfkit doesn't
  // auto-paginate the rotated text.
  doc.switchToPage(0);
  drawWatermark(doc);

  return bufferFromDoc(doc);
};

module.exports = { generateQuotePDF, generateInvoicePDF };
