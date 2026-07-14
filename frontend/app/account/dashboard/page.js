'use client';
import { useEffect, useState } from 'react';
import ClientShell from '@/components/account/ClientShell';
import { get } from '@/lib/api';

const fmtKES = (n) => 'KES ' + Number(n || 0).toLocaleString();

export default function AccountDashboardPage() {
  const [quotes, setQuotes]     = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      get('/client-portal/quotes'),
      get('/client-portal/invoices'),
      get('/client-portal/journeys'),
    ])
      .then(([q, i, j]) => { setQuotes(q); setInvoices(i); setJourneys(j); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const outstanding = invoices
    .filter(i => ['sent', 'overdue'].includes(i.status))
    .reduce((sum, i) => sum + Number(i.total_amount || i.amount || 0), 0);

  const activeJourneys = journeys.filter(j => !['delivered', 'cancelled'].includes(j.status)).length;
  const pendingQuotes  = quotes.filter(q => ['pending', 'sent'].includes(q.status)).length;

  return (
    <ClientShell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-base font-semibold text-gray-900">Dashboard</h1>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <Tile label="Pending quotes" value={pendingQuotes} href="/account/quotes" />
            <Tile label="Active journeys" value={activeJourneys} href="/account/journeys" />
            <Tile label="Outstanding balance" value={fmtKES(outstanding)} href="/account/invoices" />
          </div>
        )}
      </div>
    </ClientShell>
  );
}

function Tile({ label, value, href }) {
  return (
    <a href={href} className="block bg-white rounded-xl border border-gray-100 p-5 hover:border-[#E8620A]/40 transition-colors">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </a>
  );
}
