'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

const ROLES = [
  { id: 'admin', label: 'Admin', desc: 'Full system access' },
  { id: 'director', label: 'Director', desc: 'Event management' },
  { id: 'organization', label: 'Organization', desc: 'Teams & rosters' },
  { id: 'coach', label: 'Coach', desc: 'Team management' },
  { id: 'manager', label: 'Manager', desc: 'Team creation' },
  { id: 'parent', label: 'Parent / Player', desc: 'Stats & results' },
  { id: 'scorekeeper', label: 'Scorekeeper', desc: 'Live scoring' },
  { id: 'referee', label: 'Referee', desc: 'Game assignments' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  // Dev mode state
  const [devMode, setDevMode] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    const register = params.get('register');
    if (redirect) {
      const url = register ? `${redirect}?register=${register}` : redirect;
      setRedirectUrl(url);
    }
  }, []);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('sending');
    setErrorMsg('');

    try {
      const resp = await fetch(`${API}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await resp.json();

      if (data.success) {
        setStatus('sent');
      } else if (data.error === 'no_account') {
        setStatus('error');
        setErrorMsg(data.message || "We don't have an account with that email. Make sure you're using the same email you registered with.");
      } else if (data.error === 'inactive') {
        setStatus('error');
        setErrorMsg(data.message || 'This account has been deactivated. Please contact us for help.');
      } else {
        setStatus('error');
        setErrorMsg(data.message || data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Unable to connect. Please try again.');
    }
  };

  // Dev mode login (same as before)
  const handleDevLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const role = selected || 'admin';
    localStorage.setItem('uht_role', role);
    localStorage.setItem('uht_token', 'mock-token-' + role);
    localStorage.setItem('uht_user', JSON.stringify({
      id: 'user-1',
      email: email || 'admin@uht.com',
      name: email ? email.split('@')[0] : 'Admin',
      roles: [role],
    }));

    if (redirectUrl) {
      router.push(redirectUrl);
    } else if (role === 'director') {
      router.push('/director');
    } else if (role === 'admin') {
      router.push('/admin/events');
    } else {
      router.push('/dashboard/' + role);
    }
  };

  // "Check your email" confirmation screen
  if (status === 'sent') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
        <nav className="bg-navy-700 px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
            <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
          </a>
        </nav>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="bg-white rounded-2xl shadow-soft p-12">
              <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold text-[#1d1d1f]">Check your email</h1>
              <p className="mt-3 text-[#6e6e73] leading-relaxed">
                We sent a login link to <span className="font-medium text-[#1d1d1f]">{email}</span>. Click the link in the email to sign in.
              </p>
              <p className="mt-4 text-sm text-[#aeaeb2]">
                The link expires in 15 minutes. Check your spam folder if you don&apos;t see it.
              </p>
              <button
                onClick={() => { setStatus('idle'); setEmail(''); }}
                className="mt-6 text-brand-500 font-medium text-sm hover:underline"
              >
                Use a different email
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
      <nav className="bg-navy-700 px-6 py-4">
        <a href="/" className="flex items-center gap-3">
          <img src="/uht-logo.png" alt="UHT" className="h-8 w-auto" />
          <span className="text-white font-semibold text-lg">Ultimate Tournaments</span>
        </a>
      </nav>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-[#1d1d1f]">Sign in</h1>
            <p className="mt-2 text-[#6e6e73]">
              {devMode ? 'Dev mode — pick a role' : 'Enter your email to receive a login link'}
            </p>
          </div>

          {!devMode ? (
            <form onSubmit={handleMagicLink} className="bg-white rounded-2xl shadow-soft p-8">
              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                />
              </div>

              {status === 'error' && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <p>{errorMsg}</p>
                  {errorMsg.includes("don't have an account") && (
                    <a href="/signup" className="mt-2 inline-flex items-center gap-1.5 font-semibold text-[#003e79] hover:underline">
                      Create an account
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </a>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'sending'}
                className="mt-6 w-full btn-primary py-3 text-base font-medium disabled:opacity-50"
              >
                {status === 'sending' ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Sending...
                  </span>
                ) : (
                  'Send Login Link'
                )}
              </button>

              <p className="mt-4 text-center text-sm text-[#6e6e73]">
                No password needed — we&apos;ll email you a secure link to sign in instantly.
              </p>

              <div className="mt-5 pt-5 border-t border-gray-100 text-center">
                <p className="text-sm text-[#6e6e73]">
                  Don&apos;t have an account?{' '}
                  <a href="/signup" className="text-[#003e79] font-medium hover:underline">Create one</a>
                </p>
              </div>
            </form>
          ) : (
            <form onSubmit={handleDevLogin} className="bg-white rounded-2xl shadow-soft p-8">
              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                />
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-[#1d1d1f] mb-2">Sign in as</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((role) => (
                    <button
                      type="button"
                      key={role.id}
                      onClick={() => setSelected(role.id)}
                      className={
                        "flex flex-col px-3 py-2.5 rounded-xl border text-left text-sm transition-all " +
                        (selected === role.id
                          ? "border-brand-400 bg-brand-50 text-brand-600"
                          : "border-gray-200 hover:border-gray-300 text-[#1d1d1f]")
                      }
                    >
                      <span className="font-medium">{role.label}</span>
                      <span className="text-xs text-[#6e6e73]">{role.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className="mt-6 w-full btn-primary py-3 text-base font-medium">
                Sign In (Dev)
              </button>
            </form>
          )}

          <div className="mt-4 text-center">
            <button
              onClick={() => setDevMode(!devMode)}
              className="text-xs text-[#aeaeb2] hover:text-[#6e6e73] transition-colors"
            >
              {devMode ? '← Back to magic link login' : 'Dev mode →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
