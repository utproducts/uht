'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://uht.chad-157.workers.dev';

// ==================
// Coach: My Teams
// ==================
function CoachTeams() {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('uht_teams');
    if (stored) {
      try { setTeams(JSON.parse(stored)); } catch {}
    }

    const token = localStorage.getItem('uht_token');
    if (token && !token.startsWith('mock-')) {
      fetch(`${API}/api/teams/my-teams`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(json => { if (json.success && json.data?.length > 0) setTeams(json.data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><span className="animate-spin h-8 w-8 border-3 border-[#003e79] border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1d1d1f]">My Teams</h1>
        <a href="/create-team" className="px-4 py-2 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
          + Create Team
        </a>
      </div>

      {teams.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-12 text-center">
          <div className="w-16 h-16 bg-[#f0f7ff] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#003e79]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-[#1d1d1f]">No teams yet</h3>
          <p className="mt-2 text-sm text-[#6e6e73]">Create your first team to get started with registrations.</p>
          <a href="/create-team" className="inline-block mt-4 px-6 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-semibold hover:bg-[#002d5a] transition">
            Create a Team
          </a>
        </div>
      ) : (
        <div className="grid gap-4">
          {teams.map((team: any) => (
            <div key={team.id} className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-[#003e79] rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0">
                {(team.name || '?')[0]}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#1d1d1f] truncate">{team.name}</h3>
                <p className="text-sm text-[#6e6e73]">{team.age_group || team.ageGroup || ''} {team.division_level ? `· ${team.division_level}` : ''}</p>
                {team.city && <p className="text-xs text-[#86868b]">{team.city}{team.state ? `, ${team.state}` : ''}</p>}
              </div>
              <div className="text-right shrink-0">
                {team.player_count != null && (
                  <p className="text-sm font-medium text-[#1d1d1f]">{team.player_count} players</p>
                )}
                {team.active_registrations != null && (
                  <p className="text-xs text-[#86868b]">{team.active_registrations} active registrations</p>
                )}
              </div>
            </div>
          ))}
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

    // Fetch events the user's teams are registered for
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
      case 'teams': return <CoachTeams />;
      case 'events': return <RoleEvents role="coach" />;
      case 'roster': return <ComingSoon title="Roster Management" />;
      case 'schedule': return <ComingSoon title="Game Schedule" />;
    }
  }

  // Manager sub-pages
  if (role === 'manager') {
    switch (subPage) {
      case 'team': return <CoachTeams />;
      case 'events': return <RoleEvents role="manager" />;
      case 'players': return <ComingSoon title="Player Management" />;
      case 'payments': return <ComingSoon title="Payment History" />;
    }
  }

  // Organization sub-pages
  if (role === 'organization') {
    switch (subPage) {
      case 'teams': return <CoachTeams />;
      case 'coaches': return <ComingSoon title="Coach Management" />;
      case 'rosters': return <ComingSoon title="Roster Management" />;
      case 'events': return <RoleEvents role="organization" />;
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
