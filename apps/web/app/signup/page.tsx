'use client';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

const ROLES = [
  { id: 'organization', label: 'Organization Owner', desc: 'I own or run a hockey organization with multiple teams', icon: '🏢' },
  { id: 'coach', label: 'Coach', desc: 'I coach a team and need to manage rosters and register for events', icon: '🏒' },
  { id: 'manager', label: 'Team Manager', desc: 'I manage a team, handle registrations, and coordinate logistics', icon: '📋' },
  { id: 'referee', label: 'Referee', desc: 'I officiate games and need to see my assignments', icon: '🦓' },
];

type Step = 'role' | 'info' | 'sending' | 'done';

export default function SignupPage() {
  const [step, setStep] = useState<Step>('role');
  const [selectedRole, setSelectedRole] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [teamsLinked, setTeamsLinked] = useState(0);

  // Pre-fill from invite link query params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const inv = params.get('invite');
    const em = params.get('email');
    const rl = params.get('role');
    if (inv) setInviteCode(inv);
    if (em) setEmail(decodeURIComponent(em));
    if (rl && ROLES.some(r => r.id === rl)) {
      setSelectedRole(rl);
      setStep('info'); // skip role selection, go straight to info
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !selectedRole) return;
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    setStep('sending');
    setError('');

    try {
      const resp = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          role: selectedRole,
        }),
      });
      const data = await resp.json();

      if (data.success && data.data?.token) {
        // Signed in immediately — no email round-trip needed
        localStorage.setItem('uht_token', data.data.token);
        localStorage.setItem('uht_user', JSON.stringify(data.data.user));
        localStorage.setItem('uht_role', data.data.user.roles?.[0] || selectedRole);
        const role = data.data.user.roles?.[0] || selectedRole;
        if (role === 'admin') window.location.href = '/admin/events';
        else if (role === 'director') window.location.href = '/director';
        else window.location.href = '/dashboard/' + role;
      } else if (String(data.error || '').includes('already exists')) {
        setError('An account with this email already exists. Try signing in instead — if you never set a password, use "Email me a sign-in link" on the login page.');
        setStep('info');
      } else {
        setError(data.message || data.error || 'Something went wrong. Please try again.');
        setStep('info');
      }
    } catch {
      setError('Unable to connect. Please try again.');
      setStep('info');
    }
  };

  // Success screen
  if (step === 'done') {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="bg-white rounded-2xl shadow-soft p-12">
              <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold text-[#1d1d1f]">Account Created!</h1>
              {teamsLinked > 0 && (
                <div className="mt-3 p-3 bg-[#f0f7ff] rounded-xl text-sm text-[#003e79] font-medium">
                  You&apos;ve been automatically linked to {teamsLinked} team{teamsLinked !== 1 ? 's' : ''}!
                </div>
              )}
              <p className="mt-3 text-[#6e6e73] leading-relaxed">
                We sent a sign-in link to <span className="font-medium text-[#1d1d1f]">{email}</span>. Click the link in the email to access your account.
              </p>
              <p className="mt-4 text-sm text-[#aeaeb2]">
                The link expires in 15 minutes. Check your spam folder if you don&apos;t see it.
              </p>
              <a
                href="/login"
                className="mt-6 inline-block text-brand-500 font-medium text-sm hover:underline"
              >
                Go to Sign In
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col">

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          {/* Step 1: Pick your role */}
          {step === 'role' && (
            <>
              <div className="text-center mb-8">
                <h1 className="text-3xl font-semibold text-[#1d1d1f]">Create Your Account</h1>
                <p className="mt-2 text-[#6e6e73]">What best describes you?</p>
              </div>

              <div className="space-y-3">
                {ROLES.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    className={
                      "w-full text-left p-4 rounded-xl border-2 transition-all " +
                      (selectedRole === role.id
                        ? "border-[#003e79] bg-[#f0f7ff] shadow-sm"
                        : "border-[#e8e8ed] bg-white hover:border-[#c8c8cd]")
                    }
                  >
                    <div>
                      <p className={"font-semibold " + (selectedRole === role.id ? "text-[#003e79]" : "text-[#1d1d1f]")}>
                        {role.label}
                      </p>
                      <p className="text-sm text-[#86868b] mt-0.5">{role.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => selectedRole && setStep('info')}
                disabled={!selectedRole}
                className="mt-6 w-full btn-primary py-3.5 text-base font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue
              </button>

              <div className="mt-5 p-4 bg-[#fefce8] border border-[#fde68a] rounded-xl text-sm text-[#92400e]">
                <p className="font-semibold">Are you a parent?</p>
                <p className="mt-1 text-[#a16207]">
                  Parent accounts are created automatically when your coach shares a roster invite link with you. Ask your coach for the link!
                </p>
              </div>

              <p className="mt-6 text-center text-sm text-[#6e6e73]">
                Already have an account?{' '}
                <a href="/login" className="text-[#003e79] font-medium hover:underline">Sign in</a>
              </p>
            </>
          )}

          {/* Step 2: Your info */}
          {(step === 'info' || step === 'sending') && (
            <>
              {inviteCode && (
                <div className="mb-4 p-4 bg-[#f0f7ff] border border-[#003e79]/20 rounded-xl flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#003e79] rounded-lg flex items-center justify-center text-white text-lg shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#003e79]">You&apos;ve been invited to join a team!</p>
                    <p className="text-xs text-[#6e6e73] mt-0.5">Create your account below and you&apos;ll be automatically linked.</p>
                  </div>
                </div>
              )}
              <div className="text-center mb-8">
                <h1 className="text-3xl font-semibold text-[#1d1d1f]">Your Information</h1>
                <p className="mt-2 text-[#6e6e73]">
                  Signing up as <span className="font-medium text-[#003e79]">{ROLES.find(r => r.id === selectedRole)?.label}</span>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-soft p-8">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      required
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      required
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                  />
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">
                    Phone Number <span className="text-[#aeaeb2] font-normal">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 555-5555"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Password *</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Confirm Password *</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                  />
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      {error}
                      {error.includes('already exists') && (
                        <> <a href="/login" className="font-medium text-red-800 underline hover:no-underline">Sign in here</a></>
                      )}
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={step === 'sending' || !firstName || !lastName || !email}
                  className="mt-6 w-full btn-primary py-3.5 text-base font-medium disabled:opacity-50"
                >
                  {step === 'sending' ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Creating Account...
                    </span>
                  ) : (
                    'Create Account'
                  )}
                </button>

                <p className="mt-4 text-center text-xs text-[#aeaeb2]">
                  No password needed — we&apos;ll email you a secure sign-in link.
                </p>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => { setStep('role'); setError(''); }}
                    className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
                  >
                    &larr; Change role
                  </button>
                </div>
              </form>

              <p className="mt-6 text-center text-sm text-[#6e6e73]">
                Already have an account?{' '}
                <a href="/login" className="text-[#003e79] font-medium hover:underline">Sign in</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
