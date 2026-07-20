'use client';
import { useEffect, useState } from 'react';
import ClientShell from '@/components/account/ClientShell';
import { get } from '@/lib/api';

const fmtKES  = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOR = {
  pending:  'bg-amber-100 text-amber-800',
  sent:     'bg-blue-100 text-blue-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  expired:  'bg-gray-100 text-gray-700',
};

export default function AccountQuotesPage() {
  const [quotes, setQuotes]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/client-portal/quotes').then(setQuotes).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <ClientShell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-base font-semibold text-gray-900">Quotes — {quotes.length}</h1>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="p-3 font-medium">Reference</th>
                  <th className="p-3 font-medium">Route</th>
                  <th className="p-3 font-medium">Amount</th>
                  <th className="p-3 font-medium">Valid until</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {quotes.map(q => (
                  <tr key={q.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-900">{q.reference}</td>
                    <td className="p-3 text-gray-700">{q.origin} → {q.destination}</td>
                    <td className="p-3 text-gray-700">{fmtKES(q.amount)}</td>
                    <td className="p-3 text-gray-500">{fmtDate(q.valid_until)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${STATUS_COLOR[q.status] || 'bg-gray-100 text-gray-600'}`}>
                        {q.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <a href={`/account/quotes/${q.id}`} className="text-[#B060A0] hover:underline text-xs font-medium">View</a>
                    </td>
                  </tr>
                ))}
                {!quotes.length && (
                  <tr><td colSpan="6" className="p-8 text-center text-gray-400">No quotes yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ClientShell>
  );
}
