'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, patch, post } from '@/lib/api';

const STATUS_COLORS = {
  available:   'bg-green-100 text-green-800',
  on_route:    'bg-blue-100 text-blue-800',
  maintenance: 'bg-red-100 text-red-800',
  scheduled:   'bg-amber-100 text-amber-800',
  loading:     'bg-amber-100 text-amber-800',
};

export default function FleetPage() {
  const [trucks, setTrucks]    = useState([]);
  const [loading, setLoad]     = useState(true);
  const [filter, setFilter]    = useState('all');
  const [showAdd, setShowAdd]  = useState(false);

  const loadTrucks = () => {
    const url = filter !== 'all' ? `/trucks?status=${filter}` : '/trucks';
    get(url).then(setTrucks).catch(console.error).finally(() => setLoad(false));
  };

  useEffect(loadTrucks, [filter]);

  const updateStatus = async (id, status) => {
    try {
      await patch(`/trucks/${id}`, { status });
      setTrucks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    } catch (err) { alert(err.message); }
  };

  const filters = ['all', 'available', 'on_route', 'maintenance', 'scheduled'];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">Fleet — {trucks.length} Trucks</h1>
          <button onClick={() => setShowAdd(true)}
            className="bg-[#E8620A] hover:bg-[#F7813B] text-white text-xs font-medium px-4 py-2 rounded-md transition-colors">
            + Add Truck
          </button>
        </div>

        <div className="p-6">
          <div className="flex gap-2 mb-5 flex-wrap">
            {filters.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors capitalize border ${
                  filter === f ? 'bg-[#0F1E2E] text-white border-[#0F1E2E]' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}>
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading fleet…</div>
          ) : trucks.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">No trucks yet.</p>
              <button onClick={() => setShowAdd(true)}
                className="mt-3 text-[#E8620A] hover:underline text-xs font-medium">
                Add your first truck →
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {trucks.map(truck => (
                <div key={truck.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <a href={`/portal/fleet/${truck.id}`} className="font-semibold text-gray-900 text-sm hover:text-[#E8620A] hover:underline">
                        {truck.name}
                      </a>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{truck.registration}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[truck.status] || 'bg-gray-100 text-gray-600'}`}>
                      {truck.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between text-xs"><span className="text-gray-400">Type</span><span className="text-gray-700">{truck.type}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-400">Driver</span><span className="text-gray-700">{truck.driver_name || 'Unassigned'}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-400">Odometer</span><span className="text-gray-700">{truck.odometer_km?.toLocaleString()} km</span></div>
                    {truck.capacity_tons && (
                      <div className="flex justify-between text-xs"><span className="text-gray-400">Capacity</span><span className="text-gray-700">{truck.capacity_tons}T</span></div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={truck.status} onChange={e => updateStatus(truck.id, e.target.value)}
                      className="flex-1 border border-gray-200 rounded-md text-xs px-2 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#E8620A]">
                      <option value="available">Set Available</option>
                      <option value="on_route">Set On Route</option>
                      <option value="maintenance">Set Maintenance</option>
                      <option value="scheduled">Set Scheduled</option>
                      <option value="loading">Set Loading</option>
                    </select>
                    <a href={`/portal/fleet/${truck.id}`}
                      className="text-xs text-[#E8620A] hover:underline font-medium whitespace-nowrap px-1">
                      Edit →
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {showAdd && (
        <AddTruckModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); loadTrucks(); }} />
      )}
    </div>
  );
}

function AddTruckModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    registration: '', name: '', type: 'Flatbed',
    capacityTons: '', year: '', make: '', model: '',
    odometerKm: '', defaultCostPerKm: '', fixedDailyCost: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.registration.trim() || !form.name.trim() || !form.type.trim()) {
      setError('Registration, name and type are required.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        registration: form.registration.trim().toUpperCase(),
        name: form.name.trim(),
        type: form.type.trim(),
      };
      if (form.capacityTons)     body.capacityTons     = Number(form.capacityTons);
      if (form.year)             body.year             = Number(form.year);
      if (form.make)             body.make             = form.make.trim();
      if (form.model)            body.model            = form.model.trim();
      if (form.odometerKm)       body.odometerKm       = Number(form.odometerKm);
      if (form.defaultCostPerKm) body.defaultCostPerKm = Number(form.defaultCostPerKm);
      if (form.fixedDailyCost)   body.fixedDailyCost   = Number(form.fixedDailyCost);
      if (form.notes)            body.notes            = form.notes.trim();
      await post('/trucks', body);
      onCreated();
    } catch (err) {
      setError(err.message || 'Could not create truck.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Add Truck</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Registration *" value={form.registration} onChange={set('registration')} placeholder="KDA 100A" />
            <Field label="Name *" value={form.name} onChange={set('name')} placeholder="Truck One" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
              <select value={form.type} onChange={set('type')}
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-white">
                <option>Flatbed</option>
                <option>Box Truck</option>
                <option>Tipper</option>
                <option>Tanker</option>
                <option>Reefer</option>
                <option>Lowbed</option>
                <option>Container</option>
                <option>Pickup</option>
              </select>
            </div>
            <Field label="Capacity (tonnes)" type="number" value={form.capacityTons} onChange={set('capacityTons')} placeholder="28" />
            <Field label="Year" type="number" value={form.year} onChange={set('year')} placeholder="2022" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Make" value={form.make} onChange={set('make')} placeholder="Isuzu" />
            <Field label="Model" value={form.model} onChange={set('model')} placeholder="FRR" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Odometer (km)" type="number" value={form.odometerKm} onChange={set('odometerKm')} placeholder="0" />
            <Field label="Cost / km (KES)" type="number" value={form.defaultCostPerKm} onChange={set('defaultCostPerKm')} placeholder="50" />
            <Field label="Fixed daily (KES)" type="number" value={form.fixedDailyCost} onChange={set('fixedDailyCost')} placeholder="8000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2}
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-none"
              placeholder="Any extra detail (insurance, condition, etc.)" />
          </div>
          {error && (<p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>)}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="text-xs text-gray-500 px-4 py-2">Cancel</button>
            <button type="submit" disabled={saving}
              className="bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md">
              {saving ? 'Saving…' : 'Create Truck'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40" />
    </div>
  );
}
