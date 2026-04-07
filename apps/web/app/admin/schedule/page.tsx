'use client';

import { useState, useEffect, useCallback } from 'react';

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

interface VenueRink {
  id: string;
  venue_id: string;
  name: string;
  surface_size: string | null;
  capacity: number | null;
}

// Helpers
const fmtDateFull = (d: string) => {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const fmtTime = (t: string | null) => {
  if (!t) return '—';
  return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const fmtDatetime = (t: string | null) => {
  if (!t) return '—';
  return new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

const getDayHeaders = (startDate: string, endDate: string): { date: string; label: string }[] => {
  const headers: { date: string; label: string }[] = [];
  const current = new Date(startDate + 'T12:00:00');
  const end = new Date(endDate + 'T12:00:00');
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    headers.push({ date: dateStr, label: fmtDateFull(dateStr) });
    current.setDate(current.getDate() + 1);
  }
  return headers;
};

const gameTypeLabels: Record<string, string> = {
  pool: 'Pool Play',
  semifinal: 'Semifinal',
  championship: 'Championship',
  consolation: 'Consolation',
  placement: 'Placement',
  quarterfinal: 'Quarterfinal',
};

const gameTypeBadge: Record<string, string> = {
  championship: 'bg-amber-500 text-white',
  semifinal: 'bg-[#003e79] text-white',
  consolation: 'bg-[#6e6e73] text-white',
  placement: 'bg-[#86868b] text-white',
  pool: 'bg-[#f0f7ff] text-[#003e79]',
};

// ==========================================
// EDIT GAME MODAL
// ==========================================
function EditGameModal({
  game,
  allTeams,
  rinks,
  divisions,
  onSave,
  onDelete,
  onSwap,
  onClose,
  allGames,
}: {
  game: Game;
  allTeams: Registration[];
  rinks: VenueRink[];
  divisions: Division[];
  onSave: (gameId: string, updates: any) => Promise<void>;
  onDelete: (gameId: string) => Promise<void>;
  onSwap: (gameId1: string, gameId2: string) => Promise<void>;
  onClose: () => void;
  allGames: Game[];
}) {
  const [homeTeamId, setHomeTeamId] = useState(game.home_team_id || '');
  const [awayTeamId, setAwayTeamId] = useState(game.away_team_id || '');
  const [rinkId, setRinkId] = useState(game.rink_id || '');
  const [startDate, setStartDate] = useState(game.start_time ? game.start_time.split('T')[0] : '');
  const [startTime, setStartTime] = useState(game.start_time ? game.start_time.split('T')[1]?.substring(0, 5) : '');
  const [gameType, setGameType] = useState(game.game_type);
  const [notes, setNotes] = useState(game.notes || '');
  const [saving, setSaving] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [swapTargetId, setSwapTargetId] = useState('');

  const div = divisions.find(d => d.id === game.event_division_id);
  const divTeams = allTeams.filter(r => r.event_division_id === game.event_division_id && r.status === 'approved');

  // Other games in same event for swap targets
  const swapCandidates = allGames.filter(g => g.id !== game.id && g.event_id === game.event_id);

  const handleSave = async () => {
    setSaving(true);
    const endMinutes = startTime ? parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]) + 60 : null;
    const endH = endMinutes ? Math.floor(endMinutes / 60).toString().padStart(2, '0') : null;
    const endM = endMinutes ? (endMinutes % 60).toString().padStart(2, '0') : null;

    await onSave(game.id, {
      home_team_id: homeTeamId || null,
      away_team_id: awayTeamId || null,
      rink_id: rinkId || null,
      start_time: startDate && startTime ? `${startDate}T${startTime}:00` : null,
      end_time: startDate && endH && endM ? `${startDate}T${endH}:${endM}:00` : null,
      game_type: gameType,
      notes: notes || null,
    });
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!confirm(`Delete Game #${game.game_number}? This cannot be undone.`)) return;
    await onDelete(game.id);
    onClose();
  };

  const handleSwap = async () => {
    if (!swapTargetId) return;
    await onSwap(game.id, swapTargetId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-[#003e79] to-[#005599] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg">Edit Game #{game.game_number}</h3>
            <p className="text-white/70 text-xs mt-0.5">
              {div ? `${div.age_group} — ${div.division_level}` : 'Unknown Division'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Game Type */}
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Game Type</label>
            <select
              value={gameType}
              onChange={e => setGameType(e.target.value)}
              className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm"
            >
              {Object.entries(gameTypeLabels).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {/* Teams */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Home Team</label>
              <select
                value={homeTeamId}
                onChange={e => setHomeTeamId(e.target.value)}
                className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm"
              >
                <option value="">TBD</option>
                {divTeams.map(t => (
                  <option key={t.team_id} value={t.team_id}>{t.team_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Away Team</label>
              <select
                value={awayTeamId}
                onChange={e => setAwayTeamId(e.target.value)}
                className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm"
              >
                <option value="">TBD</option>
                {divTeams.map(t => (
                  <option key={t.team_id} value={t.team_id}>{t.team_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm"
              />
            </div>
          </div>

          {/* Rink */}
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Rink</label>
            <select
              value={rinkId}
              onChange={e => setRinkId(e.target.value)}
              className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm"
            >
              <option value="">Unassigned</option>
              {rinks.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g., 1G vs 2B — Semifinal"
              className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm"
            />
          </div>

          {/* Swap Section */}
          {!showSwap ? (
            <button
              onClick={() => setShowSwap(true)}
              className="text-sm text-[#003e79] font-semibold hover:underline"
            >
              Swap time slot with another game...
            </button>
          ) : (
            <div className="bg-[#fafafa] border border-[#e8e8ed] rounded-xl p-4">
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Swap With</label>
              <select
                value={swapTargetId}
                onChange={e => setSwapTargetId(e.target.value)}
                className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm mb-2"
              >
                <option value="">Select a game...</option>
                {swapCandidates.map(g => (
                  <option key={g.id} value={g.id}>
                    #{g.game_number} — {g.home_team_name || 'TBD'} vs {g.away_team_name || 'TBD'} ({fmtDatetime(g.start_time)})
                  </option>
                ))}
              </select>
              <button
                onClick={handleSwap}
                disabled={!swapTargetId}
                className="px-4 py-2 bg-[#003e79] text-white rounded-full text-sm font-semibold disabled:bg-[#86868b] hover:bg-[#002d5a] transition"
              >
                Swap Time Slots
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[#e8e8ed]">
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-full text-sm font-semibold transition"
            >
              Delete Game
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-[#e8e8ed] text-[#3d3d3d] rounded-full text-sm font-semibold hover:bg-[#fafafa] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-[#003e79] text-white rounded-full text-sm font-semibold hover:bg-[#002d5a] disabled:bg-[#86868b] transition"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ADD GAME MODAL
// ==========================================
function AddGameModal({
  event,
  divisions,
  allTeams,
  rinks,
  onAdd,
  onClose,
}: {
  event: Event;
  divisions: Division[];
  allTeams: Registration[];
  rinks: VenueRink[];
  onAdd: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [divisionId, setDivisionId] = useState(divisions[0]?.id || '');
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [rinkId, setRinkId] = useState('');
  const [startDate, setStartDate] = useState(event.start_date);
  const [startTime, setStartTime] = useState('12:00');
  const [gameType, setGameType] = useState('pool');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const divTeams = allTeams.filter(r => r.event_division_id === divisionId && r.status === 'approved');

  const handleAdd = async () => {
    setSaving(true);
    await onAdd({
      event_id: event.id,
      event_division_id: divisionId,
      home_team_id: homeTeamId || null,
      away_team_id: awayTeamId || null,
      rink_id: rinkId || null,
      start_time: `${startDate}T${startTime}:00`,
      end_time: `${startDate}T${String(parseInt(startTime.split(':')[0]) + 1).padStart(2, '0')}:${startTime.split(':')[1]}:00`,
      game_type: gameType,
      notes: notes || null,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#003e79] to-[#005599] rounded-t-2xl px-6 py-4 flex items-center justify-between">
          <h3 className="text-white font-bold text-lg">Add Game</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Division</label>
            <select value={divisionId} onChange={e => setDivisionId(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm">
              {divisions.map(d => <option key={d.id} value={d.id}>{d.age_group} — {d.division_level}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Game Type</label>
            <select value={gameType} onChange={e => setGameType(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm">
              {Object.entries(gameTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Home Team</label>
              <select value={homeTeamId} onChange={e => setHomeTeamId(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm">
                <option value="">TBD</option>
                {divTeams.map(t => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Away Team</label>
              <select value={awayTeamId} onChange={e => setAwayTeamId(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm">
                <option value="">TBD</option>
                {divTeams.map(t => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Rink</label>
            <select value={rinkId} onChange={e => setRinkId(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm">
              <option value="">Unassigned</option>
              {rinks.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1.5">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#e8e8ed]">
            <button onClick={onClose} className="px-4 py-2 border border-[#e8e8ed] text-[#3d3d3d] rounded-full text-sm font-semibold hover:bg-[#fafafa] transition">Cancel</button>
            <button onClick={handleAdd} disabled={saving} className="px-6 py-2 bg-[#003e79] text-white rounded-full text-sm font-semibold hover:bg-[#002d5a] disabled:bg-[#86868b] transition">{saving ? 'Adding...' : 'Add Game'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SCHEDULE MATRIX (clickable)
// ==========================================
function ScheduleMatrix({
  division,
  registrations,
  games,
  dayHeaders,
  onClickGame,
}: {
  division: Division;
  registrations: Registration[];
  games: Game[];
  dayHeaders: { date: string; label: string }[];
  onClickGame: (game: Game) => void;
}) {
  const divisionRegs = registrations.filter(r => r.event_division_id === division.id && r.status === 'approved');

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
  const poolNames = Array.from(new Set(poolGames.map(g => g.pool_name).filter(Boolean))) as string[];

  // Build matrix rows
  const rows = divisionRegs.map(reg => {
    const teamNum = teamMap.get(reg.team_id) || 0;
    const row: { opponents: string[]; types: string[]; gameRefs: Game[] }[] = [];
    dayHeaders.forEach(header => {
      const gamesForTeam = poolGames.filter(
        g => g.start_time?.startsWith(header.date) && (g.home_team_id === reg.team_id || g.away_team_id === reg.team_id)
      );
      const opponents: string[] = [];
      const types: string[] = [];
      const gameRefs: Game[] = [];
      for (const game of gamesForTeam) {
        const opponentId = game.home_team_id === reg.team_id ? game.away_team_id : game.home_team_id;
        const opponentNum = opponentId ? teamMap.get(opponentId) : null;
        opponents.push(opponentNum ? String(opponentNum) : '?');
        types.push(game.pool_name?.includes('Crossover') ? 'crossover' : 'pool');
        gameRefs.push(game);
      }
      row.push({ opponents, types, gameRefs });
    });
    const teamPool = poolGames.find(g =>
      (g.home_team_id === reg.team_id || g.away_team_id === reg.team_id) && g.pool_name && !g.pool_name.includes('Crossover')
    )?.pool_name || '';
    return { reg, row, teamNum, teamPool };
  });

  return (
    <div className="space-y-4">
      {/* Pool Play Matrix */}
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 overflow-x-auto">
        <div className="flex items-center gap-3 mb-4">
          <h4 className="font-semibold text-[#1d1d1f] text-sm">Pool Play</h4>
          {poolNames.filter(p => !p.includes('Crossover')).map(p => (
            <span key={p} className="inline-block px-2 py-0.5 bg-[#f0f7ff] text-[#003e79] text-[10px] font-semibold rounded-full">{p}</span>
          ))}
          <span className="ml-auto text-[10px] text-[#86868b]">Click a circle to edit that game</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-3 py-3 text-center w-8">#</th>
              <th className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left sticky left-0 z-10 w-40">Team</th>
              <th className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-2 py-3 text-center w-16">Pool</th>
              {dayHeaders.map(header => (
                <th key={header.date} className="bg-[#fafafa] text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-3 py-3 text-center min-w-16">
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ reg, row, teamNum, teamPool }) => (
              <tr key={reg.id} className="border-t border-[#e8e8ed] hover:bg-[#fafafa]">
                <td className="px-3 py-3 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-[#003e79] text-white rounded-full text-[10px] font-bold">{teamNum}</span>
                </td>
                <td className="px-4 py-3 text-[#1d1d1f] font-semibold sticky left-0 z-10 bg-white text-sm">{reg.team_name}</td>
                <td className="px-2 py-3 text-center text-[10px] text-[#6e6e73] font-medium">{teamPool ? teamPool.replace('Pool ', '') : '—'}</td>
                {row.map((cell, idx) => (
                  <td key={idx} className="px-3 py-3 text-center text-[#3d3d3d] border-l border-[#e8e8ed]">
                    {cell.opponents.length > 0 ? (
                      <div className="flex items-center justify-center gap-1">
                        {cell.opponents.map((opp, oi) => (
                          <button
                            key={oi}
                            onClick={() => onClickGame(cell.gameRefs[oi])}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold cursor-pointer transition hover:scale-110 hover:shadow-md ${
                              cell.types[oi] === 'crossover' ? 'bg-[#00ccff] text-white' : 'bg-[#003e79] text-white'
                            }`}
                            title={`Game #${cell.gameRefs[oi].game_number}: ${cell.gameRefs[oi].home_team_name || 'TBD'} vs ${cell.gameRefs[oi].away_team_name || 'TBD'} — click to edit`}
                          >
                            {opp}
                          </button>
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
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-[#003e79]"></span> Pool Game</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-[#00ccff]"></span> Crossover</span>
        </div>
      </div>

      {/* Bracket Games */}
      {bracketGames.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-[#1d1d1f] text-sm">Bracket Play</h4>
            <span className="text-[10px] text-[#86868b]">Click a card to edit</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {bracketGames
              .sort((a, b) => {
                const order = ['semifinal', 'championship', 'consolation', 'placement'];
                return order.indexOf(a.game_type) - order.indexOf(b.game_type);
              })
              .map(game => (
                <button
                  key={game.id}
                  onClick={() => onClickGame(game)}
                  className="border border-[#e8e8ed] rounded-xl p-4 flex items-center gap-4 text-left hover:bg-[#fafafa] hover:border-[#003e79]/30 transition cursor-pointer w-full"
                >
                  <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-[10px] font-bold ${gameTypeBadge[game.game_type] || 'bg-[#003e79] text-white'}`}>
                    {game.game_type === 'championship' ? 'CHAMP' : game.game_type === 'semifinal' ? 'SEMI' : game.game_type === 'consolation' ? 'CONS' : 'PLACE'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[#1d1d1f] text-sm truncate">
                      {game.home_team_name && game.away_team_name
                        ? `${game.home_team_name} vs ${game.away_team_name}`
                        : game.notes || 'TBD vs TBD'}
                    </div>
                    <div className="text-[10px] text-[#86868b] mt-0.5">
                      Game #{game.game_number}
                      {game.start_time && ` · ${fmtDatetime(game.start_time)}`}
                      {game.rink_name && ` · ${game.rink_name}`}
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// GAME LIST VIEW (clickable rows)
// ==========================================
function GameListView({ games, divisions, onClickGame }: { games: Game[]; divisions: Division[]; onClickGame: (game: Game) => void }) {
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
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">Game</th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">Time</th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">Rink</th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">Matchup</th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left">Division</th>
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-center">Type</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e8e8ed]">
          {sorted.map(game => {
            const div = divisionMap.get(game.event_division_id);
            return (
              <tr key={game.id} onClick={() => onClickGame(game)} className="hover:bg-[#fafafa] cursor-pointer transition">
                <td className="px-4 py-3 text-[#1d1d1f] font-semibold">#{game.game_number}</td>
                <td className="px-4 py-3 text-[#3d3d3d]">{fmtDatetime(game.start_time)}</td>
                <td className="px-4 py-3 text-[#3d3d3d]">{game.rink_name || '—'}</td>
                <td className="px-4 py-3 text-[#3d3d3d]">
                  {game.home_team_name && game.away_team_name
                    ? `${game.home_team_name} vs ${game.away_team_name}`
                    : game.notes || 'TBD vs TBD'}
                </td>
                <td className="px-4 py-3 text-[#6e6e73] text-xs">{div ? `${div.age_group} — ${div.division_level}` : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${gameTypeBadge[game.game_type] || 'bg-[#fafafa] text-[#6e6e73]'}`}>
                    {gameTypeLabels[game.game_type] || game.game_type}
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

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function AdminSchedulePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [venueRinks, setVenueRinks] = useState<VenueRink[]>([]);

  const [view, setView] = useState<'matrix' | 'list'>('matrix');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null); // null = show all

  // Modals
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [showAddGame, setShowAddGame] = useState(false);

  // Config
  const [showConfig, setShowConfig] = useState(false);
  const [gameDuration, setGameDuration] = useState(50);
  const [betweenGames, setBetweenGames] = useState(10);
  const [firstGameTime, setFirstGameTime] = useState('12:00');
  const [lastGameTime, setLastGameTime] = useState('21:00');

  // Per-rink availability: { [rinkId]: { firstGame, lastGame, blocked: [{start, end}] } }
  const [rinkAvailability, setRinkAvailability] = useState<Record<string, { firstGame: string; lastGame: string; blocked: { start: string; end: string }[] }>>({});

  // Reload games helper
  const reloadGames = useCallback(async () => {
    if (!selectedEvent) return;
    const res = await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/games`);
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) setGames(json.data);
  }, [selectedEvent]);

  // Load events
  useEffect(() => {
    authFetch(`${API_BASE}/events`).then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data)) setEvents(json.data);
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
      setRinkAvailability({});
      return;
    }

    Promise.all([
      authFetch(`${API_BASE}/events/${selectedEvent.slug}`).then(r => r.json()),
      authFetch(`${API_BASE}/registrations/event/${selectedEvent.id}`).then(r => r.json()),
      authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/games`).then(r => r.json()),
      selectedEvent.venue_id ? authFetch(`${API_BASE}/venues/${selectedEvent.venue_id}/rinks`).then(r => r.json()) : Promise.resolve({ data: [] }),
    ]).then(([eventJson, regJson, gameJson, rinkJson]) => {
      if (eventJson.success && eventJson.data?.divisions) setDivisions(eventJson.data.divisions);
      if (regJson.success && Array.isArray(regJson.data)) setRegistrations(regJson.data);
      if (gameJson.success && Array.isArray(gameJson.data)) setGames(gameJson.data);
      if (rinkJson.data && Array.isArray(rinkJson.data)) setVenueRinks(rinkJson.data);
    });
  }, [selectedEvent]);

  // CRUD handlers
  const handleSaveGame = async (gameId: string, updates: any) => {
    await authFetch(`${API_BASE}/scheduling/games/${gameId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    await reloadGames();
  };

  const handleDeleteGame = async (gameId: string) => {
    await authFetch(`${API_BASE}/scheduling/games/${gameId}`, { method: 'DELETE' });
    await reloadGames();
  };

  const handleSwapGames = async (gameId1: string, gameId2: string) => {
    await authFetch(`${API_BASE}/scheduling/games/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId1, gameId2 }),
    });
    await reloadGames();
  };

  const handleAddGame = async (data: any) => {
    await authFetch(`${API_BASE}/scheduling/games`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    await reloadGames();
  };

  const handleGenerateSchedule = async () => {
    if (!selectedEvent) return;
    const approvedRegs = registrations.filter(r => r.status === 'approved');
    if (approvedRegs.length === 0) {
      alert('No approved registrations yet — add teams to divisions first.');
      return;
    }
    if (!confirm('Generate schedule? This will replace any existing games.')) return;

    setGenerating(true);
    try {
      // Build rules including per-rink availability
      const rules = [
        { ruleType: 'game_duration_minutes', ruleValue: String(gameDuration), priority: 10 },
        { ruleType: 'min_rest_minutes', ruleValue: String(betweenGames), priority: 10 },
        { ruleType: 'first_game_time', ruleValue: firstGameTime, priority: 10 },
        { ruleType: 'last_game_time', ruleValue: lastGameTime, priority: 10 },
      ];
      // Add per-rink availability rules
      for (const [rinkId, avail] of Object.entries(rinkAvailability)) {
        rules.push({ ruleType: 'rink_first_game', ruleValue: JSON.stringify({ rinkId, time: avail.firstGame }), priority: 10 });
        rules.push({ ruleType: 'rink_last_game', ruleValue: JSON.stringify({ rinkId, time: avail.lastGame }), priority: 10 });
        if (avail.blocked.length > 0) {
          rules.push({ ruleType: 'rink_blocked_times', ruleValue: JSON.stringify({ rinkId, blocked: avail.blocked }), priority: 10 });
        }
      }
      await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      });
      const res = await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.success) {
        await reloadGames();
      } else {
        alert('Error: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setGenerating(false);
    }
  };

  const handleClearSchedule = async () => {
    if (!selectedEvent) return;
    if (!confirm('Clear all games? This cannot be undone.')) return;
    await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/games`, { method: 'DELETE' });
    setGames([]);
  };

  // Initialize rink availability when rinks load
  useEffect(() => {
    if (venueRinks.length > 0) {
      setRinkAvailability(prev => {
        const next = { ...prev };
        for (const rink of venueRinks) {
          if (!next[rink.id]) {
            next[rink.id] = { firstGame: firstGameTime, lastGame: lastGameTime, blocked: [] };
          }
        }
        return next;
      });
    }
  }, [venueRinks]);

  // Computed
  const dayHeaders = selectedEvent ? getDayHeaders(selectedEvent.start_date, selectedEvent.end_date) : [];
  const approvedTeams = registrations.filter(r => r.status === 'approved').length;
  const poolGameCount = games.filter(g => g.game_type === 'pool').length;
  const bracketGameCount = games.filter(g => g.game_type !== 'pool').length;

  // Filtered divisions/games based on selection
  const filteredDivisions = selectedDivision ? divisions.filter(d => d.id === selectedDivision) : divisions;
  const filteredGames = selectedDivision ? games.filter(g => g.event_division_id === selectedDivision) : games;

  if (loading) {
    return (
      <div className="bg-[#fafafa] min-h-full">
        <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
          <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Schedule Builder</h1>
        </div>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 text-center">
            <div className="inline-block animate-pulse"><div className="h-8 w-32 bg-[#e8e8ed] rounded-lg"></div></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#fafafa] min-h-full">
      <div className="max-w-7xl mx-auto px-6 pt-6 pb-2">
        <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Schedule Builder</h1>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Event Selection */}
        <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
          <h2 className="text-lg font-bold text-[#1d1d1f] mb-4">Select Event</h2>
          <select
            value={selectedEvent?.id || ''}
            onChange={e => setSelectedEvent(events.find(v => v.id === e.target.value) || null)}
            className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none"
          >
            <option value="">Choose an event...</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.name} — {ev.city}, {ev.state}</option>
            ))}
          </select>

          {selectedEvent && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Event', value: selectedEvent.name },
                { label: 'Location', value: `${selectedEvent.city}, ${selectedEvent.state}` },
                { label: 'Start', value: fmtDateFull(selectedEvent.start_date) },
                { label: 'End', value: fmtDateFull(selectedEvent.end_date) },
              ].map(item => (
                <div key={item.label} className="bg-[#fafafa] rounded-lg p-3">
                  <div className="text-xs text-[#86868b] uppercase tracking-widest font-semibold">{item.label}</div>
                  <div className="text-[#1d1d1f] font-semibold mt-1">{item.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEvent && (
          <>
            {/* Divisions */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[#1d1d1f]">Divisions</h2>
                {selectedDivision && (
                  <button
                    onClick={() => setSelectedDivision(null)}
                    className="text-sm text-[#003e79] font-semibold hover:underline"
                  >
                    Show All Divisions
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {divisions.map(div => {
                  const count = registrations.filter(r => r.event_division_id === div.id && r.status === 'approved').length;
                  const divGames = games.filter(g => g.event_division_id === div.id);
                  const isActive = selectedDivision === div.id;
                  return (
                    <button
                      key={div.id}
                      onClick={() => setSelectedDivision(isActive ? null : div.id)}
                      className={`border rounded-xl p-4 text-left transition cursor-pointer ${
                        isActive
                          ? 'border-[#003e79] bg-[#f0f7ff] ring-2 ring-[#003e79]/20'
                          : 'border-[#e8e8ed] hover:border-[#003e79]/30 hover:bg-[#fafafa]'
                      }`}
                    >
                      <div className={`font-semibold text-sm ${isActive ? 'text-[#003e79]' : 'text-[#1d1d1f]'}`}>{div.age_group} — {div.division_level}</div>
                      <div className="text-xs text-[#6e6e73] mt-1">{count} teams · {divGames.length} games</div>
                    </button>
                  );
                })}
              </div>
              {selectedDivision && (
                <div className="mt-3 text-xs text-[#86868b]">
                  Showing only <span className="font-semibold text-[#003e79]">{divisions.find(d => d.id === selectedDivision)?.age_group} — {divisions.find(d => d.id === selectedDivision)?.division_level}</span>. Click again or &ldquo;Show All&rdquo; to reset.
                </div>
              )}
            </div>

            {/* Config — collapsible */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)]">
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-[#fafafa] transition rounded-2xl"
              >
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-[#1d1d1f]">Schedule Config</h2>
                  <span className="text-xs text-[#86868b]">{gameDuration}min games · {betweenGames}min rest · {firstGameTime}–{lastGameTime}</span>
                </div>
                <svg className={`w-5 h-5 text-[#86868b] transition-transform ${showConfig ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

              {showConfig && (
                <div className="px-6 pb-6 space-y-6">
                  {/* Global Config */}
                  <div>
                    <h3 className="text-sm font-semibold text-[#3d3d3d] mb-3">Default Settings</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'Game Duration (min)', value: gameDuration, set: setGameDuration, min: 10, max: 180 },
                        { label: 'Between Games (min)', value: betweenGames, set: setBetweenGames, min: 0, max: 60 },
                      ].map(cfg => (
                        <div key={cfg.label}>
                          <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">{cfg.label}</label>
                          <input type="number" min={cfg.min} max={cfg.max} value={cfg.value} onChange={e => cfg.set(parseInt(e.target.value) || cfg.min)}
                            className="w-full border border-[#e8e8ed] rounded-xl p-2 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">First Game</label>
                        <input type="time" value={firstGameTime} onChange={e => setFirstGameTime(e.target.value)}
                          className="w-full border border-[#e8e8ed] rounded-xl p-2 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-2">Last Game</label>
                        <input type="time" value={lastGameTime} onChange={e => setLastGameTime(e.target.value)}
                          className="w-full border border-[#e8e8ed] rounded-xl p-2 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                      </div>
                    </div>
                  </div>

                  {/* Per-Rink Availability */}
                  {venueRinks.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-[#3d3d3d] mb-3">Per-Rink Availability</h3>
                      <p className="text-xs text-[#86868b] mb-4">Set different time windows for each rink. Add blocked time ranges for public skating, maintenance, etc.</p>
                      <div className="space-y-4">
                        {venueRinks.map(rink => {
                          const avail = rinkAvailability[rink.id] || { firstGame: firstGameTime, lastGame: lastGameTime, blocked: [] };
                          const updateRink = (updates: Partial<typeof avail>) => {
                            setRinkAvailability(prev => ({ ...prev, [rink.id]: { ...avail, ...updates } }));
                          };
                          return (
                            <div key={rink.id} className="border border-[#e8e8ed] rounded-xl p-4">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="w-8 h-8 rounded-lg bg-[#003e79] text-white flex items-center justify-center text-xs font-bold">{rink.name.charAt(0)}</div>
                                <div>
                                  <div className="font-semibold text-[#1d1d1f] text-sm">{rink.name}</div>
                                  {rink.surface_size && <div className="text-[10px] text-[#86868b]">{rink.surface_size}</div>}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-1">First Game</label>
                                  <input type="time" value={avail.firstGame} onChange={e => updateRink({ firstGame: e.target.value })}
                                    className="w-full border border-[#e8e8ed] rounded-lg p-2 text-sm text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-1">Last Game</label>
                                  <input type="time" value={avail.lastGame} onChange={e => updateRink({ lastGame: e.target.value })}
                                    className="w-full border border-[#e8e8ed] rounded-lg p-2 text-sm text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none" />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                  <label className="block text-[10px] text-[#86868b] uppercase tracking-widest font-semibold mb-1">Blocked Times</label>
                                  {avail.blocked.map((block, bi) => (
                                    <div key={bi} className="flex items-center gap-1 mb-1">
                                      <input type="time" value={block.start} onChange={e => {
                                        const newBlocked = [...avail.blocked];
                                        newBlocked[bi] = { ...newBlocked[bi], start: e.target.value };
                                        updateRink({ blocked: newBlocked });
                                      }} className="flex-1 border border-[#e8e8ed] rounded-lg p-1.5 text-xs text-[#1d1d1f] outline-none" />
                                      <span className="text-[10px] text-[#86868b]">to</span>
                                      <input type="time" value={block.end} onChange={e => {
                                        const newBlocked = [...avail.blocked];
                                        newBlocked[bi] = { ...newBlocked[bi], end: e.target.value };
                                        updateRink({ blocked: newBlocked });
                                      }} className="flex-1 border border-[#e8e8ed] rounded-lg p-1.5 text-xs text-[#1d1d1f] outline-none" />
                                      <button onClick={() => {
                                        const newBlocked = avail.blocked.filter((_, i) => i !== bi);
                                        updateRink({ blocked: newBlocked });
                                      }} className="text-red-400 hover:text-red-600 text-sm font-bold px-1">&times;</button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => updateRink({ blocked: [...avail.blocked, { start: '12:00', end: '13:00' }] })}
                                    className="text-[10px] text-[#003e79] font-semibold hover:underline mt-1"
                                  >
                                    + Add blocked time
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            {games.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Games', value: games.length },
                  { label: 'Pool Games', value: poolGameCount },
                  { label: 'Bracket Games', value: bracketGameCount },
                  { label: 'Teams', value: approvedTeams },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
                    <div className="text-2xl font-bold text-[#003e79]">{s.value}</div>
                    <div className="text-xs text-[#86868b] mt-1 uppercase tracking-widest font-semibold">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Schedule Area */}
            <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)] p-6">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <h2 className="text-lg font-bold text-[#1d1d1f]">Schedule</h2>
                <div className="flex flex-wrap gap-2">
                  {games.length > 0 && (
                    <button
                      onClick={() => setShowAddGame(true)}
                      className="px-4 py-2 border border-[#003e79] text-[#003e79] hover:bg-[#f0f7ff] rounded-full text-sm font-semibold transition"
                    >
                      + Add Game
                    </button>
                  )}
                  <button
                    onClick={handleGenerateSchedule}
                    disabled={generating || approvedTeams === 0}
                    className="px-4 py-2 bg-[#003e79] text-white hover:bg-[#002d5a] disabled:bg-[#86868b] rounded-full text-sm font-semibold transition"
                  >
                    {generating ? 'Generating...' : games.length > 0 ? 'Regenerate' : 'Generate Schedule'}
                  </button>
                  {games.length > 0 && (
                    <button onClick={handleClearSchedule} className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-full text-sm font-semibold transition">
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {approvedTeams === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  No approved registrations yet — add teams to divisions first.
                </div>
              ) : games.length === 0 ? (
                <div className="bg-[#f0f7ff] border border-[#003e79]/20 rounded-lg p-4 text-sm text-[#003e79]">
                  No schedule yet. Click &ldquo;Generate Schedule&rdquo; to auto-create all games, then click any game to edit it.
                </div>
              ) : (
                <>
                  {/* View Toggle */}
                  <div className="flex gap-1 bg-[#e8e8ed] rounded-xl p-1 w-fit mb-6">
                    {(['matrix', 'list'] as const).map(v => (
                      <button key={v} onClick={() => setView(v)}
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${view === v ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}
                      >
                        {v === 'matrix' ? 'Matrix View' : 'Game List'}
                      </button>
                    ))}
                  </div>

                  {view === 'matrix' && (
                    <div className="space-y-6">
                      {filteredDivisions.map(div => (
                        <div key={div.id}>
                          <h3 className="font-semibold text-[#1d1d1f] mb-3">{div.age_group} — {div.division_level}</h3>
                          <ScheduleMatrix
                            division={div}
                            registrations={registrations}
                            games={games}
                            dayHeaders={dayHeaders}
                            onClickGame={setEditingGame}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {view === 'list' && <GameListView games={filteredGames} divisions={filteredDivisions} onClickGame={setEditingGame} />}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Edit Game Modal */}
      {editingGame && (
        <EditGameModal
          game={editingGame}
          allTeams={registrations}
          rinks={venueRinks}
          divisions={divisions}
          allGames={games}
          onSave={handleSaveGame}
          onDelete={handleDeleteGame}
          onSwap={handleSwapGames}
          onClose={() => setEditingGame(null)}
        />
      )}

      {/* Add Game Modal */}
      {showAddGame && selectedEvent && (
        <AddGameModal
          event={selectedEvent}
          divisions={divisions}
          allTeams={registrations}
          rinks={venueRinks}
          onAdd={handleAddGame}
          onClose={() => setShowAddGame(false)}
        />
      )}
    </div>
  );
}
