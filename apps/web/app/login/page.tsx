'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLES = [
  { id: 'admin', label: 'Admin', desc: 'Full system access', icon: '\u{1F6E1}' },
  { id: 'director', label: 'Director', desc: 'Event management', icon: '\u{1F3AF}' },
  { id: 'organization', label: 'Organization', desc: 'Teams & rosters', icon: '\u{1F3E2}' },
  { id: 'coach', label: 'Coach', desc: 'Team management', icon: '\u{1F4CB}' },
  { id: 'manager', label: 'Manager', desc: 'Team creation', icon: '\u{1F465}' },
  { id: 'parent', label: 'Parent / Player', desc: 'Stats & results', icon: '\u{2B50}' },
  { id: 'scorekeeper', label: 'Scorekeeper', desc: 'Live scoring', icon: '\u{1F4CA}' },
  { id: 'referee', label: 'Referee', desc: 'Game assignments', icon: '\u{1F6A9}' },
];

export default function LoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const role = selected || 'admin';
    if (typeof window !== 'undefined') localStorage.setItem('uht_role', role);
    router.push('/dashboard/' + role);
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
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 outline-none transition-all text-sm" />
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-[#1d1d1f] mb-2">Sign in as <span className="text-[#6e6e73] font-normal">(dev mode)</span></label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((role) => (
                  <button type="button" key={role.id} onClick={() => setSelected(role.id)} className={"flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-sm transition-all " + (selected === role.id ? "border-brand-400 bg-brand-50 text-brand-600" : "border-gray-200 hover:border-gray-300 text-[#1d1d1f]")}>
                    <span className="text-base">{role.icon}</span>
                    <span className="font-medium">{role.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" className="mt-6 w-full btn-primary py-3 text-base font-medium">Sign In</button>

            <p className="mt-4 text-center text-sm text-[#6e6e73]">
              Don&apos;t have an account?{' '}
              <a href="/register" className="text-brand-500 font-medium hover:underline">Create one</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
