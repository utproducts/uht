'use client';

/*
  ADMIN: PENALTY CATALOG - every penalty the scoring console offers, with a
  per-penalty Misconduct checkbox. Flagged penalties are marked MISCONDUCT
  on scoresheets (and 10+ minute penalties always count as misconduct).
*/

import { useEffect, useState } from 'react';

const API = 'https://uht.chad-157.workers.dev/api';

function hdrs(extra?: Record<string, string>): Record<string, string> {
  return {
    'X-Dev-Bypass': 'true',
    ...(typeof window !== 'undefined' && localStorage.getItem('uht_token') ? { Authorization: `Bearer ${localStorage.getItem('uht_token')}` } : {}),
    ...extra,
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  minor: 'Minors (2:00)',
  double: 'Double Minors (4:00)',
  major: 'Majors (5:00)',
  misconduct: 'Misconducts (10:00)',
  game_misconduct: 'Game Misconducts',
  match: 'Match Penalties',
};
const CATEGORY_ORDER = ['minor', 'double', 'major', 'misconduct', 'game_misconduct', 'match'];

const LENGTH_CHOICES: Array<[string, number]> = [['1:30 (Minor)', 1.5], ['2:00 (Minor)', 2], ['3:00 (Double Minor)', 3], ['4:00 (Double Minor)', 4], ['5:00 (Major)', 5], ['6:00 (Major)', 6], ['10:00 (Misconduct)', 10]];
const fmtLen = (m: any) => { const s = Math.round((Number(m) || 0) * 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export default function PenaltiesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLen, setNewLen] = useState('2');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const load = async () => {
    try {
      const res = await fetch(`${API}/scoring/penalty-catalog`, { headers: hdrs() });
      const j = await res.json();
      if (j.success) setRows(j.data || []);
    } catch {}
    setLoaded(true);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (row: any) => {
    setBusy(row.code);
    const next = !row.is_misconduct;
    setRows(prev => prev.map(r => r.code === row.code ? { ...r, is_misconduct: next ? 1 : 0 } : r));
    try {
      const res = await fetch(`${API}/scoring/penalty-catalog/${row.code}`, {
        method: 'PUT', headers: hdrs({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ isMisconduct: next }),
      });
      const j = await res.json();
      if (!j.success) { setRows(prev => prev.map(r => r.code === row.code ? { ...r, is_misconduct: row.is_misconduct } : r)); }
    } catch {
      setRows(prev => prev.map(r => r.code === row.code ? { ...r, is_misconduct: row.is_misconduct } : r));
    }
    setBusy(null);
  };

  const addPenalty = async () => {
    const name = newName.trim();
    if (name.length < 2 || adding) return;
    setAdding(true); setAddError('');
    try {
      const res = await fetch(`${API}/scoring/penalty-catalog`, {
        method: 'POST', headers: hdrs({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, minutes: parseFloat(newLen) }),
      });
      const j = await res.json();
      if (j.success) { setNewName(''); await load(); }
      else setAddError(j.error || 'Could not add penalty');
    } catch { setAddError('Could not add penalty'); }
    setAdding(false);
  };

  const removePenalty = async (row: any) => {
    if (!row.code.startsWith('CUSTOM_')) return;
    if (!window.confirm(`Remove "${row.name}" from the catalog? Scorekeepers will no longer see it.`)) return;
    setBusy(row.code);
    try {
      const res = await fetch(`${API}/scoring/penalty-catalog/${row.code}`, { method: 'DELETE', headers: hdrs() });
      const j = await res.json();
      if (j.success) await load();
    } catch {}
    setBusy(null);
  };

  const byCat: Record<string, any[]> = {};
  for (const r of rows) (byCat[r.category] = byCat[r.category] || []).push(r);

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <h1 className="text-2xl font-bold text-[#1d1d1f]">Penalty Catalog</h1>
      <p className="text-sm text-[#6e6e73] mt-1 mb-6">
        Check the box for any penalty that should count as a <b>misconduct</b>. Flagged penalties are
        marked MISCONDUCT on every scoresheet, and penalties of 10+ minutes always count regardless.
      </p>

      <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] p-5 mb-6">
        <p className="text-sm font-bold text-[#1d1d1f] mb-3">Add a penalty</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={newName}
            onChange={e => { setNewName(e.target.value); setAddError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') addPenalty(); }}
            placeholder="Penalty name (e.g. Illegal Equipment)"
            className="flex-1 px-4 py-2.5 rounded-xl border border-[#d2d2d7] text-sm outline-none focus:border-[#003e79]"
          />
          <select value={newLen} onChange={e => setNewLen(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-[#d2d2d7] text-sm bg-white outline-none focus:border-[#003e79]">
            {LENGTH_CHOICES.map(([label, val]) => <option key={val} value={String(val)}>{label}</option>)}
          </select>
          <button onClick={addPenalty} disabled={adding || newName.trim().length < 2}
            className="px-6 py-2.5 rounded-xl bg-[#003e79] text-white text-sm font-bold disabled:opacity-40 hover:bg-[#002d5a]">
            {adding ? 'Adding…' : 'Add Penalty'}
          </button>
        </div>
        <p className="text-xs text-[#86868b] mt-2">
          Shows in the scoring console the next time a scorekeeper opens it - no app update needed. The
          length here is just the pre-highlighted default; scorekeepers still pick the assessed length on every penalty.
        </p>
        {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
      </div>
      {!loaded ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#003e79]" /></div>
      ) : (
        CATEGORY_ORDER.filter(c => byCat[c]?.length).map(cat => (
          <div key={cat} className="bg-white rounded-2xl shadow-sm border border-[#e8e8ed] overflow-hidden mb-5">
            <div className="px-5 py-3 bg-[#f5f5f7] flex items-center justify-between">
              <p className="text-sm font-bold text-[#1d1d1f]">{CATEGORY_LABELS[cat] || cat}</p>
              <p className="text-xs text-[#86868b]">{byCat[cat].length} penalties</p>
            </div>
            {byCat[cat].map((r, i) => (
              <label key={r.code}
                className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-[#fafafa] ${i > 0 ? 'border-t border-[#f0f0f2]' : ''}`}>
                <input
                  type="checkbox"
                  checked={!!r.is_misconduct}
                  disabled={busy === r.code}
                  onChange={() => toggle(r)}
                  className="w-4.5 h-4.5 accent-[#003e79]"
                  style={{ width: 18, height: 18 }}
                />
                <span className="text-sm font-semibold text-[#1d1d1f] flex-1">{r.name}
                  {r.code.startsWith('CUSTOM_') && <span className="ml-2 text-[10px] font-black tracking-wider text-cyan-700 bg-cyan-50 border border-cyan-200 rounded-full px-2 py-0.5">CUSTOM</span>}
                </span>
                <span className="text-xs text-[#86868b] w-14">{fmtLen(r.minutes)}</span>
                {!!r.is_misconduct && (
                  <span className="text-[10px] font-black tracking-wider text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">MISCONDUCT</span>
                )}
                {r.code.startsWith('CUSTOM_') && (
                  <button type="button" disabled={busy === r.code}
                    onClick={(e) => { e.preventDefault(); removePenalty(r); }}
                    className="text-xs font-bold text-red-500 hover:text-red-700 px-2">Remove</button>
                )}
              </label>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
