const crypto = require('crypto');

function getSecret() {
  const secret = process.env.QUOTE_TRACKING_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('QUOTE_TRACKING_SECRET or JWT_SECRET is required.');
  return secret;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function issueQuoteAccessToken(reference, ttlMinutes = 30) {
  const payload = {
    reference: String(reference || '').trim().toUpperCase(),
    exp: Date.now() + ttlMinutes * 60 * 1000,
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

function verifyQuoteAccessToken(token) {
  const raw = String(token || '').trim();
  const [encoded, signature] = raw.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!payload.reference || !payload.exp || Date.now() > Number(payload.exp)) return null;
  return payload;
}

module.exports = {
  issueQuoteAccessToken,
  verifyQuoteAccessToken,
};
