'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

// ============================================================================
// Types
// ============================================================================

interface Event {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface Goal {
  event_type: string;
  team_id: string;
  jersey_number: number;
  assist1_jersey?: number;
  assist2_jersey?: number;
  period: number;
}

interface Shot {
  team_id: string;
  period: number;
  shot_count: number;
}

interface LiveGame {
  id: string;
  game_number: number;
  game_type: string;
  status: 'live' | 'intermission' | 'final' | 'scheduled';
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
  goals?: Goal[];
  shots?: Shot[];
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

// ============================================================================
// Component: Status Badge
// ============================================================================

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const statusLower = status.toLowerCase();

  if (statusLower === 'live') {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="text-xs font-semibold text-red-700 uppercase tracking-widest">Live</span>
      </div>
    );
  }

  if (statusLower === 'intermission') {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
        <span className="text-xs font-semibold text-yellow-700 uppercase tracking-widest">Intermission</span>
      </div>
    );
  }

  if (statusLower === 'final') {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-widest">Final</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
      <span className="text-xs font-semibold text-gray-600 uppercase tracking-widest">Scheduled</span>
    </div>
  );
}

// ============================================================================
// Component: Game Card
// ============================================================================

interface GameCardProps {
  game: LiveGame;
}

function GameCard({ game }: GameCardProps) {
  const [expanded, setExpanded] = useState(false);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      meridiem: 'short',
    }).format(date);
  };

  // Group goals by period
  const goalsByPeriod: Record<number, Goal[]> = {};
  if (game.goals) {
    game.goals.forEach((goal) => {
      if (!goalsByPeriod[goal.period]) {
        goalsByPeriod[goal.period] = [];
      }
      goalsByPeriod[goal.period].push(goal);
    });
  }

  // Build shots table data
  const shotsTable: Record<number, { home: number; away: number }> = {};
  if (game.shots) {
    game.shots.forEach((shot) => {
      if (!shotsTable[shot.period]) {
        shotsTable[shot.period] = { home: 0, away: 0 };
      }
      if (shot.team_id === game.home_team_id) {
        shotsTable[shot.period].home = shot.shot_count;
      } else {
        shotsTable[shot.period].away = shot.shot_count;
      }
    });
  }

  return (
    <div className="bg-white border border-[#e8e8ed] rounded-2xl overflow-hidden shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_40px_-10px_rgba(0,0,0,0.12)] transition-shadow">
      {/* Header with status and division */}
      <div className="px-4 py-3 border-b border-[#e8e8ed] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusBadge status={game.status} />
        </div>
        <span className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">
          {game.age_group} • {game.division_level}
        </span>
      </div>

      {/* Main score section */}
      <div
        className="px-4 py-6 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Home team */}
          <div className="flex-1 text-right">
            <p className="text-sm text-[#6e6e73] mb-1">{game.home_team_name}</p>
            <p className="text-4xl font-bold tabular-nums text-[#1d1d1f]">{game.home_score}</p>
          </div>

          {/* Divider and period */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">
              {game.status === 'final' ? 'Final' : `P${game.period}`}
            </span>
            {game.status === 'live' && (
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>

          {/* Away team */}
          <div className="flex-1 text-left">
            <p className="text-sm text-[#6e6e73] mb-1">{game.away_team_name}</p>
            <p className="text-4xl font-bold tabular-nums text-[#1d1d1f]">{game.away_score}</p>
          </div>
        </div>
      </div>

      {/* Rink and time info */}
      <div className="px-4 py-3 border-t border-[#e8e8ed] bg-gray-50">
        <p className="text-xs text-[#86868b] mb-1">
          <span className="uppercase tracking-widest font-semibold">{game.rink_name}</span>
        </p>
        <p className="text-xs text-[#3d3d3d]">{formatTime(game.start_time)}</p>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[#e8e8ed] px-4 py-4 space-y-6 bg-gray-50">
          {/* Goals Timeline */}
          {Object.keys(goalsByPeriod).length > 0 && (
            <div>
              <h4 className="text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-3">
                Goals
              </h4>
              <div className="space-y-2">
                {Object.entries(goalsByPeriod).map(([period, goals]) => (
                  <div key={period}>
                    {goals.map((goal, idx) => {
                      const teamName =
                        goal.team_id === game.home_team_id
                          ? game.home_team_name
                          : game.away_team_name;
                      const assists = [];
                      if (goal.assist1_jersey) assists.push(goal.assist1_jersey);
                      if (goal.assist2_jersey) assists.push(goal.assist2_jersey);
                      const assistStr =
                        assists.length > 0 ? ` (A: ${assists.join(', #')})` : '';
                      return (
                        <p key={idx} className="text-sm text-[#3d3d3d]">
                          <span className="text-[#86868b] font-semibold">P{period} — </span>
                          #{goal.jersey_number} {teamName}
                          {assistStr}
                        </p>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shots Table */}
          {Object.keys(shotsTable).length > 0 && (
            <div>
              <h4 className="text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-3">
                Shots
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e8e8ed]">
                    <th className="text-left py-2 px-2 text-xs text-[#86868b] font-semibold">
                      Period
                    </th>
                    <th className="text-center py-2 px-2 text-xs text-[#86868b] font-semibold">
                      {game.home_team_name}
                    </th>
                    <th className="text-center py-2 px-2 text-xs text-[#86868b] font-semibold">
                      {game.away_team_name}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(shotsTable)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([period, shots]) => (
                      <tr key={period} className="border-b border-[#e8e8ed] last:border-0">
                        <td className="py-2 px-2 text-[#3d3d3d]">P{period}</td>
                        <td className="py-2 px-2 text-center text-[#3d3d3d] tabular-nums">
                          {shots.home}
                        </td>
                        <td className="py-2 px-2 text-center text-[#3d3d3d] tabular-nums">
                          {shots.away}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-[#86868b] pt-2">Click to collapse</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Component: Standings Table
// ============================================================================

interface StandingsTableProps {
  title: string;
  data: StandingsRow[];
}

function StandingsTable({ title, data }: StandingsTableProps) {
  return (
    <div className="bg-white border border-[#e8e8ed] rounded-2xl overflow-hidden shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)]">
      <div className="px-4 py-3 border-b border-[#e8e8ed] bg-gray-50">
        <h3 className="text-sm font-semibold text-[#1d1d1f]">{title}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e8e8ed] bg-gray-50">
              <th className="text-left py-3 px-4 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                Team
              </th>
              <th className="text-center py-3 px-2 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                GP
              </th>
              <th className="text-center py-3 px-2 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                W
              </th>
              <th className="text-center py-3 px-2 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                L
              </th>
              <th className="text-center py-3 px-2 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                T
              </th>
              <th className="text-center py-3 px-2 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                PTS
              </th>
              <th className="text-center py-3 px-2 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                GF
              </th>
              <th className="text-center py-3 px-2 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                GA
              </th>
              <th className="text-center py-3 px-2 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                +/-
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={`${row.team_id}-${idx}`}
                className="border-b border-[#e8e8ed] last:border-0 hover:bg-gray-50 transition-colors"
              >
                <td className="py-3 px-4 text-[#1d1d1f] font-medium">{row.team_name}</td>
                <td className="py-3 px-2 text-center text-[#3d3d3d] tabular-nums">
                  {row.games_played}
                </td>
                <td className="py-3 px-2 text-center text-[#3d3d3d] tabular-nums">{row.wins}</td>
                <td className="py-3 px-2 text-center text-[#3d3d3d] tabular-nums">{row.losses}</td>
                <td className="py-3 px-2 text-center text-[#3d3d3d] tabular-nums">{row.ties}</td>
                <td className="py-3 px-2 text-center text-[#1d1d1f] font-semibold tabular-nums">
                  {row.points}
                </td>
                <td className="py-3 px-2 text-center text-[#3d3d3d] tabular-nums">
                  {row.goals_for}
                </td>
                <td className="py-3 px-2 text-center text-[#3d3d3d] tabular-nums">
                  {row.goals_against}
                </td>
                <td
                  className={`py-3 px-2 text-center font-medium tabular-nums ${
                    row.goal_differential > 0
                      ? 'text-green-600'
                      : row.goal_differential < 0
                        ? 'text-red-600'
                        : 'text-[#3d3d3d]'
                  }`}
                >
                  {row.goal_differential > 0 ? '+' : ''}
                  {row.goal_differential}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Component: Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="bg-white border border-[#e8e8ed] rounded-2xl overflow-hidden shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)]"
        >
          <div className="h-32 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component: Live Scores Page
// ============================================================================

export default function ScoresPage() {
  const API_BASE = 'https://uht.chad-157.workers.dev/api';

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [standings, setStandings] = useState<StandingsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [timeAgo, setTimeAgo] = useState<string>('Just now');

  // Fetch events on mount
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch(`${API_BASE}/events`);
        const data = await res.json();
        if (data.success && data.data) {
          setEvents(data.data);
          if (data.data.length > 0) {
            setSelectedEventId(data.data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch events:', err);
      }
    };

    fetchEvents();
  }, []);

  // Fetch live games and standings
  const fetchLiveData = useCallback(async () => {
    if (!selectedEventId) return;

    try {
      const [gamesRes, standingsRes] = await Promise.all([
        fetch(`${API_BASE}/scoring/events/${selectedEventId}/live`),
        fetch(`${API_BASE}/scoring/events/${selectedEventId}/standings`),
      ]);

      const gamesData = await gamesRes.json();
      const standingsData = await standingsRes.json();

      if (gamesData.success) {
        setLiveGames(gamesData.data || []);
      }

      if (standingsData.success) {
        setStandings(standingsData.data || []);
      }

      setLastUpdated(Date.now());
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch live data:', err);
    }
  }, [selectedEventId]);

  // Initial load when event changes
  useEffect(() => {
    if (selectedEventId) {
      setLoading(true);
      fetchLiveData();
    }
  }, [selectedEventId, fetchLiveData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLiveData();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchLiveData]);

  // Update time ago display
  useEffect(() => {
    const interval = setInterval(() => {
      if (lastUpdated === 0) {
        setTimeAgo('Just now');
      } else {
        const seconds = Math.floor((Date.now() - lastUpdated) / 1000);
        if (seconds < 60) {
          setTimeAgo(`${seconds}s ago`);
        } else if (seconds < 3600) {
          setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
        } else {
          setTimeAgo(`${Math.floor(seconds / 3600)}h ago`);
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  // Group standings by age_group, division_level, then pool_name
  const groupedStandings: Record<string, Record<string, StandingsRow[]>> = {};
  standings.forEach((row) => {
    const groupKey = `${row.age_group} ${row.division_level}`;
    if (!groupedStandings[groupKey]) {
      groupedStandings[groupKey] = {};
    }
    if (!groupedStandings[groupKey][row.pool_name]) {
      groupedStandings[groupKey][row.pool_name] = [];
    }
    groupedStandings[groupKey][row.pool_name].push(row);
  });

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] text-white">
        <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">Live Scores</h1>
          <p className="text-blue-100 text-lg">
            Follow UHT games in real-time. Scores update every 30 seconds.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Event Selector */}
        {events.length > 0 && (
          <div className="mb-8">
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">
              Select Event
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full sm:w-64 px-4 py-2 border border-[#e8e8ed] rounded-lg bg-white text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Last Updated Indicator */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[#1d1d1f]">Live Games</h2>
          <p className="text-xs text-[#86868b]">Last updated: {timeAgo}</p>
        </div>

        {/* Live Games Section */}
        {loading && selectedEventId ? (
          <LoadingSkeleton />
        ) : liveGames.length === 0 ? (
          <div className="bg-white border border-[#e8e8ed] rounded-2xl p-12 text-center shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)]">
            <p className="text-[#6e6e73] text-lg">No games in progress</p>
            <p className="text-[#86868b] text-sm mt-1">Check back soon for live scores</p>
          </div>
        ) : (
          <div className="space-y-4 mb-12">
            {liveGames.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        )}

        {/* Standings Section */}
        {standings.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-[#1d1d1f] mb-6">Standings</h2>
            <div className="space-y-8">
              {Object.entries(groupedStandings).map(([groupKey, pools]) => (
                <div key={groupKey}>
                  <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4">{groupKey}</h3>
                  <div className="space-y-4">
                    {Object.entries(pools).map(([poolName, rows]) => (
                      <StandingsTable
                        key={`${groupKey}-${poolName}`}
                        title={poolName}
                        data={rows}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
