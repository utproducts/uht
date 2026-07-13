'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, Suspense } from 'react';

const API_BASE = 'https://uht.chad-157.workers.dev/api';

// USA Hockey penalty codes — grouped by severity
const PENALTIES_MINOR = [
  { code: 'TRIP', name: 'Tripping', min: 2 },
  { code: 'ROUGH', name: 'Roughing', min: 2 },
  { code: 'HOOK', name: 'Hooking', min: 2 },
  { code: 'SLASH', name: 'Slashing', min: 2 },
  { code: 'CROSS', name: 'Cross-Check', min: 2 },
  { code: 'HIGHST', name: 'High Stick', min: 2 },
  { code: 'HOLD', name: 'Holding', min: 2 },
  { code: 'INTER', name: 'Interference', min: 2 },
  { code: 'BOARD', name: 'Boarding', min: 2 },
  { code: 'ELBOW', name: 'Elbowing', min: 2 },
  { code: 'DELAY', name: 'Delay of Game', min: 2 },
  { code: 'UNSPORT', name: 'Unsportsmanlike', min: 2 },
  { code: 'TOOMANY', name: 'Too Many Men', min: 2 },
  { code: 'CHARGE', name: 'Charging', min: 2 },
  { code: 'KNEE', name: 'Kneeing', min: 2 },
  { code: 'SPEAR', name: 'Spearing', min: 2 },
  { code: 'HC', name: 'Head Contact', min: 2 },
  { code: 'HOLDST', name: 'Hold Stick', min: 2 },
  { code: 'BENCH', name: 'Bench Minor', min: 2 },
  { code: 'GOALI', name: 'Goalie Int.', min: 2 },
];
const PENALTIES_MAJOR = [
  { code: 'BOARD5', name: 'Boarding', min: 5 },
  { code: 'CHARGE5', name: 'Charging', min: 5 },
  { code: 'CHECK5', name: 'Check Behind', min: 5 },
  { code: 'FIGHT', name: 'Fighting', min: 5 },
  { code: 'HIGHST5', name: 'High Stick', min: 5 },
  { code: 'SPEAR5', name: 'Spearing', min: 5 },
  { code: 'SLASH5', name: 'Slashing', min: 5 },
];
const PENALTIES_MISCONDUCT = [
  { code: 'MISC', name: 'Misconduct', min: 10 },
  { code: 'GMSC', name: 'Game Misconduct', min: 10 },
];

interface GameEvent {
  id: string;
  event_type: string;
  team_id: string;
  jersey_number: string | null;
  assist1_jersey: string | null;
  assist2_jersey: string | null;
  penalty_type: string | null;
  penalty_minutes: number | null;
  period: number;
  details: string | null;
}

interface ShotRecord { team_id: string; period: number; shot_count: number; }

interface RosterPlayer {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: string;
  position: string;
}

interface GameData {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  status: string;
  period: number;
  game_number: number;
  age_group: string;
  division_level: string;
  rink_name: string;
  events: GameEvent[];
  shots: ShotRecord[];
}

type ModalType = null | 'goal' | 'penalty' | 'shots' | 'roster' | 'three-stars' | 'shootout' | 'goalie' | 'notes' | 'officials' | 'menu';
type GoalStep = 'team' | 'player' | 'assist1' | 'assist2';
type PenaltyStep = 'team' | 'player' | 'type';

function ScoringPageInner() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get('gameId');
  const pin = searchParams.get('pin');

  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [posting, setPosting] = useState(false);

  // Roster
  const [homePlayers, setHomePlayers] = useState<RosterPlayer[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<RosterPlayer[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [lineupsLoaded, setLineupsLoaded] = useState(false);

  // Goal state
  const [goalStep, setGoalStep] = useState<GoalStep>('team');
  const [goalTeamId, setGoalTeamId] = useState('');
  const [goalJersey, setGoalJersey] = useState('');
  const [goalAssist1, setGoalAssist1] = useState('');
  const [goalAssist2, setGoalAssist2] = useState('');

  // Penalty state
  const [penaltyStep, setPenaltyStep] = useState<PenaltyStep>('team');
  const [penaltyTeamId, setPenaltyTeamId] = useState('');
  const [penaltyJersey, setPenaltyJersey] = useState('');

  // Three Stars
  const [star1, setStar1] = useState({ teamId: '', jersey: '', name: '' });
  const [star2, setStar2] = useState({ teamId: '', jersey: '', name: '' });
  const [star3, setStar3] = useState({ teamId: '', jersey: '', name: '' });

  // Shootout
  const [soTeamId, setSoTeamId] = useState('');
  const [soJersey, setSoJersey] = useState('');
  const [soGoalieJersey, setSoGoalieJersey] = useState('');
  const [soRound, setSoRound] = useState(1);
  const [soSequence, setSoSequence] = useState(1);

  // Goalie stats
  const [goalieTeamId, setGoalieTeamId] = useState('');
  const [goalieJersey, setGoalieJersey] = useState('');
  const [goalieName, setGoalieName] = useState('');
  const [goalieToi, setGoalieToi] = useState(0);
  const [goalieSa, setGoalieSa] = useState(0);
  const [goalieGa, setGoalieGa] = useState(0);

  // Note
  const [noteContent, setNoteContent] = useState('');

  // Flash feedback
  const [flash, setFlash] = useState('');

  const fetchGame = useCallback(async () => {
    if (!gameId) return;
    try {
      const res = await fetch(`${API_BASE}/scoring/games/${gameId}`);
      const json = await res.json();
      if (json.success && json.data) setGame(json.data);
    } catch (err) { console.error('Failed to fetch game:', err); }
    finally { setLoading(false); }
  }, [gameId]);

  // Fetch roster
  const fetchRoster = useCallback(async () => {
    if (!gameId || rosterLoaded) return;
    try {
      const res = await fetch(`${API_BASE}/scoring/games/${gameId}/roster`);
      const json = await res.json();
      if (json.success) {
        setHomePlayers(json.data.homePlayers || []);
        setAwayPlayers(json.data.awayPlayers || []);
        setLineupsLoaded(json.data.lineupsLoaded || false);
        setRosterLoaded(true);
      }
    } catch { /* */ }
  }, [gameId, rosterLoaded]);

  useEffect(() => { fetchGame(); }, [fetchGame]);
  useEffect(() => { if (game) fetchRoster(); }, [game, fetchRoster]);

  // Poll every 15s
  useEffect(() => {
    const interval = setInterval(fetchGame, 15000);
    return () => clearInterval(interval);
  }, [fetchGame]);

  // Shots lookup
  const shotsMap: Record<string, Record<number, number>> = {};
  if (game?.shots) {
    for (const s of game.shots) {
      if (!shotsMap[s.team_id]) shotsMap[s.team_id] = {};
      shotsMap[s.team_id][s.period] = s.shot_count;
    }
  }

  const headers = () => ({ 'Content-Type': 'application/json', 'X-Scorekeeper-Pin': pin || '' });

  const postEvent = async (payload: any) => {
    if (!gameId || !pin || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_BASE}/scoring/games/${gameId}/events`, {
        method: 'POST', headers: headers(), body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) { doFlash('green'); await fetchGame(); } else { doFlash('red'); }
    } catch { doFlash('red'); }
    finally { setPosting(false); }
  };

  const postShots = async (teamId: string, period: number, shotCount: number) => {
    if (!gameId || !pin) return;
    try {
      await fetch(`${API_BASE}/scoring/games/${gameId}/shots`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ teamId, period, shotCount }),
      });
      await fetchGame();
    } catch { /* */ }
  };

  const deleteEvent = async (eventId: string) => {
    if (!gameId || !pin) return;
    try {
      await fetch(`${API_BASE}/scoring/games/${gameId}/events/${eventId}`, {
        method: 'DELETE', headers: { 'X-Scorekeeper-Pin': pin },
      });
      await fetchGame();
    } catch { /* */ }
  };

  const loadLineups = async () => {
    if (!gameId || !pin) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_BASE}/scoring/games/${gameId}/lineups/load`, {
        method: 'POST', headers: headers(),
      });
      const json = await res.json();
      if (json.success) { setLineupsLoaded(true); doFlash('green'); }
    } catch { doFlash('red'); }
    finally { setPosting(false); }
  };

  const doFlash = (color: string) => { setFlash(color); setTimeout(() => setFlash(''), 400); };

  // Goal flow with roster
  const resetGoal = () => { setGoalStep('team'); setGoalTeamId(''); setGoalJersey(''); setGoalAssist1(''); setGoalAssist2(''); };
  const openGoal = () => { resetGoal(); setModal('goal'); };

  const submitGoal = async () => {
    await postEvent({
      eventType: 'goal', teamId: goalTeamId,
      jerseyNumber: goalJersey || null, assist1Jersey: goalAssist1 || null, assist2Jersey: goalAssist2 || null,
      period: game?.period || 1,
    });
    setModal(null);
  };

  // Penalty flow with roster
  const resetPenalty = () => { setPenaltyStep('team'); setPenaltyTeamId(''); setPenaltyJersey(''); };
  const openPenalty = () => { resetPenalty(); setModal('penalty'); };

  const submitPenalty = async (penalty: { code: string; min: number }) => {
    await postEvent({
      eventType: 'penalty', teamId: penaltyTeamId,
      jerseyNumber: penaltyJersey || null, penaltyCode: penalty.code, penaltyMinutes: penalty.min,
      period: game?.period || 1,
    });
    setModal(null);
  };

  // Three Stars
  const submitThreeStars = async () => {
    if (!gameId) return;
    const stars = [star1, star2, star3]
      .map((s, i) => ({ starNumber: i + 1, teamId: s.teamId, jerseyNumber: s.jersey, playerName: s.name }))
      .filter(s => s.teamId && s.jerseyNumber);
    if (stars.length === 0) return;
    setPosting(true);
    try {
      await fetch(`${API_BASE}/scoring/games/${gameId}/three-stars`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ stars }),
      });
      doFlash('green');
    } catch { doFlash('red'); }
    finally { setPosting(false); setModal(null); }
  };

  // Shootout
  const submitShootout = async (result: 'goal' | 'save' | 'miss') => {
    if (!gameId || !soTeamId || !soJersey) return;
    setPosting(true);
    try {
      await fetch(`${API_BASE}/scoring/games/${gameId}/shootout`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          teamId: soTeamId, jerseyNumber: soJersey, goalieJersey: soGoalieJersey || null,
          roundNumber: soRound, result, sequenceOrder: soSequence,
        }),
      });
      setSoSequence(prev => prev + 1);
      setSoJersey('');
      setSoGoalieJersey('');
      // Alternate team
      if (game) {
        setSoTeamId(soTeamId === game.home_team_id ? game.away_team_id : game.home_team_id);
      }
      doFlash('green');
    } catch { doFlash('red'); }
    finally { setPosting(false); }
  };

  // Goalie stats
  const submitGoalieStats = async () => {
    if (!gameId || !goalieTeamId || !goalieJersey) return;
    setPosting(true);
    try {
      await fetch(`${API_BASE}/scoring/games/${gameId}/goalie-stats`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          teamId: goalieTeamId, jerseyNumber: goalieJersey, playerName: goalieName || null,
          toiMinutes: goalieToi, shotsAgainst: goalieSa, goalsAgainst: goalieGa,
        }),
      });
      doFlash('green');
    } catch { doFlash('red'); }
    finally { setPosting(false); setModal(null); }
  };

  // Game notes
  const submitNote = async () => {
    if (!gameId || !noteContent.trim()) return;
    setPosting(true);
    try {
      await fetch(`${API_BASE}/scoring/games/${gameId}/notes`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ content: noteContent, period: game?.period }),
      });
      setNoteContent('');
      doFlash('green');
    } catch { doFlash('red'); }
    finally { setPosting(false); setModal(null); }
  };

  // Game control events
  const startGame = () => postEvent({ eventType: 'game_start' });
  const endPeriod = () => postEvent({ eventType: 'period_end', period: game?.period });
  const startPeriod = () => postEvent({ eventType: 'period_start', period: (game?.period || 0) + 1 });
  const endGame = () => {
    if (!confirm('End game and send results to coaches?')) return;
    postEvent({ eventType: 'game_end' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="animate-pulse text-[#86868b] text-xl">Loading game...</div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-4">🏒</div>
          <h1 className="text-xl font-bold text-[#1d1d1f] mb-2">Game Not Found</h1>
          <p className="text-[#6e6e73]">Check your link or go back to the PIN screen.</p>
          <a href="/scoring" className="mt-4 inline-block text-[#003e79] font-semibold underline">Back to PIN Entry</a>
        </div>
      </div>
    );
  }

  const { status, period } = game;
  const isLive = status === 'in_progress';
  const isIntermission = status === 'intermission';
  const isFinal = status === 'final';
  const isScheduled = status === 'scheduled' || status === 'warmup';

  const periodLabel = period === 1 ? '1st' : period === 2 ? '2nd' : period === 3 ? '3rd' : period > 3 ? 'OT' : '';
  const statusLabel = isLive ? `${periodLabel} Period` : isIntermission ? `${periodLabel} Int` : isFinal ? 'Final' : 'Pre-Game';

  const flashBg = flash === 'green' ? 'bg-emerald-500/20' : flash === 'red' ? 'bg-red-500/20' : '';

  // Roster for team picker
  const playersForTeam = (teamId: string) => teamId === game.home_team_id ? homePlayers : awayPlayers;

  return (
    <div className={`min-h-screen bg-[#fafafa] flex flex-col transition-colors duration-300 ${flashBg}`}>
      {/* SCOREBOARD */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] text-white">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <a href="/scoring" className="text-white/60 text-xs font-semibold">← Back</a>
          <span className="text-white/60 text-xs font-semibold">
            Game #{game.game_number} • {game.age_group}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isLive ? 'bg-red-500 text-white' : isFinal ? 'bg-white/20 text-white' : 'bg-white/20 text-white'
          }`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 px-4 pb-4 pt-2">
          <div className="text-center flex-1 min-w-0">
            <p className="text-sm font-bold truncate leading-tight">{game.home_team_name}</p>
            <p className="text-[10px] text-white/50">Home</p>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-black tabular-nums">{game.home_score}</span>
            <span className="text-2xl font-bold text-white/40">—</span>
            <span className="text-5xl font-black tabular-nums">{game.away_score}</span>
          </div>
          <div className="text-center flex-1 min-w-0">
            <p className="text-sm font-bold truncate leading-tight">{game.away_team_name}</p>
            <p className="text-[10px] text-white/50">Away</p>
          </div>
        </div>
      </div>

      {/* ROSTER BANNER - if not loaded */}
      {!lineupsLoaded && rosterLoaded && (homePlayers.length > 0 || awayPlayers.length > 0) && (
        <div className="mx-4 mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-900">Rosters Available</p>
            <p className="text-xs text-blue-700">{homePlayers.length + awayPlayers.length} players ready to load</p>
          </div>
          <button onClick={loadLineups} disabled={posting}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg active:bg-blue-700 disabled:opacity-50">
            Load Rosters
          </button>
        </div>
      )}

      {/* CONTROLS */}
      <div className="px-4 py-4 space-y-3">
        {isScheduled && (
          <button onClick={startGame} disabled={posting}
            className="w-full py-5 rounded-full bg-emerald-600 text-white text-2xl font-black active:bg-emerald-700 disabled:opacity-50 transition-colors">
            START GAME
          </button>
        )}

        {isLive && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={openGoal} disabled={posting}
                className="py-5 rounded-2xl bg-emerald-600 text-white text-base font-black active:bg-emerald-700 disabled:opacity-50">
                GOAL
              </button>
              <button onClick={openPenalty} disabled={posting}
                className="py-5 rounded-2xl bg-amber-500 text-white text-base font-black active:bg-amber-600 disabled:opacity-50">
                PENALTY
              </button>
              <button onClick={() => setModal('shots')} disabled={posting}
                className="py-5 rounded-2xl bg-[#003e79] text-white text-base font-black active:bg-[#002d5a] disabled:opacity-50">
                SHOTS
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={endPeriod} disabled={posting}
                className="py-4 rounded-full bg-orange-500 text-white text-base font-black active:bg-orange-600 disabled:opacity-50">
                END PERIOD
              </button>
              <button onClick={() => setModal('menu')}
                className="py-4 rounded-full bg-[#3d3d3d] text-white text-base font-black active:bg-[#1d1d1f]">
                MORE ▾
              </button>
            </div>
            {period >= 3 && (
              <button onClick={endGame} disabled={posting}
                className="w-full py-4 rounded-full bg-red-600 text-white text-lg font-black active:bg-red-700 disabled:opacity-50">
                END GAME
              </button>
            )}
          </>
        )}

        {isIntermission && (
          <div className="space-y-3">
            <button onClick={startPeriod} disabled={posting}
              className="w-full py-5 rounded-full bg-emerald-600 text-white text-2xl font-black active:bg-emerald-700 disabled:opacity-50">
              START {period === 1 ? '2ND' : period === 2 ? '3RD' : 'OT'} PERIOD
            </button>
            <button onClick={() => setModal('menu')}
              className="w-full py-3 rounded-full bg-[#3d3d3d] text-white text-sm font-bold active:bg-[#1d1d1f]">
              More Options ▾
            </button>
          </div>
        )}

        {isFinal && (
          <div className="space-y-3">
            <div className="text-center py-5 bg-[#1d1d1f] text-white rounded-2xl text-xl font-black">FINAL</div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setModal('three-stars')}
                className="py-4 rounded-2xl bg-amber-500 text-white text-sm font-bold active:bg-amber-600">
                THREE STARS
              </button>
              <button onClick={() => setModal('goalie')}
                className="py-4 rounded-2xl bg-[#003e79] text-white text-sm font-bold active:bg-[#002d5a]">
                GOALIE STATS
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setModal('notes')}
                className="py-3 rounded-2xl bg-[#e8e8ed] text-[#3d3d3d] text-sm font-bold active:bg-[#d2d2d7]">
                Add Note
              </button>
              <a href={`/scores/game?gameId=${gameId}`} target="_blank"
                className="py-3 rounded-2xl bg-[#e8e8ed] text-[#3d3d3d] text-sm font-bold active:bg-[#d2d2d7] text-center">
                View Sheet
              </a>
            </div>
          </div>
        )}
      </div>

      {/* EVENT LOG */}
      <div className="flex-1 px-4 pb-6">
        <p className="text-[10px] font-bold text-[#86868b] uppercase tracking-widest mb-2">Event Log</p>
        {game.events && game.events.length > 0 ? (
          <div className="space-y-2">
            {[...game.events].reverse().map((ev) => {
              const isHome = ev.team_id === game.home_team_id;
              const teamName = isHome ? game.home_team_name : game.away_team_name;
              return (
                <div key={ev.id} className="bg-white border border-[#e8e8ed] rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 text-center">
                    <span className="text-[10px] font-bold text-[#86868b]">P{ev.period}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {ev.event_type === 'goal' && (
                      <p className="text-sm font-bold text-[#1d1d1f] truncate">
                        GOAL — #{ev.jersey_number || '?'} {teamName}
                        {ev.assist1_jersey && <span className="text-[#6e6e73] font-normal"> (A: #{ev.assist1_jersey}{ev.assist2_jersey ? `, #${ev.assist2_jersey}` : ''})</span>}
                      </p>
                    )}
                    {ev.event_type === 'penalty' && (
                      <p className="text-sm font-bold text-amber-600 truncate">
                        {ev.penalty_type || 'Penalty'} — #{ev.jersey_number || '?'} {teamName}
                        <span className="text-[#86868b] font-normal"> ({ev.penalty_minutes}:00)</span>
                      </p>
                    )}
                    {ev.event_type === 'period_start' && <p className="text-sm text-[#6e6e73]">Period {ev.period} started</p>}
                    {ev.event_type === 'period_end' && <p className="text-sm text-[#6e6e73]">End of period {ev.period}</p>}
                    {ev.event_type === 'game_start' && <p className="text-sm text-emerald-600 font-semibold">Game started</p>}
                    {ev.event_type === 'game_end' && <p className="text-sm text-red-600 font-semibold">Game ended</p>}
                  </div>
                  {(ev.event_type === 'goal' || ev.event_type === 'penalty') && (
                    <button onClick={() => deleteEvent(ev.id)} className="p-2 rounded-lg active:bg-red-50">
                      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[#86868b] text-center py-8">No events yet</p>
        )}
      </div>

      {/* ==================== GOAL MODAL (with roster) ==================== */}
      {modal === 'goal' && (
        <FullScreenModal title="GOAL" onClose={() => setModal(null)}>
          {goalStep === 'team' && (
            <StepTeamPicker label="Which team scored?" homeName={game.home_team_name} awayName={game.away_team_name}
              onPick={(id) => { setGoalTeamId(id); setGoalStep('player'); }} homeId={game.home_team_id} awayId={game.away_team_id} />
          )}
          {goalStep === 'player' && (
            <PlayerPicker label="Goal Scorer" players={playersForTeam(goalTeamId)}
              onPick={(jersey) => { setGoalJersey(jersey); setGoalStep('assist1'); }}
              showKeypad />
          )}
          {goalStep === 'assist1' && (
            <PlayerPicker label="1st Assist" players={playersForTeam(goalTeamId)} optional
              onPick={(jersey) => { setGoalAssist1(jersey); setGoalStep('assist2'); }}
              onSkip={() => { setGoalAssist1(''); setGoalStep('assist2'); }}
              showKeypad />
          )}
          {goalStep === 'assist2' && (
            <PlayerPicker label="2nd Assist" players={playersForTeam(goalTeamId)} optional
              onPick={(jersey) => { setGoalAssist2(jersey); submitGoal(); }}
              onSkip={() => { setGoalAssist2(''); submitGoal(); }}
              showKeypad />
          )}
        </FullScreenModal>
      )}

      {/* ==================== PENALTY MODAL (with roster) ==================== */}
      {modal === 'penalty' && (
        <FullScreenModal title="PENALTY" onClose={() => setModal(null)}>
          {penaltyStep === 'team' && (
            <StepTeamPicker label="Which team?" homeName={game.home_team_name} awayName={game.away_team_name}
              onPick={(id) => { setPenaltyTeamId(id); setPenaltyStep('player'); }} homeId={game.home_team_id} awayId={game.away_team_id} />
          )}
          {penaltyStep === 'player' && (
            <PlayerPicker label="Player" players={playersForTeam(penaltyTeamId)}
              onPick={(jersey) => { setPenaltyJersey(jersey); setPenaltyStep('type'); }}
              showKeypad />
          )}
          {penaltyStep === 'type' && (
            <div className="w-full overflow-y-auto max-h-[70vh]">
              <p className="text-center text-lg font-bold text-[#1d1d1f] mb-4">Select Penalty</p>
              <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">Minor (2:00)</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {PENALTIES_MINOR.map((p) => (
                  <button key={p.code} onClick={() => submitPenalty(p)}
                    className="py-3 px-2 rounded-xl bg-amber-500 text-white text-sm font-bold active:bg-amber-600">{p.name}</button>
                ))}
              </div>
              <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">Major (5:00)</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {PENALTIES_MAJOR.map((p) => (
                  <button key={p.code} onClick={() => submitPenalty(p)}
                    className="py-3 px-2 rounded-xl bg-red-600 text-white text-sm font-bold active:bg-red-700">{p.name}</button>
                ))}
              </div>
              <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">Misconduct (10:00)</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {PENALTIES_MISCONDUCT.map((p) => (
                  <button key={p.code} onClick={() => submitPenalty(p)}
                    className="py-3 px-2 rounded-xl bg-[#1d1d1f] text-white text-sm font-bold active:bg-black">{p.name}</button>
                ))}
              </div>
            </div>
          )}
        </FullScreenModal>
      )}

      {/* ==================== SHOTS MODAL ==================== */}
      {modal === 'shots' && (
        <FullScreenModal title="SHOT COUNT" onClose={() => setModal(null)}>
          <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest text-center mb-4">Period {period}</p>
          {[{ name: game.home_team_name, id: game.home_team_id }, { name: game.away_team_name, id: game.away_team_id }].map(team => (
            <div key={team.id} className="w-full bg-[#fafafa] rounded-2xl p-6 mb-4">
              <p className="text-center font-bold text-[#1d1d1f] mb-4">{team.name}</p>
              <div className="flex items-center justify-center gap-6">
                <button onClick={() => { const cur = shotsMap[team.id]?.[period] || 0; if (cur > 0) postShots(team.id, period, cur - 1); }}
                  className="w-14 h-14 rounded-full bg-red-500 text-white text-2xl font-black flex items-center justify-center active:bg-red-600">−</button>
                <span className="text-5xl font-black text-[#003e79] w-20 text-center tabular-nums">{shotsMap[team.id]?.[period] || 0}</span>
                <button onClick={() => { const cur = shotsMap[team.id]?.[period] || 0; postShots(team.id, period, cur + 1); }}
                  className="w-14 h-14 rounded-full bg-emerald-600 text-white text-2xl font-black flex items-center justify-center active:bg-emerald-700">+</button>
              </div>
            </div>
          ))}
          <button onClick={() => setModal(null)} className="w-full py-4 rounded-full bg-[#003e79] text-white text-lg font-bold active:bg-[#002d5a]">Done</button>
        </FullScreenModal>
      )}

      {/* ==================== MORE MENU ==================== */}
      {modal === 'menu' && (
        <FullScreenModal title="MORE OPTIONS" onClose={() => setModal(null)}>
          <div className="w-full space-y-3">
            <MenuBtn label="Three Stars" desc="Select game stars" onClick={() => setModal('three-stars')} />
            <MenuBtn label="Goalie Stats" desc="Record TOI, saves, GA" onClick={() => setModal('goalie')} />
            <MenuBtn label="Shootout" desc="Record shootout attempts" onClick={() => { setSoTeamId(game.home_team_id); setModal('shootout'); }} />
            <MenuBtn label="Add Note" desc="Timeout, injury, or note" onClick={() => setModal('notes')} />
            <MenuBtn label="Officials" desc="Record game officials" onClick={() => setModal('officials')} />
            <MenuBtn label="View Roster" desc={`${homePlayers.length + awayPlayers.length} players`} onClick={() => setModal('roster')} />
            <a href={`/scores/game?gameId=${gameId}`} target="_blank"
              className="block w-full py-4 px-4 rounded-2xl bg-[#f5f5f7] text-left active:bg-[#e8e8ed]">
              <p className="text-sm font-bold text-[#1d1d1f]">View Score Sheet</p>
              <p className="text-xs text-[#86868b]">Public game sheet view</p>
            </a>
          </div>
        </FullScreenModal>
      )}

      {/* ==================== THREE STARS MODAL ==================== */}
      {modal === 'three-stars' && (
        <FullScreenModal title="THREE STARS" onClose={() => setModal(null)}>
          <div className="w-full space-y-4">
            {[
              { label: '1st Star ★★★', state: star1, setter: setStar1 },
              { label: '2nd Star ★★', state: star2, setter: setStar2 },
              { label: '3rd Star ★', state: star3, setter: setStar3 },
            ].map(({ label, state, setter }) => (
              <div key={label} className="bg-[#fafafa] rounded-xl p-4">
                <p className="text-sm font-bold text-amber-600 mb-2">{label}</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button onClick={() => setter({ ...state, teamId: game.home_team_id })}
                    className={`py-2 rounded-lg text-xs font-bold transition-colors ${state.teamId === game.home_team_id ? 'bg-[#003e79] text-white' : 'bg-white border border-[#e8e8ed] text-[#3d3d3d]'}`}>
                    {game.home_team_name}
                  </button>
                  <button onClick={() => setter({ ...state, teamId: game.away_team_id })}
                    className={`py-2 rounded-lg text-xs font-bold transition-colors ${state.teamId === game.away_team_id ? 'bg-[#003e79] text-white' : 'bg-white border border-[#e8e8ed] text-[#3d3d3d]'}`}>
                    {game.away_team_name}
                  </button>
                </div>
                {state.teamId && playersForTeam(state.teamId).length > 0 ? (
                  <div className="grid grid-cols-4 gap-1">
                    {playersForTeam(state.teamId).map(p => (
                      <button key={p.id} onClick={() => setter({ ...state, jersey: p.jersey_number, name: `${p.first_name} ${p.last_name}` })}
                        className={`py-2 rounded-lg text-xs font-bold transition-colors ${state.jersey === p.jersey_number ? 'bg-amber-500 text-white' : 'bg-white border border-[#e8e8ed] text-[#3d3d3d]'}`}>
                        #{p.jersey_number}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input type="text" placeholder="Jersey #" value={state.jersey}
                    onChange={e => setter({ ...state, jersey: e.target.value })}
                    className="w-full px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm" />
                )}
              </div>
            ))}
            <button onClick={submitThreeStars} disabled={posting || !star1.teamId}
              className="w-full py-4 rounded-full bg-amber-500 text-white text-lg font-bold active:bg-amber-600 disabled:opacity-50">
              Save Three Stars
            </button>
          </div>
        </FullScreenModal>
      )}

      {/* ==================== SHOOTOUT MODAL ==================== */}
      {modal === 'shootout' && (
        <FullScreenModal title="SHOOTOUT" onClose={() => setModal(null)}>
          <div className="w-full space-y-4">
            <div className="text-center">
              <p className="text-xs text-[#86868b] uppercase tracking-widest mb-1">Round {soRound} • Attempt #{soSequence}</p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => setSoTeamId(game.home_team_id)}
                  className={`py-3 rounded-xl text-sm font-bold ${soTeamId === game.home_team_id ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#3d3d3d]'}`}>
                  {game.home_team_name}
                </button>
                <button onClick={() => setSoTeamId(game.away_team_id)}
                  className={`py-3 rounded-xl text-sm font-bold ${soTeamId === game.away_team_id ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#3d3d3d]'}`}>
                  {game.away_team_name}
                </button>
              </div>
            </div>

            {soTeamId && playersForTeam(soTeamId).length > 0 ? (
              <div>
                <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">Shooter</p>
                <div className="grid grid-cols-5 gap-1">
                  {playersForTeam(soTeamId).filter(p => p.position !== 'G').map(p => (
                    <button key={p.id} onClick={() => setSoJersey(p.jersey_number)}
                      className={`py-2 rounded-lg text-xs font-bold ${soJersey === p.jersey_number ? 'bg-[#003e79] text-white' : 'bg-white border border-[#e8e8ed]'}`}>
                      #{p.jersey_number}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <input type="text" placeholder="Shooter Jersey #" value={soJersey}
                onChange={e => setSoJersey(e.target.value)}
                className="w-full px-4 py-3 border border-[#e8e8ed] rounded-xl text-center text-lg font-bold" />
            )}

            <div className="grid grid-cols-3 gap-3 pt-2">
              <button onClick={() => submitShootout('goal')} disabled={!soJersey || posting}
                className="py-5 rounded-2xl bg-emerald-600 text-white text-base font-black active:bg-emerald-700 disabled:opacity-50">
                GOAL
              </button>
              <button onClick={() => submitShootout('save')} disabled={!soJersey || posting}
                className="py-5 rounded-2xl bg-[#003e79] text-white text-base font-black active:bg-[#002d5a] disabled:opacity-50">
                SAVE
              </button>
              <button onClick={() => submitShootout('miss')} disabled={!soJersey || posting}
                className="py-5 rounded-2xl bg-red-600 text-white text-base font-black active:bg-red-700 disabled:opacity-50">
                MISS
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setSoRound(r => r + 1)}
                className="flex-1 py-3 rounded-full bg-[#e8e8ed] text-[#3d3d3d] text-sm font-bold">Next Round</button>
              <button onClick={() => setModal(null)}
                className="flex-1 py-3 rounded-full bg-[#003e79] text-white text-sm font-bold">Done</button>
            </div>
          </div>
        </FullScreenModal>
      )}

      {/* ==================== GOALIE STATS MODAL ==================== */}
      {modal === 'goalie' && (
        <FullScreenModal title="GOALIE STATS" onClose={() => setModal(null)}>
          <div className="w-full space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setGoalieTeamId(game.home_team_id)}
                className={`py-3 rounded-xl text-sm font-bold ${goalieTeamId === game.home_team_id ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#3d3d3d]'}`}>
                {game.home_team_name}
              </button>
              <button onClick={() => setGoalieTeamId(game.away_team_id)}
                className={`py-3 rounded-xl text-sm font-bold ${goalieTeamId === game.away_team_id ? 'bg-[#003e79] text-white' : 'bg-[#f5f5f7] text-[#3d3d3d]'}`}>
                {game.away_team_name}
              </button>
            </div>

            {goalieTeamId && (
              <>
                {playersForTeam(goalieTeamId).filter(p => p.position === 'G').length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {playersForTeam(goalieTeamId).filter(p => p.position === 'G').map(p => (
                      <button key={p.id} onClick={() => { setGoalieJersey(p.jersey_number); setGoalieName(`${p.first_name} ${p.last_name}`); }}
                        className={`py-3 rounded-xl text-sm font-bold ${goalieJersey === p.jersey_number ? 'bg-[#003e79] text-white' : 'bg-white border border-[#e8e8ed]'}`}>
                        #{p.jersey_number} {p.last_name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input type="text" placeholder="Goalie Jersey #" value={goalieJersey}
                    onChange={e => setGoalieJersey(e.target.value)}
                    className="w-full px-4 py-3 border border-[#e8e8ed] rounded-xl text-sm" />
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">TOI (min)</p>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setGoalieToi(t => Math.max(0, t - 1))}
                        className="w-10 h-10 rounded-full bg-red-500 text-white font-bold">−</button>
                      <span className="text-2xl font-black text-[#003e79] w-12 text-center tabular-nums">{goalieToi}</span>
                      <button onClick={() => setGoalieToi(t => t + 1)}
                        className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold">+</button>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">SA</p>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setGoalieSa(s => Math.max(0, s - 1))}
                        className="w-10 h-10 rounded-full bg-red-500 text-white font-bold">−</button>
                      <span className="text-2xl font-black text-[#003e79] w-12 text-center tabular-nums">{goalieSa}</span>
                      <button onClick={() => setGoalieSa(s => s + 1)}
                        className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold">+</button>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">GA</p>
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => setGoalieGa(ga => Math.max(0, ga - 1))}
                        className="w-10 h-10 rounded-full bg-red-500 text-white font-bold">−</button>
                      <span className="text-2xl font-black text-[#003e79] w-12 text-center tabular-nums">{goalieGa}</span>
                      <button onClick={() => setGoalieGa(ga => ga + 1)}
                        className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold">+</button>
                    </div>
                  </div>
                </div>

                <button onClick={submitGoalieStats} disabled={posting || !goalieJersey}
                  className="w-full py-4 rounded-full bg-[#003e79] text-white text-lg font-bold active:bg-[#002d5a] disabled:opacity-50">
                  Save Goalie Stats
                </button>
              </>
            )}
          </div>
        </FullScreenModal>
      )}

      {/* ==================== NOTES MODAL ==================== */}
      {modal === 'notes' && (
        <FullScreenModal title="GAME NOTE" onClose={() => setModal(null)}>
          <div className="w-full space-y-4">
            <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)}
              placeholder="Timeout, injury, incident, or note..."
              rows={4} className="w-full px-4 py-3 border border-[#e8e8ed] rounded-xl text-sm resize-none" />
            <button onClick={submitNote} disabled={posting || !noteContent.trim()}
              className="w-full py-4 rounded-full bg-[#003e79] text-white text-lg font-bold active:bg-[#002d5a] disabled:opacity-50">
              Save Note
            </button>
          </div>
        </FullScreenModal>
      )}

      {/* ==================== ROSTER MODAL ==================== */}
      {modal === 'roster' && (
        <FullScreenModal title="ROSTERS" onClose={() => setModal(null)}>
          <div className="w-full space-y-4 overflow-y-auto max-h-[75vh]">
            {[{ name: game.home_team_name, players: homePlayers, label: 'Home' }, { name: game.away_team_name, players: awayPlayers, label: 'Away' }].map(team => (
              <div key={team.label}>
                <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">{team.name} ({team.label})</p>
                {team.players.length === 0 ? (
                  <p className="text-xs text-[#86868b]">No roster data</p>
                ) : (
                  <div className="bg-white rounded-xl border border-[#e8e8ed] divide-y divide-[#f0f0f0]">
                    {team.players.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="text-sm font-bold text-[#003e79] w-8 text-right">#{p.jersey_number}</span>
                        <span className="text-sm text-[#1d1d1f] flex-1">{p.first_name} {p.last_name}</span>
                        <span className="text-xs text-[#86868b]">{p.position}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </FullScreenModal>
      )}

      {/* ==================== OFFICIALS MODAL ==================== */}
      {modal === 'officials' && (
        <OfficialsModal gameId={gameId!} pin={pin!} onClose={() => setModal(null)} onFlash={doFlash} />
      )}
    </div>
  );
}

// ===================== SHARED COMPONENTS =====================

function FullScreenModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] text-white px-4 py-4 flex items-center justify-between shrink-0">
        <button onClick={onClose} className="text-white/80 font-semibold text-sm">Cancel</button>
        <h2 className="text-lg font-black">{title}</h2>
        <div className="w-12" />
      </div>
      <div className="flex-1 flex flex-col justify-start items-center px-6 py-6 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function MenuBtn({ label, desc, onClick }: { label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full py-4 px-4 rounded-2xl bg-[#f5f5f7] text-left active:bg-[#e8e8ed] transition-colors">
      <p className="text-sm font-bold text-[#1d1d1f]">{label}</p>
      <p className="text-xs text-[#86868b]">{desc}</p>
    </button>
  );
}

function StepTeamPicker({ label, homeName, awayName, homeId, awayId, onPick }: {
  label: string; homeName: string; awayName: string; homeId: string; awayId: string; onPick: (id: string) => void;
}) {
  return (
    <div className="w-full space-y-4">
      <p className="text-center text-lg font-bold text-[#1d1d1f] mb-4">{label}</p>
      <button onClick={() => onPick(homeId)}
        className="w-full py-6 rounded-2xl bg-[#003e79] text-white text-lg font-black active:bg-[#002d5a]">{homeName}</button>
      <button onClick={() => onPick(awayId)}
        className="w-full py-6 rounded-2xl bg-[#005599] text-white text-lg font-black active:bg-[#003e79]">{awayName}</button>
    </div>
  );
}

function PlayerPicker({ label, players, onPick, onSkip, optional, showKeypad }: {
  label: string; players: RosterPlayer[]; onPick: (jersey: string) => void; onSkip?: () => void; optional?: boolean; showKeypad?: boolean;
}) {
  const [keypadMode, setKeypadMode] = useState(false);
  const [keypadValue, setKeypadValue] = useState('');

  if (keypadMode || players.length === 0) {
    return (
      <div className="w-full">
        <p className="text-center text-lg font-bold text-[#1d1d1f] mb-1">{label} — Jersey #</p>
        {optional && <p className="text-center text-sm text-[#86868b] mb-4">Optional</p>}
        <JerseyKeypad value={keypadValue} onChange={setKeypadValue}
          onNext={() => onPick(keypadValue)} nextLabel={optional ? 'Add' : 'Next'}
          showSkip={optional} onSkip={onSkip} />
        {players.length > 0 && (
          <button onClick={() => setKeypadMode(false)}
            className="w-full mt-3 py-2 text-sm text-[#003e79] font-semibold">Show Roster</button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <p className="text-center text-lg font-bold text-[#1d1d1f] mb-1">{label}</p>
      {optional && <p className="text-center text-sm text-[#86868b] mb-2">Optional</p>}
      <div className="grid grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto mb-4">
        {players.map(p => (
          <button key={p.id} onClick={() => onPick(p.jersey_number)}
            className="py-3 px-2 rounded-xl bg-white border border-[#e8e8ed] active:bg-[#f0f7ff] transition-colors text-center">
            <span className="text-lg font-black text-[#003e79]">#{p.jersey_number}</span>
            <p className="text-[10px] text-[#6e6e73] truncate mt-0.5">{p.last_name}</p>
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        {optional && onSkip && (
          <button onClick={onSkip} className="flex-1 py-3 rounded-full bg-[#e8e8ed] text-[#3d3d3d] text-sm font-bold">Skip</button>
        )}
        {showKeypad && (
          <button onClick={() => setKeypadMode(true)} className="flex-1 py-3 rounded-full bg-[#f5f5f7] text-[#3d3d3d] text-sm font-bold">
            Enter # Manually
          </button>
        )}
      </div>
    </div>
  );
}

function JerseyKeypad({ value, onChange, onNext, nextLabel, showSkip, onSkip }: {
  value: string; onChange: (v: string) => void; onNext: () => void; nextLabel: string; showSkip?: boolean; onSkip?: () => void;
}) {
  const press = (n: string) => { if (value.length < 2) onChange(value + n); };
  const backspace = () => onChange(value.slice(0, -1));

  return (
    <div className="w-full space-y-4">
      <div className="text-center py-4 bg-[#fafafa] rounded-xl">
        <p className="text-6xl font-black text-[#003e79] tabular-nums">{value || '—'}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['1','2','3','4','5','6','7','8','9'].map(n => (
          <button key={n} onClick={() => press(n)}
            className="h-14 rounded-xl bg-white border border-[#e8e8ed] text-xl font-bold text-[#003e79] active:bg-[#f0f7ff]">{n}</button>
        ))}
        <button onClick={backspace} className="h-14 rounded-xl bg-white border border-[#e8e8ed] text-xl font-bold text-red-500 active:bg-red-50">←</button>
        <button onClick={() => press('0')} className="h-14 rounded-xl bg-white border border-[#e8e8ed] text-xl font-bold text-[#003e79] active:bg-[#f0f7ff]">0</button>
        <div />
      </div>
      <div className="flex gap-3">
        {showSkip && <button onClick={onSkip} className="flex-1 py-4 rounded-full bg-[#e8e8ed] text-[#3d3d3d] text-base font-bold">Skip</button>}
        <button onClick={onNext} disabled={!value && !showSkip}
          className="flex-1 py-4 rounded-full bg-[#003e79] text-white text-base font-bold disabled:bg-[#86868b]">{nextLabel}</button>
      </div>
    </div>
  );
}

function OfficialsModal({ gameId, pin, onClose, onFlash }: { gameId: string; pin: string; onClose: () => void; onFlash: (c: string) => void }) {
  const [ref1, setRef1] = useState('');
  const [ref2, setRef2] = useState('');
  const [lines1, setLines1] = useState('');
  const [lines2, setLines2] = useState('');
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    const officials = [
      ref1 && { officialName: ref1, role: 'referee' },
      ref2 && { officialName: ref2, role: 'referee' },
      lines1 && { officialName: lines1, role: 'linesman' },
      lines2 && { officialName: lines2, role: 'linesman' },
    ].filter(Boolean);
    if (officials.length === 0) return;

    setPosting(true);
    try {
      await fetch(`${API_BASE}/scoring/games/${gameId}/officials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scorekeeper-Pin': pin },
        body: JSON.stringify({ officials }),
      });
      onFlash('green');
      onClose();
    } catch { onFlash('red'); }
    finally { setPosting(false); }
  };

  const inputCls = "w-full px-4 py-3 border border-[#e8e8ed] rounded-xl text-sm";

  return (
    <FullScreenModal title="OFFICIALS" onClose={onClose}>
      <div className="w-full space-y-4">
        <div>
          <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">Referees</p>
          <input placeholder="Referee 1" value={ref1} onChange={e => setRef1(e.target.value)} className={inputCls} />
          <input placeholder="Referee 2" value={ref2} onChange={e => setRef2(e.target.value)} className={inputCls + ' mt-2'} />
        </div>
        <div>
          <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">Linesmen</p>
          <input placeholder="Linesman 1" value={lines1} onChange={e => setLines1(e.target.value)} className={inputCls} />
          <input placeholder="Linesman 2" value={lines2} onChange={e => setLines2(e.target.value)} className={inputCls + ' mt-2'} />
        </div>
        <button onClick={submit} disabled={posting || (!ref1 && !ref2 && !lines1 && !lines2)}
          className="w-full py-4 rounded-full bg-[#003e79] text-white text-lg font-bold disabled:opacity-50">
          Save Officials
        </button>
      </div>
    </FullScreenModal>
  );
}

export default function ScoringPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="animate-pulse text-[#86868b]">Loading...</div>
      </div>
    }>
      <ScoringPageInner />
    </Suspense>
  );
}
