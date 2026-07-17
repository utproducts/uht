'use client';

import { useParams, useSearchParams } from 'next/navigation';
// NOTE: useSearchParams is only used inside EventsWithSearchParams (isolated in its own Suspense)
// to prevent blocking other pages like teams from rendering
import { useState, useEffect, useCallback, Suspense } from 'react';
import RosterImport from '../../../components/RosterImport';
import { OrgTeams, OrgCoaches, OrgRosters, OrgEvents } from './OrgPages';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('uht_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ==================
// Coach: My Teams
// ==================
function CoachTeams({ role = 'coach' }: { role?: string }) {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [rosterLinkCopied, setRosterLinkCopied] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadTeams = useCallback(() => {
    const token = localStorage.getItem('uht_token');
    if (token && !token.startsWith('mock-')) {
      fetch(`${API}/api/teams/my-teams`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(json => { if (json.success && json.data?.length > 0) setTeams(json.data); else if (json.success) setTeams([]); })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      const stored = localStorage.getItem('uht_teams');
      if (stored) { try { setTeams(JSON.parse(stored)); } catch {} }
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTeams(); }, [loadTeams]);

  // Auto-accept pending invites on mount
  useEffect(() => {
    const token = localStorage.getItem('uht_token');
    if (token && !token.startsWith('mock-')) {
      fetch(`${API}/api/teams/invites/accept-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
        .then(r => r.json())
        .then(json => { if (json.success && json.linked > 0) loadTeams(); })
        .catch(() => {});
    }
  }, [loadTeams]);

  const handleJoinTeam = async () => {
    if (!joinCode.trim()) return;
    setJoinLoading(true);
    setJoinMsg(null);
    try {
      const token = localStorage.getItem('uht_token');
      const res = await fetch(`${API}/api/teams/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: joinCode.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setJoinMsg({ type: 'success', text: json.message || `Joined ${json.data?.teamName}!` });
        setJoinCode('');
        loadTeams();
        setTimeout(() => setShowJoinModal(false), 1500);
      } else {
        setJoinMsg({ type: 'error', text: json.error || 'Failed to join team' });
      }
    } catch {
      setJoinMsg({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setJoinLoading(false);
    }
  };

  const copyInviteCode = (code: string, teamId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(teamId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteTeam = async () => {
    if (!deleteConfirm) return;
    setDeleteLoading(true);
    try {
      const token = localStorage.getItem('uht_token');
      const res = await fetch(`${API}/api/teams/${deleteConfirm.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setDeleteConfirm(null);
        loadTeams();
      } else {
        alert(json.error || 'Failed to delete team');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><span className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1d1d1f]">My Teams</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => { setShowJoinModal(true); setJoinMsg(null); setJoinCode(''); }}
            className="px-4 py-2 rounded-xl bg-white border border-[#e8e8ed] text-[#003e79] text-sm font-semibold hover:bg-[#f5f5f7] transition">
            Join a Team
          </button>
          <a href="/create-team" className="px-4 py-2 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
            + Create Team
          </a>
        </div>
      </div>

      {/* Join Team Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowJoinModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#1d1d1f] mb-1">Join a Team</h3>
            <p className="text-sm text-[#6e6e73] mb-4">Enter the team invite code shared by your coach or manager.</p>
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABC123"
              maxLength={10}
              className="w-full px-4 py-3 border border-[#d2d2d7] rounded-xl text-center text-2xl font-mono font-bold tracking-[0.3em] text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleJoinTeam(); }}
            />
            {joinMsg && (
              <p className={`mt-3 text-sm font-medium ${joinMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {joinMsg.text}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowJoinModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#e8e8ed] text-sm font-semibold text-[#6e6e73] hover:bg-[#f5f5f7] transition">
                Cancel
              </button>
              <button onClick={handleJoinTeam} disabled={joinLoading || !joinCode.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition disabled:opacity-50">
                {joinLoading ? 'Joining...' : 'Join Team'}
              </button>
            </div>
          </div>
        </div>
      )}

      {teams.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-12 text-center">
          <div className="w-16 h-16 bg-[#f0f7ff] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-[#1d1d1f]">No teams yet</h3>
          <p className="mt-2 text-sm text-[#6e6e73]">Create your first team or join one with an invite code.</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <button onClick={() => { setShowJoinModal(true); setJoinMsg(null); setJoinCode(''); }}
              className="px-6 py-2.5 rounded-xl border border-[#e8e8ed] text-[#003e79] text-sm font-semibold hover:bg-[#f5f5f7] transition">
              Join a Team
            </button>
            <a href="/create-team" className="px-6 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
              Create a Team
            </a>
          </div>
        </div>
      ) : (
        <div className="grid gap-5">
          {teams.map((team: any) => {
            const playerCount = team.player_count ?? 0;
            const regEvents = team.registered_events || [];
            const now = new Date().toISOString().split('T')[0];
            const upcomingEvents = regEvents.filter((e: any) => e.end_date >= now);
            const pastEvents = regEvents.filter((e: any) => e.end_date < now);

            return (
              <div key={team.id} className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
                {/* Team header */}
                <div className="p-5 flex items-start gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-[#003e79] to-[#005599] rounded-xl flex items-center justify-center text-white font-bold text-xl shrink-0 shadow-sm">
                    {(team.name || '?')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-[#1d1d1f] truncate">{team.name}</h3>
                    <p className="text-sm text-[#6e6e73] mt-0.5">
                      {team.age_group || team.ageGroup || ''}{team.division_level ? ` · ${team.division_level}` : ''}
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {team.city && (
                        <span className="text-xs text-[#86868b] flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          {team.city}{team.state ? `, ${team.state}` : ''}
                        </span>
                      )}
                      {team.head_coach_name && (
                        <span className="text-xs text-[#86868b] flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          {team.head_coach_name}
                        </span>
                      )}
                      {team.hometown_league && (
                        <span className="text-xs text-[#86868b] flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" /></svg>
                          {team.hometown_league}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <span className="text-lg font-bold text-[#1d1d1f]">{playerCount}</span>
                    </div>
                    <p className="text-[11px] text-[#86868b] mt-0.5">{playerCount === 1 ? 'player' : 'players'}</p>
                    {regEvents.length > 0 && (
                      <p className="text-[11px] text-[#003e79] font-medium mt-1">{regEvents.length} event{regEvents.length !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>

                {/* Registered Events */}
                {regEvents.length > 0 && (
                  <div className="border-t border-[#f0f0f2] px-5 py-3">
                    <p className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider mb-2">Registered Events</p>
                    <div className="space-y-2">
                      {upcomingEvents.map((ev: any) => {
                        const startDt = ev.start_date ? new Date(ev.start_date + 'T12:00:00') : null;
                        const statusColors: Record<string, string> = {
                          approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                          pending: 'bg-amber-50 text-amber-700 border-amber-200',
                          awaiting_payment: 'bg-blue-50 text-blue-700 border-blue-200',
                        };
                        const statusLabel: Record<string, string> = {
                          approved: 'Approved',
                          pending: 'Pending',
                          awaiting_payment: 'Awaiting Payment',
                        };
                        return (
                          <a key={ev.reg_id} href={`/dashboard/${role}/events/?id=${ev.event_id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f5f5f7] transition group">
                            {ev.logo_url ? (
                              <img src={ev.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-[#003e79]/10 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#1d1d1f] truncate group-hover:text-[#003e79] transition">{ev.event_name}</p>
                              <p className="text-xs text-[#86868b]">
                                {ev.city}, {ev.state}
                                {startDt && ` · ${startDt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${statusColors[ev.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                              {statusLabel[ev.status] || ev.status}
                            </span>
                          </a>
                        );
                      })}
                      {pastEvents.length > 0 && (
                        <p className="text-[11px] text-[#86868b] pl-2">{pastEvents.length} past event{pastEvents.length !== 1 ? 's' : ''}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="border-t border-[#f0f0f2] bg-[#fafafa] px-5 py-3 flex items-center gap-2 flex-wrap">
                  <a href={`/dashboard/${role}/roster?team=${team.id}`}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#003e79] text-white text-xs font-semibold hover:bg-[#002d5a] transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    {playerCount > 0 ? 'View Roster' : 'Add Roster'}
                  </a>
                  <a href="/events"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#f0f7ff] text-[#003e79] text-xs font-semibold hover:bg-[#e0efff] transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Register for Event
                  </a>
                  <a href={`/create-team?edit=${team.id}&from=/dashboard/${role}/teams`}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-[#e8e8ed] text-[#6e6e73] text-xs font-semibold hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Edit Team
                  </a>
                  <button onClick={() => setDeleteConfirm({ id: team.id, name: team.name })}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50 hover:text-red-700 transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Delete
                  </button>
                  {team.invite_code && (
                    <button onClick={() => copyInviteCode(team.invite_code, team.id)}
                      className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-dashed border-[#d2d2d7] text-[#86868b] text-xs font-semibold hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      {copiedId === team.id ? 'Copied!' : `Coach Code: ${team.invite_code}`}
                    </button>
                  )}
                  {(team.parent_invite_code || team.invite_code) && (
                    <button onClick={() => {
                      const code = team.parent_invite_code || team.invite_code;
                      const msg = `Follow ${team.name} (${team.age_group}) on Ultimate Hockey Tournaments!\n\nDownload the app and use team code: ${code}\n\nhttps://apps.apple.com/app/id6786085393`;
                      navigator.clipboard.writeText(msg);
                      setRosterLinkCopied(team.id);
                      setTimeout(() => setRosterLinkCopied(null), 2500);
                    }}
                      className={"flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition " +
                        (rosterLinkCopied === team.id ? "bg-green-100 text-green-700 border border-green-300" : "bg-green-50 border border-green-200 text-green-700 hover:bg-green-100")}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                      {rosterLinkCopied === team.id ? 'Copied!' : `Parent Code: ${team.parent_invite_code || team.invite_code}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !deleteLoading && setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">Delete Team?</h3>
              <p className="text-sm text-[#6e6e73]">
                Are you sure you want to delete <span className="font-semibold text-[#1d1d1f]">{deleteConfirm.name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="border-t border-[#f0f0f2] p-4 flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#f5f5f7] text-[#1d1d1f] text-sm font-semibold hover:bg-[#e8e8ed] transition disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={handleDeleteTeam}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50">
                {deleteLoading ? 'Deleting...' : 'Delete Team'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================
// Coach/Manager: Events
// ==================
function RoleEvents({ role }: { role: string }) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('uht_token');
    if (!token) { setLoading(false); return; }

    fetch(`${API}/api/events/my-registered`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => {
        if (json.success) setEvents(json.data || []);
        else if (Array.isArray(json)) setEvents(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><span className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" /></div>;

  const now = new Date().toISOString().split('T')[0];
  const upcoming = events.filter(e => e.end_date >= now);
  const past = events.filter(e => e.end_date < now);

  const EventCard = ({ ev, isPast }: { ev: any; isPast?: boolean }) => (
    <a key={ev.id} href={`/dashboard/${role}/events/?id=${ev.id}`} className={`bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5 hover:shadow-md transition block ${isPast ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-4">
        {ev.logo_url ? (
          <img src={ev.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-[#003e79] flex items-center justify-center text-white font-bold text-sm shrink-0">
            {(ev.name || '?')[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[#1d1d1f] truncate">{ev.name}</h3>
          <p className="text-sm text-[#6e6e73] mt-0.5">
            {ev.city}, {ev.state}
            {ev.start_date && ` · ${new Date(ev.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(ev.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
          </p>
          {ev.team_names && <p className="text-xs text-[#86868b] mt-0.5">{ev.team_names}</p>}
        </div>
        {!isPast && <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 shrink-0">Upcoming</span>}
      </div>
    </a>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1d1d1f]">My Events</h1>

      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider mb-3">Upcoming</h2>
          <div className="grid gap-3">
            {upcoming.map((ev: any) => <EventCard key={ev.id} ev={ev} />)}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider mb-3">Past Events</h2>
          <div className="grid gap-3">
            {past.slice(0, 10).map((ev: any) => <EventCard key={ev.id} ev={ev} isPast />)}
          </div>
        </div>
      )}

      {events.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-12 text-center">
          <div className="w-16 h-16 bg-[#f0f7ff] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-[#1d1d1f]">No registered events</h3>
          <p className="mt-2 text-sm text-[#6e6e73]">Register a team for a tournament to see it here.</p>
          <a href="/events" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
            Browse Events
          </a>
        </div>
      )}
    </div>
  );
}

// ==================
// Roster Management (Coach/Manager/Org)
// ==================
function RosterManagement() {
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);

  // Import states
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // Add player form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '' });

  // Edit player
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Staff invite
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffRole, setStaffRole] = useState<'coach' | 'manager'>('coach');
  const [staffForm, setStaffForm] = useState({ name: '', email: '', phone: '' });
  const [staffInviting, setStaffInviting] = useState(false);
  const [staffMsg, setStaffMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load teams
  useEffect(() => {
    const token = localStorage.getItem('uht_token');
    if (!token || token.startsWith('mock-')) { setLoading(false); return; }

    fetch(`${API}/api/teams/my-teams`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.length > 0) {
          setTeams(json.data);
          // Check for ?team= query param to pre-select correct team
          const params = new URLSearchParams(window.location.search);
          const teamParam = params.get('team');
          if (teamParam && json.data.some((t: any) => t.id === teamParam)) {
            setSelectedTeamId(teamParam);
          } else {
            setSelectedTeamId(json.data[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load roster when team changes
  const loadRoster = useCallback(async (teamId: string) => {
    if (!teamId) return;
    setRosterLoading(true);
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/roster`, { headers: getAuthHeaders() });
      const json = await res.json() as any;
      if (json.success) setPlayers(json.data || []);
    } catch {}
    setRosterLoading(false);
  }, []);

  useEffect(() => {
    if (selectedTeamId) loadRoster(selectedTeamId);
  }, [selectedTeamId, loadRoster]);

  const handleImportUrl = async () => {
    if (!importUrl.trim() || !selectedTeamId) return;
    setImporting(true);
    setImportMsg('');
    try {
      const res = await fetch(`${API}/api/teams/${selectedTeamId}/import-roster`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json() as any;
      if (data.success) {
        setImportMsg(`Imported ${data.data.added} players!`);
        setImportUrl('');
        loadRoster(selectedTeamId);
      } else {
        setImportMsg(data.error || 'Import failed');
      }
    } catch { setImportMsg('Network error'); }
    setImporting(false);
  };

  const handlePasteImport = async () => {
    if (!pastedText.trim() || !selectedTeamId) return;
    setImporting(true);
    setImportMsg('');
    try {
      const res = await fetch(`${API}/api/teams/${selectedTeamId}/import-roster`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ pastedData: pastedText }),
      });
      const data = await res.json() as any;
      if (data.success) {
        setImportMsg(`Imported ${data.data.added} players!`);
        setPastedText('');
        setPasteMode(false);
        loadRoster(selectedTeamId);
      } else {
        setImportMsg(data.error || 'Import failed');
      }
    } catch { setImportMsg('Network error'); }
    setImporting(false);
  };

  const handleAddPlayer = async () => {
    if (!newPlayer.firstName.trim() || !newPlayer.lastName.trim() || !selectedTeamId) return;
    try {
      const res = await fetch(`${API}/api/teams/${selectedTeamId}/players`, {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify(newPlayer),
      });
      const data = await res.json() as any;
      if (data.success) {
        setNewPlayer({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '' });
        setShowAddForm(false);
        loadRoster(selectedTeamId);
      }
    } catch {}
  };

  const handleRemovePlayer = async (playerId: string) => {
    if (!selectedTeamId) return;
    try {
      await fetch(`${API}/api/teams/${selectedTeamId}/players/${playerId}`, {
        method: 'DELETE', headers: getAuthHeaders(),
      });
      setPlayers(prev => prev.filter(p => p.id !== playerId));
    } catch {}
  };

  const handleEditSave = async (playerId: string) => {
    try {
      await fetch(`${API}/api/teams/${selectedTeamId}/players/${playerId}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify(editForm),
      });
      setEditingId(null);
      loadRoster(selectedTeamId);
    } catch {}
  };

  const startEdit = (p: any) => {
    setEditingId(p.id);
    setEditForm({
      first_name: p.first_name, last_name: p.last_name,
      jersey_number: p.jersey_number || '', position: p.position || '',
      shoots: p.shoots || '',
    });
  };

  const handleStaffInvite = async () => {
    if (!staffForm.name.trim() || !staffForm.email.trim() || !selectedTeamId) return;
    setStaffInviting(true);
    setStaffMsg(null);
    try {
      const res = await fetch(`${API}/api/teams/invite-staff/${selectedTeamId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: staffForm.name.trim(), email: staffForm.email.trim(), role: staffRole }),
      });
      const json = await res.json() as any;
      if (json.success) {
        setStaffMsg({ type: 'success', text: `${staffRole === 'coach' ? 'Coach' : 'Manager'} invited! They'll receive an email.` });
        setStaffForm({ name: '', email: '', phone: '' });
        // Reload teams to refresh coaches/managers lists
        const token = localStorage.getItem('uht_token');
        if (token && !token.startsWith('mock-')) {
          const r = await fetch(`${API}/api/teams/my-teams`, { headers: { Authorization: `Bearer ${token}` } });
          const d = await r.json() as any;
          if (d.success && d.data) setTeams(d.data);
        }
        setTimeout(() => { setShowStaffModal(false); setStaffMsg(null); }, 1500);
      } else {
        setStaffMsg({ type: 'error', text: json.error || 'Failed to invite' });
      }
    } catch {
      setStaffMsg({ type: 'error', text: 'Network error' });
    } finally {
      setStaffInviting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><span className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" /></div>;

  const selectedTeam = teams.find(t => t.id === selectedTeamId);

  if (teams.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-12 text-center">
        <div className="w-16 h-16 bg-[#f0f7ff] rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </div>
        <h3 className="text-lg font-semibold text-[#1d1d1f]">No teams yet</h3>
        <p className="mt-2 text-sm text-[#6e6e73]">Create a team first to manage your roster.</p>
        <a href="/create-team" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
          Create a Team
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1d1d1f]">Roster Management</h1>
          <p className="text-sm text-[#6e6e73] mt-0.5">Manage your team&apos;s player roster</p>
        </div>
        <div className="flex items-center gap-3">
          {teams.length > 1 && (
            <select value={selectedTeamId} onChange={e => { setSelectedTeamId(e.target.value); setShowImport(false); setShowAddForm(false); setEditingId(null); }}
              className="px-4 py-2 rounded-xl border border-[#e8e8ed] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#003e79]/20">
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Team info bar */}
      {selectedTeam && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-[#003e79] rounded-xl flex items-center justify-center text-white font-bold shrink-0">
            {(selectedTeam.name || '?')[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[#1d1d1f] truncate">{selectedTeam.name}</h3>
            <p className="text-xs text-[#6e6e73]">{selectedTeam.age_group || ''} {selectedTeam.division_level ? `· ${selectedTeam.division_level}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#1d1d1f]">{players.length} players</span>
            <button onClick={() => { setShowImport(!showImport); setShowAddForm(false); }}
              className="px-4 py-2 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
              + Add Players
            </button>
          </div>
        </div>
      )}

      {/* Import panel */}
      {showImport && selectedTeamId && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5 space-y-4">
          <h3 className="text-lg font-semibold text-[#1d1d1f]">Add Players</h3>
          <RosterImport
            teamId={selectedTeamId}
            onPlayersAdded={() => loadRoster(selectedTeamId)}
          />
        </div>
      )}

      {/* Roster table */}
      {rosterLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="animate-spin h-6 w-6 border-2 border-[#003e79] border-t-transparent rounded-full" />
        </div>
      ) : players.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left border-b border-[#e8e8ed]">
                  <th className="px-4 py-3 font-semibold text-[#6e6e73] w-14">#</th>
                  <th className="px-4 py-3 font-semibold text-[#6e6e73]">Player</th>
                  <th className="px-4 py-3 font-semibold text-[#6e6e73]">Position</th>
                  <th className="px-4 py-3 font-semibold text-[#6e6e73]">Shoots</th>
                  <th className="px-4 py-3 font-semibold text-[#6e6e73]">Parent / Guardian</th>
                  <th className="px-4 py-3 font-semibold text-[#6e6e73] w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p: any) => (
                  editingId === p.id ? (
                    <tr key={p.id} className="border-t border-[#e8e8ed] bg-blue-50/30">
                      <td className="px-4 py-2">
                        <input type="text" value={editForm.jersey_number} onChange={e => setEditForm((f: any) => ({ ...f, jersey_number: e.target.value }))}
                          className="w-12 px-2 py-1 rounded border border-gray-300 text-sm text-center" />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <input type="text" value={editForm.first_name} onChange={e => setEditForm((f: any) => ({ ...f, first_name: e.target.value }))}
                            className="flex-1 px-2 py-1 rounded border border-gray-300 text-sm" placeholder="First" />
                          <input type="text" value={editForm.last_name} onChange={e => setEditForm((f: any) => ({ ...f, last_name: e.target.value }))}
                            className="flex-1 px-2 py-1 rounded border border-gray-300 text-sm" placeholder="Last" />
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <select value={editForm.position} onChange={e => setEditForm((f: any) => ({ ...f, position: e.target.value }))}
                          className="px-2 py-1 rounded border border-gray-300 text-sm bg-white">
                          <option value="">--</option>
                          <option value="forward">Forward</option>
                          <option value="defense">Defense</option>
                          <option value="goalie">Goalie</option>
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select value={editForm.shoots} onChange={e => setEditForm((f: any) => ({ ...f, shoots: e.target.value }))}
                          className="px-2 py-1 rounded border border-gray-300 text-sm bg-white">
                          <option value="">--</option>
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                        </select>
                      </td>
                      <td className="px-4 py-2 text-xs text-[#6e6e73]">{p.parent_name || '—'}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => handleEditSave(p.id)} className="px-2 py-1 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700">Save</button>
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded bg-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-300">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={p.id} className="border-t border-[#e8e8ed] hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-medium text-[#1d1d1f]">{p.jersey_number || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-[#1d1d1f]">{p.first_name} {p.last_name}</span>
                      </td>
                      <td className="px-4 py-3 text-[#6e6e73] capitalize">{p.position || '—'}</td>
                      <td className="px-4 py-3 text-[#6e6e73] capitalize">{p.shoots || '—'}</td>
                      <td className="px-4 py-3">
                        {p.parent_name ? (
                          <div>
                            <p className="text-[#1d1d1f] text-xs font-medium">{p.parent_name}</p>
                            {p.parent_email && <p className="text-[#6e6e73] text-[11px]">{p.parent_email}</p>}
                            {p.parent_phone && <p className="text-[#86868b] text-[11px]">{p.parent_phone}</p>}
                          </div>
                        ) : (
                          <span className="text-[#c7c7cc] text-xs italic">Not claimed</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(p)} className="px-2 py-1 rounded text-xs font-medium text-[#003e79] hover:bg-[#f0f7ff] transition">Edit</button>
                          <button onClick={() => handleRemovePlayer(p.id)} className="px-2 py-1 rounded text-xs font-medium text-red-500 hover:bg-red-50 transition">Remove</button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-50 px-4 py-2 border-t border-[#e8e8ed] text-xs text-[#86868b]">
            {players.filter((p: any) => p.position === 'forward').length} forwards · {players.filter((p: any) => p.position === 'defense').length} defense · {players.filter((p: any) => p.position === 'goalie').length} goalies
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-12 text-center">
          <div className="w-16 h-16 bg-[#f0f7ff] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-[#1d1d1f]">No players on roster</h3>
          <p className="mt-2 text-sm text-[#6e6e73]">Paste a roster, upload a file, or add players manually.</p>
          <button onClick={() => setShowImport(true)}
            className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
            Add Players
          </button>
        </div>
      )}

      {/* Coaches & Managers Section */}
      {selectedTeam && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-[#e8e8ed]">
            <div>
              <h3 className="text-lg font-semibold text-[#1d1d1f]">Coaches & Managers</h3>
              <p className="text-xs text-[#6e6e73] mt-0.5">Team staff for {selectedTeam.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setStaffRole('coach'); setShowStaffModal(true); setStaffMsg(null); setStaffForm({ name: '', email: '', phone: '' }); }}
                className="px-3.5 py-2 rounded-lg bg-[#003e79] text-white text-xs font-semibold hover:bg-[#002d5a] transition">
                + Add Coach
              </button>
              <button onClick={() => { setStaffRole('manager'); setShowStaffModal(true); setStaffMsg(null); setStaffForm({ name: '', email: '', phone: '' }); }}
                className="px-3.5 py-2 rounded-lg bg-white border border-[#e8e8ed] text-[#003e79] text-xs font-semibold hover:bg-[#f5f5f7] transition">
                + Add Manager
              </button>
            </div>
          </div>

          <div className="p-5">
            {/* Coaches */}
            {(selectedTeam.coaches?.length > 0 || selectedTeam.head_coach_name) && (
              <div className="mb-4">
                <p className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider mb-2">Coaches</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedTeam.head_coach_name && !(selectedTeam.coaches || []).some((c: any) => `${c.first_name} ${c.last_name}`.toLowerCase() === selectedTeam.head_coach_name.toLowerCase()) && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f0f7ff] border border-[#d0e4f7]">
                      <div className="w-9 h-9 bg-[#003e79] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {selectedTeam.head_coach_name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1d1d1f] truncate">{selectedTeam.head_coach_name}</p>
                        <p className="text-[11px] text-[#003e79] font-medium">Head Coach</p>
                        {selectedTeam.head_coach_email && <p className="text-[11px] text-[#6e6e73] truncate">{selectedTeam.head_coach_email}</p>}
                        {selectedTeam.head_coach_phone && <p className="text-[11px] text-[#86868b]">{selectedTeam.head_coach_phone}</p>}
                      </div>
                    </div>
                  )}
                  {(selectedTeam.coaches || []).map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed]">
                      <div className="w-9 h-9 bg-[#4a7fb5] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {(c.first_name || '?')[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1d1d1f] truncate">{c.first_name} {c.last_name}</p>
                        <p className="text-[11px] text-[#6e6e73] capitalize">{c.role === 'head' ? 'Head Coach' : 'Assistant Coach'}</p>
                        {c.email && <p className="text-[11px] text-[#6e6e73] truncate">{c.email}</p>}
                        {c.phone && <p className="text-[11px] text-[#86868b]">{c.phone}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Managers */}
            {(selectedTeam.managers?.length > 0 || selectedTeam.manager_name) && (
              <div className="mb-2">
                <p className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider mb-2">Managers</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedTeam.manager_name && !(selectedTeam.managers || []).some((m: any) => `${m.first_name} ${m.last_name}`.toLowerCase() === selectedTeam.manager_name.toLowerCase()) && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed]">
                      <div className="w-9 h-9 bg-[#6e6e73] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {selectedTeam.manager_name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1d1d1f] truncate">{selectedTeam.manager_name}</p>
                        <p className="text-[11px] text-[#6e6e73]">Team Manager</p>
                        {selectedTeam.manager_email && <p className="text-[11px] text-[#6e6e73] truncate">{selectedTeam.manager_email}</p>}
                        {selectedTeam.manager_phone && <p className="text-[11px] text-[#86868b]">{selectedTeam.manager_phone}</p>}
                      </div>
                    </div>
                  )}
                  {(selectedTeam.managers || []).map((m: any) => (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#f5f5f7] border border-[#e8e8ed]">
                      <div className="w-9 h-9 bg-[#6e6e73] rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {(m.first_name || '?')[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1d1d1f] truncate">{m.first_name} {m.last_name}</p>
                        <p className="text-[11px] text-[#6e6e73]">Team Manager</p>
                        {m.email && <p className="text-[11px] text-[#6e6e73] truncate">{m.email}</p>}
                        {m.phone && <p className="text-[11px] text-[#86868b]">{m.phone}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!selectedTeam.head_coach_name && !(selectedTeam.coaches?.length > 0) && !selectedTeam.manager_name && !(selectedTeam.managers?.length > 0) && (
              <div className="text-center py-6">
                <p className="text-sm text-[#6e6e73]">No coaches or managers added yet.</p>
                <p className="text-xs text-[#86868b] mt-1">Use the buttons above to invite staff to your team.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Staff Invite Modal */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowStaffModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[#1d1d1f] mb-1">
              Add {staffRole === 'coach' ? 'Coach' : 'Manager'}
            </h3>
            <p className="text-sm text-[#6e6e73] mb-4">
              They&apos;ll receive an email invitation to join the team.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#6e6e73] mb-1">Full Name *</label>
                <input type="text" value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="John Smith" className="w-full px-4 py-2.5 border border-[#d2d2d7] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6e6e73] mb-1">Email *</label>
                <input type="email" value={staffForm.email} onChange={e => setStaffForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="john@example.com" className="w-full px-4 py-2.5 border border-[#d2d2d7] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#6e6e73] mb-1">Phone (optional)</label>
                <input type="tel" value={staffForm.phone} onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="555-123-4567" className="w-full px-4 py-2.5 border border-[#d2d2d7] rounded-xl text-sm focus:ring-2 focus:ring-[#003e79] focus:border-transparent outline-none" />
              </div>
            </div>
            {staffMsg && (
              <p className={`mt-3 text-sm font-medium ${staffMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {staffMsg.text}
              </p>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowStaffModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#e8e8ed] text-sm font-semibold text-[#6e6e73] hover:bg-[#f5f5f7] transition">
                Cancel
              </button>
              <button onClick={handleStaffInvite} disabled={staffInviting || !staffForm.name.trim() || !staffForm.email.trim()}
                className="flex-1 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition disabled:opacity-50">
                {staffInviting ? 'Sending...' : `Invite ${staffRole === 'coach' ? 'Coach' : 'Manager'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================
// My Coupon Codes
// ==================
function MyCouponCodes() {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('uht_token');
    if (!token || token.startsWith('mock-')) { setLoading(false); return; }

    fetch(`${API}/api/teams/my-discount-codes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => { if (json.success) setCodes(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><span className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" /></div>;

  const activeCodes = codes.filter(c => !c.is_used);
  const usedCodes = codes.filter(c => c.is_used);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1d1d1f]">My Coupon Codes</h1>
        <p className="text-sm text-[#6e6e73] mt-1">Share these codes with other teams to save on registration. Codes are generated when you register for an event.</p>
      </div>

      {codes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-12 text-center">
          <div className="w-16 h-16 bg-[#f0f7ff] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-[#1d1d1f]">No coupon codes yet</h3>
          <p className="mt-2 text-sm text-[#6e6e73]">Register for an event to receive a shareable coupon code.</p>
          <a href="/events" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
            Browse Events
          </a>
        </div>
      ) : (
        <>
          {/* Active Codes */}
          {activeCodes.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider mb-3">Active Codes</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeCodes.map((c: any) => (
                  <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-50 rounded-bl-[40px] -mr-2 -mt-2" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">Active</span>
                        <button onClick={() => copyCode(c.code)}
                          className="flex items-center gap-1 text-xs font-medium text-[#003e79] hover:text-[#002d5a] transition">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          {copiedCode === c.code ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-2xl font-mono font-bold text-[#1d1d1f] tracking-wider mb-2">{c.code}</p>
                      <div className="bg-[#f0f7ff] border border-[#003e79]/15 rounded-lg px-3 py-2 mb-2">
                        <p className="text-xs font-semibold text-[#003e79]">Valid only for: {c.team_name}{c.age_group ? ` · ${c.age_group}` : ''}</p>
                      </div>
                      <p className="text-sm text-[#6e6e73]">{c.event_name || 'Event'}</p>
                      {c.event_city && <p className="text-xs text-[#86868b] mt-0.5">{c.event_city}, {c.event_state}</p>}
                      <div className="flex items-center gap-3 mt-3 text-xs text-[#86868b]">
                        <span>Saves ${(c.discount_local_cents / 100).toFixed(0)} for local teams</span>
                        <span>·</span>
                        <span>Saves ${(c.discount_hotel_cents / 100).toFixed(0)} for hotel teams</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Used Codes */}
          {usedCodes.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[#86868b] uppercase tracking-wider mb-3">Used Codes</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {usedCodes.map((c: any) => (
                  <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5 opacity-60">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-[#86868b] bg-[#f5f5f7] px-2.5 py-1 rounded-full">Used</span>
                    </div>
                    <p className="text-2xl font-mono font-bold text-[#86868b] tracking-wider mb-2 line-through">{c.code}</p>
                    <p className="text-sm text-[#86868b]">{c.event_name || 'Event'}</p>
                    <p className="text-xs text-[#86868b] mt-1">{c.team_name}{c.age_group ? ` · ${c.age_group}` : ''}</p>
                    {c.used_at && <p className="text-xs text-[#86868b] mt-2">Used on {new Date(c.used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ==================
// Coach/Manager: Event Detail
// ==================
function CoachEventDetail({ eventId, role }: { eventId: string; role: string }) {
  const [event, setEvent] = useState<any>(null);
  const [myTeams, setMyTeams] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const formatDateRange = (start: string, end: string) => {
    if (!start || !end) return '';
    const s = new Date(start + 'T12:00:00');
    const e = new Date(end + 'T12:00:00');
    const sMonth = s.toLocaleDateString('en-US', { month: 'short' });
    const eMonth = e.toLocaleDateString('en-US', { month: 'short' });
    const sDay = s.getDate();
    const eDay = e.getDate();
    const year = e.getFullYear();
    if (sMonth === eMonth) return `${sMonth} ${sDay} – ${eDay}, ${year}`;
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${year}`;
  };

  const formatCurrency = (cents: number) => {
    return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const formatGameTime = (datetime: string) => {
    const d = new Date(datetime);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const headers = getAuthHeaders();

        // Fetch event detail and my teams in parallel
        const [eventRes, teamsRes] = await Promise.all([
          fetch(`${API}/api/events/${eventId}`),
          fetch(`${API}/api/teams/my-teams`, { headers }),
        ]);

        const eventJson = await eventRes.json();
        const teamsJson = await teamsRes.json();

        const eventData = eventJson.success ? (eventJson.data || eventJson) : eventJson;
        setEvent(eventData);

        // Filter teams that are registered for this event
        const allTeams = teamsJson.success ? (teamsJson.data || []) : [];
        const registeredTeams = allTeams.filter((t: any) =>
          t.registered_events?.some((re: any) => re.event_id === eventId || re.id === eventId)
        );
        setMyTeams(registeredTeams);

        // Fetch schedule if published
        if (eventData.schedule_published && registeredTeams.length > 0) {
          try {
            const schedRes = await fetch(
              `${API}/api/events/${eventId}/schedule?team_id=${registeredTeams[0].id}`,
              { headers }
            );
            const schedJson = await schedRes.json();
            if (schedJson.success) setSchedule(schedJson.data || schedJson.games || []);
            else if (Array.isArray(schedJson)) setSchedule(schedJson);
          } catch {}
        }
      } catch (err) {
        setError('Failed to load event details. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-12 text-center">
        <h2 className="text-lg font-semibold text-[#1d1d1f] mb-2">Unable to load event</h2>
        <p className="text-sm text-[#6e6e73]">{error || 'Event not found.'}</p>
        <a href={`/dashboard/${role}/events`} className="inline-block mt-4 px-5 py-2 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
          Back to Events
        </a>
      </div>
    );
  }

  // Build registration info per team
  const teamRegistrations = myTeams.map((team: any) => {
    const reg = team.registered_events?.find((re: any) => re.event_id === eventId || re.id === eventId) || {};
    // Try to match division info
    const division = event.divisions?.find((d: any) => d.id === reg.division_id) ||
      event.divisions?.find((d: any) => d.age_group === team.age_group && d.level === team.division_level);
    return { team, reg, division };
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-6">
        <div className="flex items-center gap-4">
          <a href={`/dashboard/${role}/events`} className="shrink-0 w-9 h-9 rounded-full bg-[#f5f5f7] flex items-center justify-center hover:bg-[#e8e8ed] transition">
            <svg className="w-5 h-5 text-[#6e6e73]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          {event.logo_url ? (
            <img src={event.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-[#003e79] flex items-center justify-center text-white font-bold text-xl shrink-0">
              {(event.name || '?')[0]}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-[#1d1d1f] truncate">{event.name}</h1>
            <p className="text-sm text-[#6e6e73] mt-0.5">
              {formatDateRange(event.start_date, event.end_date)}
              {event.city && ` · ${event.city}, ${event.state}`}
            </p>
          </div>
        </div>
      </div>

      {/* Registration Status */}
      {teamRegistrations.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#e8e8ed]">
            <h2 className="text-base font-bold text-[#1d1d1f]">Registration Status</h2>
          </div>
          <div className="divide-y divide-[#f0f0f2]">
            {teamRegistrations.map(({ team, reg, division }: any) => (
              <div key={team.id} className="px-6 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-[#1d1d1f]">{team.name}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    reg.status === 'confirmed' || reg.status === 'approved' ? 'bg-green-50 text-green-700 border border-green-200' :
                    reg.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                    'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {(reg.status || 'registered').charAt(0).toUpperCase() + (reg.status || 'registered').slice(1)}
                  </span>
                </div>

                {/* Division / Age Group */}
                {(division || team.age_group) && (
                  <p className="text-sm text-[#6e6e73] mb-3">
                    {division ? `${division.age_group} ${division.level || ''}`.trim() : `${team.age_group} ${team.division_level || ''}`.trim()}
                  </p>
                )}

                {/* Payment Status */}
                <div className="mt-2">
                  {reg.payment_status === 'paid' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-green-50 text-green-700 border border-green-200">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Paid
                    </span>
                  ) : reg.payment_status === 'deposit' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01" />
                      </svg>
                      Deposit Paid
                    </span>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-sm font-semibold text-red-700">Awaiting Payment</span>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`https://ultimatetournaments.com/pay?reg=${reg.reg_id || reg.id}`}
                          className="flex-1 text-center px-4 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition shadow-sm"
                        >
                          Pay Now
                        </a>
                        <button
                          onClick={() => copyToClipboard(`https://ultimatetournaments.com/pay?reg=${reg.reg_id || reg.id}`, `pay-${team.id}`)}
                          className="px-4 py-2.5 rounded-xl bg-white text-[#003e79] text-sm font-semibold border border-[#003e79] hover:bg-[#f0f7ff] transition"
                        >
                          {copiedLink === `pay-${team.id}` ? 'Copied!' : 'Copy Payment Link'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hotel Assignment */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e8e8ed]">
          <h2 className="text-base font-bold text-[#1d1d1f]">Hotel Assignment</h2>
        </div>
        <div className="px-6 py-4">
          {(() => {
            // Look for hotel info from team registrations or event hotels
            const hotelReg = teamRegistrations.find(({ reg }: any) => reg.hotel_name || reg.hotel_id);
            const hotel = hotelReg?.reg;
            if (hotel?.hotel_name) {
              return (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-[#003e79]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <h3 className="font-semibold text-[#1d1d1f]">{hotel.hotel_name}</h3>
                  </div>
                  {hotel.hotel_address && <p className="text-sm text-[#6e6e73] mb-1">{hotel.hotel_address}</p>}
                  {hotel.hotel_rate && <p className="text-sm text-[#6e6e73] mb-1">{hotel.hotel_rate}</p>}
                  {hotel.hotel_price_per_night && !hotel.hotel_rate && (
                    <p className="text-sm text-[#6e6e73] mb-1">{formatCurrency(hotel.hotel_price_per_night)}/night</p>
                  )}
                  {hotel.hotel_booking_code && (
                    <p className="text-sm text-[#6e6e73] mb-2">
                      Booking Code: <span className="font-mono font-semibold text-[#003e79]">{hotel.hotel_booking_code}</span>
                    </p>
                  )}
                  {hotel.hotel_booking_url && (
                    <a
                      href={hotel.hotel_booking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition"
                    >
                      Book Your Room
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              );
            }
            return (
              <div className="flex items-center gap-3 text-[#86868b]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm">Hotel assignment pending. You will be notified when your hotel is assigned.</p>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Venues & Rinks */}
      {event.venues && event.venues.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#e8e8ed]">
            <h2 className="text-base font-bold text-[#1d1d1f]">Venues & Rinks</h2>
          </div>
          <div className="divide-y divide-[#f0f0f2]">
            {event.venues.map((venue: any, i: number) => {
              const fullAddress = [venue.address, venue.city, venue.state, venue.zip].filter(Boolean).join(', ');
              return (
                <div key={venue.id || i} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[#1d1d1f]">{venue.name}</h3>
                      {fullAddress && <p className="text-sm text-[#6e6e73] mt-0.5">{fullAddress}</p>}
                      {venue.rinks && venue.rinks.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {venue.rinks.map((rink: any, j: number) => (
                            <span key={rink.id || j} className="px-2.5 py-1 rounded-lg bg-[#f5f5f7] text-xs font-medium text-[#1d1d1f]">
                              {rink.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {fullAddress && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#f5f5f7] text-xs font-semibold text-[#003e79] hover:bg-[#e8e8ed] transition"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Directions
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Schedule */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e8e8ed]">
          <h2 className="text-base font-bold text-[#1d1d1f]">Schedule</h2>
        </div>
        <div className="px-6 py-4">
          {event.schedule_published && schedule.length > 0 ? (
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-sm">
                <thead className="bg-[#fafafa] text-left text-[#6e6e73]">
                  <tr>
                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Date / Time</th>
                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Opponent</th>
                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Rink</th>
                    <th className="px-6 py-3 font-medium text-xs uppercase tracking-wider">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f2]">
                  {schedule.map((game: any, i: number) => {
                    const isMyTeam = (id: string) => myTeams.some(t => t.id === id);
                    const opponent = isMyTeam(game.home_team_id) ? game.away_team_name : game.home_team_name;
                    const homeAway = isMyTeam(game.home_team_id) ? 'vs' : '@';
                    const hasScore = game.home_score !== null && game.home_score !== undefined;
                    let scoreDisplay = '--';
                    if (hasScore) {
                      const myScore = isMyTeam(game.home_team_id) ? game.home_score : game.away_score;
                      const oppScore = isMyTeam(game.home_team_id) ? game.away_score : game.home_score;
                      scoreDisplay = `${myScore} - ${oppScore}`;
                    }
                    return (
                      <tr key={game.id || i} className="hover:bg-[#fafafa] transition-colors">
                        <td className="px-6 py-3 text-[#1d1d1f] whitespace-nowrap">
                          {game.start_time ? formatGameTime(game.start_time) : game.date || '--'}
                        </td>
                        <td className="px-6 py-3 text-[#1d1d1f]">
                          <span className="text-[#86868b] mr-1">{homeAway}</span> {opponent || 'TBD'}
                        </td>
                        <td className="px-6 py-3 text-[#6e6e73]">{game.rink_name || game.rink || '--'}</td>
                        <td className="px-6 py-3 text-[#1d1d1f] font-medium">{scoreDisplay}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[#86868b]">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              <p className="text-sm">Schedule will be released before the event.</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e8e8ed]">
          <h2 className="text-base font-bold text-[#1d1d1f]">Quick Links</h2>
        </div>
        <div className="px-6 py-4 flex flex-wrap gap-3">
          {event.slug && (
            <a
              href={`/events/${event.slug}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f5f5f7] text-sm font-semibold text-[#1d1d1f] hover:bg-[#e8e8ed] transition"
            >
              <svg className="w-4 h-4 text-[#6e6e73]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
              Event Page
            </a>
          )}
          <a
            href={`/register?event=${eventId}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f5f5f7] text-sm font-semibold text-[#1d1d1f] hover:bg-[#e8e8ed] transition"
          >
            <svg className="w-4 h-4 text-[#6e6e73]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Register Another Team
          </a>
          {myTeams.some((t: any) => t.parent_share_code) && (
            <button
              onClick={() => {
                const code = myTeams.find((t: any) => t.parent_share_code)?.parent_share_code;
                if (code) copyToClipboard(code, 'parent-share');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f5f5f7] text-sm font-semibold text-[#1d1d1f] hover:bg-[#e8e8ed] transition"
            >
              <svg className="w-4 h-4 text-[#6e6e73]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
              {copiedLink === 'parent-share' ? 'Code Copied!' : 'Share with Parents'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================
// Generic placeholder for unbuilt sub-pages
// ==================
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-12 text-center">
      <h1 className="text-2xl font-bold text-[#1d1d1f] mb-2">{title}</h1>
      <p className="text-[#6e6e73]">This section is coming soon.</p>
    </div>
  );
}

// ==================
// Events wrapper — isolates useSearchParams so it doesn't block other pages
// ==================
function EventsWithSearchParams({ role }: { role: string }) {
  const searchParams = useSearchParams();
  const eventIdParam = searchParams.get('id');
  if (eventIdParam) return <CoachEventDetail eventId={eventIdParam} role={role} />;
  return <RoleEvents role={role} />;
}

function EventsPage({ role }: { role: string }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><span className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" /></div>}>
      <EventsWithSearchParams role={role} />
    </Suspense>
  );
}

// ==================
// Route dispatcher
// ==================
export default function SubPageContent() {
  const params = useParams();
  const role = params.role as string;
  const slugParts = params.slug as string[];
  const subPage = slugParts?.[0] || '';

  // Coach sub-pages
  if (role === 'coach') {
    switch (subPage) {
      case 'teams': return <CoachTeams role="coach" />;
      case 'events': return <EventsPage role="coach" />;
      case 'roster': return <RosterManagement />;
      case 'coupons': return <MyCouponCodes />;
      case 'schedule': return <ComingSoon title="Game Schedule" />;
    }
  }

  // Manager sub-pages
  if (role === 'manager') {
    switch (subPage) {
      case 'teams': return <CoachTeams role="manager" />;
      case 'events': return <EventsPage role="manager" />;
      case 'roster': return <RosterManagement />;
      case 'coupons': return <MyCouponCodes />;
      case 'schedule': return <ComingSoon title="Game Schedule" />;
    }
  }

  // Organization sub-pages
  if (role === 'organization') {
    switch (subPage) {
      case 'teams': return <OrgTeams />;
      case 'coaches': return <OrgCoaches />;
      case 'rosters': return <OrgRosters />;
      case 'events': return <OrgEvents />;
    }
  }

  // Parent sub-pages
  if (role === 'parent') {
    switch (subPage) {
      case 'teams': return <CoachTeams />;
      case 'schedule': return <ComingSoon title="Game Schedule" />;
      case 'results': return <ComingSoon title="Game Results" />;
      case 'stats': return <ComingSoon title="Player Stats" />;
    }
  }

  // Scorekeeper sub-pages
  if (role === 'scorekeeper') {
    switch (subPage) {
      case 'assignments': return <ComingSoon title="My Assignments" />;
      case 'completed': return <ComingSoon title="Completed Games" />;
    }
  }

  // Referee sub-pages
  if (role === 'referee') {
    switch (subPage) {
      case 'assignments': return <ComingSoon title="Game Assignments" />;
      case 'reports': return <ComingSoon title="Game Reports" />;
    }
  }

  return <ComingSoon title={subPage ? subPage.charAt(0).toUpperCase() + subPage.slice(1) : 'Page'} />;
}
