'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
  const [selected, setSelected] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  // Read redirect params from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    const register = params.get('register');
    if (redirect) {
      // Build the full redirect URL, preserving the register param
      const url = register ? `${redirect}?register=${register}` : redirect;
      setRedirectUrl(url);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const role = selected || 'admin';
    // Save auth state so the rest of the app knows we're logged in
    localStorage.setItem('uht_role', role);
    localStorage.setItem('uht_token', 'mock-token-' + role);
    localStorage.setItem('uht_user', JSON.stringify({
      id: 'user-1',
      email: email || 'admin@uht.com',
      name: email ? email.split('@')[0] : 'Admin',
      roles: [role],
    }));

    // Redirect back to where they came from, or default to dashboard
    if (redirectUrl) {
      router.push(redirectUrl);
    } else {
      router.push('/dashboard/' + role);
    }
  };

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
            <p className="mt-2 text-[#6e6e73]">Access your dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-soft p-8">
            <div className="space-y-4">
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
              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-[#1d1d1f] mb-2">
                Sign in as <span className="text-[#6e6e73] font-normal">(dev mode)</span>
              </label>
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
              Sign In
            </button>

            <p className="mt-4 text-center text-sm text-[#6e6e73]">
              Don&apos;t have an account?{' '}
              <a href={redirectUrl ? `/register?redirect=${encodeURIComponent(redirectUrl)}` : '/register'} className="text-brand-500 font-medium hover:underline">Create one</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
