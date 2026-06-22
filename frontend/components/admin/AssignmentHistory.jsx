'use client';
import { useEffect, useState } from 'react';
import { get } from '@/lib/api';

const fmtDateTime = (value) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
};

export default function AssignmentHistory({ driverId, truckId, perspective = 'driver' }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (driverId) params.set('driverId', driverId);
    if (truckId) params.set('truckId', truckId);

    setLoading(true);
    setError('');
    get(`/assignments/history${params.toString() ? `?${params.toString()}` : ''}`)
      .then(setRows)
      .catch((e) => setError(e.message || 'Could not load assignment history'))
      .finally(() => setLoading(false));
  }, [driverId, truckId]);

  if (loading) return <p className="text-sm text-gray-400">Loading assignment history…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!rows.length) return <p className="text-sm text-gray-400">No assignment history yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500 text-xs uppercase">
          <tr>
            {perspective !== 'driver' && <th className="py-2">Driver</th>}
            {perspective !== 'truck' && <th className="py-2">Truck</th>}
            <th className="py-2">Assigned</th>
            <th className="py-2">Unassigned</th>
            <th className="py-2">Assigned by</th>
            <th className="py-2">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-100 align-top">
              {perspective !== 'driver' && <td className="py-2 text-gray-900">{row.driver_name || '—'}</td>}
              {perspective !== 'truck' && (
                <td className="py-2 text-gray-900">
                  <span className="font-medium">{row.registration || '—'}</span>
                  {row.truck_name ? <span className="text-gray-400"> — {row.truck_name}</span> : null}
                </td>
              )}
              <td className="py-2 text-gray-600">{fmtDateTime(row.assigned_at)}</td>
              <td className="py-2 text-gray-600">{fmtDateTime(row.unassigned_at)}</td>
              <td className="py-2 text-gray-600">{row.assigned_by_name || '—'}</td>
              <td className="py-2 text-gray-500 whitespace-pre-wrap">{row.notes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
