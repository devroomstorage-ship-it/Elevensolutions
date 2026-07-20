'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Sidebar from '@/components/admin/Sidebar';
import { get, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const fmtKES = (n) => 'KES ' + Number(n || 0).toLocaleString();

const STATUS_COLORS = {
  scheduled:  'bg-amber-100 text-amber-800',
  loading:    'bg-amber-100 text-amber-800',
  in_transit: 'bg-blue-100 text-blue-800',
  delivered:  'bg-green-100 text-green-800',
  cancelled:  'bg-gray-100 text-gray-600',
};
const QB_COLORS = {
  synced:     'bg-green-100 text-green-800',
  error:      'bg-red-100 text-red-800',
  not_synced: 'bg-gray-100 text-gray-600',
};

export default function JourneyDetailPage() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const canGenerateQuote   = hasRole('super_admin', 'fleet_manager', 'planner');
  const canGenerateInvoice = hasRole('super_admin', 'finance');
  const [j, setJ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [invForm, setInvForm] = useState({ amount: '', taxRate: 0, dueDays: 14 });

  const load = () => get(`/journeys/${id}`).then((data) => {
    setJ(data);
    setInvForm((f) => ({ ...f, amount: data.final_cost ?? data.estimated_cost ?? '' }));
  }).catch(e => alert(e.message)).finally(() => setLoading(false));
  useEffect(() => { if (id) load(); }, [id]);

  const markDelivered = async () => {
    setBusy('deliver');
    try { await post(`/journeys/${id}/mark-delivered`); load(); }
    catch (e) { alert(e.message); } finally { setBusy(''); }
  };

  const pushInvoice = async () => {
    setBusy('qb');
    try {
      const r = await post(`/quickbooks/create-invoice/${id}`);
      alert(r.skipped ? 'Already synced to QuickBooks.' : 'Invoice pushed to QuickBooks.');
      load();
    } catch (e) { alert('QuickBooks: ' + e.message); }
    finally { setBusy(''); }
  };

  const generateQuotation = async () => {
    setBusy('quote');
    try { await post(`/journeys/${id}/generate-quotation`); load(); }
    catch (e) { alert(e.message); } finally { setBusy(''); }
  };

  const generateInvoice = async () => {
    if (!invForm.amount) { alert('Enter an amount.'); return; }
    setBusy('invoice');
    try {
      await post('/invoices', {
        clientId: j.client_id,
        journeyId: j.id,
        amount: Number(invForm.amount),
        taxRate: Number(invForm.taxRate) || 0,
        dueDays: Number(invForm.dueDays) || 14,
      });
      load();
    } catch (e) { alert(e.message); } finally { setBusy(''); }
  };

  if (loading) return <Shell><div className="p-6 text-gray-400">Loading…</div></Shell>;
  if (!j) return <Shell><div className="p-6 text-gray-400">Journey not found.</div></Shell>;

  const c = j.cost;
  const mapKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const mapSrc = mapKey && j.pickup_lat
    ? `https://www.google.com/maps/embed/v1/directions?key=${mapKey}&origin=${j.pickup_lat},${j.pickup_lng}&destination=${j.dropoff_lat},${j.dropoff_lng}&mode=driving`
    : null;

  return (
    <Shell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex justify-between items-center">
        <div>
          <a href="/portal/schedule" className="text-xs text-gray-400 hover:text-gray-600">← Planner</a>
          <h1 className="text-base font-semibold text-gray-900 mt-1">
            {j.reference}
            <span className={`ml-3 px-2 py-0.5 rounded-full text-xs capitalize ${STATUS_COLORS[j.status] || 'bg-gray-100'}`}>{j.status?.replace('_', ' ')}</span>
          </h1>
        </div>
        <div className="flex gap-2">
          {j.status !== 'delivered' && j.status !== 'cancelled' && (
            <button onClick={markDelivered} disabled={busy === 'deliver'}
              className="text-xs font-medium px-4 py-2 rounded-md border border-green-600 text-green-700 hover:bg-green-50 disabled:opacity-40">
              {busy === 'deliver' ? '…' : 'Mark delivered'}
            </button>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map + route */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {mapSrc ? (
              <iframe title="route" width="100%" height="320" style={{ border: 0 }} loading="lazy" src={mapSrc} />
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
                {j.pickup_lat ? 'Set NEXT_PUBLIC_GOOGLE_MAPS_KEY to show the route map.' : 'No coordinates — calculate the route in the planner.'}
              </div>
            )}
            <div className="p-5 grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-gray-400">Pickup</p><p className="text-gray-800">{j.origin}</p></div>
              <div><p className="text-xs text-gray-400">Drop-off</p><p className="text-gray-800">{j.destination}</p></div>
              <div><p className="text-xs text-gray-400">Distance</p><p className="text-gray-800">{j.distance_km ? `${j.distance_km} km` : '—'}</p></div>
              <div><p className="text-xs text-gray-400">Est. duration</p><p className="text-gray-800">{j.estimated_duration_min ? `${j.estimated_duration_min} min` : '—'}</p></div>
            </div>
            {j.directions_link && <a href={j.directions_link} target="_blank" rel="noreferrer" className="block px-5 pb-4 text-xs text-[#B060A0] hover:underline">Open in Google Maps ↗</a>}
          </div>

          {/* Cost breakdown */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Cost breakdown</h2>
            {c ? (
              <div className="text-sm space-y-1.5">
                {c.fuel_cost != null ? (
                  <>
                    <Line k={`Fuel — ${c.billable_km} km${c.round_trip ? ' (round trip)' : ''} ÷ ${Number(c.fuel_efficiency_km_per_l)} km/L × ${fmtKES(c.fuel_price_per_l)}/L`}
                      v={fmtKES(c.fuel_cost)} />
                    <Line k="Day rate" v={fmtKES(c.daily_rate)} />
                    {Number(c.days) > 1 && (
                      <Line k={`Extra days (${Number(c.days) - 1} × ${fmtKES(c.extra_day_rate)})`}
                        v={fmtKES((Number(c.days) - 1) * Number(c.extra_day_rate))} />
                    )}
                  </>
                ) : (
                  // Legacy per-km breakdown (rows calculated before the fuel model)
                  <>
                    <Line k={`Distance (${c.distance_km} km × ${fmtKES(c.cost_per_km)})`} v={fmtKES(Number(c.distance_km) * Number(c.cost_per_km))} />
                    <Line k={`Fixed daily × ${c.days}`} v={fmtKES(Number(c.fixed_daily_cost) * Number(c.days))} />
                  </>
                )}
                <Line k="Extra charges" v={fmtKES(c.extra_charges)} />
                <Line k="Manual adjustment" v={fmtKES(c.manual_adjustment)} />
                <div className="border-t border-gray-100 pt-2 mt-2">
                  <Line k="Estimated" v={fmtKES(c.estimated_cost)} bold />
                  <Line k="Approved final" v={c.final_cost != null ? fmtKES(c.final_cost) : 'Not approved'} bold accent={c.final_cost != null ? 'text-green-700' : 'text-gray-400'} />
                </div>
              </div>
            ) : <p className="text-sm text-gray-400">No cost calculated yet — use the planner.</p>}
          </div>
        </div>

        {/* Side: assignment + invoice/QB */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Assignment</h2>
            <Row k="Driver" v={j.driver_name || j.driver_name_snapshot} />
            <Row k="Truck" v={j.registration || j.truck_registration_snapshot} />
            <Row k="Customer" v={j.client_name} />
            <Row k="Cargo" v={[j.cargo_type, j.cargo_weight_tons && `${j.cargo_weight_tons} t`].filter(Boolean).join(' · ')} />
            <Row k="Scheduled" v={new Date(j.scheduled_date).toLocaleDateString()} />
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Quotation</h2>
            {j.quotation ? (
              <>
                <Row k="Quotation" v={j.quotation.reference} />
                <Row k="Status" v={j.quotation.status} />
                <Row k="Amount" v={fmtKES(j.quotation.amount)} />
                <a href="/portal/quotes" className="mt-2 inline-block text-xs text-[#B060A0] hover:underline">
                  Open in Quotations →
                </a>
              </>
            ) : !canGenerateQuote ? (
              <p className="text-sm text-gray-400">Only fleet managers, planners and admins can generate quotations.</p>
            ) : !j.client_id ? (
              <p className="text-sm text-gray-400">Assign a customer to this journey to generate a quotation.</p>
            ) : (j.final_cost ?? j.estimated_cost) == null ? (
              <p className="text-sm text-gray-400">Calculate a cost in the planner before generating a quotation.</p>
            ) : (
              <button onClick={generateQuotation} disabled={busy === 'quote'}
                className="w-full text-xs font-medium px-4 py-2 rounded-md border border-[#3A2150] text-[#3A2150] hover:bg-[#3A2150] hover:text-white disabled:opacity-40">
                {busy === 'quote' ? 'Generating…' : 'Generate quotation'}
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Invoice & QuickBooks</h2>
            {j.invoice ? (
              <>
                <Row k="Invoice" v={j.invoice.reference} />
                <Row k="Invoice status" v={j.invoice.status} />
                <div className="flex justify-between py-1.5 text-sm">
                  <span className="text-gray-400">QuickBooks</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${QB_COLORS[j.invoice.qb_sync_status] || 'bg-gray-100'}`}>
                    {(j.invoice.qb_sync_status || 'not_synced').replace('_', ' ')}
                  </span>
                </div>
                {j.invoice.qb_sync_status !== 'synced' && (
                  <button onClick={pushInvoice} disabled={busy === 'qb'}
                    className="mt-3 w-full text-xs font-medium px-4 py-2 rounded-md bg-[#3A2150] text-white hover:bg-[#503070] disabled:opacity-40">
                    {busy === 'qb' ? 'Pushing…' : 'Push invoice to QuickBooks'}
                  </button>
                )}
              </>
            ) : !canGenerateInvoice ? (
              <p className="text-sm text-gray-400">Only finance and admins can generate invoices.</p>
            ) : !j.client_id ? (
              <p className="text-sm text-gray-400">Assign a customer to this journey to generate an invoice.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <MiniField label="Amount" value={invForm.amount}
                    onChange={(v) => setInvForm({ ...invForm, amount: v })} />
                  <MiniField label="Tax %" value={invForm.taxRate}
                    onChange={(v) => setInvForm({ ...invForm, taxRate: v })} />
                  <MiniField label="Due (days)" value={invForm.dueDays}
                    onChange={(v) => setInvForm({ ...invForm, dueDays: v })} />
                </div>
                <button onClick={generateInvoice} disabled={busy === 'invoice'}
                  className="w-full text-xs font-medium px-4 py-2 rounded-md bg-[#B060A0] hover:bg-[#C176B4] text-white disabled:opacity-40">
                  {busy === 'invoice' ? 'Generating…' : 'Generate invoice'}
                </button>
              </div>
            )}
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
function Row({ k, v }) {
  return (
    <div className="flex justify-between py-1.5 text-sm border-b border-gray-50 last:border-0">
      <span className="text-gray-400">{k}</span>
      <span className="text-gray-800 capitalize text-right">{v || '—'}</span>
    </div>
  );
}
function Line({ k, v, bold, accent = 'text-gray-900' }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{k}</span>
      <span className={`${bold ? 'font-semibold' : ''} ${accent}`}>{v}</span>
    </div>
  );
}
function MiniField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-gray-500 mb-0.5">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#B060A0]" />
    </div>
  );
}
