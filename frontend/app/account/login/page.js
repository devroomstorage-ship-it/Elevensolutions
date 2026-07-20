'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/lib/auth';

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError]       = useState('');
  const [submitting, setSub]    = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm();

  useEffect(() => {
    // Staff and clients share the same session cookies, so a staff member
    // who still has a valid staff session could land here — only bounce
    // straight to the dashboard for an actual client session.
    if (!loading && user?.role === 'client') router.replace('/account/dashboard');
  }, [user, loading, router]);

  const onSubmit = async (data) => {
    setError('');
    setSub(true);
    try {
      const result = await login(data.email, data.password);
      if (result?.success) {
        const redirect = searchParams.get('redirect') || '/account/dashboard';
        router.replace(redirect);
      }
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setSub(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#3A2150] flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#B060A0] border-t-transparent rounded-full animate-spin" />
    </div>
  );

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
          <p className="text-gray-500 text-xs mt-1">Client Portal</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-7">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" placeholder="you@yourcompany.com" autoComplete="email"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B060A0] ${errors.email ? 'border-red-400' : 'border-gray-200'}`}
                {...register('email', { required: true })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input type="password" placeholder="••••••••" autoComplete="current-password"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B060A0] ${errors.password ? 'border-red-400' : 'border-gray-200'}`}
                {...register('password', { required: true })} />
            </div>

            {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded p-2">{error}</p>}

            <button type="submit" disabled={submitting}
              className="w-full bg-[#3A2150] hover:bg-[#503070] disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          New to the portal? Ask your Eleven Solutions contact to send you an invite.
        </p>
      </div>
    </div>
  );
}

// useSearchParams() must be inside a Suspense boundary for the production build.
export default function AccountLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
