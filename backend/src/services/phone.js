// Shared phone normaliser/validator. Mirrors frontend/lib/constants.js so
// what the user types and what we store match exactly. Accepts:
//   0717900400, 254717900400, +254717900400, 717900400
// Returns canonical +2547XXXXXXXX (or +2541XXXXXXXX) — or null if invalid.

function normalizeKenyanPhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[\s\-()]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('254')) s = s.slice(3);
  if (s.startsWith('0')) s = s.slice(1);
  if (!/^[71]\d{8}$/.test(s)) return null;
  return '+254' + s;
}

function isKenyanPhone(raw) {
  return normalizeKenyanPhone(raw) !== null;
}

module.exports = { normalizeKenyanPhone, isKenyanPhone };
