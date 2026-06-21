'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, patch, post } from '@/lib/api';

const STATUS_COLORS = {
  pending:  'bg-amber-100 text-amber-800',
  sent:     'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  expired:  'bg-gray-100 text-gray-600',
};

const formatKES = (n) => n ? new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(n) : '—';

export default function QuotesPage() {
  const [quotes,   setQuotes]  = useState([]);
  const [loading,  setLoad]    = useState(true);
  const [filter,   setFilter]  = useState('all');
  const [selected, setSelected]= useState(null);
  const [amount,   setAmount]  = useState('');
  const [saving,   setSaving]  = useState(false);
  const [sending,  setSending] = useState(false);

  const loadQuotes = () => {
    const url = filter !== 'all' ? `/quotes?status=${filter}` : '/quotes';
    get(url).then(setQuotes).catch(console.error).finally(() => setLoad(false));
  };

  useEffect(loadQuotes, [filter]);

  const openQuote = (q) => { setSelected(q); setAmount(q.amount || ''); };

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
      await post(`/quotes/${selected.id}/send`, {});
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

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
          <div className="flex justify-between items-center">
            <h1 className="text-base font-semibold text-gray-900">Quotations</h1>
            <div className="flex items-center gap-2">
              <span className="bg-amber-100 text-amber-700 text-xs px-2.5 py-1 rounded-full font-medium">
                {quotes.filter(q=>q.status==='pending').length} pending
              </span>
            </div>
          </div>
        </div>

        <div className="flex h-[calc(100vh-56px)]">
          {/* List panel */}
          <div className="w-80 border-r border-gray-100 bg-white flex flex-col">
            <div className="p-3 border-b border-gray-100">
              <div className="flex gap-1 flex-wrap">
                {filters.map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`text-[10px] px-2 py-1 rounded-full capitalize transition-colors ${
                      filter === f ? 'bg-[#0F1E2E] text-white' : 'text-gray-500 hover:bg-gray-100'
                    }`}>
                    {f.replace('_',' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {loading ? (
                <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
              ) : quotes.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">No quotes found</div>
              ) : quotes.map(q => (
                <div key={q.id} onClick={() => openQuote(q)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${selected?.id === q.id ? 'bg-orange-50 border-l-2 border-[#E8620A]' : ''}`}>
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-xs font-semibold text-gray-900 truncate pr-2">{q.company_name}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[q.status]}`}>
                      {q.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate">{q.origin} → {q.destination}</p>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-gray-400 font-mono">{q.reference}</span>
                    <span className="text-[11px] font-semibold text-[#E8620A]">{formatKES(q.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          <div className="flex-1 p-6 overflow-y-auto">
            {!selected ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <p className="text-4xl mb-3">📋</p>
                  <p className="text-sm">Select a quote to view details</p>
                </div>
              </div>
            ) : (
              <div className="max-w-lg">
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">{selected.company_name}</h2>
                    <p className="text-xs text-gray-400 font-mono">{selected.reference}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[selected.status]}`}>
                    {selected.status}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-2.5 mb-5">
                  {[
                    ['Email',    selected.contact_email || selected.client_email],
                    ['Route',    `${selected.origin} → ${selected.destination}`],
                    ['Cargo',    selected.cargo_type || '—'],
                    ['Weight',   selected.weight_tons ? `${selected.weight_tons} tons` : '—'],
                    ['Received', selected.created_at ? new Date(selected.created_at).toLocaleDateString('en-GB') : '—'],
                  ].map(([k,v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-gray-400">{k}</span>
                      <span className="text-gray-800 font-medium">{v}</span>
                    </div>
                  ))}
                  {selected.notes && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-400 mb-1">Notes</p>
                      <p className="text-xs text-gray-700">{selected.notes}</p>
                    </div>
                  )}
                </div>

                {/* Pricing */}
                <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-3">Quote Amount (KES)</p>
                  <div className="flex gap-2">
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#E8620A]" />
                    <button onClick={saveAmount} disabled={saving}
                      className="border border-gray-200 text-gray-600 text-xs px-3 py-2 rounded-md hover:bg-gray-50 disabled:opacity-50">
                      {saving ? '…' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  {selected.status === 'pending' && (
                    <button onClick={sendQuote} disabled={sending}
                      className="w-full bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                      {sending ? 'Sending…' : '📧 Send Quote to Client'}
                    </button>
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
                  {selected.status === 'pending' && (
                    <button onClick={sendQuote} disabled={sending} className="hidden" />
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
