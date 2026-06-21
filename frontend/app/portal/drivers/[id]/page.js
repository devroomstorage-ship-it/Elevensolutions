'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Sidebar from '@/components/admin/Sidebar';
import AssignmentHistory from '@/components/admin/AssignmentHistory';
import { get, post } from '@/lib/api';

const fmtKES = (n) => 'KES ' + Number(n || 0).toLocaleString();

export default function DriverDetailPage() {
  const { id } = useParams();
  const [driver, setDriver]     = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [trucks, setTrucks]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [historyKey, setHistoryKey] = useState(0); // bump to force reload

  const load = () => {
    Promise.all([
      get(`/drivers/${id}`),
      get(`/drivers/${id}/journeys`),
      get('/trucks').catch(() => []),
    ])
      .then(([d, j, t]) => { setDriver(d); setJourneys(j); setTrucks(t); })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (id) load(); }, [id]);

  const assignTruck = async (truckId, action = 'assign') => {
    if (!truckId) return;
    const verb = action === 'switch' ? 'Switch this driver to the new truck?' : null;
    if (verb && !confirm(verb)) return;
    try {
      await post('/assignments/driver-truck', { driverId: id, truckId });
      load();
      setHistoryKey((k) => k + 1);
    } catch (e) { alert(e.message); }
  };

  const unassignCurrent = async () => {
    if (!driver?.current_truck_id) return;
    const notes = prompt('Reason for unassigning (optional):') || '';
    try {
      await post('/assignments/unassign', { truckId: driver.current_truck_id, notes });
      load();
      setHistoryKey((k) => k + 1);
    } catch (e) { alert(e.message); }
  };

  if (loading) return <Shell><div className="p-6 text-gray-400">Loading…</div></Shell>;
  if (!driver) return <Shell><div className="p-6 text-gray-400">Driver not found.</div></Shell>;

  const s = driver.stats || {};

  return (
    <Shell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <a href="/portal/drivers" className="text-xs text-gray-400 hover:text-gray-600">← Drivers</a>
        <h1 className="text-base font-semibold text-gray-900 mt-1">{driver.full_name}</h1>
      </div>

      <div className="p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Journeys completed" value={s.total_journeys ?? 0} />
          <Stat label="Distance driven" value={`${Number(s.total_distance_km || 0).toLocaleString()} km`} />
          <Stat label="Revenue generated" value={fmtKES(s.total_revenue)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 lg:col-span-1">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Profile</h2>
            <Row k="Email" v={driver.email} />
            <Row k="Phone" v={driver.phone} />
            <Row k="ID / passport" v={driver.id_passport_number} />
            <Row k="Licence" v={driver.license_number} />
            <Row k="Licence expiry" v={driver.license_expiry ? new Date(driver.license_expiry).toLocaleDateString() : '—'} />
            <Row k="Status" v={driver.driver_status} />
            <Row k="Preferred truck" v={driver.preferred_truck || '—'} />
            <Row k="Current truck" v={driver.current_truck || 'Unassigned'} />
            <Row k="Emergency contact" v={driver.emergency_contact} />

            <div className="mt-4 pt-4 border-t border-gray-100">
              {driver.current_truck ? (
                <div className="mb-3 bg-green-50 border border-green-100 rounded-lg p-3">
                  <p className="text-[11px] uppercase tracking-wide text-green-700 font-medium mb-0.5">Currently driving</p>
                  <p className="text-sm font-semibold text-green-900">{driver.current_truck}</p>
                  <button onClick={unassignCurrent}
                    className="mt-2 text-xs text-red-600 hover:text-red-700 hover:underline">
                    Unassign
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mb-3">Not currently assigned to a truck.</p>
              )}

              <label className="block text-xs font-medium text-gray-600 mb-1">
                {driver.current_truck_id ? 'Switch to a different truck' : 'Assign to truck'}
              </label>
              <select
                onChange={(e) => assignTruck(e.target.value, driver.current_truck_id ? 'switch' : 'assign')}
                value=""
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2">
                <option value="" disabled>Choose a truck…</option>
                {trucks
                  .filter(t => t.id !== driver.current_truck_id)
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.registration} — {t.name}
                      {t.driver_name ? ` (currently with ${t.driver_name})` : ''}
                    </option>
                  ))}
              </select>
              {driver.current_truck_id && (
                <p className="text-[11px] text-gray-400 mt-1">Switching will release the previous assignment automatically.</p>
              )}
            </div>
          </div>

          {/* Journey history */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Journey history</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-500 text-xs uppercase">
                  <tr><th className="py-2">Ref</th><th>Route</th><th>Truck</th><th>Date</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {journeys.map(j => (
                    <tr key={j.id} className="border-t border-gray-100">
                      <td className="py-2">
                        <a href={`/portal/journeys/${j.id}`} className="text-[#E8620A] hover:underline">{j.reference}</a>
                      </td>
                      <td>{j.origin} → {j.destination}</td>
                      <td>{j.registration || j.truck_registration_snapshot || '—'}</td>
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

        {/* Assignment history (full-width card) */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Truck assignment history</h2>
          <AssignmentHistory key={historyKey} driverId={id} perspective="driver" />
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
function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xl font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-gray-50 last:border-0">
      <span className="text-gray-400">{k}</span>
      <span className="text-gray-800 capitalize text-right">{v || '—'}</span>
    </div>
  );
}
