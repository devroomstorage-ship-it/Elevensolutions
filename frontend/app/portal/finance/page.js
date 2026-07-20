'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, post } from '@/lib/api';

const fmtKES = (n) => 'KES ' + Number(n || 0).toLocaleString();
const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export default function FinancePage() {
  const [qb, setQb]         = useState(null);
  const [logs, setLogs]     = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState('');

  const load = () => {
    Promise.all([
      get('/quickbooks/status').catch(() => ({ connected: false })),
      get('/quickbooks/logs').catch(() => []),
      get('/trucks').catch(() => []),
      get('/invoices').catch(() => []),
    ]).then(([q, l, t, i]) => { setQb(q); setLogs(l); setTrucks(t); setInvoices(i); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Load profitability per truck (one call each; small fleet).
  const [profit, setProfit] = useState({});
  useEffect(() => {
    trucks.forEach(t => {
      get(`/trucks/${t.id}/profitability`).then(p => setProfit(prev => ({ ...prev, [t.id]: p }))).catch(() => {});
    });
  }, [trucks]);

  const retry = async (logId) => {
    setRetrying(logId);
    try { await post(`/quickbooks/retry-sync/${logId}`); load(); }
    catch (e) { alert('Retry failed: ' + e.message); }
    finally { setRetrying(''); }
  };

  const failed = logs.filter(l => l.status === 'error');
  const paidTotal = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const outstanding = invoices.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + Number(i.total_amount || 0), 0);

  if (loading) return <Shell><div className="p-6 text-gray-400">Loading…</div></Shell>;

  return (
    <Shell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-base font-semibold text-gray-900">Finance</h1>
      </div>

      <div className="p-6 space-y-6">
        {/* Top cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Stat label="Paid (revenue)" value={fmtKES(paidTotal)} accent="text-green-700" />
          <Stat label="Outstanding" value={fmtKES(outstanding)} accent="text-amber-600" />
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-xs text-gray-400">QuickBooks</p>
            {qb?.connected ? (
              <p className={`text-sm font-semibold mt-1 ${qb.expired ? 'text-red-600' : 'text-green-700'}`}>
                {qb.expired ? 'Token expired' : 'Connected'}
              </p>
            ) : (
              <a href={`${BASE}/quickbooks/connect`} className="inline-block mt-1 text-sm font-semibold text-[#B060A0] hover:underline">Connect →</a>
            )}
            {qb?.lastSync && <p className="text-[10px] text-gray-400 mt-1">Last sync {new Date(qb.lastSync).toLocaleString()}</p>}
          </div>
        </div>

        {/* Failed syncs */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Failed QuickBooks syncs {failed.length > 0 && <span className="text-red-600">({failed.length})</span>}
          </h2>
          {failed.length === 0 ? (
            <p className="text-sm text-gray-400">No failed syncs. 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 text-xs uppercase">
                <tr><th className="py-2">Type</th><th>Error</th><th>Attempt</th><th>When</th><th></th></tr>
              </thead>
              <tbody>
                {failed.map(l => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="py-2 capitalize">{l.entity_type}</td>
                    <td className="text-red-600 max-w-xs truncate" title={l.error_message}>{l.error_message}</td>
                    <td>{l.attempt}</td>
                    <td className="text-gray-400">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="text-right">
                      <button onClick={() => retry(l.id)} disabled={retrying === l.id}
                        className="text-xs font-medium text-[#B060A0] hover:underline disabled:opacity-40">
                        {retrying === l.id ? 'Retrying…' : 'Retry'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Revenue by truck */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Profitability by truck</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 text-xs uppercase">
              <tr><th className="py-2">Truck</th><th>Journeys</th><th>Distance</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr>
            </thead>
            <tbody>
              {trucks.map(t => {
                const p = profit[t.id] || {};
                const prof = Number(p.profit || 0);
                return (
                  <tr key={t.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="py-2"><a href={`/portal/fleet/${t.id}`} className="text-[#B060A0] hover:underline">{t.registration}</a> <span className="text-gray-400">{t.name}</span></td>
                    <td>{p.total_journeys ?? 0}</td>
                    <td>{Number(p.total_distance_km || 0).toLocaleString()} km</td>
                    <td>{fmtKES(p.total_revenue)}</td>
                    <td>{fmtKES(p.total_cost)}</td>
                    <td className={prof < 0 ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>{fmtKES(prof)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
function Stat({ label, value, accent = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}
