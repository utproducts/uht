'use client';

import { useState, useEffect } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

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
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
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

  // Build matrix: for each team, for each day, find opponent
  const rows = divisionRegs.map(reg => {
    const row: (string | null)[] = [];
    dayHeaders.forEach(header => {
      const gameForTeam = divisionGames.find(
        g =>
          g.start_time?.startsWith(header.date) &&
          (g.home_team_id === reg.team_id || g.away_team_id === reg.team_id)
      );
      if (gameForTeam) {
        const opponentId = gameForTeam.home_team_id === reg.team_id ? gameForTeam.away_team_id : gameForTeam.home_team_id;
        const opponentNum = teamMap.get(opponentId);
        row.push(opponentNum ? String(opponentNum) : null);
      } else {
        row.push(null);
      }
    });
    return { reg, row };
  });

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left sticky left-0 z-10 w-32">
              Team
            </th>
            {dayHeaders.map(header => (
              <th
                key={header.date}
                className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-3 py-3 text-center min-w-12"
              >
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ reg, row }) => (
            <tr key={reg.id} className="border-t border-[#e8e8ed] hover:bg-[#fafafa]">
              <td className="px-4 py-3 text-[#1d1d1f] font-semibold sticky left-0 z-10 bg-white">
                {reg.team_name}
              </td>
              {row.map((opponent, idx) => (
                <td
                  key={idx}
                  className="px-3 py-3 text-center text-[#3d3d3d] border-l border-[#e8e8ed]"
                >
                  {opponent ? (
                    <span className="inline-block w-8 h-8 flex items-center justify-center bg-[#003e79] text-white rounded-full text-xs font-semibold">
                      {opponent}
                    </span>
                  ) : (
                    <span className="text-[#86868b]">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
                  {game.home_team_name} vs {game.away_team_name}
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
    Promise.all([fetch(`${API_BASE}/events`).then(r => r.json()), fetch(`${API_BASE}/venues`).then(r => r.json())])
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
      fetch(`${API_BASE}/events/${selectedEvent.id}/divisions`).then(r => r.json()),
      fetch(`${API_BASE}/events/${selectedEvent.id}/registrations`).then(r => r.json()),
      fetch(`${API_BASE}/events/${selectedEvent.id}/games`).then(r => r.json()),
      selectedEvent.venue_id ? fetch(`${API_BASE}/venues/${selectedEvent.venue_id}/rinks`).then(r => r.json()) : Promise.resolve({ data: [] }),
    ])
      .then(([divJson, regJson, gameJson, rinkJson]) => {
        if (divJson.success && Array.isArray(divJson.data)) {
          setDivisions(divJson.data);
          if (divJson.data.length > 0 && !selectedDivision) {
            setSelectedDivision(divJson.data[0].id);
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
      const res = await fetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          num_rinks: numRinks,
          game_duration_minutes: gameDuration,
          between_games_minutes: betweenGames,
          first_game_time: firstGameTime,
          last_game_time: lastGameTime,
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Reload games
        const gameRes = await fetch(`${API_BASE}/events/${selectedEvent.id}/games`);
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
      const res = await fetch(`${API_BASE}/events/${selectedEvent.id}/games`, { method: 'DELETE' });
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
      const res = await fetch(`${API_BASE}/events/${selectedEvent.id}/publish-schedule`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        // Reload
        if (selectedEvent) {
          const gameRes = await fetch(`${API_BASE}/events/${selectedEvent.id}/games`);
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
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
                  <div className="text-2xl font-bold text-[#003e79]">{totalGames}</div>
                  <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Total Games</div>
                </div>
                <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
                  <div className="text-2xl font-bold text-[#003e79]">{gamesPerDay}</div>
                  <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">Games Per Day</div>
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
