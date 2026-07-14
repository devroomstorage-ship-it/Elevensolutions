'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Sidebar from '@/components/admin/Sidebar';
import AssignmentHistory from '@/components/admin/AssignmentHistory';
import { get, post, patch } from '@/lib/api';

const fmtKES  = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Active' },
  { value: 'inactive',  label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
];

export default function DriverDetailPage() {
  const { id } = useParams();
  const [driver, setDriver]     = useState(null);
  const [journeys, setJourneys] = useState([]);
  const [trucks, setTrucks]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [historyKey, setHistoryKey] = useState(0);
  const [editing, setEditing]   = useState(false);
  const [form, setForm]         = useState({});
  const [saveErr, setSaveErr]   = useState('');
  const [saving, setSaving]     = useState(false);

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

  const startEdit = () => {
    setForm({
      fullName:          driver.full_name || '',
      email:             driver.email || '',
      phone:             driver.phone || '',
      driverStatus:      driver.driver_status || 'active',
      idPassportNumber:  driver.id_passport_number || '',
      licenseNumber:     driver.license_number || '',
      licenseExpiry:     driver.license_expiry ? driver.license_expiry.slice(0, 10) : '',
      emergencyContact:  driver.emergency_contact || '',
      notes:             driver.notes || '',
      preferredTruckId:  driver.preferred_truck_id || '',
      isActive:          !!driver.is_active,
      password:          '',
    });
    setSaveErr('');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setSaveErr('');
    const body = { ...form };
    // don't send an empty password
    if (!body.password) delete body.password;
    try {
      const updated = await patch(`/drivers/${id}`, body);
      setDriver(updated);
      setEditing(false);
    } catch (e) {
      setSaveErr(e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const assignTruck = async (truckId, action = 'assign') => {
    if (!truckId) return;
    if (action === 'switch' && !confirm('Switch this driver to the new truck?')) return;
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

  if (loading) return <Shell><div className="p-8 text-gray-400 text-sm">Loading…</div></Shell>;
  if (!driver)  return <Shell><div className="p-8 text-gray-400 text-sm">Driver not found.</div></Shell>;

  return (
    <Shell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div>
          <a href="/portal/drivers" className="text-xs text-gray-400 hover:text-gray-600">← Drivers</a>
          <h1 className="text-lg font-semibold text-gray-900 mt-1">{driver.full_name}</h1>
          <p className="text-xs text-gray-500">{driver.email}</p>
        </div>
        {!editing && (
          <button onClick={startEdit}
            className="text-xs bg-[#E8620A] hover:bg-[#F7813B] text-white px-4 py-2 rounded-md">
            Edit driver
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">
        {editing ? (
          <EditPanel
            form={form} setForm={setForm}
            trucks={trucks}
            saveErr={saveErr} saving={saving}
            onSave={save} onCancel={() => setEditing(false)}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Profile</h2>
              <Row k="Email"           v={driver.email || '—'} />
              <Row k="Phone"           v={driver.phone || '—'} />
              <Row k="Status"          v={STATUS_OPTIONS.find(s => s.value === driver.driver_status)?.label || driver.driver_status || '—'} />
              <Row k="Active"          v={driver.is_active ? 'Yes' : 'No'} />
              <Row k="ID / Passport"   v={driver.id_passport_number || '—'} />
              <Row k="Licence no."     v={driver.license_number || '—'} />
              <Row k="Licence expiry"  v={fmtDate(driver.license_expiry)} />
              <Row k="Emergency"       v={driver.emergency_contact || '—'} />
              {driver.notes && <Row k="Notes" v={driver.notes} />}

              <div className="mt-4 pt-4 border-t border-gray-100">
                {driver.current_truck ? (
                  <div className="mb-3 bg-green-50 border border-green-100 rounded-lg p-3">
                    <p className="text-[11px] uppercase tracking-wide text-green-700 font-medium mb-0.5">Currently driving</p>
                    <p className="text-sm font-semibold text-green-900">{driver.current_truck}</p>
                    <button onClick={unassignCurrent}
                      className="mt-2 text-xs text-red-600 hover:text-red-700 hover:underline">Unassign</button>
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
              </div>
            </div>

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
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Truck assignment history</h2>
            <AssignmentHistory key={historyKey} driverId={id} perspective="driver" />
          </div>
        )}
      </div>
    </Shell>
  );
}

// ─── Edit panel ─────────────────────────────────────────────────────────────
function EditPanel({ form, setForm, trucks, saveErr, saving, onSave, onCancel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setBool = (k) => (e) => setForm({ ...form, [k]: e.target.checked });
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4 max-w-3xl">
      <h2 className="text-sm font-semibold text-gray-900">Edit driver</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Full name *" value={form.fullName} onChange={set('fullName')} />
        <Field label="Email *" type="email" value={form.email} onChange={set('email')} />
        <PhoneField label="Phone" value={form.phone} onChange={set('phone')} />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Driver status</label>
          <select value={form.driverStatus} onChange={set('driverStatus')}
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white">
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <Field label="ID / passport number" value={form.idPassportNumber} onChange={set('idPassportNumber')} />
        <Field label="Licence number" value={form.licenseNumber} onChange={set('licenseNumber')} />
        <Field label="Licence expiry" type="date" value={form.licenseExpiry} onChange={set('licenseExpiry')} />
        <Field label="Emergency contact" value={form.emergencyContact} onChange={set('emergencyContact')} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Preferred truck (optional)</label>
        <select value={form.preferredTruckId} onChange={set('preferredTruckId')}
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white">
          <option value="">— No preference —</option>
          {trucks.map(t => <option key={t.id} value={t.id}>{t.registration} — {t.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
        <textarea value={form.notes} onChange={set('notes')} rows={2}
          className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-none" />
      </div>

      <div className="pt-3 border-t border-gray-100 space-y-3">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.isActive} onChange={setBool('isActive')} />
          Account active (uncheck to disable login without deleting the driver)
        </label>

        <Field label="Reset password (leave blank to keep current)"
          type="password" value={form.password} onChange={set('password')} />
      </div>

      {saveErr && (
        <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{saveErr}</p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel}
          className="text-xs text-gray-500 px-4 py-2">Cancel</button>
        <button onClick={onSave} disabled={saving}
          className="bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

// ─── UI bits ─────────────────────────────────────────────────────────────────
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
function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value || ''} onChange={onChange}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40" />
    </div>
  );
}
function PhoneField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-stretch border border-gray-200 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-[#E8620A]/40">
        <span className="bg-gray-50 px-2.5 flex items-center text-xs text-gray-500 font-mono border-r border-gray-200">+254</span>
        <input type="tel" inputMode="numeric" placeholder="717 900 400"
          value={value || ''} onChange={onChange}
          className="flex-1 text-sm px-3 py-2 outline-none" />
      </div>
    </div>
  );
}
