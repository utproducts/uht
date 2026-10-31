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

export default function PenaltiesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  const byCat: Record<string, any[]> = {};
  for (const r of rows) (byCat[r.category] = byCat[r.category] || []).push(r);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-[#1d1d1f]">Penalty Catalog</h1>
      <p className="text-sm text-[#6e6e73] mt-1 mb-6">
        Check the box for any penalty that should count as a <b>misconduct</b>. Flagged penalties are
        marked MISCONDUCT on every scoresheet, and penalties of 10+ minutes always count regardless.
      </p>
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
                <span className="text-sm font-semibold text-[#1d1d1f] flex-1">{r.name}</span>
                <span className="text-xs text-[#86868b] w-14">{r.minutes}:00</span>
                {!!r.is_misconduct && (
                  <span className="text-[10px] font-black tracking-wider text-purple-700 bg-purple-50 border border-purple-200 rounded-full px-2 py-0.5">MISCONDUCT</span>
                )}
              </label>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
