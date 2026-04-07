'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

// Dev auth header — TODO: replace with real JWT auth when login is wired up
const devHeaders = { 'X-Dev-Bypass': 'true' };
const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, { ...opts, headers: { ...devHeaders, ...(opts.headers || {}) } });

// Types
interface Event {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string;
  venue_id: string | null;
  start_date: string;
  end_date: string;
  age_groups: string | null;
  divisions: string | null;
}

interface Division {
  id: string;
  event_id: string;
  age_group: string;
  division_level: string;
  max_teams: number;
  price_cents: number;
  period_length_minutes: number;
  num_periods: number;
}

interface Registration {
  id: string;
  event_id: string;
  event_division_id: string;
  team_id: string;
  team_name: string;
  status: string;
}

interface Game {
  id: string;
  event_id: string;
  event_division_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  venue_id: string;
  rink_id: string | null;
  rink_name: string | null;
  game_number: number;
  start_time: string | null;
  end_time: string | null;
  game_type: string;
  pool_name: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  notes: string | null;
}

interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string;
  state: string;
  num_rinks: number;
}

interface VenueRink {
  id: string;
  venue_id: string;
  name: string;
  surface_size: string | null;
  capacity: number | null;
}

// Helpers
const fmtDate = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtDateFull = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const getDayHeaders = (startDate: string, endDate: string): { date: string; label: string }[] => {
  const headers: { date: string; label: string }[] = [];
  const current = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    const label = fmtDateFull(dateStr);
    headers.push({ date: dateStr, label });
    current.setDate(current.getDate() + 1);
  }
  return headers;
};

const parseJSON = (val: string | null) => {
  try {
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
};

// Matrix Builder Component
function ScheduleMatrix({
  division,
  registrations,
  games,
  dayHeaders,
}: {
  division: Division;
  registrations: Registration[];
  games: Game[];
  dayHeaders: { date: string; label: string }[];
}) {
  const divisionRegs = registrations.filter(r => r.event_division_id === division.id);

  if (divisionRegs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
        <p className="text-[#6e6e73]">No teams registered for this division</p>
      </div>
    );
  }

  const teamMap = new Map(divisionRegs.map((r, idx) => [r.team_id, idx + 1]));
  const divisionGames = games.filter(g => g.event_division_id === division.id);
  const poolGames = divisionGames.filter(g => g.game_type === 'pool');
  const bracketGames = divisionGames.filter(g => g.game_type !== 'pool');

  // Detect pools from game data
  const poolNames = Array.from(new Set(poolGames.map(g => g.pool_name).filter(Boolean))) as string[];

  // Build matrix: for each team, for each day, find ALL opponents (can be multiple)
  const rows = divisionRegs.map(reg => {
    const teamNum = teamMap.get(reg.team_id) || 0;
    const row: { opponents: string[]; types: string[] }[] = [];
    dayHeaders.forEach(header => {
      const gamesForTeam = poolGames.filter(
        g =>
          g.start_time?.startsWith(header.date) &&
          (g.home_team_id === reg.team_id || g.away_team_id === reg.team_id)
      );
      const opponents: string[] = [];
      const types: string[] = [];
      for (const game of gamesForTeam) {
        const opponentId = game.home_team_id === reg.team_id ? game.away_team_id : game.home_team_id;
        const opponentNum = opponentId ? teamMap.get(opponentId) : null;
        opponents.push(opponentNum ? String(opponentNum) : '?');
        types.push(game.pool_name?.includes('Crossover') ? 'crossover' : 'pool');
      }
      row.push({ opponents, types });
    });
    // Find pool assignment
    const teamPool = poolGames.find(g =>
      (g.home_team_id === reg.team_id || g.away_team_id === reg.team_id) && g.pool_name && !g.pool_name.includes('Crossover')
    )?.pool_name || '';
    return { reg, row, teamNum, teamPool };
  });

  // Game type badge colors
  const gameTypeBg: Record<string, string> = {
    championship: 'bg-amber-500',
    semifinal: 'bg-[#003e79]',
    consolation: 'bg-[#6e6e73]',
    placement: 'bg-[#86868b]',
  };

  return (
    <div className="space-y-4">
      {/* Pool Play Matrix */}
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 overflow-x-auto">
        <div className="flex items-center gap-3 mb-4">
          <h4 className="font-semibold text-[#1d1d1f] text-sm">Pool Play</h4>
          {poolNames.length > 0 && (
            <div className="flex gap-2">
              {poolNames.filter(p => !p.includes('Crossover')).map(p => (
                <span key={p} className="inline-block px-2 py-0.5 bg-[#f0f7ff] text-[#003e79] text-[10px] font-semibold rounded-full">{p}</span>
              ))}
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-3 py-3 text-center w-8">#</th>
              <th className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left sticky left-0 z-10 w-40">
                Team
              </th>
              <th className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-2 py-3 text-center w-16">Pool</th>
              {dayHeaders.map(header => (
                <th
                  key={header.date}
                  className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-3 py-3 text-center min-w-16"
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ reg, row, teamNum, teamPool }) => (
              <tr key={reg.id} className="border-t border-[#e8e8ed] hover:bg-[#fafafa]">
                <td className="px-3 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-[#003e79] text-white rounded-full text-[10px] font-bold">
                    {teamNum}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#1d1d1f] font-semibold sticky left-0 z-10 bg-white text-sm">
                  {reg.team_name}
                </td>
                <td className="px-2 py-3 text-center text-[10px] text-[#6e6e73] font-medium">
                  {teamPool ? teamPool.replace('Pool ', '') : '—'}
                </td>
                {row.map((cell, idx) => (
                  <td
                    key={idx}
                    className="px-3 py-3 text-center text-[#3d3d3d] border-l border-[#e8e8ed]"
                  >
                    {cell.opponents.length > 0 ? (
                      <div className="flex items-center justify-center gap-1">
                        {cell.opponents.map((opp, oi) => (
                          <span
                            key={oi}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold ${
                              cell.types[oi] === 'crossover'
                                ? 'bg-[#00ccff] text-white'
                                : 'bg-[#003e79] text-white'
                            }`}
                          >
                            {opp}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[#86868b]">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex gap-4 text-[10px] text-[#86868b]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-[#003e79]"></span> Pool Game
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full bg-[#00ccff]"></span> Crossover
          </span>
        </div>
      </div>

      {/* Bracket Games */}
      {bracketGames.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
          <h4 className="font-semibold text-[#1d1d1f] text-sm mb-4">Bracket Play</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bracketGames
              .sort((a, b) => {
                const order = ['semifinal', 'championship', 'consolation', 'placement'];
                return order.indexOf(a.game_type) - order.indexOf(b.game_type);
              })
              .map(game => (
                <div key={game.id} className="border border-[#e8e8ed] rounded-xl p-4 flex items-center gap-4">
                  <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10px] font-bold text-white ${gameTypeBg[game.game_type] || 'bg-[#003e79]'}`}>
                    {game.game_type === 'championship' ? 'CHAMP' : game.game_type === 'semifinal' ? 'SEMI' : game.game_type === 'consolation' ? 'CONS' : 'PLACE'}
                  </span>
                  <div className="flex-1">
                    <div className="font-semibold text-[#1d1d1f] text-sm">
                      {game.home_team_name && game.away_team_name
                        ? `${game.home_team_name} vs ${game.away_team_name}`
                        : game.notes || 'TBD vs TBD'}
                    </div>
                    <div className="text-[10px] text-[#86868b] mt-0.5">
                      Game #{game.game_number}
                      {game.start_time && ` · ${new Date(game.start_time).toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`}
                      {game.rink_name && ` · ${game.rink_name}`}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Game List View Component
function GameListView({ games, divisions }: { games: Game[]; divisions: Division[] }) {
  const divisionMap = new Map(divisions.map(d => [d.id, d]));

  if (games.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
        <p className="text-[#6e6e73]">No games scheduled yet</p>
      </div>
    );
  }

  const sorted = [...games].sort((a, b) => {
    if (!a.start_time || !b.start_time) return 0;
    return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
  });

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-6 py-3 text-left">
              Game
            </th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-6 py-3 text-left">
              Time
            </th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-6 py-3 text-left">
              Rink
            </th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-6 py-3 text-left">
              Matchup
            </th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-6 py-3 text-left">
              Division
            </th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-6 py-3 text-center">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e8e8ed]">
          {sorted.map(game => {
            const div = divisionMap.get(game.event_division_id);
            const statusColor =
              game.status === 'completed'
                ? 'bg-[#f0f7ff] text-[#003e79]'
                : game.status === 'in_progress'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-[#fafafa] text-[#6e6e73]';

            return (
              <tr key={game.id} className="hover:bg-[#fafafa]">
                <td className="px-6 py-4 text-[#1d1d1f] font-semibold">#{game.game_number}</td>
                <td className="px-6 py-4 text-[#3d3d3d]">
                  {game.start_time ? new Date(game.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td className="px-6 py-4 text-[#3d3d3d]">{game.rink_name || '—'}</td>
                <td className="px-6 py-4 text-[#3d3d3d]">
                  {game.home_team_name && game.away_team_name
                    ? `${game.home_team_name} vs ${game.away_team_name}`
                    : game.notes || 'TBD vs TBD'}
                  {game.game_type !== 'pool' && (
                    <span className="ml-2 text-[10px] font-semibold text-[#003e79] uppercase">{game.game_type}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-[#6e6e73] text-xs">
                  {div ? `${div.age_group} - ${div.division_level}` : '—'}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
                    {game.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Main Component
export default function AdminSchedulePage() {
  // State
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueRinks, setVenueRinks] = useState<VenueRink[]>([]);

  const [view, setView] = useState<'matrix' | 'list'>('matrix');
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Config
  const [numRinks, setNumRinks] = useState(4);
  const [gameDuration, setGameDuration] = useState(50);
  const [betweenGames, setBetweenGames] = useState(10);
  const [firstGameTime, setFirstGameTime] = useState('12:00');
  const [lastGameTime, setLastGameTime] = useState('21:00');

  // Load data
  useEffect(() => {
    Promise.all([authFetch(`${API_BASE}/events`).then(r => r.json()), authFetch(`${API_BASE}/venues`).then(r => r.json())])
      .then(([evJson, venJson]) => {
        if (evJson.success && Array.isArray(evJson.data)) {
          setEvents(evJson.data);
        }
        if (venJson.success && Array.isArray(venJson.data)) {
          setVenues(venJson.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load event data
  useEffect(() => {
    if (!selectedEvent) {
      setDivisions([]);
      setRegistrations([]);
      setGames([]);
      setSelectedDivision(null);
      return;
    }

    Promise.all([
      authFetch(`${API_BASE}/events/${selectedEvent.slug}`).then(r => r.json()),
      authFetch(`${API_BASE}/registrations/event/${selectedEvent.id}`).then(r => r.json()),
      authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/games`).then(r => r.json()),
      selectedEvent.venue_id ? authFetch(`${API_BASE}/venues/${selectedEvent.venue_id}/rinks`).then(r => r.json()) : Promise.resolve({ data: [] }),
    ])
      .then(([eventJson, regJson, gameJson, rinkJson]) => {
        if (eventJson.success && eventJson.data?.divisions && Array.isArray(eventJson.data.divisions)) {
          setDivisions(eventJson.data.divisions);
          if (eventJson.data.divisions.length > 0 && !selectedDivision) {
            setSelectedDivision(eventJson.data.divisions[0].id);
          }
        }
        if (regJson.success && Array.isArray(regJson.data)) {
          setRegistrations(regJson.data);
        }
        if (gameJson.success && Array.isArray(gameJson.data)) {
          setGames(gameJson.data);
        }
        if (rinkJson.data && Array.isArray(rinkJson.data)) {
          setVenueRinks(rinkJson.data);
          setNumRinks(rinkJson.data.length || 4);
        }
      });
  }, [selectedEvent, selectedDivision]);

  // Handlers
  const handleGenerateSchedule = async () => {
    if (!selectedEvent) return;

    const approvedRegs = registrations.filter(r => r.status === 'approved');
    if (approvedRegs.length === 0) {
      alert('No approved registrations yet — add teams to divisions first, then generate the schedule.');
      return;
    }

    if (!confirm('Generate schedule for this event? This will create all games.')) return;

    setGenerating(true);
    try {
      // Save schedule rules first so the generator uses our config
      await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rules: [
            { ruleType: 'game_duration_minutes', ruleValue: String(gameDuration), priority: 10 },
            { ruleType: 'min_rest_minutes', ruleValue: String(betweenGames), priority: 10 },
            { ruleType: 'first_game_time', ruleValue: firstGameTime, priority: 10 },
            { ruleType: 'last_game_time', ruleValue: lastGameTime, priority: 10 },
          ],
        }),
      });

      const res = await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.success) {
        // Reload games
        const gameRes = await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/games`);
        const gameJson = await gameRes.json();
        if (gameJson.success && Array.isArray(gameJson.data)) {
          setGames(gameJson.data);
        }
      } else {
        alert('Error generating schedule: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleClearSchedule = async () => {
    if (!selectedEvent) return;
    if (!confirm('Clear all games for this event? This cannot be undone.')) return;

    try {
      const res = await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/games`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setGames([]);
      } else {
        alert('Error clearing schedule');
      }
    } catch (err) {
      alert('Error: ' + String(err));
    }
  };

  const handlePublishSchedule = async () => {
    if (!selectedEvent) return;
    if (!confirm('Publish this schedule? Teams will be notified.')) return;

    try {
      const res = await authFetch(`${API_BASE}/events/${selectedEvent.id}/publish-schedule`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        // Reload
        if (selectedEvent) {
          const gameRes = await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/games`);
          const gameJson = await gameRes.json();
          if (gameJson.success) setGames(gameJson.data);
        }
      } else {
        alert('Error publishing schedule');
      }
    } catch (err) {
      alert('Error: ' + String(err));
    }
  };

  // Compute day headers
  const dayHeaders = selectedEvent ? getDayHeaders(selectedEvent.start_date, selectedEvent.end_date) : [];

  // Stats
  const approvedTeams = registrations.filter(r => r.status === 'approved').length;
  const totalGames = games.length;
  const gamesPerDay = Math.ceil(totalGames / (dayHeaders.length || 1));

  if (loading) {
    return (
      <div className="bg-[#fafafa] min-h-full">
        <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
          <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Schedule Builder</h1>
        </div>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 text-center">
            <div className="inline-block animate-pulse">
              <div className="h-8 w-32 bg-[#e8e8ed] rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#fafafa] min-h-full">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Schedule Builder</h1>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Step 1: Event Selection */}
        <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
          <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Step 1: Select Event</h2>
          <select
            value={selectedEvent?.id || ''}
            onChange={e => {
              const ev = events.find(v => v.id === e.target.value) || null;
              setSelectedEvent(ev);
            }}
            className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
          >
            <option value="">Choose an event...</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name} — {ev.city}, {ev.state}
              </option>
            ))}
          </select>

          {selectedEvent && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#fafafa] rounded-lg p-3">
                <div className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">Event</div>
                <div className="text-[#1d1d1f] font-semibold mt-1">{selectedEvent.name}</div>
              </div>
              <div className="bg-[#fafafa] rounded-lg p-3">
                <div className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">Location</div>
                <div className="text-[#1d1d1f] font-semibold mt-1">
                  {selectedEvent.city}, {selectedEvent.state}
                </div>
              </div>
              <div className="bg-[#fafafa] rounded-lg p-3">
                <div className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">Start Date</div>
                <div className="text-[#1d1d1f] font-semibold mt-1">{fmtDateFull(selectedEvent.start_date)}</div>
              </div>
              <div className="bg-[#fafafa] rounded-lg p-3">
                <div className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">End Date</div>
                <div className="text-[#1d1d1f] font-semibold mt-1">{fmtDateFull(selectedEvent.end_date)}</div>
              </div>
            </div>
          )}
        </div>

        {selectedEvent && (
          <>
            {/* Step 2: Division Overview */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Step 2: Division Overview</h2>
              <div className="space-y-2">
                {divisions.length === 0 ? (
                  <p className="text-[#6e6e73] text-sm">No divisions configured</p>
                ) : (
                  divisions.map(div => {
                    const divRegs = registrations.filter(r => r.event_division_id === div.id && r.status === 'approved');
                    return (
                      <div
                        key={div.id}
                        onClick={() => setSelectedDivision(selectedDivision === div.id ? null : div.id)}
                        className={`border rounded-lg p-4 cursor-pointer transition ${
                          selectedDivision === div.id ? 'bg-[#f0f7ff] border-[#003e79]' : 'border-[#e8e8ed] hover:bg-[#fafafa]'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold text-[#1d1d1f]">
                              {div.age_group} — {div.division_level}
                            </div>
                            <div className="text-sm text-[#6e6e73] mt-1">
                              {divRegs.length} of {div.max_teams} teams
                            </div>
                          </div>
                          <span className="inline-block px-3 py-1 bg-[#003e79] text-white text-xs font-semibold rounded-full">
                            {divRegs.length} teams
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Step 3: Schedule Configuration */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Step 3: Schedule Configuration</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">
                    Number of Rinks
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={numRinks}
                    onChange={e => setNumRinks(parseInt(e.target.value) || 1)}
                    className="w-full border border-[#e8e8ed] rounded-xl p-2 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">
                    Game Duration (min)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="180"
                    value={gameDuration}
                    onChange={e => setGameDuration(parseInt(e.target.value) || 50)}
                    className="w-full border border-[#e8e8ed] rounded-xl p-2 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">
                    Between Games (min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={betweenGames}
                    onChange={e => setBetweenGames(parseInt(e.target.value) || 10)}
                    className="w-full border border-[#e8e8ed] rounded-xl p-2 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">
                    First Game Time
                  </label>
                  <input
                    type="time"
                    value={firstGameTime}
                    onChange={e => setFirstGameTime(e.target.value)}
                    className="w-full border border-[#e8e8ed] rounded-xl p-2 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">
                    Last Game Time
                  </label>
                  <input
                    type="time"
                    value={lastGameTime}
                    onChange={e => setLastGameTime(e.target.value)}
                    className="w-full border border-[#e8e8ed] rounded-xl p-2 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
                  />
                </div>
              </div>

              {/* Event Days Display */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">Event Days</h3>
                <div className="flex flex-wrap gap-2">
                  {dayHeaders.map(header => (
                    <span key={header.date} className="inline-block bg-[#fafafa] border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm text-[#3d3d3d]">
                      {header.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats */}
            {games.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
                  <div className="text-2xl font-bold text-[#003e79]">{totalGames}</div>
                  <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Total Games</div>
                </div>
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
                  <div className="text-2xl font-bold text-[#003e79]">{games.filter(g => g.game_type === 'pool').length}</div>
                  <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Pool Games</div>
                </div>
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
                  <div className="text-2xl font-bold text-[#003e79]">{games.filter(g => g.game_type !== 'pool').length}</div>
                  <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Bracket Games</div>
                </div>
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
                  <div className="text-2xl font-bold text-[#003e79]">{approvedTeams}</div>
                  <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Teams</div>
                </div>
              </div>
            )}

            {/* Step 4 & 5: Matrix View or Generate */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold text-[#1d1d1f]">Step 4: Schedule Matrix</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateSchedule}
                    disabled={generating || approvedTeams === 0}
                    className="px-4 py-2 bg-[#003e79] text-white hover:bg-[#002d5a] disabled:bg-[#86868b] rounded-full text-sm font-semibold transition"
                  >
                    {generating ? 'Generating...' : 'Generate Schedule'}
                  </button>
                  {games.length > 0 && (
                    <button
                      onClick={handleClearSchedule}
                      className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-full text-sm font-semibold transition"
                    >
                      Clear Schedule
                    </button>
                  )}
                </div>
              </div>

              {approvedTeams === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  No approved registrations yet — add teams to divisions first, then generate the schedule.
                </div>
              ) : games.length === 0 ? (
                <div className="bg-[#f0f7ff] border border-[#003e79]/20 rounded-lg p-4 text-sm text-[#003e79]">
                  Schedule not yet generated. Click "Generate Schedule" to create all games.
                </div>
              ) : (
                <>
                  {/* View Toggle */}
                  <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1 w-fit mb-6">
                    {(['matrix', 'list'] as const).map(v => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${
                          view === v ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                        }`}
                      >
                        {v === 'matrix' ? 'Matrix View' : 'Game List'}
                      </button>
                    ))}
                  </div>

                  {/* Matrix View */}
                  {view === 'matrix' && (
                    <div className="space-y-6">
                      {divisions.map(div => (
                        <div key={div.id}>
                          <h3 className="font-semibold text-[#1d1d1f] mb-3">
                            {div.age_group} — {div.division_level}
                          </h3>
                          <ScheduleMatrix division={div} registrations={registrations} games={games} dayHeaders={dayHeaders} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Game List View */}
                  {view === 'list' && <GameListView games={games} divisions={divisions} />}

                  {/* Publish Button */}
                  <div className="mt-6 flex gap-2">
                    <button
                      onClick={handlePublishSchedule}
                      className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-full text-sm font-semibold transition"
                    >
                      Publish Schedule
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
