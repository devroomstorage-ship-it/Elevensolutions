'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, patch, post, del } from '@/lib/api';

export default function ContentPage() {
  const [tab, setTab] = useState('settings');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => get('/content/admin/all').then(setData).catch((e) => alert(e.message)).finally(() => setLoading(false));
  useEffect(load, []);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex justify-between items-center">
          <h1 className="text-base font-semibold text-gray-900">Website content</h1>
          <a href="/" target="_blank" rel="noreferrer" className="text-xs text-[#E8620A] hover:underline">View live site ↗</a>
        </div>

        <div className="px-6 pt-4">
          <div className="flex gap-1 border-b border-gray-100">
            {['settings', 'services', 'sections'].map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors ${
                  tab === t ? 'border-[#E8620A] text-gray-900 font-medium' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {loading ? <p className="text-gray-400">Loading…</p> : (
            <>
              {tab === 'settings'  && <SettingsEditor settings={data.settings} onSaved={load} />}
              {tab === 'services'  && <ServicesEditor services={data.services} onSaved={load} />}
              {tab === 'sections'  && <SectionsEditor sections={data.sections} onSaved={load} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Settings: grouped key/value ──────────────────────────────────────────────
function SettingsEditor({ settings, onSaved }) {
  const [vals, setVals] = useState(() => Object.fromEntries(settings.map((s) => [s.key, s.value || ''])));
  const [saving, setSaving] = useState(false);

  const groups = settings.reduce((acc, s) => { (acc[s.group_name] = acc[s.group_name] || []).push(s); return acc; }, {});

  const save = async () => {
    setSaving(true);
    try {
      await patch('/content/admin/settings', { settings: Object.entries(vals).map(([key, value]) => ({ key, value })) });
      onSaved();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-900 capitalize mb-4">{group}</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((s) => (
              <div key={s.key} className={s.value_type === 'longtext' ? 'sm:col-span-2' : ''}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{s.label || s.key}</label>
                {s.value_type === 'longtext' ? (
                  <textarea value={vals[s.key]} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })}
                    rows={3} className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-none" />
                ) : (
                  <input value={vals[s.key]} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })}
                    className="w-full text-sm border border-gray-200 rounded-md px-3 py-2" />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button onClick={save} disabled={saving}
        className="bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-md">
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}

// ── Services: editable cards ─────────────────────────────────────────────────
function ServicesEditor({ services, onSaved }) {
  return (
    <div className="max-w-3xl space-y-4">
      {services.map((s) => <ServiceCard key={s.id} svc={s} onSaved={onSaved} />)}
    </div>
  );
}
function ServiceCard({ svc, onSaved }) {
  const [form, setForm] = useState({
    title: svc.title || '', tagline: svc.tagline || '', description: svc.description || '',
    features: Array.isArray(svc.features) ? svc.features.join('\n') : '',
    isPublished: svc.is_published,
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      await patch(`/content/admin/service/${svc.id}`, {
        title: form.title, tagline: form.tagline, description: form.description,
        features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
        isPublished: form.isPublished,
      });
      onSaved();
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex justify-between items-center mb-3">
        <span className="font-mono text-xs text-gray-400">{svc.slug}</span>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} />
          Published
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={form.title} onChange={set('title')} placeholder="Title"
          className="text-sm border border-gray-200 rounded-md px-3 py-2 font-medium" />
        <input value={form.tagline} onChange={set('tagline')} placeholder="Tagline"
          className="text-sm border border-gray-200 rounded-md px-3 py-2" />
      </div>
      <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Description"
        className="mt-3 w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-none" />
      <textarea value={form.features} onChange={set('features')} rows={4} placeholder="One feature per line"
        className="mt-3 w-full text-sm border border-gray-200 rounded-md px-3 py-2 resize-none font-mono text-xs" />
      <button onClick={save} disabled={saving}
        className="mt-3 bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md">
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

// ── Sections: heading/subheading/body + JSON data ────────────────────────────
function SectionsEditor({ sections, onSaved }) {
  return (
    <div className="max-w-3xl space-y-4">
      {sections.map((s) => <SectionCard key={s.id} sec={s} onSaved={onSaved} />)}
    </div>
  );
}
function SectionCard({ sec, onSaved }) {
  const [form, setForm] = useState({ heading: sec.heading || '', subheading: sec.subheading || '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try { await patch(`/content/admin/section/${sec.id}`, form); onSaved(); }
    catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <p className="font-mono text-xs text-gray-400 mb-3">{sec.page} / {sec.section_key}</p>
      <input value={form.heading} onChange={set('heading')} placeholder="Heading"
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 font-medium mb-2" />
      <input value={form.subheading} onChange={set('subheading')} placeholder="Subheading"
        className="w-full text-sm border border-gray-200 rounded-md px-3 py-2" />
      <button onClick={save} disabled={saving}
        className="mt-3 bg-[#E8620A] hover:bg-[#F7813B] disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-md">
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
