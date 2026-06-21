'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, post } from '@/lib/api';

const STATUS_COLORS = {
  active:    'bg-green-100 text-green-800',
  inactive:  'bg-gray-100 text-gray-700',
  suspended: 'bg-red-100 text-red-800',
};

function licenseState(expiry) {
  if (!expiry) return { label: '—', cls: 'text-gray-400' };
  const days = (new Date(expiry) - Date.now()) / 864e5;
  if (days < 0)  return { label: `Expired`, cls: 'text-red-600 font-semibold' };
  if (days < 30) return { label: `Expiring`, cls: 'text-amber-600 font-semibold' };
  return { label: new Date(expiry).toLocaleDateString(), cls: 'text-gray-600' };
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([get('/drivers'), get('/trucks').catch(() => [])])
      .then(([d, t]) => { setDrivers(d); setTrucks(t); })
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = drivers.filter(d =>
    d.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">Drivers — {drivers.length}</h1>
          <button onClick={() => setShowAdd(true)}
            className="bg-[#E8620A] hover:bg-[#F7813B] text-white text-xs font-medium px-4 py-2 rounded-md transition-colors">
            + Add Driver
          </button>
        </div>

        <div className="p-6">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search drivers…"
            className="mb-5 w-full max-w-sm text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40"
          />

          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading drivers…</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Truck</th>
                    <th className="p-3 font-medium">Licence</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => {
                    const lic = licenseState(d.license_expiry);
                    return (
                      <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="p-3">
                          <p className="font-medium text-gray-900">{d.full_name}</p>
                          <p className="text-xs text-gray-400">{d.email}</p>
                        </td>
                        <td className="p-3 text-gray-700">
                          {d.current_truck || d.preferred_truck || <span className="text-gray-400">Unassigned</span>}
                          {d.preferred_truck && !d.current_truck && <span className="text-[10px] text-gray-400 ml-1">(preferred)</span>}
                        </td>
                        <td className={`p-3 ${lic.cls}`}>{lic.label}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${STATUS_COLORS[d.driver_status] || 'bg-gray-100 text-gray-600'}`}>
                            {d.driver_status || 'unknown'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <a href={`/portal/drivers/${d.id}`} className="text-[#E8620A] hover:underline text-xs font-medium">View</a>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr><td colSpan="5" className="p-8 text-center text-gray-400">No drivers found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {showAdd && (
        <AddDriverModal trucks={trucks} onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} />
      )}
    </div>
  );
}

function AddDriverModal({ trucks, onClose, onCreated }) {
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', phone: '',
    idPassportNumber: '', licenseNumber: '', licenseExpiry: '',
    preferredTruckId: '', emergencyContact: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setSaving(true);
    try {
      await post('/drivers', { ...form, preferredTruckId: form.preferredTruckId || undefined });
      onCreated();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Add Driver</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name *" value={form.fullName} onChange={set('fullName')} />
          <Field label="Email *" value={form.email} onChange={set('email')} type="email" />
          <Field label="Temp password *" value={form.password} onChange={set('password')} type="password" />
          <Field label="Phone" value={form.phone} onChange={set('phone')} />
          <Field label="ID / passport" value={form.idPassportNumber} onChange={set('idPassportNumber')} />
          <Field label="Licence number" value={form.licenseNumber} onChange={set('licenseNumber')} />
          <Field label="Licence expiry" value={form.licenseExpiry} onChange={set('licenseExpiry')} type="date" />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Preferred truck</label>
            <select value={form.preferredTruckId} onChange={set('preferredTruckId')}
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2">
              <option value="">None</option>
              {trucks.map(t => <option key={t.id} value={t.id}>{t.registration} — {t.name}</option>)}
            </select>
          </div>
          <Field label="Emergency contact" value={form.emergencyContact} onChange={set('emergencyContact')} />
          <Field label="Notes" value={form.notes} onChange={set('notes')} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="text-xs text-gray-500 px-4 py-2">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md">
            {saving ? 'Saving…' : 'Create Driver'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={onChange}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40" />
    </div>
  );
}
