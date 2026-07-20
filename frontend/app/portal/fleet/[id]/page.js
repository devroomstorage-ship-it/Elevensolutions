'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Sidebar from '@/components/admin/Sidebar';
import AssignmentHistory from '@/components/admin/AssignmentHistory';
import { get, post, patch } from '@/lib/api';

const fmtKES  = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_OPTIONS = [
  { value: 'available',   label: 'Available' },
  { value: 'on_route',    label: 'On route' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'scheduled',   label: 'Scheduled' },
  { value: 'loading',     label: 'Loading' },
];
const TYPE_OPTIONS = ['Flatbed','Box Truck','Tipper','Tanker','Reefer','Lowbed','Container','Pickup'];

export default function TruckDetailPage() {
  const { id } = useParams();
  const [truck, setTruck]       = useState(null);
  const [profit, setProfit]     = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [drivers, setDrivers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [historyKey, setHistoryKey] = useState(0);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [saveErr, setSaveErr]   = useState('');
  const [saving, setSaving]     = useState(false);

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

  const startEdit = () => {
    setForm({
      registration:      truck.registration || '',
      name:              truck.name || '',
      type:              truck.type || 'Flatbed',
      capacityTons:      truck.capacity_tons ?? '',
      year:              truck.year ?? '',
      make:              truck.make || '',
      model:             truck.model || '',
      fuelType:          truck.fuel_type || '',
      insuranceExpiry:   truck.insurance_expiry ? truck.insurance_expiry.slice(0, 10) : '',
      inspectionExpiry:  truck.inspection_expiry ? truck.inspection_expiry.slice(0, 10) : '',
      fuelEfficiencyKmPerL: truck.fuel_efficiency_km_per_l ?? '',
      dailyRate:         truck.daily_rate ?? '',
      extraDayRate:      truck.extra_day_rate ?? '',
      odometerKm:        truck.odometer_km ?? '',
      status:            truck.status || 'available',
      notes:             truck.notes || '',
    });
    setSaveErr('');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setSaveErr('');
    // Convert numeric fields to Number or null
    const body = { ...form };
    ['capacityTons','year','odometerKm','fuelEfficiencyKmPerL','dailyRate','extraDayRate'].forEach(k => {
      if (body[k] === '' || body[k] === null) body[k] = null;
      else body[k] = Number(body[k]);
    });
    try {
      const updated = await patch(`/trucks/${id}`, body);
      setTruck(updated);
      setEditing(false);
    } catch (e) {
      setSaveErr(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const assignDriver = async (driverId) => {
    if (!driverId) return;
    if (truck?.driver_id && !confirm('Switch this truck to a different driver?')) return;
    try {
      await post('/assignments/driver-truck', { driverId, truckId: id });
      load();
      setHistoryKey((k) => k + 1);
    } catch (e) { alert(e.message); }
  };
  const unassignCurrent = async () => {
    if (!truck?.driver_id) return;
    const notes = prompt('Reason for unassigning (optional):') || '';
    try {
      await post('/assignments/unassign', { truckId: id, notes });
      load();
      setHistoryKey((k) => k + 1);
    } catch (e) { alert(e.message); }
  };

  if (loading) return <Shell><div className="p-8 text-gray-400 text-sm">Loading…</div></Shell>;
  if (!truck)   return <Shell><div className="p-8 text-gray-400 text-sm">Truck not found.</div></Shell>;

  return (
    <Shell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <a href="/portal/fleet" className="text-xs text-gray-400 hover:text-gray-600">← Fleet</a>
          <h1 className="text-lg font-semibold text-gray-900 mt-1">{truck.registration}</h1>
          <p className="text-xs text-gray-500">{truck.name} · {truck.type}</p>
        </div>
        {!editing && (
          <button onClick={startEdit}
            className="text-xs bg-[#B060A0] hover:bg-[#C176B4] text-white px-4 py-2 rounded-md">
            Edit truck
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">
        {editing ? (
          <EditPanel form={form} setForm={setForm}
            saveErr={saveErr} saving={saving}
            onSave={save} onCancel={() => setEditing(false)} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Details</h2>
              <Row k="Type"           v={truck.type} />
              <Row k="Capacity"       v={truck.capacity_tons ? `${truck.capacity_tons} t` : '—'} />
              <Row k="Make / Model"   v={[truck.make, truck.model].filter(Boolean).join(' ') || '—'} />
              <Row k="Year"           v={truck.year || '—'} />
              <Row k="Fuel"           v={truck.fuel_type || '—'} />
              <Row k="Odometer"       v={truck.odometer_km != null ? `${Number(truck.odometer_km).toLocaleString()} km` : '—'} />
              <Row k="Fuel efficiency" v={truck.fuel_efficiency_km_per_l ? `${Number(truck.fuel_efficiency_km_per_l)} km/L` : '—'} />
              <Row k="Daily rate"     v={fmtKES(truck.daily_rate)} />
              <Row k="Extra day rate" v={fmtKES(truck.extra_day_rate)} />
              <Row k="Insurance exp." v={fmtDate(truck.insurance_expiry)} />
              <Row k="Inspection exp."v={fmtDate(truck.inspection_expiry)} />
              <Row k="Status"         v={STATUS_OPTIONS.find(s => s.value === truck.status)?.label || truck.status || '—'} />
              {truck.notes && <Row k="Notes" v={truck.notes} />}

              <div className="mt-4 pt-4 border-t border-gray-100">
                {truck.driver_name ? (
                  <div className="mb-3 bg-green-50 border border-green-100 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-green-700 font-medium mb-0.5">Currently with</p>
                    <p className="text-sm font-semibold text-green-900">{truck.driver_name}</p>
                    <button onClick={unassignCurrent}
                      className="mt-2 text-xs text-red-600 hover:text-red-700 hover:underline">Unassign</button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mb-3">No driver currently assigned.</p>
                )}
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {truck.driver_id ? 'Switch to a different driver' : 'Assign driver'}
                </label>
                <select onChange={(e) => assignDriver(e.target.value)} value=""
                  className="w-full text-sm border border-gray-200 rounded-md px-3 py-2">
                  <option value="" disabled>Choose a driver…</option>
                  {drivers
                    .filter(d => d.driver_status !== 'inactive' && d.id !== truck.driver_id)
                    .map(d => (
                      <option key={d.id} value={d.id}>
                        {d.full_name}
                        {d.current_truck ? ` (currently on ${d.current_truck})` : ''}
                      </option>
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
                        <td className="py-2"><a href={`/portal/journeys/${j.id}`} className="text-[#B060A0] hover:underline">{j.reference}</a></td>
                        <td>{j.origin} → {j.destination}</td>
                        <td>{j.driver_name || j.driver_name_snapshot || '—'}</td>
                        <td>{fmtDate(j.scheduled_date)}</td>
                        <td className="capitalize">{j.status?.replace('_', ' ')}</td>
                      </tr>
                    ))}
                    {!journeys.length && <tr><td colSpan="5" className="py-6 text-center text-gray-400">No journeys yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!editing && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Driver assignment history</h2>
            <AssignmentHistory key={historyKey} truckId={id} perspective="truck" />
          </div>
        )}
      </div>
    </Shell>
  );
}

function EditPanel({ form, setForm, saveErr, saving, onSave, onCancel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4 max-w-3xl">
      <h2 className="text-sm font-semibold text-gray-900">Edit truck</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Registration *" value={form.registration} onChange={set('registration')} placeholder="KDA 100A" />
        <Field label="Name *"         value={form.name} onChange={set('name')} placeholder="Truck One" />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
          <select value={form.type} onChange={set('type')}
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white">
            {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select value={form.status} onChange={set('status')}
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white">
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <Field label="Capacity (t)"     type="number" value={form.capacityTons}  onChange={set('capacityTons')} />
        <Field label="Year"             type="number" value={form.year}          onChange={set('year')} />
        <Field label="Make"             value={form.make}                        onChange={set('make')} />
        <Field label="Model"            value={form.model}                       onChange={set('model')} />
        <Field label="Fuel type"        value={form.fuelType}                    onChange={set('fuelType')} placeholder="Diesel" />
        <Field label="Odometer (km)"    type="number" value={form.odometerKm}    onChange={set('odometerKm')} />
        <Field label="Fuel efficiency (km/L)" type="number" value={form.fuelEfficiencyKmPerL} onChange={set('fuelEfficiencyKmPerL')} />
        <Field label="Daily rate (KES)" type="number" value={form.dailyRate}     onChange={set('dailyRate')} />
        <Field label="Extra day rate (KES)" type="number" value={form.extraDayRate} onChange={set('extraDayRate')} />
        <Field label="Insurance expiry"  type="date" value={form.insuranceExpiry}  onChange={set('insuranceExpiry')} />
        <Field label="Inspection expiry" type="date" value={form.inspectionExpiry} onChange={set('inspectionExpiry')} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea value={form.notes || ''} onChange={set('notes')} rows={2}
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-none" />
      </div>

      {saveErr && <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{saveErr}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="text-xs text-gray-500 px-4 py-2">Cancel</button>
        <button onClick={onSave} disabled={saving}
          className="bg-[#B060A0] hover:bg-[#C176B4] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
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
function Row({ k, v }) {
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-800 text-right">{v}</span>
    </div>
  );
}
function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value ?? ''} onChange={onChange} placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#B060A0]/40" />
    </div>
  );
}
