'use client';
import { useEffect, useRef, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, patch, post } from '@/lib/api';

const STATUS_COLORS = {
  pending:  'bg-amber-100 text-amber-800',
  sent:     'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  expired:  'bg-gray-100 text-gray-600',
};

const formatKES = (n) => (n || n === 0) ? new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(n) : '—';

export default function QuotesPage() {
  const [quotes,   setQuotes]  = useState([]);
  const [trucks,   setTrucks]  = useState([]);
  const [loading,  setLoad]    = useState(true);
  const [filter,   setFilter]  = useState('all');
  const [selected, setSelected]= useState(null);
  const [amount,   setAmount]  = useState('');
  const [saving,   setSaving]  = useState(false);
  const [sending,  setSending] = useState(false);
  const [emailNote, setEmailNote] = useState('');

  // Price calculator (fuel-based costing — the client's Truck Costing sheet)
  const [calc, setCalc] = useState({ truckId: '', days: 1, roundTrip: true, distanceKm: '', extraCharges: '', manualAdjustment: '', dailyRate: '', extraDayRate: '' });
  const [calcResult, setCalcResult] = useState(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [calcErr, setCalcErr] = useState('');

  const selectedIdRef = useRef(null);
  const debounceRef = useRef(null);

  const loadQuotes = () => {
    const url = filter !== 'all' ? `/quotes?status=${filter}` : '/quotes';
    get(url).then(setQuotes).catch(console.error).finally(() => setLoad(false));
  };

  useEffect(loadQuotes, [filter]);
  useEffect(() => {
    get('/trucks')
      .then((t) => setTrucks(
        t.filter(x => x.status !== 'inactive' && Number(x.fuel_efficiency_km_per_l) > 0)
         .sort((a, b) => Number(a.capacity_tons) - Number(b.capacity_tons))
      ))
      .catch(() => {});
  }, []);

  const openQuote = (q) => {
    selectedIdRef.current = q.id;
    setSelected(q);
    setAmount(q.amount || '');
    setEmailNote('');
    setCalcResult(null);
    setCalcErr('');
    // truckId '' triggers the auto-pick effect below; distance resolves server-side.
    setCalc({ truckId: '', days: 1, roundTrip: true, distanceKm: '', extraCharges: '', manualAdjustment: '', dailyRate: '', extraDayRate: '' });
  };

  // Pick the smallest truck that can carry the quoted weight (falls back to
  // the smallest truck in the fleet when weight is missing or oversized).
  const autoPickTruck = (q) => {
    if (!trucks.length) return '';
    const w = Number(q?.weight_tons) || 0;
    const fit = trucks.find(t => Number(t.capacity_tons) >= w);
    return (fit || trucks[trucks.length - 1]).id;
  };

  const runCalc = async (quoteId, params) => {
    setCalcBusy(true);
    setCalcErr('');
    try {
      const r = await post(`/quotes/${quoteId}/calculate-price`, {
        truckId: params.truckId,
        days: Number(params.days) || 1,
        roundTrip: !!params.roundTrip,
        distanceKm: params.distanceKm === '' ? undefined : Number(params.distanceKm),
        extraCharges: Number(params.extraCharges) || 0,
        manualAdjustment: Number(params.manualAdjustment) || 0,
        dailyRate: params.dailyRate === '' ? undefined : Number(params.dailyRate),
        extraDayRate: params.extraDayRate === '' ? undefined : Number(params.extraDayRate),
      });
      if (selectedIdRef.current !== quoteId) return; // user moved to another quote
      setCalcResult(r.breakdown);
      setCalc((c) => Number(c.distanceKm) === Number(r.breakdown.distanceKm) ? c : { ...c, distanceKm: r.breakdown.distanceKm });
    } catch (err) {
      if (selectedIdRef.current !== quoteId) return;
      setCalcResult(null);
      setCalcErr(err.message || 'Could not calculate a price.');
    } finally {
      if (selectedIdRef.current === quoteId) setCalcBusy(false);
    }
  };

  // Seamless suggestion: auto-pick a truck when a quote opens, then
  // (re)calculate automatically whenever any calculator input changes.
  useEffect(() => {
    if (!selected || !trucks.length) return;
    if (!calc.truckId) {
      const id = autoPickTruck(selected);
      if (id) setCalc((c) => ({ ...c, truckId: id }));
      return;
    }
    clearTimeout(debounceRef.current);
    const quoteId = selected.id;
    const params = { ...calc };
    debounceRef.current = setTimeout(() => runCalc(quoteId, params), 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, trucks, calc.truckId, calc.days, calc.roundTrip, calc.distanceKm, calc.extraCharges, calc.manualAdjustment, calc.dailyRate, calc.extraDayRate]);

  const saveAmount = async () => {
    if (!amount) return;
    setSaving(true);
    try {
      const updated = await patch(`/quotes/${selected.id}`, { amount: parseFloat(amount) });
      setQuotes(prev => prev.map(q => q.id === selected.id ? {...q, amount: updated.amount} : q));
      setSelected(prev => ({...prev, amount: updated.amount}));
    } catch(err) { alert(err.message); }
    finally { setSaving(false); }
  };

  const sendQuote = async () => {
    if (!selected.amount && !amount) { alert('Set a price before sending.'); return; }
    if (amount && !selected.amount) await saveAmount();
    setSending(true);
    try {
      await post(`/quotes/${selected.id}/send`, { note: emailNote.trim() || undefined });
      setQuotes(prev => prev.map(q => q.id === selected.id ? {...q, status:'sent'} : q));
      setSelected(prev => ({...prev, status:'sent'}));
    } catch(err) { alert(err.message); }
    finally { setSending(false); }
  };

  const updateStatus = async (status) => {
    try {
      await patch(`/quotes/${selected.id}`, { status });
      setQuotes(prev => prev.map(q => q.id === selected.id ? {...q, status} : q));
      setSelected(prev => ({...prev, status}));
    } catch(err) { alert(err.message); }
  };

  const filters = ['all','pending','sent','accepted','declined','expired'];
  const selectedTruck = trucks.find(t => t.id === calc.truckId);

  return (
    <div className="flex h-screen bg-[var(--paper)] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        <div className="bg-white border-b border-[var(--line)] px-6 py-4 sticky top-0 z-10">
          <div className="flex justify-between items-center">
            <h1 className="text-base font-semibold text-[var(--ink)]">Quotations</h1>
            <span className="bg-amber-100 text-amber-700 text-xs px-2.5 py-1 rounded-full font-medium">
              {quotes.filter(q=>q.status==='pending').length} pending
            </span>
          </div>
        </div>

        <div className="flex h-[calc(100vh-56px)]">
          {/* List panel */}
          <div className="w-80 border-r border-[var(--line)] bg-white flex flex-col">
            <div className="p-3 border-b border-[var(--line)]">
              <div className="flex gap-1 flex-wrap">
                {filters.map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`text-[10px] px-2 py-1 rounded-full capitalize transition-colors ${
                      filter === f ? 'bg-[var(--plum-800)] text-white' : 'text-[var(--mist)] hover:bg-[var(--paper)]'
                    }`}>
                    {f.replace('_',' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {loading ? (
                <div className="p-6 text-center text-[var(--mist)] text-sm">Loading…</div>
              ) : quotes.length === 0 ? (
                <div className="p-6 text-center text-[var(--mist)] text-sm">No quotes found</div>
              ) : quotes.map(q => (
                <div key={q.id} onClick={() => openQuote(q)}
                  className={`p-4 cursor-pointer hover:bg-[var(--paper)] transition-colors ${selected?.id === q.id ? 'bg-[#F5EEF7] border-l-2 border-[var(--orchid-500)]' : ''}`}>
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-xs font-semibold text-[var(--ink)] truncate pr-2">{q.company_name}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[q.status]}`}>
                      {q.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--mist)] truncate">{q.origin} → {q.destination}</p>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-gray-400 font-mono">{q.reference}</span>
                    <span className="text-[11px] font-semibold text-[var(--plum-700)]">{formatKES(q.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          <div className="flex-1 p-6 overflow-y-auto">
            {!selected ? (
              <div className="flex items-center justify-center h-full text-[var(--mist)]">
                <div className="text-center">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm">Select a quote to view details</p>
                </div>
              </div>
            ) : (
              <div className="max-w-xl">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--ink)]">{selected.company_name}</h2>
                    <p className="text-xs text-gray-400 font-mono">{selected.reference}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[selected.status]}`}>
                    {selected.status}
                  </span>
                </div>

                {/* ── Suggested price hero — appears automatically ─────────── */}
                <div className="rounded-2xl p-5 mb-5 text-white shadow-lg" style={{ background: 'var(--grad)' }}>
                  {calcResult ? (
                    <>
                      <div className="flex items-end justify-between flex-wrap gap-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-white/70 font-semibold">Suggested price</p>
                          <p className="text-3xl font-bold mt-0.5">{formatKES(calcResult.estimatedCost)}</p>
                        </div>
                        <button onClick={() => setAmount(String(calcResult.estimatedCost))}
                          className="bg-white text-[var(--plum-800)] hover:bg-[var(--orchid-300)] text-xs font-semibold px-4 py-2 rounded-full transition-colors">
                          Use this amount ↓
                        </button>
                      </div>
                      <div className="mt-4 pt-3 border-t border-white/20 text-[13px] space-y-1.5">
                        <Line k={`Fuel — ${calcResult.billableKm} km${calcResult.roundTrip ? ' (round trip)' : ''} ÷ ${calcResult.fuelEfficiencyKmPerL} km/L × ${formatKES(calcResult.fuelPricePerL)}/L`} v={formatKES(calcResult.fuelCost)} />
                        <Line k={`Day rate${calc.dailyRate !== '' ? ' (custom for this quote)' : ''}`} v={formatKES(calcResult.dailyRate)} />
                        {calcResult.extraDays > 0 && (
                          <Line k={`Extra days (${calcResult.extraDays} × ${formatKES(calcResult.extraDayRate)}${calc.extraDayRate !== '' ? ', custom' : ''})`} v={formatKES(calcResult.extraDays * calcResult.extraDayRate)} />
                        )}
                        {Number(calcResult.extraCharges) > 0 && <Line k="Extra charges" v={formatKES(calcResult.extraCharges)} />}
                        {Number(calcResult.manualAdjustment) !== 0 && <Line k="Adjustment" v={formatKES(calcResult.manualAdjustment)} />}
                      </div>
                      {selectedTruck && (
                        <p className="mt-3 text-[11px] text-white/60">
                          Based on {selectedTruck.registration} — {selectedTruck.type}
                          {selected.weight_tons ? `, auto-selected for ${Number(selected.weight_tons)} t` : ''} · adjust below
                        </p>
                      )}
                    </>
                  ) : calcBusy ? (
                    <div className="flex items-center gap-3 py-2">
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <p className="text-sm text-white/80">Calculating suggested price…</p>
                    </div>
                  ) : calcErr ? (
                    <div className="py-1">
                      <p className="text-[11px] uppercase tracking-widest text-white/70 font-semibold mb-1">Suggested price</p>
                      <p className="text-sm text-white/90">{calcErr}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-white/80 py-2">Preparing suggestion…</p>
                  )}
                </div>

                {/* Details */}
                <div className="bg-white rounded-xl border border-[var(--line)] p-4 space-y-2.5 mb-4">
                  {[
                    ['Email',    selected.contact_email || selected.client_email],
                    ['Route',    `${selected.origin} → ${selected.destination}`],
                    ['Cargo',    selected.cargo_type || '—'],
                    ['Weight',   selected.weight_tons ? `${selected.weight_tons} tons` : '—'],
                    ['Received', selected.created_at ? new Date(selected.created_at).toLocaleDateString('en-GB') : '—'],
                  ].map(([k,v]) => (
                    <div key={k} className="flex justify-between text-xs gap-4">
                      <span className="text-[var(--mist)] flex-shrink-0">{k}</span>
                      <span className="text-[var(--ink)] font-medium text-right">{v}</span>
                    </div>
                  ))}
                  {selected.notes && (
                    <div className="pt-2 border-t border-[var(--line)]">
                      <p className="text-xs text-[var(--mist)] mb-1">Customer notes</p>
                      <p className="text-xs text-[var(--ink)]">{selected.notes}</p>
                    </div>
                  )}
                </div>

                {/* Calculator inputs — tune the suggestion, it recalculates live */}
                <div className="bg-white rounded-xl border border-[var(--line)] p-4 mb-4">
                  <p className="text-xs font-semibold text-[var(--ink)] mb-3">Adjust the calculation</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-medium text-[var(--mist)] mb-0.5">Truck</label>
                      <select value={calc.truckId} onChange={e => setCalc({ ...calc, truckId: e.target.value })}
                        className="w-full text-xs border border-[var(--line)] rounded-md px-2 py-1.5 bg-white">
                        {trucks.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.registration} — {t.type} ({Number(t.fuel_efficiency_km_per_l)} km/L · {formatKES(t.daily_rate)}/day)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--mist)] mb-0.5">Days</label>
                      <input type="number" min="1" value={calc.days}
                        onChange={e => setCalc({ ...calc, days: e.target.value })}
                        className="w-full text-xs border border-[var(--line)] rounded-md px-2 py-1.5" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--mist)] mb-0.5">Distance km (auto)</label>
                      <input type="number" min="0" value={calc.distanceKm} placeholder="auto via Google"
                        onChange={e => setCalc({ ...calc, distanceKm: e.target.value })}
                        className="w-full text-xs border border-[var(--line)] rounded-md px-2 py-1.5" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--mist)] mb-0.5">Extra charges</label>
                      <input type="number" min="0" value={calc.extraCharges} placeholder="0"
                        onChange={e => setCalc({ ...calc, extraCharges: e.target.value })}
                        className="w-full text-xs border border-[var(--line)] rounded-md px-2 py-1.5" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--mist)] mb-0.5">Adjustment (+/-)</label>
                      <input type="number" value={calc.manualAdjustment} placeholder="0"
                        onChange={e => setCalc({ ...calc, manualAdjustment: e.target.value })}
                        className="w-full text-xs border border-[var(--line)] rounded-md px-2 py-1.5" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--mist)] mb-0.5">
                        Day rate — this quote only
                      </label>
                      <input type="number" min="0" value={calc.dailyRate}
                        placeholder={selectedTruck ? `truck default ${Number(selectedTruck.daily_rate).toLocaleString()}` : 'truck default'}
                        onChange={e => setCalc({ ...calc, dailyRate: e.target.value })}
                        className="w-full text-xs border border-[var(--line)] rounded-md px-2 py-1.5" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-[var(--mist)] mb-0.5">
                        Extra-day rate — this quote only
                      </label>
                      <input type="number" min="0" value={calc.extraDayRate}
                        placeholder={selectedTruck ? `truck default ${Number(selectedTruck.extra_day_rate).toLocaleString()}` : 'truck default'}
                        onChange={e => setCalc({ ...calc, extraDayRate: e.target.value })}
                        className="w-full text-xs border border-[var(--line)] rounded-md px-2 py-1.5" />
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--mist)] mb-2">
                    Rate overrides apply to this quotation only — the truck's saved rates are not changed.
                  </p>
                  <label className="flex items-center gap-2 text-[11px] text-[var(--mist)]">
                    <input type="checkbox" checked={!!calc.roundTrip}
                      onChange={e => setCalc({ ...calc, roundTrip: e.target.checked })} />
                    Round trip — fuel billed on 2× distance
                  </label>
                </div>

                {/* Quote amount — always editable, the admin has the final word */}
                <div className="bg-white rounded-xl border border-[var(--line)] p-4 mb-4">
                  <p className="text-xs font-semibold text-[var(--ink)] mb-3">Quote Amount (KES)</p>
                  <div className="flex gap-2">
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="flex-1 border border-[var(--line)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--orchid-500)]" />
                    <button onClick={saveAmount} disabled={saving}
                      className="bg-[var(--plum-700)] hover:bg-[var(--plum-600)] text-white text-xs font-medium px-4 py-2 rounded-md disabled:opacity-50">
                      {saving ? '…' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-3">
                  {selected.status === 'pending' && (
                    <>
                      <div className="bg-white rounded-xl border border-[var(--line)] p-4">
                        <p className="text-xs font-semibold text-[var(--ink)] mb-1">
                          Note to client <span className="font-normal text-[var(--mist)]">(optional — goes in the email)</span>
                        </p>
                        <textarea value={emailNote} onChange={e => setEmailNote(e.target.value)} rows={3} maxLength={1000}
                          placeholder="e.g. This rate includes a return leg — valid for loads booked before end of month."
                          className="w-full text-xs border border-[var(--line)] rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-[var(--orchid-500)]" />
                      </div>
                      <button onClick={sendQuote} disabled={sending}
                        className="w-full text-white font-semibold py-3 rounded-full text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: 'var(--grad)' }}>
                        {sending ? 'Sending…' : '📧 Send Quote to Client'}
                      </button>
                    </>
                  )}
                  {selected.status === 'sent' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => updateStatus('accepted')}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-2 rounded-lg">
                        Mark Accepted
                      </button>
                      <button onClick={() => updateStatus('declined')}
                        className="border border-red-200 text-red-600 text-xs font-medium py-2 rounded-lg hover:bg-red-50">
                        Mark Declined
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Line({ k, v }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-white/70">{k}</span>
      <span className="font-semibold whitespace-nowrap">{v}</span>
    </div>
  );
}
