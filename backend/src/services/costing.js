/**
 * Journey cost calculation — a pure function, no database access, so it is
 * trivial to unit-test and behaves identically wherever it is called.
 *
 * Implements the company's real pricing model (source: "Truck Costing.xlsx"):
 *
 *   billable_km    = distance_km × 2 when round trip ("Kms To and Fro"),
 *                    else distance_km as given
 *   fuel_cost      = billable_km ÷ fuel_efficiency_km_per_l × fuel_price_per_l
 *   daily_cost     = daily_rate + (days beyond the first × extra_day_rate)
 *   estimated_cost = fuel_cost + daily_cost + extra_charges + manual_adjustment
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
  fuelEfficiencyKmPerL,
  fuelPricePerL,
  dailyRate,
  extraDayRate,
  days = 1,
  roundTrip = true,
  extraCharges = 0,
  manualAdjustment = 0,
} = {}) {
  const d = num(distanceKm);
  const kmpl = num(fuelEfficiencyKmPerL);
  const fuelPrice = num(fuelPricePerL);
  const daily = num(dailyRate);
  const extraDay = num(extraDayRate);
  const nDays = Math.max(1, num(days, 1));
  const extras = num(extraCharges);
  const adj = num(manualAdjustment);
  const rt = roundTrip !== false;

  const billableKm = rt ? d * 2 : d;
  const fuelCost = kmpl > 0 ? (billableKm / kmpl) * fuelPrice : 0;
  const extraDays = nDays - 1;
  const dailyCost = daily + extraDays * extraDay;
  const estimated = fuelCost + dailyCost + extras + adj;

  const round2 = (x) => Math.round(x * 100) / 100;

  return {
    distanceKm: d,
    roundTrip: rt,
    billableKm: round2(billableKm),
    fuelEfficiencyKmPerL: kmpl,
    fuelPricePerL: fuelPrice,
    fuelCost: round2(fuelCost),
    dailyRate: daily,
    extraDayRate: extraDay,
    days: nDays,
    extraDays,
    dailyCost: round2(dailyCost),
    extraCharges: round2(extras),
    manualAdjustment: round2(adj),
    estimatedCost: round2(estimated),
  };
}

module.exports = { calculateJourneyCost };
