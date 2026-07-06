const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // avoids I, O, 0, 1

function randomCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

function generateQuoteReference(prefix = 'E11') {
  return `${prefix}-${randomCode(6)}`;
}

async function createUniqueQuoteReference(query, { prefix = 'E11', attempts = 10 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const reference = generateQuoteReference(prefix);
    const { rows } = await query('SELECT 1 FROM quotations WHERE UPPER(reference) = UPPER($1) LIMIT 1', [reference]);
    if (!rows.length) return reference;
  }
  throw new Error('Could not generate a unique quote reference. Please try again.');
}

module.exports = {
  generateQuoteReference,
  createUniqueQuoteReference,
};
