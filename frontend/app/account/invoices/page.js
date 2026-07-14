'use client';
import { useEffect, useState } from 'react';
import ClientShell from '@/components/account/ClientShell';
import { get } from '@/lib/api';

const fmtKES  = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOR = {
  draft:     'bg-gray-100 text-gray-700',
  sent:      'bg-blue-100 text-blue-800',
  paid:      'bg-green-100 text-green-800',
  overdue:   'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700',
};

export default function AccountInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    get('/client-portal/invoices').then(setInvoices).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <ClientShell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-base font-semibold text-gray-900">Invoices — {invoices.length}</h1>
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
                  <th className="p-3 font-medium">Amount</th>
                  <th className="p-3 font-medium">Due</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-900">{inv.reference}</td>
                    <td className="p-3 text-gray-700">{fmtKES(inv.total_amount || inv.amount)}</td>
                    <td className="p-3 text-gray-500">{fmtDate(inv.due_date)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${STATUS_COLOR[inv.status] || 'bg-gray-100 text-gray-600'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <a href={`/account/invoices/${inv.id}`} className="text-[#E8620A] hover:underline text-xs font-medium">View</a>
                    </td>
                  </tr>
                ))}
                {!invoices.length && (
                  <tr><td colSpan="5" className="p-8 text-center text-gray-400">No invoices yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ClientShell>
  );
}
