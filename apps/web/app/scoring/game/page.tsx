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

interface ShotRecord {
  team_id: string;
  period: number;
  shot_count: number;
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

type ModalType = null | 'goal' | 'penalty' | 'shots';
type GoalStep = 'team' | 'jersey' | 'assist1' | 'assist2';
type PenaltyStep = 'team' | 'jersey' | 'type';

function ScoringPageInner() {
  const searchParams = useSearchParams();
  const gameId = searchParams.get('gameId');
  const pin = searchParams.get('pin');

  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [posting, setPosting] = useState(false);

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

  // Flash feedback
  const [flash, setFlash] = useState('');

  const fetchGame = useCallback(async () => {
    if (!gameId) return;
    try {
      const res = await fetch(`${API_BASE}/scoring/games/${gameId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setGame(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch game:', err);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { fetchGame(); }, [fetchGame]);

  // Poll every 15s
  useEffect(() => {
    const interval = setInterval(fetchGame, 15000);
    return () => clearInterval(interval);
  }, [fetchGame]);

  // Build shots lookup: { teamId: { period: count } }
  const shotsMap: Record<string, Record<number, number>> = {};
  if (game?.shots) {
    for (const s of game.shots) {
      if (!shotsMap[s.team_id]) shotsMap[s.team_id] = {};
      shotsMap[s.team_id][s.period] = s.shot_count;
    }
  }

  const postEvent = async (payload: any) => {
    if (!gameId || !pin || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`${API_BASE}/scoring/games/${gameId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scorekeeper-Pin': pin },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        doFlash('green');
        await fetchGame();
      } else {
        doFlash('red');
      }
    } catch {
      doFlash('red');
    } finally {
      setPosting(false);
    }
  };

  const postShots = async (teamId: string, period: number, shotCount: number) => {
    if (!gameId || !pin) return;
    try {
      await fetch(`${API_BASE}/scoring/games/${gameId}/shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Scorekeeper-Pin': pin },
        body: JSON.stringify({ teamId, period, shotCount }),
      });
      await fetchGame();
    } catch (err) {
      console.error('Failed to post shots:', err);
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!gameId || !pin) return;
    try {
      await fetch(`${API_BASE}/scoring/games/${gameId}/events/${eventId}`, {
        method: 'DELETE',
        headers: { 'X-Scorekeeper-Pin': pin },
      });
      await fetchGame();
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  const doFlash = (color: string) => {
    setFlash(color);
    setTimeout(() => setFlash(''), 400);
  };

  // Goal flow
  const resetGoal = () => { setGoalStep('team'); setGoalTeamId(''); setGoalJersey(''); setGoalAssist1(''); setGoalAssist2(''); };
  const openGoal = () => { resetGoal(); setModal('goal'); };

  const submitGoal = async () => {
    await postEvent({
      eventType: 'goal',
      teamId: goalTeamId,
      jerseyNumber: goalJersey || null,
      assist1Jersey: goalAssist1 || null,
      assist2Jersey: goalAssist2 || null,
      period: game?.period || 1,
    });
    setModal(null);
  };

  // Penalty flow
  const resetPenalty = () => { setPenaltyStep('team'); setPenaltyTeamId(''); setPenaltyJersey(''); };
  const openPenalty = () => { resetPenalty(); setModal('penalty'); };

  const submitPenalty = async (penalty: { code: string; min: number }) => {
    await postEvent({
      eventType: 'penalty',
      teamId: penaltyTeamId,
      jerseyNumber: penaltyJersey || null,
      penaltyCode: penalty.code,
      penaltyMinutes: penalty.min,
      period: game?.period || 1,
    });
    setModal(null);
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

  // Flash overlay
  const flashBg = flash === 'green' ? 'bg-emerald-500/20' : flash === 'red' ? 'bg-red-500/20' : '';

  return (
    <div className={`min-h-screen bg-[#fafafa] flex flex-col transition-colors duration-300 ${flashBg}`}>
      {/* SCOREBOARD */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] text-white">
        {/* Back + game info */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <a href="/scoring" className="text-white/60 text-xs font-semibold">← Back</a>
          <span className="text-white/60 text-xs font-semibold">Game #{game.game_number}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isLive ? 'bg-red-500 text-white' : isFinal ? 'bg-white/20 text-white' : 'bg-white/20 text-white'
          }`}>
            {statusLabel}
          </span>
        </div>
        {/* Score */}
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
                className="py-5 rounded-2xl bg-emerald-600 text-white text-base font-black active:bg-emerald-700 disabled:opacity-50 transition-colors">
                GOAL
              </button>
              <button onClick={openPenalty} disabled={posting}
                className="py-5 rounded-2xl bg-amber-500 text-white text-base font-black active:bg-amber-600 disabled:opacity-50 transition-colors">
                PENALTY
              </button>
              <button onClick={() => setModal('shots')} disabled={posting}
                className="py-5 rounded-2xl bg-[#003e79] text-white text-base font-black active:bg-[#002d5a] disabled:opacity-50 transition-colors">
                SHOTS
              </button>
            </div>
            <button onClick={endPeriod} disabled={posting}
              className="w-full py-4 rounded-full bg-orange-500 text-white text-lg font-black active:bg-orange-600 disabled:opacity-50 transition-colors">
              END PERIOD
            </button>
            {period >= 3 && (
              <button onClick={endGame} disabled={posting}
                className="w-full py-4 rounded-full bg-red-600 text-white text-lg font-black active:bg-red-700 disabled:opacity-50 transition-colors">
                END GAME
              </button>
            )}
          </>
        )}

        {isIntermission && (
          <button onClick={startPeriod} disabled={posting}
            className="w-full py-5 rounded-full bg-emerald-600 text-white text-2xl font-black active:bg-emerald-700 disabled:opacity-50 transition-colors">
            START {period === 1 ? '2ND' : period === 2 ? '3RD' : 'OT'} PERIOD
          </button>
        )}

        {isFinal && (
          <div className="text-center py-5 bg-[#1d1d1f] text-white rounded-2xl text-xl font-black">
            FINAL
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
                    <button onClick={() => deleteEvent(ev.id)} className="p-2 rounded-lg active:bg-red-50 transition-colors">
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

      {/* ==================== GOAL MODAL ==================== */}
      {modal === 'goal' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <ModalHeader title="GOAL" onClose={() => setModal(null)} />
          <div className="flex-1 flex flex-col justify-center items-center px-6 py-6">
            {goalStep === 'team' && (
              <StepTeamPicker
                label="Which team scored?"
                homeName={game.home_team_name}
                awayName={game.away_team_name}
                onPick={(id) => { setGoalTeamId(id); setGoalStep('jersey'); }}
                homeId={game.home_team_id}
                awayId={game.away_team_id}
              />
            )}
            {goalStep === 'jersey' && (
              <div className="w-full">
                <p className="text-center text-lg font-bold text-[#1d1d1f] mb-6">Goal scorer — Jersey #</p>
                <JerseyKeypad value={goalJersey} onChange={setGoalJersey}
                  onNext={() => setGoalStep('assist1')} nextLabel="Next" />
              </div>
            )}
            {goalStep === 'assist1' && (
              <div className="w-full">
                <p className="text-center text-lg font-bold text-[#1d1d1f] mb-1">1st Assist — Jersey #</p>
                <p className="text-center text-sm text-[#86868b] mb-6">Optional</p>
                <JerseyKeypad value={goalAssist1} onChange={setGoalAssist1}
                  onNext={() => setGoalStep('assist2')} nextLabel="Next" showSkip onSkip={() => { setGoalAssist1(''); setGoalStep('assist2'); }} />
              </div>
            )}
            {goalStep === 'assist2' && (
              <div className="w-full">
                <p className="text-center text-lg font-bold text-[#1d1d1f] mb-1">2nd Assist — Jersey #</p>
                <p className="text-center text-sm text-[#86868b] mb-6">Optional</p>
                <JerseyKeypad value={goalAssist2} onChange={setGoalAssist2}
                  onNext={submitGoal} nextLabel="Done" showSkip onSkip={() => { setGoalAssist2(''); submitGoal(); }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== PENALTY MODAL ==================== */}
      {modal === 'penalty' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <ModalHeader title="PENALTY" onClose={() => setModal(null)} />
          <div className="flex-1 flex flex-col justify-center items-center px-6 py-6">
            {penaltyStep === 'team' && (
              <StepTeamPicker
                label="Which team?"
                homeName={game.home_team_name}
                awayName={game.away_team_name}
                onPick={(id) => { setPenaltyTeamId(id); setPenaltyStep('jersey'); }}
                homeId={game.home_team_id}
                awayId={game.away_team_id}
              />
            )}
            {penaltyStep === 'jersey' && (
              <div className="w-full">
                <p className="text-center text-lg font-bold text-[#1d1d1f] mb-6">Player — Jersey #</p>
                <JerseyKeypad value={penaltyJersey} onChange={setPenaltyJersey}
                  onNext={() => setPenaltyStep('type')} nextLabel="Next" />
              </div>
            )}
            {penaltyStep === 'type' && (
              <div className="w-full overflow-y-auto max-h-[70vh]">
                <p className="text-center text-lg font-bold text-[#1d1d1f] mb-4">Select Penalty</p>
                {/* Minor */}
                <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">Minor (2:00)</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {PENALTIES_MINOR.map((p) => (
                    <button key={p.code} onClick={() => submitPenalty(p)}
                      className="py-3 px-2 rounded-xl bg-amber-500 text-white text-sm font-bold active:bg-amber-600 transition-colors">
                      {p.name}
                    </button>
                  ))}
                </div>
                {/* Major */}
                <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">Major (5:00)</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {PENALTIES_MAJOR.map((p) => (
                    <button key={p.code} onClick={() => submitPenalty(p)}
                      className="py-3 px-2 rounded-xl bg-red-600 text-white text-sm font-bold active:bg-red-700 transition-colors">
                      {p.name}
                    </button>
                  ))}
                </div>
                {/* Misconduct */}
                <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest mb-2">Misconduct (10:00)</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {PENALTIES_MISCONDUCT.map((p) => (
                    <button key={p.code} onClick={() => submitPenalty(p)}
                      className="py-3 px-2 rounded-xl bg-[#1d1d1f] text-white text-sm font-bold active:bg-black transition-colors">
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== SHOTS MODAL ==================== */}
      {modal === 'shots' && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <ModalHeader title="SHOT COUNT" onClose={() => setModal(null)} />
          <div className="flex-1 flex flex-col justify-center items-center px-6 py-6 gap-6">
            <p className="text-xs font-bold text-[#86868b] uppercase tracking-widest">Period {period}</p>

            {/* Home shots */}
            <div className="w-full bg-[#fafafa] rounded-2xl p-6">
              <p className="text-center font-bold text-[#1d1d1f] mb-4">{game.home_team_name}</p>
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => {
                    const cur = shotsMap[game.home_team_id]?.[period] || 0;
                    if (cur > 0) postShots(game.home_team_id, period, cur - 1);
                  }}
                  className="w-14 h-14 rounded-full bg-red-500 text-white text-2xl font-black flex items-center justify-center active:bg-red-600">
                  −
                </button>
                <span className="text-5xl font-black text-[#003e79] w-20 text-center tabular-nums">
                  {shotsMap[game.home_team_id]?.[period] || 0}
                </span>
                <button
                  onClick={() => {
                    const cur = shotsMap[game.home_team_id]?.[period] || 0;
                    postShots(game.home_team_id, period, cur + 1);
                  }}
                  className="w-14 h-14 rounded-full bg-emerald-600 text-white text-2xl font-black flex items-center justify-center active:bg-emerald-700">
                  +
                </button>
              </div>
            </div>

            {/* Away shots */}
            <div className="w-full bg-[#fafafa] rounded-2xl p-6">
              <p className="text-center font-bold text-[#1d1d1f] mb-4">{game.away_team_name}</p>
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => {
                    const cur = shotsMap[game.away_team_id]?.[period] || 0;
                    if (cur > 0) postShots(game.away_team_id, period, cur - 1);
                  }}
                  className="w-14 h-14 rounded-full bg-red-500 text-white text-2xl font-black flex items-center justify-center active:bg-red-600">
                  −
                </button>
                <span className="text-5xl font-black text-[#003e79] w-20 text-center tabular-nums">
                  {shotsMap[game.away_team_id]?.[period] || 0}
                </span>
                <button
                  onClick={() => {
                    const cur = shotsMap[game.away_team_id]?.[period] || 0;
                    postShots(game.away_team_id, period, cur + 1);
                  }}
                  className="w-14 h-14 rounded-full bg-emerald-600 text-white text-2xl font-black flex items-center justify-center active:bg-emerald-700">
                  +
                </button>
              </div>
            </div>

            <button onClick={() => setModal(null)}
              className="w-full py-4 rounded-full bg-[#003e79] text-white text-lg font-bold active:bg-[#002d5a] transition-colors">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Wrap in Suspense for useSearchParams
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

/* ===================== SHARED COMPONENTS ===================== */

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="bg-gradient-to-r from-[#003e79] via-[#005599] to-[#00ccff] text-white px-4 py-4 flex items-center justify-between">
      <button onClick={onClose} className="text-white/80 font-semibold text-sm">Cancel</button>
      <h2 className="text-lg font-black">{title}</h2>
      <div className="w-12" />
    </div>
  );
}

function StepTeamPicker({ label, homeName, awayName, homeId, awayId, onPick }: {
  label: string;
  homeName: string;
  awayName: string;
  homeId: string;
  awayId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="w-full space-y-4">
      <p className="text-center text-lg font-bold text-[#1d1d1f] mb-4">{label}</p>
      <button onClick={() => onPick(homeId)}
        className="w-full py-6 rounded-2xl bg-[#003e79] text-white text-lg font-black active:bg-[#002d5a] transition-colors">
        {homeName}
      </button>
      <button onClick={() => onPick(awayId)}
        className="w-full py-6 rounded-2xl bg-[#005599] text-white text-lg font-black active:bg-[#003e79] transition-colors">
        {awayName}
      </button>
    </div>
  );
}

function JerseyKeypad({ value, onChange, onNext, nextLabel, showSkip, onSkip }: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  nextLabel: string;
  showSkip?: boolean;
  onSkip?: () => void;
}) {
  const press = (n: string) => {
    if (value.length < 2) onChange(value + n);
  };
  const backspace = () => onChange(value.slice(0, -1));

  return (
    <div className="w-full space-y-4">
      {/* Display */}
      <div className="text-center py-4 bg-[#fafafa] rounded-xl">
        <p className="text-6xl font-black text-[#003e79] tabular-nums">{value || '—'}</p>
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2">
        {['1','2','3','4','5','6','7','8','9'].map((n) => (
          <button key={n} onClick={() => press(n)}
            className="h-14 rounded-xl bg-white border border-[#e8e8ed] text-xl font-bold text-[#003e79] active:bg-[#f0f7ff] transition-colors">
            {n}
          </button>
        ))}
        <button onClick={backspace}
          className="h-14 rounded-xl bg-white border border-[#e8e8ed] text-xl font-bold text-red-500 active:bg-red-50 transition-colors">
          ←
        </button>
        <button onClick={() => press('0')}
          className="h-14 rounded-xl bg-white border border-[#e8e8ed] text-xl font-bold text-[#003e79] active:bg-[#f0f7ff] transition-colors">
          0
        </button>
        <div />
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {showSkip && (
          <button onClick={onSkip}
            className="flex-1 py-4 rounded-full bg-[#e8e8ed] text-[#3d3d3d] text-base font-bold active:bg-[#d1d1d6] transition-colors">
            Skip
          </button>
        )}
        <button onClick={onNext} disabled={!value && !showSkip}
          className="flex-1 py-4 rounded-full bg-[#003e79] text-white text-base font-bold active:bg-[#002d5a] disabled:bg-[#86868b] transition-colors">
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
