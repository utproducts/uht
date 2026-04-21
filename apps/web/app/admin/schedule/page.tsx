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
  schedule_published: number | null;
  season: string | null;
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
  venue_name: string | null;
  game_number: number;
  start_time: string | null;
  end_time: string | null;
  game_type: string;
  pool_name: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  notes: string | null;
  scorekeeper_id: string | null;
  director_id: string | null;
  ref1_id: string | null;
  ref2_id: string | null;
  scorekeeper_name: string | null;
  director_name: string | null;
  ref1_name: string | null;
  ref2_name: string | null;
}

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  roles: string;
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
  staffList,
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
  staffList?: StaffMember[];
}) {
  const [homeTeamId, setHomeTeamId] = useState(game.home_team_id || '');
  const [awayTeamId, setAwayTeamId] = useState(game.away_team_id || '');
  const [rinkId, setRinkId] = useState(game.rink_id || '');
  const [startDate, setStartDate] = useState(game.start_time ? game.start_time.split('T')[0] : '');
  const [startTime, setStartTime] = useState(game.start_time ? game.start_time.split('T')[1]?.substring(0, 5) : '');
  const [gameType, setGameType] = useState(game.game_type);
  const [notes, setNotes] = useState(game.notes || '');
  const [scorekeeperId, setScorekeeperId] = useState(game.scorekeeper_id || '');
  const [directorId, setDirectorId] = useState(game.director_id || '');
  const [ref1Id, setRef1Id] = useState(game.ref1_id || '');
  const [ref2Id, setRef2Id] = useState(game.ref2_id || '');
  const [saving, setSaving] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [swapTargetId, setSwapTargetId] = useState('');

  const directors = staffList?.filter(s => s.roles.includes('director')) || [];
  const scorekeepers = staffList?.filter(s => s.roles.includes('scorekeeper')) || [];
  const referees = staffList?.filter(s => s.roles.includes('referee')) || [];

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
      scorekeeper_id: scorekeeperId || null,
      director_id: directorId || null,
      ref1_id: ref1Id || null,
      ref2_id: ref2Id || null,
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

          {/* Staff Assignments */}
          {staffList && staffList.length > 0 && (
            <div className="pt-3 border-t border-[#e8e8ed]">
              <h4 className="text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-3">Staff Assignments</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#86868b] font-semibold mb-1">Director</label>
                  <select value={directorId} onChange={e => setDirectorId(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm">
                    <option value="">None</option>
                    {directors.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] font-semibold mb-1">Scorekeeper</label>
                  <select value={scorekeeperId} onChange={e => setScorekeeperId(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm">
                    <option value="">None</option>
                    {scorekeepers.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] font-semibold mb-1">Referee 1</label>
                  <select value={ref1Id} onChange={e => setRef1Id(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm">
                    <option value="">None</option>
                    {referees.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[#86868b] font-semibold mb-1">Referee 2</label>
                  <select value={ref2Id} onChange={e => setRef2Id(e.target.value)} className="w-full border border-[#e8e8ed] rounded-xl p-2.5 text-[#1d1d1f] focus:ring-2 focus:ring-[#003e79]/20 outline-none text-sm">
                    <option value="">None</option>
                    {referees.map(s => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

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
// VENUE SELECTOR (filterable)
// ==========================================
function VenueSelector({ venues, venuesLoaded, eventState, eventCity, onSelect }: {
  venues: { id: string; name: string; city: string; state: string; rink_count: number }[];
  venuesLoaded: boolean;
  eventState: string;
  eventCity: string;
  onSelect: (venueId: string) => Promise<void>;
}) {
  // Map full state names to abbreviations for matching
  const stateNameToAbbr: Record<string, string> = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
    'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
    'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO',
    'Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ',
    'New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH',
    'Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
    'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
    'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
  };
  const venueStates = new Set(venues.map(v => v.state));
  const resolvedEventState = venueStates.has(eventState) ? eventState : (stateNameToAbbr[eventState] || '');
  const resolvedEventCity = eventCity; // cities should match directly

  const [filterState, setFilterState] = useState(resolvedEventState);
  const [filterCity, setFilterCity] = useState('');
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState<string | null>(null);

  const states = Array.from(new Set(venues.map(v => v.state))).sort();
  const cities = Array.from(new Set(
    venues.filter(v => !filterState || v.state === filterState).map(v => v.city)
  )).sort();

  const filtered = venues.filter(v => {
    if (filterState && v.state !== filterState) return false;
    if (filterCity && v.city !== filterCity) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!v.name.toLowerCase().includes(q) && !v.city.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Sort: event city/state matches first
  const sorted = [...filtered].sort((a, b) => {
    const aMatch = (a.city === resolvedEventCity && a.state === resolvedEventState) ? 0 : 1;
    const bMatch = (b.city === resolvedEventCity && b.state === resolvedEventState) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return a.name.localeCompare(b.name);
  });

  if (!venuesLoaded) {
    return <div className="text-sm text-[#86868b] py-4 text-center">Loading venues...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800 font-medium">No venue assigned to this event</p>
        <p className="text-xs text-amber-600 mt-1">Select a venue below to load its rinks into the schedule builder.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={filterState} onChange={e => { setFilterState(e.target.value); setFilterCity(''); }}
          className="border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20 bg-white">
          <option value="">All States</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterCity} onChange={e => setFilterCity(e.target.value)}
          className="border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20 bg-white">
          <option value="">All Cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="relative flex-1 min-w-[180px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search venues..."
            className="w-full pl-10 pr-4 py-2 border border-[#e8e8ed] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20 bg-white" />
        </div>
      </div>

      {/* Results */}
      {sorted.length === 0 ? (
        <div className="text-sm text-[#86868b] py-4 text-center">
          {venues.length === 0 ? (
            <>No venues found. <a href="/admin/venues" className="text-[#003e79] underline">Create a venue first</a>.</>
          ) : (
            'No venues match your filters.'
          )}
        </div>
      ) : (
        <div className="border border-[#e8e8ed] rounded-xl overflow-hidden divide-y divide-[#e8e8ed] max-h-[360px] overflow-y-auto">
          {sorted.map(v => {
            const isLocal = v.city === resolvedEventCity && v.state === resolvedEventState;
            return (
              <div key={v.id} className={`flex items-center justify-between px-4 py-3 hover:bg-[#fafafa] transition ${isLocal ? 'bg-[#f0f7ff]' : ''}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1d1d1f]">{v.name}</span>
                    {isLocal && <span className="px-1.5 py-0.5 bg-[#003e79] text-white rounded text-[10px] font-bold">LOCAL</span>}
                  </div>
                  <span className="text-xs text-[#86868b]">{v.city}, {v.state} · {v.rink_count} rink{v.rink_count !== 1 ? 's' : ''}</span>
                </div>
                <button
                  onClick={async () => { setAssigning(v.id); await onSelect(v.id); setAssigning(null); }}
                  disabled={assigning !== null}
                  className="px-3 py-1.5 bg-[#003e79] text-white rounded-lg text-xs font-semibold hover:bg-[#002d5a] disabled:bg-[#c8c8cd] transition"
                >
                  {assigning === v.id ? 'Assigning...' : 'Select'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-[#86868b]">{sorted.length} of {venues.length} venues shown</p>
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
  venueRinks,
  onSaveGame,
}: {
  division: Division;
  registrations: Registration[];
  games: Game[];
  dayHeaders: { date: string; label: string }[];
  onClickGame: (game: Game) => void;
  venueRinks?: VenueRink[];
  onSaveGame?: (gameId: string, updates: any) => Promise<void>;
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
                  <td key={idx} className="px-3 py-2 text-center text-[#3d3d3d] border-l border-[#e8e8ed]">
                    {cell.opponents.length > 0 ? (
                      <div className="flex flex-col items-center gap-1">
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
                        {venueRinks && onSaveGame && cell.gameRefs.map((g, oi) => (
                          <select
                            key={`rink-${oi}`}
                            value={g.rink_id || ''}
                            onChange={async e => { e.stopPropagation(); await onSaveGame(g.id, { rink_id: e.target.value || null }); }}
                            className="px-1 py-0.5 border border-[#e8e8ed] rounded text-[10px] outline-none bg-white cursor-pointer max-w-[90px] text-center text-[#6e6e73] hover:border-[#003e79]/30"
                            title={`Rink for Game #${g.game_number}`}
                          >
                            <option value="">Rink...</option>
                            {venueRinks.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
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
                const order = ['semifinal', 'quarterfinal', 'placement', 'consolation', 'championship'];
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
function GameListView({ games, divisions, onClickGame, ageGroupRinks, venueRinks, onSaveGame, onSwapGames }: {
  games: Game[];
  divisions: Division[];
  onClickGame: (game: Game) => void;
  ageGroupRinks?: Record<string, string[]>;
  venueRinks?: VenueRink[];
  onSaveGame?: (gameId: string, updates: any) => Promise<void>;
  onSwapGames?: (gameId1: string, gameId2: string) => Promise<void>;
}) {
  const divisionMap = new Map(divisions.map(d => [d.id, d]));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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

  const handleDragStart = (e: React.DragEvent, gameId: string) => {
    setDragId(gameId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', gameId);
  };

  const handleDragOver = (e: React.DragEvent, gameId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (gameId !== dragId) setDragOverId(gameId);
  };

  const handleDrop = async (e: React.DragEvent, targetGame: Game) => {
    e.preventDefault();
    const sourceId = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetGame.id || !onSwapGames) return;
    await onSwapGames(sourceId, targetGame.id);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
            <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-2 py-3 text-center w-8"></th>
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
            const isOverflow = (() => {
              if (!ageGroupRinks || !div || !game.rink_id) return false;
              const preferred = ageGroupRinks[div.age_group];
              if (!preferred || preferred.length === 0) return false;
              return !preferred.includes(game.rink_id);
            })();
            const isDragOver = dragOverId === game.id && dragId !== game.id;
            return (
              <tr
                key={game.id}
                draggable
                onDragStart={e => handleDragStart(e, game.id)}
                onDragOver={e => handleDragOver(e, game.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => handleDrop(e, game)}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                className={`transition ${isOverflow ? 'bg-amber-50' : ''} ${isDragOver ? 'bg-[#f0f7ff] border-t-2 border-t-[#003e79]' : ''} ${dragId === game.id ? 'opacity-40' : ''}`}
              >
                <td className="px-2 py-3 text-center cursor-grab active:cursor-grabbing">
                  <svg className="w-4 h-4 text-[#c8c8cd] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" /></svg>
                </td>
                <td className="px-4 py-3 text-[#1d1d1f] font-semibold cursor-pointer" onClick={() => onClickGame(game)}>#{game.game_number}</td>
                <td className="px-4 py-3 text-[#3d3d3d] cursor-pointer" onClick={() => onClickGame(game)}>{fmtDatetime(game.start_time)}</td>
                <td className="px-4 py-3">
                  {venueRinks && onSaveGame ? (
                    <select
                      value={game.rink_id || ''}
                      onClick={e => e.stopPropagation()}
                      onChange={async e => {
                        e.stopPropagation();
                        await onSaveGame(game.id, { rink_id: e.target.value || null });
                      }}
                      className="px-2 py-1 border border-[#e8e8ed] rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#003e79]/20 bg-white cursor-pointer min-w-[100px]"
                    >
                      <option value="">No rink</option>
                      {venueRinks.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      {game.rink_name || '—'}
                      {isOverflow && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-bold" title="Overflow">
                          OVERFLOW
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-[#3d3d3d] cursor-pointer" onClick={() => onClickGame(game)}>
                  {game.home_team_name && game.away_team_name
                    ? `${game.home_team_name} vs ${game.away_team_name}`
                    : game.notes || 'TBD vs TBD'}
                </td>
                <td className="px-4 py-3 text-[#6e6e73] text-xs cursor-pointer" onClick={() => onClickGame(game)}>{div ? `${div.age_group} — ${div.division_level}` : '—'}</td>
                <td className="px-4 py-3 text-center cursor-pointer" onClick={() => onClickGame(game)}>
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
// REPLACE TEAM MODAL
// ==========================================
function ReplaceTeamModal({
  event,
  games,
  registrations,
  divisions,
  onComplete,
  onClose,
}: {
  event: Event;
  games: Game[];
  registrations: Registration[];
  divisions: Division[];
  onComplete: () => Promise<void>;
  onClose: () => void;
}) {
  const [oldTeamId, setOldTeamId] = useState('');
  const [newTeamId, setNewTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get teams that are currently in the schedule (appear in games)
  const teamsInSchedule = new Map<string, string>();
  games.forEach(g => {
    if (g.home_team_id && g.home_team_name) teamsInSchedule.set(g.home_team_id, g.home_team_name);
    if (g.away_team_id && g.away_team_name) teamsInSchedule.set(g.away_team_id, g.away_team_name);
  });
  const scheduleTeams = Array.from(teamsInSchedule.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Get all approved teams for the replacement options (including teams not in the schedule yet)
  const approvedTeams = registrations
    .filter(r => r.status === 'approved')
    .map(r => ({ id: r.team_id, name: r.team_name, divId: r.event_division_id }));

  // Deduplicate by team_id
  const uniqueReplacements = new Map<string, { id: string; name: string; divLabel: string }>();
  approvedTeams.forEach(t => {
    if (!uniqueReplacements.has(t.id)) {
      const div = divisions.find(d => d.id === t.divId);
      uniqueReplacements.set(t.id, {
        id: t.id,
        name: t.name,
        divLabel: div ? `${div.age_group} ${div.division_level}` : '',
      });
    }
  });
  const replacementTeams = Array.from(uniqueReplacements.values())
    .filter(t => t.id !== oldTeamId)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Count how many games the selected old team has
  const oldTeamGameCount = oldTeamId
    ? games.filter(g => g.home_team_id === oldTeamId || g.away_team_id === oldTeamId).length
    : 0;

  const handleReplace = async () => {
    if (!oldTeamId || !newTeamId) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await authFetch(`${API_BASE}/scheduling/events/${event.id}/replace-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_team_id: oldTeamId, new_team_id: newTeamId }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data.message);
        // After a brief pause so user sees the success message, complete
        setTimeout(() => onComplete(), 1500);
      } else {
        setError(json.error || 'Failed to replace team');
      }
    } catch (err) {
      setError('Error: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg">Replace Team</h3>
            <p className="text-white/80 text-xs mt-0.5">Swap a placeholder or existing team in all scheduled games</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl font-bold leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1: Select team to replace */}
          <div>
            <label className="block text-sm font-bold text-[#1d1d1f] mb-2">Team to Replace</label>
            <select
              value={oldTeamId}
              onChange={e => { setOldTeamId(e.target.value); setNewTeamId(''); setResult(null); setError(null); }}
              className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] focus:ring-2 focus:ring-amber-500/20 outline-none"
            >
              <option value="">Select the team to replace...</option>
              {scheduleTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {oldTeamId && (
              <p className="text-xs text-[#86868b] mt-1.5">
                This team appears in <span className="font-bold text-amber-600">{oldTeamGameCount}</span> game{oldTeamGameCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Arrow */}
          {oldTeamId && (
            <div className="flex justify-center">
              <div className="w-10 h-10 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                </svg>
              </div>
            </div>
          )}

          {/* Step 2: Select replacement team */}
          {oldTeamId && (
            <div>
              <label className="block text-sm font-bold text-[#1d1d1f] mb-2">Replace With</label>
              <select
                value={newTeamId}
                onChange={e => { setNewTeamId(e.target.value); setResult(null); setError(null); }}
                className="w-full border border-[#e8e8ed] rounded-xl p-3 text-[#1d1d1f] focus:ring-2 focus:ring-amber-500/20 outline-none"
              >
                <option value="">Select the replacement team...</option>
                {replacementTeams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}{t.divLabel ? ` (${t.divLabel})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {/* Preview */}
          {oldTeamId && newTeamId && !result && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-800">
                <span className="font-bold">{teamsInSchedule.get(oldTeamId)}</span> will be replaced by{' '}
                <span className="font-bold">{uniqueReplacements.get(newTeamId)?.name || newTeamId}</span> in{' '}
                <span className="font-bold">{oldTeamGameCount} game{oldTeamGameCount !== 1 ? 's' : ''}</span>.
                The registration will also be transferred.
              </p>
            </div>
          )}

          {/* Success */}
          {result && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-semibold text-emerald-800">{result}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm text-red-700 font-semibold">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-[#6e6e73] bg-[#f5f5f7] hover:bg-[#e8e8ed] transition"
            >
              {result ? 'Done' : 'Cancel'}
            </button>
            {!result && (
              <button
                onClick={handleReplace}
                disabled={!oldTeamId || !newTeamId || saving}
                className="px-6 py-2.5 rounded-full text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:bg-[#86868b] transition"
              >
                {saving ? 'Replacing...' : 'Replace Team'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// DIVISION ASSIGNMENT PANEL
// ==========================================
function DivisionAssignment({
  eventId,
  divisions,
  registrations,
  selectedDivisionId,
  onRefresh,
}: {
  eventId: string;
  divisions: Division[];
  registrations: Registration[];
  selectedDivisionId: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [movingTeam, setMovingTeam] = useState<string | null>(null); // registration_id being moved
  const [saving, setSaving] = useState(false);
  const [splitting, setSplitting] = useState<string | null>(null); // age_group being auto-split
  const [newDivAgeGroup, setNewDivAgeGroup] = useState<string | null>(null);
  const [newDivLevel, setNewDivLevel] = useState('');
  const [deletingDiv, setDeletingDiv] = useState<string | null>(null);
  // Bulk selection
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set()); // set of registration_ids
  const [bulkMoving, setBulkMoving] = useState(false);
  const [showBulkNewDiv, setShowBulkNewDiv] = useState(false);
  const [bulkNewDivLevel, setBulkNewDivLevel] = useState('');

  const toggleSelect = (regId: string) => {
    setSelectedTeams(prev => {
      const next = new Set(prev);
      if (next.has(regId)) next.delete(regId); else next.add(regId);
      return next;
    });
  };

  const selectAllInDiv = (divId: string) => {
    const divRegs = registrations.filter(r => r.event_division_id === divId && r.status === 'approved');
    setSelectedTeams(prev => {
      const next = new Set(prev);
      const allSelected = divRegs.every(r => next.has(r.id));
      if (allSelected) {
        divRegs.forEach(r => next.delete(r.id));
      } else {
        divRegs.forEach(r => next.add(r.id));
      }
      return next;
    });
  };

  // Get the age group of the current selection (all selected must be same age group for bulk actions)
  const selectedArr = Array.from(selectedTeams);
  const selectedAgeGroup = (() => {
    if (selectedArr.length === 0) return null;
    const ags = new Set<string>();
    selectedArr.forEach(regId => {
      const reg = registrations.find(r => r.id === regId);
      if (reg) {
        const div = divisions.find(d => d.id === reg.event_division_id);
        if (div) ags.add(div.age_group);
      }
    });
    return ags.size === 1 ? Array.from(ags)[0] : null;
  })();

  const handleBulkMove = async (targetDivisionId: string) => {
    setBulkMoving(true);
    try {
      for (let i = 0; i < selectedArr.length; i++) {
        await authFetch(`${API_BASE}/scheduling/events/${eventId}/move-team`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registration_id: selectedArr[i], target_division_id: targetDivisionId }),
        });
      }
      setSelectedTeams(new Set());
      await onRefresh();
    } catch (err) {
      alert('Error moving teams: ' + String(err));
    } finally {
      setBulkMoving(false);
    }
  };

  const handleBulkCreateAndMove = async (ageGroup: string) => {
    if (!bulkNewDivLevel.trim()) return;
    setBulkMoving(true);
    try {
      // Create new division
      const res = await authFetch(`${API_BASE}/scheduling/events/${eventId}/create-division`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age_group: ageGroup, division_level: bulkNewDivLevel.trim() }),
      });
      const json = await res.json();
      if (!json.success) { alert('Error: ' + (json.error || 'Unknown')); return; }
      const newDivId = json.data.id;
      // Move all selected teams
      for (let i = 0; i < selectedArr.length; i++) {
        await authFetch(`${API_BASE}/scheduling/events/${eventId}/move-team`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registration_id: selectedArr[i], target_division_id: newDivId }),
        });
      }
      setSelectedTeams(new Set());
      setShowBulkNewDiv(false);
      setBulkNewDivLevel('');
      await onRefresh();
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setBulkMoving(false);
    }
  };

  // Group registrations by age group, filtered by selected division
  const selectedDiv = selectedDivisionId ? divisions.find(d => d.id === selectedDivisionId) : null;
  const filteredAgeGroup = selectedDiv ? selectedDiv.age_group : null;

  const ageGroups = Array.from(new Set(divisions.map(d => d.age_group)));
  const ageGroupData = ageGroups
    .filter(ag => !filteredAgeGroup || ag === filteredAgeGroup)
    .map(ag => {
      const agDivisions = divisions.filter(d => d.age_group === ag);
      const agTeams = registrations.filter(r =>
        r.status === 'approved' && agDivisions.some(d => d.id === r.event_division_id)
      );
      return { ageGroup: ag, divisions: agDivisions, teams: agTeams };
    }).filter(ag => ag.teams.length > 0);

  const totalTeams = registrations.filter(r => r.status === 'approved').length;
  const needsSplit = ageGroupData.some(ag => ag.teams.length > 6);

  const handleAutoSplit = async (ageGroup: string) => {
    if (!confirm(`Auto-split ${ageGroup} teams into divisions of max 6? This will reassign teams based on ranking.`)) return;
    setSplitting(ageGroup);
    try {
      const res = await authFetch(`${API_BASE}/scheduling/events/${eventId}/auto-split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age_group: ageGroup, max_per_division: 6 }),
      });
      const json = await res.json();
      if (json.success) {
        await onRefresh();
      } else {
        alert('Error: ' + (json.error || json.message || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setSplitting(null);
    }
  };

  const handleMoveTeam = async (registrationId: string, targetDivisionId: string) => {
    setSaving(true);
    setMovingTeam(registrationId);
    try {
      const res = await authFetch(`${API_BASE}/scheduling/events/${eventId}/move-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id: registrationId, target_division_id: targetDivisionId }),
      });
      const json = await res.json();
      if (json.success) {
        await onRefresh();
      } else {
        alert('Error: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setSaving(false);
      setMovingTeam(null);
    }
  };

  const handleCreateDivision = async (ageGroup: string) => {
    if (!newDivLevel.trim()) return;
    try {
      const res = await authFetch(`${API_BASE}/scheduling/events/${eventId}/create-division`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age_group: ageGroup, division_level: newDivLevel.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setNewDivAgeGroup(null);
        setNewDivLevel('');
        await onRefresh();
      } else {
        alert('Error: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    }
  };

  const handleDeleteDivision = async (divisionId: string) => {
    if (!confirm('Delete this empty division?')) return;
    setDeletingDiv(divisionId);
    try {
      const res = await authFetch(`${API_BASE}/scheduling/events/${eventId}/divisions/${divisionId}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        await onRefresh();
      } else {
        alert('Error: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setDeletingDiv(null);
    }
  };

  if (totalTeams === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#e8e8ed] shadow-[0_1px_20px_-6px_rgba(0,0,0,0.08)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-[#fafafa] transition rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-[#1d1d1f]">Division Assignment</h2>
          <span className="text-xs text-[#86868b]">{totalTeams} teams across {ageGroups.length} age groups</span>
          {needsSplit && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">
              NEEDS SPLIT
            </span>
          )}
        </div>
        <svg className={`w-5 h-5 text-[#86868b] transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-6">
          <p className="text-xs text-[#86868b]">
            Assign teams to divisions before generating schedules. Max 6 teams per division. Use auto-split to group by ranking, then manually adjust. Select multiple teams with checkboxes to bulk move or create a new division.
          </p>

          {/* Bulk Action Bar */}
          {selectedTeams.size > 0 && (
            <div className="sticky top-0 z-20 bg-[#003e79] text-white rounded-xl px-5 py-3 flex items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm">{selectedTeams.size} team{selectedTeams.size !== 1 ? 's' : ''} selected</span>
                {selectedAgeGroup ? (
                  <span className="text-xs text-white/70">{selectedAgeGroup}</span>
                ) : (
                  <span className="text-xs text-amber-300">Select teams from the same age group</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {selectedAgeGroup && !showBulkNewDiv && (
                  <>
                    {/* Move to existing division dropdown */}
                    <select
                      value=""
                      onChange={e => { if (e.target.value) handleBulkMove(e.target.value); }}
                      disabled={bulkMoving}
                      className="text-xs bg-white/10 border border-white/30 text-white rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                    >
                      <option value="" className="text-[#1d1d1f]">Move to...</option>
                      {divisions.filter(d => d.age_group === selectedAgeGroup).map(d => (
                        <option key={d.id} value={d.id} className="text-[#1d1d1f]">
                          {d.division_level || 'Open'}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowBulkNewDiv(true)}
                      disabled={bulkMoving}
                      className="px-3 py-1.5 bg-white text-[#003e79] rounded-full text-xs font-bold hover:bg-white/90 disabled:opacity-50 transition"
                    >
                      New Division from Selected
                    </button>
                  </>
                )}
                {showBulkNewDiv && selectedAgeGroup && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={bulkNewDivLevel}
                      onChange={e => setBulkNewDivLevel(e.target.value)}
                      placeholder="Division level (e.g. AA)"
                      className="border border-white/30 bg-white/10 text-white placeholder-white/50 rounded-lg px-2.5 py-1.5 text-xs outline-none w-40"
                      onKeyDown={e => e.key === 'Enter' && handleBulkCreateAndMove(selectedAgeGroup)}
                      autoFocus
                    />
                    <button
                      onClick={() => handleBulkCreateAndMove(selectedAgeGroup)}
                      disabled={!bulkNewDivLevel.trim() || bulkMoving}
                      className="px-3 py-1.5 bg-emerald-500 text-white rounded-full text-xs font-bold hover:bg-emerald-600 disabled:opacity-50 transition"
                    >
                      {bulkMoving ? 'Creating...' : 'Create & Move'}
                    </button>
                    <button
                      onClick={() => { setShowBulkNewDiv(false); setBulkNewDivLevel(''); }}
                      className="text-white/70 hover:text-white text-sm px-1"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <button
                  onClick={() => { setSelectedTeams(new Set()); setShowBulkNewDiv(false); setBulkNewDivLevel(''); }}
                  className="text-white/70 hover:text-white text-xs font-semibold ml-1"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {ageGroupData.map(({ ageGroup, divisions: agDivs, teams: agTeams }) => (
            <div key={ageGroup} className="border border-[#e8e8ed] rounded-xl overflow-hidden">
              {/* Age Group Header */}
              <div className="bg-[#fafafa] px-5 py-3 flex items-center justify-between border-b border-[#e8e8ed]">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-[#1d1d1f]">{ageGroup}</h3>
                  <span className="text-xs text-[#6e6e73]">{agTeams.length} teams · {agDivs.length} division{agDivs.length !== 1 ? 's' : ''}</span>
                  {agTeams.length > 6 && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">
                      {agTeams.length} teams — needs split
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {agTeams.length > 6 && (
                    <button
                      onClick={() => handleAutoSplit(ageGroup)}
                      disabled={splitting === ageGroup}
                      className="px-3 py-1.5 bg-amber-500 text-white rounded-full text-xs font-bold hover:bg-amber-600 disabled:bg-[#86868b] transition"
                    >
                      {splitting === ageGroup ? 'Splitting...' : `Auto-Split into ${Math.ceil(agTeams.length / 6)} Divisions`}
                    </button>
                  )}
                  <button
                    onClick={() => setNewDivAgeGroup(newDivAgeGroup === ageGroup ? null : ageGroup)}
                    className="px-3 py-1.5 border border-[#e8e8ed] text-[#6e6e73] rounded-full text-xs font-semibold hover:bg-white transition"
                  >
                    + Division
                  </button>
                </div>
              </div>

              {/* Create new division inline form */}
              {newDivAgeGroup === ageGroup && (
                <div className="px-5 py-3 bg-[#f0f7ff] border-b border-[#e8e8ed] flex items-center gap-3">
                  <span className="text-xs text-[#003e79] font-semibold">New division level:</span>
                  <input
                    type="text"
                    value={newDivLevel}
                    onChange={e => setNewDivLevel(e.target.value)}
                    placeholder="e.g., AA, B, House"
                    className="border border-[#e8e8ed] rounded-lg px-3 py-1.5 text-sm flex-1 max-w-48 outline-none focus:ring-2 focus:ring-[#003e79]/20"
                    onKeyDown={e => e.key === 'Enter' && handleCreateDivision(ageGroup)}
                  />
                  <button
                    onClick={() => handleCreateDivision(ageGroup)}
                    disabled={!newDivLevel.trim()}
                    className="px-3 py-1.5 bg-[#003e79] text-white rounded-full text-xs font-bold hover:bg-[#002d5a] disabled:bg-[#86868b] transition"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setNewDivAgeGroup(null); setNewDivLevel(''); }}
                    className="text-[#86868b] hover:text-[#1d1d1f] text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Division columns */}
              <div className="p-5">
                <div className={`grid gap-4 ${agDivs.length === 1 ? 'grid-cols-1' : agDivs.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                  {agDivs.map(div => {
                    const divTeams = agTeams.filter(r => r.event_division_id === div.id);
                    const isEmpty = divTeams.length === 0;
                    const isFull = divTeams.length >= 6;
                    return (
                      <div
                        key={div.id}
                        className={`border rounded-xl overflow-hidden ${
                          isFull ? 'border-emerald-300 bg-emerald-50/30' :
                          isEmpty ? 'border-dashed border-[#d8d8dd]' :
                          'border-[#e8e8ed]'
                        }`}
                      >
                        {/* Division header */}
                        <div className={`px-4 py-2.5 flex items-center justify-between ${
                          isFull ? 'bg-emerald-50' : isEmpty ? 'bg-[#fafafa]' : 'bg-[#f5f5f7]'
                        }`}>
                          <div className="flex items-center gap-2.5">
                            {divTeams.length > 0 && (
                              <input
                                type="checkbox"
                                checked={divTeams.length > 0 && divTeams.every(r => selectedTeams.has(r.id))}
                                onChange={() => selectAllInDiv(div.id)}
                                className="w-3.5 h-3.5 rounded border-[#c8c8cd] text-[#003e79] cursor-pointer accent-[#003e79]"
                                title={`Select all teams in ${div.division_level || 'Open'}`}
                              />
                            )}
                            <span className="font-semibold text-sm text-[#1d1d1f]">{div.division_level || 'Open'}</span>
                            <span className={`text-xs ${isFull ? 'text-emerald-600 font-bold' : 'text-[#86868b]'}`}>
                              {divTeams.length}/6 teams
                            </span>
                          </div>
                          {isEmpty && (
                            <button
                              onClick={() => handleDeleteDivision(div.id)}
                              disabled={deletingDiv === div.id}
                              className="text-red-400 hover:text-red-600 text-xs font-semibold transition"
                              title="Delete empty division"
                            >
                              {deletingDiv === div.id ? '...' : 'Delete'}
                            </button>
                          )}
                        </div>

                        {/* Team list */}
                        <div className="divide-y divide-[#e8e8ed]">
                          {divTeams.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-[#aeaeb2]">
                              No teams — drag or move teams here
                            </div>
                          ) : (
                            divTeams.map((reg, idx) => {
                              const isSelected = selectedTeams.has(reg.id);
                              return (
                              <div
                                key={reg.id}
                                className={`px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-[#fafafa] transition cursor-pointer ${
                                  isSelected ? 'bg-[#f0f7ff] border-l-2 border-l-[#003e79]' :
                                  movingTeam === reg.id ? 'bg-[#f0f7ff] opacity-70' : ''
                                }`}
                                onClick={() => toggleSelect(reg.id)}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="w-3.5 h-3.5 rounded border-[#c8c8cd] text-[#003e79] cursor-pointer accent-[#003e79] shrink-0"
                                  />
                                  <span className="inline-flex items-center justify-center w-5 h-5 bg-[#003e79] text-white rounded-full text-[9px] font-bold shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="text-sm text-[#1d1d1f] font-medium truncate">{reg.team_name}</span>
                                </div>
                                {/* Move dropdown (single team) */}
                                {agDivs.length > 1 && !isSelected && (
                                  <select
                                    value=""
                                    onChange={e => {
                                      e.stopPropagation();
                                      if (e.target.value) handleMoveTeam(reg.id, e.target.value);
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    disabled={saving && movingTeam === reg.id}
                                    className="text-[10px] text-[#86868b] bg-transparent border border-[#e8e8ed] rounded-lg px-1.5 py-1 outline-none hover:border-[#003e79]/30 cursor-pointer shrink-0"
                                    title="Move to another division"
                                  >
                                    <option value="">Move...</option>
                                    {agDivs.filter(d => d.id !== div.id).map(d => (
                                      <option key={d.id} value={d.id}>
                                        → {d.division_level || 'Open'}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                              );
                            })
                          )}
                        </div>

                        {/* Division capacity bar */}
                        <div className="px-4 py-2 bg-[#fafafa] border-t border-[#e8e8ed]">
                          <div className="w-full h-1.5 bg-[#e8e8ed] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                divTeams.length > 6 ? 'bg-red-500' :
                                divTeams.length === 6 ? 'bg-emerald-500' :
                                divTeams.length >= 4 ? 'bg-[#003e79]' :
                                'bg-amber-400'
                              }`}
                              style={{ width: `${Math.min(100, (divTeams.length / 6) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// BY VENUE VIEW — matches spreadsheet format
// Games grouped by venue/rink, sorted chronologically per rink
// Each rink column shows: time, division, home vs away, score, staff
// ==========================================
function VenueScheduleView({
  games,
  divisions,
  venueRinks,
  dayHeaders,
  onClickGame,
  onSaveGame,
  onSwapGames,
}: {
  games: Game[];
  divisions: Division[];
  venueRinks: VenueRink[];
  dayHeaders: { date: string; label: string }[];
  onClickGame: (game: Game) => void;
  onSaveGame?: (gameId: string, updates: any) => Promise<void>;
  onSwapGames?: (gameId1: string, gameId2: string) => Promise<void>;
}) {
  const divisionMap = new Map(divisions.map(d => [d.id, d]));
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, gameId: string) => {
    setDragId(gameId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', gameId);
  };

  const handleDragOver = (e: React.DragEvent, gameId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (gameId !== dragId) setDragOverId(gameId);
  };

  const handleDrop = async (e: React.DragEvent, targetGame: Game) => {
    e.preventDefault();
    const sourceId = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetGame.id || !onSwapGames) return;
    await onSwapGames(sourceId, targetGame.id);
  };

  if (games.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
        <p className="text-[#6e6e73]">No games scheduled yet</p>
      </div>
    );
  }

  // Group games by rink, then by day
  const rinkIds = Array.from(new Set(games.map(g => g.rink_id).filter(Boolean))) as string[];
  const rinkMap = new Map(venueRinks.map(r => [r.id, r]));

  // Sort rinks by venue name then rink name
  const sortedRinkIds = rinkIds.sort((a, b) => {
    const ra = rinkMap.get(a);
    const rb = rinkMap.get(b);
    return (ra?.name || '').localeCompare(rb?.name || '');
  });

  // Games with no rink assigned
  const unassigned = games.filter(g => !g.rink_id);

  return (
    <div className="space-y-6">
      {sortedRinkIds.map(rinkId => {
        const rink = rinkMap.get(rinkId);
        const rinkGames = games.filter(g => g.rink_id === rinkId);

        return (
          <div key={rinkId} className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden">
            {/* Rink Header */}
            <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-white font-bold text-sm">{rink?.name || 'Unknown Rink'}</h3>
                {rinkGames[0]?.venue_name && (
                  <span className="text-white/60 text-xs">{rinkGames[0].venue_name}</span>
                )}
              </div>
              <span className="text-white/70 text-xs font-semibold">{rinkGames.length} games</span>
            </div>

            {/* Day-by-day breakdown */}
            {dayHeaders.map(header => {
              const dayGames = rinkGames
                .filter(g => g.start_time?.startsWith(header.date))
                .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

              if (dayGames.length === 0) return null;

              return (
                <div key={header.date}>
                  <div className="bg-[#f0f7ff] px-6 py-2 border-b border-[#e8e8ed]">
                    <span className="text-xs font-bold text-[#003e79] uppercase tracking-widest">{header.label}</span>
                    <span className="text-[10px] text-[#86868b] ml-2">{dayGames.length} games</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                        <th className="w-8"></th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left w-16">#</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left w-24">Time</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">Division</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">Home</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-center w-12">Score</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">Away</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-center w-12">Score</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">SK</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">Dir</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">Ref 1</th>
                        <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">Ref 2</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e8e8ed]">
                      {dayGames.map(game => {
                        const div = divisionMap.get(game.event_division_id);
                        const isBracket = game.game_type !== 'pool';
                        const isDragOver = dragOverId === game.id && dragId !== game.id;
                        return (
                          <tr
                            key={game.id}
                            draggable
                            onDragStart={e => handleDragStart(e, game.id)}
                            onDragOver={e => handleDragOver(e, game.id)}
                            onDragLeave={() => setDragOverId(null)}
                            onDrop={e => handleDrop(e, game)}
                            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                            onClick={() => onClickGame(game)}
                            className={`cursor-pointer transition ${isBracket ? 'bg-amber-50/50' : ''} ${isDragOver ? 'bg-[#f0f7ff] border-t-2 border-t-[#003e79]' : 'hover:bg-[#fafafa]'} ${dragId === game.id ? 'opacity-40' : ''}`}
                          >
                            <td className="px-2 py-2.5 text-center cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
                              <svg className="w-3.5 h-3.5 text-[#c8c8cd] mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" /></svg>
                            </td>
                            <td className="px-4 py-2.5 text-[#1d1d1f] font-semibold text-xs">#{game.game_number}</td>
                            <td className="px-4 py-2.5 text-[#3d3d3d] text-xs">{fmtTime(game.start_time)}</td>
                            <td className="px-4 py-2.5 text-xs">
                              <span className="text-[#6e6e73]">{div ? `${div.age_group} ${div.division_level}` : '—'}</span>
                              {isBracket && (
                                <span className={`ml-1.5 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${gameTypeBadge[game.game_type] || 'bg-[#fafafa] text-[#6e6e73]'}`}>
                                  {game.game_type === 'championship' ? 'CHAMP' : game.game_type === 'semifinal' ? 'SEMI' : game.game_type === 'consolation' ? 'CONS' : game.game_type.toUpperCase()}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-[#1d1d1f] text-xs font-medium">{game.home_team_name || game.notes?.split(' vs ')[0] || 'TBD'}</td>
                            <td className="px-4 py-2.5 text-center text-xs font-bold text-[#003e79]">{game.status === 'final' ? game.home_score : '—'}</td>
                            <td className="px-4 py-2.5 text-[#1d1d1f] text-xs font-medium">{game.away_team_name || game.notes?.split(' vs ')[1] || 'TBD'}</td>
                            <td className="px-4 py-2.5 text-center text-xs font-bold text-[#003e79]">{game.status === 'final' ? game.away_score : '—'}</td>
                            <td className="px-4 py-2.5 text-[#86868b] text-[11px]">{game.scorekeeper_name || '—'}</td>
                            <td className="px-4 py-2.5 text-[#86868b] text-[11px]">{game.director_name || '—'}</td>
                            <td className="px-4 py-2.5 text-[#86868b] text-[11px]">{game.ref1_name || '—'}</td>
                            <td className="px-4 py-2.5 text-[#86868b] text-[11px]">{game.ref2_name || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Unassigned games */}
      {unassigned.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-300 overflow-hidden">
          <div className="bg-amber-50 px-6 py-3 flex items-center justify-between border-b border-amber-200">
            <h3 className="text-amber-800 font-bold text-sm">Unassigned (No Rink)</h3>
            <span className="text-amber-600 text-xs font-semibold">{unassigned.length} games</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">#</th>
                <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">Time</th>
                <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">Division</th>
                <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-2 text-left">Matchup</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e8ed]">
              {unassigned.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')).map(game => {
                const div = divisionMap.get(game.event_division_id);
                return (
                  <tr key={game.id} onClick={() => onClickGame(game)} className="hover:bg-[#fafafa] cursor-pointer transition">
                    <td className="px-4 py-2.5 font-semibold text-xs">#{game.game_number}</td>
                    <td className="px-4 py-2.5 text-xs">{fmtDatetime(game.start_time)}</td>
                    <td className="px-4 py-2.5 text-xs text-[#6e6e73]">{div ? `${div.age_group} ${div.division_level}` : '—'}</td>
                    <td className="px-4 py-2.5 text-xs">{game.home_team_name && game.away_team_name ? `${game.home_team_name} vs ${game.away_team_name}` : game.notes || 'TBD vs TBD'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ==========================================
// STAFF ASSIGNMENTS VIEW — BULK ASSIGN BY RINK/DAY
// Grid: rows = rinks, columns = days, cells = dropdown to pick scorekeeper
// One click to assign a scorekeeper to ALL games on that rink that day
// ==========================================
function StaffAssignmentsView({
  eventId,
  games,
  divisions,
  venueRinks,
  dayHeaders,
  staffList: initialStaffList,
  onClickGame,
  onRefresh,
}: {
  eventId: string;
  games: Game[];
  divisions: Division[];
  venueRinks: VenueRink[];
  dayHeaders: { date: string; label: string }[];
  staffList: StaffMember[];
  onClickGame: (game: Game) => void;
  onRefresh: () => Promise<void>;
}) {
  // Local state
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [localStaff, setLocalStaff] = useState<StaffMember[]>(initialStaffList);

  // Quick-add form
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);

  const staffList = localStaff.length > 0 ? localStaff : initialStaffList;
  const scorekeepers = staffList.filter(s => s.roles.includes('scorekeeper'));

  const makeKey = (rinkId: string, date: string, role: string) => `${rinkId}|${date}|${role}`;

  // Load existing rink staff assignments
  useEffect(() => {
    authFetch(`${API_BASE}/scheduling/events/${eventId}/rink-staff`)
      .then(r => r.json())
      .then(json => {
        if (json.success && Array.isArray(json.data)) {
          const map: Record<string, string> = {};
          json.data.forEach((a: any) => {
            map[makeKey(a.rink_id, a.assignment_date, a.role)] = a.user_id;
          });
          setAssignments(map);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [eventId]);

  const handleChange = (rinkId: string, date: string, role: string, userId: string) => {
    setAssignments(prev => {
      const next = { ...prev };
      const key = makeKey(rinkId, date, role);
      if (userId) { next[key] = userId; } else { delete next[key]; }
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const arr = Object.entries(assignments)
      .filter(([_, userId]) => userId)
      .map(([key, userId]) => {
        const [rink_id, assignment_date, role] = key.split('|');
        return { rink_id, assignment_date, role: role as 'scorekeeper' | 'director' | 'ref', user_id: userId };
      });
    try {
      const res = await authFetch(`${API_BASE}/scheduling/events/${eventId}/rink-staff`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: arr, auto_populate: true }),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        await onRefresh();
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert('Error: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setSaving(false);
    }
  };

  // Quick-add scorekeeper
  const handleAddStaff = async () => {
    if (!newFirst.trim() || !newLast.trim() || !newEmail.trim()) return;
    setAddingStaff(true);
    try {
      const res = await authFetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newFirst.trim(),
          lastName: newLast.trim(),
          email: newEmail.trim().toLowerCase(),
          phone: newPhone.trim() || undefined,
          password: 'Temp1234!',  // temporary password — they'll reset on first login
          roles: ['scorekeeper'],
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        // Add to local staff list
        setLocalStaff(prev => [...prev, {
          id: json.data.id,
          first_name: json.data.firstName,
          last_name: json.data.lastName,
          email: json.data.email,
          phone: json.data.phone,
          roles: 'scorekeeper',
        }]);
        setNewFirst(''); setNewLast(''); setNewEmail(''); setNewPhone('');
        setShowAddStaff(false);
      } else {
        alert('Error: ' + (json.error || 'Failed to create scorekeeper'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setAddingStaff(false);
    }
  };

  // Computed
  const rinkIds = Array.from(new Set(games.map(g => g.rink_id).filter(Boolean))) as string[];
  const rinkMap = new Map(venueRinks.map(r => [r.id, r]));
  const sortedRinkIds = rinkIds.sort((a, b) => (rinkMap.get(a)?.name || '').localeCompare(rinkMap.get(b)?.name || ''));
  const activeDays = dayHeaders.filter(h => games.some(g => g.start_time?.startsWith(h.date)));
  const gamesWithNoRink = games.filter(g => !g.rink_id);

  // ==========================================
  // EMPTY STATE: No games at all
  // ==========================================
  if (games.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-8 text-center space-y-3">
        <div className="text-3xl">📋</div>
        <h3 className="font-bold text-[#1d1d1f]">No games scheduled yet</h3>
        <p className="text-sm text-[#6e6e73]">Generate a schedule first, then come back here to assign staff.</p>
      </div>
    );
  }

  // ==========================================
  // EMPTY STATE: Games exist but none have rinks
  // ==========================================
  if (rinkIds.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 space-y-3">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div>
              <h3 className="font-bold text-amber-900 text-sm">Games don&apos;t have rinks assigned</h3>
              <p className="text-sm text-amber-800 mt-1">
                You have {games.length} games scheduled, but none of them are assigned to a rink yet.
                Staff assignments work by rink — pick a scorekeeper for a rink and every game on that rink gets them automatically.
              </p>
              <p className="text-sm text-amber-800 mt-2 font-semibold">
                To fix this, you need to:
              </p>
              <ol className="text-sm text-amber-800 mt-1 ml-4 space-y-1 list-decimal">
                <li>Make sure your event has a <strong>venue with rinks</strong> set up (Events → Edit → Venues tab)</li>
                <li>Go to the <strong>Schedule Config</strong> panel (gear icon) and set up rink availability</li>
                <li><strong>Regenerate the schedule</strong> — the generator will assign games to rinks automatically</li>
              </ol>
              <p className="text-sm text-amber-700 mt-2">
                Or click any game in the Full Schedule view to manually assign it to a rink.
              </p>
            </div>
          </div>
        </div>

        {/* Still show the game list so they can click to edit */}
        <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden">
          <div className="bg-[#fafafa] px-6 py-3 border-b border-[#e8e8ed]">
            <h3 className="font-bold text-sm text-[#1d1d1f]">All Games (no rink assigned)</h3>
          </div>
          <div className="divide-y divide-[#e8e8ed]">
            {games.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')).slice(0, 20).map(game => {
              const div = divisions.find(d => d.id === game.event_division_id);
              return (
                <button key={game.id} onClick={() => onClickGame(game)} className="w-full text-left px-6 py-2.5 hover:bg-[#fafafa] transition flex items-center gap-3">
                  <span className="text-xs font-semibold text-[#1d1d1f] w-12">#{game.game_number}</span>
                  <span className="text-xs text-[#86868b] w-24">{fmtDatetime(game.start_time)}</span>
                  <span className="text-xs text-[#6e6e73] w-20 truncate">{div ? `${div.age_group} ${div.division_level}` : '—'}</span>
                  <span className="text-xs text-[#1d1d1f] flex-1 truncate">{game.home_team_name || 'TBD'} vs {game.away_team_name || 'TBD'}</span>
                  <span className="text-[10px] text-amber-600 font-semibold">No rink</span>
                </button>
              );
            })}
            {games.length > 20 && <div className="px-6 py-2 text-xs text-[#86868b] text-center">+ {games.length - 20} more games</div>}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // MAIN VIEW: Rinks exist, show the assignment grid
  // ==========================================
  return (
    <div className="space-y-6">
      {/* Warning if some games have no rink */}
      {gamesWithNoRink.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 flex items-center gap-2">
          <span>⚠️</span>
          <span><strong>{gamesWithNoRink.length}</strong> game{gamesWithNoRink.length !== 1 ? 's' : ''} don&apos;t have a rink assigned and won&apos;t appear in the grid below.</span>
        </div>
      )}

      {/* Scorekeeper List + Quick Add */}
      <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden">
        <div className="bg-[#fafafa] px-6 py-3 border-b border-[#e8e8ed] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-[#1d1d1f]">Available Scorekeepers</h3>
            <p className="text-[10px] text-[#86868b] mt-0.5">{scorekeepers.length} scorekeeper{scorekeepers.length !== 1 ? 's' : ''} in the system</p>
          </div>
          <button
            onClick={() => setShowAddStaff(!showAddStaff)}
            className="px-4 py-2 bg-[#003e79] text-white rounded-full text-xs font-bold hover:bg-[#002d5a] transition"
          >
            + Add Scorekeeper
          </button>
        </div>

        {/* Quick-add form */}
        {showAddStaff && (
          <div className="px-6 py-4 border-b border-[#e8e8ed] bg-[#f0f7ff]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] text-[#86868b] font-semibold mb-1">First Name *</label>
                <input type="text" value={newFirst} onChange={e => setNewFirst(e.target.value)} placeholder="Sarah" className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20" />
              </div>
              <div>
                <label className="block text-[10px] text-[#86868b] font-semibold mb-1">Last Name *</label>
                <input type="text" value={newLast} onChange={e => setNewLast(e.target.value)} placeholder="Johnson" className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20" />
              </div>
              <div>
                <label className="block text-[10px] text-[#86868b] font-semibold mb-1">Email *</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="sarah@email.com" className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20" />
              </div>
              <div>
                <label className="block text-[10px] text-[#86868b] font-semibold mb-1">Phone</label>
                <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="555-123-4567" className="w-full border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20" />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleAddStaff}
                disabled={addingStaff || !newFirst.trim() || !newLast.trim() || !newEmail.trim()}
                className="px-5 py-2 bg-[#003e79] text-white rounded-full text-xs font-bold hover:bg-[#002d5a] disabled:bg-[#86868b] transition"
              >
                {addingStaff ? 'Creating...' : 'Create Scorekeeper'}
              </button>
              <button onClick={() => setShowAddStaff(false)} className="text-xs text-[#86868b] hover:text-[#1d1d1f]">Cancel</button>
              <span className="text-[10px] text-[#86868b]">They&apos;ll get a temporary password and can reset on first login</span>
            </div>
          </div>
        )}

        {/* Current scorekeepers list */}
        {scorekeepers.length > 0 ? (
          <div className="px-6 py-3 flex flex-wrap gap-2">
            {scorekeepers.map(s => (
              <span key={s.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-full text-xs font-semibold">
                {s.first_name} {s.last_name}
              </span>
            ))}
          </div>
        ) : (
          <div className="px-6 py-4 text-sm text-[#86868b]">
            No scorekeepers yet — click <strong>+ Add Scorekeeper</strong> above to create one.
          </div>
        )}
      </div>

      {/* Assignment Grid */}
      {scorekeepers.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden">
          <div className="bg-gradient-to-r from-[#003e79] to-[#005599] px-6 py-3 flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-sm">Assign by Rink &amp; Day</h3>
              <p className="text-white/60 text-[10px] mt-0.5">Pick a scorekeeper for each rink/day — it auto-fills all games on that rink</p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`px-5 py-2 rounded-full text-sm font-bold transition ${
                saved ? 'bg-emerald-500 text-white' :
                'bg-white text-[#003e79] hover:bg-white/90 disabled:opacity-50'
              }`}
            >
              {saving ? 'Saving...' : saved ? 'Saved & Applied!' : 'Save & Apply to All Games'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#fafafa] border-b border-[#e8e8ed]">
                  <th className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-4 py-3 text-left sticky left-0 bg-[#fafafa] z-10 min-w-44">Rink</th>
                  {activeDays.map(h => {
                    const dayCount = games.filter(g => g.start_time?.startsWith(h.date) && g.rink_id).length;
                    return (
                      <th key={h.date} className="text-[#86868b] uppercase tracking-widest text-[10px] font-semibold px-3 py-3 text-center min-w-52">
                        {h.label}
                        <div className="text-[9px] font-normal text-[#aeaeb2] mt-0.5">{dayCount} games</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRinkIds.map(rinkId => {
                  const rink = rinkMap.get(rinkId);
                  const rinkTotal = games.filter(g => g.rink_id === rinkId).length;
                  return (
                    <tr key={rinkId} className="border-b border-[#e8e8ed] hover:bg-[#fafafa]/50">
                      <td className="px-4 py-3 font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10 border-r border-[#e8e8ed]">
                        <div className="text-sm">{rink?.name || 'Unknown'}</div>
                        <div className="text-[10px] text-[#86868b] font-normal">{rinkTotal} games total</div>
                      </td>
                      {activeDays.map(h => {
                        const dayRinkGames = games.filter(g => g.rink_id === rinkId && g.start_time?.startsWith(h.date));
                        const key = makeKey(rinkId, h.date, 'scorekeeper');
                        const currentUserId = assignments[key] || '';

                        if (dayRinkGames.length === 0) {
                          return <td key={h.date} className="px-3 py-3 text-center text-[#d8d8dd] text-xs">No games</td>;
                        }

                        return (
                          <td key={h.date} className="px-3 py-3">
                            <select
                              value={currentUserId}
                              onChange={e => handleChange(rinkId, h.date, 'scorekeeper', e.target.value)}
                              className={`w-full border rounded-lg px-2.5 py-2.5 text-xs outline-none transition cursor-pointer ${
                                currentUserId
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold'
                                  : 'border-[#d8d8dd] text-[#6e6e73] hover:border-[#003e79]/40 bg-white'
                              }`}
                            >
                              <option value="">— Select Scorekeeper —</option>
                              {scorekeepers.map(s => (
                                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                              ))}
                            </select>
                            <div className="text-[9px] text-[#86868b] mt-1.5 text-center">
                              {dayRinkGames.length} games · {fmtTime(dayRinkGames[0]?.start_time)} – {fmtTime(dayRinkGames[dayRinkGames.length - 1]?.end_time)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Current assignments summary */}
      {sortedRinkIds.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden">
          <div className="bg-[#fafafa] px-6 py-3 border-b border-[#e8e8ed] flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#1d1d1f]">Game-by-Game View</h3>
            <span className="text-[10px] text-[#86868b]">Click any game to edit individually</span>
          </div>

          {activeDays.map(header => {
            const dayGames = games.filter(g => g.start_time?.startsWith(header.date));
            if (dayGames.length === 0) return null;
            return (
              <div key={header.date}>
                <div className="bg-[#f0f7ff] px-6 py-2 border-b border-[#e8e8ed]">
                  <span className="text-xs font-bold text-[#003e79] uppercase tracking-widest">{header.label}</span>
                </div>
                {sortedRinkIds.map(rinkId => {
                  const rink = rinkMap.get(rinkId);
                  const rinkDayGames = dayGames.filter(g => g.rink_id === rinkId).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
                  if (rinkDayGames.length === 0) return null;
                  return (
                    <div key={rinkId} className="border-b border-[#e8e8ed]">
                      <div className="px-6 py-1.5 bg-[#fafafa] flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#003e79]">{rink?.name}</span>
                        <span className="text-[10px] text-[#86868b]">{rinkDayGames.length} games</span>
                        {rinkDayGames[0]?.scorekeeper_name && (
                          <span className="text-[10px] text-emerald-700 font-semibold ml-auto">SK: {rinkDayGames[0].scorekeeper_name}</span>
                        )}
                      </div>
                      <div className="divide-y divide-[#f0f0f0]">
                        {rinkDayGames.map(game => {
                          const div = divisions.find(d => d.id === game.event_division_id);
                          return (
                            <button key={game.id} onClick={() => onClickGame(game)} className="w-full text-left px-6 py-1.5 hover:bg-[#fafafa] transition flex items-center gap-3">
                              <span className="text-[10px] text-[#86868b] font-mono w-14 shrink-0">{fmtTime(game.start_time)}</span>
                              <span className="text-[10px] text-[#6e6e73] w-20 shrink-0 truncate">{div ? `${div.age_group} ${div.division_level}` : '—'}</span>
                              <span className="text-[11px] text-[#1d1d1f] truncate flex-1">{game.home_team_name || 'TBD'} vs {game.away_team_name || 'TBD'}</span>
                              <span className="text-[10px] w-24 shrink-0 truncate text-right">{game.scorekeeper_name ? <span className="text-emerald-700 font-semibold">{game.scorekeeper_name}</span> : <span className="text-[#d8d8dd]">No SK</span>}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// BRACKET DAY VIEW
// Shows bracket games with seeding labels
// ==========================================
function BracketDayView({
  games,
  divisions,
  venueRinks,
  dayHeaders,
  onClickGame,
}: {
  games: Game[];
  divisions: Division[];
  venueRinks: VenueRink[];
  dayHeaders: { date: string; label: string }[];
  onClickGame: (game: Game) => void;
}) {
  const divisionMap = new Map(divisions.map(d => [d.id, d]));
  const rinkMap = new Map(venueRinks.map(r => [r.id, r]));

  // Filter to bracket games only
  const bracketGames = games.filter(g => g.game_type !== 'pool');

  if (bracketGames.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8e8ed] p-6 text-center">
        <p className="text-[#6e6e73]">No bracket games yet. Bracket games are generated after pool play.</p>
      </div>
    );
  }

  // Group by division
  const divisionIds = Array.from(new Set(bracketGames.map(g => g.event_division_id)));

  // Game type ordering
  const typeOrder = ['quarterfinal', 'semifinal', 'placement', 'consolation', 'championship'];

  return (
    <div className="space-y-6">
      {divisionIds.map(divId => {
        const div = divisionMap.get(divId);
        const divBracketGames = bracketGames
          .filter(g => g.event_division_id === divId)
          .sort((a, b) => {
            const orderDiff = typeOrder.indexOf(a.game_type) - typeOrder.indexOf(b.game_type);
            if (orderDiff !== 0) return orderDiff;
            return (a.start_time || '').localeCompare(b.start_time || '');
          });

        return (
          <div key={divId} className="bg-white rounded-2xl border border-[#e8e8ed] overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 flex items-center justify-between">
              <h3 className="text-white font-bold text-sm">{div ? `${div.age_group} — ${div.division_level}` : 'Unknown Division'}</h3>
              <span className="text-white/70 text-xs font-semibold">{divBracketGames.length} bracket games</span>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {divBracketGames.map(game => {
                const rink = game.rink_id ? rinkMap.get(game.rink_id) : null;
                // For bracket games, show seeding label from notes if teams not yet assigned
                const homeLabel = game.home_team_name || (game.notes?.split(' vs ')[0]) || 'TBD';
                const awayLabel = game.away_team_name || (game.notes?.split(' vs ')[1]) || 'TBD';
                const isFinal = game.status === 'final';

                return (
                  <button
                    key={game.id}
                    onClick={() => onClickGame(game)}
                    className="border border-[#e8e8ed] rounded-xl overflow-hidden text-left hover:border-[#003e79]/30 hover:shadow-md transition group w-full"
                  >
                    {/* Game type banner */}
                    <div className={`px-4 py-1.5 ${gameTypeBadge[game.game_type] || 'bg-[#fafafa] text-[#6e6e73]'}`}>
                      <span className="text-[10px] font-bold uppercase tracking-widest">
                        {gameTypeLabels[game.game_type] || game.game_type}
                      </span>
                      <span className="text-[10px] opacity-70 ml-2">Game #{game.game_number}</span>
                    </div>

                    <div className="p-4 space-y-2">
                      {/* Matchup */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className={`text-sm font-semibold ${isFinal && (game.home_score ?? 0) > (game.away_score ?? 0) ? 'text-emerald-700' : 'text-[#1d1d1f]'}`}>
                            {homeLabel}
                            {isFinal && <span className="ml-2 font-bold text-[#003e79]">{game.home_score}</span>}
                          </div>
                          <div className="text-[10px] text-[#86868b] mt-0.5">vs</div>
                          <div className={`text-sm font-semibold ${isFinal && (game.away_score ?? 0) > (game.home_score ?? 0) ? 'text-emerald-700' : 'text-[#1d1d1f]'}`}>
                            {awayLabel}
                            {isFinal && <span className="ml-2 font-bold text-[#003e79]">{game.away_score}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Time & Location */}
                      <div className="flex items-center gap-3 text-[11px] text-[#86868b]">
                        {game.start_time && <span>{fmtDatetime(game.start_time)}</span>}
                        {rink && <span>{rink.name}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function AdminSchedulePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [activeSeason, setActiveSeason] = useState<string>('');
  const [eventTimeFilter, setEventTimeFilter] = useState<'upcoming' | 'current' | 'past'>('upcoming');
  const [eventSearch, setEventSearch] = useState('');
  const [eventPage, setEventPage] = useState(0);
  const EVENTS_PER_PAGE = 9;
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [venueRinks, setVenueRinks] = useState<VenueRink[]>([]);
  const [allVenues, setAllVenues] = useState<{ id: string; name: string; city: string; state: string; rink_count: number }[]>([]);
  const [venuesLoaded, setVenuesLoaded] = useState(false);

  const [view, setView] = useState<'full' | 'division' | 'matrix' | 'venue' | 'staff' | 'bracket'>('full');
  const [workspaceTab, setWorkspaceTab] = useState<'schedule' | 'divisions' | 'config' | 'rules' | 'assignment'>('schedule');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<string | null>(null); // null = show all

  // Modals
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [showAddGame, setShowAddGame] = useState(false);
  const [showReplaceTeam, setShowReplaceTeam] = useState(false);

  // Staff list (for assignment dropdowns)
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [scheduleRulesSummary, setScheduleRulesSummary] = useState<any[]>([]);
  const [showRulesEditor, setShowRulesEditor] = useState(false);
  const [showDivisions, setShowDivisions] = useState(false);
  const [editableRules, setEditableRules] = useState<{ruleType: string; ruleValue: string; priority: number}[]>([]);
  const [savingScheduleRules, setSavingScheduleRules] = useState(false);
  const [scheduleRulesSaveStatus, setScheduleRulesSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [scheduleTeamRatings, setScheduleTeamRatings] = useState<any[]>([]);

  // Config
  const [showConfig, setShowConfig] = useState(false);
  const [betweenGames, setBetweenGames] = useState(10);
  const [firstGameTime, setFirstGameTime] = useState('12:00');
  const [lastGameTime, setLastGameTime] = useState('21:00');

  // Which rinks are active for this event
  const [activeRinks, setActiveRinks] = useState<Set<string>>(new Set());

  // Per-division game duration: { [divisionId]: minutes }
  const [divisionDurations, setDivisionDurations] = useState<Record<string, number>>({});
  const [generatingDivision, setGeneratingDivision] = useState<string | null>(null);
  const [showEmptyDivisions, setShowEmptyDivisions] = useState(false);

  // Per-rink availability: { [rinkId]: { firstGame, lastGame, blocked: [{start, end}] } }
  const [rinkAvailability, setRinkAvailability] = useState<Record<string, { firstGame: string; lastGame: string; blocked: { start: string; end: string }[] }>>({});

  // Config save state
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveStatus, setConfigSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Age-group-to-rink mapping: { [ageGroup]: rinkId[] }
  const [ageGroupRinks, setAgeGroupRinks] = useState<Record<string, string[]>>({});

  // Schedule progress summary across all events
  const [eventSummary, setEventSummary] = useState<Record<string, { games: number; teams: number; divisions: number }>>({});

  // Schedule publish state
  const [schedulePublished, setSchedulePublished] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Reload games helper (also refreshes event summary for card badges)
  const reloadGames = useCallback(async () => {
    if (!selectedEvent) return;
    const [gameJson, sumJson] = await Promise.all([
      authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/games`).then(r => r.json()),
      authFetch(`${API_BASE}/scheduling/events/schedule-summary`).then(r => r.json()),
    ]);
    if (gameJson.success && Array.isArray(gameJson.data)) setGames(gameJson.data);
    if (sumJson.success && sumJson.data) setEventSummary(sumJson.data);
  }, [selectedEvent]);

  // Load events + schedule summaries
  useEffect(() => {
    Promise.all([
      authFetch(`${API_BASE}/events?per_page=100`).then(r => r.json()),
      authFetch(`${API_BASE}/scheduling/events/schedule-summary`).then(r => r.json()),
    ]).then(([evJson, sumJson]) => {
      if (evJson.success && Array.isArray(evJson.data)) {
        setEvents(evJson.data);
        const seasons = Array.from(new Set(evJson.data.map((e: Event) => e.season || 'Unknown'))).sort().reverse();
        if (seasons.length > 0 && !activeSeason) setActiveSeason(seasons[0] as string);
      }
      if (sumJson.success && sumJson.data) setEventSummary(sumJson.data);
      setLoading(false);
    }).catch(() => setLoading(false));
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
      authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/rules`).then(r => r.json()),
      authFetch(`${API_BASE}/scheduling/staff`).then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([eventJson, regJson, gameJson, rinkJson, rulesJson, staffJson]) => {
      if (eventJson.success && eventJson.data?.divisions) setDivisions(eventJson.data.divisions);
      if (eventJson.success && eventJson.data) setSchedulePublished(eventJson.data.schedule_published === 1);
      if (regJson.success && Array.isArray(regJson.data)) setRegistrations(regJson.data);
      if (gameJson.success && Array.isArray(gameJson.data)) setGames(gameJson.data);
      if (rinkJson.data && Array.isArray(rinkJson.data)) setVenueRinks(rinkJson.data);
      if (staffJson.data && Array.isArray(staffJson.data)) setStaffList(staffJson.data);

      // Store full rules list for summary display + editable copy
      if (rulesJson.success && Array.isArray(rulesJson.data)) {
        setScheduleRulesSummary(rulesJson.data);
        setEditableRules(rulesJson.data.map((r: any) => ({ ruleType: r.rule_type, ruleValue: r.rule_value, priority: r.priority })));
      }

      // Restore saved rules into state
      if (rulesJson.success && Array.isArray(rulesJson.data)) {
        const rules = rulesJson.data as any[];
        // Global config
        const rest = rules.find(r => r.rule_type === 'min_rest_minutes');
        if (rest) setBetweenGames(parseInt(rest.rule_value) || 0);
        const fgt = rules.find(r => r.rule_type === 'first_game_time');
        if (fgt) setFirstGameTime(fgt.rule_value);
        const lgt = rules.find(r => r.rule_type === 'last_game_time');
        if (lgt) setLastGameTime(lgt.rule_value);

        // Per-rink availability
        const rinkAvail: Record<string, { firstGame: string; lastGame: string; blocked: { start: string; end: string }[] }> = {};
        for (const r of rules) {
          if (r.rule_type === 'rink_first_game') {
            try { const d = JSON.parse(r.rule_value); if (!rinkAvail[d.rinkId]) rinkAvail[d.rinkId] = { firstGame: '08:00', lastGame: '21:00', blocked: [] }; rinkAvail[d.rinkId].firstGame = d.time; } catch (_) {}
          }
          if (r.rule_type === 'rink_last_game') {
            try { const d = JSON.parse(r.rule_value); if (!rinkAvail[d.rinkId]) rinkAvail[d.rinkId] = { firstGame: '08:00', lastGame: '21:00', blocked: [] }; rinkAvail[d.rinkId].lastGame = d.time; } catch (_) {}
          }
          if (r.rule_type === 'rink_blocked_times') {
            try { const d = JSON.parse(r.rule_value); if (!rinkAvail[d.rinkId]) rinkAvail[d.rinkId] = { firstGame: '08:00', lastGame: '21:00', blocked: [] }; rinkAvail[d.rinkId].blocked = d.blocked; } catch (_) {}
          }
        }
        setRinkAvailability(rinkAvail);

        // Active rinks: restore from rule, fallback to rinks that have availability set
        const activeRinksRule = rules.find(r => r.rule_type === 'active_rinks');
        if (activeRinksRule) {
          try { const ids = JSON.parse(activeRinksRule.rule_value); setActiveRinks(new Set(ids)); } catch (_) {}
        } else if (Object.keys(rinkAvail).length > 0) {
          setActiveRinks(new Set(Object.keys(rinkAvail)));
        } else if (rinkJson.data && Array.isArray(rinkJson.data)) {
          // Default: all rinks active
          setActiveRinks(new Set(rinkJson.data.map((r: any) => r.id)));
        }

        // Per-division game durations
        const durMap: Record<string, number> = {};
        for (const r of rules) {
          if (r.rule_type === 'division_game_duration') {
            try { const d = JSON.parse(r.rule_value); if (d.divisionId && d.minutes) durMap[d.divisionId] = d.minutes; } catch (_) {}
          }
        }
        setDivisionDurations(durMap);

        // Age-group-to-rink mapping
        const agMap: Record<string, string[]> = {};
        for (const r of rules) {
          if (r.rule_type === 'age_group_rinks') {
            try { const d = JSON.parse(r.rule_value); if (d.ageGroup && Array.isArray(d.rinkIds)) agMap[d.ageGroup] = d.rinkIds; } catch (_) {}
          }
        }
        setAgeGroupRinks(agMap);
      }
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

  // Save rules to API (shared by generate all and generate single)
  const saveRules = async () => {
    if (!selectedEvent) return;
    const rules = [
      { ruleType: 'game_duration_minutes', ruleValue: '60', priority: 10 },
      { ruleType: 'min_rest_minutes', ruleValue: String(betweenGames), priority: 10 },
      { ruleType: 'first_game_time', ruleValue: firstGameTime, priority: 10 },
      { ruleType: 'last_game_time', ruleValue: lastGameTime, priority: 10 },
      { ruleType: 'active_rinks', ruleValue: JSON.stringify(Array.from(activeRinks)), priority: 10 },
    ];
    // Per-division game duration rules
    for (const [divId, minutes] of Object.entries(divisionDurations)) {
      rules.push({ ruleType: 'division_game_duration', ruleValue: JSON.stringify({ divisionId: divId, minutes }), priority: 10 });
    }
    // Age-group-to-rink mapping rules
    for (const [ageGroup, rinkIds] of Object.entries(ageGroupRinks)) {
      if (rinkIds.length > 0) {
        rules.push({ ruleType: 'age_group_rinks', ruleValue: JSON.stringify({ ageGroup, rinkIds }), priority: 10 });
      }
    }
    // Per-rink availability rules
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
  };

  const handleGenerateSchedule = async (divisionId?: string) => {
    if (!selectedEvent) return;
    const relevantRegs = divisionId
      ? registrations.filter(r => r.event_division_id === divisionId && r.status === 'approved')
      : registrations.filter(r => r.status === 'approved');
    if (relevantRegs.length === 0) {
      alert('No approved registrations yet — add teams to divisions first.');
      return;
    }
    const divName = divisionId ? divisions.find(d => d.id === divisionId) : null;
    const label = divName ? `${divName.age_group} — ${divName.division_level}` : 'all divisions';
    if (!confirm(`Generate schedule for ${label}? This will replace existing games for ${label}.`)) return;

    if (divisionId) {
      setGeneratingDivision(divisionId);
    } else {
      setGenerating(true);
    }
    try {
      await saveRules();
      const res = await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(divisionId ? { division_id: divisionId } : {}),
      });
      const json = await res.json();
      if (json.success) {
        await reloadGames();
        // Show overflow warning if any games were placed on non-preferred rinks
        if (json.data?.overflowGames > 0) {
          alert(`Schedule generated! ${json.data.overflowGames} game(s) were placed on non-preferred rinks because the preferred rinks were full. Look for the yellow "OVERFLOW" badges in the game list.`);
        }
      } else {
        alert('Error: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setGenerating(false);
      setGeneratingDivision(null);
    }
  };

  const handleClearSchedule = async () => {
    if (!selectedEvent) return;
    if (!confirm('Clear all games? This cannot be undone.')) return;
    await authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/games`, { method: 'DELETE' });
    setGames([]);
  };

  const handleTogglePublish = async () => {
    if (!selectedEvent) return;
    const action = schedulePublished ? 'unpublish' : 'publish';
    if (!confirm(`Are you sure you want to ${action} the schedule for ${selectedEvent.name}? ${schedulePublished ? 'It will be hidden from the public.' : 'It will be visible to everyone.'}`)) return;
    setPublishing(true);
    try {
      const res = await authFetch(`${API_BASE}/events/${selectedEvent.id}/publish-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publish: !schedulePublished }),
      });
      const json = await res.json();
      if (json.success) {
        setSchedulePublished(!schedulePublished);
      } else {
        alert('Failed: ' + (json.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error: ' + String(err));
    } finally {
      setPublishing(false);
    }
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

  // Initialize per-division durations from period_length_minutes * num_periods
  useEffect(() => {
    if (divisions.length > 0) {
      setDivisionDurations(prev => {
        const next = { ...prev };
        for (const div of divisions) {
          if (!next[div.id]) {
            // Default: period_length * num_periods (e.g. 12min * 3 = 36min game)
            next[div.id] = (div.period_length_minutes || 15) * (div.num_periods || 3);
          }
        }
        return next;
      });
    }
  }, [divisions]);

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

  // Event picker computed
  const seasons = Array.from(new Set(events.map(e => e.season || 'Unknown'))).sort().reverse();
  const currentSeason = activeSeason || seasons[0] || '';
  const today = new Date().toISOString().split('T')[0];
  const seasonEvents = events.filter(e => (e.season || 'Unknown') === currentSeason);
  const upcomingEvents = seasonEvents.filter(e => e.start_date > today).sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  const currentEvents = seasonEvents.filter(e => e.start_date <= today && e.end_date >= today).sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  const pastEvents = seasonEvents.filter(e => e.end_date < today).sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
  const timeFilteredEvents = eventTimeFilter === 'upcoming' ? upcomingEvents : eventTimeFilter === 'current' ? currentEvents : pastEvents;
  const searchFiltered = eventSearch ? timeFilteredEvents.filter(e => e.name.toLowerCase().includes(eventSearch.toLowerCase()) || e.city.toLowerCase().includes(eventSearch.toLowerCase())) : timeFilteredEvents;
  const totalPages = Math.ceil(searchFiltered.length / EVENTS_PER_PAGE);
  const pagedEvents = searchFiltered.slice(eventPage * EVENTS_PER_PAGE, (eventPage + 1) * EVENTS_PER_PAGE);

  // =============================================
  // RENDER: EVENT WORKSPACE (event selected)
  // =============================================
  if (selectedEvent) {
    return (
      <div className="bg-[#fafafa] min-h-full flex flex-col">
        {/* Top bar */}
        <div className="bg-white border-b border-[#e8e8ed] px-4 py-3 flex items-center gap-4 shrink-0">
          <button onClick={() => setSelectedEvent(null)} className="flex items-center gap-1.5 text-[#6e6e73] hover:text-[#1d1d1f] transition text-sm font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Events
          </button>
          <div className="w-px h-6 bg-[#e8e8ed]" />
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-[#1d1d1f] truncate">{selectedEvent.name}</h1>
            <p className="text-xs text-[#86868b]">{selectedEvent.city}, {selectedEvent.state} · {fmtDateFull(selectedEvent.start_date)} — {fmtDateFull(selectedEvent.end_date)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {schedulePublished && <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />PUBLISHED</span>}
            <span className="px-2.5 py-1 bg-[#f0f7ff] text-[#003e79] rounded-full text-[10px] font-bold">{approvedTeams} teams</span>
            <span className="px-2.5 py-1 bg-[#f5f5f7] text-[#3d3d3d] rounded-full text-[10px] font-bold">{games.length} games</span>
          </div>
        </div>

        {/* Workspace Tabs */}
        <div className="bg-white border-b border-[#e8e8ed] px-6">
          <div className="flex gap-1">
            {([
              { key: 'schedule' as const, label: 'Schedule' },
              { key: 'divisions' as const, label: 'Divisions' },
              { key: 'config' as const, label: 'Config' },
              { key: 'rules' as const, label: 'Rules' },
              { key: 'assignment' as const, label: 'Division Assignment' },
            ]).map(tab => (
              <button key={tab.key} onClick={() => {
                setWorkspaceTab(tab.key);
                if (tab.key === 'rules' && scheduleTeamRatings.length === 0 && selectedEvent) {
                  authFetch(`${API_BASE}/scheduling/events/${selectedEvent.id}/team-ratings`).then(r => r.json()).then(json => {
                    if (json.success) setScheduleTeamRatings(json.data || []);
                  }).catch(() => {});
                }
                if (tab.key === 'config' && !venuesLoaded) {
                  authFetch(`${API_BASE}/venues`).then(r => r.json()).then(json => {
                    if (json.success && Array.isArray(json.data)) setAllVenues(json.data);
                    setVenuesLoaded(true);
                  }).catch(() => setVenuesLoaded(true));
                }
              }}
                className={`px-4 py-3 text-sm font-semibold transition border-b-2 ${
                  workspaceTab === tab.key
                    ? 'border-[#003e79] text-[#003e79]'
                    : 'border-transparent text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── MAIN CONTENT AREA ── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── DIVISIONS TAB ── */}
          {workspaceTab === 'divisions' && (
            <div className="max-w-3xl space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold text-[#1d1d1f]">Divisions ({divisions.length})</h2>
                  <p className="text-sm text-[#86868b]">Filter by division and generate schedules per division</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-[#e8e8ed] divide-y divide-[#e8e8ed]">
                <button onClick={() => setSelectedDivision(null)} className={`w-full text-left px-4 py-3 text-sm font-semibold transition ${!selectedDivision ? 'bg-[#f0f7ff] text-[#003e79]' : 'text-[#3d3d3d] hover:bg-[#fafafa]'}`}>
                  All Divisions
                </button>
                {divisions.filter(d => registrations.filter(r => r.event_division_id === d.id && r.status === 'approved').length > 0 || showEmptyDivisions).map(div => {
                  const count = registrations.filter(r => r.event_division_id === div.id && r.status === 'approved').length;
                  const divGames = games.filter(g => g.event_division_id === div.id);
                  const isActive = selectedDivision === div.id;
                  const duration = divisionDurations[div.id] || (div.period_length_minutes || 15) * (div.num_periods || 3);
                  const isGeneratingThis = generatingDivision === div.id;
                  return (
                    <div key={div.id} className={`px-4 py-3 flex items-center justify-between transition ${isActive ? 'bg-[#f0f7ff]' : 'hover:bg-[#fafafa]'}`}>
                      <button onClick={() => setSelectedDivision(isActive ? null : div.id)} className="text-left flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${isActive ? 'text-[#003e79]' : count === 0 ? 'text-[#86868b]' : 'text-[#1d1d1f]'}`}>{div.age_group} — {div.division_level}</div>
                        <div className="text-xs text-[#86868b]">{count} teams · {divGames.length} games · {duration}min game time</div>
                      </button>
                      {count >= 2 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleGenerateSchedule(div.id); }}
                          disabled={isGeneratingThis}
                          className="ml-3 px-3 py-1.5 bg-[#003e79] text-white rounded-lg text-xs font-semibold hover:bg-[#002d5a] disabled:bg-[#c8c8cd] transition shrink-0"
                        >
                          {isGeneratingThis ? '...' : divGames.length > 0 ? 'Regenerate' : 'Generate'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {divisions.filter(d => registrations.filter(r => r.event_division_id === d.id && r.status === 'approved').length === 0).length > 0 && !showEmptyDivisions && (
                <button onClick={() => setShowEmptyDivisions(true)} className="text-sm text-[#86868b] hover:text-[#003e79] transition">
                  Show empty divisions
                </button>
              )}
            </div>
          )}

          {/* ── CONFIG TAB ── */}
          {workspaceTab === 'config' && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h2 className="text-lg font-bold text-[#1d1d1f]">Schedule Config</h2>
                <p className="text-sm text-[#86868b]">Active rinks, gap time, and per-rink availability windows</p>
              </div>

              {/* Venue Selection */}
              <div className="bg-white rounded-xl border border-[#e8e8ed] p-5">
                <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">Venue</h3>
                <div className="flex items-center gap-3">
                  <select
                    value={(() => {
                      if (venueRinks.length > 0 && selectedEvent?.venue_id) return selectedEvent.venue_id;
                      return '';
                    })()}
                    onChange={async (e) => {
                      const venueId = e.target.value;
                      if (!venueId || !selectedEvent) {
                        setVenueRinks([]);
                        setActiveRinks(new Set());
                        return;
                      }
                      try {
                        await authFetch(`${API_BASE}/events/admin/event-venues/${selectedEvent.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ venue_ids: [venueId], primary_venue_id: venueId }),
                        });
                        if (selectedEvent) selectedEvent.venue_id = venueId;
                        const rinkJson = await authFetch(`${API_BASE}/venues/${venueId}/rinks`).then(r => r.json());
                        if (rinkJson.data && Array.isArray(rinkJson.data)) {
                          setVenueRinks(rinkJson.data);
                          setActiveRinks(new Set(rinkJson.data.map((r: VenueRink) => r.id)));
                          const newAvail: Record<string, { firstGame: string; lastGame: string; blocked: { start: string; end: string }[] }> = {};
                          rinkJson.data.forEach((r: VenueRink) => {
                            newAvail[r.id] = { firstGame: firstGameTime, lastGame: lastGameTime, blocked: [] };
                          });
                          setRinkAvailability(newAvail);
                        }
                      } catch (err) { console.error('Failed to assign venue:', err); }
                    }}
                    className="flex-1 border border-[#e8e8ed] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20 bg-white"
                  >
                    <option value="">Select a venue...</option>
                    {(venuesLoaded ? allVenues : []).map(v => (
                      <option key={v.id} value={v.id}>{v.name} — {v.city}, {v.state} ({v.rink_count} rink{v.rink_count !== 1 ? 's' : ''})</option>
                    ))}
                  </select>
                  {!venuesLoaded && <span className="text-xs text-[#86868b]">Loading venues...</span>}
                </div>
              </div>

              {/* Active Rinks */}
              {venueRinks.length > 0 && (
                <div className="bg-white rounded-xl border border-[#e8e8ed] p-5">
                  <h3 className="text-sm font-semibold text-[#1d1d1f] mb-1">Active Rinks</h3>
                  <p className="text-xs text-[#86868b] mb-3">Toggle which rinks are available for scheduling. {activeRinks.size} of {venueRinks.length} active.</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {venueRinks.map(rink => {
                      const isOn = activeRinks.has(rink.id);
                      return (
                        <button key={rink.id} onClick={() => setActiveRinks(prev => { const next = new Set(prev); if (next.has(rink.id)) next.delete(rink.id); else next.add(rink.id); return next; })}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition border ${isOn ? 'border-[#003e79] bg-[#f0f7ff] text-[#003e79] font-semibold' : 'border-[#e8e8ed] text-[#6e6e73] hover:bg-[#fafafa]'}`}>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition ${isOn ? 'border-[#003e79] bg-[#003e79]' : 'border-[#c8c8cd]'}`}>
                            {isOn && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          {rink.name}
                          {rink.surface_size && <span className="text-xs text-[#86868b] ml-auto">{rink.surface_size}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Gap between games */}
              <div className="bg-white rounded-xl border border-[#e8e8ed] p-5">
                <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">Gap Between Games</h3>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={60} value={betweenGames} onChange={e => setBetweenGames(parseInt(e.target.value) || 0)}
                    className="w-20 border border-[#e8e8ed] rounded-lg px-3 py-2 text-sm text-center outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/30" />
                  <span className="text-sm text-[#86868b]">minutes</span>
                </div>
              </div>

              {/* Per-rink times */}
              {venueRinks.filter(r => activeRinks.has(r.id)).length > 0 && (
                <div className="bg-white rounded-xl border border-[#e8e8ed] p-5">
                  <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3">Per-Rink Time Windows</h3>
                  <div className="space-y-3">
                    {venueRinks.filter(r => activeRinks.has(r.id)).map(rink => {
                      const avail = rinkAvailability[rink.id] || { firstGame: firstGameTime, lastGame: lastGameTime, blocked: [] };
                      return (
                        <div key={rink.id} className="flex items-center gap-4 bg-[#fafafa] rounded-lg p-3">
                          <span className="text-sm font-semibold text-[#1d1d1f] w-32">{rink.name}</span>
                          <div className="flex items-center gap-2">
                            <input type="time" value={avail.firstGame} onChange={e => setRinkAvailability(prev => ({ ...prev, [rink.id]: { ...avail, firstGame: e.target.value } }))}
                              className="border border-[#e8e8ed] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20" />
                            <span className="text-sm text-[#86868b]">to</span>
                            <input type="time" value={avail.lastGame} onChange={e => setRinkAvailability(prev => ({ ...prev, [rink.id]: { ...avail, lastGame: e.target.value } }))}
                              className="border border-[#e8e8ed] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Save Config Button */}
              {venueRinks.length > 0 && (
                <button onClick={async () => {
                  if (!selectedEvent) return;
                  setSavingConfig(true);
                  try {
                    await saveRules();
                    setConfigSaveStatus('saved');
                    setTimeout(() => setConfigSaveStatus('idle'), 2000);
                  } catch { setConfigSaveStatus('error'); }
                  setSavingConfig(false);
                }} disabled={savingConfig}
                  className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition ${configSaveStatus === 'saved' ? 'bg-emerald-100 text-emerald-700' : configSaveStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-[#003e79] text-white hover:bg-[#002d5a]'}`}>
                  {savingConfig ? 'Saving...' : configSaveStatus === 'saved' ? 'Saved!' : configSaveStatus === 'error' ? 'Error — Try Again' : 'Save Config'}
                </button>
              )}
            </div>
          )}

          {/* ── RULES TAB ── */}
          {workspaceTab === 'rules' && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h2 className="text-lg font-bold text-[#1d1d1f]">Schedule Rules</h2>
                <p className="text-sm text-[#86868b]">MHR matchup limits and team time restrictions</p>
              </div>

              {/* MHR */}
              <div className="bg-white rounded-xl border border-[#e8e8ed] p-5">
                <h3 className="text-sm font-semibold text-purple-700 mb-3">MHR Matchup Limit</h3>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-[#3d3d3d]">Max spread:</span>
                  <input type="number" value={(() => { const r = editableRules.find(r => r.ruleType === 'mhr_matchup_limit'); return r ? JSON.parse(r.ruleValue).max_spread : ''; })()} onChange={e => {
                    const val = e.target.value;
                    setEditableRules(prev => {
                      const filtered = prev.filter(r => r.ruleType !== 'mhr_matchup_limit');
                      if (val && parseInt(val) > 0) filtered.push({ ruleType: 'mhr_matchup_limit', ruleValue: JSON.stringify({ max_spread: parseInt(val) }), priority: 10 });
                      return filtered;
                    });
                  }} placeholder="30" className="w-20 px-3 py-2 border border-[#e8e8ed] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#003e79]/20" />
                </div>
              </div>

              {/* Team Time Restrictions */}
              <div className="bg-white rounded-xl border border-[#e8e8ed] p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-amber-700">Team Time Restrictions</h3>
                  <button onClick={() => setEditableRules(prev => [...prev, { ruleType: 'team_time_restriction', ruleValue: JSON.stringify({ team_id: '', restriction: 'earliest_start', day: '', time: '' }), priority: 5 }])}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition">+ Add Restriction</button>
                </div>
                {editableRules.filter(r => r.ruleType === 'team_time_restriction').length === 0 && (
                  <p className="text-sm text-[#86868b]">No team time restrictions yet. Click &ldquo;+ Add Restriction&rdquo; to add one.</p>
                )}
                <div className="space-y-2">
                  {editableRules.filter(r => r.ruleType === 'team_time_restriction').map((rule, idx) => {
                    const realIdx = editableRules.indexOf(rule);
                    const data = JSON.parse(rule.ruleValue);
                    return (
                      <div key={realIdx} className="flex gap-2 items-center bg-[#fafafa] rounded-lg p-2.5">
                        <select value={data.team_id} onChange={e => { const u = { ...data, team_id: e.target.value }; setEditableRules(prev => prev.map((r, i) => i === realIdx ? { ...r, ruleValue: JSON.stringify(u) } : r)); }}
                          className="flex-1 px-2.5 py-1.5 border border-[#e8e8ed] rounded-lg text-sm outline-none min-w-0">
                          <option value="">Select team...</option>
                          {scheduleTeamRatings.map((t: any) => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
                        </select>
                        <select value={data.restriction} onChange={e => { const u = { ...data, restriction: e.target.value }; setEditableRules(prev => prev.map((r, i) => i === realIdx ? { ...r, ruleValue: JSON.stringify(u) } : r)); }}
                          className="px-2.5 py-1.5 border border-[#e8e8ed] rounded-lg text-sm outline-none">
                          <option value="earliest_start">Earliest Start</option>
                          <option value="latest_end">Latest End</option>
                        </select>
                        <input type="time" value={data.time} onChange={e => { const u = { ...data, time: e.target.value }; setEditableRules(prev => prev.map((r, i) => i === realIdx ? { ...r, ruleValue: JSON.stringify(u) } : r)); }}
                          className="px-2.5 py-1.5 border border-[#e8e8ed] rounded-lg text-sm outline-none" />
                        <button onClick={() => setEditableRules(prev => prev.filter((_, i) => i !== realIdx))} className="text-[#86868b] hover:text-red-500 text-lg px-1">×</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Save button */}
              <button onClick={async () => {
                setSavingScheduleRules(true);
                try {
                  await authFetch(`${API_BASE}/scheduling/events/${selectedEvent!.id}/rules`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: editableRules }) });
                  const ratingsToSave = scheduleTeamRatings.filter((t: any) => t.mhr_rating !== null).map((t: any) => ({ registration_id: t.registration_id, mhr_rating: t.mhr_rating }));
                  if (ratingsToSave.length > 0) {
                    await authFetch(`${API_BASE}/scheduling/events/${selectedEvent!.id}/team-ratings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ratings: ratingsToSave }) });
                  }
                  setScheduleRulesSaveStatus('saved');
                  setTimeout(() => setScheduleRulesSaveStatus('idle'), 2000);
                } catch { setScheduleRulesSaveStatus('error'); }
                setSavingScheduleRules(false);
              }} disabled={savingScheduleRules}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition ${scheduleRulesSaveStatus === 'saved' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#003e79] text-white hover:bg-[#002d5a]'}`}>
                {savingScheduleRules ? 'Saving...' : scheduleRulesSaveStatus === 'saved' ? 'Saved!' : 'Save Rules'}
              </button>
            </div>
          )}

          {/* ── DIVISION ASSIGNMENT TAB ── */}
          {workspaceTab === 'assignment' && (
            <div>
              <DivisionAssignment
                eventId={selectedEvent.id}
                divisions={divisions}
                registrations={registrations}
                selectedDivisionId={selectedDivision}
                onRefresh={async () => {
                  const [eventJson, regJson] = await Promise.all([
                    authFetch(`${API_BASE}/events/${selectedEvent.slug}`).then(r => r.json()),
                    authFetch(`${API_BASE}/registrations/event/${selectedEvent.id}`).then(r => r.json()),
                  ]);
                  if (eventJson.success && eventJson.data?.divisions) setDivisions(eventJson.data.divisions);
                  if (regJson.success && Array.isArray(regJson.data)) setRegistrations(regJson.data);
                }}
              />
            </div>
          )}

          {/* ── SCHEDULE TAB ── */}
          {workspaceTab === 'schedule' && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-[#1d1d1f]">Schedule</h2>
                  {selectedDivision && (
                    <span className="px-2.5 py-1 bg-[#f0f7ff] text-[#003e79] rounded-full text-xs font-semibold">
                      {divisions.find(d => d.id === selectedDivision)?.age_group} — {divisions.find(d => d.id === selectedDivision)?.division_level}
                      <button onClick={() => setSelectedDivision(null)} className="ml-1.5 text-[#86868b] hover:text-red-500">×</button>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {games.length > 0 && (
                    <button onClick={() => setShowReplaceTeam(true)} className="px-3 py-1.5 border border-amber-500 text-amber-600 hover:bg-amber-50 rounded-full text-xs font-semibold transition">Replace Team</button>
                  )}
                  {games.length > 0 && (
                    <button onClick={() => setShowAddGame(true)} className="px-3 py-1.5 border border-[#003e79] text-[#003e79] hover:bg-[#f0f7ff] rounded-full text-xs font-semibold transition">+ Add Game</button>
                  )}
                  <button
                    onClick={() => handleGenerateSchedule(selectedDivision || undefined)}
                    disabled={generating || (selectedDivision ? registrations.filter(r => r.event_division_id === selectedDivision && r.status === 'approved').length === 0 : approvedTeams === 0)}
                    className="px-3 py-1.5 bg-[#003e79] text-white hover:bg-[#002d5a] disabled:bg-[#86868b] rounded-full text-xs font-semibold transition"
                  >
                    {generating ? 'Generating...' : (() => {
                      if (selectedDivision) {
                        const divGames = games.filter(g => g.event_division_id === selectedDivision);
                        const div = divisions.find(d => d.id === selectedDivision);
                        const label = div ? `${div.age_group} ${div.division_level}` : 'Division';
                        return divGames.length > 0 ? `Regen ${label}` : `Generate ${label}`;
                      }
                      return games.length > 0 ? 'Regenerate All' : 'Generate All';
                    })()}
                  </button>
                  {games.length > 0 && (
                    <button onClick={handleClearSchedule} className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-full text-xs font-semibold transition">Clear</button>
                  )}
                  {games.length > 0 && (
                    <button onClick={handleTogglePublish} disabled={publishing}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${schedulePublished ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'} disabled:opacity-50`}>
                      {schedulePublished && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
                      {publishing ? '...' : schedulePublished ? 'Unpublish' : 'Publish'}
                    </button>
                  )}
                </div>
              </div>

              {/* Stats bar */}
              {games.length > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total Games', value: games.length },
                    { label: 'Pool Games', value: poolGameCount },
                    { label: 'Bracket Games', value: bracketGameCount },
                    { label: 'Teams', value: approvedTeams },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-xl border border-[#e8e8ed] p-3 text-center">
                      <div className="text-xl font-extrabold text-[#003e79]">{s.value}</div>
                      <div className="text-xs text-[#86868b] font-semibold">{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Schedule content */}
              {approvedTeams === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  No approved registrations yet — add teams to divisions first.
                </div>
              ) : games.length === 0 ? (
                <div className="bg-[#f0f7ff] border border-[#003e79]/20 rounded-lg p-4 text-sm text-[#003e79]">
                  No schedule yet. Click &ldquo;Generate&rdquo; to auto-create all games, then click any game to edit it.
                </div>
              ) : (
                <>
                  {/* View Toggle */}
                  <div className="flex flex-wrap gap-1 bg-[#e8e8ed] rounded-xl p-1 w-fit">
                    {([
                      { key: 'full' as const, label: 'Full Schedule' },
                      { key: 'venue' as const, label: 'By Venue' },
                      { key: 'division' as const, label: 'By Division' },
                      { key: 'matrix' as const, label: 'Matrix' },
                      { key: 'staff' as const, label: 'Staff' },
                      { key: 'bracket' as const, label: 'Bracket Day' },
                    ]).map(v => (
                      <button key={v.key} onClick={() => setView(v.key)}
                        className={`px-5 py-2 rounded-lg text-sm font-semibold transition ${view === v.key ? 'bg-white text-[#1d1d1f] shadow' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
                        {v.label}
                      </button>
                    ))}
                  </div>

                  {view === 'full' && <GameListView games={filteredGames} divisions={divisions} onClickGame={setEditingGame} ageGroupRinks={ageGroupRinks} venueRinks={venueRinks} onSaveGame={handleSaveGame} onSwapGames={handleSwapGames} />}
                  {view === 'division' && (
                    <div className="space-y-8">
                      {filteredDivisions.map(div => {
                        const divGames = games.filter(g => g.event_division_id === div.id).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
                        if (divGames.length === 0 && !showEmptyDivisions) return null;
                        return (
                          <div key={div.id}>
                            <h3 className="text-sm font-bold text-[#1d1d1f] mb-2">{div.age_group} — {div.division_level} <span className="text-[#86868b] font-normal">({divGames.length} games)</span></h3>
                            <GameListView games={divGames} divisions={[div]} onClickGame={setEditingGame} ageGroupRinks={ageGroupRinks} venueRinks={venueRinks} onSaveGame={handleSaveGame} onSwapGames={handleSwapGames} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {view === 'matrix' && (
                    <div className="space-y-8">
                      {filteredDivisions.map(div => (
                        <div key={div.id}>
                          <h3 className="text-sm font-bold text-[#1d1d1f] mb-2">{div.age_group} — {div.division_level}</h3>
                          <ScheduleMatrix division={div} registrations={registrations} games={games} dayHeaders={dayHeaders} onClickGame={setEditingGame} venueRinks={venueRinks} onSaveGame={handleSaveGame} />
                        </div>
                      ))}
                    </div>
                  )}
                  {view === 'venue' && <VenueScheduleView games={filteredGames} divisions={divisions} venueRinks={venueRinks} dayHeaders={dayHeaders} onClickGame={setEditingGame} onSaveGame={handleSaveGame} onSwapGames={handleSwapGames} />}
                  {view === 'staff' && <StaffAssignmentsView eventId={selectedEvent.id} games={filteredGames} divisions={divisions} venueRinks={venueRinks} dayHeaders={dayHeaders} staffList={staffList} onClickGame={setEditingGame} onRefresh={reloadGames} />}
                  {view === 'bracket' && <BracketDayView games={filteredGames} divisions={divisions} venueRinks={venueRinks} dayHeaders={dayHeaders} onClickGame={setEditingGame} />}
                </>
              )}
            </div>
          )}
        </div>

        {/* Modals */}
        {editingGame && <EditGameModal game={editingGame} allTeams={registrations} rinks={venueRinks} divisions={divisions} allGames={games} staffList={staffList} onSave={handleSaveGame} onDelete={handleDeleteGame} onSwap={handleSwapGames} onClose={() => setEditingGame(null)} />}
        {showAddGame && <AddGameModal event={selectedEvent} divisions={divisions} allTeams={registrations} rinks={venueRinks} onAdd={handleAddGame} onClose={() => setShowAddGame(false)} />}
        {showReplaceTeam && <ReplaceTeamModal event={selectedEvent} games={games} registrations={registrations} divisions={divisions} onComplete={async () => { await reloadGames(); setShowReplaceTeam(false); }} onClose={() => setShowReplaceTeam(false)} />}
      </div>
    );
  }

  // =============================================
  // RENDER: EVENT PICKER (no event selected)
  // =============================================
  return (
    <div className="bg-[#fafafa] min-h-full">
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold text-[#1d1d1f]">Schedule Builder</h1>
          <div className="flex gap-1 bg-[#f5f5f7] rounded-xl p-1">
            {seasons.map(s => (
              <button key={s} onClick={() => { setActiveSeason(s); setEventTimeFilter('upcoming'); setEventPage(0); }}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${currentSeason === s ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Search + Time filter row */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86868b]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={eventSearch} onChange={e => { setEventSearch(e.target.value); setEventPage(0); }} placeholder="Search events by name or city..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#e8e8ed] rounded-xl text-sm text-[#1d1d1f] placeholder-[#86868b] outline-none focus:ring-2 focus:ring-[#003e79]/20 focus:border-[#003e79]/30" />
            {eventSearch && (
              <button onClick={() => setEventSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] hover:text-[#1d1d1f]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            {([
              { key: 'upcoming' as const, label: 'Upcoming', count: upcomingEvents.length },
              { key: 'current' as const, label: 'Current', count: currentEvents.length },
              { key: 'past' as const, label: 'Past', count: pastEvents.length },
            ]).map(tf => (
              <button key={tf.key} onClick={() => { setEventTimeFilter(tf.key); setEventPage(0); }}
                className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition flex items-center gap-1.5 ${
                  eventTimeFilter === tf.key
                    ? tf.key === 'current' ? 'bg-emerald-100 text-emerald-800' : tf.key === 'past' ? 'bg-[#e8e8ed] text-[#3d3d3d]' : 'bg-[#003e79] text-white'
                    : 'text-[#6e6e73] hover:bg-[#f5f5f7]'
                }`}>
                {tf.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  eventTimeFilter === tf.key
                    ? tf.key === 'current' ? 'bg-emerald-200 text-emerald-900' : tf.key === 'past' ? 'bg-[#d8d8dd] text-[#3d3d3d]' : 'bg-[#0052a3] text-white'
                    : 'bg-[#e8e8ed] text-[#6e6e73]'
                }`}>{tf.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Event Cards Grid */}
        {pagedEvents.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedEvents.map(ev => {
                const isPast = ev.end_date < today;
                const isActive = ev.start_date <= today && ev.end_date >= today;
                const summary = eventSummary[ev.id];
                const hasGames = summary && summary.games > 0;
                const hasTeams = summary && summary.teams > 0;
                return (
                  <button key={ev.id} onClick={() => { setSelectedEvent(ev); window.scrollTo(0, 0); }}
                    className={`text-left bg-white border rounded-xl p-5 transition cursor-pointer hover:shadow-md hover:border-[#003e79]/30 ${isPast ? 'opacity-70' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-tight text-[#1d1d1f]">{ev.name}</h3>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isActive && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />LIVE</span>}
                        {ev.schedule_published === 1 && !isActive && <span className="px-2 py-0.5 bg-[#f0f7ff] text-[#003e79] rounded-full text-[10px] font-bold">PUBLISHED</span>}
                        {hasGames && ev.schedule_published !== 1 && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold">IN PROGRESS</span>}
                      </div>
                    </div>
                    <p className="text-xs text-[#86868b] mt-1.5">{ev.city}, {ev.state}</p>
                    <p className="text-xs text-[#6e6e73] mt-0.5">{fmtDateFull(ev.start_date)} — {fmtDateFull(ev.end_date)}</p>
                    {summary && (hasGames || hasTeams) && (
                      <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-[#e8e8ed]">
                        {hasTeams && <span className="text-[10px] text-[#6e6e73]"><span className="font-bold text-[#1d1d1f]">{summary.teams}</span> teams</span>}
                        {hasGames && <span className="text-[10px] text-[#6e6e73]"><span className="font-bold text-[#1d1d1f]">{summary.games}</span> games</span>}
                        {summary.divisions > 0 && <span className="text-[10px] text-[#6e6e73]"><span className="font-bold text-[#1d1d1f]">{summary.divisions}</span> divs</span>}
                        {hasTeams && (
                          <div className="flex-1 h-1 bg-[#e8e8ed] rounded-full overflow-hidden ml-auto max-w-[60px]">
                            <div className={`h-full rounded-full ${ev.schedule_published === 1 ? 'bg-emerald-500' : hasGames ? 'bg-amber-500' : 'bg-[#c8c8cd]'}`}
                              style={{ width: hasGames ? (ev.schedule_published === 1 ? '100%' : '66%') : '33%' }} />
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button onClick={() => setEventPage(p => Math.max(0, p - 1))} disabled={eventPage === 0}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-[#e8e8ed] text-[#3d3d3d] hover:bg-[#f5f5f7] disabled:opacity-40 disabled:hover:bg-white transition">Prev</button>
                <span className="text-sm text-[#6e6e73]">Page {eventPage + 1} of {totalPages}</span>
                <button onClick={() => setEventPage(p => Math.min(totalPages - 1, p + 1))} disabled={eventPage >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-[#e8e8ed] text-[#3d3d3d] hover:bg-[#f5f5f7] disabled:opacity-40 disabled:hover:bg-white transition">Next</button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 text-sm text-[#86868b]">
            {eventSearch ? `No events matching "${eventSearch}"` : `No ${eventTimeFilter} events in ${currentSeason}`}
          </div>
        )}
      </div>
    </div>
  );
}
