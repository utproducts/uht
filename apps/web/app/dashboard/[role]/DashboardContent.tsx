'use client';

import { useState, useEffect } from 'react';
import DirectorDash from './DirectorDash';
import OrgDashboard from './OrgDashboard';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
      <p className="text-sm text-[#86868b] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#1d1d1f]">{value}</p>
      {sub && <p className="text-xs text-[#86868b] mt-1">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-bold text-[#1d1d1f] mb-3">{children}</h2>;
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
      <table className="w-full text-sm">
        <thead className="bg-[#fafafa] text-left text-[#6e6e73]">
          <tr>{headers.map((h, i) => <th key={i} className="px-4 py-3 font-medium text-xs uppercase tracking-wider">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[#f0f0f2]">
          {rows.map((r, i) => <tr key={i} className="hover:bg-[#fafafa] transition-colors">{r.map((c, j) => <td key={j} className="px-4 py-3 text-[#1d1d1f]">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function CapBar({ label, cur, max }: { label: string; cur: number; max: number }) {
  const pct = Math.round((cur / max) * 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1.5"><span className="text-[#1d1d1f] font-medium">{label}</span><span className="text-[#86868b]">{cur}/{max}</span></div>
      <div className="h-2 bg-[#f0f0f2] rounded-full"><div className="h-2 bg-gradient-to-r from-[#003e79] to-[#00ccff] rounded-full transition-all" style={{ width: pct + '%' }} /></div>
    </div>
  );
}

/* ── Pending Registrations Card (inline approve/deny) ── */
function PendingRegistrations() {
  const [regs, setRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const API = 'https://uht.chad-157.workers.dev/api';
  const devHeaders: Record<string, string> = { 'X-Dev-Bypass': 'true' };

  const fetchPending = async () => {
    try {
      const res = await fetch(`${API}/analytics/reports/pending-registrations`, { headers: devHeaders });
      const json = await res.json();
      if (json.success) setRegs(json.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchPending(); }, []);

  const handleAction = async (regId: string, action: 'approve' | 'reject') => {
    setActioningId(regId);
    try {
      const res = await fetch(`${API}/registrations/${regId}/${action}`, {
        method: 'POST',
        headers: { ...devHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'reject' ? { reason: 'Denied from dashboard' } : {}),
      });
      const json = await res.json();
      if (json.success) {
        setToast({ msg: `Registration ${action === 'approve' ? 'approved' : 'denied'}!`, type: 'success' });
        setRegs(prev => prev.filter(r => r.id !== regId));
      } else {
        setToast({ msg: json.error || 'Action failed', type: 'error' });
      }
    } catch {
      setToast({ msg: 'Network error', type: 'error' });
    }
    setActioningId(null);
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
        <div className="flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79]" /></div>
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>{toast.msg}</div>
      )}

      {regs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <div className="text-2xl mb-2">&#10003;</div>
          <p className="text-[#86868b] text-sm">All caught up! No pending registrations.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {regs.map(r => {
            const isExpanded = expandedId === r.id;
            const isActioning = actioningId === r.id;
            const eventDate = r.start_date ? new Date(r.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
            const waitDays = Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24));
            const spotsLeft = r.max_teams ? r.max_teams - r.current_team_count : null;

            return (
              <div key={r.id} className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] overflow-hidden">
                {/* Main row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Team + Event info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#1d1d1f] text-sm">{r.team_name}</span>
                      {r.team_city && <span className="text-xs text-[#86868b]">{r.team_city}{r.team_state ? `, ${r.team_state}` : ''}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs font-medium text-[#003e79]">{r.event_name}</span>
                      <span className="text-[10px] text-[#86868b]">|</span>
                      <span className="text-xs text-[#6e6e73]">{[r.division_age_group, r.division_level].filter(Boolean).join(' ')}</span>
                      {eventDate && <>
                        <span className="text-[10px] text-[#86868b]">|</span>
                        <span className="text-xs text-[#86868b]">{eventDate}</span>
                      </>}
                    </div>
                  </div>

                  {/* Wait time badge */}
                  <div className="flex-shrink-0 text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      waitDays > 7 ? 'bg-red-50 text-red-600' : waitDays > 3 ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                      {waitDays === 0 ? 'Today' : waitDays === 1 ? '1 day ago' : `${waitDays}d ago`}
                    </span>
                  </div>

                  {/* Spots indicator */}
                  {spotsLeft !== null && (
                    <div className="flex-shrink-0 text-center">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        spotsLeft <= 2 ? 'bg-red-50 text-red-600' : spotsLeft <= 5 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left
                      </span>
                    </div>
                  )}

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#f5f5f7] text-[#86868b] transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAction(r.id, 'approve')}
                      disabled={isActioning}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50 active:scale-[0.97]"
                    >
                      {isActioning ? '...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'reject')}
                      disabled={isActioning}
                      className="px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-lg transition-all disabled:opacity-50 active:scale-[0.97]"
                    >
                      Deny
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-[#f0f0f2] bg-[#fafafa] px-5 py-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>
                        <p className="text-[#86868b] mb-0.5">Coach</p>
                        <p className="text-[#1d1d1f] font-medium">{r.head_coach_name || r.registered_by_first ? `${r.registered_by_first || ''} ${r.registered_by_last || ''}`.trim() : 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[#86868b] mb-0.5">Email</p>
                        <p className="text-[#1d1d1f] font-medium">{r.head_coach_email || r.registered_by_email || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[#86868b] mb-0.5">Phone</p>
                        <p className="text-[#1d1d1f] font-medium">{r.head_coach_phone || r.registered_by_phone || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[#86868b] mb-0.5">Payment</p>
                        <p className="text-[#1d1d1f] font-medium">
                          {r.division_price ? `$${(r.division_price / 100).toLocaleString()}` : 'N/A'}
                          <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            r.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                          }`}>{r.payment_status || 'unpaid'}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[#86868b] mb-0.5">Registered</p>
                        <p className="text-[#1d1d1f] font-medium">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                      <div>
                        <p className="text-[#86868b] mb-0.5">Roster</p>
                        <p className="text-[#1d1d1f] font-medium">{r.roster_count || 0} players</p>
                      </div>
                      <div>
                        <p className="text-[#86868b] mb-0.5">Division Capacity</p>
                        <p className="text-[#1d1d1f] font-medium">{r.current_team_count}/{r.max_teams || '∞'}</p>
                      </div>
                      {r.notes && (
                        <div className="col-span-2 sm:col-span-4">
                          <p className="text-[#86868b] mb-0.5">Notes</p>
                          <p className="text-[#1d1d1f] font-medium">{r.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminDash() {
  const [stats, setStats] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [divisionTotals, setDivisionTotals] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const API = 'https://uht.chad-157.workers.dev/api';
    const devHeaders: Record<string, string> = { 'X-Dev-Bypass': 'true' };
    Promise.all([
      fetch(`${API}/events/admin/list?filter=upcoming`, { headers: devHeaders }).then(r => r.json()),
      fetch(`${API}/events/admin/list?filter=all`, { headers: devHeaders }).then(r => r.json()),
      fetch(`${API}/analytics/reports/pending-registrations`, { headers: devHeaders }).then(r => r.json()),
      fetch(`${API}/analytics/reports/division-totals`, { headers: devHeaders }).then(r => r.json()),
    ]).then(([upJson, allJson, pendJson, divJson]) => {
      const upcoming = upJson.success ? upJson.data : [];
      const all = allJson.success ? allJson.data : [];
      setEvents(upcoming);
      setPendingCount(pendJson.success ? (pendJson.data?.length || 0) : 0);
      setDivisionTotals(divJson.success ? (divJson.data || []) : []);

      const totalTeams = all.reduce((s: number, e: any) => s + (e.registration_count || 0), 0);
      const totalRevenue = all.reduce((s: number, e: any) => s + (e.total_revenue_cents || 0), 0);

      setStats({
        upcomingEvents: upcoming.length,
        totalEvents: all.length,
        totalTeams,
        totalRevenue,
      });
      setLoadingStats(false);
    }).catch(() => setLoadingStats(false));
  }, []);

  if (loadingStats) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Upcoming Events" value={stats?.upcomingEvents || 0} sub={`${stats?.totalEvents || 0} total`} />
        <StatCard label="Teams Registered" value={stats?.totalTeams || 0} sub="Across all events" />
        <StatCard label="Total Revenue" value={`$${((stats?.totalRevenue || 0) / 100).toLocaleString()}`} sub="All events" />
        <div className={`bg-white rounded-2xl border p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] ${pendingCount > 0 ? 'border-amber-300 ring-1 ring-amber-200' : 'border-[#e8e8ed]'}`}>
          <p className="text-sm text-[#86868b] mb-1">Pending Approvals</p>
          <p className={`text-2xl font-bold ${pendingCount > 0 ? 'text-amber-600' : 'text-[#1d1d1f]'}`}>{pendingCount}</p>
          {pendingCount > 0 && <p className="text-xs text-amber-600 mt-1 font-medium">Needs attention</p>}
        </div>
      </div>

      {/* Pending Registrations — PRIORITY */}
      {pendingCount > 0 && (
        <>
          <div className="flex items-center gap-3">
            <SectionTitle>Pending Registrations</SectionTitle>
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold">{pendingCount}</span>
          </div>
          <PendingRegistrations />
        </>
      )}

      {/* Quick Actions */}
      <SectionTitle>Quick Actions</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Create Event', href: '/admin/events' },
          { label: 'Reports', href: '/admin/reports' },
          { label: 'View Sponsors', href: '/admin/sponsors' },
          { label: 'Manage Ice', href: '/admin/ice' },
        ].map(a => (
          <a key={a.label} href={a.href} className="bg-white rounded-2xl border border-[#e8e8ed] p-4 hover:shadow-[0_4px_20px_-6px_rgba(0,62,121,0.12)] hover:-translate-y-0.5 transition-all text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
            <div className="text-sm font-semibold text-[#003e79]">{a.label}</div>
          </a>
        ))}
      </div>

      {/* Upcoming Events */}
      <SectionTitle>Upcoming Events</SectionTitle>
      {events.length > 0 ? (
        <Table headers={['Event', 'Dates', 'Location', 'Teams', 'Revenue', 'Status']} rows={
          events.slice(0, 6).map((e: any) => {
            const startDt = new Date(e.start_date + 'T12:00:00');
            const endDt = new Date(e.end_date + 'T12:00:00');
            const dateStr = `${startDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            return [
              e.tournament_name || e.name,
              dateStr,
              `${e.city}, ${e.state}`,
              String(e.registration_count || 0),
              e.total_revenue_cents ? `$${(e.total_revenue_cents / 100).toLocaleString()}` : '$0',
              e.status?.replace(/_/g, ' ') || 'draft',
            ];
          })
        } />
      ) : (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 text-center text-[#86868b]">No upcoming events</div>
      )}

      {/* Teams by Division */}
      {divisionTotals.length > 0 && (
        <>
          <SectionTitle>Teams by Division</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {divisionTotals.map((d: any) => {
              const pct = d.total_capacity > 0 ? Math.round((d.total_teams / d.total_capacity) * 100) : 0;
              return (
                <div key={d.age_group} className="bg-white rounded-2xl border border-[#e8e8ed] p-4 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-[#1d1d1f]">{d.age_group}</p>
                    <span className="text-xs text-[#86868b]">{d.event_count} event{d.event_count !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-2xl font-bold text-[#003e79]">{d.total_teams}</p>
                  <div className="mt-2">
                    <div className="flex justify-between text-[11px] text-[#86868b] mb-1">
                      <span>Capacity</span>
                      <span>{d.total_teams}/{d.total_capacity}</span>
                    </div>
                    <div className="h-1.5 bg-[#f0f0f2] rounded-full">
                      <div className={`h-1.5 rounded-full transition-all ${pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-gradient-to-r from-[#003e79] to-[#00ccff]'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* DirectorDash is imported from ./DirectorDash.tsx */

/* OrgDash is imported from ./OrgDashboard.tsx */

function CoachDash() {
  const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  // Staff invite modal
  const [inviteModal, setInviteModal] = useState<{ teamId: string; teamName: string; role: 'coach' | 'manager' } | null>(null);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const sendStaffInvite = async () => {
    if (!inviteModal || !inviteName.trim() || !inviteEmail.trim()) return;
    setInviteSending(true);
    setInviteResult(null);
    try {
      const token = localStorage.getItem('uht_token');
      const res = await fetch(`${API}/api/teams/invite-staff/${inviteModal.teamId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: inviteName.trim(), email: inviteEmail.trim(), role: inviteModal.role }),
      });
      const json = await res.json();
      if (json.success) {
        setInviteResult({ type: 'success', message: `Invite sent to ${inviteEmail}!` });
        setInviteName('');
        setInviteEmail('');
        // Refresh teams to show new staff
        const teamsRes = await fetch(`${API}/api/teams/my-teams`, { headers: { 'Authorization': `Bearer ${token}` } });
        const teamsJson = await teamsRes.json();
        if (teamsJson.success) setTeams(teamsJson.data || []);
      } else {
        setInviteResult({ type: 'error', message: json.error || 'Failed to send invite' });
      }
    } catch {
      setInviteResult({ type: 'error', message: 'Network error. Please try again.' });
    }
    setInviteSending(false);
  };

  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem('uht_token');
        if (!token) { setLoading(false); return; }
        const res = await fetch(`${API}/api/teams/my-teams`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.success) {
          setTeams(json.data || []);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const totalPlayers = teams.reduce((sum, t) => sum + (t.player_count || 0), 0);
  const totalEvents = teams.reduce((sum, t) => sum + (t.registered_events?.length || 0), 0);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="My Teams" value={teams.length} />
        <StatCard label="Players" value={totalPlayers} sub={totalPlayers === 0 ? 'Add via roster' : undefined} />
        <StatCard label="Registered Events" value={totalEvents} sub={totalEvents === 0 ? 'Browse events below' : undefined} />
        <StatCard label="Schedules" value="—" sub="Released before events" />
      </div>

      {/* Teams Header */}
      <div className="flex items-center justify-between">
        <SectionTitle>My Teams</SectionTitle>
        <a href="/create-team" className="px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full text-sm transition-all active:scale-[0.98] shadow-sm">
          + Create Team
        </a>
      </div>

      {teams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <div className="text-4xl mb-4">🏒</div>
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">No Teams Yet</h3>
          <p className="text-sm text-[#86868b] mb-5">Create your first team to start registering for tournaments.</p>
          <a href="/create-team" className="inline-block px-6 py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full text-sm transition-all active:scale-[0.98]">
            Create Your First Team
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map((team: any) => {
            const isExpanded = expandedTeam === team.id;
            const rosterLink = team.roster_share_token
              ? `${typeof window !== 'undefined' ? window.location.origin : ''}/roster/claim?token=${team.roster_share_token}`
              : null;
            return (
              <div key={team.id} className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_-6px_rgba(0,62,121,0.12)] transition-all">
                {/* Team Header */}
                <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-5 py-4 text-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-lg">{team.name}</h3>
                      <p className="text-white/70 text-sm mt-0.5">
                        {team.age_group}{team.division_level ? ` · ${team.division_level}` : ''}
                        {team.city || team.state ? ` · ${[team.city, team.state].filter(Boolean).join(', ')}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="bg-white/20 px-2.5 py-1 rounded-full text-xs font-medium">
                        {team.player_count || 0} players
                      </span>
                      {team.registered_events?.length > 0 && (
                        <span className="bg-green-400/30 px-2.5 py-1 rounded-full text-xs font-medium">
                          {team.registered_events.length} event{team.registered_events.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#e8e8ed]">
                  {/* 1. Edit Roster */}
                  <a href="/dashboard/coach/roster"
                    className="bg-white px-4 py-3 flex flex-col items-center gap-1.5 hover:bg-[#f0f7ff] transition-colors group">
                    <span className="text-xl group-hover:scale-110 transition-transform">📋</span>
                    <span className="text-xs font-semibold text-[#003e79]">Edit Roster</span>
                  </a>

                  {/* 2. Register for Event */}
                  <a href="/events"
                    className="bg-white px-4 py-3 flex flex-col items-center gap-1.5 hover:bg-[#f0f7ff] transition-colors group">
                    <span className="text-xl group-hover:scale-110 transition-transform">🏆</span>
                    <span className="text-xs font-semibold text-[#003e79]">Register Event</span>
                  </a>

                  {/* 3. Roster Invite Link */}
                  <button
                    onClick={() => rosterLink && copyToClipboard(rosterLink, `roster-${team.id}`)}
                    className="bg-white px-4 py-3 flex flex-col items-center gap-1.5 hover:bg-[#f0f7ff] transition-colors group disabled:opacity-40"
                    disabled={!rosterLink}>
                    <span className="text-xl group-hover:scale-110 transition-transform">🔗</span>
                    <span className="text-xs font-semibold text-[#003e79]">
                      {copied === `roster-${team.id}` ? '✓ Copied!' : 'Roster Link'}
                    </span>
                  </button>

                  {/* 4. Team Code */}
                  <button
                    onClick={() => team.invite_code && copyToClipboard(team.invite_code, `code-${team.id}`)}
                    className="bg-white px-4 py-3 flex flex-col items-center gap-1.5 hover:bg-[#f0f7ff] transition-colors group disabled:opacity-40"
                    disabled={!team.invite_code}>
                    <span className="text-xl group-hover:scale-110 transition-transform">🔑</span>
                    <span className="text-xs font-semibold text-[#003e79]">
                      {copied === `code-${team.id}` ? '✓ Copied!' : 'Team Code'}
                    </span>
                  </button>
                </div>

                {/* Expand/collapse for details */}
                <button onClick={() => setExpandedTeam(isExpanded ? null : team.id)}
                  className="w-full px-5 py-2.5 bg-[#fafafa] border-t border-[#e8e8ed] flex items-center justify-between hover:bg-[#f5f5f7] transition-colors">
                  <span className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">
                    {isExpanded ? 'Hide Details' : 'Show Details'}
                  </span>
                  <span className={`text-[#86868b] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                </button>

                {isExpanded && (
                  <div className="px-5 py-4 border-t border-[#e8e8ed] space-y-4">
                    {/* Team Info */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {team.head_coach_name && (
                        <div><span className="text-[#86868b]">Coach:</span> <span className="font-medium text-[#1d1d1f]">{team.head_coach_name}</span></div>
                      )}
                      {team.season_record && (
                        <div><span className="text-[#86868b]">Record:</span> <span className="font-medium text-[#1d1d1f]">{team.season_record}</span></div>
                      )}
                      {team.hometown_league && (
                        <div><span className="text-[#86868b]">League:</span> <span className="font-medium text-[#1d1d1f]">{team.hometown_league}</span></div>
                      )}
                      {team.invite_code && (
                        <div><span className="text-[#86868b]">Team Code:</span> <span className="font-mono font-bold text-[#003e79]">{team.invite_code}</span></div>
                      )}
                    </div>

                    {/* Coaches & Managers */}
                    <div className="border-t border-[#e8e8ed] pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider">Coaches & Managers</h4>
                        <div className="flex gap-2">
                          <button onClick={() => { setInviteModal({ teamId: team.id, teamName: team.name, role: 'coach' }); setInviteResult(null); }}
                            className="text-xs font-semibold text-[#003e79] hover:underline">+ Add Coach</button>
                          <button onClick={() => { setInviteModal({ teamId: team.id, teamName: team.name, role: 'manager' }); setInviteResult(null); }}
                            className="text-xs font-semibold text-[#003e79] hover:underline">+ Add Manager</button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {(team.coaches || []).map((c: any) => (
                          <div key={c.id} className="flex items-center justify-between bg-[#f5f5f7] rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base">🏒</span>
                              <div>
                                <span className="text-sm font-medium text-[#1d1d1f]">{c.first_name} {c.last_name}</span>
                                <span className="text-xs text-[#86868b] ml-1.5 capitalize">({c.role || 'coach'})</span>
                              </div>
                            </div>
                            <span className="text-xs text-[#86868b]">{c.email}</span>
                          </div>
                        ))}
                        {(team.managers || []).map((m: any) => (
                          <div key={m.id} className="flex items-center justify-between bg-[#f5f5f7] rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-base">📋</span>
                              <div>
                                <span className="text-sm font-medium text-[#1d1d1f]">{m.first_name} {m.last_name}</span>
                                <span className="text-xs text-[#86868b] ml-1.5">(manager)</span>
                              </div>
                            </div>
                            <span className="text-xs text-[#86868b]">{m.email}</span>
                          </div>
                        ))}
                        {(team.coaches || []).length === 0 && (team.managers || []).length === 0 && !team.head_coach_name && (
                          <p className="text-sm text-[#86868b] italic">No staff linked yet. Use the buttons above to invite.</p>
                        )}
                      </div>
                    </div>

                    {/* Parent Claim Status */}
                    {(team.total_players || 0) > 0 && (
                      <div className="border-t border-[#e8e8ed] pt-3">
                        <h4 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">Parent Registration</h4>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 bg-[#f5f5f7] rounded-lg h-3 overflow-hidden">
                            <div className="bg-green-500 h-full rounded-lg transition-all"
                              style={{ width: `${Math.round(((team.claimed_players || 0) / (team.total_players || 1)) * 100)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-[#1d1d1f] whitespace-nowrap">
                            {team.claimed_players || 0} / {team.total_players || 0} claimed
                          </span>
                        </div>
                        {(team.claimed_players || 0) < (team.total_players || 0) && (
                          <p className="text-xs text-[#86868b] mt-1.5">
                            {(team.total_players || 0) - (team.claimed_players || 0)} parent{(team.total_players || 0) - (team.claimed_players || 0) !== 1 ? 's' : ''} still need to register. Share the roster link above!
                          </p>
                        )}
                      </div>
                    )}

                    {/* 5. Coupon Codes */}
                    <div className="border-t border-[#e8e8ed] pt-3">
                      <a href="/dashboard/coach/coupons" className="flex items-center gap-2 text-sm text-[#003e79] font-semibold hover:underline">
                        🎟️ Coupon Codes
                        <span className="text-[#86868b] font-normal">— View and apply discount codes</span>
                      </a>
                    </div>

                    {/* 6. Registered Events */}
                    <div className="border-t border-[#e8e8ed] pt-3">
                      <h4 className="text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">Registered Events</h4>
                      {team.registered_events && team.registered_events.length > 0 ? (
                        <div className="space-y-2">
                          {team.registered_events.map((evt: any) => (
                            <div key={evt.id || evt.event_id} className="flex items-center justify-between bg-[#f5f5f7] rounded-lg px-3 py-2">
                              <div>
                                <span className="text-sm font-medium text-[#1d1d1f]">{evt.event_name || evt.name}</span>
                                {evt.event_date && (
                                  <span className="text-xs text-[#86868b] ml-2">{evt.event_date}</span>
                                )}
                              </div>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                evt.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                evt.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {evt.status || 'registered'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-[#86868b] italic">No events registered yet. <a href="/events" className="text-[#003e79] font-medium hover:underline">Browse events →</a></p>
                      )}
                    </div>

                    {/* 7. Schedule */}
                    <div className="border-t border-[#e8e8ed] pt-3">
                      <a href="/dashboard/coach/schedule" className="flex items-center gap-2 text-sm text-[#003e79] font-semibold hover:underline">
                        📅 View Schedule
                        <span className="text-[#86868b] font-normal">— Game times released before each event</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Actions */}
      <SectionTitle>Quick Actions</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Browse Events', href: '/events', icon: '🏆' },
          { label: 'Create Team', href: '/create-team', icon: '➕' },
          { label: 'My Schedule', href: '/dashboard/coach/schedule', icon: '📅' },
          { label: 'Coupon Codes', href: '/dashboard/coach/coupons', icon: '🎟️' },
        ].map(a => (
          <a key={a.label} href={a.href} className="bg-white rounded-2xl border border-[#e8e8ed] p-4 hover:shadow-[0_4px_20px_-6px_rgba(0,62,121,0.12)] hover:-translate-y-0.5 transition-all text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
            <div className="text-2xl mb-1">{a.icon}</div>
            <div className="text-sm font-semibold text-[#003e79]">{a.label}</div>
          </a>
        ))}
      </div>

      {/* Toast notification */}
      {copied && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1d1d1f] text-white px-4 py-2.5 rounded-full text-sm font-medium shadow-lg z-50 animate-[fadeIn_0.2s_ease]">
          ✓ Copied to clipboard
        </div>
      )}

      {/* Staff Invite Modal */}
      {inviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setInviteModal(null); setInviteResult(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-4">
              <h3 className="text-white font-bold text-lg">
                Add {inviteModal.role === 'coach' ? 'Coach' : 'Manager'}
              </h3>
              <p className="text-white/70 text-sm mt-0.5">{inviteModal.teamName}</p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-[#6e6e73]">
                Enter their name and email. We&apos;ll send them an invite with the team code so they can join automatically.
              </p>
              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Full Name</label>
                <input type="text" value={inviteName} onChange={e => setInviteName(e.target.value)}
                  placeholder="First and Last Name" autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#003e79] focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Email Address</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="their@email.com"
                  onKeyDown={e => { if (e.key === 'Enter') sendStaffInvite(); }}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#003e79] focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
              </div>

              {inviteResult && (
                <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${
                  inviteResult.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'
                }`}>
                  {inviteResult.type === 'success' ? '✓' : '✗'} {inviteResult.message}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setInviteModal(null); setInviteResult(null); setInviteName(''); setInviteEmail(''); }}
                  className="flex-1 py-3 rounded-xl border border-[#e8e8ed] text-sm font-semibold text-[#6e6e73] hover:bg-[#f5f5f7] transition">
                  {inviteResult?.type === 'success' ? 'Done' : 'Cancel'}
                </button>
                {inviteResult?.type !== 'success' && (
                  <button onClick={sendStaffInvite} disabled={inviteSending || !inviteName.trim() || !inviteEmail.trim()}
                    className={"flex-1 py-3 rounded-xl text-sm font-semibold transition " +
                      (inviteSending || !inviteName.trim() || !inviteEmail.trim()
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-[#003e79] text-white hover:bg-[#002d5a]")}>
                    {inviteSending ? 'Sending...' : 'Send Invite'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ManagerDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Team" value="CT Wolves U14" />
        <StatCard label="Players" value={17} sub="All fees paid" />
        <StatCard label="Upcoming Events" value={2} />
        <StatCard label="Open Tasks" value={3} sub="Roster updates" />
      </div>
      <SectionTitle>Player Status</SectionTitle>
      <Table headers={['Player', 'Registration', 'Waiver', 'Fee']} rows={[
        ['Jake Thompson', 'Complete', 'Signed', 'Paid'],
        ['Ryan Mitchell', 'Complete', 'Signed', 'Paid'],
        ['Sam Patel', 'Complete', 'Pending', 'Paid'],
      ]} />
      <SectionTitle>Team Communications</SectionTitle>
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-4 space-y-3">
        <p className="text-sm"><span className="font-medium">Schedule Update:</span> Saturday games moved to Rink 2</p>
        <p className="text-sm"><span className="font-medium">Reminder:</span> Jerseys due by Friday</p>
      </div>
    </div>
  );
}

// Hockey character avatars — fun SVG icons kids can pick
const AVATARS: { id: string; label: string; emoji: string }[] = [
  { id: 'penguin', label: 'Penguin', emoji: '🐧' },
  { id: 'bear', label: 'Bear', emoji: '🐻' },
  { id: 'wolf', label: 'Wolf', emoji: '🐺' },
  { id: 'eagle', label: 'Eagle', emoji: '🦅' },
  { id: 'shark', label: 'Shark', emoji: '🦈' },
  { id: 'dragon', label: 'Dragon', emoji: '🐉' },
  { id: 'lion', label: 'Lion', emoji: '🦁' },
  { id: 'tiger', label: 'Tiger', emoji: '🐯' },
  { id: 'fox', label: 'Fox', emoji: '🦊' },
  { id: 'owl', label: 'Owl', emoji: '🦉' },
  { id: 'unicorn', label: 'Unicorn', emoji: '🦄' },
  { id: 'octopus', label: 'Octopus', emoji: '🐙' },
  { id: 'bat', label: 'Bat', emoji: '🦇' },
  { id: 'gorilla', label: 'Gorilla', emoji: '🦍' },
  { id: 'rocket', label: 'Rocket', emoji: '🚀' },
  { id: 'lightning', label: 'Lightning', emoji: '⚡' },
];

function getAvatarEmoji(avatarId: string | null): string {
  if (!avatarId) return '🏒';
  const av = AVATARS.find(a => a.id === avatarId);
  return av ? av.emoji : '🏒';
}

function ParentDash() {
  const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlayer, setEditingPlayer] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '' });
  const [saving, setSaving] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('uht_token');
    if (!token || token.startsWith('mock-')) { setLoading(false); return; }
    fetch(`${API}/api/teams/my-players`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => { if (json.success) setPlayers(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [API]);

  const startEdit = (p: any) => {
    setEditingPlayer(p);
    setEditForm({
      firstName: p.first_name || '', lastName: p.last_name || '',
      jerseyNumber: p.jersey_number || '', position: p.position || '', shoots: p.shoots || '',
    });
  };

  const saveEdit = async () => {
    if (!editingPlayer) return;
    setSaving(true);
    const token = localStorage.getItem('uht_token');
    try {
      const res = await fetch(`${API}/api/teams/players/${editingPlayer.id}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (json.success) {
        setPlayers(prev => prev.map(p => p.id === editingPlayer.id ? { ...p, ...{ first_name: editForm.firstName, last_name: editForm.lastName, jersey_number: editForm.jerseyNumber, position: editForm.position, shoots: editForm.shoots } } : p));
        setEditingPlayer(null);
      }
    } catch {} finally { setSaving(false); }
  };

  const setAvatar = async (playerId: string, avatarId: string) => {
    setSavingAvatar(true);
    const token = localStorage.getItem('uht_token');
    try {
      const res = await fetch(`${API}/api/teams/players/${playerId}/avatar`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId }),
      });
      const json = await res.json();
      if (json.success) {
        setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, avatar_id: avatarId } : p));
        setShowAvatarPicker(null);
      }
    } catch {} finally { setSavingAvatar(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><span className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" /></div>;

  if (players.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">{'🏒'}</div>
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">No Players Claimed Yet</h3>
          <p className="text-sm text-[#6e6e73] max-w-md mx-auto">
            Ask your coach for the team roster link. You can claim your child and get set up for tournament updates.
          </p>
        </div>
      </div>
    );
  }

  const formatPos = (p: string | null) => p ? p.charAt(0).toUpperCase() + p.slice(1) : '—';

  return (
    <div className="space-y-6">
      {/* Player Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {players.map(p => (
          <div key={p.id} className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden shadow-sm">
            {/* Player header */}
            <div className="bg-gradient-to-r from-[#003e79] to-[#005599] p-4 text-white relative">
              <button onClick={() => setShowAvatarPicker(showAvatarPicker === p.id ? null : p.id)}
                className="absolute top-3 right-3 w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 transition flex items-center justify-center text-2xl cursor-pointer"
                title="Pick your character!">
                {getAvatarEmoji(p.avatar_id)}
              </button>
              <p className="text-xs text-white/60 font-semibold uppercase tracking-wider">{p.org_name || ''}</p>
              <h3 className="text-lg font-bold mt-0.5">{p.first_name} {p.last_name}</h3>
              <p className="text-sm text-white/80 mt-0.5">{p.team_name}</p>
            </div>

            {/* Avatar picker dropdown */}
            {showAvatarPicker === p.id && (
              <div className="bg-yellow-50 border-b border-yellow-200 p-4">
                <p className="text-xs font-semibold text-yellow-800 mb-2 uppercase tracking-wide">Pick Your Character!</p>
                <div className="grid grid-cols-8 gap-2">
                  {AVATARS.map(av => (
                    <button key={av.id} onClick={() => setAvatar(p.id, av.id)} disabled={savingAvatar}
                      className={"w-10 h-10 rounded-xl flex items-center justify-center text-xl transition " +
                        (p.avatar_id === av.id ? "bg-[#003e79] ring-2 ring-[#003e79] ring-offset-1" : "bg-white border border-gray-200 hover:border-[#003e79] hover:bg-blue-50")}>
                      {av.emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Player details */}
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#86868b]">Jersey:</span>
                  <span className="font-semibold text-[#1d1d1f]">#{p.jersey_number || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#86868b]">Position:</span>
                  <span className="font-semibold text-[#1d1d1f]">{formatPos(p.position)}</span>
                </div>
                {p.shoots && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[#86868b]">Shoots:</span>
                    <span className="font-semibold text-[#1d1d1f] capitalize">{p.shoots}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-[#6e6e73]">
                <span>{p.age_group}</span>
                {p.division_level && <><span>&middot;</span><span>{p.division_level}</span></>}
                {(p.team_city || p.team_state) && <><span>&middot;</span><span>{[p.team_city, p.team_state].filter(Boolean).join(', ')}</span></>}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button onClick={() => startEdit(p)}
                  className="px-3 py-1.5 text-xs font-semibold text-[#003e79] bg-blue-50 rounded-lg hover:bg-blue-100 transition">
                  Edit Player Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingPlayer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-lg">Edit Player Details</h3>
              <button onClick={() => setEditingPlayer(null)} className="text-white/70 hover:text-white text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">First Name</label>
                  <input type="text" value={editForm.firstName} onChange={e => setEditForm({ ...editForm, firstName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Last Name</label>
                  <input type="text" value={editForm.lastName} onChange={e => setEditForm({ ...editForm, lastName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Jersey #</label>
                  <input type="text" value={editForm.jerseyNumber} onChange={e => setEditForm({ ...editForm, jerseyNumber: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Position</label>
                  <select value={editForm.position} onChange={e => setEditForm({ ...editForm, position: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm">
                    <option value="">Select...</option>
                    <option value="forward">Forward</option>
                    <option value="defense">Defense</option>
                    <option value="goalie">Goalie</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1d1d1f] mb-1.5">Shoots</label>
                  <select value={editForm.shoots} onChange={e => setEditForm({ ...editForm, shoots: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none text-sm">
                    <option value="">Select...</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingPlayer(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[#1d1d1f] font-semibold text-sm hover:bg-gray-50 transition">Cancel</button>
                <button onClick={saveEdit} disabled={saving || !editForm.firstName.trim() || !editForm.lastName.trim()}
                  className={"flex-1 py-2.5 rounded-xl font-semibold text-sm transition " + (saving ? "bg-gray-300 text-gray-500" : "bg-[#003e79] text-white hover:bg-[#002d5a]")}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScorekeeperDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Assigned Games" value={8} sub="This weekend" />
        <StatCard label="Completed" value={23} sub="This season" />
        <StatCard label="Next Game" value="Sat 8AM" sub="Rink 1" />
        <StatCard label="Avg Duration" value="52 min" />
      </div>
      <SectionTitle>My Assignments</SectionTitle>
      <Table headers={['Date', 'Time', 'Rink', 'Matchup', 'Division']} rows={[
        ['Sat Feb 15', '8:00 AM', 'Rink 1', 'CT Wolves vs NH Bears', 'Squirt A'],
        ['Sat Feb 15', '10:30 AM', 'Rink 1', 'NJ Devils vs NY Rangers', 'Bantam AA'],
        ['Sat Feb 15', '1:00 PM', 'Rink 2', 'MA Eagles vs RI Storm', 'Peewee A'],
        ['Sun Feb 16', '8:00 AM', 'Rink 1', 'Semifinal 1', 'Squirt A'],
      ]} />
    </div>
  );
}

function RefereeDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Assigned Games" value={6} sub="This weekend" />
        <StatCard label="Completed" value={31} sub="This season" />
        <StatCard label="Next Game" value="Sat 8AM" sub="Rink 1" />
        <StatCard label="Earnings YTD" value="$2,480" />
      </div>
      <SectionTitle>My Schedule</SectionTitle>
      <Table headers={['Date', 'Time', 'Rink', 'Matchup', 'Role']} rows={[
        ['Sat Feb 15', '8:00 AM', 'Rink 1', 'CT Wolves vs NH Bears', 'Center'],
        ['Sat Feb 15', '10:30 AM', 'Rink 2', 'NJ Devils vs NY Rangers', 'Linesman'],
        ['Sat Feb 15', '3:30 PM', 'Rink 1', 'MA Eagles vs RI Storm', 'Center'],
        ['Sun Feb 16', '9:00 AM', 'Rink 1', 'Semifinal 2', 'Center'],
      ]} />
      <SectionTitle>Availability</SectionTitle>
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-4">
        <p className="text-sm mb-2">Spring Showdown (Mar 21-23): <span className="text-green-600 font-medium">Available</span></p>
        <p className="text-sm">Summer Slapshot (Jun 13-15): <span className="text-yellow-600 font-medium">Pending</span></p>
      </div>
    </div>
  );
}

const DASHBOARDS: Record<string, () => JSX.Element> = {
  admin: AdminDash,
  director: DirectorDash,
  organization: OrgDashboard,
  coach: CoachDash,
  manager: ManagerDash,
  parent: ParentDash,
  scorekeeper: ScorekeeperDash,
  referee: RefereeDash,
};

// Roles that skip overview and redirect to a sub-page
const ROLE_REDIRECTS: Record<string, string> = {
  coach: '/dashboard/coach/teams',
  manager: '/dashboard/manager/teams',
};

export default function DashboardContent({ role }: { role: string }) {
  useEffect(() => {
    const redirect = ROLE_REDIRECTS[role];
    if (redirect) {
      window.location.href = redirect;
    }
  }, [role]);

  // If this role redirects, show a brief loading state
  if (ROLE_REDIRECTS[role]) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
      </div>
    );
  }

  const Dashboard = DASHBOARDS[role];

  if (!Dashboard) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-[#6e6e73]">Unknown role: {role}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1d1d1f] mb-6 capitalize">{role} Dashboard</h1>
      <Dashboard />
    </div>
  );
}
