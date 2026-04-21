'use client';

import { useState, useEffect } from 'react';

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
                      <span className="text-xs text-[#6e6e73]">{r.division_age_group} {r.division_level}</span>
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

function DirectorDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Upcoming Events" value={4} sub="Next 60 days" />
        <StatCard label="Teams Registered" value={186} sub="Across all events" />
        <StatCard label="Venues Booked" value={8} sub="2 pending" />
        <StatCard label="Staff Assigned" value={42} sub="Refs + scorekeepers" />
      </div>
      <SectionTitle>Event Pipeline</SectionTitle>
      <Table headers={['Event', 'Date', 'Teams', 'Status']} rows={[
        ['Presidents Day Classic', 'Feb 14-16', '48/48', 'Full'],
        ['Spring Showdown', 'Mar 21-23', '32/64', 'Open'],
        ['Summer Slapshot', 'Jun 13-15', '0/48', 'Coming Soon'],
      ]} />
      <SectionTitle>Venue Capacity</SectionTitle>
      <CapBar label="Bridgeport Ice Arena" cur={6} max={8} />
      <CapBar label="Twin Rinks Stamford" cur={4} max={6} />
      <CapBar label="Shelton Rink" cur={2} max={4} />
    </div>
  );
}

function OrgDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Teams" value={6} sub="3 divisions" />
        <StatCard label="Registered Events" value={4} sub="2 upcoming" />
        <StatCard label="Total Players" value={94} sub="Across all teams" />
        <StatCard label="Balance Due" value="$4,200" sub="Next payment Apr 1" />
      </div>
      <SectionTitle>Team Roster</SectionTitle>
      <Table headers={['Team', 'Division', 'Players', 'Next Event']} rows={[
        ['CT Wolves U12 A', 'Squirt A', '15', 'Presidents Day Classic'],
        ['CT Wolves U14 AA', 'Bantam AA', '17', 'Presidents Day Classic'],
        ['CT Wolves U10 B', 'Mite B', '14', 'Spring Showdown'],
      ]} />
    </div>
  );
}

function CoachDash() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Get team IDs from localStorage (created via Create Team page)
        const localTeams = JSON.parse(localStorage.getItem('uht_teams') || '[]');
        const ids = localTeams.map((t: any) => t.id).filter(Boolean);

        if (ids.length > 0) {
          const res = await fetch(`https://uht.chad-157.workers.dev/api/teams/by-ids?ids=${ids.join(',')}`);
          const json = await res.json();
          if (json.success && json.data.length > 0) {
            setTeams(json.data);
            setLoading(false);
            return;
          }
        }

        // Fallback: show localStorage data directly
        if (localTeams.length > 0) {
          setTeams(localTeams);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Teams" value={teams.length} />
        <StatCard label="Upcoming Events" value={0} sub="Register from Events page" />
        <StatCard label="Players" value={0} sub="Add via USA Hockey" />
        <StatCard label="Balance" value="$0" sub="No outstanding fees" />
      </div>

      {/* My Teams */}
      <div className="flex items-center justify-between">
        <SectionTitle>My Teams</SectionTitle>
        <a href="/create-team" className="px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full text-sm transition-all active:scale-[0.98]">
          + Create Team
        </a>
      </div>

      {teams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">No Teams Yet</h3>
          <p className="text-sm text-[#86868b] mb-5">Create your first team to start registering for tournaments.</p>
          <a href="/create-team" className="inline-block px-6 py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-full text-sm transition-all active:scale-[0.98]">
            Create Your First Team
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((team: any) => (
            <div key={team.id} className="bg-white rounded-2xl border border-[#e8e8ed] p-5 hover:shadow-[0_4px_20px_-6px_rgba(0,62,121,0.12)] transition-all shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-[#1d1d1f] text-lg">{team.name}</h3>
                  <p className="text-sm text-[#6e6e73] mt-0.5">
                    {team.age_group}{team.division_level ? ` · ${team.division_level}` : ''}
                  </p>
                </div>
                {team.usa_hockey_team_id && (
                  <span className="text-[10px] font-semibold px-2 py-1 bg-blue-50 text-blue-600 rounded-full">USA Hockey</span>
                )}
              </div>

              {(team.city || team.state) && (
                <p className="text-sm text-[#6e6e73] mb-2">
                  📍 {[team.city, team.state].filter(Boolean).join(', ')}
                </p>
              )}

              {team.head_coach_name && (
                <p className="text-sm text-[#6e6e73] mb-1">
                  🧑‍🏫 Coach: <span className="font-medium text-[#1d1d1f]">{team.head_coach_name}</span>
                </p>
              )}

              {team.season_record && (
                <p className="text-sm text-[#6e6e73] mb-1">
                  📊 Record: <span className="font-medium text-[#1d1d1f]">{team.season_record}</span>
                </p>
              )}

              {team.hometown_league && (
                <p className="text-sm text-[#6e6e73] mb-1">
                  🏟️ League: <span className="font-medium text-[#1d1d1f]">{team.hometown_league}</span>
                </p>
              )}

              <div className="flex gap-2 mt-4">
                <a href="/events" className="flex-1 text-center px-3 py-2 bg-[#f0f7ff] hover:bg-[#e0efff] text-[#003e79] font-semibold rounded-lg text-xs transition-colors">
                  Register for Event
                </a>
                <button className="px-3 py-2 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#6e6e73] font-medium rounded-lg text-xs transition-colors">
                  Edit Team
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Links */}
      <SectionTitle>Quick Actions</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Browse Events', href: '/events' },
          { label: 'Create Team', href: '/create-team' },
          { label: 'My Schedule', href: '/dashboard/coach/schedule' },
          { label: 'My Roster', href: '/dashboard/coach/roster' },
        ].map(a => (
          <a key={a.label} href={a.href} className="bg-white rounded-2xl border border-[#e8e8ed] p-4 hover:shadow-[0_4px_20px_-6px_rgba(0,62,121,0.12)] hover:-translate-y-0.5 transition-all text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
            <div className="text-sm font-semibold text-[#003e79]">{a.label}</div>
          </a>
        ))}
      </div>
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

function ParentDash() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Player" value="Jake Thompson" sub="#9 - Center" />
        <StatCard label="Next Game" value="Sat 9AM" sub="vs NJ Devils U14" />
        <StatCard label="Events" value={2} sub="Registered" />
        <StatCard label="Balance" value="$0" sub="All paid" />
      </div>
      <SectionTitle>Upcoming Schedule</SectionTitle>
      <Table headers={['Date', 'Time', 'Event', 'Opponent', 'Rink']} rows={[
        ['Sat Feb 15', '9:00 AM', 'Presidents Day', 'NJ Devils U14', 'Rink 2'],
        ['Sat Feb 15', '3:30 PM', 'Presidents Day', 'NY Rangers U14', 'Rink 1'],
        ['Sun Feb 16', '11:00 AM', 'Presidents Day', 'TBD', 'TBD'],
      ]} />
      <SectionTitle>Hotel Info</SectionTitle>
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-4">
        <p className="font-medium text-sm">Courtyard by Marriott Shelton</p>
        <p className="text-sm text-[#6e6e73]">780 Bridgeport Ave, Shelton CT</p>
        <p className="text-sm text-[#00ccff] mt-1">Block rate: $139/night - Code: UHT2025</p>
      </div>
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
  organization: OrgDash,
  coach: CoachDash,
  manager: ManagerDash,
  parent: ParentDash,
  scorekeeper: ScorekeeperDash,
  referee: RefereeDash,
};

export default function DashboardContent({ role }: { role: string }) {
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
