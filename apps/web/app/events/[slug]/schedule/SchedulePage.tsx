'use client';

import { useState, useEffect } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

interface EventData {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string;
  status: string;
  logo_url: string | null;
  schedule_published: number;
}

interface Game {
  id: string;
  game_number: number;
  game_type: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  period: number;
  start_time: string;
  rink_name: string;
  age_group: string;
  division_level: string;
  delay_minutes?: number;
  delay_note?: string;
  cascaded_delay_minutes?: number;
  adjusted_start_time?: string;
}

interface StandingsRow {
  event_division_id: string;
  age_group: string;
  division_level: string;
  pool_name: string;
  team_id: string;
  team_name: string;
  games_played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  goals_for: number;
  goals_against: number;
  goal_differential: number;
}

/* ── Helpers ── */
function formatDateRange(start: string, end: string) {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  if (s.getMonth() === e.getMonth()) {
    return `${s.toLocaleDateString('en-US', { month: 'long' })} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' };
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', opts)}, ${s.getFullYear()}`;
}

function formatTime(isoStr: string) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDay(isoStr: string) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function statusBadge(status: string): { label: string; classes: string } {
  switch (status) {
    case 'in_progress': case 'live': return { label: 'LIVE', classes: 'bg-red-500 text-white animate-pulse' };
    case 'warmup': return { label: 'Warmup', classes: 'bg-blue-100 text-blue-700' };
    case 'intermission': return { label: 'Intermission', classes: 'bg-amber-100 text-amber-700' };
    case 'final': return { label: 'Final', classes: 'bg-gray-100 text-gray-600' };
    case 'delayed': return { label: 'Delayed', classes: 'bg-amber-100 text-amber-700' };
    case 'scheduled': default: return { label: 'Scheduled', classes: 'bg-[#f0f7ff] text-[#003e79]' };
  }
}

export default function SchedulePage({ slug }: { slug: string }) {
  const [event, setEvent] = useState<EventData | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [divisionFilter, setDivisionFilter] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const eventRes = await fetch(`${API}/events/${slug}`);
        if (!eventRes.ok) { setError('Event not found'); setLoading(false); return; }
        const eventJson = await eventRes.json();
        const ev = eventJson.data;
        setEvent(ev);

        const [liveRes, standingsRes, scheduleRes] = await Promise.all([
          fetch(`${API}/scoring/events/${ev.id}/live`),
          fetch(`${API}/scoring/events/${ev.id}/standings`),
          fetch(`${API}/scoring/events/${ev.id}/schedule`),
        ]);

        let allGames: Game[] = [];
        if (liveRes.ok) {
          const liveJson = await liveRes.json();
          allGames = liveJson.data || [];
        }
        if (allGames.length === 0 && scheduleRes.ok) {
          const schedJson = await scheduleRes.json();
          allGames = schedJson.data || [];
        }
        setGames(allGames);

        if (standingsRes.ok) {
          const standingsJson = await standingsRes.json();
          setStandings(standingsJson.data || []);
        }
      } catch {
        setError('Failed to load schedule');
      }
      setLoading(false);
    };
    if (slug) load();
  }, [slug]);

  // Polling for live updates every 30s
  useEffect(() => {
    if (!event || (event.status !== 'active')) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/scoring/events/${event.id}/live`);
        if (res.ok) {
          const json = await res.json();
          if (json.data?.length > 0) setGames(json.data);
        }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [event]);

  const toggleDay = (day: string) => {
    setCollapsedDays(prev => ({ ...prev, [day]: !prev[day] }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        <div className="h-20 bg-gradient-to-r from-[#003e79] to-[#005599]" />
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-2xl p-6 animate-pulse border border-[#e8e8ed]">
              <div className="h-16 bg-gray-100 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 bg-[#f5f5f7] rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">📋</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1d1d1f] mb-3">Schedule Not Found</h1>
          <p className="text-[#6e6e73] mb-8">{error || 'This schedule could not be loaded.'}</p>
          <a href="/events" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#003e79] text-white font-semibold hover:bg-[#002d5a] transition-colors">
            Back to Events
          </a>
        </div>
      </div>
    );
  }

  // Build unique divisions: "Age Group Level" combos
  const divisions = Array.from(
    new Set(games.map(g => `${g.age_group} ${g.division_level}`.trim()).filter(Boolean))
  ).sort();
  const days = Array.from(new Set(games.map(g => formatDay(g.start_time))));

  // Filter games by division and day
  let filtered = games;
  if (divisionFilter) filtered = filtered.filter(g => `${g.age_group} ${g.division_level}`.trim() === divisionFilter);
  if (dayFilter) filtered = filtered.filter(g => formatDay(g.start_time) === dayFilter);

  // Group games by day
  const gamesByDay: Record<string, Game[]> = {};
  filtered.forEach(g => {
    const day = formatDay(g.start_time);
    if (!gamesByDay[day]) gamesByDay[day] = [];
    gamesByDay[day].push(g);
  });
  Object.values(gamesByDay).forEach(dayGames => {
    dayGames.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  });

  // Filter standings by division too
  const filteredStandings = divisionFilter
    ? standings.filter(s => `${s.age_group} ${s.division_level}`.trim() === divisionFilter)
    : standings;
  const standingsByDiv: Record<string, StandingsRow[]> = {};
  filteredStandings.forEach(s => {
    const key = `${s.age_group} ${s.division_level} – ${s.pool_name}`;
    if (!standingsByDiv[key]) standingsByDiv[key] = [];
    standingsByDiv[key].push(s);
  });

  const hasLiveGames = games.some(g => g.status === 'in_progress' || g.status === 'live' || g.status === 'warmup');

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* ═══════ HEADER ═══════ */}
      <div className="bg-gradient-to-br from-[#003e79] via-[#005599] to-[#0077cc] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-white translate-x-1/3 -translate-y-1/3" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-6">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-sm text-white/50 mb-4">
            <a href="/events" className="hover:text-white/80 transition-colors">Events</a>
            <span>/</span>
            <a href={`/events/${event.slug}`} className="hover:text-white/80 transition-colors">{event.name}</a>
            <span>/</span>
            <span className="text-white/70">Schedule</span>
          </nav>

          <div className="flex items-center gap-4">
            {event.logo_url && (
              <div className="w-14 h-14 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center overflow-hidden border border-white/20 shrink-0">
                <img src={event.logo_url} alt="" className="w-full h-full object-contain p-1.5" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white truncate">{event.name}</h1>
                {hasLiveGames && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse shrink-0">
                    <span className="w-1.5 h-1.5 bg-white rounded-full" />
                    LIVE
                  </span>
                )}
              </div>
              <p className="text-white/60 text-sm mt-0.5">
                {formatDateRange(event.start_date, event.end_date)} · {event.city}, {event.state}
              </p>
            </div>
            <a
              href={`/events/${event.slug}`}
              className="shrink-0 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold border border-white/20 hover:bg-white/20 transition-colors"
            >
              Event Details
            </a>
          </div>
        </div>
      </div>

      {/* ═══════ DIVISION FILTER BAR ═══════ */}
      <div className="sticky top-0 z-30 bg-white border-b border-[#e8e8ed] shadow-sm">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3 py-3 overflow-x-auto">
            {/* All divisions pill */}
            <button
              onClick={() => setDivisionFilter('')}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                !divisionFilter
                  ? 'bg-[#003e79] text-white shadow-sm'
                  : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed] hover:text-[#1d1d1f]'
              }`}
            >
              All Divisions
            </button>
            {divisions.map(div => (
              <button
                key={div}
                onClick={() => setDivisionFilter(divisionFilter === div ? '' : div)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  divisionFilter === div
                    ? 'bg-[#003e79] text-white shadow-sm'
                    : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed] hover:text-[#1d1d1f]'
                }`}
              >
                {div}
              </button>
            ))}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Day filter dropdown */}
            {days.length > 1 && (
              <select
                value={dayFilter}
                onChange={e => setDayFilter(e.target.value)}
                className="px-3 py-2 rounded-full text-sm font-medium bg-[#f5f5f7] text-[#6e6e73] border-none focus:outline-none focus:ring-2 focus:ring-[#003e79]/20 shrink-0"
              >
                <option value="">All Days</option>
                {days.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}

            <span className="text-xs text-[#86868b] tabular-nums shrink-0">{filtered.length} game{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* ═══════ CONTENT ═══════ */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ── STANDINGS (shown above schedule) ── */}
        {filteredStandings.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-[#1d1d1f] mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#003e79]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 01-2.52.777m2.52-.777a6.023 6.023 0 01-2.52.777M12 10.5v-.777" />
              </svg>
              Standings
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(standingsByDiv).map(([divKey, rows]) => (
                <div key={divKey} className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="px-5 py-3 bg-[#003e79]">
                    <h3 className="text-white font-bold text-sm">{divKey}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#e8e8ed] bg-[#fafafa]">
                          <th className="text-left px-3 py-2 text-[10px] font-bold text-[#86868b] uppercase">#</th>
                          <th className="text-left px-3 py-2 text-[10px] font-bold text-[#86868b] uppercase">Team</th>
                          <th className="text-center px-2 py-2 text-[10px] font-bold text-[#86868b] uppercase">GP</th>
                          <th className="text-center px-2 py-2 text-[10px] font-bold text-[#86868b] uppercase">W</th>
                          <th className="text-center px-2 py-2 text-[10px] font-bold text-[#86868b] uppercase">L</th>
                          <th className="text-center px-2 py-2 text-[10px] font-bold text-[#86868b] uppercase">T</th>
                          <th className="text-center px-2 py-2 text-[10px] font-bold text-[#86868b] uppercase">PTS</th>
                          <th className="text-center px-2 py-2 text-[10px] font-bold text-[#86868b] uppercase">+/-</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.sort((a, b) => b.points - a.points || b.goal_differential - a.goal_differential).map((row, idx) => (
                          <tr key={row.team_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'}>
                            <td className="px-3 py-2 text-[#86868b] font-medium">{idx + 1}</td>
                            <td className="px-3 py-2 font-semibold text-[#1d1d1f] whitespace-nowrap">{row.team_name}</td>
                            <td className="px-2 py-2 text-center text-[#6e6e73]">{row.games_played}</td>
                            <td className="px-2 py-2 text-center font-semibold text-[#1d1d1f]">{row.wins}</td>
                            <td className="px-2 py-2 text-center text-[#6e6e73]">{row.losses}</td>
                            <td className="px-2 py-2 text-center text-[#6e6e73]">{row.ties}</td>
                            <td className="px-2 py-2 text-center font-bold text-[#003e79]">{row.points}</td>
                            <td className={`px-2 py-2 text-center font-semibold ${row.goal_differential > 0 ? 'text-emerald-600' : row.goal_differential < 0 ? 'text-red-500' : 'text-[#6e6e73]'}`}>
                              {row.goal_differential > 0 ? '+' : ''}{row.goal_differential}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SCHEDULE ── */}
        {games.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-[#f5f5f7] rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[#1d1d1f] mb-2">Schedule Coming Soon</h3>
            <p className="text-[#6e6e73] max-w-md mx-auto">
              The game schedule for this tournament hasn&apos;t been posted yet. Check back closer to the event date.
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-bold text-[#1d1d1f] mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#003e79]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
              Game Schedule
            </h2>
            <div className="space-y-4">
              {Object.entries(gamesByDay).map(([day, dayGames]) => {
                const isCollapsed = collapsedDays[day] || false;
                const liveCount = dayGames.filter(g => g.status === 'in_progress' || g.status === 'live').length;
                const finalCount = dayGames.filter(g => g.status === 'final').length;

                return (
                  <div key={day} className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] overflow-hidden">
                    {/* Day Header — clickable to collapse */}
                    <button
                      onClick={() => toggleDay(day)}
                      className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-[#fafafa] transition-colors"
                    >
                      {/* Chevron */}
                      <svg
                        className={`w-5 h-5 text-[#86868b] transition-transform duration-200 shrink-0 ${isCollapsed ? '' : 'rotate-90'}`}
                        fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>

                      <svg className="w-5 h-5 text-[#003e79] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                      <span className="text-base font-bold text-[#1d1d1f] flex-1">{day}</span>

                      {/* Summary badges */}
                      <div className="flex items-center gap-2 shrink-0">
                        {liveCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white animate-pulse">
                            <span className="w-1.5 h-1.5 bg-white rounded-full" />
                            {liveCount} LIVE
                          </span>
                        )}
                        <span className="text-xs text-[#86868b] tabular-nums font-medium">
                          {dayGames.length} game{dayGames.length !== 1 ? 's' : ''}
                          {finalCount > 0 && ` · ${finalCount} final`}
                        </span>
                      </div>
                    </button>

                    {/* Games list — collapsible */}
                    {!isCollapsed && (
                      <div className="border-t border-[#e8e8ed]">
                        {dayGames.map((game, gIdx) => {
                          const sb = statusBadge(game.status);
                          const isFinal = game.status === 'final';
                          const isLive = game.status === 'in_progress' || game.status === 'live';
                          const totalDelay = (game.delay_minutes || 0) + (game.cascaded_delay_minutes || 0);
                          const hasStarted = isFinal || isLive || game.status === 'intermission';
                          return (
                            <a
                              key={game.id}
                              href={hasStarted ? `/scores/game?gameId=${game.id}` : undefined}
                              className={`flex items-center ${gIdx > 0 ? 'border-t border-[#f0f0f3]' : ''} ${isLive ? 'bg-red-50/40' : 'hover:bg-[#fafafa]'} transition-colors ${hasStarted ? 'cursor-pointer' : 'cursor-default'}`}
                            >
                              {/* Time + Rink */}
                              <div className="w-28 sm:w-36 shrink-0 px-4 py-3 text-center border-r border-[#f0f0f3]">
                                <p className="text-sm font-bold text-[#1d1d1f]">{formatTime(game.start_time)}</p>
                                <p className="text-[11px] text-[#86868b] mt-0.5">{game.rink_name}</p>
                                {totalDelay > 0 && (
                                  <p className="text-[11px] text-amber-600 font-semibold mt-0.5">+{totalDelay} min</p>
                                )}
                              </div>

                              {/* Matchup */}
                              <div className="flex-1 px-4 py-3 min-w-0">
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 text-right min-w-0">
                                    <p className={`text-sm font-semibold truncate ${isFinal && game.away_score > game.home_score ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>
                                      {game.away_team_name || 'TBD'}
                                    </p>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    {hasStarted ? (
                                      <>
                                        <span className={`text-lg font-bold tabular-nums ${isFinal && game.away_score > game.home_score ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>
                                          {game.away_score}
                                        </span>
                                        <span className="text-[#86868b] text-xs">-</span>
                                        <span className={`text-lg font-bold tabular-nums ${isFinal && game.home_score > game.away_score ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>
                                          {game.home_score}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-xs text-[#86868b] font-medium">vs</span>
                                    )}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-semibold truncate ${isFinal && game.home_score > game.away_score ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>
                                      {game.home_team_name || 'TBD'}
                                    </p>
                                  </div>
                                </div>

                                {/* Meta line */}
                                <div className="flex items-center justify-center gap-2 mt-1">
                                  <span className="text-[11px] text-[#86868b] font-medium">{game.age_group} {game.division_level}</span>
                                  <span className="text-[11px] text-[#d1d1d6]">·</span>
                                  <span className="text-[11px] text-[#86868b] capitalize">{game.game_type.replace('_', ' ')}</span>
                                  {game.game_number > 0 && (
                                    <>
                                      <span className="text-[11px] text-[#d1d1d6]">·</span>
                                      <span className="text-[11px] text-[#86868b]">#{game.game_number}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Status badge + arrow */}
                              <div className="shrink-0 px-4 flex items-center gap-2">
                                <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${sb.classes}`}>
                                  {sb.label}
                                </span>
                                {hasStarted && (
                                  <svg className="w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                  </svg>
                                )}
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
