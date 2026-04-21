'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

// ============================================================================
// Types
// ============================================================================
interface GameSheet {
  game: any;
  goals: any[];
  penalties: any[];
  allEvents: any[];
  shots: any[];
  homeLineup: any[];
  awayLineup: any[];
  threeStars: any[];
  goalieStats: any[];
  shootout: any[];
  periodScores: any[];
  notes: any[];
  coaches: any[];
  officials: any[];
}

// ============================================================================
// Main Component
// ============================================================================
function GameSheetInner() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get('gameId');
  const [data, setData] = useState<GameSheet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;
    fetch(`${API_BASE}/scoring/games/${gameId}/sheet`)
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [gameId]);

  if (loading) return <Loading />;
  if (!data) return <NotFound />;

  const g = data.game;
  const isFinal = g.status === 'final';
  const isLive = g.status === 'in_progress' || g.status === 'intermission';

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  // Group goals by period
  const goalsByPeriod: Record<number, any[]> = {};
  data.goals.forEach(goal => {
    const p = goal.period || 1;
    if (!goalsByPeriod[p]) goalsByPeriod[p] = [];
    goalsByPeriod[p].push(goal);
  });

  // Group penalties by team
  const homePenalties = data.penalties.filter(p => p.team_id === g.home_team_id);
  const awayPenalties = data.penalties.filter(p => p.team_id === g.away_team_id);

  // Build shots table
  const shotsMap: Record<string, Record<number, number>> = {};
  data.shots.forEach(s => {
    if (!shotsMap[s.team_id]) shotsMap[s.team_id] = {};
    shotsMap[s.team_id][s.period] = s.shot_count;
  });
  const periods = [1, 2, 3];
  if (g.is_overtime) periods.push(4);

  const homeShots = periods.map(p => shotsMap[g.home_team_id]?.[p] || 0);
  const awayShots = periods.map(p => shotsMap[g.away_team_id]?.[p] || 0);
  const homeTotalShots = homeShots.reduce((a, b) => a + b, 0);
  const awayTotalShots = awayShots.reduce((a, b) => a + b, 0);

  // Goalies by team
  const homeGoalies = data.goalieStats.filter(gs => gs.team_id === g.home_team_id);
  const awayGoalies = data.goalieStats.filter(gs => gs.team_id === g.away_team_id);

  // Coaches by team
  const homeCoaches = data.coaches.filter(c => c.team_id === g.home_team_id);
  const awayCoaches = data.coaches.filter(c => c.team_id === g.away_team_id);

  return (
    <div className="min-h-screen bg-[#f0f2f5] pb-12">
      {/* Header Bar */}
      <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/scores" className="text-white/70 text-sm font-semibold hover:text-white transition-colors">
            ← Back to Scores
          </a>
          <div className="flex items-center gap-2">
            <img src="/uht-logo.png" alt="UHT" className="h-7 w-auto" />
            <span className="text-white font-semibold text-sm">Score Sheet</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-4">

        {/* ============ GAME INFO HEADER ============ */}
        <div className="bg-white rounded-2xl border border-[#e0e0e0] shadow-sm overflow-hidden">
          {/* Status bar */}
          <div className={`px-4 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest ${
            isLive ? 'bg-red-600 text-white' : isFinal ? 'bg-[#1d1d1f] text-white' : 'bg-[#f5f5f7] text-[#86868b]'
          }`}>
            <span>{g.event_name}</span>
            <span className="flex items-center gap-1.5">
              {isLive && <span className="w-2 h-2 bg-white rounded-full animate-pulse" />}
              {isLive ? `LIVE — P${g.period}` : isFinal ? 'FINAL' : g.status?.toUpperCase()}
            </span>
          </div>

          {/* Game metadata */}
          <div className="px-4 py-2 bg-[#fafafa] border-b border-[#e8e8ed] grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-[#6e6e73]">
            <div><span className="font-semibold text-[#86868b]">Game</span> #{g.game_number}</div>
            <div><span className="font-semibold text-[#86868b]">Date</span> {formatDate(g.start_time)}</div>
            <div><span className="font-semibold text-[#86868b]">Time</span> {formatTime(g.start_time)}</div>
            <div><span className="font-semibold text-[#86868b]">Rink</span> {g.rink_name || g.venue_name}</div>
          </div>
          <div className="px-4 py-2 bg-[#fafafa] border-b border-[#e8e8ed] grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-[#6e6e73]">
            <div><span className="font-semibold text-[#86868b]">Division</span> {g.age_group} {g.division_level}</div>
            <div><span className="font-semibold text-[#86868b]">Type</span> {g.game_type?.charAt(0).toUpperCase() + g.game_type?.slice(1)} {g.pool_name ? `— ${g.pool_name}` : ''}</div>
            <div><span className="font-semibold text-[#86868b]">Period</span> {g.period_length_minutes || 12} min</div>
            {g.scorekeeper_name && <div><span className="font-semibold text-[#86868b]">Scorekeeper</span> {g.scorekeeper_name}</div>}
          </div>

          {/* SCOREBOARD */}
          <div className="px-6 py-8">
            <div className="flex items-center justify-center gap-4 sm:gap-8">
              {/* Home */}
              <div className="text-center flex-1">
                {g.home_team_logo && <img src={g.home_team_logo} alt="" className="h-12 w-12 mx-auto mb-2 object-contain" />}
                <p className="text-base sm:text-lg font-bold text-[#1d1d1f] leading-tight">{g.home_team_name}</p>
                <p className="text-[10px] text-[#86868b] uppercase tracking-widest mt-0.5">Home</p>
              </div>

              {/* Score */}
              <div className="flex items-baseline gap-3 sm:gap-5">
                <span className="text-6xl sm:text-7xl font-black text-[#1d1d1f] tabular-nums">{g.home_score}</span>
                <span className="text-3xl font-bold text-[#d2d2d7]">—</span>
                <span className="text-6xl sm:text-7xl font-black text-[#1d1d1f] tabular-nums">{g.away_score}</span>
              </div>

              {/* Away */}
              <div className="text-center flex-1">
                {g.away_team_logo && <img src={g.away_team_logo} alt="" className="h-12 w-12 mx-auto mb-2 object-contain" />}
                <p className="text-base sm:text-lg font-bold text-[#1d1d1f] leading-tight">{g.away_team_name}</p>
                <p className="text-[10px] text-[#86868b] uppercase tracking-widest mt-0.5">Away</p>
              </div>
            </div>

            {/* OT / Shootout badge */}
            {(g.is_overtime || g.is_shootout) && (
              <div className="flex justify-center mt-3">
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-700">
                  {g.is_shootout ? 'Decided in Shootout' : 'Overtime'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ============ SCORING SUMMARY ============ */}
        <SectionCard title="Scoring Summary" icon="🏒">
          {data.goals.length === 0 ? (
            <EmptyState text="No goals scored" />
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {Object.entries(goalsByPeriod).sort(([a],[b]) => Number(a) - Number(b)).map(([period, goals]) => (
                <div key={period} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest mb-2">
                    {Number(period) <= 3 ? `${Number(period) === 1 ? '1st' : Number(period) === 2 ? '2nd' : '3rd'} Period` : 'Overtime'}
                  </p>
                  <div className="space-y-1.5">
                    {goals.map((goal: any, i: number) => {
                      const isHome = goal.team_id === g.home_team_id;
                      const teamName = isHome ? g.home_team_name : g.away_team_name;
                      return (
                        <div key={i} className="flex items-center gap-3 text-sm">
                          <div className={`w-1 h-6 rounded-full ${isHome ? 'bg-[#003e79]' : 'bg-[#00ccff]'}`} />
                          <span className="font-bold text-[#1d1d1f]">#{goal.jersey_number || '?'}</span>
                          <span className="text-[#3d3d3d]">{teamName}</span>
                          {(goal.assist1_jersey || goal.assist2_jersey) && (
                            <span className="text-[#86868b] text-xs">
                              ({[goal.assist1_jersey, goal.assist2_jersey].filter(Boolean).map(a => `#${a}`).join(', ')})
                            </span>
                          )}
                          {goal.game_time && <span className="text-[#86868b] text-xs ml-auto">{goal.game_time}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ============ SHOTS ON GOAL ============ */}
        <SectionCard title="Shots on Goal" icon="🎯">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e8e8ed]">
                  <th className="text-left py-2 pr-4 text-xs text-[#86868b] font-semibold uppercase tracking-widest">Team</th>
                  {periods.map(p => (
                    <th key={p} className="text-center py-2 px-3 text-xs text-[#86868b] font-semibold uppercase tracking-widest">
                      {p <= 3 ? `P${p}` : 'OT'}
                    </th>
                  ))}
                  <th className="text-center py-2 px-3 text-xs text-[#86868b] font-semibold uppercase tracking-widest">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#f0f0f0]">
                  <td className="py-2.5 pr-4 font-semibold text-[#1d1d1f]">{g.home_team_name}</td>
                  {homeShots.map((s, i) => <td key={i} className="text-center py-2.5 px-3 tabular-nums text-[#3d3d3d]">{s}</td>)}
                  <td className="text-center py-2.5 px-3 font-bold text-[#1d1d1f] tabular-nums">{homeTotalShots}</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-semibold text-[#1d1d1f]">{g.away_team_name}</td>
                  {awayShots.map((s, i) => <td key={i} className="text-center py-2.5 px-3 tabular-nums text-[#3d3d3d]">{s}</td>)}
                  <td className="text-center py-2.5 px-3 font-bold text-[#1d1d1f] tabular-nums">{awayTotalShots}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* ============ PENALTIES ============ */}
        {(homePenalties.length > 0 || awayPenalties.length > 0) && (
          <SectionCard title="Penalties" icon="⚠️">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <PenaltyList team={g.home_team_name} penalties={homePenalties} isHome />
              <PenaltyList team={g.away_team_name} penalties={awayPenalties} isHome={false} />
            </div>
          </SectionCard>
        )}

        {/* ============ LINEUPS ============ */}
        {(data.homeLineup.length > 0 || data.awayLineup.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LineupCard team={g.home_team_name} players={data.homeLineup} label="Home" color="#003e79" />
            <LineupCard team={g.away_team_name} players={data.awayLineup} label="Away" color="#00ccff" />
          </div>
        )}

        {/* ============ GOALIE STATS ============ */}
        {(homeGoalies.length > 0 || awayGoalies.length > 0) && (
          <SectionCard title="Goaltending" icon="🥅">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <GoalieStatsList team={g.home_team_name} goalies={homeGoalies} totalShots={awayTotalShots} />
              <GoalieStatsList team={g.away_team_name} goalies={awayGoalies} totalShots={homeTotalShots} />
            </div>
          </SectionCard>
        )}

        {/* ============ SHOOTOUT ============ */}
        {data.shootout.length > 0 && (
          <SectionCard title="Shootout" icon="🎯">
            <div className="space-y-2">
              {data.shootout.map((round: any, i: number) => {
                const isHome = round.team_id === g.home_team_id;
                const teamName = isHome ? g.home_team_name : g.away_team_name;
                return (
                  <div key={i} className="flex items-center gap-3 text-sm py-1">
                    <span className="text-xs text-[#86868b] font-semibold w-8">R{round.round_number}</span>
                    <span className="font-bold text-[#1d1d1f]">#{round.jersey_number || '?'}</span>
                    <span className="text-[#3d3d3d]">{round.player_name || teamName}</span>
                    {round.goalie_jersey && <span className="text-[#86868b] text-xs">vs #{round.goalie_jersey}</span>}
                    <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                      round.result === 'goal' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {round.result === 'goal' ? 'GOAL' : round.result === 'save' ? 'SAVE' : 'MISS'}
                    </span>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* ============ OFFICIALS ============ */}
        {data.officials.length > 0 && (
          <SectionCard title="Game Officials" icon="🦓">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.officials.map((off: any, i: number) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <span className="text-xs font-bold text-[#86868b] uppercase tracking-widest w-20">{off.role}</span>
                  <span className="text-sm font-semibold text-[#1d1d1f]">{off.official_name}</span>
                  {off.jersey_number && <span className="text-xs text-[#86868b]">#{off.jersey_number}</span>}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ============ COACHES ============ */}
        {(homeCoaches.length > 0 || awayCoaches.length > 0) && (
          <SectionCard title="Coaches" icon="📋">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">{g.home_team_name}</p>
                {homeCoaches.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className="text-sm font-semibold text-[#1d1d1f]">{c.coach_name}</span>
                    <span className="text-xs text-[#86868b] capitalize">({c.role})</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">{g.away_team_name}</p>
                {awayCoaches.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className="text-sm font-semibold text-[#1d1d1f]">{c.coach_name}</span>
                    <span className="text-xs text-[#86868b] capitalize">({c.role})</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        )}

        {/* ============ THREE STARS ============ */}
        {data.threeStars.length > 0 && (
          <SectionCard title="Three Stars" icon="⭐">
            <div className="flex justify-center gap-6 sm:gap-10 py-2">
              {data.threeStars.map((star: any) => {
                const isHome = star.team_id === g.home_team_id;
                const teamName = isHome ? g.home_team_name : g.away_team_name;
                const stars = star.star_number === 1 ? '★★★' : star.star_number === 2 ? '★★' : '★';
                return (
                  <div key={star.star_number} className="text-center">
                    <p className="text-amber-500 text-lg font-bold mb-1">{stars}</p>
                    <div className="w-14 h-14 bg-[#f5f5f7] rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-amber-400">
                      <span className="text-xl font-black text-[#003e79]">#{star.jersey_number || '?'}</span>
                    </div>
                    <p className="text-sm font-bold text-[#1d1d1f]">{star.player_name || `#${star.jersey_number}`}</p>
                    <p className="text-xs text-[#86868b]">{teamName}</p>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* ============ GAME NOTES ============ */}
        {data.notes.length > 0 && (
          <SectionCard title="Game Notes" icon="📝">
            <div className="space-y-2">
              {data.notes.map((note: any, i: number) => (
                <div key={i} className="text-sm text-[#3d3d3d] flex gap-2">
                  {note.period && <span className="text-[#86868b] font-semibold shrink-0">P{note.period}</span>}
                  {note.game_time && <span className="text-[#86868b] shrink-0">{note.game_time}</span>}
                  <span>{note.content}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Footer */}
        <div className="text-center py-6">
          <p className="text-xs text-[#86868b]">
            Ultimate Hockey Tournaments — Official Score Sheet
          </p>
          <p className="text-[10px] text-[#86868b] mt-1">
            Game #{g.game_number} • {g.age_group} {g.division_level} • {formatDate(g.start_time)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e0e0e0] shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e8e8ed] bg-[#fafafa] flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <h3 className="text-sm font-bold text-[#1d1d1f] uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-[#86868b] text-center py-4">{text}</p>;
}

function PenaltyList({ team, penalties, isHome }: { team: string; penalties: any[]; isHome: boolean }) {
  return (
    <div>
      <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">{team}</p>
      {penalties.length === 0 ? (
        <p className="text-xs text-[#86868b]">No penalties</p>
      ) : (
        <div className="space-y-1.5">
          {penalties.map((pen: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="text-xs font-semibold text-[#86868b] w-6 shrink-0">P{pen.period}</span>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-[#1d1d1f]">#{pen.jersey_number || '?'}</span>
                <span className="text-[#3d3d3d] ml-1">{pen.penalty_type}</span>
                <span className="text-[#86868b] text-xs ml-1">({pen.penalty_minutes}:00)</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LineupCard({ team, players, label, color }: { team: string; players: any[]; label: string; color: string }) {
  const goalies = players.filter(p => p.position === 'G' && !p.is_scratched);
  const skaters = players.filter(p => p.position !== 'G' && !p.is_scratched);
  const scratched = players.filter(p => p.is_scratched);

  return (
    <div className="bg-white rounded-2xl border border-[#e0e0e0] shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e8e8ed] flex items-center gap-2" style={{ backgroundColor: color + '10' }}>
        <div className="w-1 h-5 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <h4 className="text-sm font-bold text-[#1d1d1f]">{team}</h4>
          <p className="text-[10px] text-[#86868b] uppercase tracking-widest">{label} — {skaters.length + goalies.length} dressed</p>
        </div>
      </div>
      <div className="px-4 py-3">
        {/* Goalies */}
        {goalies.length > 0 && (
          <>
            <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest mb-1">Goalies</p>
            {goalies.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm py-0.5">
                <span className="font-bold text-[#003e79] w-8 text-right tabular-nums">#{p.jersey_number}</span>
                <span className="text-[#1d1d1f]">{p.first_name} {p.last_name}</span>
              </div>
            ))}
            <div className="h-2" />
          </>
        )}

        {/* Skaters */}
        <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest mb-1">Skaters</p>
        <div className="grid grid-cols-1 gap-0">
          {skaters.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm py-0.5">
              <span className="font-bold text-[#003e79] w-8 text-right tabular-nums">#{p.jersey_number}</span>
              <span className="text-[#1d1d1f]">{p.first_name} {p.last_name}</span>
              <span className="text-[10px] text-[#86868b] ml-auto">{p.position || p.player_position}</span>
            </div>
          ))}
        </div>

        {/* Scratched */}
        {scratched.length > 0 && (
          <>
            <div className="h-2" />
            <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest mb-1">Scratched</p>
            {scratched.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm py-0.5 opacity-50 line-through">
                <span className="font-bold w-8 text-right tabular-nums">#{p.jersey_number}</span>
                <span>{p.first_name} {p.last_name}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function GoalieStatsList({ team, goalies, totalShots }: { team: string; goalies: any[]; totalShots: number }) {
  return (
    <div>
      <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">{team}</p>
      {goalies.length === 0 ? (
        <p className="text-xs text-[#86868b]">No goalie stats recorded</p>
      ) : (
        <div className="space-y-2">
          {goalies.map((gs: any, i: number) => {
            const saves = (gs.shots_against || 0) - (gs.goals_against || 0);
            const savePct = gs.shots_against > 0 ? (saves / gs.shots_against * 100).toFixed(1) : '—';
            return (
              <div key={i} className="bg-[#fafafa] rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-[#1d1d1f]">
                    #{gs.jersey_number} {gs.player_name || ''}
                    {gs.is_starter ? <span className="text-[10px] text-[#86868b] ml-1">(Starter)</span> : ''}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-[#003e79] tabular-nums">{gs.toi_minutes || '—'}</p>
                    <p className="text-[10px] text-[#86868b] uppercase tracking-widest">TOI</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#1d1d1f] tabular-nums">{gs.shots_against || 0}</p>
                    <p className="text-[10px] text-[#86868b] uppercase tracking-widest">SA</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#1d1d1f] tabular-nums">{gs.goals_against || 0}</p>
                    <p className="text-[10px] text-[#86868b] uppercase tracking-widest">GA</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600 tabular-nums">{savePct}%</p>
                    <p className="text-[10px] text-[#86868b] uppercase tracking-widest">SV%</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#003e79] mx-auto mb-4" />
        <p className="text-[#86868b]">Loading score sheet...</p>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-4">🏒</div>
        <h1 className="text-xl font-bold text-[#1d1d1f] mb-2">Game Not Found</h1>
        <p className="text-[#6e6e73]">This game sheet doesn&apos;t exist or hasn&apos;t been started yet.</p>
        <a href="/scores" className="mt-4 inline-block text-[#003e79] font-semibold underline">Back to Scores</a>
      </div>
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function GameSheetPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GameSheetInner />
    </Suspense>
  );
}
