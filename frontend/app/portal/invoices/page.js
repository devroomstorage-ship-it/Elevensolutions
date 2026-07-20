'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, post } from '@/lib/api';

const STATUS_COLORS = {
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-800',
  paid:      'bg-green-100 text-green-800',
  overdue:   'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-400',
};

const formatKES = (n) =>
  new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(n||0);

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [stats,    setStats]    = useState(null);
  const [loading,  setLoad]     = useState(true);
  const [filter,   setFilter]   = useState('all');
  const [sending,  setSending]  = useState(null);
  const [paying,   setPaying]   = useState(null);

  const load = () => {
    const url = filter !== 'all' ? `/invoices?status=${filter}` : '/invoices';
    Promise.all([get(url), get('/invoices/stats')])
      .then(([inv, s]) => { setInvoices(inv); setStats(s); })
      .catch(console.error)
      .finally(() => setLoad(false));
  };

  useEffect(load, [filter]);

  const sendInvoice = async (id) => {
    setSending(id);
    try {
      await post(`/invoices/${id}/send`, {});
      setInvoices(prev => prev.map(i => i.id === id ? {...i, status:'sent'} : i));
    } catch(err) { alert(err.message); }
    finally { setSending(null); }
  };

  const markPaid = async (id) => {
    if (!confirm('Mark this invoice as paid?')) return;
    setPaying(id);
    try {
      const updated = await post(`/invoices/${id}/mark-paid`, {});
      setInvoices(prev => prev.map(i => i.id === id ? {...i, status:'paid', paid_date: updated.paid_date} : i));
    } catch(err) { alert(err.message); }
    finally { setPaying(null); }
  };

  const filters = ['all','draft','sent','paid','overdue'];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">Invoices</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">QuickBooks</span>
            <span className="bg-green-100 text-green-700 text-xs px-2.5 py-1 rounded-full font-medium">Synced</span>
          </div>
        </div>

        <div className="p-6">
          {/* Summary cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Outstanding',    value: formatKES(stats.outstanding_amount), sub: `${stats.outstanding_count} invoices` },
                { label: 'Overdue',        value: stats.overdue_count, sub: 'invoices past due', red: true },
                { label: 'Paid This Month',value: formatKES(stats.paid_this_month), green: true },
                { label: 'Total Open',     value: stats.outstanding_count, sub: 'unpaid invoices' },
              ].map(c => (
                <div key={c.label} className="bg-gray-100/70 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                  <p className={`text-xl font-semibold ${c.red ? 'text-red-600' : c.green ? 'text-green-700' : 'text-gray-900'}`}>
                    {c.value}
                  </p>
                  {c.sub && <p className="text-[11px] text-gray-400 mt-0.5">{c.sub}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {filters.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full capitalize font-medium transition-colors border ${
                  filter === f ? 'bg-[#3A2150] text-white border-[#3A2150]' : 'border-gray-200 text-gray-600 hover:border-gray-400'
                }`}>
                {f}
              </button>
            ))}
          </div>

          {/* Invoice table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Invoice No.','Client','Amount','Issue Date','Due Date','Status','Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading invoices…</td></tr>
                  ) : invoices.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400">No invoices found</td></tr>
                  ) : invoices.map(inv => (
                    <tr key={inv.id} className={`hover:bg-gray-50/50 ${inv.status === 'overdue' ? 'bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3 font-mono text-gray-600">{inv.reference}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{inv.company_name}</p>
                        <p className="text-gray-400 text-[10px]">{inv.client_email}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatKES(inv.total_amount)}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.issue_date}</td>
                      <td className={`px-4 py-3 font-medium ${inv.status==='overdue' ? 'text-red-600' : 'text-gray-500'}`}>
                        {inv.due_date}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[inv.status]}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {(inv.status === 'draft' || inv.status === 'sent' || inv.status === 'overdue') && (
                            <button onClick={() => sendInvoice(inv.id)} disabled={sending === inv.id}
                              className="bg-[#3A2150] hover:bg-[#503070] disabled:opacity-50 text-white text-[10px] px-2.5 py-1 rounded transition-colors">
                              {sending === inv.id ? '…' : '📧 Email'}
                            </button>
                          )}
                          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                            <button onClick={() => markPaid(inv.id)} disabled={paying === inv.id}
                              className="border border-green-300 text-green-700 text-[10px] px-2.5 py-1 rounded hover:bg-green-50 disabled:opacity-50">
                              {paying === inv.id ? '…' : '✓ Paid'}
                            </button>
                          )}
                          {inv.status === 'paid' && (
                            <span className="text-green-600 text-[10px]">✓ Paid {inv.paid_date}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
