'use client';
import { useEffect, useState } from 'react';
import ClientShell from '@/components/account/ClientShell';
import { get, patch } from '@/lib/api';

export default function AccountProfilePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState({ kind: '', text: '' });

  useEffect(() => {
    get('/client-portal/profile')
      .then((p) => {
        setProfile(p);
        setForm({
          companyName: p.company_name || '',
          contactName: p.contact_name || '',
          phone: p.phone || '',
          address: p.address || '',
        });
      })
      .catch((e) => setMsg({ kind: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    setMsg({ kind: '', text: '' });
    try {
      const updated = await patch('/client-portal/profile', form);
      setProfile(updated);
      setMsg({ kind: 'success', text: 'Profile updated.' });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ClientShell><div className="p-8 text-gray-400 text-sm">Loading…</div></ClientShell>;
  if (!profile) return <ClientShell><div className="p-8 text-gray-400 text-sm">Could not load profile.</div></ClientShell>;

  return (
    <ClientShell>
      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10">
        <h1 className="text-base font-semibold text-gray-900">Company Profile</h1>
      </div>

      <div className="p-6 max-w-lg">
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <Field label="Company name" value={form.companyName} onChange={set('companyName')} />
          <Field label="Contact name" value={form.contactName} onChange={set('contactName')} />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input value={profile.email} disabled
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 bg-gray-50 text-gray-500" />
            <p className="text-[11px] text-gray-400 mt-1">Contact Eleven Solutions to change your account email.</p>
          </div>
          <Field label="Phone" value={form.phone} onChange={set('phone')} />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
            <textarea value={form.address} onChange={set('address')} rows={2}
              className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-none" />
          </div>

          {msg.text && (
            <div className={`rounded-md px-3 py-2 text-sm ${
              msg.kind === 'success'
                ? 'bg-green-50 border border-green-100 text-green-800'
                : 'bg-red-50 border border-red-100 text-red-800'}`}>
              {msg.text}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button onClick={save} disabled={saving}
              className="bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input value={value} onChange={onChange}
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#E8620A]/40" />
    </div>
  );
}
