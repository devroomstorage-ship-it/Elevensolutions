'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { post } from '@/lib/api';

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [checking, setChecking] = useState(true);
  const [invite, setInvite]     = useState(null); // { companyName, email }
  const [checkError, setCheckError] = useState('');

  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);

  useEffect(() => {
    if (!token) { setCheckError('Missing invite link.'); setChecking(false); return; }
    post('/client-auth/invite/verify', { token })
      .then(setInvite)
      .catch((e) => setCheckError(e.message || 'Invalid or expired invite'))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setSubmitting(true);
    try {
      await post('/client-auth/accept', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not set password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBFAFC] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-[#3A2150] rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg width="26" height="18" viewBox="0 0 26 18" fill="none">
              <rect x="0" y="4" width="16" height="10" rx="2" fill="white"/>
              <rect x="16" y="8" width="7" height="7" rx="1.5" fill="rgba(255,255,255,0.7)"/>
              <circle cx="5" cy="16" r="3" fill="#3A2150"/><circle cx="5" cy="16" r="1.5" fill="white"/>
              <circle cx="19" cy="16" r="3" fill="#3A2150"/><circle cx="19" cy="16" r="1.5" fill="white"/>
            </svg>
          </div>
          <h1 className="text-[#3A2150] font-semibold text-base">Eleven Solutions Limited</h1>
          <p className="text-gray-500 text-xs mt-1">Client Portal — Set your password</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-7">
          {checking ? (
            <p className="text-sm text-gray-400 text-center">Checking your invite…</p>
          ) : checkError ? (
            <div className="text-center">
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{checkError}</p>
              <p className="text-xs text-gray-400 mt-3">Ask your Eleven Solutions contact to resend the invite.</p>
            </div>
          ) : done ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-700">
                Password set for <strong>{invite.companyName}</strong>. You can now log in.
              </p>
              <a href="/account/login"
                className="inline-block w-full bg-[#3A2150] hover:bg-[#503070] text-white font-medium py-2.5 rounded-lg text-sm">
                Go to login
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-gray-600">
                Setting up portal access for <strong>{invite.companyName}</strong> ({invite.email})
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
                <input type="password" placeholder="At least 8 characters" autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B060A0]" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirm password</label>
                <input type="password" placeholder="Re-enter password" autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B060A0]" />
              </div>

              {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded p-2">{error}</p>}

              <button type="submit" disabled={submitting}
                className="w-full bg-[#3A2150] hover:bg-[#503070] disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
                {submitting ? 'Setting password…' : 'Set password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  );
}
