'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<'password' | 'magic' | 'pin'>('password');
  const [password, setPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [noPassword, setNoPassword] = useState(false);
  const [forgotFlow, setForgotFlow] = useState(false);
  const [pin, setPin] = useState(['', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const pinRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

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
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          // Forgot-password: after the emailed link signs them in, land on the
          // set-password screen (skippable) instead of the dashboard
          redirect: forgotFlow
            ? `/account/set-password?welcome=1&next=${encodeURIComponent(redirectUrl || '/dashboard')}`
            : redirectUrl || undefined,
        }),
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

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setPwLoading(true);
    setPwError('');
    setNoPassword(false);
    try {
      const resp = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await resp.json();
      if (data.success && data.data) {
        localStorage.setItem('uht_token', data.data.token);
        localStorage.setItem('uht_user', JSON.stringify(data.data.user));
        localStorage.setItem('uht_role', data.data.user.roles?.[0] || 'parent');
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else {
          const role = data.data.user.roles?.[0] || 'parent';
          if (role === 'admin') window.location.href = '/admin/events';
          else if (role === 'director') window.location.href = '/director';
          else window.location.href = '/dashboard/' + role;
        }
      } else if (data.error === 'no_password') {
        setNoPassword(true);
        setPwError(data.message || 'Your account uses email sign-in. Use "Email me a sign-in link" to log in, then set a password.');
      } else {
        setPwError(data.message || data.error || 'Invalid email or password.');
      }
    } catch {
      setPwError('Unable to connect. Please try again.');
    } finally {
      setPwLoading(false);
    }
  };

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // digits only
    const newPin = [...pin];
    newPin[index] = value.slice(-1); // only last char
    setPin(newPin);
    setPinError('');

    // Auto-focus next input
    if (value && index < 3) {
      pinRefs[index + 1].current?.focus();
    }

    // Auto-submit when all 4 digits entered
    if (value && index === 3 && newPin.every(d => d)) {
      handlePinLogin(newPin.join(''));
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs[index - 1].current?.focus();
    }
  };

  const handlePinLogin = async (pinCode?: string) => {
    const code = pinCode || pin.join('');
    if (code.length !== 4 || !email) return;

    setPinLoading(true);
    setPinError('');

    try {
      const resp = await fetch(`${API}/api/auth/admin-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), pin: code }),
      });
      const data = await resp.json();

      if (data.success && data.data) {
        localStorage.setItem('uht_token', data.data.token);
        localStorage.setItem('uht_user', JSON.stringify(data.data.user));
        localStorage.setItem('uht_role', data.data.user.roles?.[0] || 'admin');

        if (redirectUrl) {
          router.push(redirectUrl);
        } else {
          const role = data.data.user.roles?.[0] || 'admin';
          if (role === 'admin') router.push('/admin/events');
          else if (role === 'director') router.push('/director');
          else router.push('/dashboard/' + role);
        }
      } else {
        setPinError(data.error || 'Invalid PIN');
        setPin(['', '', '', '']);
        pinRefs[0].current?.focus();
      }
    } catch {
      setPinError('Unable to connect. Please try again.');
    } finally {
      setPinLoading(false);
    }
  };

  // "Check your email" confirmation screen
  if (status === 'sent') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">

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

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold text-[#1d1d1f]">Sign in</h1>
            <p className="mt-2 text-[#6e6e73]">
              {loginMode === 'password' ? 'Enter your email and password' : loginMode === 'magic' ? 'Enter your email to receive a login link' : 'Enter your email and 4-digit PIN'}
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="flex bg-white rounded-xl border border-gray-200 p-1 mb-6">
            <button onClick={() => setLoginMode('password')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${loginMode === 'password' ? 'bg-[#003e79] text-white shadow-sm' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
              Password
            </button>
            <button onClick={() => { setForgotFlow(false); setLoginMode('magic'); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${loginMode === 'magic' ? 'bg-[#003e79] text-white shadow-sm' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
              Email Link
            </button>
            <button onClick={() => setLoginMode('pin')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${loginMode === 'pin' ? 'bg-[#003e79] text-white shadow-sm' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
              Admin PIN
            </button>
          </div>

          {loginMode === 'password' ? (
            <form onSubmit={handlePasswordLogin} className="bg-white rounded-2xl shadow-soft p-8">
              <label className="block text-sm font-medium text-[#1d1d1f] mb-2">Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setPwError(''); }}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#d2d2d7] focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/20 outline-none transition text-[#1d1d1f]"
              />
              <label className="block text-sm font-medium text-[#1d1d1f] mb-2 mt-4">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setPwError(''); }}
                placeholder="Your password"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#d2d2d7] focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/20 outline-none transition text-[#1d1d1f]"
              />
              {pwError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-700">{pwError}</p>
                  {noPassword && (
                    <button type="button" onClick={() => { setForgotFlow(false); setLoginMode('magic'); }}
                      className="mt-2 text-sm font-semibold text-[#003e79] hover:underline">
                      Email me a sign-in link →
                    </button>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={pwLoading}
                className={`mt-6 w-full py-3.5 rounded-xl bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold transition ${pwLoading ? 'opacity-60' : ''}`}
              >
                {pwLoading ? 'Signing in...' : 'Sign In'}
              </button>
              <div className="mt-4 flex items-center justify-between text-sm">
                <button type="button" onClick={() => { setForgotFlow(true); setLoginMode('magic'); }} className="text-[#003e79] font-medium hover:underline">
                  Forgot password?
                </button>
                <button type="button" onClick={() => { setForgotFlow(false); setLoginMode('magic'); }} className="text-[#6e6e73] hover:text-[#1d1d1f] hover:underline">
                  Email me a sign-in link
                </button>
              </div>
            </form>
          ) : loginMode === 'magic' ? (
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
                    <> <a href="/signup" className="mt-2 inline-flex items-center gap-1.5 font-semibold text-[#003e79] hover:underline">
                      Create an account
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </a></>
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
            </form>
          ) : (
            /* PIN Login */
            <div className="bg-white rounded-2xl shadow-soft p-8">
              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setPinError(''); }}
                  placeholder="admin@ultimatetournaments.com"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                />
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium text-[#1d1d1f] mb-3 text-center">Enter your 4-digit PIN</label>
                <div className="flex justify-center gap-3">
                  {pin.map((digit, i) => (
                    <input
                      key={i}
                      ref={pinRefs[i]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(i, e)}
                      className="w-14 h-16 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/20 outline-none transition"
                    />
                  ))}
                </div>
              </div>

              {pinError && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
                  {pinError}
                </div>
              )}

              <button
                onClick={() => handlePinLogin()}
                disabled={pin.some(d => !d) || !email || pinLoading}
                className="mt-6 w-full btn-primary py-3 text-base font-medium disabled:opacity-50"
              >
                {pinLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Signing in...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>

              <p className="mt-4 text-center text-xs text-[#aeaeb2]">
                PIN login is for admin and director accounts only.
                <br />Don&apos;t have a PIN? Use the Email Link tab and set one in Settings.
              </p>
            </div>
          )}

          <div className="mt-5 text-center">
            <p className="text-sm text-[#6e6e73]">
              Don&apos;t have an account?{' '}
              <a href="/signup" className="text-[#003e79] font-medium hover:underline">Create one</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
