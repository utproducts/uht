'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

export default function SetPasswordPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('uht_token');
    if (!token) {
      setLoggedIn(false);
      return;
    }
    setLoggedIn(true);
    // If the account already has a password, we require the current one to change it.
    // The API tells us via the set-password error flow, but we can preflight from /auth/me.
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(() => {})
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setStatus('saving');
    setError('');
    try {
      const token = localStorage.getItem('uht_token');
      const res = await fetch(`${API}/api/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          newPassword: password,
          ...(currentPassword ? { currentPassword } : {}),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStatus('saved');
      } else if (json.error === 'current_password_required') {
        setHasPassword(true);
        setError('Enter your current password to change it.');
        setStatus('idle');
      } else {
        setError(json.message || json.error || 'Failed to save password.');
        setStatus('idle');
      }
    } catch {
      setError('Unable to connect. Please try again.');
      setStatus('idle');
    }
  };

  if (loggedIn === false) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <img src="/uht-logo.png" alt="UHT" className="h-12 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-[#1d1d1f] mb-2">Sign in first</h1>
          <p className="text-sm text-[#6e6e73] mb-6">
            To set your password, sign in with an email link first — then come back here.
          </p>
          <a href="/login?redirect=/account/set-password"
            className="inline-block px-6 py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition">
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }

  if (status === 'saved') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl text-emerald-600">✓</div>
          <h1 className="text-xl font-bold text-[#1d1d1f] mb-2">Password saved!</h1>
          <p className="text-sm text-[#6e6e73] mb-6">
            From now on you can sign in with your email and password — on the website and in the UHT app.
          </p>
          <a href="/dashboard"
            className="inline-block px-6 py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition">
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6">
      <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <img src="/uht-logo.png" alt="UHT" className="h-12 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-[#1d1d1f] text-center mb-1">Set Your Password</h1>
        <p className="text-sm text-[#6e6e73] text-center mb-6">
          Use it to sign in on the website and the UHT app.
        </p>
        {hasPassword && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Current Password</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[#d2d2d7] focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/20 outline-none transition text-sm" />
          </div>
        )}
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">New Password</label>
          <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder="At least 8 characters" required minLength={8}
            className="w-full px-4 py-3 rounded-xl border border-[#d2d2d7] focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/20 outline-none transition text-sm" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Confirm New Password</label>
          <input type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }}
            placeholder="Re-enter your password" required
            className="w-full px-4 py-3 rounded-xl border border-[#d2d2d7] focus:border-[#003e79] focus:ring-2 focus:ring-[#003e79]/20 outline-none transition text-sm" />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}
        <button type="submit" disabled={status === 'saving'}
          className={`w-full py-3.5 rounded-xl bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold transition ${status === 'saving' ? 'opacity-60' : ''}`}>
          {status === 'saving' ? 'Saving...' : 'Save Password'}
        </button>
      </form>
    </div>
  );
}
