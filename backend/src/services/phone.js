function normalizeKenyanPhone(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[\s\-()]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('254')) s = s.slice(3);
  if (s.startsWith('0')) s = s.slice(1);
  if (!/^[71]\d{8}$/.test(s)) return null;
  return '+254' + s;
}

function normalizeInternationalPhone(raw) {
  if (!raw) return null;
  const compact = String(raw).replace(/[\s\-()]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(compact)) return null;
  return compact;
}

function isKenyanPhone(raw) {
  return normalizeKenyanPhone(raw) !== null;
}

function isInternationalPhone(raw) {
  return normalizeInternationalPhone(raw) !== null;
}

module.exports = {
  normalizeKenyanPhone,
  normalizeInternationalPhone,
  isKenyanPhone,
  isInternationalPhone,
};