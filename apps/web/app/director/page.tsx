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

const getStatusColor = (status: string) => {
  return statusColors[status] || statusColors.scheduled;
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (timeStr: string) => {
  const date = new Date(timeStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDateRange = (startStr: string, endStr: string) => {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const startDate = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endDate = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startDate} – ${endDate}`;
};

const formatStatusDisplay = (status: string) => {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function DirectorDashboard() {
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

  // State for action forms
  const [statusForm, setStatusForm] = useState<Record<string, { status: string; delayMinutes: string; delayNote: string }>>({});
  const [scoreForm, setScoreForm] = useState<Record<string, { homeScore: string; awayScore: string }>>({});
  const [lockerForm, setLockerForm] = useState<Record<string, { homeLockerRoomId: string; awayLockerRoomId: string }>>({});

  // Fetch events on mount
  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/director/my-events`, { headers: HEADERS });
      const json = await response.json();
      if (json.success) {
        setEvents(json.data || []);
      } else {
        setError('Failed to load events');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async (eventId: string) => {
    try {
      setGameLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE}/director/events/${eventId}/games`, { headers: HEADERS });
      const json = await response.json();
      if (json.success) {
        setGames(json.data || []);
      } else {
        setError('Failed to load games');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error(err);
    } finally {
      setGameLoading(false);
    }
  };

  const fetchLockerRooms = async (rinkId: string) => {
    if (lockerRooms[rinkId]) return;
    try {
      const response = await fetch(`${API_BASE}/director/rinks/${rinkId}/locker-rooms`, { headers: HEADERS });
      const json = await response.json();
      if (json.success) {
        setLockerRooms(prev => ({ ...prev, [rinkId]: json.data || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch locker rooms', err);
    }
  };

  const fetchStatusLog = async (gameId: string) => {
    if (statusLogs[gameId]) return;
    try {
      const response = await fetch(`${API_BASE}/director/games/${gameId}/status-log`, { headers: HEADERS });
      const json = await response.json();
      if (json.success) {
        setStatusLogs(prev => ({ ...prev, [gameId]: json.data || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch status log', err);
    }
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
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify({}),
      });
      const json = await response.json();
      if (json.success) {
        setGames(prev =>
          prev.map(g => (g.id === gameId ? { ...g, checked_in_at: new Date().toISOString() } : g))
        );
      } else {
        setActionError(prev => ({ ...prev, [gameId]: 'Failed to check in' }));
      }
    } catch (err) {
      setActionError(prev => ({ ...prev, [gameId]: 'Error checking in' }));
      console.error(err);
    } finally {
      setActionLoading(prev => ({ ...prev, [gameId]: false }));
    }
  };

  const handleStatusChange = async (gameId: string) => {
    const form = statusForm[gameId];
    if (!form) return;
    try {
      setActionLoading(prev => ({ ...prev, [gameId]: true }));
      setActionError(prev => ({ ...prev, [gameId]: '' }));
      const body: any = { status: form.status };
      if (form.status === 'delayed' || form.delayMinutes) {
        body.delayMinutes = parseInt(form.delayMinutes) || 0;
      }
      if (form.delayNote) {
        body.delayNote = form.delayNote;
      }
      const response = await fetch(`${API_BASE}/director/games/${gameId}/status`, {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (json.success) {
        setGames(prev =>
          prev.map(g =>
            g.id === gameId
              ? {
                  ...g,
                  status: form.status,
                  delay_minutes: form.status === 'delayed' ? parseInt(form.delayMinutes) || 0 : null,
                  delay_note: form.delayNote || null,
                }
              : g
          )
        );
        setStatusForm(prev => {
          const newForm = { ...prev };
          delete newForm[gameId];
          return newForm;
        });
        setStatusLogs(prev => {
          const newLogs = { ...prev };
          delete newLogs[gameId];
          return newLogs;
        });
      } else {
        setActionError(prev => ({ ...prev, [gameId]: 'Failed to update status' }));
      }
    } catch (err) {
      setActionError(prev => ({ ...prev, [gameId]: 'Error updating status' }));
      console.error(err);
    } finally {
      setActionLoading(prev => ({ ...prev, [gameId]: false }));
    }
  };

  const handleScoreSave = async (gameId: string) => {
    const form = scoreForm[gameId];
    if (!form) return;
    try {
      setActionLoading(prev => ({ ...prev, [gameId]: true }));
      setActionError(prev => ({ ...prev, [gameId]: '' }));
      const response = await fetch(`${API_BASE}/director/games/${gameId}/score`, {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify({
          homeScore: parseInt(form.homeScore) || 0,
          awayScore: parseInt(form.awayScore) || 0,
        }),
      });
      const json = await response.json();
      if (json.success) {
        setGames(prev =>
          prev.map(g =>
            g.id === gameId
              ? { ...g, home_score: parseInt(form.homeScore) || 0, away_score: parseInt(form.awayScore) || 0 }
              : g
          )
        );
        setScoreForm(prev => {
          const newForm = { ...prev };
          delete newForm[gameId];
          return newForm;
        });
      } else {
        setActionError(prev => ({ ...prev, [gameId]: 'Failed to save score' }));
      }
    } catch (err) {
      setActionError(prev => ({ ...prev, [gameId]: 'Error saving score' }));
      console.error(err);
    } finally {
      setActionLoading(prev => ({ ...prev, [gameId]: false }));
    }
  };

  const handleLockerRoomSave = async (gameId: string) => {
    const form = lockerForm[gameId];
    if (!form) return;
    try {
      setActionLoading(prev => ({ ...prev, [gameId]: true }));
      setActionError(prev => ({ ...prev, [gameId]: '' }));
      const response = await fetch(`${API_BASE}/director/games/${gameId}/locker-rooms`, {
        method: 'PUT',
        headers: HEADERS,
        body: JSON.stringify({
          homeLockerRoomId: form.homeLockerRoomId || null,
          awayLockerRoomId: form.awayLockerRoomId || null,
        }),
      });
      const json = await response.json();
      if (json.success) {
        const homeRoom = lockerRooms[games.find(g => g.id === gameId)?.rink_id || '']?.find(
          r => r.id === form.homeLockerRoomId
        );
        const awayRoom = lockerRooms[games.find(g => g.id === gameId)?.rink_id || '']?.find(
          r => r.id === form.awayLockerRoomId
        );
        setGames(prev =>
          prev.map(g =>
            g.id === gameId
              ? {
                  ...g,
                  home_locker_room_id: form.homeLockerRoomId || null,
                  away_locker_room_id: form.awayLockerRoomId || null,
                  home_locker_room: homeRoom?.name || null,
                  away_locker_room: awayRoom?.name || null,
                }
              : g
          )
        );
        setLockerForm(prev => {
          const newForm = { ...prev };
          delete newForm[gameId];
          return newForm;
        });
      } else {
        setActionError(prev => ({ ...prev, [gameId]: 'Failed to save locker rooms' }));
      }
    } catch (err) {
      setActionError(prev => ({ ...prev, [gameId]: 'Error saving locker rooms' }));
      console.error(err);
    } finally {
      setActionLoading(prev => ({ ...prev, [gameId]: false }));
    }
  };

  const getGamesByDayAndRink = (games: Game[]) => {
    const grouped: Record<string, Record<string, Game[]>> = {};
    games.forEach(game => {
      const day = new Date(game.start_time).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
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

  if (view === 'list') {
    return (
      <div className="min-h-screen bg-[#fafafa]">
        {/* Hero Header */}
        <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] px-4 py-8 sm:px-6 sm:py-12 text-white">
          <h1 className="text-3xl sm:text-4xl font-bold mb-2">Director Dashboard</h1>
          <p className="text-blue-100">Manage your tournament events and games</p>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="text-slate-600">Loading events...</div>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-slate-600">No events assigned to you yet</div>
            </div>
          ) : (
            <div className="grid gap-4 md:gap-6">
              {events.map(event => (
                <button
                  key={event.id}
                  onClick={() => handleSelectEvent(event)}
                  className="bg-white border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] rounded-xl p-5 sm:p-6 text-left hover:shadow-[0_1px_30px_-8px_rgba(0,0,0,0.12)] transition-shadow"
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-1">{event.name}</h3>
                      <p className="text-slate-600 text-sm sm:text-base mb-3">
                        {formatDateRange(event.start_date, event.end_date)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-slate-700 text-sm bg-slate-50 px-3 py-1.5 rounded-lg">
                          📍 {event.city}, {event.state}
                        </span>
                        <span className="text-slate-700 text-sm bg-slate-50 px-3 py-1.5 rounded-lg">
                          🏒 {event.division_count} divisions
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className={`inline-block px-3 py-1.5 rounded-lg text-sm font-medium ${getStatusColor(event.status).badge}`}>
                        {formatStatusDisplay(event.status)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'event' && selectedEvent) {
    const gamesByDayAndRink = getGamesByDayAndRink(games);
    const days = Object.keys(gamesByDayAndRink).sort();

    return (
      <div className="min-h-screen bg-[#fafafa]">
        {/* Header with Back Button */}
        <div className="bg-white border-b border-[#e8e8ed]">
          <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 sm:px-6">
            <button
              onClick={handleBackToList}
              className="mb-4 inline-flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              ← Back to Events
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-1">{selectedEvent.name}</h1>
            <p className="text-slate-600 text-sm sm:text-base">
              {formatDateRange(selectedEvent.start_date, selectedEvent.end_date)} • {selectedEvent.city}, {selectedEvent.state}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 sm:py-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
              {error}
            </div>
          )}

          {gameLoading ? (
            <div className="text-center py-12">
              <div className="text-slate-600">Loading games...</div>
            </div>
          ) : games.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-slate-600">No games scheduled for this event</div>
            </div>
          ) : (
            <div className="space-y-8">
              {days.map(day => (
                <div key={day}>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-4 px-4 sm:px-0">{day}</h2>
                  <div className="space-y-4">
                    {Object.keys(gamesByDayAndRink[day])
                      .sort()
                      .map(rink => (
                        <div key={`${day}-${rink}`}>
                          <h3 className="text-base font-semibold text-slate-700 mb-3 px-4 sm:px-0">🏒 {rink}</h3>
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
                                      if (!isExpanded) {
                                        fetchLockerRooms(game.rink_id);
                                      }
                                    }}
                                    className="w-full bg-white border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] rounded-xl p-4 sm:p-5 text-left hover:shadow-[0_1px_30px_-8px_rgba(0,0,0,0.12)] transition-all"
                                  >
                                    <div className="flex justify-between items-start gap-3 mb-3">
                                      <div>
                                        <div className="text-sm font-semibold text-slate-900 mb-1">
                                          Game #{game.game_number} • {formatTime(game.start_time)}
                                        </div>
                                        <div className="text-sm text-slate-600 mb-2">
                                          {game.age_group} • {game.pool_name || game.division_level}
                                        </div>
                                      </div>
                                      <div className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${colors.badge} text-slate-700`}>
                                        {formatStatusDisplay(game.status)}
                                      </div>
                                    </div>

                                    <div className="mb-3">
                                      <div className="text-sm font-semibold text-slate-900 mb-2">
                                        {game.home_team_name} vs {game.away_team_name}
                                      </div>
                                      {(game.status === 'in_progress' || game.status === 'intermission' || game.status === 'final') && (
                                        <div className="text-lg font-bold text-slate-900">
                                          {game.home_score} - {game.away_score}
                                        </div>
                                      )}
                                      {game.status === 'delayed' && game.delay_minutes && (
                                        <div className="text-sm text-amber-700 bg-amber-50 px-2 py-1 rounded w-fit mb-2">
                                          ⏱ Delayed {game.delay_minutes} min
                                          {game.delay_note && <div className="text-xs mt-1">{game.delay_note}</div>}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap gap-2 items-center">
                                      {game.checked_in_at && (
                                        <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                                          ✓ Checked In
                                        </div>
                                      )}
                                      {game.home_locker_room && (
                                        <div className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                                          Home: {game.home_locker_room}
                                        </div>
                                      )}
                                      {game.away_locker_room && (
                                        <div className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                                          Away: {game.away_locker_room}
                                        </div>
                                      )}
                                      <div className="ml-auto text-slate-400">
                                        {isExpanded ? '▼' : '▶'}
                                      </div>
                                    </div>
                                  </button>

                                  {/* Expanded Actions */}
                                  {isExpanded && (
                                    <div className="mt-2 bg-white border border-[#e8e8ed] rounded-xl p-4 sm:p-5 space-y-4">
                                      {actionError[game.id] && (
                                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                          {actionError[game.id]}
                                        </div>
                                      )}

                                      {/* Check In Button */}
                                      {!game.checked_in_at && (
                                        <button
                                          onClick={() => handleCheckIn(game.id)}
                                          disabled={actionLoading[game.id]}
                                          className="w-full bg-gradient-to-r from-[#003e79] to-[#005599] text-white rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-50"
                                        >
                                          {actionLoading[game.id] ? 'Checking in...' : '✓ Check In Game'}
                                        </button>
                                      )}

                                      {/* Status Update */}
                                      <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-2">Update Status</label>
                                        <div className="space-y-2">
                                          <select
                                            value={statusForm[game.id]?.status || game.status}
                                            onChange={e => {
                                              setStatusForm(prev => ({
                                                ...prev,
                                                [game.id]: {
                                                  ...prev[game.id],
                                                  status: e.target.value,
                                                  delayMinutes: '',
                                                  delayNote: '',
                                                },
                                              }));
                                            }}
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
                                              <input
                                                type="number"
                                                placeholder="Minutes"
                                                value={statusForm[game.id]?.delayMinutes || ''}
                                                onChange={e => {
                                                  setStatusForm(prev => ({
                                                    ...prev,
                                                    [game.id]: {
                                                      ...prev[game.id],
                                                      delayMinutes: e.target.value,
                                                    },
                                                  }));
                                                }}
                                                className="w-20 border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm"
                                              />
                                              <input
                                                type="text"
                                                placeholder="Note (optional)"
                                                value={statusForm[game.id]?.delayNote || ''}
                                                onChange={e => {
                                                  setStatusForm(prev => ({
                                                    ...prev,
                                                    [game.id]: {
                                                      ...prev[game.id],
                                                      delayNote: e.target.value,
                                                    },
                                                  }));
                                                }}
                                                className="flex-1 border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm"
                                              />
                                            </div>
                                          )}

                                          {(statusForm[game.id] && statusForm[game.id].status !== game.status) && (
                                            <button
                                              onClick={() => handleStatusChange(game.id)}
                                              disabled={actionLoading[game.id]}
                                              className="w-full bg-gradient-to-r from-[#003e79] to-[#005599] text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                                            >
                                              {actionLoading[game.id] ? 'Updating...' : 'Update Status'}
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Edit Score */}
                                      {(game.status === 'in_progress' || game.status === 'intermission' || game.status === 'final') && (
                                        <div>
                                          <label className="block text-sm font-semibold text-slate-900 mb-2">Score</label>
                                          <div className="flex gap-2 items-center">
                                            <input
                                              type="number"
                                              min="0"
                                              value={scoreForm[game.id]?.homeScore !== undefined ? scoreForm[game.id].homeScore : game.home_score || ''}
                                              onChange={e => {
                                                setScoreForm(prev => ({
                                                  ...prev,
                                                  [game.id]: {
                                                    ...prev[game.id],
                                                    homeScore: e.target.value,
                                                  },
                                                }));
                                              }}
                                              className="w-16 border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm text-center"
                                            />
                                            <span className="text-sm font-semibold text-slate-700">-</span>
                                            <input
                                              type="number"
                                              min="0"
                                              value={scoreForm[game.id]?.awayScore !== undefined ? scoreForm[game.id].awayScore : game.away_score || ''}
                                              onChange={e => {
                                                setScoreForm(prev => ({
                                                  ...prev,
                                                  [game.id]: {
                                                    ...prev[game.id],
                                                    awayScore: e.target.value,
                                                  },
                                                }));
                                              }}
                                              className="w-16 border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm text-center"
                                            />
                                            <button
                                              onClick={() => handleScoreSave(game.id)}
                                              disabled={actionLoading[game.id]}
                                              className="ml-auto bg-gradient-to-r from-[#003e79] to-[#005599] text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                                            >
                                              {actionLoading[game.id] ? 'Saving...' : 'Save'}
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {/* Assign Locker Rooms */}
                                      <div>
                                        <label className="block text-sm font-semibold text-slate-900 mb-2">Locker Rooms</label>
                                        <div className="space-y-2">
                                          <div>
                                            <label className="text-xs text-slate-600 block mb-1">Home Team</label>
                                            <select
                                              value={lockerForm[game.id]?.homeLockerRoomId || game.home_locker_room_id || ''}
                                              onChange={e => {
                                                setLockerForm(prev => ({
                                                  ...prev,
                                                  [game.id]: {
                                                    ...prev[game.id],
                                                    homeLockerRoomId: e.target.value,
                                                  },
                                                }));
                                              }}
                                              className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm"
                                            >
                                              <option value="">Select locker room</option>
                                              {(lockerRooms[game.rink_id] || [])
                                                .sort((a, b) => a.sort_order - b.sort_order)
                                                .map(room => (
                                                  <option key={room.id} value={room.id}>
                                                    {room.name}
                                                  </option>
                                                ))}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-xs text-slate-600 block mb-1">Away Team</label>
                                            <select
                                              value={lockerForm[game.id]?.awayLockerRoomId || game.away_locker_room_id || ''}
                                              onChange={e => {
                                                setLockerForm(prev => ({
                                                  ...prev,
                                                  [game.id]: {
                                                    ...prev[game.id],
                                                    awayLockerRoomId: e.target.value,
                                                  },
                                                }));
                                              }}
                                              className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm"
                                            >
                                              <option value="">Select locker room</option>
                                              {(lockerRooms[game.rink_id] || [])
                                                .sort((a, b) => a.sort_order - b.sort_order)
                                                .map(room => (
                                                  <option key={room.id} value={room.id}>
                                                    {room.name}
                                                  </option>
                                                ))}
                                            </select>
                                          </div>
                                          {(lockerForm[game.id] &&
                                            (lockerForm[game.id].homeLockerRoomId !== (game.home_locker_room_id || '') ||
                                              lockerForm[game.id].awayLockerRoomId !== (game.away_locker_room_id || ''))) && (
                                            <button
                                              onClick={() => handleLockerRoomSave(game.id)}
                                              disabled={actionLoading[game.id]}
                                              className="w-full bg-gradient-to-r from-[#003e79] to-[#005599] text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
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
                                            if (!showStatusLog[game.id]) {
                                              fetchStatusLog(game.id);
                                            }
                                          }}
                                          className="flex items-center gap-2 text-sm font-semibold text-slate-900 hover:text-slate-700"
                                        >
                                          {showStatusLog[game.id] ? '▼' : '▶'} Status History
                                        </button>
                                        {showStatusLog[game.id] && (
                                          <div className="mt-3 space-y-2">
                                            {(statusLogs[game.id] || []).length === 0 ? (
                                              <div className="text-xs text-slate-600">No status changes yet</div>
                                            ) : (
                                              (statusLogs[game.id] || []).map((log, idx) => (
                                                <div key={idx} className="text-xs bg-slate-50 p-2 rounded border border-[#e8e8ed]">
                                                  <div className="font-semibold text-slate-900">
                                                    {formatStatusDisplay(log.old_status)} → {formatStatusDisplay(log.new_status)}
                                                  </div>
                                                  <div className="text-slate-600">By {log.changed_by}</div>
                                                  <div className="text-slate-600">
                                                    {new Date(log.created_at).toLocaleString()}
                                                  </div>
                                                  {log.delay_minutes && (
                                                    <div className="text-slate-600">Delay: {log.delay_minutes} min</div>
                                                  )}
                                                  {log.note && <div className="text-slate-600">Note: {log.note}</div>}
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
      </div>
    );
  }

  return null;
}
