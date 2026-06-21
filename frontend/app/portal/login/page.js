'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth';

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stage, setStage]     = useState('credentials'); // credentials | 2fa
  const [error, setError]     = useState('');
  const [submitting, setSub]  = useState(false);
  const [credentials, setCreds] = useState(null);

  const { register, handleSubmit, formState: { errors } } = useForm();
  const { register: r2, handleSubmit: h2 } = useForm();

  useEffect(() => {
    if (!loading && user) router.replace('/portal/dashboard');
  }, [user, loading, router]);

  const onCredentials = async (data) => {
    setError('');
    setSub(true);
    try {
      const result = await login(data.email, data.password);
      if (result?.requires2fa) {
        setCreds(data);
        setStage('2fa');
      } else if (result?.success) {
        const redirect = searchParams.get('redirect') || '/portal/dashboard';
        router.replace(redirect);
      }
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setSub(false);
    }
  };

  const on2FA = async (data) => {
    setError('');
    setSub(true);
    try {
      const result = await login(credentials.email, credentials.password, data.code);
      if (result?.success) router.replace('/portal/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid 2FA code');
    } finally {
      setSub(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#0F1E2E] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#E8620A] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f4f6f9] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-[#0F1E2E] rounded-xl flex items-center justify-center mx-auto mb-3">
            <svg width="26" height="18" viewBox="0 0 26 18" fill="none">
              <rect x="0" y="4" width="16" height="10" rx="2" fill="white"/>
              <rect x="16" y="8" width="7" height="7" rx="1.5" fill="rgba(255,255,255,0.7)"/>
              <circle cx="5" cy="16" r="3" fill="#0F1E2E"/><circle cx="5" cy="16" r="1.5" fill="white"/>
              <circle cx="19" cy="16" r="3" fill="#0F1E2E"/><circle cx="19" cy="16" r="1.5" fill="white"/>
            </svg>
          </div>
          <h1 className="text-[#0F1E2E] font-semibold text-base">Eleven Solutions Limited</h1>
          <p className="text-gray-500 text-xs mt-1">Staff Portal — Authorised Access Only</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-7">

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 flex gap-2">
            <span className="text-amber-600 text-sm flex-shrink-0">⚠️</span>
            <p className="text-amber-700 text-xs leading-relaxed">
              This portal is for authorised Eleven Solutions staff only. Unauthorised access attempts are logged.
            </p>
          </div>

          {stage === 'credentials' ? (
            <form onSubmit={handleSubmit(onCredentials)} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Work Email</label>
                <input type="email" placeholder="you@elevensolutions.co.ke" autoComplete="email"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8620A] ${errors.email ? 'border-red-400' : 'border-gray-200'}`}
                  {...register('email', { required: true })} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-medium text-gray-600">Password</label>
                  <a href="#" className="text-xs text-[#E8620A] hover:underline">Forgot password?</a>
                </div>
                <input type="password" placeholder="••••••••" autoComplete="current-password"
                  className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8620A] ${errors.password ? 'border-red-400' : 'border-gray-200'}`}
                  {...register('password', { required: true })} />
              </div>

              {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded p-2">{error}</p>}

              <button type="submit" disabled={submitting}
                className="w-full bg-[#0F1E2E] hover:bg-[#162840] disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
                {submitting ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={h2(on2FA)} className="space-y-4">
              <p className="text-sm text-gray-600 text-center mb-2">
                Enter the 6-digit code from your authenticator app.
              </p>
              <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" autoFocus
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-[#E8620A]"
                {...r2('code', { required: true, minLength: 6, maxLength: 6 })} />
              {error && <p className="text-red-600 text-xs text-center">{error}</p>}
              <button type="submit" disabled={submitting}
                className="w-full bg-[#0F1E2E] hover:bg-[#162840] disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm">
                {submitting ? 'Verifying…' : 'Verify'}
              </button>
              <button type="button" onClick={() => setStage('credentials')}
                className="w-full text-xs text-gray-400 hover:text-gray-600">
                ← Back to login
              </button>
            </form>
          )}
        </div>

        {/* Security badges */}
        <div className="flex justify-center gap-5 mt-4">
          {['SSL Encrypted', '2FA Supported', 'Session Timeout'].map(b => (
            <div key={b} className="flex items-center gap-1 text-xs text-gray-400">
              <span className="text-green-500">✓</span> {b}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// useSearchParams() must be inside a Suspense boundary for the production build.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
