'use client';
import { useEffect, useState } from 'react';
import ClientShell from '@/components/account/ClientShell';
import { get } from '@/lib/api';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOR = {
  scheduled:  'bg-gray-100 text-gray-700',
  loading:    'bg-amber-100 text-amber-800',
  in_transit: 'bg-blue-100 text-blue-800',
  delivered:  'bg-green-100 text-green-800',
  cancelled:  'bg-red-100 text-red-800',
};

export default function AccountJourneysPage() {
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    get('/client-portal/journeys').then(setJourneys).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <ClientShell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-base font-semibold text-gray-900">Journeys — {journeys.length}</h1>
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
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {journeys.map(j => (
                  <tr key={j.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-900">{j.reference}</td>
                    <td className="p-3 text-gray-700">{j.origin} → {j.destination}</td>
                    <td className="p-3 text-gray-500">{fmtDate(j.scheduled_date)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${STATUS_COLOR[j.status] || 'bg-gray-100 text-gray-600'}`}>
                        {j.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <a href={`/account/journeys/${j.id}`} className="text-[#E8620A] hover:underline text-xs font-medium">View</a>
                    </td>
                  </tr>
                ))}
                {!journeys.length && (
                  <tr><td colSpan="5" className="p-8 text-center text-gray-400">No journeys yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ClientShell>
  );
}
