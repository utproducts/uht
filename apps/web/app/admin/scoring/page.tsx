'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, X, AlertCircle, CheckCircle, Clock } from 'lucide-react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

// Interfaces
interface Event {
  id: string;
  event_name: string;
  venue_id: string;
  start_date: string;
}

interface Rink {
  id: string;
  rink_name: string;
  venue_id: string;
}

interface ScorekeeperPIN {
  id: string;
  event_id: string;
  pin_code: string;
  rink_id: string | null;
  rink_name: string | null;
  label: string | null;
  is_active: boolean;
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
}

interface GameDetail extends Game {
  events: GameEvent[];
  shots: Shot[];
}

interface GameEvent {
  id: string;
  event_type: string;
  team_id: string;
  jersey_number: number;
  assist1_jersey: number | null;
  assist2_jersey: number | null;
  penalty_type: string | null;
  penalty_minutes: number | null;
  period: number;
  details: string | null;
}

interface Shot {
  team_id: string;
  period: number;
  shot_count: number;
}

interface Contest {
  id: string;
  game_id: string;
  team_id: string;
  coach_phone: string;
  coach_name: string;
  reason: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  admin_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  game_number: number;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  age_group: string;
  division_level: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export default function ScoringPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'contests'>('overview');
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [rinks, setRinks] = useState<Rink[]>([]);
  const [pins, setPins] = useState<ScorekeeperPIN[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [gameDetails, setGameDetails] = useState<Record<string, GameDetail>>({});
  const [loading, setLoading] = useState(false);
  const [newPinForm, setNewPinForm] = useState({ pinCode: '', rinkId: '', label: '' });

  // Fetch events on mount
  useEffect(() => {
    fetchEvents();
  }, []);

  // Fetch contests on mount
  useEffect(() => {
    if (activeTab === 'contests') {
      fetchContests();
    }
  }, [activeTab]);

  const apiCall = async <T,>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> => {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Dev-Bypass': 'true',
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${endpoint}`, options);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    // All API responses wrap in { success, data }
    if (json.success !== undefined && json.data !== undefined) {
      return json.data as T;
    }
    return json as T;
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const response = await apiCall<Event[]>('GET', '/events');
      setEvents(response);
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRinks = async (venueId: string) => {
    try {
      const response = await apiCall<Rink[]>('GET', `/venues/${venueId}/rinks`);
      setRinks(response);
    } catch (error) {
      console.error('Error fetching rinks:', error);
    }
  };

  const fetchPins = async (eventId: string) => {
    try {
      setLoading(true);
      const response = await apiCall<ScorekeeperPIN[]>(
        'GET',
        `/scoring/events/${eventId}/pins`
      );
      setPins(response);
    } catch (error) {
      console.error('Error fetching pins:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async (eventId: string) => {
    try {
      setLoading(true);
      const response = await apiCall<Game[]>(
        'GET',
        `/scoring/events/${eventId}/games`
      );
      setGames(response);
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGameDetail = async (gameId: string) => {
    try {
      const response = await apiCall<GameDetail>('GET', `/scoring/games/${gameId}`);
      setGameDetails((prev) => ({ ...prev, [gameId]: response }));
    } catch (error) {
      console.error('Error fetching game detail:', error);
    }
  };

  const fetchContests = async () => {
    try {
      setLoading(true);
      const response = await apiCall<Contest[]>('GET', '/scoring/contests');
      setContests(response);
    } catch (error) {
      console.error('Error fetching contests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectEvent = async (event: Event) => {
    setSelectedEvent(event);
    setExpandedGameId(null);
    setGameDetails({});
    await Promise.all([fetchPins(event.id), fetchGames(event.id), fetchRinks(event.venue_id)]);
  };

  const handleCreatePin = async () => {
    if (!selectedEvent || !newPinForm.pinCode) {
      alert('Please enter a PIN code');
      return;
    }
    try {
      const body: Record<string, unknown> = { pinCode: newPinForm.pinCode };
      if (newPinForm.rinkId) body.rinkId = newPinForm.rinkId;
      if (newPinForm.label) body.label = newPinForm.label;
      await apiCall('POST', `/scoring/events/${selectedEvent.id}/pins`, body);
      setNewPinForm({ pinCode: '', rinkId: '', label: '' });
      await fetchPins(selectedEvent.id);
    } catch (error) {
      console.error('Error creating PIN:', error);
      alert('Failed to create PIN');
    }
  };

  const handleDeletePin = async (pinId: string) => {
    if (!selectedEvent) return;
    if (!confirm('Are you sure you want to delete this PIN?')) return;
    try {
      await apiCall('DELETE', `/scoring/events/${selectedEvent.id}/pins/${pinId}`);
      await fetchPins(selectedEvent.id);
    } catch (error) {
      console.error('Error deleting PIN:', error);
      alert('Failed to delete PIN');
    }
  };

  const handleToggleGameDetail = async (gameId: string) => {
    if (expandedGameId === gameId) {
      setExpandedGameId(null);
    } else {
      setExpandedGameId(gameId);
      if (!gameDetails[gameId]) {
        await fetchGameDetail(gameId);
      }
    }
  };

  const handleResolveContest = async (
    contestId: string,
    status: 'resolved' | 'dismissed',
    adminNotes: string
  ) => {
    try {
      await apiCall('PUT', `/scoring/contests/${contestId}`, {
        status,
        adminNotes,
      });
      await fetchContests();
    } catch (error) {
      console.error('Error updating contest:', error);
      alert('Failed to update contest');
    }
  };

  const pendingContests = contests.filter((c) => c.status === 'pending');
  const resolvedContests = contests.filter((c) => c.status !== 'pending');

  return (
    <div className="min-h-screen bg-[#fafafa] py-8">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] px-6 py-12 mb-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold text-white mb-2">Admin Scoring Dashboard</h1>
          <p className="text-blue-100">Manage scorekeepers, games, and contested decisions</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 mb-8">
        <div className="flex gap-4 border-b border-[#e8e8ed]">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-3 font-semibold text-sm transition-colors ${
              activeTab === 'overview'
                ? 'text-[#003e79] border-b-2 border-[#003e79]'
                : 'text-[#6e6e73] hover:text-[#3d3d3d]'
            }`}
          >
            Scoring Overview
          </button>
          <button
            onClick={() => setActiveTab('contests')}
            className={`px-4 py-3 font-semibold text-sm transition-colors relative ${
              activeTab === 'contests'
                ? 'text-[#003e79] border-b-2 border-[#003e79]'
                : 'text-[#6e6e73] hover:text-[#3d3d3d]'
            }`}
          >
            Contests
            {pendingContests.length > 0 && (
              <span className="absolute -top-2 -right-3 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {pendingContests.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Event Selector */}
            <div className="bg-white border border-[#e8e8ed] rounded-2xl shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-3">
                Select Event
              </label>
              <select
                value={selectedEvent?.id || ''}
                onChange={(e) => {
                  const event = events.find((ev) => ev.id === e.target.value);
                  if (event) handleSelectEvent(event);
                }}
                className="w-full max-w-md px-4 py-2 border border-[#e8e8ed] rounded-lg text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#003e79]"
              >
                <option value="">Choose an event...</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.event_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedEvent && (
              <>
                {/* Scorekeeper PINs Management */}
                <div className="bg-white border border-[#e8e8ed] rounded-2xl shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
                  <h2 className="text-lg font-bold text-[#1d1d1f] mb-6">Scorekeeper PINs</h2>

                  {/* Create PIN Form */}
                  <div className="mb-8 pb-8 border-b border-[#e8e8ed]">
                    <h3 className="text-sm font-semibold text-[#3d3d3d] mb-4">Create New PIN</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <input
                        type="text"
                        placeholder="PIN Code (4-8 digits)"
                        value={newPinForm.pinCode}
                        onChange={(e) =>
                          setNewPinForm({ ...newPinForm, pinCode: e.target.value })
                        }
                        maxLength={8}
                        className="px-4 py-2 border border-[#e8e8ed] rounded-lg text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#003e79]"
                      />
                      <select
                        value={newPinForm.rinkId}
                        onChange={(e) =>
                          setNewPinForm({ ...newPinForm, rinkId: e.target.value })
                        }
                        className="px-4 py-2 border border-[#e8e8ed] rounded-lg text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#003e79]"
                      >
                        <option value="">Optional: Select Rink</option>
                        {rinks.map((rink) => (
                          <option key={rink.id} value={rink.id}>
                            {rink.rink_name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Label (optional)"
                        value={newPinForm.label}
                        onChange={(e) =>
                          setNewPinForm({ ...newPinForm, label: e.target.value })
                        }
                        className="px-4 py-2 border border-[#e8e8ed] rounded-lg text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#003e79]"
                      />
                      <button
                        onClick={handleCreatePin}
                        className="rounded-full bg-[#003e79] hover:bg-[#002d5a] text-white font-semibold px-6 py-2 transition-colors"
                      >
                        Create PIN
                      </button>
                    </div>
                  </div>

                  {/* Existing PINs */}
                  {loading && pins.length === 0 ? (
                    <div className="space-y-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : pins.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pins.map((pin) => (
                        <div
                          key={pin.id}
                          className="bg-[#fafafa] border border-[#e8e8ed] rounded-lg p-4"
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">
                                PIN Code
                              </p>
                              <p className="font-mono text-2xl font-bold text-[#003e79] my-2">
                                {pin.pin_code}
                              </p>
                            </div>
                            <button
                              onClick={() => handleDeletePin(pin.id)}
                              className="text-red-600 hover:text-red-700 p-1"
                              title="Delete PIN"
                            >
                              <X size={18} />
                            </button>
                          </div>
                          {pin.rink_name && (
                            <p className="text-sm text-[#3d3d3d] mb-2">Rink: {pin.rink_name}</p>
                          )}
                          {pin.label && (
                            <p className="text-sm text-[#3d3d3d] mb-2">Label: {pin.label}</p>
                          )}
                          <div className="flex items-center gap-2">
                            {pin.is_active ? (
                              <>
                                <div className="w-2 h-2 bg-green-600 rounded-full" />
                                <span className="text-xs text-green-600">Active</span>
                              </>
                            ) : (
                              <>
                                <div className="w-2 h-2 bg-gray-400 rounded-full" />
                                <span className="text-xs text-gray-600">Inactive</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[#6e6e73] text-center py-8">No PINs created yet</p>
                  )}
                </div>

                {/* Games & Scores */}
                <div className="bg-white border border-[#e8e8ed] rounded-2xl shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
                  <h2 className="text-lg font-bold text-[#1d1d1f] mb-6">Games & Scores</h2>

                  {loading && games.length === 0 ? (
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : games.length > 0 ? (
                    <div className="space-y-3">
                      {games.map((game) => (
                        <div key={game.id}>
                          <button
                            onClick={() => handleToggleGameDetail(game.id)}
                            className="w-full bg-[#fafafa] border border-[#e8e8ed] rounded-lg p-4 hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <span className="text-xs bg-[#003e79] text-white px-2 py-1 rounded">
                                    Game {game.game_number}
                                  </span>
                                  <span className="text-xs text-[#6e6e73]">{game.age_group}</span>
                                  <span className="text-xs text-[#6e6e73]">{game.division_level}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="flex-1">
                                    <p className="font-semibold text-[#1d1d1f]">{game.home_team_name}</p>
                                    <p className="text-sm text-[#6e6e73]">{game.rink_name}</p>
                                  </div>
                                  <div className="text-center min-w-20">
                                    <p className="text-2xl font-bold text-[#003e79]">
                                      {game.home_score}
                                    </p>
                                  </div>
                                  <div className="text-center min-w-fit">
                                    <p className="text-sm text-[#6e6e73]">vs</p>
                                  </div>
                                  <div className="text-center min-w-20">
                                    <p className="text-2xl font-bold text-[#003e79]">
                                      {game.away_score}
                                    </p>
                                  </div>
                                  <div className="flex-1 text-right">
                                    <p className="font-semibold text-[#1d1d1f]">
                                      {game.away_team_name}
                                    </p>
                                    <span
                                      className={`text-xs inline-block mt-1 px-2 py-1 rounded ${
                                        game.status === 'completed'
                                          ? 'bg-green-100 text-green-700'
                                          : game.status === 'in_progress'
                                          ? 'bg-blue-100 text-blue-700'
                                          : 'bg-gray-100 text-gray-700'
                                      }`}
                                    >
                                      {game.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <ChevronDown
                                size={20}
                                className={`text-[#6e6e73] transition-transform ml-4 ${
                                  expandedGameId === game.id ? 'rotate-180' : ''
                                }`}
                              />
                            </div>
                          </button>

                          {/* Expanded Game Detail */}
                          {expandedGameId === game.id && gameDetails[game.id] && (
                            <div className="bg-blue-50 border border-[#e8e8ed] border-t-0 rounded-b-lg p-6 space-y-6">
                              <div>
                                <h4 className="font-semibold text-[#1d1d1f] mb-4">Goals</h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-[#e8e8ed]">
                                        <th className="text-left py-2 text-xs text-[#86868b] font-semibold">
                                          Period
                                        </th>
                                        <th className="text-left py-2 text-xs text-[#86868b] font-semibold">
                                          Team
                                        </th>
                                        <th className="text-left py-2 text-xs text-[#86868b] font-semibold">
                                          Scorer #
                                        </th>
                                        <th className="text-left py-2 text-xs text-[#86868b] font-semibold">
                                          Assists
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {gameDetails[game.id].events
                                        .filter((e) => e.event_type === 'goal')
                                        .map((event, idx) => (
                                          <tr key={idx} className="border-b border-[#e8e8ed]">
                                            <td className="py-2 text-[#1d1d1f]">{event.period}</td>
                                            <td className="py-2 text-[#1d1d1f]">
                                              {event.team_id === game.home_team_id
                                                ? game.home_team_name
                                                : game.away_team_name}
                                            </td>
                                            <td className="py-2 font-mono text-[#003e79]">
                                              #{event.jersey_number}
                                            </td>
                                            <td className="py-2 text-[#6e6e73]">
                                              {event.assist1_jersey
                                                ? `#${event.assist1_jersey}`
                                                : 'Unassisted'}{' '}
                                              {event.assist2_jersey && `#${event.assist2_jersey}`}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                  {!gameDetails[game.id].events.some(
                                    (e) => e.event_type === 'goal'
                                  ) && (
                                    <p className="text-center py-4 text-[#6e6e73]">
                                      No goals recorded yet
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div>
                                <h4 className="font-semibold text-[#1d1d1f] mb-4">Penalties</h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-[#e8e8ed]">
                                        <th className="text-left py-2 text-xs text-[#86868b] font-semibold">
                                          Period
                                        </th>
                                        <th className="text-left py-2 text-xs text-[#86868b] font-semibold">
                                          Team
                                        </th>
                                        <th className="text-left py-2 text-xs text-[#86868b] font-semibold">
                                          Player #
                                        </th>
                                        <th className="text-left py-2 text-xs text-[#86868b] font-semibold">
                                          Infraction
                                        </th>
                                        <th className="text-left py-2 text-xs text-[#86868b] font-semibold">
                                          Minutes
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {gameDetails[game.id].events
                                        .filter((e) => e.event_type === 'penalty')
                                        .map((event, idx) => (
                                          <tr key={idx} className="border-b border-[#e8e8ed]">
                                            <td className="py-2 text-[#1d1d1f]">{event.period}</td>
                                            <td className="py-2 text-[#1d1d1f]">
                                              {event.team_id === game.home_team_id
                                                ? game.home_team_name
                                                : game.away_team_name}
                                            </td>
                                            <td className="py-2 font-mono text-[#003e79]">
                                              #{event.jersey_number}
                                            </td>
                                            <td className="py-2 text-[#6e6e73]">
                                              {event.penalty_type}
                                            </td>
                                            <td className="py-2 text-[#1d1d1f]">
                                              {event.penalty_minutes}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                  {!gameDetails[game.id].events.some(
                                    (e) => e.event_type === 'penalty'
                                  ) && (
                                    <p className="text-center py-4 text-[#6e6e73]">
                                      No penalties recorded
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div>
                                <h4 className="font-semibold text-[#1d1d1f] mb-4">
                                  Shots on Goal
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="bg-white border border-[#e8e8ed] rounded-lg p-4">
                                    <p className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">
                                      {game.home_team_name}
                                    </p>
                                    <div className="grid grid-cols-3 gap-2 mt-3">
                                      {[1, 2, 3].map((period) => {
                                        const shot = gameDetails[game.id].shots.find(
                                          (s) =>
                                            s.team_id === game.home_team_id &&
                                            s.period === period
                                        );
                                        return (
                                          <div key={period} className="text-center">
                                            <p className="text-xs text-[#6e6e73]">P{period}</p>
                                            <p className="text-lg font-bold text-[#003e79]">
                                              {shot?.shot_count || 0}
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="bg-white border border-[#e8e8ed] rounded-lg p-4">
                                    <p className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">
                                      {game.away_team_name}
                                    </p>
                                    <div className="grid grid-cols-3 gap-2 mt-3">
                                      {[1, 2, 3].map((period) => {
                                        const shot = gameDetails[game.id].shots.find(
                                          (s) =>
                                            s.team_id === game.away_team_id &&
                                            s.period === period
                                        );
                                        return (
                                          <div key={period} className="text-center">
                                            <p className="text-xs text-[#6e6e73]">P{period}</p>
                                            <p className="text-lg font-bold text-[#003e79]">
                                              {shot?.shot_count || 0}
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[#6e6e73] text-center py-8">No games found for this event</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Contests Tab */}
        {activeTab === 'contests' && (
          <div className="space-y-8">
            {/* Pending Contests */}
            <div className="bg-white border border-[#e8e8ed] rounded-2xl shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <div className="flex items-center gap-3 mb-6">
                <AlertCircle size={24} className="text-red-600" />
                <h2 className="text-lg font-bold text-[#1d1d1f]">
                  Pending Contests ({pendingContests.length})
                </h2>
              </div>

              {loading && pendingContests.length === 0 ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : pendingContests.length > 0 ? (
                <div className="space-y-4">
                  {pendingContests.map((contest) => (
                    <ContestCard
                      key={contest.id}
                      contest={contest}
                      onResolve={handleResolveContest}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[#6e6e73] text-center py-8">No pending contests</p>
              )}
            </div>

            {/* Resolved Contests */}
            {resolvedContests.length > 0 && (
              <details className="bg-white border border-[#e8e8ed] rounded-2xl shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
                <summary className="flex items-center gap-3 cursor-pointer mb-6">
                  <CheckCircle size={24} className="text-green-600" />
                  <h2 className="text-lg font-bold text-[#1d1d1f]">
                    Resolved / Dismissed ({resolvedContests.length})
                  </h2>
                  <ChevronDown size={20} className="text-[#6e6e73] ml-auto" />
                </summary>

                <div className="space-y-4">
                  {resolvedContests.map((contest) => (
                    <div
                      key={contest.id}
                      className="bg-[#fafafa] border border-[#e8e8ed] rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-[#1d1d1f]">
                              Game {contest.game_number}
                            </span>
                            <span className="text-xs text-[#6e6e73]">{contest.age_group}</span>
                            <span className="text-xs text-[#6e6e73]">
                              {contest.division_level}
                            </span>
                          </div>
                          <p className="text-sm text-[#3d3d3d] mb-2">
                            {contest.home_team_name} {contest.home_score} -{' '}
                            {contest.away_score} {contest.away_team_name}
                          </p>
                          <p className="text-sm text-[#3d3d3d]">
                            Coach: {contest.coach_name} ({contest.coach_phone})
                          </p>
                          <p className="text-sm text-[#6e6e73] mt-2">{contest.reason}</p>
                        </div>
                        <span
                          className={`text-xs px-3 py-1 rounded-full font-semibold ${
                            contest.status === 'resolved'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {contest.status}
                        </span>
                      </div>
                      {contest.admin_notes && (
                        <div className="mt-3 p-3 bg-white rounded border border-[#e8e8ed]">
                          <p className="text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">
                            Admin Notes
                          </p>
                          <p className="text-sm text-[#3d3d3d]">{contest.admin_notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Contest Card Component
function ContestCard({
  contest,
  onResolve,
}: {
  contest: Contest;
  onResolve: (
    contestId: string,
    status: 'resolved' | 'dismissed',
    adminNotes: string
  ) => void;
}) {
  const [adminNotes, setAdminNotes] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-[#1d1d1f]">
                Game {contest.game_number}
              </span>
              <span className="text-xs text-[#6e6e73]">{contest.age_group}</span>
              <span className="text-xs text-[#6e6e73]">{contest.division_level}</span>
            </div>
            <p className="text-sm text-[#3d3d3d]">
              {contest.home_team_name} {contest.home_score} - {contest.away_score}{' '}
              {contest.away_team_name}
            </p>
            <p className="text-sm text-[#3d3d3d] mt-1">
              <span className="font-semibold">Coach:</span> {contest.coach_name} (
              {contest.coach_phone})
            </p>
            <p className="text-sm text-[#6e6e73] mt-2 italic">{contest.reason}</p>
          </div>
          <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
            PENDING
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-red-200 space-y-4">
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">
              Admin Notes
            </label>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Document your decision and reasoning..."
              className="w-full px-4 py-3 border border-[#e8e8ed] rounded-lg text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#003e79]"
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                onResolve(contest.id, 'resolved', adminNotes);
                setAdminNotes('');
                setIsExpanded(false);
              }}
              className="flex-1 rounded-full bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 transition-colors"
            >
              Resolve
            </button>
            <button
              onClick={() => {
                onResolve(contest.id, 'dismissed', adminNotes);
                setAdminNotes('');
                setIsExpanded(false);
              }}
              className="flex-1 rounded-full bg-gray-600 hover:bg-gray-700 text-white font-semibold px-4 py-2 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
