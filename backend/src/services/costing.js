/**
 * Journey cost calculation — a pure function, no database access, so it is
 * trivial to unit-test and behaves identically wherever it is called.
 *
 *   estimated_cost = (distance_km * cost_per_km)
 *                  + (fixed_daily_cost * days)
 *                  + extra_charges
 *                  + manual_adjustment
 *
 * All inputs are coerced to Number so string values coming from req.body or
 * from DECIMAL columns (which pg returns as strings) are handled safely.
 */

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function calculateJourneyCost({
  distanceKm,
  costPerKm,
  fixedDailyCost,
  days = 1,
  extraCharges = 0,
  manualAdjustment = 0,
} = {}) {
  const d = num(distanceKm);
  const cpk = num(costPerKm);
  const fdc = num(fixedDailyCost);
  const nDays = Math.max(1, num(days, 1));
  const extras = num(extraCharges);
  const adj = num(manualAdjustment);

  const distanceCost = d * cpk;
  const dailyCost = fdc * nDays;
  const estimated = distanceCost + dailyCost + extras + adj;

  const round2 = (x) => Math.round(x * 100) / 100;

  return {
    distanceKm: d,
    costPerKm: cpk,
    fixedDailyCost: fdc,
    days: nDays,
    distanceCost: round2(distanceCost),
    dailyCost: round2(dailyCost),
    extraCharges: round2(extras),
    manualAdjustment: round2(adj),
    estimatedCost: round2(estimated),
  };
}

module.exports = { calculateJourneyCost };
