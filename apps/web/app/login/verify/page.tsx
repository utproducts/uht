'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('No login token provided.');
      return;
    }

    async function verify() {
      try {
        const resp = await fetch(`${API}/api/auth/magic-link/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await resp.json();

        if (data.success && data.data) {
          localStorage.setItem('uht_token', data.data.token);
          localStorage.setItem('uht_user', JSON.stringify(data.data.user));
          localStorage.setItem('uht_role', data.data.user.roles?.[0] || 'parent');

          setStatus('success');

          const role = data.data.user.roles?.[0] || 'parent';
          setTimeout(() => {
            if (role === 'admin') router.push('/admin/events');
            else if (role === 'director') router.push('/director');
            else router.push('/dashboard/' + role);
          }, 1500);
        } else {
          setStatus('error');
          setError(data.error || 'Verification failed. Please request a new login link.');
        }
      } catch {
        setStatus('error');
        setError('Something went wrong. Please try again.');
      }
    }

    verify();
  }, [token, router]);

  return (
    <div className="w-full max-w-md text-center">
      {status === 'verifying' && (
        <div className="bg-white rounded-2xl shadow-soft p-12">
          <div className="animate-spin h-10 w-10 border-4 border-brand-400 border-t-transparent rounded-full mx-auto mb-6" />
          <h1 className="text-2xl font-semibold text-[#1d1d1f]">Verifying your login...</h1>
          <p className="mt-2 text-[#6e6e73]">Just a moment</p>
        </div>
      )}

      {status === 'success' && (
        <div className="bg-white rounded-2xl shadow-soft p-12">
          <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-[#1d1d1f]">You&apos;re signed in!</h1>
          <p className="mt-2 text-[#6e6e73]">Redirecting to your dashboard...</p>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-white rounded-2xl shadow-soft p-12">
          <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-[#1d1d1f]">Login Failed</h1>
          <p className="mt-2 text-[#6e6e73]">{error}</p>
          <a href="/login" className="mt-6 inline-block btn-primary px-8 py-3 text-base font-medium">
            Back to Login
          </a>
        </div>
      )}
    </div>
  );
}

export default function VerifyMagicLinkPage() {
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      <nav className="bg-navy-700 px-6 py-4">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
        </a>
      </nav>

      <div className="flex-1 flex items-center justify-center p-6">
        <Suspense fallback={
          <div className="w-full max-w-md text-center">
            <div className="bg-white rounded-2xl shadow-soft p-12">
              <div className="animate-spin h-10 w-10 border-4 border-brand-400 border-t-transparent rounded-full mx-auto mb-6" />
              <h1 className="text-2xl font-semibold text-[#1d1d1f]">Loading...</h1>
            </div>
          </div>
        }>
          <VerifyContent />
        </Suspense>
      </div>
    </div>
  );
}
