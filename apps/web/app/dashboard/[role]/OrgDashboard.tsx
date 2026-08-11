'use client';

import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

/* ── Pending Request Card ── */
function PendingRequestCard({ request }: { request: any }) {
  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] text-center">
        <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#1d1d1f] mb-2">Organization Request Pending</h2>
        <p className="text-sm text-[#86868b] mb-6">
          Your request for <span className="font-semibold text-[#1d1d1f]">{request.name}</span>
          {(request.city || request.state) && <> ({[request.city, request.state].filter(Boolean).join(', ')})</>} is being reviewed by the UHT team.
          You&apos;ll get an email as soon as it&apos;s approved — then your organization dashboard will unlock automatically.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-sm font-semibold">
          <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          Pending Review
        </div>
      </div>
    </div>
  );
}

/* ── Org Setup Wizard (submits an org request for admin approval) ── */
function OrgSetup({ onSubmitted }: { onSubmitted: () => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Existing org that matches what the user typed (shown for confirmation before submitting)
  const [existingMatch, setExistingMatch] = useState<any | null>(null);

  const submitRequest = async (matchedOrgId?: string) => {
    setLoading(true);
    setError('');
    try {
      let user: any = {};
      try { user = JSON.parse(localStorage.getItem('uht_user') || '{}'); } catch {}
      const res = await fetch(`${API}/api/organizations/requests`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: name.trim(),
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          requestedByEmail: user.email || '',
          requestedByName: [user.first_name, user.last_name].filter(Boolean).join(' ') || undefined,
          requestedByUserId: user.id || undefined,
          matchedOrgId: matchedOrgId || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) setSubmitted(true);
      else setError(json.error || 'Failed to submit request');
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Organization name is required'); return; }
    setLoading(true);
    setError('');
    // Check whether this org already exists before submitting
    try {
      const res = await fetch(`${API}/api/organizations/requests/check?name=${encodeURIComponent(name.trim())}&state=${encodeURIComponent(state.trim())}`);
      const json = await res.json();
      if (json.success && json.data?.length > 0) {
        setExistingMatch(json.data[0]);
        setLoading(false);
        return; // show the confirmation panel instead of submitting
      }
    } catch {}
    await submitRequest();
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-2">Request Submitted!</h2>
          <p className="text-sm text-[#86868b] mb-6">
            We received your request for <span className="font-semibold text-[#1d1d1f]">{name.trim()}</span>.
            The UHT team will review it and email you once it&apos;s approved — usually within one business day.
          </p>
          <button onClick={onSubmitted}
            className="px-6 py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors">
            Got It
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-12">
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
        <div className="w-16 h-16 bg-[#f0f7ff] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#1d1d1f] text-center mb-2">Set Up Your Organization</h2>
        <p className="text-sm text-[#86868b] text-center mb-6">Tell us about your organization. The UHT team reviews every request — once approved, you&apos;ll manage all your teams, coaches, and registrations in one place.</p>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1.5">Organization Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CT Wolves Hockey"
              className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1.5">City</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="City"
                className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1.5">State / Province</label>
              <input value={state} onChange={e => setState(e.target.value)} placeholder="CT" maxLength={2}
                className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79] uppercase" />
            </div>
          </div>
          {existingMatch ? (
            <div className="p-4 bg-[#f0f7ff] border border-[#003e79]/20 rounded-xl">
              <p className="text-sm font-semibold text-[#1d1d1f] mb-1">
                We found this organization already on Ultimate Tournaments:
              </p>
              <p className="text-sm text-[#1d1d1f] mb-3">
                <span className="font-bold">{existingMatch.name}</span>
                {(existingMatch.city || existingMatch.state) && (
                  <span className="text-[#6e6e73]"> — {[existingMatch.city, existingMatch.state].filter(Boolean).join(', ')}</span>
                )}
                {existingMatch.team_count > 0 && (
                  <span className="text-[#6e6e73]"> · {existingMatch.team_count} team{existingMatch.team_count !== 1 ? 's' : ''}</span>
                )}
              </p>
              <p className="text-xs text-[#6e6e73] mb-3">
                If this is your organization, we&apos;ll connect your request to it — no duplicate will be created.
              </p>
              <div className="space-y-2">
                <button onClick={() => submitRequest(existingMatch.id)} disabled={loading}
                  className="w-full py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50">
                  {loading ? 'Submitting...' : "Yes, that's my organization"}
                </button>
                <button onClick={() => submitRequest()} disabled={loading}
                  className="w-full py-2.5 bg-white border border-[#e8e8ed] text-[#1d1d1f] font-semibold rounded-xl text-sm hover:bg-[#f5f5f7] transition-colors disabled:opacity-50">
                  No, mine is a different organization
                </button>
                <button onClick={() => setExistingMatch(null)} disabled={loading}
                  className="w-full py-2 text-xs font-medium text-[#6e6e73] hover:text-[#1d1d1f]">
                  Go back and edit
                </button>
              </div>
            </div>
          ) : (
            <button onClick={handleCreate} disabled={loading}
              className="w-full py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50">
              {loading ? 'Checking...' : 'Submit for Approval'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Org Dashboard ── */
export default function OrgDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<any>(null);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/organizations/dashboard`, { headers: getAuthHeaders() });
      const json = await res.json();
      if (json.success) {
        if (!json.data.org) {
          // No org yet — check for an outstanding org request before showing the setup form
          try {
            const reqRes = await fetch(`${API}/api/organizations/requests/mine`, { headers: getAuthHeaders() });
            const reqJson = await reqRes.json();
            setPendingRequest(reqJson.data && reqJson.data.status === 'pending' ? reqJson.data : null);
          } catch { setPendingRequest(null); }
          setNeedsSetup(true);
        } else {
          setData(json.data);
          setNeedsSetup(false);
          setPendingRequest(null);
        }
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadDashboard(); }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
  }

  if (needsSetup) {
    if (pendingRequest) return <PendingRequestCard request={pendingRequest} />;
    return <OrgSetup onSubmitted={loadDashboard} />;
  }

  if (!data) return <div />;

  const { org, stats, recentRegistrations } = data;

  return (
    <div className="space-y-6">
      {/* Org Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">{org.name}</h1>
          {(org.city || org.state) && <p className="text-sm text-[#6e6e73] mt-0.5">{[org.city, org.state].filter(Boolean).join(', ')}</p>}
        </div>
        <a href="/dashboard/organization/teams"
          className="px-4 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors">
          + Add Team
        </a>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <p className="text-sm text-[#86868b] mb-1">Teams</p>
          <p className="text-2xl font-bold text-[#1d1d1f]">{stats.teams}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <p className="text-sm text-[#86868b] mb-1">Players</p>
          <p className="text-2xl font-bold text-[#1d1d1f]">{stats.players}</p>
          <p className="text-xs text-[#86868b] mt-1">Across all rosters</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <p className="text-sm text-[#86868b] mb-1">Events Registered</p>
          <p className="text-2xl font-bold text-[#1d1d1f]">{stats.events}</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <p className="text-sm text-[#86868b] mb-1">Staff</p>
          <p className="text-2xl font-bold text-[#1d1d1f]">{stats.coaches + stats.managers}</p>
          <p className="text-xs text-[#86868b] mt-1">{stats.coaches} coaches, {stats.managers} managers</p>
        </div>
      </div>

      {/* Balance Due */}
      {stats.balanceDueCents > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-800">Outstanding Balance</p>
              <p className="text-2xl font-bold text-amber-900">${(stats.balanceDueCents / 100).toLocaleString()}</p>
            </div>
            <span className="px-3 py-1.5 bg-amber-200 text-amber-800 rounded-lg text-xs font-semibold">Unpaid</span>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <h2 className="text-base font-bold text-[#1d1d1f]">Quick Actions</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Manage Teams', href: '/dashboard/organization/teams' },
          { label: 'View Coaches', href: '/dashboard/organization/coaches' },
          { label: 'View Rosters', href: '/dashboard/organization/rosters' },
          { label: 'Browse Events', href: '/events' },
        ].map(a => (
          <a key={a.label} href={a.href}
            className="bg-white rounded-2xl border border-[#e8e8ed] p-4 hover:shadow-[0_4px_20px_-6px_rgba(0,62,121,0.12)] hover:-translate-y-0.5 transition-all text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
            <div className="text-sm font-semibold text-[#003e79]">{a.label}</div>
          </a>
        ))}
      </div>

      {/* Recent Registrations */}
      {recentRegistrations && recentRegistrations.length > 0 && (
        <>
          <h2 className="text-base font-bold text-[#1d1d1f]">Recent Registrations</h2>
          <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
            <div className="divide-y divide-[#f0f0f2]">
              {recentRegistrations.map((reg: any) => (
                <div key={reg.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-semibold text-[#1d1d1f]">{reg.team_name}</p>
                    <p className="text-xs text-[#6e6e73]">{reg.event_name} · {new Date(reg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                      reg.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                      reg.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-[#f5f5f7] text-[#6e6e73]'
                    }`}>{reg.status}</span>
                    <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                      reg.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                    }`}>{reg.payment_status || 'unpaid'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
