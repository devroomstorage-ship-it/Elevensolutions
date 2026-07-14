'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import ClientShell from '@/components/account/ClientShell';
import { get } from '@/lib/api';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_COLOR = {
  scheduled:  'bg-gray-100 text-gray-700',
  loading:    'bg-amber-100 text-amber-800',
  in_transit: 'bg-blue-100 text-blue-800',
  delivered:  'bg-green-100 text-green-800',
  cancelled:  'bg-red-100 text-red-800',
};

export default function AccountJourneyDetailPage() {
  const { id } = useParams();
  const [journey, setJourney] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    get(`/client-portal/journeys/${id}`).then(setJourney).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ClientShell><div className="p-8 text-gray-400 text-sm">Loading…</div></ClientShell>;
  if (!journey) return <ClientShell><div className="p-8 text-gray-400 text-sm">Journey not found.</div></ClientShell>;

  return (
    <ClientShell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <a href="/account/journeys" className="text-xs text-gray-400 hover:text-gray-600">← Journeys</a>
        <div className="flex items-end justify-between mt-1">
          <h1 className="text-lg font-semibold text-gray-900">{journey.reference}</h1>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full uppercase tracking-wide ${STATUS_COLOR[journey.status] || 'bg-gray-100 text-gray-700'}`}>
            {journey.status?.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Row k="Route"       v={`${journey.origin} → ${journey.destination}`} />
            <Row k="Cargo"       v={journey.cargo_type || '—'} />
            <Row k="Weight"      v={journey.cargo_weight_tons ? `${journey.cargo_weight_tons} tonnes` : '—'} />
            <Row k="Scheduled"   v={fmtDate(journey.scheduled_date)} />
            <Row k="Departure"   v={fmtDateTime(journey.departure_time)} />
            <Row k="Arrival"     v={fmtDateTime(journey.arrival_time)} />
            <Row k="Distance"    v={journey.distance_km ? `${journey.distance_km} km` : '—'} />
            <Row k="Truck"       v={journey.truck || '—'} />
            <Row k="Driver"      v={journey.driver || '—'} />
          </div>
          {journey.notes && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{journey.notes}</p>
            </div>
          )}
        </div>
      </div>
    </ClientShell>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between border-b border-gray-50 py-1.5 last:border-0">
      <span className="text-gray-500">{k}</span>
      <span className="text-gray-800 text-right">{v}</span>
    </div>
  );
}
