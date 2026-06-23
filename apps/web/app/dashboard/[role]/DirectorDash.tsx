'use client';

import { useState, useEffect } from 'react';

interface Event {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  city: string;
  state: string;
  status: string;
  division_count: number;
}

interface Game {
  id: string;
  game_number: number;
  start_time: string;
  end_time: string;
  game_type: string;
  pool_name: string;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  period: string;
  status: string;
  delay_minutes: number | null;
  delay_note: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  rink_id: string;
  rink_name: string;
  age_group: string;
  division_level: string;
  home_locker_room: string | null;
  away_locker_room: string | null;
  home_locker_room_id: string | null;
  away_locker_room_id: string | null;
}

interface StatusLogEntry {
  old_status: string;
  new_status: string;
  delay_minutes: number | null;
  note: string | null;
  changed_by: string;
  created_at: string;
}

interface LockerRoom {
  id: string;
  name: string;
  sort_order: number;
}

const API_BASE = 'https://uht.chad-157.workers.dev/api';
const HEADERS = { 'X-Dev-Bypass': 'true', 'Content-Type': 'application/json' };

const statusColors: Record<string, { bg: string; text: string; badge: string }> = {
  scheduled: { bg: 'bg-slate-50', text: 'text-slate-700', badge: 'bg-slate-200' },
  warmup: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-200' },
  in_progress: { bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-200' },
  intermission: { bg: 'bg-purple-50', text: 'text-purple-700', badge: 'bg-purple-200' },
  delayed: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-200' },
  final: { bg: 'bg-slate-100', text: 'text-slate-700', badge: 'bg-slate-300' },
};

const getStatusColor = (status: string) => statusColors[status] || statusColors.scheduled;

const formatTime = (timeStr: string) => {
  const date = new Date(timeStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const formatDateRange = (startStr: string, endStr: string) => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const startDate = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDate = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startDate} – ${endDate}`;
};

const formatStatusDisplay = (status: string) =>
  status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

export default function DirectorDash() {
  const [view, setView] = useState<'list' | 'event'>('list');
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameLoading, setGameLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockerRooms, setLockerRooms] = useState<Record<string, LockerRoom[]>>({});
  const [statusLogs, setStatusLogs] = useState<Record<string, StatusLogEntry[]>>({});
  const [showStatusLog, setShowStatusLog] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<Record<string, string>>({});

  const [statusForm, setStatusForm] = useState<Record<string, { status: string; delayMinutes: string; delayNote: string }>>({});
  const [scoreForm, setScoreForm] = useState<Record<string, { homeScore: string; awayScore: string }>>({});
  const [lockerForm, setLockerForm] = useState<Record<string, { homeLockerRoomId: string; awayLockerRoomId: string }>>({});

  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/director/my-events`, { headers: HEADERS });
      const json = await response.json();
      if (json.success) setEvents(json.data || []);
      else setError('Failed to load events');
    } catch { setError('Error connecting to server'); }
    finally { setLoading(false); }
  };

  const fetchGames = async (eventId: string) => {
    try {
      setGameLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/director/events/${eventId}/games`, { headers: HEADERS });
      const json = await response.json();
      if (json.success) setGames(json.data || []);
      else setError('Failed to load games');
    } catch { setError('Error connecting to server'); }
    finally { setGameLoading(false); }
  };

  const fetchLockerRooms = async (rinkId: string) => {
    if (lockerRooms[rinkId]) return;
    try {
      const response = await fetch(`${API_BASE}/director/rinks/${rinkId}/locker-rooms`, { headers: HEADERS });
      const json = await response.json();
      if (json.success) setLockerRooms(prev => ({ ...prev, [rinkId]: json.data || [] }));
    } catch {}
  };

  const fetchStatusLog = async (gameId: string) => {
    if (statusLogs[gameId]) return;
    try {
      const response = await fetch(`${API_BASE}/director/games/${gameId}/status-log`, { headers: HEADERS });
      const json = await response.json();
      if (json.success) setStatusLogs(prev => ({ ...prev, [gameId]: json.data || [] }));
    } catch {}
  };

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    fetchGames(event.id);
    setView('event');
    setExpandedGameId(null);
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedEvent(null);
    setGames([]);
    setExpandedGameId(null);
  };

  const handleCheckIn = async (gameId: string) => {
    try {
      setActionLoading(prev => ({ ...prev, [gameId]: true }));
      setActionError(prev => ({ ...prev, [gameId]: '' }));
      const response = await fetch(`${API_BASE}/director/games/${gameId}/check-in`, {
        method: 'PUT', headers: HEADERS, body: JSON.stringify({}),
      });
      const json = await response.json();
      if (json.success) {
        setGames(prev => prev.map(g => (g.id === gameId ? { ...g, checked_in_at: new Date().toISOString() } : g)));
      } else {
        setActionError(prev => ({ ...prev, [gameId]: 'Failed to check in' }));
      }
    } catch { setActionError(prev => ({ ...prev, [gameId]: 'Error checking in' })); }
    finally { setActionLoading(prev => ({ ...prev, [gameId]: false })); }
  };

  const handleStatusChange = async (gameId: string) => {
    const form = statusForm[gameId];
    if (!form) return;
    try {
      setActionLoading(prev => ({ ...prev, [gameId]: true }));
      setActionError(prev => ({ ...prev, [gameId]: '' }));
      const body: any = { status: form.status };
      if (form.status === 'delayed' || form.delayMinutes) body.delayMinutes = parseInt(form.delayMinutes) || 0;
      if (form.delayNote) body.delayNote = form.delayNote;
      const response = await fetch(`${API_BASE}/director/games/${gameId}/status`, {
        method: 'PUT', headers: HEADERS, body: JSON.stringify(body),
      });
      const json = await response.json();
      if (json.success) {
        setGames(prev => prev.map(g => g.id === gameId ? {
          ...g, status: form.status,
          delay_minutes: form.status === 'delayed' ? parseInt(form.delayMinutes) || 0 : null,
          delay_note: form.delayNote || null,
        } : g));
        setStatusForm(prev => { const n = { ...prev }; delete n[gameId]; return n; });
        setStatusLogs(prev => { const n = { ...prev }; delete n[gameId]; return n; });
      } else {
        setActionError(prev => ({ ...prev, [gameId]: 'Failed to update status' }));
      }
    } catch { setActionError(prev => ({ ...prev, [gameId]: 'Error updating status' })); }
    finally { setActionLoading(prev => ({ ...prev, [gameId]: false })); }
  };

  const handleScoreSave = async (gameId: string) => {
    const form = scoreForm[gameId];
    if (!form) return;
    try {
      setActionLoading(prev => ({ ...prev, [gameId]: true }));
      setActionError(prev => ({ ...prev, [gameId]: '' }));
      const response = await fetch(`${API_BASE}/director/games/${gameId}/score`, {
        method: 'PUT', headers: HEADERS,
        body: JSON.stringify({ homeScore: parseInt(form.homeScore) || 0, awayScore: parseInt(form.awayScore) || 0 }),
      });
      const json = await response.json();
      if (json.success) {
        setGames(prev => prev.map(g => g.id === gameId ? { ...g, home_score: parseInt(form.homeScore) || 0, away_score: parseInt(form.awayScore) || 0 } : g));
        setScoreForm(prev => { const n = { ...prev }; delete n[gameId]; return n; });
      } else {
        setActionError(prev => ({ ...prev, [gameId]: 'Failed to save score' }));
      }
    } catch { setActionError(prev => ({ ...prev, [gameId]: 'Error saving score' })); }
    finally { setActionLoading(prev => ({ ...prev, [gameId]: false })); }
  };

  const handleLockerRoomSave = async (gameId: string) => {
    const form = lockerForm[gameId];
    if (!form) return;
    try {
      setActionLoading(prev => ({ ...prev, [gameId]: true }));
      setActionError(prev => ({ ...prev, [gameId]: '' }));
      const response = await fetch(`${API_BASE}/director/games/${gameId}/locker-rooms`, {
        method: 'PUT', headers: HEADERS,
        body: JSON.stringify({ homeLockerRoomId: form.homeLockerRoomId || null, awayLockerRoomId: form.awayLockerRoomId || null }),
      });
      const json = await response.json();
      if (json.success) {
        const rinkId = games.find(g => g.id === gameId)?.rink_id || '';
        const homeRoom = lockerRooms[rinkId]?.find(r => r.id === form.homeLockerRoomId);
        const awayRoom = lockerRooms[rinkId]?.find(r => r.id === form.awayLockerRoomId);
        setGames(prev => prev.map(g => g.id === gameId ? {
          ...g,
          home_locker_room_id: form.homeLockerRoomId || null,
          away_locker_room_id: form.awayLockerRoomId || null,
          home_locker_room: homeRoom?.name || null,
          away_locker_room: awayRoom?.name || null,
        } : g));
        setLockerForm(prev => { const n = { ...prev }; delete n[gameId]; return n; });
      } else {
        setActionError(prev => ({ ...prev, [gameId]: 'Failed to save locker rooms' }));
      }
    } catch { setActionError(prev => ({ ...prev, [gameId]: 'Error saving locker rooms' })); }
    finally { setActionLoading(prev => ({ ...prev, [gameId]: false })); }
  };

  const getGamesByDayAndRink = (games: Game[]) => {
    const grouped: Record<string, Record<string, Game[]>> = {};
    games.forEach(game => {
      const day = new Date(game.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!grouped[day]) grouped[day] = {};
      if (!grouped[day][game.rink_name]) grouped[day][game.rink_name] = [];
      grouped[day][game.rink_name].push(game);
    });
    Object.keys(grouped).forEach(day => {
      Object.keys(grouped[day]).forEach(rink => {
        grouped[day][rink].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      });
    });
    return grouped;
  };

  /* ── Event List View ── */
  if (view === 'list') {
    return (
      <div className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
          </div>
        ) : events.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#e8e8ed] p-12 text-center shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
            <h3 className="text-lg font-bold text-[#1d1d1f] mb-2">No Events Assigned</h3>
            <p className="text-sm text-[#86868b]">You don't have any events assigned to you yet.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {events.map(event => (
              <button
                key={event.id}
                onClick={() => handleSelectEvent(event)}
                className="bg-white border border-[#e8e8ed] shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] rounded-2xl p-5 text-left hover:shadow-[0_4px_20px_-6px_rgba(0,62,121,0.12)] hover:-translate-y-0.5 transition-all"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-[#1d1d1f] mb-1">{event.name}</h3>
                    <p className="text-sm text-[#6e6e73] mb-3">{formatDateRange(event.start_date, event.end_date)}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs font-medium text-[#6e6e73] bg-[#f5f5f7] px-3 py-1.5 rounded-lg">
                        {event.city}, {event.state}
                      </span>
                      <span className="text-xs font-medium text-[#6e6e73] bg-[#f5f5f7] px-3 py-1.5 rounded-lg">
                        {event.division_count} divisions
                      </span>
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${getStatusColor(event.status).badge}`}>
                    {formatStatusDisplay(event.status)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Event Detail / Games View ── */
  if (view === 'event' && selectedEvent) {
    const gamesByDayAndRink = getGamesByDayAndRink(games);
    const days = Object.keys(gamesByDayAndRink).sort();

    return (
      <div className="space-y-6">
        <button
          onClick={handleBackToList}
          className="inline-flex items-center text-[#003e79] hover:text-[#002d5a] font-medium text-sm transition-colors"
        >
          ← Back to Events
        </button>

        <div>
          <h2 className="text-xl font-bold text-[#1d1d1f] mb-1">{selectedEvent.name}</h2>
          <p className="text-sm text-[#6e6e73]">
            {formatDateRange(selectedEvent.start_date, selectedEvent.end_date)} · {selectedEvent.city}, {selectedEvent.state}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        {gameLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" />
          </div>
        ) : games.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 text-center text-[#86868b]">
            No games scheduled for this event
          </div>
        ) : (
          <div className="space-y-8">
            {days.map(day => (
              <div key={day}>
                <h3 className="text-base font-bold text-[#1d1d1f] mb-4">{day}</h3>
                <div className="space-y-4">
                  {Object.keys(gamesByDayAndRink[day]).sort().map(rink => (
                    <div key={`${day}-${rink}`}>
                      <p className="text-sm font-semibold text-[#6e6e73] mb-3">{rink}</p>
                      <div className="space-y-3">
                        {gamesByDayAndRink[day][rink].map(game => {
                          const isExpanded = expandedGameId === game.id;
                          const colors = getStatusColor(game.status);

                          return (
                            <div key={game.id}>
                              {/* Game Card */}
                              <button
                                onClick={() => {
                                  setExpandedGameId(isExpanded ? null : game.id);
                                  if (!isExpanded) fetchLockerRooms(game.rink_id);
                                }}
                                className="w-full bg-white border border-[#e8e8ed] shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)] rounded-2xl p-4 text-left hover:shadow-[0_4px_20px_-6px_rgba(0,62,121,0.12)] transition-all"
                              >
                                <div className="flex justify-between items-start gap-3 mb-3">
                                  <div>
                                    <div className="text-sm font-bold text-[#1d1d1f] mb-1">
                                      Game #{game.game_number} · {formatTime(game.start_time)}
                                    </div>
                                    <div className="text-xs text-[#6e6e73]">
                                      {game.age_group} · {game.pool_name || game.division_level}
                                    </div>
                                  </div>
                                  <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${colors.badge} text-slate-700`}>
                                    {formatStatusDisplay(game.status)}
                                  </div>
                                </div>

                                <div className="mb-3">
                                  <div className="text-sm font-semibold text-[#1d1d1f] mb-1">
                                    {game.home_team_name} vs {game.away_team_name}
                                  </div>
                                  {(game.status === 'in_progress' || game.status === 'intermission' || game.status === 'final') && (
                                    <div className="text-lg font-bold text-[#1d1d1f]">
                                      {game.home_score} - {game.away_score}
                                    </div>
                                  )}
                                  {game.status === 'delayed' && game.delay_minutes && (
                                    <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg w-fit">
                                      Delayed {game.delay_minutes} min
                                      {game.delay_note && <span className="ml-1">· {game.delay_note}</span>}
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-2 items-center">
                                  {game.checked_in_at && (
                                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Checked In</span>
                                  )}
                                  {game.home_locker_room && (
                                    <span className="text-[10px] font-semibold text-[#6e6e73] bg-[#f5f5f7] px-2 py-1 rounded-full">Home: {game.home_locker_room}</span>
                                  )}
                                  {game.away_locker_room && (
                                    <span className="text-[10px] font-semibold text-[#6e6e73] bg-[#f5f5f7] px-2 py-1 rounded-full">Away: {game.away_locker_room}</span>
                                  )}
                                  <span className="ml-auto text-[#86868b] text-xs">{isExpanded ? '▼' : '▶'}</span>
                                </div>
                              </button>

                              {/* Expanded Actions */}
                              {isExpanded && (
                                <div className="mt-2 bg-white border border-[#e8e8ed] rounded-2xl p-5 space-y-4 shadow-[0_1px_10px_-4px_rgba(0,0,0,0.06)]">
                                  {actionError[game.id] && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{actionError[game.id]}</div>
                                  )}

                                  {/* Check In */}
                                  {!game.checked_in_at && (
                                    <button
                                      onClick={() => handleCheckIn(game.id)}
                                      disabled={actionLoading[game.id]}
                                      className="w-full bg-[#003e79] hover:bg-[#002d5a] text-white rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50 transition-colors"
                                    >
                                      {actionLoading[game.id] ? 'Checking in...' : 'Check In Game'}
                                    </button>
                                  )}

                                  {/* Status Update */}
                                  <div>
                                    <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">Update Status</label>
                                    <div className="space-y-2">
                                      <select
                                        value={statusForm[game.id]?.status || game.status}
                                        onChange={e => setStatusForm(prev => ({
                                          ...prev, [game.id]: { ...prev[game.id], status: e.target.value, delayMinutes: '', delayNote: '' },
                                        }))}
                                        className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm"
                                      >
                                        <option value="scheduled">Scheduled</option>
                                        <option value="warmup">Warmup</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="intermission">Intermission</option>
                                        <option value="delayed">Delayed</option>
                                        <option value="final">Final</option>
                                      </select>

                                      {(statusForm[game.id]?.status === 'delayed' || game.status === 'delayed') && (
                                        <div className="flex gap-2">
                                          <input type="number" placeholder="Minutes"
                                            value={statusForm[game.id]?.delayMinutes || ''}
                                            onChange={e => setStatusForm(prev => ({ ...prev, [game.id]: { ...prev[game.id], delayMinutes: e.target.value } }))}
                                            className="w-20 border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm"
                                          />
                                          <input type="text" placeholder="Note (optional)"
                                            value={statusForm[game.id]?.delayNote || ''}
                                            onChange={e => setStatusForm(prev => ({ ...prev, [game.id]: { ...prev[game.id], delayNote: e.target.value } }))}
                                            className="flex-1 border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm"
                                          />
                                        </div>
                                      )}

                                      {statusForm[game.id] && statusForm[game.id].status !== game.status && (
                                        <button
                                          onClick={() => handleStatusChange(game.id)}
                                          disabled={actionLoading[game.id]}
                                          className="w-full bg-[#003e79] hover:bg-[#002d5a] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
                                        >
                                          {actionLoading[game.id] ? 'Updating...' : 'Update Status'}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Score */}
                                  {(game.status === 'in_progress' || game.status === 'intermission' || game.status === 'final') && (
                                    <div>
                                      <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">Score</label>
                                      <div className="flex gap-2 items-center">
                                        <input type="number" min="0"
                                          value={scoreForm[game.id]?.homeScore !== undefined ? scoreForm[game.id].homeScore : game.home_score || ''}
                                          onChange={e => setScoreForm(prev => ({ ...prev, [game.id]: { ...prev[game.id], homeScore: e.target.value } }))}
                                          className="w-16 border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm text-center"
                                        />
                                        <span className="text-sm font-bold text-[#6e6e73]">-</span>
                                        <input type="number" min="0"
                                          value={scoreForm[game.id]?.awayScore !== undefined ? scoreForm[game.id].awayScore : game.away_score || ''}
                                          onChange={e => setScoreForm(prev => ({ ...prev, [game.id]: { ...prev[game.id], awayScore: e.target.value } }))}
                                          className="w-16 border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm text-center"
                                        />
                                        <button
                                          onClick={() => handleScoreSave(game.id)}
                                          disabled={actionLoading[game.id]}
                                          className="ml-auto bg-[#003e79] hover:bg-[#002d5a] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
                                        >
                                          {actionLoading[game.id] ? 'Saving...' : 'Save'}
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Locker Rooms */}
                                  <div>
                                    <label className="block text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">Locker Rooms</label>
                                    <div className="space-y-2">
                                      <div>
                                        <label className="text-xs text-[#6e6e73] block mb-1">Home Team</label>
                                        <select
                                          value={lockerForm[game.id]?.homeLockerRoomId || game.home_locker_room_id || ''}
                                          onChange={e => setLockerForm(prev => ({ ...prev, [game.id]: { ...prev[game.id], homeLockerRoomId: e.target.value } }))}
                                          className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm"
                                        >
                                          <option value="">Select locker room</option>
                                          {(lockerRooms[game.rink_id] || []).sort((a, b) => a.sort_order - b.sort_order).map(room => (
                                            <option key={room.id} value={room.id}>{room.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      <div>
                                        <label className="text-xs text-[#6e6e73] block mb-1">Away Team</label>
                                        <select
                                          value={lockerForm[game.id]?.awayLockerRoomId || game.away_locker_room_id || ''}
                                          onChange={e => setLockerForm(prev => ({ ...prev, [game.id]: { ...prev[game.id], awayLockerRoomId: e.target.value } }))}
                                          className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm"
                                        >
                                          <option value="">Select locker room</option>
                                          {(lockerRooms[game.rink_id] || []).sort((a, b) => a.sort_order - b.sort_order).map(room => (
                                            <option key={room.id} value={room.id}>{room.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                      {lockerForm[game.id] && (
                                        lockerForm[game.id].homeLockerRoomId !== (game.home_locker_room_id || '') ||
                                        lockerForm[game.id].awayLockerRoomId !== (game.away_locker_room_id || '')
                                      ) && (
                                        <button
                                          onClick={() => handleLockerRoomSave(game.id)}
                                          disabled={actionLoading[game.id]}
                                          className="w-full bg-[#003e79] hover:bg-[#002d5a] text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 transition-colors"
                                        >
                                          {actionLoading[game.id] ? 'Saving...' : 'Save Locker Rooms'}
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Status History */}
                                  <div className="border-t border-[#e8e8ed] pt-4">
                                    <button
                                      onClick={() => {
                                        setShowStatusLog(prev => ({ ...prev, [game.id]: !prev[game.id] }));
                                        if (!showStatusLog[game.id]) fetchStatusLog(game.id);
                                      }}
                                      className="flex items-center gap-2 text-sm font-semibold text-[#1d1d1f] hover:text-[#003e79] transition-colors"
                                    >
                                      {showStatusLog[game.id] ? '▼' : '▶'} Status History
                                    </button>
                                    {showStatusLog[game.id] && (
                                      <div className="mt-3 space-y-2">
                                        {(statusLogs[game.id] || []).length === 0 ? (
                                          <div className="text-xs text-[#86868b]">No status changes yet</div>
                                        ) : (
                                          (statusLogs[game.id] || []).map((log, idx) => (
                                            <div key={idx} className="text-xs bg-[#fafafa] p-3 rounded-lg border border-[#e8e8ed]">
                                              <div className="font-semibold text-[#1d1d1f]">
                                                {formatStatusDisplay(log.old_status)} → {formatStatusDisplay(log.new_status)}
                                              </div>
                                              <div className="text-[#6e6e73]">By {log.changed_by} · {new Date(log.created_at).toLocaleString()}</div>
                                              {log.delay_minutes && <div className="text-[#6e6e73]">Delay: {log.delay_minutes} min</div>}
                                              {log.note && <div className="text-[#6e6e73]">Note: {log.note}</div>}
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <div />;
}
