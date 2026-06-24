'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
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
                          <a key={ev.reg_id} href={`/events/${ev.slug}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#f5f5f7] transition group">
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
                  {team.invite_code && (
                    <button onClick={() => copyInviteCode(team.invite_code, team.id)}
                      className="ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white border border-dashed border-[#d2d2d7] text-[#86868b] text-xs font-semibold hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      {copiedId === team.id ? 'Copied!' : `Code: ${team.invite_code}`}
                    </button>
                  )}
                  {team.roster_share_token && (
                    <button onClick={() => {
                      const url = `${window.location.origin}/roster/claim?t=${team.roster_share_token}`;
                      navigator.clipboard.writeText(url);
                      setRosterLinkCopied(team.id);
                      setTimeout(() => setRosterLinkCopied(null), 2500);
                    }}
                      className={"flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition " +
                        (rosterLinkCopied === team.id ? "bg-green-100 text-green-700 border border-green-300" : "bg-green-50 border border-green-200 text-green-700 hover:bg-green-100")}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                      {rosterLinkCopied === team.id ? 'Link Copied!' : 'Parent Registration Link'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
    <a key={ev.id} href={`/events/${ev.slug}`} className={`bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5 hover:shadow-md transition block ${isPast ? 'opacity-70' : ''}`}>
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
  const [newPlayer, setNewPlayer] = useState({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '', usaHockeyNumber: '' });

  // Edit player
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Load teams
  useEffect(() => {
    const token = localStorage.getItem('uht_token');
    if (!token || token.startsWith('mock-')) { setLoading(false); return; }

    fetch(`${API}/api/teams/my-teams`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.length > 0) {
          setTeams(json.data);
          setSelectedTeamId(json.data[0].id);
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
        setNewPlayer({ firstName: '', lastName: '', jerseyNumber: '', position: '', shoots: '', usaHockeyNumber: '' });
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
      shoots: p.shoots || '', usa_hockey_number: p.usa_hockey_number || '',
    });
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
                  <th className="px-4 py-3 font-semibold text-[#6e6e73]">USA Hockey #</th>
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
                      <td className="px-4 py-2">
                        <input type="text" value={editForm.usa_hockey_number} onChange={e => setEditForm((f: any) => ({ ...f, usa_hockey_number: e.target.value }))}
                          className="w-24 px-2 py-1 rounded border border-gray-300 text-sm" />
                      </td>
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
                      <td className="px-4 py-3 text-[#6e6e73] font-mono text-xs">{p.usa_hockey_number || '—'}</td>
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
          <p className="mt-2 text-sm text-[#6e6e73]">Import from USA Hockey, paste a roster, or add players manually.</p>
          <button onClick={() => setShowImport(true)}
            className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
            Add Players
          </button>
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
                      <p className="text-sm text-[#6e6e73]">{c.event_name || 'Event'}</p>
                      <p className="text-xs text-[#86868b] mt-1">
                        {c.team_name}
                        {c.event_city && ` · ${c.event_city}, ${c.event_state}`}
                      </p>
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
                    <p className="text-xs text-[#86868b] mt-1">{c.team_name}</p>
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
      case 'events': return <RoleEvents role="coach" />;
      case 'roster': return <RosterManagement />;
      case 'coupons': return <MyCouponCodes />;
      case 'schedule': return <ComingSoon title="Game Schedule" />;
    }
  }

  // Manager sub-pages
  if (role === 'manager') {
    switch (subPage) {
      case 'teams': return <CoachTeams role="manager" />;
      case 'events': return <RoleEvents role="manager" />;
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
