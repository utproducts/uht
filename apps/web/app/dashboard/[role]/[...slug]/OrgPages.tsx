'use client';

import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('uht_token') : null;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

function useOrgId() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  useEffect(() => {
    fetch(`${API}/api/organizations/mine`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => { if (json.success && json.data?.[0]) setOrgId(json.data[0].id); })
      .catch(() => {})
      .finally(() => setOrgLoading(false));
  }, []);
  return { orgId, orgLoading };
}

function NoOrgMessage() {
  return (
    <div className="max-w-md mx-auto py-12 text-center">
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
        <div className="w-16 h-16 bg-[#f0f7ff] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-[#1d1d1f] mb-2">No Organization Found</h2>
        <p className="text-sm text-[#86868b] mb-4">Go to your Organization overview to set up your organization first.</p>
        <a href="/dashboard/organization" className="inline-block px-5 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors">
          Go to Overview
        </a>
      </div>
    </div>
  );
}

// =============================================
// OrgTeams — Full team management
// =============================================
export function OrgTeams() {
  const { orgId, orgLoading } = useOrgId();
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Create team form
  const [newTeam, setNewTeam] = useState({ name: '', ageGroup: '10U', divisionLevel: '', city: '', state: '', headCoachEmail: '', headCoachName: '', managerEmail: '', managerName: '' });
  const [createLoading, setCreateLoading] = useState(false);

  // Invite form
  const [inviteData, setInviteData] = useState({ email: '', name: '', role: 'coach' as 'coach' | 'manager' });
  const [inviteLoading, setInviteLoading] = useState(false);

  const loadTeams = useCallback(() => {
    if (!orgId) return;
    fetch(`${API}/api/organizations/${orgId}/teams-full`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => { if (json.success) setTeams(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { if (orgId) loadTeams(); }, [orgId, loadTeams]);

  const handleCreateTeam = async () => {
    if (!newTeam.name.trim() || !orgId) return;
    setCreateLoading(true);
    try {
      const res = await fetch(`${API}/api/organizations/${orgId}/teams`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(newTeam),
      });
      const json = await res.json();
      if (json.success) {
        setToast({ msg: `Team "${newTeam.name}" created!`, type: 'success' });
        setShowCreate(false);
        setNewTeam({ name: '', ageGroup: '10U', divisionLevel: '', city: '', state: '', headCoachEmail: '', headCoachName: '', managerEmail: '', managerName: '' });
        loadTeams();
      } else {
        setToast({ msg: json.error || 'Failed to create team', type: 'error' });
      }
    } catch { setToast({ msg: 'Network error', type: 'error' }); }
    finally { setCreateLoading(false); }
    setTimeout(() => setToast(null), 3000);
  };

  const handleInviteStaff = async (teamId: string) => {
    if (!inviteData.email.trim() || !orgId) return;
    setInviteLoading(true);
    try {
      const res = await fetch(`${API}/api/organizations/${orgId}/teams/${teamId}/invite-staff`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(inviteData),
      });
      const json = await res.json();
      if (json.success) {
        setToast({ msg: json.linked ? 'User linked to team!' : 'Invite sent!', type: 'success' });
        setShowInvite(null);
        setInviteData({ email: '', name: '', role: 'coach' });
        loadTeams();
      } else {
        setToast({ msg: json.error || 'Failed to send invite', type: 'error' });
      }
    } catch { setToast({ msg: 'Network error', type: 'error' }); }
    finally { setInviteLoading(false); }
    setTimeout(() => setToast(null), 3000);
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (orgLoading || loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
  if (!orgId) return <NoOrgMessage />;

  const ageGroups = ['8U', '10U', '12U', '14U', '16U', '18U', 'Midget', 'Adult'];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl text-sm font-semibold shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{toast.msg}</div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1d1d1f]">Teams</h1>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors">
          + Create Team
        </button>
      </div>

      {/* Create Team Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Create Team</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1">Team Name *</label>
                <input value={newTeam.name} onChange={e => setNewTeam(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. CT Wolves 12U AA" className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1">Age Group *</label>
                  <select value={newTeam.ageGroup} onChange={e => setNewTeam(p => ({ ...p, ageGroup: e.target.value }))}
                    className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm">
                    {ageGroups.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1">Division Level</label>
                  <select value={newTeam.divisionLevel} onChange={e => setNewTeam(p => ({ ...p, divisionLevel: e.target.value }))}
                    className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm">
                    <option value="">Select...</option>
                    {['AAA', 'AA', 'A', 'B', 'C', 'House'].map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1">City</label>
                  <input value={newTeam.city} onChange={e => setNewTeam(p => ({ ...p, city: e.target.value }))}
                    className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1">State</label>
                  <input value={newTeam.state} onChange={e => setNewTeam(p => ({ ...p, state: e.target.value }))}
                    maxLength={2} className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm uppercase" />
                </div>
              </div>

              <div className="border-t border-[#e8e8ed] pt-3 mt-3">
                <p className="text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">Assign Coach (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <input value={newTeam.headCoachName} onChange={e => setNewTeam(p => ({ ...p, headCoachName: e.target.value }))}
                    placeholder="Coach name" className="border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm" />
                  <input value={newTeam.headCoachEmail} onChange={e => setNewTeam(p => ({ ...p, headCoachEmail: e.target.value }))}
                    placeholder="Coach email" type="email" className="border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm" />
                </div>
              </div>

              <div className="border-t border-[#e8e8ed] pt-3">
                <p className="text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">Assign Manager (optional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <input value={newTeam.managerName} onChange={e => setNewTeam(p => ({ ...p, managerName: e.target.value }))}
                    placeholder="Manager name" className="border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm" />
                  <input value={newTeam.managerEmail} onChange={e => setNewTeam(p => ({ ...p, managerEmail: e.target.value }))}
                    placeholder="Manager email" type="email" className="border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm" />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-[#e8e8ed] rounded-xl text-sm font-semibold text-[#6e6e73] hover:bg-[#f5f5f7]">Cancel</button>
              <button onClick={handleCreateTeam} disabled={createLoading}
                className="flex-1 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {createLoading ? 'Creating...' : 'Create Team'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Staff Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowInvite(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Invite Staff</h2>
            <p className="text-sm text-[#6e6e73] mb-4">
              Assign to: <strong>{teams.find(t => t.id === showInvite)?.name}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1">Email *</label>
                <input value={inviteData.email} onChange={e => setInviteData(p => ({ ...p, email: e.target.value }))}
                  type="email" placeholder="coach@example.com" className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1">Name</label>
                <input value={inviteData.name} onChange={e => setInviteData(p => ({ ...p, name: e.target.value }))}
                  placeholder="Full name" className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-1">Role</label>
                <div className="flex gap-2">
                  {(['coach', 'manager'] as const).map(r => (
                    <button key={r} onClick={() => setInviteData(p => ({ ...p, role: r }))}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                        inviteData.role === r ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'}`}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowInvite(null)} className="flex-1 py-2.5 border border-[#e8e8ed] rounded-xl text-sm font-semibold text-[#6e6e73]">Cancel</button>
              <button onClick={() => handleInviteStaff(showInvite)} disabled={inviteLoading}
                className="flex-1 py-2.5 bg-[#003e79] hover:bg-[#002d5a] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {inviteLoading ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Cards */}
      {teams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">No Teams Yet</h3>
          <p className="text-sm text-[#86868b] mb-5">Create your first team to start managing your organization.</p>
          <button onClick={() => setShowCreate(true)}
            className="px-6 py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors">
            Create Your First Team
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {teams.map((team: any) => (
            <div key={team.id} className="bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-[#1d1d1f] text-lg">{team.name}</h3>
                  <p className="text-sm text-[#6e6e73]">
                    {team.age_group}{team.division_level ? ` · ${team.division_level}` : ''}
                    {team.city ? ` · ${team.city}${team.state ? `, ${team.state}` : ''}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-[#f0f7ff] text-[#003e79] rounded-full text-[11px] font-semibold">
                    {team.player_count || 0} players
                  </span>
                  {team.registration_count > 0 && (
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-semibold">
                      {team.registration_count} events
                    </span>
                  )}
                </div>
              </div>

              {/* Staff */}
              <div className="flex flex-wrap gap-2 mb-3">
                {(team.coaches || []).map((c: any) => (
                  <span key={c.user_id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                    {c.coach_role === 'head' ? 'HC' : 'AC'}: {c.first_name} {c.last_name}
                  </span>
                ))}
                {(team.managers || []).map((m: any) => (
                  <span key={m.user_id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium">
                    Mgr: {m.first_name} {m.last_name}
                  </span>
                ))}
                {(team.coaches || []).length === 0 && (team.managers || []).length === 0 && (
                  <span className="text-xs text-[#86868b] italic">No staff assigned</span>
                )}
              </div>

              {/* Upcoming Events */}
              {team.upcomingEvents && team.upcomingEvents.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-[#86868b] uppercase tracking-wider mb-1">Upcoming Events</p>
                  <div className="flex flex-wrap gap-1.5">
                    {team.upcomingEvents.map((ev: any, i: number) => (
                      <span key={i} className="px-2 py-1 bg-[#f5f5f7] rounded text-xs text-[#1d1d1f]">
                        {ev.name} · {new Date(ev.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-[#f0f0f2]">
                <button onClick={() => { setShowInvite(team.id); setInviteData({ email: '', name: '', role: 'coach' }); }}
                  className="px-3 py-2 bg-[#f0f7ff] hover:bg-[#e0efff] text-[#003e79] font-semibold rounded-lg text-xs transition-colors">
                  + Invite Staff
                </button>
                <a href="/events" className="px-3 py-2 bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#6e6e73] font-medium rounded-lg text-xs transition-colors">
                  Register for Event
                </a>
                {team.invite_code && (
                  <button onClick={() => copyCode(team.invite_code, team.id)}
                    className="ml-auto px-3 py-2 bg-[#f5f5f7] hover:bg-[#e8e8ed] rounded-lg text-xs font-mono transition-colors">
                    {copiedId === team.id ? 'Copied!' : `Code: ${team.invite_code}`}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================
// OrgCoaches — Staff management across all teams
// =============================================
export function OrgCoaches() {
  const { orgId, orgLoading } = useOrgId();
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    fetch(`${API}/api/organizations/${orgId}/staff`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => { if (json.success) setStaff(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  if (orgLoading || loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
  if (!orgId) return <NoOrgMessage />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1d1d1f]">Coaches & Managers</h1>
        <a href="/dashboard/organization/teams"
          className="px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors">
          + Invite from Teams
        </a>
      </div>

      {staff.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">No Staff Assigned</h3>
          <p className="text-sm text-[#86868b]">Go to the Teams page to invite coaches and managers to your teams.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-left text-[#6e6e73]">
              <tr>
                <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Name</th>
                <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Email</th>
                <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Phone</th>
                <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Teams & Roles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f2]">
              {staff.map((person: any) => (
                <tr key={person.id} className="hover:bg-[#fafafa]">
                  <td className="px-5 py-3.5 font-semibold text-[#1d1d1f]">{person.firstName} {person.lastName}</td>
                  <td className="px-5 py-3.5 text-[#6e6e73]">{person.email}</td>
                  <td className="px-5 py-3.5 text-[#6e6e73]">{person.phone || '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {person.teams.map((t: any, i: number) => (
                        <span key={i} className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          t.role.includes('coach') ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                        }`}>
                          {t.teamName} ({t.role})
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================
// OrgRosters — All players across org teams
// =============================================
export function OrgRosters() {
  const { orgId, orgLoading } = useOrgId();
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeam, setFilterTeam] = useState('all');

  useEffect(() => {
    if (!orgId) return;
    fetch(`${API}/api/organizations/${orgId}/rosters`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => { if (json.success) setPlayers(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  if (orgLoading || loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
  if (!orgId) return <NoOrgMessage />;

  // Group by team
  const teamNames = Array.from(new Set(players.map((p: any) => p.team_name)));
  const filtered = filterTeam === 'all' ? players : players.filter((p: any) => p.team_name === filterTeam);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Rosters</h1>
          <p className="text-sm text-[#6e6e73] mt-0.5">{players.length} players across {teamNames.length} teams</p>
        </div>
      </div>

      {teamNames.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilterTeam('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filterTeam === 'all' ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'}`}>
            All Teams ({players.length})
          </button>
          {teamNames.map(tn => (
            <button key={tn} onClick={() => setFilterTeam(tn)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filterTeam === tn ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed]'}`}>
              {tn} ({players.filter((p: any) => p.team_name === tn).length})
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">No Players</h3>
          <p className="text-sm text-[#86868b]">Add players to your teams via roster import on the team page.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <table className="w-full text-sm">
            <thead className="bg-[#fafafa] text-left text-[#6e6e73]">
              <tr>
                <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">#</th>
                <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Name</th>
                <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Position</th>
                <th className="px-5 py-3 font-medium text-xs uppercase tracking-wider">Team</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f2]">
              {filtered.map((p: any) => (
                <tr key={`${p.id}-${p.team_id}`} className="hover:bg-[#fafafa]">
                  <td className="px-5 py-3 font-mono text-[#6e6e73]">{p.jersey_number || '—'}</td>
                  <td className="px-5 py-3 font-semibold text-[#1d1d1f]">{p.first_name} {p.last_name}</td>
                  <td className="px-5 py-3 text-[#6e6e73] capitalize">{p.position || '—'}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 bg-[#f5f5f7] rounded text-xs font-medium text-[#1d1d1f]">{p.team_name} ({p.age_group})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================
// OrgEvents — Events the org teams are registered for
// =============================================
export function OrgEvents() {
  const { orgId, orgLoading } = useOrgId();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    fetch(`${API}/api/organizations/${orgId}/events`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(json => { if (json.success) setEvents(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  if (orgLoading || loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>;
  if (!orgId) return <NoOrgMessage />;

  const now = new Date().toISOString().split('T')[0];
  const upcoming = events.filter(e => e.end_date >= now);
  const past = events.filter(e => e.end_date < now);

  const EventCard = ({ evt, isPast }: { evt: any; isPast?: boolean }) => {
    const startDate = new Date(evt.start_date + 'T12:00:00');
    const endDate = new Date(evt.end_date + 'T12:00:00');
    const dateStr = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    return (
      <div className={`bg-white rounded-2xl border border-[#e8e8ed] p-5 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] ${isPast ? 'opacity-70' : ''}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {evt.logo_url ? (
              <img src={evt.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-[#003e79] flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(evt.name || '?')[0]}
              </div>
            )}
            <div>
              <h3 className="font-bold text-[#1d1d1f]">{evt.name}</h3>
              <p className="text-sm text-[#6e6e73]">{evt.city}, {evt.state} · {dateStr}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="px-2.5 py-1 bg-[#f0f7ff] text-[#003e79] rounded-full text-[11px] font-semibold">
              {evt.teams_registered} team{evt.teams_registered !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Per-team breakdown */}
        {evt.teamRegistrations && evt.teamRegistrations.length > 0 && (
          <div className="border-t border-[#f0f0f2] pt-3 space-y-2">
            {evt.teamRegistrations.map((tr: any) => (
              <div key={tr.team_id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[#1d1d1f]">{tr.team_name}</span>
                  <span className="text-xs text-[#86868b]">{tr.age_group}</span>
                  {tr.division_age && (
                    <span className="px-1.5 py-0.5 bg-[#f5f5f7] rounded text-[10px] text-[#6e6e73]">
                      {tr.division_age} {tr.division_level}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    tr.reg_status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                    tr.reg_status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-[#f5f5f7] text-[#6e6e73]'
                  }`}>{tr.reg_status}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    tr.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                  }`}>{tr.payment_status || 'unpaid'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1d1d1f]">Events</h1>
        <a href="/events" className="px-4 py-2 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors">
          Browse Events
        </a>
      </div>

      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider mb-3">Upcoming ({upcoming.length})</h2>
          <div className="grid gap-4">
            {upcoming.map(evt => <EventCard key={evt.id} evt={evt} />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider mb-3">Past Events</h2>
          <div className="grid gap-4">
            {past.slice(0, 10).map(evt => <EventCard key={evt.id} evt={evt} isPast />)}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">No Events Yet</h3>
          <p className="text-sm text-[#86868b] mb-5">Register your teams for tournaments to see them here.</p>
          <a href="/events" className="inline-block px-6 py-3 bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold rounded-xl text-sm transition-colors">
            Browse Events
          </a>
        </div>
      )}
    </div>
  );
}
