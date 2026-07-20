'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, patch } from '@/lib/api';

const fmtKES = (n) => 'KES ' + Number(n || 0).toLocaleString();

export default function PricingSettingsPage() {
  const [fuelPrice, setFuelPrice] = useState('');
  const [original, setOriginal]   = useState('');
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState({ kind: '', text: '' });

  // Truck rate card — the calculation metrics from the costing sheet
  const [rows, setRows] = useState([]);           // { id, registration, type, kmpl, daily, extraDay, dirty, saving }
  const [rowMsg, setRowMsg] = useState({ kind: '', text: '' });

  useEffect(() => {
    get('/content/pricing')
      .then((p) => {
        setFuelPrice(String(p.fuelPricePerLitre ?? ''));
        setOriginal(String(p.fuelPricePerLitre ?? ''));
      })
      .catch((e) => setMsg({ kind: 'error', text: e.message || 'Could not load pricing settings.' }))
      .finally(() => setLoading(false));

    get('/trucks')
      .then((trucks) => setRows(
        trucks
          .filter((t) => t.status !== 'inactive')
          .map((t) => ({
            id: t.id, registration: t.registration, type: t.type,
            kmpl: t.fuel_efficiency_km_per_l ?? '',
            daily: t.daily_rate ?? '',
            extraDay: t.extra_day_rate ?? '',
            dirty: false, saving: false,
          }))
      ))
      .catch((e) => setRowMsg({ kind: 'error', text: e.message || 'Could not load trucks.' }));
  }, []);

  const setRow = (id, field, value) => {
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, [field]: value, dirty: true } : r));
  };

  const saveRow = async (row) => {
    setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, saving: true } : r));
    setRowMsg({ kind: '', text: '' });
    try {
      await patch(`/trucks/${row.id}`, {
        fuelEfficiencyKmPerL: row.kmpl === '' ? null : Number(row.kmpl),
        dailyRate: row.daily === '' ? null : Number(row.daily),
        extraDayRate: row.extraDay === '' ? null : Number(row.extraDay),
      });
      setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, dirty: false, saving: false } : r));
      setRowMsg({ kind: 'success', text: `${row.registration} rates saved.` });
    } catch (e) {
      setRows((rs) => rs.map((r) => r.id === row.id ? { ...r, saving: false } : r));
      setRowMsg({ kind: 'error', text: e.message || 'Could not save rates.' });
    }
  };

  const save = async () => {
    const value = Number(fuelPrice);
    if (!Number.isFinite(value) || value <= 0) {
      setMsg({ kind: 'error', text: 'Enter a fuel price greater than zero.' });
      return;
    }
    setSaving(true);
    setMsg({ kind: '', text: '' });
    try {
      await patch('/content/admin/settings', {
        settings: [{ key: 'fuel_price_per_litre', value: String(value) }],
      });
      setOriginal(String(value));
      setMsg({ kind: 'success', text: 'Fuel price saved. New cost calculations will use it immediately.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
          <a href="/portal/settings" className="text-xs text-gray-400 hover:text-gray-600">← Settings</a>
          <h1 className="text-base font-semibold text-gray-900 mt-1">Pricing</h1>
        </div>

        <div className="p-6 max-w-md">
          {loading ? (
            <div className="text-gray-400 text-sm">Loading…</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fuel price (KES per litre)</label>
                <input type="number" min="1" step="0.5" value={fuelPrice}
                  onChange={(e) => setFuelPrice(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#B060A0]/40" />
                <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">
                  Used by the journey planner: fuel cost = billable km ÷ truck km-per-litre × this price.
                  Changing it affects new cost calculations only — already-approved journey costs keep
                  the price they were calculated with.
                </p>
              </div>

              {msg.text && (
                <div className={`rounded-md px-3 py-2 text-sm ${
                  msg.kind === 'success'
                    ? 'bg-green-50 border border-green-100 text-green-800'
                    : 'bg-red-50 border border-red-100 text-red-800'}`}>
                  {msg.text}
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={save} disabled={saving || fuelPrice === original}
                  className="bg-[#B060A0] hover:bg-[#C176B4] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Calculation metrics — per-truck rate card (mirrors the costing sheet) */}
        <div className="px-6 pb-8 max-w-4xl">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Truck rate card</h2>
            <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
              The calculation metrics behind every quote and journey cost:
              <span className="font-mono"> total = (billable km ÷ fuel usage × fuel price) + cost/day + (extra days × extra-day rate)</span>.
              Edit a row and save it. Requires fleet manager or admin rights.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 text-[10px] uppercase tracking-wide">
                  <tr>
                    <th className="p-2.5 font-medium">Truck</th>
                    <th className="p-2.5 font-medium">Fuel usage (km/L)</th>
                    <th className="p-2.5 font-medium">Truck cost/day (KES)</th>
                    <th className="p-2.5 font-medium">Any extra day (KES)</th>
                    <th className="p-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="p-2.5">
                        <p className="font-medium text-gray-900 text-xs">{r.registration}</p>
                        <p className="text-[10px] text-gray-400">{r.type}</p>
                      </td>
                      <td className="p-2.5">
                        <input type="number" min="0" step="0.5" value={r.kmpl}
                          onChange={(e) => setRow(r.id, 'kmpl', e.target.value)}
                          className="w-20 text-xs border border-gray-200 rounded-md px-2 py-1.5" />
                      </td>
                      <td className="p-2.5">
                        <input type="number" min="0" step="500" value={r.daily}
                          onChange={(e) => setRow(r.id, 'daily', e.target.value)}
                          className="w-28 text-xs border border-gray-200 rounded-md px-2 py-1.5" />
                      </td>
                      <td className="p-2.5">
                        <input type="number" min="0" step="500" value={r.extraDay}
                          onChange={(e) => setRow(r.id, 'extraDay', e.target.value)}
                          className="w-28 text-xs border border-gray-200 rounded-md px-2 py-1.5" />
                      </td>
                      <td className="p-2.5 text-right">
                        <button onClick={() => saveRow(r)} disabled={!r.dirty || r.saving}
                          className="text-xs font-medium px-3 py-1.5 rounded-md bg-[#3A2150] text-white hover:bg-[#503070] disabled:opacity-30">
                          {r.saving ? '…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan="5" className="p-6 text-center text-gray-400 text-xs">No active trucks.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {rowMsg.text && (
              <div className={`mt-3 rounded-md px-3 py-2 text-xs ${
                rowMsg.kind === 'success'
                  ? 'bg-green-50 border border-green-100 text-green-800'
                  : 'bg-red-50 border border-red-100 text-red-800'}`}>
                {rowMsg.text}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
