'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get } from '@/lib/api';

const fmtKES  = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    get('/clients')
      .then(setClients)
      .catch((e) => alert(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c =>
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">Clients — {clients.length}</h1>
        </div>

        <div className="p-6">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="mb-5 w-full max-w-sm text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40"
          />

          {loading ? (
            <div className="text-center py-16 text-gray-400">Loading clients…</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="p-3 font-medium">Company</th>
                    <th className="p-3 font-medium">Quotes</th>
                    <th className="p-3 font-medium">Journeys</th>
                    <th className="p-3 font-medium">Outstanding</th>
                    <th className="p-3 font-medium">Last activity</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="p-3">
                        <p className="font-medium text-gray-900">{c.company_name}</p>
                        <p className="text-xs text-gray-400">{c.email}</p>
                      </td>
                      <td className="p-3 text-gray-700">{c.quote_count ?? 0}</td>
                      <td className="p-3 text-gray-700">{c.journey_count ?? 0}</td>
                      <td className="p-3 text-gray-700">{fmtKES(c.outstanding_balance)}</td>
                      <td className="p-3 text-gray-500">{fmtDate(c.last_activity_at)}</td>
                      <td className="p-3 text-right">
                        <a href={`/portal/clients/${c.id}`} className="text-[#E8620A] hover:underline text-xs font-medium">View</a>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr><td colSpan="6" className="p-8 text-center text-gray-400">No clients found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
