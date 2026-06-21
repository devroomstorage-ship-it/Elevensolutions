'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Sidebar from '@/components/admin/Sidebar';
import { get, post } from '@/lib/api';

const fmtKES = (n) => 'KES ' + Number(n || 0).toLocaleString();

export default function TruckDetailPage() {
  const { id } = useParams();
  const [truck, setTruck]       = useState(null);
  const [profit, setProfit]     = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [drivers, setDrivers]   = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = () => {
    Promise.all([
      get(`/trucks/${id}`),
      get(`/trucks/${id}/profitability`).catch(() => null),
      get(`/trucks/${id}/journeys`),
      get('/drivers').catch(() => []),
    ])
      .then(([t, p, j, d]) => { setTruck(t); setProfit(p); setJourneys(j); setDrivers(d); })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (id) load(); }, [id]);

  const assignDriver = async (driverId) => {
    if (!driverId) return;
    try {
      await post('/assignments/driver-truck', { driverId, truckId: id });
      load();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <Shell><div className="p-6 text-gray-400">Loading…</div></Shell>;
  if (!truck) return <Shell><div className="p-6 text-gray-400">Truck not found.</div></Shell>;

  const p = profit || {};

  return (
    <Shell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <a href="/portal/fleet" className="text-xs text-gray-400 hover:text-gray-600">← Fleet</a>
        <h1 className="text-base font-semibold text-gray-900 mt-1">{truck.name} <span className="text-gray-400 font-mono text-sm">{truck.registration}</span></h1>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Journeys" value={p.total_journeys ?? 0} />
          <Stat label="Distance" value={`${Number(p.total_distance_km || 0).toLocaleString()} km`} />
          <Stat label="Revenue" value={fmtKES(p.total_revenue)} />
          <Stat label="Profit" value={fmtKES(p.profit)} accent={Number(p.profit) < 0 ? 'text-red-600' : 'text-green-700'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Truck details</h2>
            <Row k="Make / model" v={[truck.make, truck.model].filter(Boolean).join(' ') || '—'} />
            <Row k="Type" v={truck.type} />
            <Row k="Capacity" v={truck.capacity_tons ? `${truck.capacity_tons} t` : '—'} />
            <Row k="Year" v={truck.year} />
            <Row k="Fuel" v={truck.fuel_type} />
            <Row k="Odometer" v={truck.odometer_km ? `${Number(truck.odometer_km).toLocaleString()} km` : '—'} />
            <Row k="Cost / km" v={fmtKES(truck.default_cost_per_km)} />
            <Row k="Fixed daily" v={fmtKES(truck.fixed_daily_cost)} />
            <Row k="Insurance exp." v={truck.insurance_expiry ? new Date(truck.insurance_expiry).toLocaleDateString() : '—'} />
            <Row k="Inspection exp." v={truck.inspection_expiry ? new Date(truck.inspection_expiry).toLocaleDateString() : '—'} />
            <Row k="Status" v={truck.status?.replace('_', ' ')} />
            <Row k="Current driver" v={truck.driver_name || 'Unassigned'} />

            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className="block text-xs font-medium text-gray-600 mb-1">Assign driver</label>
              <select onChange={(e) => assignDriver(e.target.value)} defaultValue=""
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2">
                <option value="" disabled>Choose a driver…</option>
                {drivers.filter(d => d.driver_status !== 'inactive').map(d => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Journey history</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 text-xs uppercase">
                  <tr><th className="py-2">Ref</th><th>Route</th><th>Driver</th><th>Date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {journeys.map(j => (
                    <tr key={j.id} className="border-t border-gray-100">
                      <td className="py-2"><a href={`/portal/journeys/${j.id}`} className="text-[#E8620A] hover:underline">{j.reference}</a></td>
                      <td>{j.origin} → {j.destination}</td>
                      <td>{j.driver_name || j.driver_name_snapshot || '—'}</td>
                      <td>{new Date(j.scheduled_date).toLocaleDateString()}</td>
                      <td className="capitalize">{j.status?.replace('_', ' ')}</td>
                    </tr>
                  ))}
                  {!journeys.length && <tr><td colSpan="5" className="py-6 text-center text-gray-400">No journeys yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
function Stat({ label, value, accent = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-gray-50 last:border-0">
      <span className="text-gray-400">{k}</span>
      <span className="text-gray-800 capitalize text-right">{v ?? '—'}</span>
    </div>
  );
}
