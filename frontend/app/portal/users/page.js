'use client';
import { useEffect, useState } from 'react';
import Sidebar from '@/components/admin/Sidebar';
import { get, post, patch } from '@/lib/api';

const ROLE_COLORS = {
  super_admin:   'bg-purple-100 text-purple-800',
  fleet_manager: 'bg-blue-100 text-blue-800',
  finance:       'bg-amber-100 text-amber-800',
  planner:       'bg-teal-100 text-teal-800',
  driver:        'bg-gray-100 text-gray-700',
};

const ROLES = ['super_admin','fleet_manager','finance','planner','driver'];

export default function UsersPage() {
  const [users,    setUsers]   = useState([]);
  const [loading,  setLoad]    = useState(true);
  const [showForm, setShow]    = useState(false);
  const [saving,   setSaving]  = useState(false);
  const [form,     setForm]    = useState({ fullName:'', email:'', role:'driver', password:'' });
  const [error,    setError]   = useState('');

  useEffect(() => {
    get('/users').then(setUsers).catch(console.error).finally(() => setLoad(false));
  }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const user = await post('/users', form);
      setUsers(prev => [user, ...prev]);
      setShow(false);
      setForm({ fullName:'', email:'', role:'driver', password:'' });
    } catch(err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (user) => {
    try {
      const updated = await patch(`/users/${user.id}`, { isActive: !user.is_active });
      setUsers(prev => prev.map(u => u.id === user.id ? {...u, is_active: updated.is_active} : u));
    } catch(err) { alert(err.message); }
  };

  const changeRole = async (userId, role) => {
    try {
      const updated = await patch(`/users/${userId}`, { role });
      setUsers(prev => prev.map(u => u.id === userId ? {...u, role: updated.role} : u));
    } catch(err) { alert(err.message); }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">

        <div className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-base font-semibold text-gray-900">Users & Roles</h1>
          <button onClick={() => setShow(true)}
            className="bg-[#B060A0] hover:bg-[#C176B4] text-white text-xs font-medium px-4 py-2 rounded-md transition-colors">
            + Add User
          </button>
        </div>

        <div className="p-6">
          {/* Add user form */}
          {showForm && (
            <form onSubmit={createUser} className="bg-white rounded-xl border border-gray-100 p-5 mb-5 shadow-sm max-w-lg">
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-semibold text-gray-900">New Staff Account</p>
                <button type="button" onClick={() => setShow(false)} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Full Name *</label>
                  <input type="text" required value={form.fullName} onChange={e=>setForm(p=>({...p,fullName:e.target.value}))}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#B060A0]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Work Email *</label>
                  <input type="email" required value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                    placeholder="name@elevensolutions.co.ke"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#B060A0]" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Role *</label>
                  <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#B060A0]">
                    {ROLES.map(r => <option key={r} value={r}>{r.replace('_',' ')}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Temporary Password *</label>
                  <input type="password" required minLength={8} value={form.password}
                    onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                    placeholder="Min. 8 characters"
                    className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#B060A0]" />
                  <p className="text-[10px] text-gray-400 mt-1">The user will be prompted to change this on first login.</p>
                </div>
              </div>
              {error && <p className="text-red-600 text-xs mt-2 bg-red-50 rounded p-2">{error}</p>}
              <div className="flex gap-2 mt-4">
                <button type="submit" disabled={saving}
                  className="bg-[#B060A0] hover:bg-[#C176B4] disabled:opacity-50 text-white text-xs font-medium px-5 py-2 rounded-md">
                  {saving ? 'Creating…' : 'Create Account'}
                </button>
                <button type="button" onClick={() => setShow(false)}
                  className="border border-gray-200 text-gray-600 text-xs px-4 py-2 rounded-md hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Users table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Name','Email','Role','Status','Last Login','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading users…</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#B060A0]/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[#B060A0] text-[10px] font-bold">{u.full_name?.charAt(0)}</span>
                        </div>
                        <span className="font-medium text-gray-800">{u.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                        className="border-0 bg-transparent text-xs focus:outline-none cursor-pointer">
                        {ROLES.map(r => (
                          <option key={r} value={r}>{r.replace('_',' ')}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString('en-GB') : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(u)}
                        className={`text-[10px] px-2.5 py-1 rounded border transition-colors ${
                          u.is_active
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-green-200 text-green-600 hover:bg-green-50'
                        }`}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
