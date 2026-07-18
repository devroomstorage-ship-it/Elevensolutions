'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import PlacesAutocomplete from '@/components/admin/PlacesAutocomplete';
import { get, post } from '@/lib/api';

const fmtKES = (n) => 'KES ' + Number(n || 0).toLocaleString();

export default function SchedulePage() {
  const [clients, setClients] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks]   = useState([]);
  const [journeys, setJourneys] = useState([]);

  const [form, setForm] = useState({
    clientId: '', driverId: '', truckId: '',
    origin: '', destination: '',
    pickupLat: null, pickupLng: null, dropoffLat: null, dropoffLng: null,
    cargoType: '', cargoWeightTons: '', scheduledDate: '',
    distanceKm: '', notes: '',
  });
  const [extra, setExtra] = useState({ extraCharges: 0, manualAdjustment: 0, days: 1, roundTrip: true });
  const [fuelPrice, setFuelPrice] = useState(200);
  const [route, setRoute] = useState(null);
  const [cost, setCost]   = useState(null);
  const [busy, setBusy]   = useState('');

  useEffect(() => {
    Promise.all([
      get('/clients').catch(() => []),
      get('/drivers').catch(() => []),
      get('/trucks').catch(() => []),
      get('/journeys').catch(() => []),
      get('/content/pricing').catch(() => null),
    ]).then(([c, d, t, j, p]) => {
      setClients(c); setDrivers(d); setTrucks(t); setJourneys(j);
      if (p?.fuelPricePerLitre) setFuelPrice(p.fuelPricePerLitre);
    });
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e?.target ? e.target.value : e });

  const selectedTruck = trucks.find(t => t.id === form.truckId);

  // Local live preview of cost (mirrors backend costing.js):
  // fuel (billable km ÷ km/L × price) + daily rate + extra days × extra-day rate.
  const previewCost = () => {
    if (!selectedTruck) return null;
    const d = Number(form.distanceKm) || 0;
    const kmpl = Number(selectedTruck.fuel_efficiency_km_per_l) || 0;
    const billableKm = extra.roundTrip ? d * 2 : d;
    const fuelCost = kmpl > 0 ? (billableKm / kmpl) * fuelPrice : 0;
    const days = Math.max(1, Number(extra.days) || 1);
    const dailyCost = (Number(selectedTruck.daily_rate) || 0)
      + (days - 1) * (Number(selectedTruck.extra_day_rate) || 0);
    const total = fuelCost + dailyCost
      + Number(extra.extraCharges || 0) + Number(extra.manualAdjustment || 0);
    return Math.round(total * 100) / 100;
  };

  // Create the journey first (route/cost endpoints operate on a saved journey).
  const createAndCalcRoute = async () => {
    setBusy('route');
    try {
      // Save (or reuse) a draft journey.
      let journeyId = form._id;
      if (!journeyId) {
        const created = await post('/journeys', {
          ...form,
          cargoWeightTons: form.cargoWeightTons || null,
          distanceKm: form.distanceKm || null,
        });
        journeyId = created.id;
        setForm({ ...form, _id: journeyId });
      }
      const r = await post(`/journeys/${journeyId}/calculate-route`, {
        pickupLat: form.pickupLat, pickupLng: form.pickupLng,
        dropoffLat: form.dropoffLat, dropoffLng: form.dropoffLng,
      });
      setRoute(r);
      setForm((f) => ({ ...f, distanceKm: r.distance_km, _id: journeyId }));
    } catch (e) {
      alert(e.message + (e.allowManual ? '\nYou can enter the distance manually.' : ''));
    } finally {
      setBusy('');
    }
  };

  const calcCost = async () => {
    if (!form._id) { alert('Save / calculate route first to create the journey.'); return; }
    setBusy('cost');
    try {
      const r = await post(`/journeys/${form._id}/calculate-cost`, {
        distanceKm: form.distanceKm,
        extraCharges: Number(extra.extraCharges) || 0,
        manualAdjustment: Number(extra.manualAdjustment) || 0,
        days: Number(extra.days) || 1,
        roundTrip: !!extra.roundTrip,
      });
      setCost(r.breakdown);
    } catch (e) { alert(e.message); }
    finally { setBusy(''); }
  };

  const finalize = async () => {
    setBusy('save');
    try {
      let journeyId = form._id;
      if (!journeyId) {
        const created = await post('/journeys', { ...form, cargoWeightTons: form.cargoWeightTons || null, distanceKm: form.distanceKm || null });
        journeyId = created.id;
      }
      // Approve the cost we previewed (uses backend's stored estimate if calculated).
      if (cost?.estimatedCost != null) {
        await post(`/journeys/${journeyId}/approve-cost`, { finalCost: cost.estimatedCost }).catch(() => {});
      }
      alert('Journey saved.');
      window.location.href = `/portal/journeys/${journeyId}`;
    } catch (e) { alert(e.message); }
    finally { setBusy(''); }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">Journey Planner</h1>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Customer" value={form.clientId} onChange={set('clientId')}
                options={[{ v: '', l: 'Select customer…' }, ...clients.map(c => ({ v: c.id, l: c.company_name }))]} />
              <Field label="Scheduled date" type="date" value={form.scheduledDate} onChange={set('scheduledDate')} />
            </div>

            <PlacesAutocomplete label="Pickup location" value={form.origin}
              onChange={(v) => setForm((f) => ({ ...f, origin: v }))}
              onSelect={(s) => setForm((f) => ({ ...f, origin: s.address, pickupLat: s.lat, pickupLng: s.lng }))} />
            <PlacesAutocomplete label="Drop-off location" value={form.destination}
              onChange={(v) => setForm((f) => ({ ...f, destination: v }))}
              onSelect={(s) => setForm((f) => ({ ...f, destination: s.address, dropoffLat: s.lat, dropoffLng: s.lng }))} />

            <div className="grid grid-cols-2 gap-3">
              <Select label="Driver" value={form.driverId} onChange={set('driverId')}
                options={[{ v: '', l: 'Select driver…' }, ...drivers.filter(d => d.driver_status !== 'inactive').map(d => ({ v: d.id, l: d.full_name }))]} />
              <Select label="Truck" value={form.truckId} onChange={set('truckId')}
                options={[{ v: '', l: 'Select truck…' }, ...trucks.map(t => ({ v: t.id, l: `${t.registration} — ${t.name}` }))]} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Cargo type" value={form.cargoType} onChange={set('cargoType')} />
              <Field label="Weight (t)" type="number" value={form.cargoWeightTons} onChange={set('cargoWeightTons')} />
              <Field label="Distance (km)" type="number" value={form.distanceKm} onChange={set('distanceKm')} />
            </div>

            <button onClick={createAndCalcRoute} disabled={busy === 'route' || !form.origin || !form.destination || !form.truckId || !form.driverId || !form.scheduledDate}
              className="text-xs font-medium px-4 py-2 rounded-md border border-[#0F1E2E] text-[#0F1E2E] hover:bg-[#0F1E2E] hover:text-white disabled:opacity-40 transition-colors">
              {busy === 'route' ? 'Calculating…' : '📍 Calculate distance (Google)'}
            </button>

            {route && (
              <p className="text-xs text-gray-500">
                {route.distance_km} km · {route.estimated_duration_min} min
                {route.cached && <span className="text-gray-400"> (cached)</span>}
                {route.directions_link && (
                  <a href={route.directions_link} target="_blank" rel="noreferrer" className="text-[#E8620A] ml-2 hover:underline">Open in Google Maps ↗</a>
                )}
              </p>
            )}
          </div>

          {/* Cost panel */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-3 h-fit">
            <h2 className="text-sm font-semibold text-gray-900">Pricing</h2>
            {selectedTruck ? (
              <p className="text-xs text-gray-500">
                {selectedTruck.registration}: {Number(selectedTruck.fuel_efficiency_km_per_l) || '—'} km/L
                · {fmtKES(selectedTruck.daily_rate)}/day
                · {fmtKES(selectedTruck.extra_day_rate)}/extra day
              </p>
            ) : <p className="text-xs text-gray-400">Pick a truck to price.</p>}
            <p className="text-xs text-gray-400">Fuel price: {fmtKES(fuelPrice)}/litre (Settings → Pricing)</p>

            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={!!extra.roundTrip}
                onChange={(e) => setExtra({ ...extra, roundTrip: e.target.checked })} />
              Round trip — fuel billed on 2× distance (to and fro)
            </label>

            <Field label="Days" type="number" value={extra.days} onChange={(e) => setExtra({ ...extra, days: e.target.value })} />
            <Field label="Extra charges (tolls etc.)" type="number" value={extra.extraCharges} onChange={(e) => setExtra({ ...extra, extraCharges: e.target.value })} />
            <Field label="Manual adjustment (+/-)" type="number" value={extra.manualAdjustment} onChange={(e) => setExtra({ ...extra, manualAdjustment: e.target.value })} />

            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex justify-between text-gray-500"><span>Live preview</span><span className="font-semibold text-gray-900">{fmtKES(previewCost())}</span></div>
              {cost && <div className="flex justify-between text-gray-500 mt-1"><span>Server estimate</span><span className="font-semibold text-[#E8620A]">{fmtKES(cost.estimatedCost)}</span></div>}
            </div>

            <button onClick={calcCost} disabled={busy === 'cost' || !form._id}
              className="w-full text-xs font-medium px-4 py-2 rounded-md border border-gray-200 text-gray-700 hover:border-gray-400 disabled:opacity-40">
              {busy === 'cost' ? 'Calculating…' : 'Calculate price'}
            </button>
            <button onClick={finalize} disabled={busy === 'save'}
              className="w-full bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md">
              {busy === 'save' ? 'Saving…' : 'Save journey'}
            </button>
          </div>
        </div>

        {/* Upcoming */}
        <div className="px-6 pb-8">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent journeys</h2>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500 text-xs uppercase">
                <tr><th className="p-3">Ref</th><th>Route</th><th>Driver</th><th>Truck</th><th>Date</th><th>Status</th></tr>
              </thead>
              <tbody>
                {journeys.slice(0, 10).map(j => (
                  <tr key={j.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3"><a href={`/portal/journeys/${j.id}`} className="text-[#E8620A] hover:underline">{j.reference}</a></td>
                    <td>{j.origin} → {j.destination}</td>
                    <td>{j.driver_name || '—'}</td>
                    <td>{j.registration || '—'}</td>
                    <td>{new Date(j.scheduled_date).toLocaleDateString()}</td>
                    <td className="capitalize">{j.status?.replace('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value ?? ''} onChange={onChange}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40" />
    </div>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select value={value} onChange={onChange}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40">
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
